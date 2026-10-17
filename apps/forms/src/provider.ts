// The example's in-memory data provider: one fictitious patient, physician, insurer and contact,
// shared by every form; a placeholder logo. Nothing here is a real person or institution.
import type { EditorDataProvider, FieldDescriptor } from '@icure/editor'

import { LOGO_DATA_URI, LOGO_IMAGE_ID } from './logo.ts'

// A fixed day, so the forms (and their tests) read the same every day.
export const FORMS_DAY = new Date(2026, 9, 14)
const LATENCY_MS = 20

interface FieldEntry {
  readonly label: string
  readonly value: string
}

// The field catalogue, by group: label (shown by "Insert field") and fictitious value.
const CATALOGUE: Readonly<Record<string, Readonly<Record<string, FieldEntry>>>> = {
  Patient: {
    'patient.lastName': { label: 'Nom', value: 'Exemple' },
    'patient.firstName': { label: 'Prénom', value: 'Camille' },
    'patient.birthDate': { label: 'Date de naissance', value: '03.04.1980' },
    'patient.sex': { label: 'Sexe', value: 'F' },
    'patient.street': { label: 'Adresse', value: 'Rue des Exemples 12' },
    'patient.postalCode': { label: 'NPA', value: '0000' },
    'patient.city': { label: 'Localité', value: 'Sampleville' },
    'patient.phone': { label: 'Téléphone privé', value: '+00 00 000 00 01' },
    'patient.mobile': { label: 'Téléphone mobile', value: '+00 00 000 00 02' },
    'patient.workPhone': { label: 'Téléphone professionnel', value: '+00 00 000 00 03' },
    'patient.email': { label: 'Courriel', value: 'camille.exemple@example.org' },
    'patient.civilStatus': { label: 'État civil', value: 'Mariée' },
    'patient.nationality': { label: 'Nationalité', value: 'Exemplaise' },
    'patient.language': { label: 'Langue', value: 'Français' },
    'patient.ssn': { label: 'N° AVS', value: '000.0000.0000.00' },
    'patient.id': { label: 'N° patient', value: 'P-000042' },
    'patient.weight': { label: 'Poids (kg)', value: '64' },
    'patient.height': { label: 'Taille (cm)', value: '168' },
    'patient.bmi': { label: 'IMC', value: '22,7' },
  },
  Assurance: {
    'insurance.name': { label: 'Assurance de base', value: 'Caisse Exemple' },
    'insurance.memberNumber': { label: 'N° d’assuré', value: 'A-000123' },
    'insurance.cardNumber': { label: 'N° de carte', value: '80000000000000000000' },
    'insurance.supplementaryName': { label: 'Assurance complémentaire', value: 'Complémentaire Exemple' },
    'insurance.supplementaryNumber': { label: 'N° d’assuré complémentaire', value: 'C-000456' },
    'insurance.accidentName': { label: 'Assurance accident', value: 'Accident Exemple' },
  },
  Médecin: {
    'physician.title': { label: 'Titre', value: 'Dr méd.' },
    'physician.firstName': { label: 'Prénom', value: 'Dominique' },
    'physician.lastName': { label: 'Nom', value: 'Modèle' },
    'physician.specialty': { label: 'Discipline', value: 'Chirurgie orthopédique' },
    'physician.practice': { label: 'Cabinet', value: 'Cabinet du Parc' },
    'physician.addressComplement': { label: 'Complément d’adresse', value: 'Bâtiment B' },
    'physician.street': { label: 'Adresse', value: 'Avenue du Modèle 5' },
    'physician.postalCode': { label: 'NPA', value: '0001' },
    'physician.city': { label: 'Localité', value: 'Sampleville' },
    'physician.phone': { label: 'Téléphone', value: '+00 00 000 10 00' },
    'physician.email': { label: 'Courriel', value: 'cabinet@example.org' },
    'physician.rcc': { label: 'N° RCC', value: 'Z000000' },
    'physician.gln': { label: 'GLN', value: '7600000000000' },
  },
  Entourage: {
    'gp.name': { label: 'Médecin traitant', value: 'Dr Alex Généraliste' },
    'contact.name': { label: 'Personne de contact', value: 'Sam Exemple' },
    'contact.phone': { label: 'Téléphone du contact', value: '+00 00 000 00 09' },
    'employer.name': { label: 'Employeur', value: 'Atelier Fictif SA' },
    'employer.city': { label: 'Localité de l’employeur', value: 'Sampleville' },
    'employer.phone': { label: 'Téléphone de l’employeur', value: '+00 00 000 20 00' },
  },
  Document: {
    'date.today': { label: 'Date du jour', value: '14.10.2026' },
  },
}

// The values by key (the e2e tests read them from here, never retyped).
export const FIELD_VALUES: Readonly<Record<string, string>> = Object.fromEntries(Object.values(CATALOGUE).flatMap((group) => Object.entries(group).map(([key, entry]) => [key, entry.value])))

const FIELDS: readonly FieldDescriptor[] = Object.entries(CATALOGUE).flatMap(([group, entries]) => Object.entries(entries).map(([key, entry]) => ({ key, label: entry.label, group })))

const later = <T,>(value: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS))

export function createFormsProvider(): EditorDataProvider {
  return {
    listFields: () => FIELDS,
    resolveField: (key) => later(FIELD_VALUES[key]),
    images: { resolve: (id) => (id === LOGO_IMAGE_ID ? { src: LOGO_DATA_URI } : null) },
  }
}
