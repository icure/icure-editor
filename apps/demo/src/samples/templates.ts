// The demo's sample templates (fictitious content). `embeddable` ones are offered by "Insert template".
import { bold, doc, embed, field, fieldRow, footerRow, h, headerRow, image, p, pAligned, repeat, SMALL, STRONG, table, text, withMarks, zoned } from './build.ts'

export interface SampleTemplate {
  readonly id: string
  readonly content: unknown
  readonly embeddable?: boolean
}

export const LOGO_IMAGE_ID = 'logo'

export const SAMPLE_TEMPLATES: readonly SampleTemplate[] = [
  {
    id: 'welcome-letter',
    content: doc([
      embed('letterhead'),
      pAligned('right', field('organisation.address'), text(', '), field('date.today')),
      p(),
      p(field('recipient.title'), text(' '), field('recipient.firstName'), text(' '), field('recipient.lastName')),
      p(field('recipient.street')),
      p(field('recipient.postalCode'), text(' '), field('recipient.city')),
      p(),
      h(2, text('Welcome to '), field('organisation.name')),
      pAligned('justify', text('Dear '), field('recipient.firstName'), text(', thank you for joining us. Your member number is '), withMarks(field('recipient.memberNumber'), STRONG), text('. Your newsletter preference: '), field('preference.value', 'Newsletter'), text('.')),
      p(),
      p(text('Here is what is coming up:')),
      repeat('events.upcoming', p(text('– '), field('event.title'), text(' ('), field('event.date'), text(')'))),
      p(),
      embed('signature'),
    ]),
  },
  {
    id: 'invoice',
    content: doc([
      embed('letterhead'),
      h(1, text('Invoice '), field('invoice.number')),
      p(field('recipient.firstName'), text(' '), field('recipient.lastName'), text(' — '), field('date.today')),
      p(),
      repeat('invoice.lines', table(headerRow('Description', 'Quantity', 'Amount'), fieldRow('line.description', 'line.quantity', 'line.amount'), footerRow([], [bold('Total')], [field('invoice.total')]))),
      p(),
      embed('footer'),
    ]),
  },
  {
    id: 'programme',
    content: doc([
      embed('letterhead'),
      h(1, text('Open weekend programme')),
      zoned('programme.days', {
        body: [h(2, field('day.label')), zoned('day.sessions', { body: [p(text('– '), field('session.time'), text(' '), field('session.title'), text(' ('), field('day.label'), text(')'))], footer: [p(withMarks(field('day.note'), SMALL))] })],
      }),
      p(),
      embed('footer'),
    ]),
  },
  {
    id: 'letterhead',
    embeddable: true,
    content: doc([pAligned('center', image(LOGO_IMAGE_ID, 'Riverside Community Centre logo', 160)), pAligned('center', withMarks(field('organisation.name'), STRONG))]),
  },
  {
    id: 'signature',
    embeddable: true,
    content: doc([p(text('Kind regards,')), p(), p(field('sender.name')), p(field('sender.role')), embed('footer')]),
  },
  {
    id: 'footer',
    embeddable: true,
    content: doc([pAligned('center', withMarks(field('organisation.phone'), SMALL), text(' · ', [SMALL]), withMarks(field('organisation.email'), SMALL))]),
  },
  {
    id: 'problems',
    content: doc([
      h(2, text('A template with unresolved references')),
      p(text('Middle name: '), field('recipient.middleName')),
      zoned('waitlist.entries', { header: [p(text('Waiting list:'))], body: [p(text('– '), field('entry.name'))] }),
      p(text('Unknown block:')),
      repeat('archive.items', p(field('item.name'))),
      p(text('A missing image: '), image('missing-image', 'Missing image')),
      embed('loop-a'),
      embed('does-not-exist'),
    ]),
  },
  { id: 'loop-a', embeddable: true, content: doc([p(text('Loop A embeds Loop B.')), embed('loop-b')]) },
  { id: 'loop-b', embeddable: true, content: doc([p(text('Loop B embeds Loop A.')), embed('loop-a')]) },
  { id: 'blank', content: doc([p()]) },
]

export const DEFAULT_TEMPLATE_ID = 'welcome-letter'
export const sampleTemplate = (id: string): SampleTemplate | undefined => SAMPLE_TEMPLATES.find((t) => t.id === id)
