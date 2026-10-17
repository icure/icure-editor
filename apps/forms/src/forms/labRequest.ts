// A general laboratory request form (two pages): the header with the address window (patient on
// the left, requesting physician on the right), the legend of the sampling materials, then every
// analysis with its box and its material number, section by section, and the consent to the tests.
import { blank, bold, box, cell, colour, doc, field, image, line, options, p, pAligned, row, size, STRONG, table, text, type CellOptions, type Json } from '../build.ts'
import { LOGO_IMAGE_ID } from '../logo.ts'
import type { Form } from './types.ts'

const GREEN = '#007665'
const DARK_GREEN = colour('#1e6a39')
const RED_LINE = '#e8423f'
const RED = colour('#e8423f')
const WHITE = colour('#ffffff')
const T = size('6.5pt')
const plain: CellOptions = { borders: '' }

// The sampling materials: number, description, tube colour (null: none).
const LEGEND: readonly (readonly [number, string, string | null])[] = [
  [1, 'Monovette rouge EDTA 2.7 ml', '#ff6d6d'],
  [2, 'Monovette blanche 4.5 / 7.5 ml', null],
  [3, 'Monovette verte Cit. De Na 3ml', '#5eb91e'],
  [4, 'Monovette violette Citrates de Na 2 ml', '#e276ea'],
  [5, 'Monovette jaune Flu. De Na 2,7 ml', '#ffdbb6'],
  [6, 'Monovette orange Hép. Li 2.7 / 7.5 ml', '#ff8000'],
  [8, 'Urines de 24h', '#ffbf00'],
  [9, 'V-Monovette urine jaune 10 ml', '#ffff00'],
  [10, 'Monovette rouge EDTA 7.5 ml', '#ff6d6d'],
  [11, 'Tube stérile (LCR min 1 ml)', '#dddddd'],
  [12, 'Urines de 24h + HCL 10 %', '#ffff00'],
  [20, 'Selles', '#ffaa95'],
  [40, 'Protéger de la lumière', null],
  [50, 'Contacter le laboratoire', null],
  [60, 'Centrifuger/décanter', null],
  [61, 'Centrifuger/décanter + congeler (-20°C)', null],
]
const MATERIAL_COLOUR: Readonly<Record<number, string | null>> = Object.fromEntries(LEGEND.map(([n, , c]) => [n, c]))

// An entry of a column: an analysis [label, material] (a box, the label, the material number on its
// tube colour), a section title (on the green band, or in green letters), a note, free content, or
// an empty line (null).
type Entry = readonly [string, string?] | { readonly title: string; readonly band?: boolean } | { readonly note: string; readonly strong?: boolean } | { readonly inline: readonly Json[] } | null
const band = (title: string): Entry => ({ title, band: true })
const sub = (title: string): Entry => ({ title })
const note = (value: string, strong = false): Entry => ({ note: value, strong })

// A label; '(!)' stands for the source's warning sign (red).
const labelNodes = (label: string): Json[] => label.split('(!)').flatMap((part, i) => [...(i ? [bold('(!)', RED, T)] : []), ...(part ? [text(part, T)] : [])])
const materialCell = (material: string | undefined): Json => {
  const colour = material ? MATERIAL_COLOUR[Number(material.split('+')[0])] : null
  return cell([pAligned('center', ...(material ? [text(material, T)] : []))], { ...plain, ...(colour ? { background: colour } : {}) })
}
// The tables have equal columns (fixed layout): an entry spans four of them, three for its label
// and one for its material.
const LABEL_SPAN = 3
const ENTRY_SPAN = LABEL_SPAN + 1
const entryCells = (entry: Entry): Json[] => {
  if (entry === null) return [cell([p()], { ...plain, colspan: ENTRY_SPAN })]
  if ('title' in entry) return [cell([p(bold(entry.title, T, ...(entry.band ? [WHITE] : [DARK_GREEN])))], { ...plain, colspan: ENTRY_SPAN, ...(entry.band ? { background: GREEN } : {}) })]
  if ('note' in entry) return [cell([p(text(entry.note, T, ...(entry.strong ? [STRONG] : [])))], { ...plain, colspan: ENTRY_SPAN })]
  if ('inline' in entry) return [cell([p(...entry.inline)], { ...plain, colspan: ENTRY_SPAN })]
  const [label, material] = entry
  return [cell([p(text('○ ', T), ...labelNodes(label))], { ...plain, colspan: LABEL_SPAN }), materialCell(material)]
}
// Columns of entries side by side: row i holds the i-th entry of every column.
const zipColumns = (columns: readonly (readonly Entry[])[]): Json[][] => Array.from({ length: Math.max(...columns.map((c) => c.length)) }, (_, i) => columns.flatMap((c) => entryCells(c[i] ?? null)))
// A band across `columns` columns of entries.
const bandCell = (title: string, columns: number): Json => cell([pAligned('center', bold(title, T, WHITE))], { ...plain, colspan: columns * ENTRY_SPAN, background: GREEN })
// A band alone in its table.
const titleBand = (title: string): Json => cell([pAligned('center', bold(title, T, WHITE))], { ...plain, background: GREEN })
// A page cannot split a table: a long grid is a run of tables of a few rows each, which flow from
// page to page.
const CHUNK_ROWS = 6
const chunked = (rows: readonly Json[][]): Json[] => Array.from({ length: Math.ceil(rows.length / CHUNK_ROWS) }, (_, i) => table(...rows.slice(i * CHUNK_ROWS, (i + 1) * CHUNK_ROWS).map((cells) => row(...cells))))

// ---- Page 1 --------------------------------------------------------------------------------------

const HEMATOLOGY: readonly Entry[] = [
  band('BILAN DE BASE'),
  ['Formule sanguine simple', '1'], ['Formule sanguine complète', '1'], ['Répartition manuelle', '1'], ['Réticulocytes', '1'], ['Vitesse de sédimentation', '4'],
  band('HEMATOLOGIE SPECIALE'),
  ['Erythropoïétine (EPO)°', '2'], ['Haptoglobine', '2'], ['Bêta-2-microglobuline', '2'], ['Coombs direct', '10'], ['Agglutinines froides°', '10+50'], ['Electrophorèse Hb°', '1'], ['Vitamine B12', '2+40'], ['Acide folique', '2+40'],
  ['Malaria dépistage', '1'], note('(frottis + gte épaisse + test rapide)'), ['Malaria suivi (parasitémie)', '1'], ['BCR/ABL°', '10'], ['JAK2°', '10'],
  null,
  band('CYTOFLUOROMETRIE'),
  null,
  ['CD3, 4, 8, 19, 16/56', '1'], ['HLA B27 (!)', '1'],
  null,
  band('HEMOSTASE'),
  null,
  ['Crase (Thr, TP, aPTT, Fibri)', '3+1'], ['TP (Quick)', '3'], ['TP capillaire (Quick)', '50'], ['aPTT', '3'], ['Fibrinogène', '3'], ['Temps de thrombine°', '3'], ['D-Dimères', '3'],
  ['Fonction plaquettaire (PFA) (Epinéphrine/ADP)', '50'], ['Thromboélastogramme (ROTEM)', '3'], ['Thrombophilie° (!) 2x (Bilan procoagulant)', '3'], ['Hémochromatose° (!)', '10+50'], ['Anti-PF4-héparine° (+ score 4T)', '3+50'],
  note('Contrôle de l’activité anti-Xa', true), note('Prise de sang 3h-5h après injection'),
  ['HBPM (Clexane/Fraxiparine)®', '3'], ['HNF (hép non fractionnée)', '3'], ['Xarelto® / Rivaroxaban®', '3'],
]

const CHEMISTRY_1: readonly Entry[] = [
  band('ELECTROLYTES'),
  ['Sodium', '2'], ['Potassium', '2'], ['Chlore', '2'], ['Calcium total', '2'], ['Calcium corrigé', '2'], ['Calcium ionisé', '6+50'], ['Phosphore', '2'], ['Magnésium sérique', '2'], ['Magnésium érythrocytaire°', '1'], ['Bicarbonates', '2'], ['Ammoniac', '1+50'], ['Osmolalité', '2'],
  band('METABOLITES'),
  ['Acide urique', '2'], ['Glucose', '2'], ['Urée', '2'], ['Créatinine (y.c. eGFR)', '2'], ['Cystatine C (y.c. eGFR) °', '2'], ['Bilirubine totale', '2+40'], ['Bilirubine directe', '2+40'], ['Bili totale néonatale', '2+40'],
  ['Cholestérol total', '2'], ['Triglycérides', '2'], ['HDL Cholestérol', '2'], ['LDL Cholestérol', '2'], ['Lipoprotéine (a)°', '2'], ['Fer sérique', '2'], ['Ferritine', '2'], ['Transferrine', '2'], ['Coeff. saturation transfer.', '2'], ['Récept. sol. transferrine°', '2'],
  ['Protéine C réactive (CRP)', '2'], ['Procalcitonine (PCT)', '2'], ['CDT (Electroph. capillaire)', '2'], ['Chrome°', '10'], ['Cobalt°', '10'], ['Nickel°', '6'],
  band('DIVERS'),
  ['Lithium°', '2'], ['Vancomycine (taux résiduel)', '2+60'], ['Facteur rhumatoïde', '2'], ['25-OH-Vitamine D', '2+40'], ['Acide méthylmalonique°', '2'], ['6-TGN°', '50'],
  { inline: [bold('(!) ', RED, T), text('Signature du médecin au verso', T)] },
]

const CHEMISTRY_2: readonly Entry[] = [
  band('ENZYMES'),
  ['ASAT', '2'], ['ALAT', '2'], ['Phosphatase alcaline', '2'], ['g-GT', '2'], ['Amylases totales', '2'], ['Amylase pancréatique', '2'], ['Lipase', '2'], ['LDH', '2'], ['Tryptase°', '2'], ['ACE (enz de conv. angiotensine)', '2'],
  band('MARQUEURS CARDIAQUES'),
  ['CK totale', '2'], ['CK-MB    ○ CK-MB masse', '2'], ['BNP (1)    ○ ProBNP', '2'], ['Troponine I ultra sensible', '2'], ['Myoglobine°', '2'], ['Homocystéine', '1+61'], ['Digoxine', '2'],
  band('DIABETOLOGIE'),
  ['Glucose tube fluoré', '5'], ['Glycémie à jeun', '2'], ['Glucose post-prandial', '2'], ['Hémoglobine A1c', '1'], ['Lactate', '5'], ['Lactate (en urgence par gazométrie)', '6+50'], ['C-peptide°', '2+61'], ['Insuline°', '2+61'],
  band('PROTEINES'),
  null,
  ['Albumine', '2'], ['Préalbumine', '2'], ['Protéines totales', '2'], ['Electrophorèse des protéines', '2'], ['Immunofixation', '2'], ['Ch. lég. Kappa/Lambda libres', '2'], ['IgA', '2'], ['IgG    ○ IgG sous-classes°', '2'], ['IgM', '2'],
  ['Complément C3+C4°', '2'], ['Céruloplasmine°', '2'], ['Alpha-1-antitrypsine°', '2'], ['Interleukine 2 (IL2)°', '2'], ['Recepteur IL2°', '2'],
  note('° analyses sous-traitées / # non accréditées'),
]

const HORMONOLOGY: readonly Entry[] = [
  band('THYROIDE'),
  ['TSH', '2'], ['T4 libre', '2'], ['T4 totale', '2'], ['T3 libre', '2'], ['T3 totale', '2'], ['Ac. anti-récepteurs TSH°', '2'], ['Ac. anti-thyroïdien', '2'], ['Thyréoglobuline°', '2'],
  band('HORMONES'),
  ['b-HCG (grossesse)', '2'], ['FSH', '2'], ['LH', '2'], ['Oestradiol', '2'], ['Progestérone', '2'], ['Prolactine', '2'], ['Testostérone totale°', '2'], ['Testostérone libre°', '2'], ['DHEA-s°', '2'], ['SHBG°', '2'],
  ['ACTH°', '1+50'], ['Aldostérone°', '1+61'], ['Rénine°', '1+61'], ['Androstènedione°', '2'], ['Cortisol basal', '2'], ['Test au Synactène', '2+50'], ['Gastrine°', '2+61'], ['Parathormone (PTH)', '2+61'], ['b-Crosslaps°', '1+60'], note('(Telopeptide-C)'),
  null,
  band('GAZ DU SANG'),
  null,
  ['Gazométrie veineuse', '6+50'],
  null,
  band('TEST FONCTIONNELS'),
  ['Hyperglycémie provoquée', '50'], note('75g glucose, mesure à 0h, 1h et 2h'),
  band('SELLES'),
  ['FIT – Fecal Immuno Test'], note('(Recherche de sang dans les selles)'), note('Voir formulaire 11'),
  null,
  band('AUTRE DEMANDE'),
  { inline: [text('○ ', T), blank(24)] },
]

const legendRows = Array.from({ length: 4 }, (_, r) => row(...[0, 1, 2, 3].flatMap((c) => {
  const [n, label, bg] = LEGEND[c * 4 + r]!
  return [cell([pAligned('center', text(String(n), T))], { ...plain, ...(bg ? { background: bg } : {}) }), cell([p(text(label, T, DARK_GREEN))], { ...plain, colspan: LABEL_SPAN })]
})))

const page1Grid = chunked([[bandCell('HEMATOLOGIE', 1), bandCell('CHIMIE', 2), bandCell('HORMONOLOGIE', 1)], ...zipColumns([HEMATOLOGY, CHEMISTRY_1, CHEMISTRY_2, HORMONOLOGY])])

const redLabel = (value: string): Json => text(value, RED, T)
const frameOpts: CellOptions = { border: RED_LINE }
const header = table(row(
  cell([
    p(image(LOGO_IMAGE_ID, 'Logo du Laboratoire de la Fontaine', 160)),
    p(bold('Laboratoire de la Fontaine', colour(GREEN), size('14px'))),
    p(text('ISO 15189', T)),
    p(text('Dre Alix Exemple, médecin FMH, FAMH', DARK_GREEN, T)),
    p(text('Dre Noa Modèle, FAMH', DARK_GREEN, T)),
  ], plain),
  cell([p(), pAligned('center', bold('Réservé au laboratoire', T)), p(), p()], { border: GREEN }),
  cell([
    p(bold('FORMULAIRE 1', WHITE, size('12px'))),
    p(text('Rue de la Fontaine 1    Tél. +00 00 000 00 00', WHITE, T)),
    p(text('0000 Sampleville    Fax +00 00 000 00 00', WHITE, T)),
    p(text('laboratoire@example.org', WHITE, T)),
  ], { ...plain, background: GREEN }),
))

const patientWindow: Json[] = [
  p(redLabel('Nom  '), field('patient.lastName', T)),
  p(redLabel('Prénom  '), field('patient.firstName', T)),
  p(redLabel('Date de naissance  '), field('patient.birthDate', T)),
  p(redLabel('Sexe  '), ...options(['F', 'M'], RED, T)),
  p(redLabel('Adresse  '), field('patient.street', T)),
  p(redLabel('NPA  '), field('patient.postalCode', T), text('    ', T), redLabel('Ville  '), field('patient.city', T)),
]
const information: Json[] = [
  pAligned('center', bold('Renseignements', DARK_GREEN, size('10pt'))),
  p(bold('○ URGENT', DARK_GREEN, T)),
  p(bold('Opéré le ', DARK_GREEN, T), blank(8), bold(' à ', DARK_GREEN, T), blank(8)),
  ...['Patient sous anticoagulant', 'Patient sous perfusion', 'Patient transfusé'].map((s) => p(box(s, DARK_GREEN, T))),
  pAligned('center', bold('Facturation à :', DARK_GREEN, size('9pt'))),
  ...['Patient', 'Assurance maladie', 'Assurance accident'].map((s) => p(box(s, DARK_GREEN, T))),
  p(...line('Assurance', field('insurance.name', T), DARK_GREEN, T)),
  p(...line('N° assuré', field('insurance.cardNumber', T), DARK_GREEN, T)),
  p(),
  p(text('Visa laboratoire étiquette  ', DARK_GREEN, T), blank(10)),
]
const addressWindow = table(
  row(
    cell(patientWindow, frameOpts),
    cell(information, { ...plain, rowspan: 3 }),
    cell([p(text('Médecin demandeur', T)), p(field('physician.title', T)), p(field('physician.firstName', T), text(' ', T), field('physician.lastName', T)), p(field('physician.street', T)), p(field('physician.postalCode', T), text(' ', T), field('physician.city', T))], frameOpts),
  ),
  row(cell([p()], plain), cell([p(text('Copie(s)', T)), p(), p()], frameOpts)),
  row(
    cell([p(redLabel('Date de prélèvement  '), blank(10)), p(redLabel('Heure de prélèvement  '), blank(6)), p(redLabel('Initiales du préleveur  '), blank(12))], plain),
    cell([p(bold('Renseignement Clinique', T)), p(), p(), p()], frameOpts),
  ),
)

// ---- Page 2 --------------------------------------------------------------------------------------

// The left block: sections across both of its sub-columns, or two sub-columns side by side.
type LeftBlock = { readonly band: string; readonly green?: boolean } | { readonly pair: readonly [readonly Entry[], readonly Entry[]] }
const TUMOUR_MARKERS: readonly Entry[] = [
  ['AFP', '2'], ['b-2-microgl.', '2'], ['b-HCG (marqueur)°', '2'], ['CEA', '2'], ['CA 125', '2'], ['CA 15-3', '2'], ['CA 19-9', '2'], ['CA 72-4°', '2'], ['Calcitonine°¹', '2'],
  ['Gastrine°¹', '2'], ['NSE°¹', '2'], ['Paraprotéines°', '2'], ['Parathormone', '2'], ['PSA totale', '2'], ['PSA libre', '2'], ['SCC°', '2'], ['Thyréoglobuline°', '2'], ['TPA°', '2'],
]
const LEFT: readonly LeftBlock[] = [
  { band: 'MARQUEURS TUMORAUX' },
  { pair: [TUMOUR_MARKERS.slice(0, 9), [...TUMOUR_MARKERS.slice(9), note('(¹= sérum congelé)')]] },
  { band: 'IMMUNOLOGIE' },
  { band: 'AUTO-ANTICORPS' },
  {
    pair: [
      [
        ['Ac anti-CCP', '2'], ['Ac anti-cellules pariétale PCA°', '2'], note('(Ac anti-muqueuse gastrique)'), ['Ac anti-épiderme°', '2'], ['Ac anti-facteur intrinsèque°', '2'], ['Ac anti-muscle strié°', '2'], ['Ac anti-récep. Acéthylchol.°', '2'],
        ['Ac anti-LKM°', '2'], ['Ac anti-microsome (anti-TPO)', '2'], ['Ac anti-mitochondries', '2'], ['Ac anti-S. Cerevisiae (ASCA)°', '2'], ['Ac anti-glandes salivaires°', '2'], ['Ac anti-M2', '2'],
        sub('DIABETE'),
        ['Ac anti-GAD°', '2'], ['Ac anti-insuline°', '2'], ['Ac anti-ilôts de Langerhans°', '2'], ['Ac anti-IA2°', '2'],
        sub('LUPUS ANTICOAGULANTS'),
        ['Ac. anti-phospholipides°', '3'], ['Anti-cardiolipines (IgG/M)°', '3'], ['B2-Glycoprot.-1 (IgG/M)°', '3'], ['Anticoagulant lupique°', '3'],
        band('MALADIE COELIAQUE'),
        ['IgA totale', '2'], ['Transglutaminase IgA/IgG', '2'], ['Ac anti-gliadine IgA/IgG', '2'],
      ],
      [
        sub('ANTICORPS ANTI-NUCLEAIRES'),
        ['Screening ANA (FAN)', '2'], ['Ac anti-DsDNA', '2'], ['Profil ENA', '2'], ['Ac anti-SM', '2'], ['Ac anti-U1RNP', '2'], ['Ac anti-RNP70', '2'], ['Ac anti-SSA/Ro', '2'], ['Ac anti-SSB/La', '2'], ['Ac anti-Scl-70', '2'],
        sub('ANTICORPS ANTI-NEUTROPHILES'),
        ['Screening ANCA', '2'], ['Ac anti-PR3 (cANCA)', '2'], ['Ac anti-MPO (pANCA)', '2'],
        sub('ANTICORPS AMSK'),
        ['Ac anti-muscle lisse°', '2'], ['Ac anti-mitochondrie', '2'], ['Ac anti-cel. pariétales°', '2'], note('(Ac anti-muqueuse gastrique)'),
        band('ALLERGOLOGIE'),
        ['IgE totale', '2'], ['RX1 (screening inhalation saisonnier)°', '2'], ['RX2 (screening inhalation perannuel)°', '2'], ['Tryptase°', '2'],
        note('Autres allergènes : formulaire spécifique ou sous autre demande'),
      ],
    ],
  },
  { band: 'URINES' },
  { pair: [[['Examen complet (Stix + sédiment) 10ml', '9']], []] },
  { band: 'CHIMIE : SPOT URINAIRE' },
  { pair: [[['Glucose', '9'], ['Créatinine', '9'], ['Microalbumine', '9'], ['Protéines', '9'], ['Osmolalité', '9']], [['Acide urique', '9'], ['Amylases', '9'], ['Sodium', '9'], ['Potassium', '9'], ['Calcium', '9']]] },
  { band: 'CHIMIE : URINES DE 24 HEURES' },
  {
    pair: [
      [
        { inline: [redLabel('Poids  '), field('patient.weight', T), redLabel(' kg')] },
        { inline: [redLabel('Taille  '), field('patient.height', T), redLabel(' cm')] },
        { inline: [redLabel('Volume  '), blank(6), redLabel(' ml')] },
        { inline: [redLabel('Durée  '), blank(4), redLabel(' heures')] },
        null,
        ['Clearance à la créatinine', '2+8'], ['Protéines', '8'], ['Microalbumine', '8'], ['Electrophorèse°', '8'], ['Immunofixation', '8'], ['Ch. lég. Kappa/Lambda libres', '8'],
      ],
      [
        ['Créatinine', '8'], ['Acide urique', '8'], ['Glucose', '8'], ['Urée', '8'], null,
        ['Magnésium', '12'], ['Calcium', '12'], ['Chlore', '8'], ['Phosphore', '12'], ['Sodium', '8'], ['Potassium', '8'],
      ],
    ],
  },
]
const leftRows: Json[][] = LEFT.flatMap((block) => ('band' in block ? [[bandCell(block.band, 2)]] : zipColumns(block.pair)))

const SEROLOGY: readonly Entry[] = [
  sub('SEROLOGIE'),
  ['Adénovirus IgG + IgM°', '2'], ['Amibes°', '2'], ['Bordetella pertussis°', '2'], ['Borréliose/Lyme (dépistage)', '2'], ['Borréliose/Lyme (confirmation)°', '2'], ['Brucellose°', '2'], ['Bart. henselae (IgG+IgM)°', '2'], ['Bart. quintana (IgG+IgM)°', '2'],
  null,
  ['b-D-glucan° (inf. fongique)', '2'], ['Galactomannane° (Aspergillus)', '2'],
  null,
  ['Campylobacter jejuni°', '2'], ['CMV IgG', '2'], ['CMV IgM', '2'], ['C. pneumoniae IgG°', '2'], ['C. pneumoniae IgM°', '2'], ['C. trachomatis IgA°', '2'], ['C. trachomatis IgG°', '2'],
  null,
  ['Dengue (test rapide)#', '2'], ['Chikungunya IgG + IgM°', '2'],
  null,
  ['EBV (VCA-G/M, EBNA)', '2'], ['Echinocoques°', '2'], ['Fièvre Q (C. burnetii)°', '2'], ['F. tularensis (tularémie)°', '2'],
  null,
  ['HSV Type 1 IgG°', '2'], ['HSV Type 2 IgG°', '2'], ['HSV Type 1 et 2 IgM°', '2'],
  null,
  ['Leishmania°', '2'], ['Leptospira°', '2'], ['Mycopl. Pneumoniae (IgG)°', '2'], ['Mycopl. Pneumoniae (IgM)°', '2'],
  null,
  ['Oreillons IgG', '2'], ['Oreillons IgM°', '2'], ['Parvovirus B 19 (IgG)°', '2'], ['Parvovirus B 19 (IgM)°', '2'], ['Rickettsia IgG°', '2'], ['Rickettsia IgM°', '2'], ['Rougeole IgG', '2'], ['Rougeole IgM°', '2'], ['Rubéole IgG', '2'], ['Rubéole IgM°', '2'],
  ['SARS-COV-2 IgG anti-N & anti-S', '2'], ['SARS-COV-2 IgG & IgM (Voyage)', '2'],
  null,
  ['Schistosomia (Bilharziose)°', '2'], ['Strongyloïdes°', '2'], ['Syphilis (dépistage)', '2'], ['Syphilis (VDRL)', '2'], ['Toxoplasmose IgG', '2'], ['Toxoplasmose IgM', '2'], ['Varicelle IgG', '2'], ['Varicelle IgM°', '2'],
  sub('DIAGNOSTIC MOLECULAIRE'),
  ['CMV (PCR)°', '10'], ['EBV (PCR)°', '10'], ['Parvovirus B19 (PCR)°', '10'],
]

const treatment = (): Entry => ({ inline: [text('Traitement HCV    ', T), ...options(['Oui', 'Non'], T)] })
const IMMUNITY: readonly Entry[] = [
  sub('STATUS VACCINAL / IMMUNITÉ'),
  ['Hépatite A IgG', '2'], ['Hépatite B (HBsAc)', '2'], ['Oreillons IgG', '2'], ['Rougeole IgG', '2'], ['Rubéole IgG', '2'], ['Varicelle IgG', '2'], ['SARS-COV-2 IgG anti-S', '2'],
  null,
  sub('HEPATITES'),
  ['Hépatite A IgG', '2'], ['Hépatite A IgM', '2'],
  null,
  ['HBV dépist. (HBsAc/HBsAg/HBcAc)', '2'], ['HBV bilan complet', '2'], ['HBsAg', '2'], ['HBsAc', '2'], ['HBcAc', '2'], ['HBeAg', '2'], ['HBeAc', '2'], ['HbsAg quantitatif°', '2'], ['HBV virémie (PCR)', '10'],
  treatment(),
  null,
  ['Hépatite C (dépistage)°', '2'], ['HCV virémie (PCR)', '10'],
  treatment(),
  null,
  ['Hépatite Delta (dépistage)°', '2'], ['Hépatite E (dépistage)°', '2'],
  sub('HIV'),
  ['HIV 1/2 (dépistage)', '2'], note('Confirmation/suivi : voir formulaire 3'),
  band('AUTRES DEMANDES'),
  ['Calprotectine', '20'], ['H. pylori (test resp.)°', '50'], ['H. pylori (sérologie)°', '2'], ['QuantiFERON-TB Gold Plus', '6'], note('Tube de 7.5 ml sans billes'), note('Échantillon à acheminer dans les 16h suivant le prélèvement'),
  band('LIQUIDES'),
  { inline: [text('○ Origine du liquide : ', T), blank(10)] },
  ['Numérotation leucocytaire'], ['Différentiation cellulaire'], note('- liquide divers : 1    - LCR° : 11+50'),
  note('Selon prélèvement : liquide natif ou LCR', true),
  ['Glucose'], ['Créatinine'], ['LDH'], ['Protéines'], ['Amylase'], ['Albumine'], ['Cholestérol'], ['Recherche de cristaux°'], ['Rech. de cristaux d’apatite+'],
  ['LCR : profil protéique°', '2+11'], ['LCR : électrophorèse°', '2+11'],
  band('DROGUES'),
  ...['Amphétamines', 'Antidépr. tricycliques (TCA)', 'Barbituriques', 'Benzodiazépines', 'Cannabis', 'Cocaïne', 'Cotinine quantitative°', 'Cotinine qualitative°', 'Ectasy (MDMA)', 'LSD (Lysergide)°', 'Méthadone', 'Méthamphétamines', 'Méthaqualone°', 'Opiacés'].map((d): Entry => [d, '9']),
]

// The infectiology block on the right, beside the left block, row by row.
const rightRows: Json[][] = [
  [bandCell('INFECTIOLOGIE', 2)],
  [cell([p(bold('(voir aussi formulaire 2 et 3)', DARK_GREEN, T))], { ...plain, colspan: 2 * ENTRY_SPAN })],
  ...zipColumns([SEROLOGY, IMMUNITY]),
]
const emptyHalf = (): Json[] => [...entryCells(null), ...entryCells(null)]
const page2Grid = chunked(Array.from({ length: Math.max(leftRows.length, rightRows.length) }, (_, i) => [...(leftRows[i] ?? emptyHalf()), ...(rightRows[i] ?? emptyHalf())]))

const consent = table(
  row(titleBand('CONSENTEMENT POUR ANALYSES BIOLOGIQUES')),
  row(cell([
    p(text('Chaque test de génétique constitutionnelle doit s’accompagner d’un conseil génétique (Lois sur l’analyse génétique humaine – LAGH).', T)),
    p(text('Par sa signature, le médecin demandeur atteste avoir informé la personne concernée selon les obligations légales en vigueur pour la génétique constitutionnelle et avoir reçu son consentement pour les analyses génétiques et toutes les autres analyses biologiques.', T)),
    p(),
    p(text('Suite à l’analyse biologique, l’échantillon ou produit d’analyse :', T)),
    p(box('peut être conservé pour une demande d’analyses additionnelles par le médecin prescripteur (par défaut)', T)),
    p(box('peut être utilisé pour le développement et la recherche (par défaut)', T)),
    p(box('doit être détruit', T)),
    p(),
    p(bold('Signature du médecin : ', T), field('physician.title', T), text(' ', T), field('physician.firstName', T), text(' ', T), field('physician.lastName', T), text('    ', T), blank(20)),
  ], plain)),
  row(cell([pAligned('right', text('° analyses sous-traitées / # non accréditées', T))], plain)),
)

export const labRequest: Form = {
  id: 'lab-request',
  title: 'Fiche de demande d’analyses – laboratoire général',
  source: 'formulaire LibreOffice d’un laboratoire d’analyses médicales (recto verso, cases à cocher)',
  page: { widthMm: 210, heightMm: 297, marginMm: 10 },
  content: doc(
    [
      header,
      addressWindow,
      table(row(titleBand('FICHE DE DEMANDE D’ANALYSES – LABORATOIRE GENERAL'))),
      p(bold('Matériel de prélèvement', DARK_GREEN, T)),
      table(...legendRows),
      ...page1Grid,
    ],
    [...page2Grid, consent],
  ),
}
