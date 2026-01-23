import serve from 'rollup-plugin-serve'
import livereload from 'rollup-plugin-livereload'
import terser from '@rollup/plugin-terser'
import bannerPlugin from 'rollup-plugin-banner'
import { getBabelOutputPlugin } from '@rollup/plugin-babel'
import typescript from '@rollup/plugin-typescript'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'

const banner = bannerPlugin.default ?? bannerPlugin

const IS_TEST_ENV = process.env.NODE_ENV === 'test'
const TEST_DIR = '__test__'
const DIST_DIR = 'dist'

const babelOutputPlugin = getBabelOutputPlugin({
  allowAllFormats: true,
  comments: false,
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          browsers: ['Android >= 10', 'iOS >= 14']
        },
        modules: false
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

const libraryPlugins = (() => {
  const plugins = [...basePlugins]
  if (IS_TEST_ENV) {
    plugins.push(serve({ contentBase: TEST_DIR, port: 5500 }))
    plugins.push(livereload({ delay: 810, watch: TEST_DIR, verbose: false }))
  } else {
    plugins.push(terser())
    plugins.push(banner('SVGA.Lite v<%= pkg.version %>'))
  }
  return plugins
})()

const workerPlugins = (() => {
  const plugins = [...basePlugins]
  if (!IS_TEST_ENV) {
    plugins.push(terser())
  }
  return plugins
})()

const config = [
  {
    onwarn,
    input: IS_TEST_ENV ? 'src/test.ts' : 'src/index.ts',
    output: {
      file: IS_TEST_ENV ? `${TEST_DIR}/index.js` : `${DIST_DIR}/index.js`,
      format: 'esm',
      sourcemap: false
    },
    plugins: libraryPlugins
  },
  {
    onwarn,
    input: 'src/parser/worker-entry.ts',
    output: {
      file: IS_TEST_ENV ? `${TEST_DIR}/parser.worker.js` : `${DIST_DIR}/parser.worker.js`,
      format: 'esm',
      sourcemap: false
    },
    plugins: workerPlugins
  }
]

export default config
