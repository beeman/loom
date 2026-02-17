import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CSpellSettings } from 'cspell'

function findPackageJsonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules') return []
    const full = join(directory, e.name)
    return e.isDirectory() ? findPackageJsonFiles(full) : e.name === 'package.json' ? [full] : []
  })
}

function getAllDependencies(pkgPath: string): string[] {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  return [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies, pkg.optionalDependencies, pkg.catalog]
    .flatMap((deps) => Object.keys(deps || {}))
    .flatMap((dep) => dep.replace('@', '').split(/[/-]/))
}

export function getPackageNames(): string[] {
  const allDeps = new Set<string>(findPackageJsonFiles('.').flatMap(getAllDependencies))
  // @ts-expect-error we don't have a top-level tsconfig but this is all good
  return [...allDeps].sort()
}

const config: CSpellSettings = {
  dictionaries: ['fullstack', 'html', 'css'],
  ignorePaths: ['Cargo.toml', 'drizzle'],
  import: ['@cspell/dict-es-es/cspell-ext.json'],
  overrides: [
    {
      filename: '**/es/*.json',
      language: 'en, es',
    },
  ],
  useGitignore: true,
  words: [
    ...getPackageNames(),
    // English
    'autoincrement',
    'beeman',
    'checkpointing',
    'ellipsify',
    'hmac',
    'loom',
    'nums',
    'opencode',
    'pyproject',
    'pytest',
    'retryable',
    'rtishchev',
    'sandboxed',
    'sandboxing',
    'surfpool',
    'tobeycodes',
    'vitaly',
  ],
}

export default config
