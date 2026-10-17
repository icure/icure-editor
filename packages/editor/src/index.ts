// @icure/editor: a paginated, template-aware document editor for React.

// The data provider (interfaces the host implements).
export type {
  EditorDataProvider,
  FieldDescriptor,
  ImageProvider,
  ItemFieldDescriptor,
  ItemValue,
  ItemValues,
  MaybePromise,
  PickedImage,
  RepeatData,
  RepeatSourceDescriptor,
  ResolvedImage,
  TemplateContent,
  TemplateSummary,
  UnresolvedEntry,
  UnresolvedKind,
  UnresolvedReason,
} from './context.ts'

// The document model.
export type { Node as EditorNode } from 'prosemirror-model'
export { ALIGNMENTS, cellSides, DEFAULT_BORDERS, editorSchema, FONT_SIZES, FONTS, safeAlignment, safeBorders, safeColour, safeFont, safeIdentifier, safeLayout, safeSize, TABLE_LAYOUTS, type TableLayout, type Alignment, type EditorSchema } from './schema.ts'
export { EMPTY_DOCUMENT, fieldKey, imageKey, InvalidDocumentError, isEditorDocument, repeatKey, templateKey, toEditorDocument } from './document.ts'

// Resolution and rendering.
export type { RepeatShape } from './repeat.ts'
export { createResolver, DEFAULT_MAX_TEMPLATE_DEPTH, EMPTY_RESOLUTION, MAX_REPEAT_NESTING, resolveDocument, sameResolution, toItemContext, type ItemContext, type Resolution, type ResolvedRepeat, type ResolvedTemplate, type Resolver, type ResolveOptions } from './resolve.ts'
export { embedProblem, expression, renderBlocks, renderDocument, renderRepeatParts, templateOf, type RenderOptions, type RepeatParts } from './render.ts'

// Commands (for hosts building their own toolbar).
export {
  alignmentOf,
  BLOCK_STYLES,
  blockStyleOf,
  insertField,
  insertImage,
  insertRepeat,
  insertTable,
  insertTemplate,
  isMarkActive,
  LIST_LEAD,
  repeatContent,
  selectedImage,
  selectedKey,
  setAlignment,
  setBlockStyle,
  setStyleMark,
  toggleEm,
  toggleStrong,
  toggleUnderline,
  updateSelectedImage,
  type BlockStyle,
  type ImageAttrs,
} from './commands.ts'
// Editing blocks in place (row zones of a block's table, for hosts building their own toolbar).
export { bodyTableRow, editingTarget, setRowZone } from './editing.ts'
export { A4_PAGE, PAGINATION_META, paginationPlugin, reflow, type PageFormat } from './pagination.ts'

// Images.
export {
  blobToDataUri,
  checkImageFile,
  clampImageWidth,
  DEFAULT_MAX_IMAGE_BYTES,
  IMAGE_TYPES,
  MAX_ALT_LENGTH,
  MAX_IMAGE_WIDTH,
  MIN_IMAGE_WIDTH,
  safeAltText,
  safeImageId,
  safeImageSrc,
  type ImageFileError,
  type ImageFileRules,
  type ImageType,
} from './images.ts'

// Labels.
export { DEFAULT_LABELS, mergeLabels, type EditorLabels, type InlineEditingLabels, type PartialLabels, type ShownAlignment, type TableAction } from './labels.ts'

// Output.
export { createSerializer, htmlDocumentCss, toHtml, toHtmlDocument, toHtmlFragment, type HtmlDocumentOptions, type HtmlOptions, type SerializerOptions } from './output/html.ts'
export { PAGE_BREAK, toMarkdown, type MarkdownOptions } from './output/markdown.ts'
export { DEFAULT_MARGIN_MM, mm, PAGE_SIZES, pdfPageOf, toPdfContent, type PageSize, type PdfAlignment, type PdfBlock, type PdfContent, type PdfContentOptions, type PdfPageSize, type TextRun } from './output/pdfContent.ts'
export { DEFAULT_PDF_FONT, preparePdfmake, renderPdf, toPdfDefinition, type DocDefinition, type PdfDefinitionOptions, type PdfFonts, type PdfmakeInstance } from './output/pdf.ts'
export { documentFileName, downloadBytes, fileDay, HTML_TYPE, PDF_TYPE, printPdf, safeFileSegment, withPdfImages } from './output/browser.ts'

// React components.
export { DocumentEditor, type DocumentEditorHandle, type DocumentEditorProps } from './react/DocumentEditor.tsx'
export { Toolbar, type ToolbarProps } from './react/Toolbar.tsx'
export { Menu, type MenuItem } from './react/Menu.tsx'
export { UnresolvedChip, type UnresolvedChipProps } from './react/UnresolvedChip.tsx'
export { ImagePanel, type ImagePanelProps } from './react/ImagePanel.tsx'
