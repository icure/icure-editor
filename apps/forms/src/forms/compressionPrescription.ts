// A compression stocking prescription pad (a manufacturer's A5 two-page form): the prescription
// itself (patient, model and compression class, donning aids, product range, physician's stamp and
// signature, a note to the patient) and the measurement sheet of standard stockings.
import { blank, bold, box, cell, colour, doc, field, frame, h, image, line, options, p, pAligned, row, size, small, STRONG, table, text, type Json } from '../build.ts'
import { LOGO_IMAGE_ID } from '../logo.ts'
import type { Form } from './types.ts'

const BLUE = colour('#133e8f')
const RULE = '#133e8f'

// The source prints small (an A5 pad): every run outside a heading and without a size of its own gets one.
const sized = (node: Json, value = '11px'): Json => {
  if (node.type === 'heading') return node
  const marks = (node.marks as Json[] | undefined) ?? []
  const own = (node.type === 'text' || node.type === 'variable') && !marks.some((m) => m.type === 'size') ? { marks: [...marks, size(value)] } : {}
  const content = Array.isArray(node.content) ? { content: (node.content as Json[]).map((child) => sized(child, value)) } : {}
  return { ...node, ...own, ...content }
}

const logo = pAligned('right', image(LOGO_IMAGE_ID, 'Logo de VENOFORM', 100))
const label = (value: string): Json => bold(value, BLUE)
// A label on the left, the rest of the line on the right (no frame).
const labelled = (name: string, ...content: Json[][]): Json => row(cell(label(name), { borders: '', width: 90 }), ...content.map((c) => cell(c, { borders: '' })))
// A value over its small caption.
const captioned = (value: Json, caption: string): Json[] => [p(value), p(small(caption))]

// The models: name, code; each with compression classes 1 to 4. The source draws a leg pictogram
// under each name; the editor has none of them.
const MODELS: readonly (readonly [string, string])[] = [
  ['Bas mollet', 'AD'],
  ['Bas cuisse', 'AG'],
  ['Collant', 'AT'],
  ['Collant maternité', 'ATU'],
  ['Bas cuisse fixation à la hanche', 'AGHB'],
]
const CLASSES = ['CCL 1', 'CCL 2', 'CCL 3', 'CCL 4']

const modelGrid = table(
  row(...MODELS.map(([name]) => cell(p(box(name)), { borders: '' }))),
  row(...MODELS.map(([, code]) => cell(p(bold(code, BLUE)), { borders: '' }))),
  ...CLASSES.map((ccl) => row(...MODELS.map(() => cell(p(box(ccl, STRONG)), { borders: '' })))),
  row(cell(p(...line('Nombre paire(s)', blank(10))), { colspan: 2, borders: '' }), cell(p(...line('Nombre de pièce(s)', blank(10))), { colspan: 3, borders: '' })),
)

const motif = (reason: string): Json => p(small('    ○ '), small('Motif :', STRONG), small(` ${reason}`))
const aids = table(
  row(
    cell([p(box('Kit ulcère veineux')), p(...line('Nombre de kits', blank(10)))], { borders: '' }),
    cell([
      p(bold('DISPOSITIFS D’AIDE À LA MISE EN PLACE', BLUE)),
      p(box('Gants en caoutchouc spéciaux', STRONG, BLUE)),
      p(box('Aide au glissement', STRONG, BLUE)),
      motif('le / la patient(e) n’est pas en mesure de mettre ou d’enlever ses bas de compression seul(e).'),
      p(box('Cadre / manchette circulaire', STRONG, BLUE)),
      motif('le / la patient(e) ne peut pas utiliser l’aide au glissement en raison d’une mobilité réduite.'),
    ], { borders: '', colspan: 2 }),
  ),
)

const signature = table(
  row(
    cell([p(small('Sceau du cabinet / Adresse du médecin')), p(field('physician.practice')), p(field('physician.street'), text(', '), field('physician.postalCode'), text(' '), field('physician.city'))], { border: RULE, width: 230 }),
    cell([p(small('Nom du médecin / Numéro RCC : '), field('physician.title'), text(' '), field('physician.firstName'), text(' '), field('physician.lastName'), text(' / '), field('physician.rcc')), p(small('Date : '), field('date.today')), p(small('Signature du médecin : '), blank(20))], { borders: '' }),
  ),
)

const prescription: Json[] = [
  logo,
  h(2, text('PRESCRIPTION MÉDICALE', BLUE)),
  p(bold('Bas / Collants de compression médicaux à maillage circulaire', BLUE)),
  table(
    labelled('Patient(e)', captioned(field('patient.lastName'), 'Nom'), captioned(field('patient.firstName'), 'Prénom'), captioned(field('patient.birthDate'), 'Date de naissance')),
    row(cell(label('Indication'), { borders: '' }), cell(p(blank(40)), { colspan: 3, borders: '' })),
    row(cell(label('Utilisation'), { borders: '' }), cell(p(...options(['Bas standard / en série', 'Bas sur mesure'])), { colspan: 3, borders: '' })),
  ),
  p(label('Modèle')),
  modelGrid,
  aids,
  frame([p(bold('Prescription de la gamme de produit :', BLUE), text(' '), blank(28)), p(bold('Motif :', BLUE), text(' '), blank(40)), p(blank(48))], { border: RULE }),
  signature,
  p(bold('Remarque à destination du patient/de la patiente', BLUE)),
  p(small('Le patient / la patiente n’est pas tenu(e) d’acheter des produits VENOFORM. Le patient / la patiente décide librement quels moyens auxiliaires acheter et auprès de quel point de remise. Si pour des raisons médicales le médecin a nommément inscrit un produit dans la prescription, le point de remise ne peut modifier le produit qu’après concertation avec le médecin traitant.')),
]

// Measurement sheet. The source draws the legs with the measuring points and boxes on them; here
// the points are rows of a table.
const PRODUCT_COLUMNS = ['Gamme', 'Modèle', 'CCL', 'Taille', 'Circonf. / Longueur', 'Pied ouvert / fermé', 'Couleur', 'Bande de fixation']
const CIRCUMFERENCES = ['cG', 'cD', 'cC', 'cB']
const LENGTHS = ['lG', 'lD']
const POINTS: readonly (readonly [string, string])[] = [
  ['cB', 'Circonférence la plus petite au niveau de la cheville au-dessus de la malléole externe'],
  ['cC', 'Circonférence la plus grande du mollet'],
  ['cD', 'Circonférence deux doigts en dessous du creux du genou'],
  ['cG', 'Circonférence de la partie la plus large de la cuisse, sous le pli fessier'],
]

const measures = table(
  row(
    cell([
      p(bold('MESURES CIRCONFÉRENCE', BLUE)),
      table(
        row(cell(p(), { header: true }), cell(p(small('Jambe gauche')), { header: true }), cell(p(small('Jambe droite')), { header: true })),
        ...CIRCUMFERENCES.map((point) => row(cell(p(text(point, BLUE))), cell(p()), cell(p()))),
      ),
    ], { borders: '' }),
    cell([
      p(bold('MESURES LONGUEUR', BLUE)),
      table(
        row(cell(p(), { header: true }), cell(p(small('Longueur')), { header: true })),
        ...LENGTHS.map((point) => row(cell(p(text(point, BLUE))), cell(p()))),
      ),
    ], { borders: '', width: 150 }),
  ),
)

const sheet: Json[] = [
  logo,
  h(2, text('DIMENSIONS BAS EN SÉRIE', BLUE)),
  p(bold('IMPORTANT :', BLUE), text(' Vous pouvez trouver le bas de compression de VENOFORM dans votre logiciel sous le nom VF = VenoForm.', BLUE)),
  table(
    labelled('Patient(e)', captioned(field('patient.lastName'), 'Nom'), captioned(field('patient.firstName'), 'Prénom')),
    row(cell(label('Date de mesures'), { borders: '' }), cell(p(blank(40)), { colspan: 2, borders: '' })),
    row(cell(label('Notes'), { borders: '' }), cell(p(blank(40)), { colspan: 2, borders: '' })),
  ),
  p(label('Produit')),
  table(
    row(...PRODUCT_COLUMNS.map((name) => cell(p(small(name)), { header: true }))),
    row(...PRODUCT_COLUMNS.map(() => cell(p()))),
  ),
  p(),
  measures,
  p(),
  p(bold('Pour VenoForm Classique, VenoForm Confort')),
  p(bold('Taille de pied :'), text('  '), box('foot short (pointure 36 – 41)')),
  p(text('                     '), box('foot long (pointure 41 – 46)')),
  h(3, text('Description des points de mesure', BLUE)),
  p(bold('Mesure de la circonférence', BLUE)),
  ...POINTS.map(([point, description]) => p(bold(point), text(`    ${description}`))),
  p(bold('Mesure de la longueur', BLUE)),
  p(bold('lD, lG'), text('    Les mesures de la longueur sont prises '), bold('verticalement'), text(', du sol jusqu’au point de mesure correspondant')),
]

export const compressionPrescription: Form = {
  id: 'compression-prescription',
  title: 'Prescription médicale – bas de compression',
  source: 'bloc de prescription PDF d’un fabricant de bas de compression (A5, deux pages)',
  page: { widthMm: 148, heightMm: 210, marginMm: 10 },
  content: doc(prescription.map((node) => sized(node, '10px')), sheet.map((node) => sized(node, '10px'))),
}
