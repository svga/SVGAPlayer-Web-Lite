import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { projectDir } from './lib/contract.mjs'

for (const target of ['dist', 'coverage', 'test-results', 'playwright-report']) {
  await rm(resolve(projectDir, target), { force: true, recursive: true })
}
