// An operating-theatre admission slip (a private clinic's booking of an operation): the surgeon and
// the anaesthesia consultation, then numbered sections (patient, stay, theatre, anaesthesia,
// treatment, discharge, remarks, cancellation, date and signature), mostly in two or three columns.
import { blank, bold, box, br, cell, colour, doc, EM, field, image, italic, line, options, p, pAligned, pLine, row, size, STRONG, layoutTable, table, text, type Json } from '../build.ts'
import { LOGO_IMAGE_ID } from '../logo.ts'
import type { Form } from './types.ts'

const NAVY = colour('#000080')
const RED = colour('#ff0000')
const GREY = colour('#808080')
const BAND = '#b3b3b3'
// The treatment grid is set smaller, as in the source, so its three columns hold their lines.
const SMALL = size('11px')

// A numbered section title: navy capitals on the grey band of the source's heading style.
const section = (num: string, title: string): Json => table(row(cell([p(text(`${num}.    ${title}`, STRONG, NAVY))], { background: BAND, border: BAND })))
// A grey bold italic sub-heading.
const subHeading = (label: string): Json => p(text(label, STRONG, EM, GREY))
// Side-by-side columns without rules.
const columns = (...cols: (readonly [Json[], number])[]): Json => layoutTable(row(...cols.map(([blocks, width]) => cell(blocks, { width }))))
const ouiNon = (label: string, ...marks: Json[]): Json[] => [text(`${label} : `, SMALL, ...marks), box('oui', SMALL), text(' ', SMALL), box('non', SMALL)]

// The title in small capitals: the initials larger, the rest in capitals.
const TITLE: readonly (readonly [string, boolean])[] = [['B', true], ['ON D’', false], ['A', true], ['DMISSION POUR LE BLOC OPÉRATOIRE', false]]
const title: Json = table(row(cell([pAligned('center', ...TITLE.map(([part, initial]) => text(part, STRONG, NAVY, size(initial ? '22px' : '16px'))))], { border: '#808080' })))

const surgeon: Json = columns(
  [[p(text('Médecin : '), field('physician.title'), text(' '), field('physician.firstName'), text(' '), field('physician.lastName')), p(text('Discipline : '), field('physician.specialty'))], 330],
  [[subHeading('Consultation anesthésie'), p(...options(['Non', 'Oui']), text('    '), ...line('Date', blank(10))), p(box('Avis anesthésique avant décision opératoire'))], 313],
)

const patientLeft: Json[] = [
  pLine('Nom', 'patient.lastName'),
  pLine('Prénom', 'patient.firstName'),
  p(...line('Date de naissance', 'patient.birthDate'), text('  Sexe : '), box('M'), text(' / '), box('F')),
  pLine('Etat civil', 'patient.civilStatus'),
  pLine('Médecin traitant', 'gp.name'),
  pLine('AVS n°', 'patient.ssn'),
  p(text('Assurance   BASE : '), field('insurance.name')),
  pLine('N° d’ass.', 'insurance.memberNumber'),
  pLine('N° de carte', 'insurance.cardNumber'),
  p(text('Assurance   COMPL : '), field('insurance.supplementaryName')),
  pLine('No d’assuré', 'insurance.supplementaryNumber'),
  p(text('Classe :    '), ...options(['P', 'DP', 'SC'])),
]

const patientRight: Json[] = [
  pLine('Adresse', 'patient.street'),
  p(text('NP + Lieu : '), field('patient.postalCode'), text(' '), field('patient.city')),
  pLine('Tél. privé', 'patient.phone'),
  pLine('Tél. mobile', 'patient.mobile'),
  pLine('Email', 'patient.email'),
  subHeading('Personne de contact'),
  pLine('Nom', 'contact.name'),
  pLine('N° de tél.', 'contact.phone'),
  subHeading('Employeur'),
  pLine('Nom', 'employer.name'),
  pLine('Localité', 'employer.city'),
  pLine('N° de tél.', 'employer.phone'),
]

const theatreLeft: Json[] = ['Médecin assistant', 'Diagnostic', 'Code ICD-10', 'Opération', 'Code CHOP', 'Code RAP'].map((label) => pLine(label, blank(18)))
const theatreRight: Json[] = ['Instruments et matériel', 'Durée opératoire', 'Ampli de brillance'].map((label) => pLine(label, blank(14)))

const ALLERGIES = ['Allergie au LATEX', 'Allergie à l’IODE', 'Allergie au NICKEL', 'Autre(s) allergie(s)']
const DRUGS = ['TTT sintrom', 'Aspirine', 'Plavix']

const treatment: Json = columns(
  [[...ALLERGIES.map((label) => p(text(`${label} : `, SMALL), box('oui', SMALL))), p(blank(20))], 215],
  [[p(box('Diabète', SMALL), br, box('Diabète insulino-dépendant', SMALL))], 200],
  [DRUGS.map((label) => p(...ouiNon(label, STRONG), br, ...ouiNon('Arrêt pré-op'))), 228],
)

export const theatreAdmission: Form = {
  id: 'theatre-admission',
  title: 'Bon d’admission pour le bloc opératoire',
  source: 'formulaire Word d’une clinique privée (champs de formulaire, colonnes)',
  page: { widthMm: 210, heightMm: 297, marginMm: 15 },
  content: doc([
    pAligned('center', image(LOGO_IMAGE_ID, 'Logo de la Clinique du Belvédère', 160)),
    title,
    p(),
    surgeon,
    section('1', 'PATIENT'),
    columns([patientLeft, 330], [patientRight, 313]),
    subHeading('Nature de l’affection'),
    p(...options(['Maladie LAMal', 'Accident LAA', 'Esthétique'])),
    p(box('Accident LAMal'), text('  : '), ...line('Date acc.', blank(14)), text('    '), ...line('N° cas', blank(14))),
    section('2', 'HOSPITALISATION'),
    pLine('Date entrée'),
    pLine('Date d’opération'),
    p(box('Ambulatoire'), text(' / '), box('Nuit de confort'), text(' / '), box('Hospitalisation'), text('    Durée probable : '), blank(6), text(' jours')),
    section('3', 'BLOC OPERATOIRE'),
    columns([theatreLeft, 330], [theatreRight, 313]),
    section('4', 'ANESTHESIE'),
    pLine('Technique d’anesthésie souhaitée', blank(36)),
    section('5', 'TRAITEMENT'),
    treatment,
    section('6', 'SORTIE'),
    p(...options(['Domicile', 'CTR', 'MPR']), text('    '), ...line('Autre', blank(20))),
    section('7', 'REMARQUES'),
    p(blank(80)),
    section('8', 'ANNULATION'),
    p(box('Annulation', STRONG, RED), text('  '), bold('Motif : ', RED), blank(40)),
    section('8', 'DATE ET SIGNATURE'),
    p(...line('Date d’édition du bon', 'date.today'), text('    '), ...line('Signature opérateur', blank(20))),
    p(italic('RAP', STRONG), text(' date : '), blank(10), text('    Visa : '), blank(10), text('      '), italic('Instrumentiste', STRONG), text(' date : '), blank(10), text('    Visa '), blank(8)),
  ]),
}
