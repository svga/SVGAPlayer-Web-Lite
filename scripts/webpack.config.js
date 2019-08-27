const path = require('path')
const webpack = require('webpack')
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')

const { version } = require('../package.json')

const banner =
`[name]

Version: ${version}
Document: https://github.com/yyued/SVGAPlayer-Web/tree/lite
(c) 2019 YY.SVGA
Released under the MIT License.`

const defaultConfig = {
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.raw$/,
        use: [
          'raw-loader'
        ]
      },
      {
        test: /\.js$/,
        use: [
          'babel-loader'
        ]
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          'babel-loader',
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true
            }
          }
        ]
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.ts']
  },
  context: path.resolve(__dirname, '../'),
  watch: true,
  watchOptions: {
    aggregateTimeout: 300,
    poll: 1000,
    ignored: /node_modules/
  },
  performance: {
    maxEntrypointSize: 300000,
    maxAssetSize: 300000
  }
}

const outputPath = path.resolve(__dirname, `../${process.env.NODE_ENV === 'test' ? 'tests' : ''}`)

const ForkTsCheckerWebpackPluginConfig = new ForkTsCheckerWebpackPlugin({
  workers: 2,
  formatter: 'codeframe'
})

module.exports = [
  {
    entry: {
      'svga.lite': './core/index.ts'
    },
    output: {
      path: outputPath,
      filename: '[name].min.js',
      libraryTarget: 'umd',
      library: 'SVGA',
      libraryExport: 'default'
    },
    plugins: [
      ForkTsCheckerWebpackPluginConfig,
      new webpack.BannerPlugin(banner)
    ],
    ...defaultConfig
  },
  {
    entry: {
      'parser.worker': './core/parser.worker/index.ts'
    },
    output: {
      path: outputPath,
      filename: '[name].min.js'
    },
    plugins: [
      ForkTsCheckerWebpackPluginConfig
    ],
    ...defaultConfig
  },
  {
    entry: {
      'parser.1x': './core/parser.1x/index.ts'
    },
    output: {
      path: outputPath,
      filename: '[name].js',
      libraryTarget: 'umd',
      library: 'SVGAParser1x',
      libraryExport: 'default'
    },
    plugins: [
      ForkTsCheckerWebpackPluginConfig,
      new webpack.BannerPlugin(banner)
    ],
    ...defaultConfig
  },
  {
    entry: {
      'parser1x.worker': './core/parser.1x/worker.js'
    },
    output: {
      path: outputPath,
      filename: '[name].min.js'
    },
    plugins: [
      ForkTsCheckerWebpackPluginConfig
    ],
    ...defaultConfig
  },
  {
    entry: {
      'util': './core/util.ts'
    },
    output: {
      path: outputPath,
      filename: '[name].js',
      libraryTarget: 'umd',
      library: 'SVGAUtil'
    },
    plugins: [
      ForkTsCheckerWebpackPluginConfig,
      new webpack.BannerPlugin(banner)
    ],
    ...defaultConfig
  },
  {
    entry: {
      'db': './core/db.ts'
    },
    output: {
      path: outputPath,
      filename: '[name].js',
      libraryTarget: 'umd',
      library: 'SVGADB',
      libraryExport: 'default'
    },
    plugins: [
      ForkTsCheckerWebpackPluginConfig,
      new webpack.BannerPlugin(banner)
    ],
    ...defaultConfig
  }
]
