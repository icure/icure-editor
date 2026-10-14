import { describe, expect, it } from 'vitest'

import { DEFAULT_LABELS, mergeLabels } from '../src/labels.ts'

describe('labels', () => {
  it('fills what the host leaves out with the English defaults, nested groups included', () => {
    const labels = mergeLabels({ bold: 'Gras', align: { left: 'À gauche' }, image: { alt: 'Description' }, unresolved: { reasons: { cycle: 'boucle' } } as never })
    expect(labels.bold).toBe('Gras')
    expect(labels.italic).toBe(DEFAULT_LABELS.italic)
    expect(labels.align).toEqual({ ...DEFAULT_LABELS.align, left: 'À gauche' })
    expect(labels.image.alt).toBe('Description')
    expect(labels.image.errors).toEqual(DEFAULT_LABELS.image.errors)
    expect(labels.unresolved.reasons).toEqual({ ...DEFAULT_LABELS.unresolved.reasons, cycle: 'boucle' })
    expect(labels.unresolved.chip(2)).toBe('2 unresolved references')
  })

  it('merges the inline-editing labels one level deep, functions included', () => {
    const labels = mergeLabels({ inlineEditing: { done: 'Terminé', editRepeat: (s) => `Bloc : ${s}` }, rowZone: { header: 'En-tête' } })
    expect(labels.inlineEditing.done).toBe('Terminé')
    expect(labels.inlineEditing.editRepeat('Sessions')).toBe('Bloc : Sessions')
    expect(labels.inlineEditing.cancel).toBe(DEFAULT_LABELS.inlineEditing.cancel)
    expect(labels.rowZone).toEqual({ ...DEFAULT_LABELS.rowZone, header: 'En-tête' })
  })
})
