import { access, readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

describe('parser dependencies', () => {
  it('uses the TypeScript 7 command-line build boundary', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      main: string
      module: string
      sideEffects: boolean
      exports: Record<string, Record<string, string>>
      devDependencies: Record<string, string>
    }
    const tsconfig = JSON.parse(await readFile('tsconfig.json', 'utf8')) as {
      compilerOptions: {
        lib: string[]
        module: string
        moduleResolution: string
        noEmit: boolean
        skipLibCheck: boolean
        strict: boolean
        target: string
      }
    }
    const buildConfig = JSON.parse(await readFile('tsconfig.build.json', 'utf8')) as {
      compilerOptions: {
        declaration: boolean
        declarationMap: boolean
        noEmit: boolean
        noEmitOnError: boolean
        rootDir: string
      }
      files: string[]
    }
    const [buildScript, verifyPackageScript] = await Promise.all([
      readFile('scripts/build.mjs', 'utf8'),
      readFile('scripts/verify-package.mjs', 'utf8')
    ])

    expect(packageJson.devDependencies.fflate).toMatch(/^\^?\d/)
    expect(packageJson.devDependencies.protobufjs).toBe(
      'git+https://github.com/lijialiang/protobuf.js.git#b84b9b2d55ce07a0c9f28519054ce6b15ab092ca'
    )
    expect(packageJson.devDependencies).not.toHaveProperty('zlibjs')
    expect(packageJson.devDependencies).not.toHaveProperty('@babel/core')
    expect(packageJson.devDependencies).not.toHaveProperty('@babel/preset-env')
    expect(packageJson.devDependencies).not.toHaveProperty('@rollup/plugin-babel')
    expect(packageJson.devDependencies).not.toHaveProperty('@rollup/plugin-typescript')
    expect(packageJson.devDependencies).not.toHaveProperty('tslib')
    expect(packageJson.devDependencies.typescript).toMatch(/^\^7\./)
    expect(packageJson.main).toBe('dist/index.cjs')
    expect(packageJson.module).toBe('dist/index.mjs')
    expect(packageJson.sideEffects).toBe(false)
    expect(packageJson.exports).toEqual({
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.mjs',
        require: './dist/index.cjs'
      }
    })
    expect(tsconfig.compilerOptions.target.toLowerCase()).toBe('es2017')
    expect(tsconfig.compilerOptions.module.toLowerCase()).toBe('esnext')
    expect(tsconfig.compilerOptions.moduleResolution.toLowerCase()).toBe('bundler')
    expect(tsconfig.compilerOptions.noEmit).toBe(true)
    expect(tsconfig.compilerOptions.strict).toBe(true)
    expect(tsconfig.compilerOptions.skipLibCheck).toBe(true)
    expect(tsconfig.compilerOptions.lib.map(value => value.toLowerCase())).toEqual([
      'es2017', 'dom', 'webworker'
    ])
    expect(buildConfig.files).toEqual(['src/index.ts', 'src/parser/index.ts'])
    expect(buildConfig.compilerOptions).toMatchObject({
      declaration: true,
      declarationMap: false,
      noEmit: false,
      noEmitOnError: true,
      rootDir: './src'
    })
    expect(buildScript).toContain("resolve('typescript/package.json')")
    expect(buildScript).not.toMatch(/from ['"]typescript['"]/)
    expect(buildScript).not.toMatch(/@rollup\/plugin-typescript/)
    expect(verifyPackageScript).toContain("resolve('typescript/package.json')")
    expect(verifyPackageScript).not.toMatch(/from ['"]typescript['"]/)
    await expect(access('tsconfig.base.json')).rejects.toThrow()
  })
})
