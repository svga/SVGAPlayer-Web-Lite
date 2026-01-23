import serve from 'rollup-plugin-serve'
import livereload from 'rollup-plugin-livereload'
import terser from '@rollup/plugin-terser'
import bannerPlugin from 'rollup-plugin-banner'
import { getBabelOutputPlugin } from '@rollup/plugin-babel'
import typescript from '@rollup/plugin-typescript'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import { inlineParser } from './scripts/plugins.mjs'

const banner = bannerPlugin.default ?? bannerPlugin

const FORMAT = process.env.FORMAT
const IS_TEST_ENV = process.env.NODE_ENV === 'test'
const FILE_NAME = 'index'
const TEST_DIR = '__test__'
const DIST_DIR = 'dist'
const UMD_NAME = 'SVGA'

const babelOutputPlugin = getBabelOutputPlugin({
  allowAllFormats: true,
  comments: false,
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          browsers: ['Android >= 10', 'iOS >= 14']
        }
      }
    ]
  ]
})

const onwarn = (warning, warn) => {
  if (warning.code !== 'DEPRECATION') {
    warn(warning)
  }
}

const basePlugins = [
  resolve({ preferBuiltins: true, browser: true }),
  commonjs(),
  typescript({
    tsconfig: IS_TEST_ENV ? 'tsconfig.test.json' : 'tsconfig.json'
  }),
  babelOutputPlugin
]

const config = [
  {
    onwarn,
    input: IS_TEST_ENV ? 'src/test.ts' : 'src/index.ts',
    output: {
      file: IS_TEST_ENV
        ? `${TEST_DIR}/${FILE_NAME}.js`
        : `${DIST_DIR}/${FILE_NAME}${FORMAT === 'umd' ? '' : `.${FORMAT}`}.min.js`,
      format: FORMAT,
      name: UMD_NAME,
      sourcemap: false
    },
    plugins: (() => {
      const plugins = [...basePlugins]
      if (IS_TEST_ENV) {
        plugins.push(serve({ contentBase: TEST_DIR, port: 5500 }))
        plugins.push(livereload({ delay: 810, watch: TEST_DIR, verbose: false }))
        plugins.push(inlineParser)
      } else {
        plugins.push(terser())
        plugins.push(banner('SVGA.Lite v<%= pkg.version %>'))
      }
      return plugins
    })()
  }
]

if (IS_TEST_ENV || FORMAT === 'umd') {
  config.unshift({
    onwarn,
    input: 'src/parser/index.ts',
    output: {
      file: IS_TEST_ENV ? `${TEST_DIR}/parser.js` : `${DIST_DIR}/parser.js`,
      format: 'iife'
    },
    plugins: (() => {
      const plugins = [...basePlugins]
      if (!IS_TEST_ENV) {
        plugins.push(terser())
      } else {
        plugins.push(inlineParser)
      }
      return plugins
    })()
  })
}

export default config
