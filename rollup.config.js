import serve from 'rollup-plugin-serve'
import livereload from 'rollup-plugin-livereload'
import { terser } from 'rollup-plugin-terser'
import banner from 'rollup-plugin-banner'
import { getBabelOutputPlugin } from '@rollup/plugin-babel'
import typescript from 'rollup-plugin-typescript2'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import wasm from '@rollup/plugin-wasm'
import { inlineParserPlugin } from './scripts/plugins.mjs'

const FORMAT = process.env.FORMAT
const IS_TEST_ENV = process.env.NODE_ENV === 'test'
const DIST_FILE_NAME = 'index'
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
          browsers: [
            'Android >= 4.4',
            'iOS >= 9.0'
          ]
        }
      }
    ]
  ]
})

const config = [
  {
    onwarn () {},
    input: IS_TEST_ENV ? 'src/test.ts' : 'src/index.ts',
    output: {
      file: IS_TEST_ENV ? `${TEST_DIR}/${DIST_FILE_NAME}.js` : `${DIST_DIR}/${DIST_FILE_NAME}${FORMAT === 'umd' ? '' : `.${FORMAT}`}.min.js`,
      format: FORMAT,
      name: UMD_NAME,
      sourcemap: false
    },
    plugins: [
      resolve({ jsnext: true, preferBuiltins: true, browser: true }),
      commonjs(),
      typescript({
        tsconfig: IS_TEST_ENV ? 'tsconfig.test.json' : 'tsconfig.json'
      }),
      babelOutputPlugin,
      IS_TEST_ENV && serve(TEST_DIR),
      IS_TEST_ENV && livereload({
        delay: 810,
        watch: TEST_DIR,
        verbose: false
      }),
      !IS_TEST_ENV && terser(),
      !IS_TEST_ENV && banner('SVGA.Lite v<%= pkg.version %>'),
      IS_TEST_ENV && inlineParserPlugin()
    ]
  }
]

// Configuration for the parser worker
if (IS_TEST_ENV || FORMAT === 'umd') { // Keep UMD condition if parser is also built for UMD standalone
  config.unshift({
    onwarn () {}, // Suppress warnings if any
    input: 'src/parser/index.ts',
    output: {
      file: IS_TEST_ENV ? `${TEST_DIR}/parser.js` : `${DIST_DIR}/parser.js`,
      format: 'iife', // Parser is an IIFE to be injected
      name: 'SVGAParserWorker' // Give it a name for the IIFE context
    },
    plugins: [
      resolve({ jsnext: true, preferBuiltins: true, browser: true }),
      commonjs(),
      wasm({
        maxFileSize: 1000000, // Inline WASM modules up to 1MB
        // targetEnv: 'auto-inline', // DEPRECATED, maxFileSize is preferred
        // For true self-contained worker, inlining is best.
        // If not inlining, wasm files are copied to output dir, and paths are rewritten.
        // This might be complex for Blob workers if paths are not relative or easily determinable.
      }),
      typescript({
        tsconfig: IS_TEST_ENV ? 'tsconfig.test.json' : 'tsconfig.json',
        check: false // Potentially disable strict type checking for faster worker builds if needed
      }),
      babelOutputPlugin, // Apply Babel transformations
      !IS_TEST_ENV && terser() // Minify if not test environment
      // Remove inlineParser from here; it's handled by the main test bundle
    ]
  })
}

export default config
