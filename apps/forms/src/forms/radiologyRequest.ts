// A radiology examination request (a university hospital's diagnostic department): patient and
// insurance on the left, the examination, clinical information and risks on the right, framed.
import { blank, bold, cell, colour, doc, field, frame, h, image, line, options, p, pAligned, pLine, row, small, table, text, type Json } from '../build.ts'
import { LOGO_IMAGE_ID } from '../logo.ts'
import type { Form } from './types.ts'

const RED = colour('#d0021b')
const NO_BORDER = '#ffffff'
const yesNo = (label: string, yesRequiresDetail = false): Json => p(text(`${label} `), ...options(['OUI' + (yesRequiresDetail ? ' *' : '')], ...(yesRequiresDetail ? [RED] : [])), text('    '), ...options(['NON']))

const patient: Json[] = [
  h(2, text('DEMANDE D’EXAMEN RADIOLOGIQUE')),
  h(3, text('Patient')),
  pLine('Nom', 'patient.lastName'),
  pLine('Prénom', 'patient.firstName'),
  p(...line('Sexe', 'patient.sex'), text('    '), ...line('Date de naissance', 'patient.birthDate')),
  p(...line('Adresse', 'patient.street'), text(', '), field('patient.postalCode'), text(' '), field('patient.city')),
  p(...line('Tél.', 'patient.phone'), text('    '), ...line('Portable', 'patient.mobile')),
  h(3, ...options(['Maladie'])),
  pLine('Nom assurance maladie', 'insurance.name'),
  pLine('N° carte d’assurance UE', 'insurance.cardNumber'),
  h(3, ...options(['Accident LAMal', 'Accident LAA'])),
  pLine('Nom assurance accident', 'insurance.accidentName'),
  pLine('Date de l’accident'),
  pLine('N° de sinistre'),
  pLine('AI / N° AVS', 'patient.ssn'),
  p(),
  frame([p(bold('Médecin prescripteur')), p(field('physician.title'), text(' '), field('physician.firstName'), text(' '), field('physician.lastName')), p(text('Signature et timbre obligatoires :')), p(), p()]),
]

const request: Json[] = [
  p(...line('Lieu et date', 'physician.city'), text(', '), field('date.today')),
  frame([p(bold('Examen demandé'), text(' :')), p(), p(), p()]),
  p(),
  frame([p(bold('Renseignements cliniques :')), p(), p(), p(), p(text('Autres particularités :')), p()]),
  p(),
  p(text('Allergies : '), ...options(['OUI *'], RED), text('    '), ...options(['NON'])),
  p(small('(* Si oui, merci de préciser : Date, Produit, Symptôme, Sévérité)', RED)),
  p(blank(70)),
  p(blank(70)),
  p(blank(70)),
  pLine('Poids', 'patient.weight'),
  p(text('Pour les femmes : Grossesse ou possibilité de l’être ? '), ...options(['OUI *'], RED), text('    '), ...options(['NON'])),
  p(small('(* Si oui, merci de préciser le nombre de semaines) : ', RED), blank(20)),
  p(...line('Créatinine / eGFR'), text(' le '), blank(16)),
  yesNo('Anticoagulation :'),
  yesNo('Pacemaker / Défibrillateur :', true),
  yesNo('Implants / Stimulateur / Shunt réglable / Autres matériels :', true),
  p(small('* Merci de renseigner le modèle : ', RED), blank(36)),
  frame([p(bold('Transmission des résultats :')), p(text('Copie des résultats à : '), blank(36))]),
]

export const radiologyRequest: Form = {
  id: 'radiology-request',
  title: 'Demande d’examen radiologique',
  source: 'formulaire PDF d’un service hospitalier de radiologie (paysage, deux colonnes)',
  page: { widthMm: 297, heightMm: 210, marginMm: 10 },
  content: doc([
    p(image(LOGO_IMAGE_ID, 'Logo de l’Hôpital universitaire de Sampleville', 160)),
    p(text('Département diagnostique')),
    p(text('Service de radiologie / Service de neuroradiologie')),
    table(row(cell(patient, { border: NO_BORDER }), cell(request, { border: NO_BORDER }))),
    pAligned('center', small('Hôpital universitaire de Sampleville – Rue de l’Exemple 1 – 0000 Sampleville – radiologie@example.org')),
  ]),
}
