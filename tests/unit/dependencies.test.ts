import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

describe('parser dependencies', () => {
  it('uses the modern ES2017 toolchain without the legacy Babel layer', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      devDependencies: Record<string, string>
    }
    const tsconfig = JSON.parse(await readFile('tsconfig.base.json', 'utf8')) as {
      compilerOptions: { target: string }
    }

    expect(packageJson.devDependencies.fflate).toMatch(/^\^?\d/)
    expect(packageJson.devDependencies.protobufjs).toBe(
      'git+https://github.com/lijialiang/protobuf.js.git#b84b9b2d55ce07a0c9f28519054ce6b15ab092ca'
    )
    expect(packageJson.devDependencies).not.toHaveProperty('zlibjs')
    expect(packageJson.devDependencies).not.toHaveProperty('@babel/core')
    expect(packageJson.devDependencies).not.toHaveProperty('@babel/preset-env')
    expect(packageJson.devDependencies).not.toHaveProperty('@rollup/plugin-babel')
    expect(tsconfig.compilerOptions.target.toLowerCase()).toBe('es2017')
  })
})
