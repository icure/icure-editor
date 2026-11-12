/**
 * Phase 1: generate RELEASES.md for all @icure/editor versions published on NPM.
 *
 * Entries are ordered by NPM publish date; the changelog baseline of a version is the
 * previous version of the SAME major line, falling back to the last version of the
 * previous major line for the first entry of a line, so commit ranges never span across
 * diverged branches should parallel lines ever appear. Placeholder versions (0.0.0-*,
 * published once to set up npm trusted publishing) are left out.
 *
 * For each NPM version we determine:
 *  - status: OK (release exists with a real description, emitted without a status
 *    marker), TERSE (release exists but description is empty/very short), MISSING
 *    (no GitHub release)
 *  - the git tag (existing one, `v`-prefixed or not) or the commit that bumped
 *    packages/editor/package.json to that version (for versions that were never tagged)
 *  - a description: the version's WHATSNEW.md section when there is one (curated,
 *    user-facing), otherwise generated from the commit subjects between the previous
 *    version of the line and this one
 *
 * Run from the repository root with: bun scripts/prepare-releases.ts
 */

import { spawnSync } from 'child_process'

const REPO = 'icure/icure-editor'
const PKG = '@icure/editor'
const PKG_JSON = 'packages/editor/package.json'
const TERSE_THRESHOLD = 40 // chars of meaningful body text

function run(cmd: string, args: string[], allowFail = false): string {
  const res = spawnSync(cmd, args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
  if (res.status !== 0 && !allowFail) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${res.stderr}`)
  }
  return res.stdout ?? ''
}

// ---------------------------------------------------------------------------
// 1. NPM versions + publish dates
// ---------------------------------------------------------------------------
console.error('Fetching NPM packument...')
const packument = (await (await fetch(`https://registry.npmjs.org/${PKG}`)).json()) as {
  time: Record<string, string>
  versions: Record<string, { gitHead?: string }>
}
const versions = Object.keys(packument.versions)
  .filter((v) => !v.startsWith('0.0.0-'))
  .map((v) => ({ version: v, publishedAt: packument.time[v], gitHead: packument.versions[v]?.gitHead }))
  .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
console.error(`  ${versions.length} versions on NPM`)

// ---------------------------------------------------------------------------
// 2. Existing GitHub releases (with bodies)
// ---------------------------------------------------------------------------
console.error('Fetching GitHub releases...')
type GhRelease = { tag_name: string; name: string; body: string | null; draft: boolean; prerelease: boolean; html_url: string }
// --paginate outputs one JSON array per page, one per line
const ghReleases: GhRelease[] = run('gh', [
  'api',
  `repos/${REPO}/releases`,
  '--paginate',
  '-q',
  '[.[] | {tag_name, name, body, draft, prerelease, html_url}]',
])
  .split('\n')
  .filter(Boolean)
  .flatMap((page) => JSON.parse(page) as GhRelease[])
const releaseByVersion = new Map<string, GhRelease>()
for (const r of ghReleases) {
  releaseByVersion.set(r.tag_name.replace(/^v/, ''), r)
}
console.error(`  ${releaseByVersion.size} existing GitHub releases`)

// ---------------------------------------------------------------------------
// 3. Git tags
// ---------------------------------------------------------------------------
const tagByVersion = new Map<string, string>()
for (const tag of run('git', ['tag', '--list']).split('\n').filter(Boolean)) {
  const v = tag.replace(/^v/, '')
  if (!tagByVersion.has(v)) tagByVersion.set(v, tag)
}

// ---------------------------------------------------------------------------
// 4. WHATSNEW.md sections (curated user-facing notes, preferred as descriptions)
// ---------------------------------------------------------------------------
const whatsnewByVersion = new Map<string, string>()
try {
  const wn = await Bun.file('WHATSNEW.md').text()
  for (const section of wn.split(/^(?=## )/m).slice(1)) {
    const header = section.match(/^## (\d+\.\d+\.\d+(?:-[\w.]+)?)/)
    if (!header) continue
    const body = section
      .split('\n')
      .slice(1) // drop the "## x.y.z (date)" header
      .join('\n')
      .replace(/\n-{3,}\s*$/g, '') // drop the trailing --- separator
      // relative links don't resolve on the releases page
      .replace(/\]\(\.\//g, `](https://github.com/${REPO}/blob/main/`)
      .trim()
    if (body) whatsnewByVersion.set(header[1], body)
  }
} catch {
  // no WHATSNEW.md, generated descriptions only
}
console.error(`  ${whatsnewByVersion.size} versions documented in WHATSNEW.md`)

// ---------------------------------------------------------------------------
// 5. Resolve each version to a commit
// ---------------------------------------------------------------------------
function versionInPackageJson(sha: string): string | null {
  const content = run('git', ['show', `${sha}:${PKG_JSON}`], true)
  const m = content.match(/"version"\s*:\s*"([^"]+)"/)
  return m ? m[1] : null
}

function commitExists(sha: string): boolean {
  return spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`]).status === 0
}

function onRemote(sha: string): boolean {
  return !!run('git', ['branch', '-r', '--contains', sha], true).trim()
}

console.error('Resolving versions to commits...')
const commitByVersion = new Map<string, string>()
for (const { version, gitHead } of versions) {
  // Candidates in preference order:
  const candidates: { sha: string; via: string }[] = []
  // 1. The exact commit the version was published from, as recorded by npm
  if (gitHead && commitExists(gitHead)) candidates.push({ sha: gitHead, via: 'npm gitHead' })
  // 2. An existing git tag for this version
  const tag = tagByVersion.get(version)
  if (tag) candidates.push({ sha: run('git', ['rev-list', '-1', tag]).trim(), via: `tag ${tag}` })
  // 3. The commits that introduced this version string into the package's package.json, oldest first
  candidates.push(
    ...run('git', ['log', '--all', '--format=%H %ct', `-S"version": "${version}"`, '--', PKG_JSON], true)
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [sha, ct] = l.split(' ')
        return { sha, ct: parseInt(ct) }
      })
      // keep only commits where package.json actually contains this version (i.e. the bump, not the removal)
      .filter((c) => versionInPackageJson(c.sha) === version)
      .sort((a, b) => a.ct - b.ct)
      .map((c) => ({ sha: c.sha, via: `bump commit` }))
  )
  if (candidates.length === 0) {
    console.error(`  ${version}: WARNING - no gitHead, tag or bump commit found`)
    continue
  }
  // gh release create needs the target commit on the remote, so prefer a pushed candidate
  // (publishes from a dirty checkout leave npm gitHeads that were never pushed)
  const pushed = candidates.find((c) => onRemote(c.sha))
  const chosen = pushed ?? candidates[0]
  commitByVersion.set(version, chosen.sha)
  if (chosen.via !== 'npm gitHead') console.error(`  ${version}: resolved via ${chosen.via} ${chosen.sha.slice(0, 10)}`)
  if (!pushed)
    console.error(`  ${version}: WARNING - commit ${chosen.sha.slice(0, 10)} is not on any remote branch, push it before running create-releases.ts`)
}

// ---------------------------------------------------------------------------
// 6. Generate descriptions from commit ranges
// ---------------------------------------------------------------------------
const NOISE = new RegExp(
  [
    '^(bump(ed)? version|version bump|bump|fix version|prettier|format(ting)?|wip)\\.?$', // pure housekeeping
    '^v?\\d+\\.\\d+\\.\\d+(-[\\w.]+)?$', // commit subject is just a version number
    '^release\\s+v?\\d', // "Release 2.0.0"
    '^bump(ed)?\\s+(version\\s+)?(to\\s+)?v?\\d', // "Bump 2.0.5", "Bump version to 3.2.1"
    '^chore\\(release\\):', // "chore(release): @icure/editor 0.5.1"
    '^publish(ed)?( version)?\\s+v?\\d', // "Publish version 2.2.0"
  ].join('|'),
  'i'
)

function commitSubjects(prevSha: string | undefined, sha: string): string[] {
  const range = prevSha ? [`^${prevSha}`, sha] : ['-20', sha]
  const out = run('git', ['log', '--no-merges', '--format=%s', ...range], true)
  const seen = new Set<string>()
  const subjects: string[] = []
  for (const s of out.split('\n').map((l) => l.trim()).filter(Boolean).reverse()) {
    if (NOISE.test(s)) continue
    if (/^Merge (branch|pull request|remote)/i.test(s)) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    subjects.push(s)
  }
  return subjects
}

function describe(prevSha: string | undefined, sha: string | undefined): string {
  if (!sha)
    return '_The commit this version was published from was never pushed to the repository. The release tag points at the previous version; the changes of this version are listed in the next version’s release notes._'
  const subjects = commitSubjects(prevSha, sha)
  if (subjects.length === 0) return 'Maintenance release (version bump only).'
  // Conventional-commit subjects ("feat(editor): …") are kept as written
  const conventional = /^[a-z]+(\([^)]*\))?!?: /
  return subjects.map((s) => `- ${conventional.test(s) ? s : `${s[0].toUpperCase()}${s.slice(1)}`}`).join('\n')
}

// ---------------------------------------------------------------------------
// 7. Write RELEASES.md
// ---------------------------------------------------------------------------
console.error('Generating RELEASES.md...')
const lines: string[] = [
  `# ${PKG} releases`,
  '',
  `> Generated by \`scripts/prepare-releases.ts\`. Review the descriptions, then run \`bun scripts/create-releases.ts\`.`,
  `> One entry per NPM version, oldest publish first.`,
  `> Entries without a status marker are published GitHub releases (left untouched). **[TERSE]** = existing release`,
  `> whose description will be replaced by the one below, **[MISSING]** = release to be created.`,
  '',
]

// Changelog baselines chain per major line so ranges never span diverged branches
const majorOf = (v: string) => parseInt(v, 10)
const lastShaByMajor = new Map<number, string>()
let ok = 0
let terse = 0
let missing = 0
let unresolved = 0

for (const { version, publishedAt } of versions) {
  const major = majorOf(version)
  // First entry of a line baselines on the state of the previous line at that time
  const prevSha = lastShaByMajor.get(major) ?? lastShaByMajor.get(major - 1)
  const sha = commitByVersion.get(version)
  const release = releaseByVersion.get(version)
  // New tags are `v`-prefixed, matching this repo's tags (and publish.yml's trigger)
  const tag = release?.tag_name ?? tagByVersion.get(version) ?? `v${version}`
  // Same rule as publish.yml: a version with a "-" is a prerelease
  const prerelease = version.includes('-')
  const date = publishedAt.slice(0, 10)

  let status: 'OK' | 'TERSE' | 'MISSING'
  let body: string
  if (!release) {
    status = 'MISSING'
    body = whatsnewByVersion.get(version) ?? describe(prevSha, sha)
    missing++
    if (!sha) unresolved++
  } else {
    const existingBody = (release.body ?? '').trim()
    const meaningful = existingBody.replace(/\s+/g, ' ').replace(new RegExp(`^v?${version.replace(/\./g, '\\.')}$`), '')
    const generated = whatsnewByVersion.get(version) ?? describe(prevSha, sha)
    // A short body that matches what we'd generate is a backfilled release, not a terse one
    if (meaningful.length >= TERSE_THRESHOLD || existingBody === generated) {
      status = 'OK'
      body = existingBody
      ok++
    } else {
      status = 'TERSE'
      body = generated
      if (existingBody) body += `\n\n<!-- original description: ${existingBody.replace(/-->/g, '')} -->`
      terse++
    }
  }

  // For versions whose publish commit was never pushed, anchor the tag on the previous version's commit
  const target = sha ?? prevSha ?? 'UNKNOWN'
  // Published releases (OK) carry no status marker; only actionable entries are marked
  lines.push(status === 'OK' ? `## ${version} (${date})` : `## [${status}] ${version} (${date})`)
  lines.push(`<!-- tag: ${tag} | target: ${target} | prerelease: ${prerelease} -->`)
  lines.push('')
  lines.push(body)
  lines.push('')

  if (sha) lastShaByMajor.set(major, sha)
}

await Bun.write('RELEASES.md', lines.join('\n'))
console.error(`Done: ${ok} OK, ${terse} TERSE, ${missing} MISSING (${unresolved} without a resolvable commit) -> RELEASES.md`)
