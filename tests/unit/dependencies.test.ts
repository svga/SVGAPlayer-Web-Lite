import { access, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

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
    const [buildScript, verifyPackageScript, readme] = await Promise.all([
      readFile('scripts/build.mjs', 'utf8'),
      readFile('scripts/verify-package.mjs', 'utf8'),
      readFile('README.md', 'utf8')
    ])

    expect(packageJson.devDependencies.fflate).toMatch(/^\^?\d/)
    expect(packageJson.devDependencies.protobufjs).toBe('^8.7.2')
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
    expect(buildScript).toContain('const maxBundleRawBytes = 90112')
    expect(buildScript).toContain('const maxBundleGzipBytes = 25600')
    expect(verifyPackageScript).toContain('const maxBundleRawBytes = 90112')
    expect(verifyPackageScript).toContain('const maxBundleGzipBytes = 25600')
    expect(readme).toContain('单个 JavaScript 产物 < 88 KiB（gzip < 25 KiB）')
    await expect(access('tsconfig.base.json')).rejects.toThrow()
  })

  it('commits a provenance-tracked decode-only static SVGA decoder', async () => {
    const [schema, decoder, provenance, workerEntry] = await Promise.all([
      readFile('src/parser/svga.proto', 'utf8'),
      readFile('src/parser/svga.generated.ts', 'utf8'),
      readFile('src/parser/PROTOBUF_PROVENANCE.md', 'utf8'),
      readFile('src/parser/index.ts', 'utf8')
    ])

    expect(schema).toContain('message MovieEntity')
    expect(createHash('sha256').update(schema).digest('hex')).toBe('12f395148ae23ff04bcf0e39937b3f804edad5d57fbd7b7e6b5e04e49adb17b8')
    expect(decoder).toContain('protobufjs/minimal.js')
    expect(decoder).toContain('MovieEntity.decode')
    expect(decoder).not.toMatch(/Root\.fromJSON|\beval\b|\bFunction\b/)
    expect(decoder).not.toContain('.encode =')
    expect(decoder).not.toContain('.verify =')
    expect(decoder).not.toContain('.fromObject =')
    expect(decoder).not.toContain('.toObject =')
    expect(provenance).toContain('protobufjs-cli@2.6.2')
    expect(provenance).toContain('12f395148ae23ff04bcf0e39937b3f804edad5d57fbd7b7e6b5e04e49adb17b8')
    expect(provenance).toContain('--no-encode')
    expect(workerEntry).not.toMatch(/\beval\b|\bFunction\b/)
  })
})
