import { resolve } from 'node:path'

export const projectDir = resolve(import.meta.dirname, '../..')
export const distDir = resolve(projectDir, 'dist')

export const WORKER_PLACEHOLDER = '#PARSER_V2_INLINE_WROKER#'
export const MAX_BUNDLE_RAW_BYTES = 90112
export const MAX_BUNDLE_GZIP_BYTES = 25600
export const MAX_TARBALL_BYTES = 100000
export const MAX_UNPACKED_BYTES = 320000

export const PUBLIC_DECLARATIONS = [
  'index.d.ts',
  'db.d.ts',
  'parser.d.ts',
  'player/index.d.ts',
  'types.d.ts',
]

export const OUTPUTS = [
  { file: 'index.min.js', format: 'umd', name: 'SVGA' },
  { file: 'index.cjs', format: 'cjs' },
  { file: 'index.mjs', format: 'es' },
]

export const EXPECTED_EXPORTS = ['DB', 'Parser', 'Player']

export const EXPECTED_PACK_FILES = [
  'LICENSE',
  'README.md',
  'THIRD_PARTY_NOTICES',
  'dist/db.d.ts',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/index.min.js',
  'dist/index.mjs',
  'dist/parser.d.ts',
  'dist/player/index.d.ts',
  'dist/types.d.ts',
  'package.json',
].sort()
