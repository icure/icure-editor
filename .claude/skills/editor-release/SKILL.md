---
name: editor-release
description: Use when releasing a new version of @icure/editor to NPM and GitHub from this repo — "release the editor", "publish a new version", "cut a release", "bump and publish", or when backfilling missing GitHub releases / RELEASES.md.
---

# Releasing @icure/editor

Publishes a new version to NPM and GitHub in one pass: preflight checks, version bump through a PR,
release notes in RELEASES.md, tag (which publishes to NPM through CI), GitHub release.

**Each step gates the next. If a step fails, stop and report — never continue past a failed check.**

**Remote name:** `origin`. **Package:** `packages/editor/package.json` (the monorepo root is private).
**Tags:** `v`-prefixed (`v0.5.1`), annotated (`tag.gpgSign` is on: a bare `git tag v…` fails with
"no tag message?").

**Publishing is done by CI:** pushing a `v*.*.*` tag runs `.github/workflows/publish.yml`, which checks
the tag against the package version, runs typecheck, unit tests and e2e, then publishes (a version
with a `-` goes to the `next` dist-tag). Never `npm publish` by hand.

**Merging:** changes reach `main` through a PR (`feat/…`, `fix/…` branches). Merging a PR needs the
user's approval — open it, then ask them to merge.

## 1. Preflight — work merged and green

```bash
git fetch origin
git status --porcelain            # nothing but untracked IDE files (.idea/)
bun run typecheck && bun run test && bun run test:e2e
```

A change is done only when typecheck, unit tests and e2e are green (CLAUDE.md).

## 2. Choose the new version

```bash
npm view @icure/editor versions --json   # the new one must NOT be in this list
git log --no-merges --format='%s' $(git describe --tags --abbrev=0)..HEAD
```

Apply semver (0.x: breaking → minor, features → minor, fixes only → patch). Propose the version to
the user unless they named it.

## 3. Bump, with the release notes, on the feature branch

On the PR's branch (or a `chore/release-<VERSION>` branch from `main`): edit `"version"` in
`packages/editor/package.json`, run `bun install` (bun.lock records the workspace version), then
append an entry at the END of `RELEASES.md` in the format read by `scripts/create-releases.ts`:

```markdown
## [MISSING] <VERSION> (<YYYY-MM-DD>)
<!-- tag: v<VERSION> | target: <TAG COMMIT, filled in step 4> | prerelease: false -->

- <commit subject 1>
- <commit subject 2>
```

The `[MISSING]` marker is required: entries without a status marker are treated as already published
and skipped. Body: deduplicated commit subjects of the release (no merge, release or housekeeping
commits). Prerelease versions (`-rc.x`, `-beta.x`) → `prerelease: true`. Show the entry to the user.

```bash
git add packages/editor/package.json bun.lock RELEASES.md
git commit -m "chore(release): @icure/editor <VERSION>"
git push -u origin <branch> && gh pr create --base main …
```

## 4. Tag and push (after the user merged the PR)

```bash
git checkout main && git pull
grep '"version"' packages/editor/package.json   # must be <VERSION>
git tag -a v<VERSION> -m "@icure/editor <VERSION>"
git push origin v<VERSION>
gh run list --workflow publish.yml -L 1          # wait for success: gh run watch <id>
npm view @icure/editor@<VERSION> version          # must print the version
```

A failed run publishes nothing: fix on a new PR, move the tag only if nothing was published
(`git push origin :refs/tags/v<VERSION>`, re-tag, re-push).

## 5. Create the GitHub release

Set the entry's `target` to the tagged commit (`git rev-parse v<VERSION>^{commit}`), then:

```bash
bun scripts/create-releases.ts --only <VERSION>
gh release view v<VERSION> --repo icure/icure-editor
```

Then remove the `[MISSING] ` marker from the entry's header (no marker = published), commit
(`docs(releases): mark <VERSION> as released`) and push through a PR (or with the next release).

## Backfilling historical releases

`bun scripts/prepare-releases.ts` regenerates RELEASES.md from scratch for ALL versions on NPM
(placeholder `0.0.0-*` versions excluded): it resolves each version to a commit (npm gitHead → git
tag → bump commit of `packages/editor/package.json`, preferring one pushed to the remote), classifies
existing GitHub releases as OK/TERSE/MISSING, and drafts descriptions from commit subjects. Review
the file, then `bun scripts/create-releases.ts --dry-run`, then without `--dry-run`. It overwrites
RELEASES.md — don't run it after hand-editing entries you want to keep.

## Failure recovery

| Failed step                                    | Recovery                                                              |
|------------------------------------------------|-----------------------------------------------------------------------|
| `fatal: no tag message?`                       | Use `git tag -a v<VERSION> -m …`                                      |
| publish.yml: tag doesn't match the version     | Delete the remote tag, bump correctly through a PR, re-tag            |
| publish.yml: tests fail                        | Fix through a PR; nothing was published, the tag can be moved         |
| NPM publish succeeded but the GitHub release failed | Re-run step 5 only; never re-publish                             |
| Wrong version published                        | NPM versions are immutable — release a new patch, don't unpublish     |
