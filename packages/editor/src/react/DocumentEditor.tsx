// The editor window: a paginated ProseMirror canvas with styles, fonts, sizes, colours, alignment,
// tables, fields, repeating blocks, embedded templates and images. References are resolved through
// the host's data provider and drawn as text (never evaluated); the raw expression shows on hover,
// under the toolbar when a reference is tapped, and in place with "Show expressions". The document
// lives in memory only: the host decides what to persist (onEdit).
import { baseKeymap } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import type { Node as ProseNode } from 'prosemirror-model'
import { EditorState, NodeSelection, type Command } from 'prosemirror-state'
import { addColumnAfter, addRowAfter, deleteColumn, deleteRow, goToNextCell, tableEditing } from 'prosemirror-tables'
import { EditorView } from 'prosemirror-view'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react'

import { insertImage, selectedImage, selectedKey, toggleEm, toggleStrong, toggleUnderline, updateSelectedImage } from '../commands.ts'
import type { EditorDataProvider, FieldDescriptor, PickedImage, RepeatSourceDescriptor, TemplateSummary } from '../context.ts'
import { toEditorDocument } from '../document.ts'
import { checkImageFile, DEFAULT_MAX_IMAGE_BYTES, IMAGE_TYPES, type ImageFileError, type ImageType } from '../images.ts'
import { mergeLabels, type PartialLabels } from '../labels.ts'
import { PAGINATION_META, paginationPlugin, reflow } from '../pagination.ts'
import { expression } from '../render.ts'
import { createResolver, DEFAULT_MAX_TEMPLATE_DEPTH, EMPTY_RESOLUTION, sameResolution, type Resolution } from '../resolve.ts'
import { ImagePanel } from './ImagePanel.tsx'
import { nodeViews } from './nodeViews.ts'
import { Toolbar } from './Toolbar.tsx'
import { UnresolvedChip } from './UnresolvedChip.tsx'

export interface PageFormat {
  readonly widthMm: number
  readonly heightMm: number
  readonly marginMm: number
}
export const A4_PAGE: PageFormat = { widthMm: 210, heightMm: 297, marginMm: 20 }

export interface DocumentEditorHandle {
  readonly view: EditorView | null
  getDocument(): ProseNode | null
  getResolution(): Resolution
  // Forgets the provider's cached answers and resolves again (the host's data changed).
  refresh(): void
  focus(): void
}

export interface DocumentEditorProps {
  // ProseMirror JSON of the editor schema, or a node. Read once per mount (key the editor to reopen).
  readonly initial: unknown
  readonly provider: EditorDataProvider
  readonly readOnly?: boolean
  readonly labels?: PartialLabels
  readonly page?: PageFormat
  // The id of the template being edited, so that it can't embed itself.
  readonly documentId?: string
  readonly maxTemplateDepth?: number
  readonly images?: { readonly maxBytes?: number; readonly types?: readonly ImageType[] }
  readonly showUnresolved?: boolean
  // Every change, the pagination's included.
  readonly onChange?: (doc: ProseNode) => void
  // The user's own edits only (what a draft saves), not the pagination's reflows.
  readonly onEdit?: (doc: ProseNode) => void
  readonly onResolution?: (resolution: Resolution) => void
  readonly toolbarExtras?: ReactNode
  readonly className?: string
  readonly ref?: Ref<DocumentEditorHandle>
}

// The delay after the last edit before the document's references are resolved again.
const RESOLVE_DELAY_MS = 120
const KEYMAP: Record<string, Command> = { 'Mod-b': toggleStrong, 'Mod-i': toggleEm, 'Mod-u': toggleUnderline, 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo, Tab: goToNextCell(1), 'Shift-Tab': goToNextCell(-1) }
const TABLE_COMMANDS = { addRow: addRowAfter, addColumn: addColumnAfter, deleteRow, deleteColumn }

function createState(doc: ProseNode): EditorState {
  return EditorState.create({ doc, plugins: [history(), keymap(KEYMAP), keymap(baseKeymap), tableEditing(), paginationPlugin()] })
}

// The provider's offers (fields, blocks, templates), loaded once per provider.
function useOffers(provider: EditorDataProvider, documentId: string | undefined) {
  const [fields, setFields] = useState<readonly FieldDescriptor[]>([])
  const [repeatSources, setRepeatSources] = useState<readonly RepeatSourceDescriptor[]>([])
  const [templates, setTemplates] = useState<readonly TemplateSummary[]>([])
  useEffect(() => {
    let alive = true
    const load = <T,>(get: (() => T | Promise<T>) | undefined, set: (value: T) => void) => {
      if (!get) return
      Promise.resolve()
        .then(get)
        .then((value) => alive && set(value), () => undefined)
    }
    load(provider.listFields?.bind(provider), (v) => setFields(v ?? []))
    load(provider.listRepeatSources?.bind(provider), (v) => setRepeatSources(v ?? []))
    load(provider.listTemplates?.bind(provider), (v) => setTemplates((v ?? []).filter((t) => t.id !== documentId)))
    return () => {
      alive = false
    }
  }, [provider, documentId])
  return { fields, repeatSources, templates }
}

function useResolution(provider: EditorDataProvider, options: { rootId: string | null; maxDepth: number; maxImageBytes: number }, onResolution?: (r: Resolution) => void) {
  const { rootId, maxDepth, maxImageBytes } = options
  const resolver = useMemo(() => createResolver(provider, { rootId, maxDepth, maxImageBytes }), [provider, rootId, maxDepth, maxImageBytes])
  const [resolution, setResolution] = useState<Resolution>(() => ({ ...EMPTY_RESOLUTION, rootId, maxDepth }))
  const ticket = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(resolution)
  const onResolutionRef = useRef(onResolution)
  useEffect(() => {
    onResolutionRef.current = onResolution
  }, [onResolution])

  const resolveNow = useCallback(
    (doc: ProseNode) => {
      const mine = ++ticket.current
      void resolver.resolve(doc).then((next) => {
        if (mine !== ticket.current) return
        if (!sameResolution(latest.current, next)) {
          latest.current = next
          setResolution(next)
        }
        onResolutionRef.current?.(latest.current)
      })
    },
    [resolver],
  )
  const schedule = useCallback(
    (doc: ProseNode) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => resolveNow(doc), RESOLVE_DELAY_MS)
    },
    [resolveNow],
  )
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  return { resolution, latest, resolver, resolveNow, schedule }
}

export function DocumentEditor(props: DocumentEditorProps) {
  const { initial, provider, readOnly = false, page = A4_PAGE, documentId, maxTemplateDepth = DEFAULT_MAX_TEMPLATE_DEPTH, showUnresolved = true, toolbarExtras, className, ref } = props
  const labels = useMemo(() => mergeLabels(props.labels), [props.labels])
  const imageRules = useMemo(() => ({ maxBytes: props.images?.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES, types: props.images?.types ?? IMAGE_TYPES }), [props.images?.maxBytes, props.images?.types])
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const altInput = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<EditorState | null>(null)
  const [showExpressions, setShowExpressions] = useState(false)
  const [imageMessage, setImageMessage] = useState<string | null>(null)
  const [focusAlt, setFocusAlt] = useState(false)
  // Bumped when a view is created, so its changing props are set on it too.
  const [viewVersion, setViewVersion] = useState(0)
  const callbacks = useRef({ onChange: props.onChange, onEdit: props.onEdit })
  useEffect(() => {
    callbacks.current = { onChange: props.onChange, onEdit: props.onEdit }
  }, [props.onChange, props.onEdit])

  const offers = useOffers(provider, documentId)
  const { resolution, latest, resolver, resolveNow, schedule } = useResolution(provider, { rootId: documentId ?? null, maxDepth: maxTemplateDepth, maxImageBytes: imageRules.maxBytes }, props.onResolution)
  const scheduleRef = useRef(schedule)
  useEffect(() => {
    scheduleRef.current = schedule
  }, [schedule])

  // The parse error, if the initial content doesn't fit the schema (shown, never half-parsed).
  const [parsed] = useState((): ProseNode | Error => {
    try {
      return toEditorDocument(initial)
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error))
    }
  })

  useEffect(() => {
    if (!host.current || parsed instanceof Error) return undefined
    const view = new EditorView(host.current, {
      state: createState(parsed),
      dispatchTransaction: (tr) => {
        const next = view.state.apply(tr)
        view.updateState(next)
        setState(next)
        if (!tr.docChanged) return
        callbacks.current.onChange?.(next.doc)
        if (!tr.getMeta(PAGINATION_META)) {
          callbacks.current.onEdit?.(next.doc)
          scheduleRef.current(next.doc)
        }
      },
    })
    viewRef.current = view
    setState(view.state)
    setViewVersion((version) => version + 1)
    return () => {
      viewRef.current = null
      view.destroy()
    }
  }, [parsed])

  // A new provider (or view) resolves the current document at once.
  useEffect(() => {
    const view = viewRef.current
    if (view) resolveNow(view.state.doc)
  }, [resolveNow, viewVersion])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.setProps({
      nodeViews: nodeViews({ resolution, showExpressions, labels }),
      editable: () => !readOnly,
      attributes: { 'aria-label': labels.canvas, 'aria-multiline': 'true', role: 'textbox', 'aria-readonly': String(readOnly), class: 'ie-canvas' },
    })
    // Values change the pages' heights.
    queueMicrotask(() => !view.isDestroyed && reflow(view))
  }, [resolution, showExpressions, labels, readOnly, viewVersion])

  useImperativeHandle(
    ref,
    () => ({
      get view() {
        return viewRef.current
      },
      getDocument: () => viewRef.current?.state.doc ?? null,
      getResolution: () => latest.current,
      refresh: () => {
        resolver.clear()
        const view = viewRef.current
        if (view) resolveNow(view.state.doc)
      },
      focus: () => viewRef.current?.focus(),
    }),
    [latest, resolver, resolveNow],
  )

  const run = useCallback((command: Command, focus = true) => {
    const view = viewRef.current
    if (!view) return
    command(view.state, view.dispatch)
    if (focus) view.focus()
  }, [])

  // The inserted image is selected and its description field focused (alt text is asked at once).
  const placeImage = useCallback(
    (picked: PickedImage) => {
      const view = viewRef.current
      if (!view) return
      insertImage({ imageId: picked.id, alt: picked.alt ?? '', width: picked.width ?? null })(view.state, view.dispatch)
      const pos = view.state.selection.from - 1
      if (pos >= 0 && view.state.doc.nodeAt(pos)?.type.name === 'image') view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)))
      setFocusAlt(true)
    },
    [],
  )

  useEffect(() => {
    if (focusAlt && altInput.current) {
      altInput.current.focus()
      setFocusAlt(false)
    }
  }, [focusAlt, state])

  const imageProvider = provider.images
  const onInsertImage = useMemo(() => {
    if (!imageProvider || (!imageProvider.pick && !imageProvider.upload)) return null
    return () => {
      setImageMessage(null)
      if (imageProvider.pick) {
        void Promise.resolve(imageProvider.pick()).then((picked) => picked && placeImage(picked), () => setImageMessage(labels.image.errors.upload))
      } else fileInput.current?.click()
    }
  }, [imageProvider, placeImage, labels])

  const onFile = async (file: File | undefined) => {
    if (!file || !imageProvider?.upload) return
    const problem: ImageFileError | null = await checkImageFile(file, imageRules)
    if (problem) return setImageMessage(labels.image.errors[problem])
    setImageMessage(labels.image.uploading)
    try {
      placeImage(await imageProvider.upload(file))
      setImageMessage(null)
    } catch {
      setImageMessage(labels.image.errors.upload)
    }
  }

  const selected = state ? selectedKey(state) : null
  const image = state && !readOnly ? selectedImage(state) : null
  const pageStyle = { '--ie-page-width': `${page.widthMm}mm`, '--ie-page-aspect': `${page.widthMm} / ${page.heightMm}`, '--ie-page-margin': `${page.marginMm}mm` } as CSSProperties

  if (parsed instanceof Error) {
    return (
      <div className={['ie-editor', className].filter(Boolean).join(' ')} role="alert">
        {parsed.message}
      </div>
    )
  }

  return (
    <div className={['ie-editor', className].filter(Boolean).join(' ')} style={pageStyle}>
      {!readOnly && state && (
        <Toolbar state={state} run={run} labels={labels} fields={offers.fields} repeatSources={offers.repeatSources} templates={offers.templates} onInsertImage={onInsertImage} tableCommands={TABLE_COMMANDS} undo={undo} redo={redo}>
          {toolbarExtras}
        </Toolbar>
      )}
      {!readOnly && imageProvider?.upload && !imageProvider.pick && (
        <input
          ref={fileInput}
          type="file"
          hidden
          accept={imageRules.types.join(',')}
          aria-label={labels.image.chooseFile}
          onChange={(e) => {
            void onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      )}
      <div className="ie-status">
        {/* Also on a read-only document: checking what each reference says is reading, not editing. */}
        <label className="ie-switch">
          <input type="checkbox" checked={showExpressions} onChange={(e) => setShowExpressions(e.target.checked)} />
          <span>{labels.showExpressions}</span>
        </label>
        {showUnresolved && <UnresolvedChip entries={resolution.unresolved} labels={labels.unresolved} />}
      </div>
      <p className="ie-expression" aria-live="polite">
        {selected ? labels.selectedExpression(expression(selected)) : ''}
      </p>
      <div aria-live="polite" className="ie-message">
        {imageMessage}
      </div>
      {image && <ImagePanel node={image.node} labels={labels.image} altRef={altInput} onChange={(attrs) => run(updateSelectedImage(attrs), false)} />}
      <div className="ie-sheets" data-show-expressions={showExpressions || undefined}>
        <div ref={host} />
      </div>
    </div>
  )
}
