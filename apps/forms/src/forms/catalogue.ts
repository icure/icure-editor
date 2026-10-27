import type { PageFormat } from '@icure/editor'

// A document in ProseMirror's JSON (`Node.toJSON()`).
export type Json = Readonly<Record<string, unknown>>

// A form of the example: its id (the URL), its title, its source document and its content.
export interface Form {
  readonly id: string
  readonly title: string
  // What the form replicates (a kind of document, not its publisher).
  readonly source: string
  readonly content: Json
  // The sheet (default A4 portrait, 20 mm margin).
  readonly page?: PageFormat
}

// The forms, in the order of the list. Their content is not in the repository: each one is
// `data/<id>.json` (gitignored), and a form whose file is missing is left out.
const CATALOGUE: readonly Omit<Form, 'content'>[] = [
  { id: 'surgery-announcement', title: 'Annonce opératoire', source: 'formulaire Word d’un réseau hospitalier (champs de formulaire, colonnes)' },
  { id: 'theatre-admission', title: 'Bon d’admission pour le bloc opératoire', source: 'formulaire Word d’une clinique privée (champs de formulaire, colonnes)', page: { widthMm: 210, heightMm: 297, marginMm: 15 } },
  { id: 'surgical-admission', title: 'Demande d’admission bloc général – gynécologie', source: 'formulaire PDF remplissable d’une clinique (deux pages)', page: { widthMm: 210, heightMm: 297, marginMm: 10 } },
  { id: 'urgent-admission', title: 'Demande d’admission urgente programmée en soins aigus', source: 'formulaire PDF d’un réseau hospitalier (une page A4 très dense)', page: { widthMm: 210, heightMm: 297, marginMm: 8 } },
  { id: 'radiology-request', title: 'Demande d’examen radiologique', source: 'formulaire PDF d’un service hospitalier de radiologie (paysage, deux colonnes)', page: { widthMm: 297, heightMm: 210, marginMm: 10 } },
  { id: 'imaging-request', title: 'Bon d’examen d’imagerie médicale', source: 'bon d’examen papier scanné d’un centre d’imagerie (une page)', page: { widthMm: 210, heightMm: 297, marginMm: 10 } },
  { id: 'lab-request', title: 'Fiche de demande d’analyses – laboratoire général', source: 'formulaire LibreOffice d’un laboratoire d’analyses médicales (recto verso, cases à cocher)', page: { widthMm: 210, heightMm: 297, marginMm: 10 } },
  { id: 'basophil-activation-test', title: 'Demande d’analyse – test d’activation des basophiles', source: 'formulaire LibreOffice d’un laboratoire d’allergologie (deux pages, cases à cocher)', page: { widthMm: 210, heightMm: 297, marginMm: 10 } },
  { id: 'compression-prescription', title: 'Prescription médicale – bas de compression', source: 'bloc de prescription PDF d’un fabricant de bas de compression (A5, deux pages)', page: { widthMm: 148, heightMm: 210, marginMm: 10 } },
  { id: 'hip-prosthesis-order', title: 'Bon de commande – prothèse de hanche sur mesure', source: 'modèle de traitement de texte d’un fabricant de prothèses (bon de commande, une page)' },
]

// The forms whose content was found, given the contents by id.
export const formsWith = (contents: Readonly<Record<string, Json>>): readonly Form[] => CATALOGUE.flatMap((entry) => (contents[entry.id] ? [{ ...entry, content: contents[entry.id]! }] : []))

// The id of a content file, from its path (`…/data/<id>.json`).
export const idOfFile = (path: string): string => path.replace(/^.*\//, '').replace(/\.json$/, '')
