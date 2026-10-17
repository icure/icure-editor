// A surgery announcement (a hospital network's operating-theatre booking): the surgeon and the
// anaesthesia consultation, then nine numbered sections (patient, stay, theatre, equipment,
// anaesthesia, treatment, discharge, cancellation, date and signature), mostly in two columns.
import { blank, bold, box, br, cell, colour, doc, EM, field, h, image, italic, line, options, p, pLine, row, size, small, STRONG, layoutTable, table, text, type Json } from '../build.ts'
import { LOGO_IMAGE_ID } from '../logo.ts'
import type { Form } from './types.ts'

const NAVY = colour('#000080')
const RED = colour('#ff0000')
const GREY = colour('#808080')
const BAND = '#b3b3b3'

// A numbered section title: navy capitals on the grey band of the source's heading style.
const section = (num: string, title: string): Json => table(row(cell([p(text(`${num}.    ${title}`, STRONG, NAVY))], { background: BAND, border: BAND })))
// A grey bold italic sub-heading.
const subHeading = (label: string): Json => p(text(label, STRONG, EM, GREY))
// Side-by-side columns without rules.
const columns = (...cols: (readonly [Json[], number])[]): Json => layoutTable(row(...cols.map(([blocks, width]) => cell(blocks, { width }))))
// The treatment grid is set smaller, as in the source, so its four columns hold their lines.
const SMALL = size('11px')
const ouiNon = (label: string, ...marks: Json[]): Json[] => [text(`${label} : `, SMALL, ...marks), box('oui', SMALL), text(' ', SMALL), box('non', SMALL)]

const header: Json = columns(
  [[p(image(LOGO_IMAGE_ID, 'Logo du Réseau hospitalier des Tilleuls', 120))], 180],
  [[h(1, text('ANNONCE OPERATOIRE', colour('#4f81bd'), size('26px')))], 463],
)

const surgeon: Json = columns(
  [[p(text('Médecin : '), field('physician.title', STRONG), text(' ', STRONG), field('physician.firstName', STRONG), text(' ', STRONG), field('physician.lastName', STRONG)), p(text('Discipline : '), field('physician.specialty', STRONG))], 330],
  [[subHeading('Consultation anesthésie'), p(...options(['Non', 'Oui']), text('    '), ...line('Date', blank(10))), p(box('Avis anesthésique avant confirmer décision opératoire', size('10px')))], 313],
)

const patientLeft: Json[] = [
  pLine('Nom', 'patient.lastName'),
  pLine('Prénom', 'patient.firstName'),
  pLine('Date de naissance', 'patient.birthDate'),
  p(text('Sexe : '), ...options(['M', 'F']), text('    '), bold('BMI'), text(' : '), field('patient.bmi')),
  pLine('Etat civil', 'patient.civilStatus'),
  pLine('Médecin traitant', 'gp.name'),
  p(text('AVS n° '), field('patient.ssn')),
  p(text('Assurance '), small('BASE'), text(' : '), field('insurance.name')),
  pLine('No d’assuré', 'insurance.memberNumber'),
  p(text('Assurance '), small('COMPL'), text(' : '), field('insurance.supplementaryName')),
  pLine('No d’assuré', 'insurance.supplementaryNumber'),
  p(text('Classe :    '), ...options(['Privé', 'DP', 'C', 'VIVA'])),
  p(),
  subHeading('Nature de l’affection'),
  p(...options(['Maladie LAMal', 'Accident LAA'])),
  p(...options(['Esthétique', 'Accident LAMal'])),
  p(...line('Date acc.', blank(12)), text('    '), ...line('N° cas', blank(10))),
]

const patientRight: Json[] = [
  pLine('Adresse', 'patient.street'),
  p(text('NP + Lieu : '), field('patient.postalCode'), text(' '), field('patient.city')),
  pLine('Tél. privé', 'patient.phone'),
  pLine('Tél. mobile', 'patient.mobile'),
  pLine('Tél. prof.', 'patient.workPhone'),
  subHeading('Personne de contact'),
  pLine('Nom', 'contact.name'),
  pLine('N° de tél.', 'contact.phone'),
  subHeading('Employeur'),
  pLine('Nom', 'employer.name'),
  pLine('Localité', 'employer.city'),
  pLine('N° de tél.', 'employer.phone'),
]

const ALLERGIES = ['Allergie au LATEX', 'Allergie à l’IODE', 'Autre(s) allergie(s)']
const DRUGS = ['TTT anticoag', 'Aspirine', 'Plavix']
const SEROLOGIES = ['HIV', 'HBs', 'HBc']
const BMR = ['ESBL', 'VRE', 'CRE', 'MRSA']
const INSTALLATIONS = ['DD', 'DV', 'DLG', 'DLD', 'Semi-assise', 'Gyn', 'Uro', 'Autre']

const treatment: Json = columns(
  [[...ALLERGIES.map((label) => p(text(`${label} : `, SMALL), box('oui', SMALL))), p(blank(18)), p(box('Diabète', SMALL)), p(box('Diabète insulino-dépendant', SMALL))], 180],
  [DRUGS.map((label) => p(...ouiNon(label, STRONG), br, ...ouiNon('Arrêt pré-op'))), 230],
  [[...SEROLOGIES.map((label) => p(box(label, SMALL))), p(...line('Autres', blank(10), SMALL))], 130],
  [[p(bold('BMR', SMALL), text(' :', SMALL)), ...BMR.map((label) => p(box(label, SMALL)))], 100],
)

export const surgeryAnnouncement: Form = {
  id: 'surgery-announcement',
  title: 'Annonce opératoire',
  source: 'formulaire Word d’un réseau hospitalier (champs de formulaire, colonnes)',
  content: doc([
    header,
    surgeon,
    section('1', 'PATIENT'),
    columns([patientLeft, 330], [patientRight, 313]),
    section('2', 'HOSPITALISATION'),
    p(...line('Date entrée', blank(14)), text('    '), ...line('Heure d’entrée', blank(6)), text('    Hospitalisation en cours en '), blank(10)),
    p(...line('Date d’opération', blank(14)), text('        '), ...options(['Matin', 'Après-Midi'])),
    p(box('Ambulatoire'), text(' / '), box('Nuit de confort'), text(' / '), box('Hospitalisation'), text('    Durée probable : '), blank(6), text(' jours')),
    section('3', 'BLOC OPERATOIRE'),
    p(bold('Diagnostic : ', RED, size('16px')), blank(48)),
    p(bold('Opération : ', RED, size('16px')), blank(30), text('    Médecin assistant : Dr '), blank(16)),
    pLine('Durée opératoire'),
    pLine('Ampli de brillance'),
    p(text('Rasage souhaité :    '), ...options(['oui', 'non'])),
    section('4', 'MATERIEL NECESSAIRE / INSTRUMENTS+ INSTALLATIONS'),
    pLine('Matériel', blank(60)),
    p(text('Installation demandée : '), ...INSTALLATIONS.flatMap((label, i) => [...(i ? [text('  ')] : []), box(label)])),
    section('5', 'ANESTHESIE'),
    pLine('ATB Prophylaxie'),
    p(...line('Examens pré-hosp', blank(16)), text('    '), ...line('Technique d’anesthésie souhaitée', blank(12))),
    section('6', 'TRAITEMENT'),
    p(text('Insuffisance : '), ...options(['Cardiaque', 'Rénale', 'Respiratoire'])),
    treatment,
    section('7', 'SORTIE'),
    p(...options(['Domicile', 'CTR', 'MPR']), text('    '), ...line('Autre', blank(14)), text('    '), ...line('RDV contrôle Post-op', blank(14))),
    section('8', 'ANNULATION'),
    p(box('Annulation', STRONG, RED), text('    '), ...line('Motif', blank(20)), text('    '), ...line('Nouvelle date de programmation', blank(12))),
    pLine('Remarque', blank(60)),
    section('9', 'DATE ET SIGNATURE'),
    p(...line('Date d’édition du bon', 'date.today'), text('    '), ...line('Signature opérateur', blank(20))),
    p(...line('Date', blank(10)), text('    '), ...line('Visa', blank(10)), text('        '), italic('Instrumentiste', STRONG), text(' date : '), blank(10), text('    Visa '), blank(10)),
  ]),
}
