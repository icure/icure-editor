// A medical imaging examination slip (an imaging centre): appointment bars under the title, the
// patient's and the referring physician's data framed side by side, the RX / US / CT / IRM matrix by
// body region next to the left / right osteo-articular table, the indications box, the risks.
import { BOX, blank, bold, cell, colour, doc, field, frame, image, line, p, pAligned, row, size, small, layoutTable, table, text, type Json } from '../build.ts'
import { LOGO_IMAGE_ID } from '../logo.ts'
import type { Form } from './types.ts'

const SHADE = '#dde2f5'
const NAVY = colour('#1f3f8f')
const BIG = size('20px')
const TITLE = size('24px')

const MODALITIES = ['RX', 'US', 'CT', 'IRM'] as const
// Body regions: a group (bold) and its parts; a group without parts takes both columns.
const REGIONS: readonly (readonly [string, readonly string[]])[] = [
  ['Crâne', []],
  ['Cou', []],
  ['Colonne', ['Cervicale', 'Dorsale', 'Lombaire']],
  ['Thorax', []],
  ['Abdomen', ['Supérieur', 'Inférieur']],
  ['Prostate', []],
]
const OSTEO = ['RX', 'US', 'CT', 'IRM', 'Arthro IRM', 'Arthro CT'] as const

// The editor lays tables out in equal columns (no column width), so the label columns span several
// grid columns: group and part 2 each, one per modality.
const LABEL_SPAN = 2
// Rows alternate white and light blue, as on the printed slip.
const shade = (index: number): string | undefined => (index % 2 ? SHADE : undefined)
const ticks = (index: number): Json[] => MODALITIES.map(() => cell([], { background: shade(index) }))

const regionRows = (): Json[] => {
  const rows: Json[] = []
  let index = 0
  for (const [group, parts] of REGIONS) {
    if (parts.length === 0) {
      rows.push(row(cell([bold(group)], { colspan: 2 * LABEL_SPAN, background: shade(index) }), ...ticks(index)))
      index += 1
      continue
    }
    parts.forEach((part, i) => {
      const groupCell = i === 0 ? [cell([bold(group)], { rowspan: parts.length, colspan: LABEL_SPAN, background: shade(index) })] : []
      rows.push(row(...groupCell, cell(part, { colspan: LABEL_SPAN, background: shade(index) }), ...ticks(index)))
      index += 1
    })
  }
  // "Autre" and two free lines across the whole matrix.
  for (const content of [[bold('Autre :')], [], []]) {
    rows.push(row(cell(content, { colspan: 2 * LABEL_SPAN + MODALITIES.length, background: shade(index) })))
    index += 1
  }
  return rows
}

const regions = table(row(cell([], { colspan: 2 * LABEL_SPAN }), ...MODALITIES.map((m) => cell(pAligned('center', small(m))))), ...regionRows())

const osteo = table(
  row(cell([bold('Syst. ostéo-articulaire')], { colspan: 5 }), cell(pAligned('center', small('G   D')))),
  ...OSTEO.flatMap((modality) => [row(cell([bold(`${modality} :`)], { colspan: 5 }), cell(pAligned('center', text(`${BOX}  ${BOX}`)))), row(cell([], { colspan: 5, background: SHADE }), cell([], { background: SHADE }))]),
)

const bar = (label: string, ...extra: Json[]): Json => layoutTable(row(cell([p(text(`${label} : `), blank(16), ...extra)], { background: SHADE })))

const header = layoutTable(
  row(
    cell([p(image(LOGO_IMAGE_ID, 'Logo du Centre d’imagerie du Verger', 180)), p(small('Centre d’imagerie du Verger', NAVY))], { colspan: 2 }),
    cell([p(text('Bon d’examen d’imagerie médicale', TITLE)), bar('Rendez-vous', text(' '), bold('Tél. +00 00 000 00 00')), bar('Date souhaitée')], { colspan: 3 }),
  ),
)

const personal = frame([
  p(text('Données personnelles', BIG)),
  p(...line('Nom', 'patient.lastName')),
  p(...line('Prénom', 'patient.firstName')),
  p(...line('Date de naissance', 'patient.birthDate')),
  p(...line('Adresse', 'patient.street')),
  p(field('patient.postalCode'), text(' '), field('patient.city')),
  p(...line('Téléphone', 'patient.phone')),
])

const referent = frame([
  p(text('Données du médecin référent', BIG)),
  p(...line('Nom', 'physician.lastName')),
  p(...line('Prénom', 'physician.firstName')),
  p(...line('Téléphone', 'physician.phone')),
  p(text('Date et signature : '), field('date.today')),
  p(),
  p(bold('Copie à : '), blank(36)),
])

// Two blocks side by side, without the outer table's own borders.
const sideBySide = (left: Json, right: Json): Json => layoutTable(row(cell([left]), cell([right])))

const indications = frame([p(text('Indications et antécédents : ', BIG), blank(45)), ...Array.from({ length: 11 }, () => p(blank(92)))])

const RISKS = ['Allergie(s)', 'Créatininémie', 'Anticoagulants', 'PCMK ou implants', 'Autre'] as const
const risks = frame([layoutTable(...RISKS.map((risk) => row(cell(`${risk} :`, { colspan: 3 }), cell(BOX), cell([blank(52)], { colspan: 10 }))))])

export const imagingRequest: Form = {
  id: 'imaging-request',
  title: 'Bon d’examen d’imagerie médicale',
  source: 'bon d’examen papier scanné d’un centre d’imagerie (une page)',
  page: { widthMm: 210, heightMm: 297, marginMm: 10 },
  content: doc([
    header,
    sideBySide(personal, referent),
    sideBySide(regions, osteo),
    indications,
    p(),
    risks,
    pAligned('center', small('MEMBRE DU RÉSEAU MÉDICAL EXEMPLE')),
    pAligned('center', small('Centre d’imagerie du Verger · Rue de l’Exemple 1 · 0000 Sampleville')),
    pAligned('center', small('T +00 00 000 00 00 · F +00 00 000 00 00 · imagerie@example.org')),
  ]),
}
