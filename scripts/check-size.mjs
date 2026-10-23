import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import {
  distDir,
  MAX_BUNDLE_GZIP_BYTES,
  MAX_BUNDLE_RAW_BYTES,
  OUTPUTS,
  PUBLIC_DECLARATION_FILES,
  WORKER_PLACEHOLDER,
} from './lib/contract.mjs'

const publicDeclarationSet = new Set(PUBLIC_DECLARATION_FILES)
const importPattern = /(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(path)))
    else if (entry.isFile()) files.push(path)
  }
  return files.sort()
}

function toDeclarationPath(file) {
  return relative(distDir, file).replaceAll('\\', '/')
}

async function resolveDeclaration(from, specifier) {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(from), specifier.replace(/\.[cm]?js$/, ''))
  for (const candidate of [
    `${base}.d.ts`,
    `${base}.d.mts`,
    join(base, 'index.d.ts'),
    join(base, 'index.d.mts'),
  ]) {
    try {
      await readFile(candidate)
      return toDeclarationPath(candidate)
    } catch {}
  }
  return null
}

async function verifyDeclarations() {
  const declarations = (await listFiles(distDir))
    .filter((path) => path.endsWith('.d.ts') || path.endsWith('.d.mts'))
    .map(toDeclarationPath)
  assert.deepEqual(
    declarations,
    [...PUBLIC_DECLARATION_FILES].sort(),
    'dist declarations do not match the public allowlist',
  )

  for (const declaration of PUBLIC_DECLARATION_FILES) {
    const source = await readFile(join(distDir, declaration), 'utf8')
    for (const match of source.matchAll(importPattern)) {
      const target = await resolveDeclaration(join(distDir, declaration), match[1])
      if (target === null) continue
      assert(
        publicDeclarationSet.has(target),
        `${declaration} imports non-public declaration ${target}`,
      )
    }
  }
}

function countMatches(source, pattern) {
  return source.match(pattern)?.length ?? 0
}

async function main() {
  const rows = []
  for (const output of OUTPUTS) {
    const bytes = await readFile(resolve(distDir, output.file))
    const source = bytes.toString('utf8')
    const rawSize = bytes.byteLength
    const gzipSize = gzipSync(bytes, { level: 9 }).byteLength

    assert(rawSize < MAX_BUNDLE_RAW_BYTES, `${output.file} exceeds the 88 KiB raw bundle limit`)
    assert(gzipSize < MAX_BUNDLE_GZIP_BYTES, `${output.file} exceeds the 25 KiB gzip bundle limit`)
    assert(
      !source.includes(WORKER_PLACEHOLDER),
      `${output.file} still contains the worker placeholder`,
    )
    assert.equal(
      countMatches(source, /new\s+Function\b/g),
      1,
      `${output.file} must contain exactly one new Function`,
    )

    rows.push({
      file: output.file,
      raw: rawSize,
      gzip: gzipSize,
      rawHeadroom: MAX_BUNDLE_RAW_BYTES - rawSize,
      gzipHeadroom: MAX_BUNDLE_GZIP_BYTES - gzipSize,
    })
  }

  await verifyDeclarations()

  console.log('artifact            raw      gzip     raw headroom  gzip headroom')
  for (const row of rows) {
    console.log(
      `${row.file.padEnd(18)} ${String(row.raw).padStart(8)} ${String(row.gzip).padStart(8)} ` +
        `${String(row.rawHeadroom).padStart(13)} ${String(row.gzipHeadroom).padStart(13)}`,
    )
  }
}

await main()
