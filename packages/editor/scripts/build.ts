// Builds the library: ESM bundle (dependencies external), type declarations, one stylesheet.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })

const result = await Bun.build({
  entrypoints: [join(root, 'src/index.ts')],
  outdir: dist,
  format: 'esm',
  target: 'browser',
  packages: 'external',
  sourcemap: 'linked',
  // The production JSX runtime (`react/jsx-runtime`): the development one is empty in a production app.
  jsx: { development: false },
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

const tsc = Bun.spawnSync(['bunx', 'tsc', '-p', join(root, 'tsconfig.build.json')], { cwd: root, stdout: 'inherit', stderr: 'inherit' })
if (tsc.exitCode !== 0) process.exit(tsc.exitCode ?? 1)

// Declarations import siblings as `.js`, so every module resolution finds them.
for await (const file of new Bun.Glob('**/*.d.ts').scan(dist)) {
  const path = join(dist, file)
  const text = await readFile(path, 'utf8')
  await writeFile(path, text.replace(/(from\s+|import\()(['"])(\.{1,2}\/[^'"]+?)\.tsx?\2/g, '$1$2$3.js$2'))
}

// The stylesheet: the @import lines of src/styles/index.css inlined, in order.
const entry = join(root, 'src/styles/index.css')
const index = await readFile(entry, 'utf8')
const parts: string[] = []
for (const line of index.split('\n')) {
  const match = /^@import '([^']+)';$/.exec(line.trim())
  if (!match) continue
  const target = match[1]!.startsWith('.') ? join(dirname(entry), match[1]!) : Bun.resolveSync(match[1]!, root)
  parts.push(`/* ${match[1]} */\n${await readFile(target, 'utf8')}`)
}
await writeFile(join(dist, 'styles.css'), parts.join('\n'))
console.log(`built ${result.outputs.length} module(s), declarations and styles.css`)
