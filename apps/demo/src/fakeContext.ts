// A fake in-memory data provider: fictitious values, a small delay to show that answers may be
// asynchronous, an image store holding data: URIs.
import { blobToDataUri, type EditorDataProvider, type FieldDescriptor, type RepeatData, type RepeatSourceDescriptor } from '@icure/editor'

import type { AppStrings, Language } from './labels/index.ts'
import { LOGO_IMAGE_ID, SAMPLE_TEMPLATES } from './samples/templates.ts'

// A fixed day, so the demo (and its tests) read the same every day.
export const DEMO_DAY = new Date(2026, 9, 14)
const LATENCY_MS = 30

// 160 × 48 fictitious logo (a teal badge).
export const LOGO_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAAAwCAIAAAAZy+Y5AAAAfklEQVR42u3cwQ0AEBBFwS1Bqc6qVYTEkS4IOz+vAnPcRCz7euEJABtgewK4tKoPAgxYgAVYgAVYgAUYMGDAAizAAqx7wH0OXQwwYMCAAQMWYAEWYAEGDBgwYMCAMwDLNUmABViABRgwYMACLMACLMACLMBZgc1PdwbYANuxbeDkx83CF+1bAAAAAElFTkSuQmCC'

const later = <T,>(value: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS))

const LOCALES: Readonly<Record<Language, string>> = { en: 'en-GB', fr: 'fr-FR', nl: 'nl-NL' }

function values(language: Language): Record<string, string> {
  const date = new Intl.DateTimeFormat(LOCALES[language], { day: '2-digit', month: '2-digit', year: 'numeric' }).format(DEMO_DAY)
  const money = new Intl.NumberFormat(LOCALES[language], { style: 'currency', currency: 'EUR' })
  return {
    'recipient.title': { en: 'Ms', fr: 'Mme', nl: 'Mevr.' }[language],
    'recipient.firstName': 'Alex',
    'recipient.lastName': 'Martin',
    'recipient.street': '12 Example Lane',
    'recipient.postalCode': '0000',
    'recipient.city': 'Sampletown',
    'recipient.memberNumber': 'M-000123',
    'organisation.name': 'Riverside Community Centre',
    'organisation.address': 'Sampletown',
    'organisation.phone': '+00 000 00 00 00',
    'organisation.email': 'hello@example.org',
    'sender.name': 'Sam Taylor',
    'sender.role': { en: 'Coordinator', fr: 'Coordinatrice', nl: 'Coördinator' }[language],
    'date.today': date,
    'invoice.number': 'INV-0042',
    'invoice.total': money.format(57.5),
    'preference.value:Newsletter': { en: 'monthly', fr: 'mensuelle', nl: 'maandelijks' }[language],
  }
}

// The first session of the programme and the note of its day (shared by the data and `SAMPLE`).
const FIRST_SESSION = { time: '10:00', title: 'Opening of the doors' }
const FIRST_DAY_NOTE = 'Free entry, no booking needed.'
const dayLabel = (language: Language, day: number): string => new Intl.DateTimeFormat(LOCALES[language], { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(2026, 9, day))

function repeats(language: Language): Record<string, RepeatData> {
  const date = (month: number, day: number) => new Intl.DateTimeFormat(LOCALES[language], { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(2026, month, day))
  const money = new Intl.NumberFormat(LOCALES[language], { style: 'currency', currency: 'EUR' })
  return {
    'events.upcoming': {
      items: [
        { 'event.title': 'Open house', 'event.date': date(9, 24) },
        { 'event.title': 'Garden workshop', 'event.date': date(10, 7) },
        { 'event.title': 'Winter fair', 'event.date': date(11, 12) },
      ],
    },
    'invoice.lines': {
      items: [
        { 'line.description': 'Annual membership', 'line.quantity': '1', 'line.amount': money.format(40) },
        { 'line.description': 'Workshop ticket', 'line.quantity': '2', 'line.amount': money.format(15) },
        { 'line.description': 'Locker key deposit', 'line.quantity': '1', 'line.amount': money.format(2.5) },
      ],
    },
    'waitlist.entries': { items: [] },
    'programme.days': {
      items: [
        {
          'day.label': dayLabel(language, 24),
          'day.note': FIRST_DAY_NOTE,
          'day.sessions': {
            items: [
              { 'session.time': FIRST_SESSION.time, 'session.title': FIRST_SESSION.title },
              { 'session.time': '11:30', 'session.title': 'Garden tour' },
              { 'session.time': '14:00', 'session.title': 'Pottery demonstration' },
            ],
          },
        },
        {
          'day.label': dayLabel(language, 25),
          'day.note': 'Bring your own mug for the café.',
          'day.sessions': {
            items: [
              { 'session.time': '10:30', 'session.title': 'Family storytelling' },
              { 'session.time': '15:00', 'session.title': 'Closing concert' },
            ],
          },
        },
      ],
    },
  }
}

// The image store outlives a language switch (uploaded images stay).
const imageStore = new Map<string, string>([[LOGO_IMAGE_ID, LOGO_DATA_URI]])
let uploads = 0

export function createFakeProvider(language: Language, strings: AppStrings): EditorDataProvider {
  const fieldValues = values(language)
  const repeatValues = repeats(language)
  const groupOf = (key: string): string => {
    const group = key.split('.')[0]
    if (group === 'recipient' || group === 'organisation' || group === 'sender') return strings.fieldGroups[group]
    return strings.fieldGroups.document
  }
  const fields: FieldDescriptor[] = ['recipient.title', 'recipient.firstName', 'recipient.lastName', 'recipient.street', 'recipient.postalCode', 'recipient.city', 'recipient.memberNumber', 'organisation.name', 'organisation.address', 'organisation.phone', 'organisation.email', 'sender.name', 'sender.role', 'date.today', 'invoice.number', 'invoice.total'].map((key) => ({ key, label: strings.fields[key] ?? key, group: groupOf(key) }))
  const sources: RepeatSourceDescriptor[] = [
    { key: 'events.upcoming', label: strings.sources['events.upcoming']!, layout: 'lines', itemFields: ['event.title', 'event.date'].map((key) => ({ key, label: strings.fields[key] ?? key })) },
    { key: 'invoice.lines', label: strings.sources['invoice.lines']!, layout: 'table', itemFields: ['line.description', 'line.quantity', 'line.amount'].map((key) => ({ key, label: strings.fields[key] ?? key })) },
    { key: 'waitlist.entries', label: strings.sources['waitlist.entries']!, layout: 'lines', itemFields: [{ key: 'entry.name', label: 'Name' }] },
    {
      key: 'programme.days',
      label: strings.sources['programme.days']!,
      layout: 'lines',
      itemFields: ['day.label', 'day.note'].map((key) => ({ key, label: strings.fields[key] ?? key })),
      itemRepeats: [{ key: 'day.sessions', label: strings.sources['day.sessions']!, itemFields: ['session.time', 'session.title'].map((key) => ({ key, label: strings.fields[key] ?? key })) }],
    },
  ]
  return {
    listFields: () => fields,
    resolveField: (key) => later(fieldValues[key]),
    listRepeatSources: () => sources,
    resolveRepeat: (source) => later(repeatValues[source]),
    listTemplates: () => SAMPLE_TEMPLATES.filter((t) => t.embeddable).map((t) => ({ id: t.id, name: strings.templateNames[t.id] ?? t.id })),
    loadTemplate: (id) => {
      const found = SAMPLE_TEMPLATES.find((t) => t.id === id)
      return later(found ? { id, name: strings.templateNames[id] ?? id, content: found.content } : null)
    },
    images: {
      resolve: (id) => {
        const src = imageStore.get(id)
        return src ? { src } : null
      },
      upload: async (file) => {
        const src = await blobToDataUri(file)
        if (!src) throw new Error('Unsupported image')
        const id = `upload-${++uploads}`
        imageStore.set(id, src)
        return { id }
      },
    },
  }
}

// The English sample values the e2e tests read (computed from the data, never retyped).
export const SAMPLE = {
  invoiceTotal: values('en')['invoice.total']!,
  firstDay: dayLabel('en', 24),
  firstSessionLine: `– ${FIRST_SESSION.time} ${FIRST_SESSION.title} (${dayLabel('en', 24)})`,
  firstDayNote: FIRST_DAY_NOTE,
}
