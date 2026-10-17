// A request for an urgent scheduled admission in acute care, without surgery (a hospital network's
// patient-flow department): the site, the patient and the insurance class, who refers the patient
// and when, the specialty, the diagnosis and history, laboratory results, the living situation and
// the autonomy matrix, the signatures, then the parts reserved to the medical secretariat and to bed
// management. One dense A4 page.
import { bold, br, cell, colour, doc, field, frame, image, italic, line, options, p, pAligned, row, size, STRONG, table, text, U, type CellOptions, type Json } from '../build.ts'
import { LOGO_IMAGE_ID } from '../logo.ts'
import type { Form } from './types.ts'

const SM = size('10px')
const XS = size('8px')
const RED = colour('#e30613')
const TEAL = colour('#009c96')
const GREY = colour('#808080')
const FRAME_GREY = '#bfbfbf'
const BAND = '#d9d9d9'
const GAP = '    '

const t = (value: string, ...marks: Json[]): Json => text(value, SM, ...marks)
const b = (value: string, ...marks: Json[]): Json => bold(value, SM, ...marks)
const opts = (labels: readonly string[], ...marks: Json[]): Json[] => options(labels, SM, ...marks)
// A blank and a labelled line at the form's small size.
const bl = (length: number): Json => text('_'.repeat(length), SM)
const sLine = (label: string, value: Json | string | number | null = null, ...marks: Json[]): Json[] => line(label, typeof value === 'string' ? field(value, SM) : typeof value === 'number' ? bl(value) : (value ?? bl(20)), SM, ...marks)
// A section title (bold, a little larger than the text).
const title = (value: string): Json => p(bold(value, size('13px')))
// A cell without visible borders (layout only).
const plain = (content: Json[] | Json | string, extra: CellOptions = {}): Json => cell(content, { borders: '', ...extra })
// A grey band with a centred bold title (the source's shaded section headers).
const band = (title: string): Json => table(row(cell([pAligned('center', b(title))], { background: BAND, border: BAND })))

const header: Json = table(row(
  plain([p(image(LOGO_IMAGE_ID, 'Logo du Réseau hospitalier du Lac', 90), text(' '), bold('Réseau hospitalier du Lac', XS, TEAL)), p(text('Département des soins', XS), br, text('Flux des patients', XS))], { width: 190 }),
  plain([
    p(bold('Demande d’admission urgente programmée en soins aigus', size('17px'))),
    p(italic('(sans programmation opératoire)', SM, GREY)),
    p(...options(['Site Nord'], STRONG), text(GAP.repeat(6)), ...options(['Site Sud'], STRONG)),
  ]),
))

const patient: Json = table(row(
  plain([
    p(...sLine('Nom', 'patient.lastName', STRONG)),
    p(...sLine('Prénom', 'patient.firstName', STRONG)),
    p(...sLine('Date de naissance', 'patient.birthDate')),
    p(t('Sexe : '), ...opts(['masculin', 'féminin'])),
  ]),
  plain([
    p(...sLine('Adresse', 'patient.street')),
    p(t('Localité : '), field('patient.postalCode', SM), t(' '), field('patient.city', SM)),
    p(...sLine('Téléphone privé', 'patient.phone')),
    p(...sLine('Téléphone mobile', 'patient.mobile')),
  ]),
  plain([
    p(t('Assurance', U), t(' : '), ...opts(['commune'])),
    ...['demi-privée', 'privée'].map((label) => p(t(' '.repeat(19)), ...opts([label]))),
    p(t('Genre : '), ...opts(['maladie'])),
    p(t(' '.repeat(13)), ...opts(['accident'])),
  ], { width: 140 }),
))

const referral: Json = table(row(
  plain([
    p(b('Patient adressé par : '), field('physician.firstName', SM), t(' '), field('physician.lastName', SM)),
    p(...sLine('Téléphone', 'physician.phone', STRONG)),
  ]),
  plain([p(b('Provenance patient : '), bl(14))]),
  plain([
    p(text('Admission', XS, STRONG), text(' souhaitée dès le : ', XS), bl(10)),
    p(text('Délai maximal d’admission : ', XS), bl(10)),
    p(text('Durée de séjour', XS, STRONG), text(' prévue : ', XS), bl(10)),
  ], { width: 220 }),
))

// The specialties, two rows of six (the last one to name by hand), circles in the source.
const SPECIALTIES: readonly (readonly string[])[] = [
  ['Chirurgie', 'Orthopédie', 'Gynécologie', 'Gastroentérologie', 'Imagerie médicale', 'ORL'],
  ['Rhumatologie', 'Médecine', 'Oncologie', 'Neurologie', 'Pédiatrie', '__________'],
]
const specialties: Json = frame([table(...SPECIALTIES.map((labels) => row(...labels.map((label) => plain(opts([label]))))))])

// A framed text area to fill by hand (a grey border, a few empty lines).
const textArea = (lines: number): Json => frame(Array.from({ length: lines }, () => p(t(' '))), { border: FRAME_GREY })

const LAB_TESTS = ['Hb', 'Hémo 1', 'Hémo 2', 'TP', 'TPT', 'NA/K', 'Créat', 'Gly', 'Test Hépat', 'Test Gross', 'RIA/TS']
const laboratory: Json = table(
  row(...LAB_TESTS.map((name) => cell(pAligned('center', text(name, XS))))),
  row(...LAB_TESTS.map(() => cell(pAligned('center', t('○'))))),
)

// The autonomy matrix: six domains, four levels each, for the patient.
const DOMAINS = ['Alimentation', 'Communication', 'Mobilité', 'Hygiène personnelle', 'Orientation/Espace', 'Orientation/Temps']
const LEVELS = ['Aucune difficulté', 'Difficulté légère', 'Difficulté modérée', 'Difficulté grave']
const autonomy: Json = table(
  row(cell(p(), { borders: '' }), ...DOMAINS.map((domain) => cell(pAligned('center', text(domain, XS))))),
  row(cell(t('Patient'), { width: 90 }), ...DOMAINS.map(() => cell(LEVELS.map((level) => p(...options([level], XS)))))),
)

const ouiNon = (question: string): Json => p(t(`${question} `), ...opts(['oui', 'non']))

const signatures: Json = table(row(
  plain([
    p(...sLine('Date', 'date.today')),
    p(b('Signature du médecin externe* : '), bl(22)),
    p(...sLine('Bip / tél.', 'physician.phone', STRONG)),
  ]),
  plain([
    p(...sLine('Date', 20)),
    p(b('Signature du médecin hospitalier : '), bl(20)),
    p(...sLine('Bip / tél.', 20, STRONG)),
  ]),
))

const SECRETARIAT_COLUMNS = ['Date', 'Heure', 'Envoyé par', 'Bon', 'Lettre', 'Dossier', 'Autres']
const TICKED = new Set(['Bon', 'Lettre', 'Dossier'])
const secretariat: Json = table(
  row(cell(p()), ...SECRETARIAT_COLUMNS.map((name) => cell(pAligned('center', text(name, XS))))),
  ...['Réception', 'Transmission'].map((label) => row(cell(text(label, XS)), ...SECRETARIAT_COLUMNS.map((name) => cell(TICKED.has(name) ? pAligned('center', t('○')) : p())))),
)

const convocation: Json = table(row(
  plain([p(t(' ')), p(...sLine('Date d’entrée', 16)), p(...sLine('Heure de convocation', 12))]),
  plain([
    p(...options(['Gestion informatisée', 'Courrier', 'Téléphone'], XS)),
    p(...sLine('Copies', 16)),
    p(...sLine('Fait le', 10), t('  '), ...sLine('Signature', 10)),
  ]),
  plain([
    p(t('UPCI  '), ...opts(['oui', 'non'])),
    p(t('SSL  '), ...opts(['oui', 'non'])),
    p(text('(oui si limitation d’activité avérée)', XS, STRONG)),
  ], { width: 170 }),
))

const footer: Json = table(row(
  plain(text('MODL - 0000-000', XS)),
  plain(pAligned('center', text('Page 1', XS))),
  plain(pAligned('right', text('10.2024', XS))),
))

export const urgentAdmission: Form = {
  id: 'urgent-admission',
  title: 'Demande d’admission urgente programmée en soins aigus',
  source: 'formulaire PDF d’un réseau hospitalier (une page A4 très dense)',
  page: { widthMm: 210, heightMm: 297, marginMm: 8 },
  content: doc([
    header,
    pAligned('right', ...sLine('N° patient', 'patient.id', STRONG)),
    title('Patient'),
    patient,
    referral,
    p(t('Contact téléphonique avec un médecin du Réseau hospitalier du Lac demandé'), t(GAP), ...opts(['OUI', 'NON', 'OBLIGATOIRE'])),
    specialties,
    title('Diagnostic principal / problème(s) actif(s) / motif(s) d’hospitalisation'),
    textArea(3),
    title('Antécédents / Comorbidités'),
    textArea(3),
    p(...sLine('Mesures additionnelles de prévention de l’infection', 28), t(GAP), t('Allergie : '), ...opts(['oui']), t(' '), bl(20), t(GAP), ...opts(['non'])),
    p(b('Laboratoire :', U)),
    laboratory,
    p(...sLine('Autres laboratoire', 90)),
    title('Situation de vie avant l’épisode de soins'),
    p(...opts(['vit seul(e)', 'en couple', 'vit avec des proches', 'vit en home']), t(' '), bl(30)),
    p(...opts(['appartement protégé', 'logement', 'maison individuelle'])),
    ouiNon('Le patient a-t-il des limitations d’activités dans son environnement actuel ?'),
    autonomy,
    ouiNon('Son conjoint a-t-il des limitations d’activités dans son environnement actuel ?'),
    title('Mesures de maintien à domicile existantes'),
    p(...opts(['Soins', 'Ménage', 'Repas', 'Autres']), t(' '), bl(30)),
    signatures,
    p(bold('*Formulaire à signer et à transmettre par mail à gestion.lits@example.org', SM, RED)),
    band('RESERVE AU SECRETARIAT MEDICAL DU RÉSEAU'),
    p(...sLine('Contact téléphonique le', 16), t(GAP), t('Le médecin externe accepte de nous fournir des documents concernant le patient '), ...opts(['oui', 'non'])),
    secretariat,
    band('CONVOCATION - RESERVE GESTION DES LITS'),
    convocation,
    footer,
  ]),
}
