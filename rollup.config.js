import serve from 'rollup-plugin-serve'
import livereload from 'rollup-plugin-livereload'
import { terser } from 'rollup-plugin-terser'
import banner from 'rollup-plugin-banner'
import { getBabelOutputPlugin } from '@rollup/plugin-babel'
import typescript from 'rollup-plugin-typescript2'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import { inlineParser } from './scripts/plugins'

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
      IS_TEST_ENV && inlineParser
    ]
  }
]

if (IS_TEST_ENV || FORMAT === 'umd') {
  config.unshift({
    onwarn () {},
    input: 'src/parser/index.ts',
    output: {
      file: IS_TEST_ENV ? `${TEST_DIR}/parser.js` : `${DIST_DIR}/parser.js`,
      format: 'iife'
    },
    plugins: [
      resolve({ jsnext: true, preferBuiltins: true, browser: true }),
      commonjs(),
      typescript({
        tsconfig: IS_TEST_ENV ? 'tsconfig.test.json' : 'tsconfig.json'
      }),
      babelOutputPlugin,
      !IS_TEST_ENV && terser(),
      IS_TEST_ENV && inlineParser
    ]
  })
}

export default config
