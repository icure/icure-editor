// An order form for a custom-made hip prosthesis (a manufacturer's word-processor template): patient
// and surgeon, CT scan and operation, the components to make, the femoral preparation, instructions,
// signature and the manufacturer's addresses.
import { blank, bold, BOX, cell, colour, doc, EM, field, frame, hAligned, image, options, p, pAligned, row, size, small, STRONG, table, text, type CellOptions, type Json } from '../build.ts'
import { LOGO_IMAGE_ID } from '../logo.ts'
import type { Form } from './types.ts'

const GREEN = colour('#3faa54')
const GREY = colour('#808080')
const FILL = '#cef1a9'
const RULE = '#b2b2b2'
const NO_BORDER = '#ffffff'

const plain: CellOptions = { border: NO_BORDER }
const filled: CellOptions = { border: NO_BORDER, background: FILL }
const spacer = (): Json => cell(p(), { border: NO_BORDER, width: 8 })
// A right-aligned label.
const labelCell = (label: string, ...marks: Json[]): Json => cell(pAligned('right', text(label, ...marks)), plain)
// A value to fill: a field, several fields, or nothing (by hand), on a green background.
const valueCell = (...content: Json[]): Json => cell(p(...content), filled)
const valueField = (name: string): Json => field(name, GREY)

const people = table(
  row(cell(p(), plain), cell(p(bold('Patient', size('16px'))), plain), spacer(), cell(p(), plain), cell(p(bold('Chirurgien', size('16px'))), plain)),
  row(labelCell('Nom'), valueCell(valueField('patient.lastName')), spacer(), labelCell('Nom'), valueCell(valueField('physician.lastName'), text(' '), valueField('physician.firstName'))),
  row(labelCell('Prénom'), valueCell(valueField('patient.firstName')), spacer(), labelCell('Cabinet'), valueCell(valueField('physician.practice'))),
  row(labelCell('Date de naissance'), valueCell(valueField('patient.birthDate')), spacer(), labelCell('Email'), valueCell(valueField('physician.email'))),
  row(labelCell('Côté :', STRONG), cell(p(text(`${BOX}\u00a0Gauche    ${BOX}\u00a0Droit`)), plain), spacer(), labelCell('Tél. direct'), valueCell(valueField('physician.phone'))),
)

const measures = table(
  row(
    cell(pAligned('center', bold('Poids '), text('(kg)', colour('#999999'))), plain), valueCell(valueField('patient.weight')),
    cell(pAligned('center', bold('Taille '), text('(cm)', colour('#999999'))), plain), valueCell(valueField('patient.height')),
    labelCell('Tél. Secrétariat'), valueCell(text('+00 00 000 00 00', GREY)),
  ),
)

const events = table(
  row(cell(p(), plain), cell(p(bold('Examen CT SCANNER', size('16px'))), plain), spacer(), cell(p(), plain), cell(p(bold('OPÉRATION', size('16px'))), plain)),
  row(labelCell('Centre de radiologie'), valueCell(), spacer(), labelCell('Date'), valueCell()),
  row(labelCell('Date de l’examen'), valueCell(), spacer(), labelCell('Hôpital'), valueCell()),
)

const advisor = table(row(cell(pAligned('right', bold('Conseiller technique :')), { ...plain, width: 160 }), valueCell(blank(30))))

// The component grid: three columns, each cell a heading or a space to write in.
const COMPONENTS: readonly (readonly [string, string, string])[] = [
  ['TIGE SUR MESURE', 'CUPULE', 'INSERT'],
  ['', '', ''],
  ['', '', ''],
  ['Revêtement :', '', ''],
  ['', '', ''],
  ['', 'TÊTE', 'VOIE D’ABORD'],
  ['Collerette :', '', ''],
  ['', '', ''],
  ['', '', ''],
]
const components = table(...COMPONENTS.map((labels) => row(...labels.map((label) => cell(p(...(label ? [bold(label)] : [])), { border: RULE })))))

// The femoral preparation: the source shows a picture of each instrument next to its name.
const preparation = table(
  row(cell(p(bold('Préparation fémur :', size('12px'))), { ...plain, colspan: 3 })),
  row(...['Râpe sur mesure', 'Compacteur sur mesure', 'Voie antérieure sur mesure'].map((label) => cell(p(...options([label], STRONG, size('12px'))), plain))),
)

const signature = table(
  row(cell(p(), { background: FILL, border: RULE, rowspan: 2, width: 290 }), cell(pAligned('right', bold('Date :')), { border: RULE }), valueCell(field('date.today'))),
  row(cell(pAligned('right', bold('Signature :')), { border: RULE }), cell(p(), { border: RULE, background: FILL })),
)

const footer = (value: string): Json => pAligned('center', text(value, size('8px')))

export const hipProsthesisOrder: Form = {
  id: 'hip-prosthesis-order',
  title: 'Bon de commande – prothèse de hanche sur mesure',
  source: 'modèle de traitement de texte d’un fabricant de prothèses (bon de commande, une page)',
  content: doc([
    table(row(cell(p(image(LOGO_IMAGE_ID, 'Logo d’Orthomodèle SA', 160)), plain), cell(pAligned('center', text('Bon de commande', STRONG, EM, size('24px'))), plain))),
    hAligned(2, 'center', text('PROTHÈSE DE HANCHE SUR MESURE', GREEN)),
    people,
    measures,
    events,
    advisor,
    pAligned('justify', text('Date de l’opération garantie 6 semaines après création dans la plateforme Orthomodèle. (Bon de commande, radiographies et scanner selon protocole Orthomodèle)', STRONG, EM, GREEN, size('10px'))),
    components,
    p(small('FC.SUR-MESURE.04.2024.V.1.0.fr')),
    preparation,
    frame([p(bold('INSTRUCTIONS', size('12px'))), p(bold('COMMENTAIRES', size('12px'))), p(), p(), p()], { border: RULE }),
    signature,
    footer('Orthomodèle SA'),
    footer('Rue de l’Exemple 10 – 0000 Sampleville – Tél. +00 00 000 00 00 – Fax +00 00 000 00 00 – www.example.org'),
    footer('Service sur mesure : Tél. +00 00 000 00 00 – Fax +00 00 000 00 00 – sur-mesure@example.org'),
    footer('Service clients : Tél. +00 00 000 00 00 – Fax +00 00 000 00 00'),
  ]),
}
