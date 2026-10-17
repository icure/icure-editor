// A basophil activation test (BAT) request of an allergy laboratory: patient, sender and billing
// framed at the top, the sample material, then drug allergy (drugs by class, each with its skin test
// result), chronic urticaria and hymenoptera venom identification on the second page.
import { blank, bold, BOX, box, cell, colour, doc, EM, field, image, line, options, p, pAligned, row, size, small, STRONG, table, text, U, type CellOptions, type Json } from '../build.ts'
import { LOGO_IMAGE_ID } from '../logo.ts'
import type { Form } from './types.ts'

const PINK = '#e16173'
const SERUM = '#ffd428'
const EDTA = '#a1467e'
const BLUE = colour('#3465a4')
const RED = colour('#ff0000')
const GREY = colour('#999999')
const NO_BORDER = '#ffffff'
const SMALL = size('10px')


// A line of the patient block: the label, then the host's value.
const patientLine = (label: string, ...values: Json[]): Json => p(small(`${label} `), ...values)
const blueBold = (key: string): Json => field(key, STRONG, BLUE, SMALL)
// A section title across the table, on the pink band.
const band = (title: string, colspan: number): Json => row(cell([pAligned('center', bold(title, size('13px'))), pAligned('center', bold('BAT (Test d’activation des basophiles)', SMALL))], { colspan, background: PINK }))
// An order code: its parts on their materials' colours, then the analysis with its box.
const code = (codes: readonly (readonly [string, string])[], label: string): Json[] => [table(row(...codes.map(([c, bg]) => cell(small(c), { background: bg, border: NO_BORDER })))), p(box(label, SMALL))]
const red = (value: string): Json => p(small(value, RED))

const patient: Json[] = [
  p(text('Patient '), small('(Merci de remplir)', EM)),
  patientLine('Nom', field('patient.lastName', SMALL)),
  patientLine('Prénom', field('patient.firstName', SMALL)),
  patientLine('Date de naissance', field('patient.birthDate', SMALL)),
  patientLine('Adresse, No', field('patient.street', SMALL)),
  p(small('NPA '), field('patient.postalCode', SMALL), small(' Lieu '), field('patient.city', SMALL)),
  patientLine('EDV-Nr./Pat.ID', field('patient.id', SMALL)),
  p(small('Mobile '), field('patient.mobile', SMALL), small('    '), field('patient.sex', SMALL)),
  patientLine('E-mail', field('patient.email', SMALL)),
]

const sender: Json[] = [
  p(small('Expéditeur')),
  p(),
  p(blueBold('physician.title')),
  p(blueBold('physician.firstName'), text(' ', SMALL), blueBold('physician.lastName')),
  p(blueBold('physician.addressComplement')),
  p(blueBold('physician.street')),
  p(blueBold('physician.postalCode'), text(' ', SMALL), blueBold('physician.city')),
]

const billing: Json[] = [
  p(text('Facturation  '), ...options(['Caisse', 'Patient', 'Expéditeur'], SMALL)),
  p(...line('Assurance', field('insurance.name', SMALL), SMALL)),
  p(...line('No de carte', field('insurance.cardNumber', SMALL), SMALL)),
  p(...line('Numéro AVS', field('patient.ssn', SMALL), SMALL)),
]

const header = table(row(
  cell([p(image(LOGO_IMAGE_ID, 'Logo du Laboratoire Alpha Analyses', 160))], { border: NO_BORDER }),
  cell([
    pAligned('right', bold('Laboratoire Alpha Analyses', SMALL)),
    pAligned('right', small('Rue de l’Exemple 1, 0000 Sampleville')),
    pAligned('right', small('Tél. +00 00 000 00 00')),
    pAligned('right', small('info@example.org')),
  ], { border: NO_BORDER }),
))

const requestTable = table(
  row(
    cell(patient, { rowspan: 2 }),
    cell([pAligned('center', bold('BAT', size('18px')))], { background: PINK }),
    cell([pAligned('center', bold('Code barre', GREY, SMALL))], { rowspan: 2 }),
  ),
  row(cell(sender)),
  row(
    cell(billing, { rowspan: 2 }),
    cell([p(small('Visa'), small('            '), small('Date de prélèvement'), small('            '), small('Heure de prélèvement')), p(blank(10), text('    '), blank(16), text('    '), blank(16))], { colspan: 2 }),
  ),
  row(cell([p(text('Copie du rapport')), p(box('Patient', SMALL)), p(box('Médecin/Autre', SMALL))], { colspan: 2 })),
  row(cell([p()], { border: NO_BORDER }), cell([p()], { colspan: 2, border: NO_BORDER })),
  row(cell([p(text('S’il vous plaît, cocher correctement')), p(...options(['Correct', 'Faux'], SMALL))], { rowspan: 2 }), cell([p(text('Matériel'))], { colspan: 2 })),
  row(cell(small('Sérum'), { background: SERUM }), cell(small('Sang EDTA'), { background: EDTA })),
)

// The drugs by class; each one has a box, then its skin test result (pos / nég).
interface DrugGroup {
  readonly title: string
  readonly drugs: readonly string[]
}
const LEFT_GROUPS: readonly DrugGroup[] = [
  { title: 'Bêta-lactames', drugs: ['Amoxicilline', 'Acide clavulanique', 'Méropénem', 'Penicillin G', 'Tazobactam'] },
  { title: 'Myorelaxants', drugs: ['Atracurium', 'Etomidat', 'Mivacurium', 'Rocuronium', 'Suxaméthonium'] },
  { title: 'Autres substances', drugs: ['Carboxylméthylcel.', 'Chlorhexidine', 'Dotarem', 'Ibuprofène', 'Métamizol', 'Nadroparin', 'Néomycine', 'Triméthoprime'] },
  { title: 'Fluoroquinolones', drugs: ['Ciprofloxacine', 'Lévofloxacine', 'Moxifloxacine'] },
]
const RIGHT_GROUPS: readonly DrugGroup[] = [
  { title: 'Céphalosporines', drugs: ['Cefaclor', 'Céfadroxil', 'Céfazoline', 'Céfuroxime', 'Cetriaxon'] },
  { title: 'IPP', drugs: ['Ésoméprazole', 'Lansoprazole', 'Oméprazole', 'Pantoprazole'] },
]
// The vaccine components are ordered as one panel (one box), each with its own result.
const VACCINE_PANEL = ['Moderna COV-19', 'PEG 2000', 'Pfizer COV-19', 'Polysorbat 80', 'TRIS']

const plain: CellOptions = { border: NO_BORDER }
const groupTitle = (title: string): Json[] => [cell([p(bold(title, U, SMALL))], plain), cell([p(small('test cutané', U))], plain)]
const result = (): Json => cell([p(...options(['pos', 'nég'], SMALL))], plain)
const drugCells = (label: string, withBox = true): Json[] => [cell(withBox ? box(label, SMALL) : small(label), plain), result()]
const emptyCells = (): Json[] => [cell([p()], plain), cell([p()], plain)]
// A column of drug groups as rows of two cells (the drug, its skin test), a blank row between groups.
const groupRows = (groups: readonly DrugGroup[]): Json[][] => groups.flatMap((g, i) => [...(i ? [emptyCells()] : []), groupTitle(g.title), ...g.drugs.map((d) => drugCells(d))])
const vaccineRows: Json[][] = [
  emptyCells(),
  groupTitle('Vaccination SARS-CoV-2'),
  [cell(box(VACCINE_PANEL.join(', '), SMALL), { ...plain, colspan: 2 })],
  ...VACCINE_PANEL.map((d) => drugCells(d, false)),
]
const zip = (left: Json[][], right: Json[][]): Json[][] => Array.from({ length: Math.max(left.length, right.length) }, (_, i) => [...(left[i] ?? emptyCells()), ...(right[i] ?? emptyCells())])
const drugRows = zip(groupRows(LEFT_GROUPS), [...groupRows(RIGHT_GROUPS), ...vaccineRows])

const drugInstructions: Json[] = [
  ...code([['MED', SERUM], ['BAT', EDTA]], 'Allergie médicamenteuse'),
  red('Seulement après réservation téléphonique'),
  red('Au moins 9 ml de sang EDTA et 3 ml de sérum'),
  p(small('Temps de transport : maximum 20h à ', RED), small('température ambiante', RED, STRONG, U)),
  p(),
  p(bold('Données cliniques :', BLUE)),
  p(...line('Date de la réaction', blank(10), SMALL)),
  ...['anaphylaxie', 'urticaire', 'angioedème', 'test cutané pas encore effectué'].map((s) => p(box(s, SMALL))),
  p(box('autres symptômes : ', SMALL)),
  p(blank(28)),
]

const OTHER_SUBSTANCE_LINES = 4
const otherSubstances: Json[][] = [
  [...groupTitle('Autres substances*'), cell([p()], { ...plain, colspan: 2 })],
  ...Array.from({ length: OTHER_SUBSTANCE_LINES }, () => [cell([p(text(`${BOX} `, SMALL), blank(14))], plain), result(), cell([p()], { ...plain, colspan: 2 })]),
  [cell([p(small('* pour les substances non listées, le BAT n’est pas validé. En effet nous n’avons pas encore eu de BAT positifs à ces substances jusqu’à présent. Cependant, les faux positifs peuvent être exclus, car des contrôles sont effectués sur des patients non sensibilisés. De plus la toxicité de la substance envers les basophiles est aussi évaluée.'))], { ...plain, colspan: 4 })],
]

const drugTable = table(
  band('Allergie médicamenteuse', 5),
  row(cell(drugInstructions, { rowspan: drugRows.length + otherSubstances.length }), ...drugRows[0]!),
  ...drugRows.slice(1).map((cells) => row(...cells)),
  ...otherSubstances.map((cells) => row(...cells)),
)

const urticariaTable = table(
  band('Urticaire chronique', 2),
  row(
    cell([...code([['CUBAT', SERUM]], 'Urticaire chronique'), red('Pas de rendez-vous')]),
    cell([
      p(bold('Informations supplémentaires', BLUE)),
      p(...options(['Examen initial', 'Suivi des progrès'], SMALL)),
      p(bold('Test du sérum autologue', BLUE, SMALL)),
      p(...options(['positive', 'négative', 'pas fait'], SMALL)),
      p(bold('Tryptase sérique', BLUE, SMALL)),
      p(box('Détermination déjà faite : ', SMALL), blank(8), small(' ug/l    Date : '), blank(10)),
      p(box('Déterminer au Laboratoire Alpha Analyses', SMALL)),
      p(bold('Maladie auto-immune associée', BLUE, SMALL)),
      p(blank(45)),
    ]),
  ),
  row(cell([p()], plain), cell([p()], plain)),
  band('Identification des venins d’hyménoptères', 2),
  row(
    cell([
      ...code([['HYMBAT', EDTA]], 'Identification des venins d’hyménoptères'),
      red('Seulement après réservation téléphonique'),
      red('Au moins 4 ml de sang EDTA'),
      p(small('Temps de transport : maximum 20h à ', RED), small('température ambiante', RED, STRONG, U)),
    ]),
    cell([
      p(bold('Hyménoptères', U, SMALL), small('    test cutané', U)),
      ...['Abeille', 'Guêpe', 'Frelon'].map((v) => p(box(v, SMALL), small('    '), ...options(['pos', 'nég'], SMALL))),
      p(),
      p(bold('Informations supplémentaires :', BLUE, SMALL)),
      p(...line('Date de la réaction', null, SMALL)),
      p(...options(['Abeille', 'Guêpe', 'Frelon', 'inconnu', 'Autre :'], SMALL), text(' '), blank(8)),
      p(bold('Sérologie', BLUE, SMALL)),
      p(small('Abeille : '), blank(6), small(' kU/l    Guêpe : '), blank(6), small(' kU/l    Frelon : '), blank(6), small(' kU/l')),
      p(small('IgE Totale : '), blank(6), small(' kU/l    Tryptase : '), blank(6), small(' kU/l')),
      p(small('Allergènes recombinants positifs : '), blank(30)),
      p(box('Commandé par le Laboratoire Alpha Analyses', SMALL)),
    ]),
  ),
)

export const basophilActivationTest: Form = {
  id: 'basophil-activation-test',
  title: 'Demande d’analyse – test d’activation des basophiles',
  source: 'formulaire LibreOffice d’un laboratoire d’allergologie (deux pages, cases à cocher)',
  page: { widthMm: 210, heightMm: 297, marginMm: 10 },
  content: doc(
    [header, requestTable, p(), drugTable],
    [urticariaTable],
  ),
}
