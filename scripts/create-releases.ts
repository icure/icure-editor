/**
 * Phase 2: create/update GitHub releases from the reviewed RELEASES.md.
 *
 * For each entry, in file order (oldest first):
 *  - no [STATUS] marker or OK -> skipped (release already published, left untouched)
 *  - TERSE    -> the existing release's description is replaced with the one in RELEASES.md
 *  - MISSING  -> a release is created; the tag is created on the target commit if it
 *                doesn't exist on the remote yet
 *
 * Only the newest non-prerelease entry is marked "latest"; every other creation passes
 * --latest=false so GitHub's "Latest" badge doesn't jump around during the backfill.
 * Entries are ordered by NPM publish date, so the "latest" badge lands on the most
 * recently published version.
 *
 * Dates: GitHub derives a release's created_at — the date releases are ordered and
 * displayed by on the releases page — from the commit the tag points to, so backfilled
 * releases automatically land at their historical dates. published_at is always the
 * moment of the API call and cannot be backdated. The script logs created_at after each
 * creation so this can be verified.
 *
 * Run from the repository root with: bun scripts/create-releases.ts [--dry-run] [--only <version>]
 */

import { spawnSync } from 'child_process'

const REPO = 'icure/icure-editor'
const DRY_RUN = process.argv.includes('--dry-run')
const onlyIdx = process.argv.indexOf('--only')
const ONLY = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : undefined

type Entry = {
  status: 'OK' | 'TERSE' | 'MISSING'
  version: string
  date: string
  tag: string
  target: string
  prerelease: boolean
  body: string
}

// ---------------------------------------------------------------------------
// Parse RELEASES.md
// ---------------------------------------------------------------------------
const md = await Bun.file('RELEASES.md').text()
const entries: Entry[] = []
// Split on entry headers only: "## [STATUS] x.y.z" or "## x.y.z" — not on "## ..."
// headings that appear inside a release description
const sections = md.split(/^(?=## (?:\[(?:OK|TERSE|MISSING)\] )?\d)/m).slice(1)
for (const section of sections) {
  // Status is optional: entries without a [STATUS] marker are already published on
  // GitHub and treated as OK (skipped)
  const header = section.match(/^## (?:\[(OK|TERSE|MISSING)\] )?(\S+) \((\d{4}-\d{2}-\d{2})\)/)
  const meta = section.match(/<!-- tag: (\S+) \| target: ([0-9a-f]{40}) \| prerelease: (true|false) -->/)
  if (!header) throw new Error(`Cannot parse section header: ${section.slice(0, 80)}`)
  if (!meta) throw new Error(`Cannot parse metadata for ${header[2]}`)
  const body = section
    .split('\n')
    .slice(2) // drop header + metadata lines
    .join('\n')
    .replace(/<!--[\s\S]*?-->/g, '') // drop review-only comments (e.g. original terse description)
    .trim()
  entries.push({
    status: (header[1] ?? 'OK') as Entry['status'],
    version: header[2],
    date: header[3],
    tag: meta[1],
    target: meta[2],
    prerelease: meta[3] === 'true',
    body,
  })
}
console.log(`Parsed ${entries.length} entries from RELEASES.md`)

const latestVersion = entries.filter((e) => !e.prerelease).at(-1)?.version

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------
function gh(args: string[], body: string): { ok: boolean; err: string } {
  if (DRY_RUN) {
    console.log(`  DRY RUN: gh ${args.join(' ')}`)
    return { ok: true, err: '' }
  }
  const res = spawnSync('gh', args, { encoding: 'utf-8', input: body })
  return { ok: res.status === 0, err: (res.stderr ?? '').trim() }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let created = 0
let updated = 0
let skipped = 0
let failed = 0

for (const e of entries) {
  if (ONLY && e.version !== ONLY) continue
  if (e.status === 'OK') {
    skipped++
    continue
  }
  if (!e.body) {
    console.log(`✗ ${e.version}: empty description, skipping`)
    failed++
    continue
  }

  let args: string[]
  if (e.status === 'MISSING') {
    args = [
      'release',
      'create',
      e.tag,
      '--repo',
      REPO,
      '--title',
      e.tag,
      '--notes-file',
      '-',
      '--target',
      e.target,
      `--latest=${e.version === latestVersion}`,
    ]
    if (e.prerelease) args.push('--prerelease')
  } else {
    // TERSE: update the existing release's description only
    args = ['release', 'edit', e.tag, '--repo', REPO, '--notes-file', '-']
  }

  let result = gh(args, e.body)
  if (!result.ok && /rate limit|abuse|secondary/i.test(result.err)) {
    console.log(`  rate limited on ${e.version}, waiting 60s...`)
    await sleep(60_000)
    result = gh(args, e.body)
  }

  if (result.ok) {
    if (e.status === 'MISSING') {
      created++
      // GitHub derives the release's created_at (the date shown/ordered on the releases
      // page) from the tagged commit, not from the API call time; log it to verify the
      // release landed at its historical date. published_at cannot be backdated.
      const dates = DRY_RUN
        ? ''
        : spawnSync('gh', ['api', `repos/${REPO}/releases/tags/${e.tag}`, '-q', '.created_at'], { encoding: 'utf-8' })
            .stdout?.trim() ?? ''
      console.log(`✓ created ${e.tag}${dates ? ` (created_at: ${dates}, expected ~${e.date})` : ''}`)
    } else {
      updated++
      console.log(`✓ updated ${e.tag}`)
    }
  } else {
    failed++
    console.log(`✗ ${e.version} (${e.status}): ${result.err}`)
  }

  // stay clear of GitHub's secondary rate limit on content creation
  if (!DRY_RUN) await sleep(1500)
}

console.log(`\nDone: ${created} created, ${updated} updated, ${skipped} skipped (OK), ${failed} failed`)
if (failed > 0) process.exit(1)
