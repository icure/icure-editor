// An admission request for a clinic's general operating theatre (gynaecology), two pages: the
// admissions office and the surgeon, the patient, the reason, case and kind of stay (with the
// flat-rate prices), the multi-resistant bacteria screening, the insurances; then the diagnosis, the
// intervention, the equipment needed and the pre-operative examinations.
import { BOX, blank, bold, box, br, cell, colour, doc, field, hAligned, image, options, p, row, size, small, STRONG, table, text, U, type Json } from '../build.ts'
import { LOGO_IMAGE_ID } from '../logo.ts'
import type { Form } from './types.ts'

const NAVY = colour('#0f3460')
const LINK = colour('#1565c0')
const GREY = colour('#a0a0a0')
const NO_BORDER = '#ffffff'

// The editor lays tables out in equal columns, so every layout row is a 12-column grid of
// borderless cells, each spanning a share of it.
// About six characters per grid column at the form's font size: a blank fills the rest of its cell.
const CHARS_PER_COLUMN = 6
type Slot = readonly [Json[], number]
const grid = (...rows: readonly Slot[][]): Json => table(...rows.map((slots) => row(...slots.map(([content, span]) => cell(content, { colspan: span, border: NO_BORDER })))))
const fill = (label: string, span: number): Json => blank(Math.max(4, span * CHARS_PER_COLUMN - label.length - 4))
// `Label : value` in a cell of `span` columns: a field, or a blank as long as the cell allows.
const slot = (label: string, span: number, value: string | null = null): Slot => [[text(`${label} : `), value ? field(value) : fill(label, span)], span]
const optionsSlot = (labels: readonly string[], span: number): Slot => [options(labels), span]
const empty = (span: number): Slot => [[], span]

// Section titles are large navy paragraphs (regular weight, as on the source), not headings: the
// headings' default margins would push page 1 past its sheet.
const TITLE = [NAVY, size('18px')]
const section = (title: string): Json => p(text(title, ...TITLE))
// The source's sections are well apart: an empty line before each.
const gap = p()
const date = (): Json[] => [blank(3), text('/'), blank(3), text('/'), blank(6)]
const time = (): Json[] => [blank(4), text(' h '), blank(4)]

const footer = (): Json[] => [p(small('CDG_2025_Demande d’admission_bloc général - GYNECOLOGIE', GREY)), p(small('www.glycines.example.org', LINK, U)), p(small('MEMBRE D’UN RÉSEAU MÉDICAL FICTIF', LINK))]
const logo = (): Json => p(image(LOGO_IMAGE_ID, 'Logo de la Clinique des Glycines', 180))

const header = grid([
  [[logo()], 3],
  [[hAligned(2, 'center', text('DEMANDE D’ADMISSION BLOC GÉNÉRAL', NAVY), br, text('GYNECOLOGIE', NAVY))], 9],
])

const admissions = grid([
  [[section('Admissions'), p(text('Tél. : +00 00 000 00 00')), p(text('Fax : +00 00 000 00 00')), p(text('Mail : '), text('admissions@example.org', LINK, U))], 6],
  [[section('Docteur'), p(field('physician.title'), text(' '), field('physician.firstName'), text(' '), field('physician.lastName')), p(text('Date d’entrée : '), ...date()), p(text('Heure d’entrée : '), ...time(), text('        '), box('À jeun'))], 6],
])

const patient = grid(
  [[[...options(['M', 'F', 'E']), text('    Date de naissance : '), field('patient.birthDate')], 6], slot('Adresse', 6, 'patient.street')],
  [slot('Nom', 3, 'patient.lastName'), slot('CP', 4, 'patient.postalCode'), slot('Localité', 5, 'patient.city')],
  [slot('Prénom', 3, 'patient.firstName'), slot('Téléphone', 4, 'patient.phone'), slot('Email', 5, 'patient.email')],
  [slot('Nationalité', 3, 'patient.nationality'), slot('État civil', 4, 'patient.civilStatus'), slot('Langue', 5, 'patient.language')],
  [slot('N° AVS', 5, 'patient.ssn'), empty(7)],
)

const stay = grid(
  [[[box('Hosp : '), blank(4), text(' jours prévus / nombre de nuits : '), blank(4)], 6], optionsSlot(['Hôpital de jour'], 6)],
  [optionsSlot(['Nuit Hôtelière à CHF 950.-'], 4), optionsSlot(['Forfait Confort à CHF 1’900.-'], 4), optionsSlot(['Forfait Prestige à CHF 2’600.-'], 4)],
  [[[text('Si accident, cas LAA : '), ...options(['Oui', 'Non'])], 5], slot('N° de sinistre', 7)],
)

// Each insurance: its name and its number (a field when the host knows it).
const INSURANCES: readonly (readonly [string, string | null, string | null])[] = [
  ['Assurance maladie de base', 'insurance.name', 'insurance.memberNumber'],
  ['Assurance maladie complémentaire', 'insurance.supplementaryName', 'insurance.supplementaryNumber'],
  ['Assurance accident de base', 'insurance.accidentName', null],
  ['Assurance accident complémentaire', null, null],
]
const quote = (): Slot => [[text('Demande de devis : '), ...options(['Oui', 'Non'])], 5]

const insurances = grid(...INSURANCES.map(([label, name, number]) => [slot(label, 8, name), slot('N°', 4, number)]))

const page1: Json[] = [
  header,
  gap,
  admissions,
  gap,
  section('Patient·e'),
  patient,
  gap,
  section('Motif d’hospitalisation'),
  p(...options(['Chirurgie', 'Médecine'])),
  gap,
  section('Cas d’hospitalisation'),
  p(box('Maladie'), text('  '), box('Accident, date : '), ...date(), text('  '), box('AMA (accident sous maladie), date : '), ...date(), text('  '), box('Esthétique')),
  gap,
  section('Type d’hospitalisation'),
  stay,
  gap,
  section('Dépistage BMR (bactéries multirésistantes)'),
  p(text('Le/la patient·e a-t-il/elle été hospitalisé·e les 12 derniers mois ?        '), ...options(['Oui', 'Non'])),
  p(text('Si oui, dans quel établissement / pays ? '), blank(50)),
  gap,
  section('Assurances'),
  p(...options(['Commune', 'Pas de complémentaire', 'Demi-privée', 'Privée'])),
  insurances,
  gap,
  section(`${BOX} Patientèle suisse sans assurance`),
  grid([slot('Auto payeur', 7), quote()]),
  gap,
  section(`${BOX} Patientèle internationale`),
  grid([slot('Assurance étrangère', 12)], [slot('Auto payeur', 7), quote()]),
  p(),
  p(),
  ...footer(),
]

// The equipment, four per row; the last cell of the last row is "Autre" with a blank.
const EQUIPMENT: readonly (readonly string[])[] = [
  ['Ampli de brillance', 'Microscope', 'Garrot', 'Ultracision'],
  ['Laser', 'Colposcope', 'Arthroscope', 'Laparoscope'],
  ['Ligasure', 'Cell Saver', 'Navigation'],
]
const autre: Slot = [[box('Autre : '), fill('Autre', 3)], 3]
const equipment = grid(
  [optionsSlot(['Examen EXTEMPO'], 3), slot('Laboratoire', 9)],
  ...EQUIPMENT.map((labels): Slot[] => [...labels.map((label) => optionsSlot([label], 3)), ...(labels.length < 4 ? [autre] : [])]),
)

const page2: Json[] = [
  // The logo, the diagnosis title and its room as one block: taller than what page 1 leaves free, so
  // the reflow never pulls page 2's start back onto page 1.
  grid([[[logo(), p(), p(text('Diagnostic médical et ', ...TITLE), bold('code ICD-10 :', ...TITLE)), p(), p(), p(), p()], 12]]),
  gap,
  section('Type d’intervention'),
  p(),
  p(),
  gap,
  section('Intervention'),
  grid(
    [[[text('Date : '), ...date()], 6], [[text('Heure : '), ...time()], 3], [[text('Durée : '), ...time()], 3]],
    [slot('Type d’anesthésie', 6), slot('Position du patient', 6)],
    [slot('Allergie(s)', 6), slot('Antibiotique', 6)],
    [slot('Commentaire', 12)],
    [[[text('Côté opéré : '), ...options(['Droit', 'Gauche'])], 6], [[text('Septique : '), ...options(['Oui', 'Non'])], 6]],
  ),
  gap,
  section('Matériel nécessaire (prothèses, implants)'),
  p(),
  equipment,
  gap,
  section('Examens pré-opératoires'),
  p(box('Radiologie : '), blank(75)),
  p(box('Laboratoire : '), blank(75)),
  grid([optionsSlot(['Commande de concentrés érythrocytaires'], 6), slot('Nb de CE', 3), slot('Groupe sanguin', 3)]),
  p(box('Autre : '), blank(80)),
  p(box('Anesthésie', STRONG)),
  p(),
  p(text('Le secrétariat d’anesthésie se charge de convoquer le patient en consultation pré-anesthésique 7 jours avant l’intervention.')),
  p(bold('Toute réservation du bloc opératoire sans confirmation écrite ne pourra pas être prise en considération.')),
  ...footer(),
]

export const surgicalAdmission: Form = {
  id: 'surgical-admission',
  title: 'Demande d’admission bloc général – gynécologie',
  source: 'formulaire PDF remplissable d’une clinique (deux pages)',
  page: { widthMm: 210, heightMm: 297, marginMm: 10 },
  content: doc(page1, page2),
}
