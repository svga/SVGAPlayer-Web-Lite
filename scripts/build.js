const path = require('path')
const webpack = require('webpack')
const config = require('./webpack.config.js')
const inlineWorker = require('./inline-worker')

webpack(config, (error, stats) => {
  if (error || stats.hasErrors()) {
    error && console.error(error)
    stats.hasErrors() && console.error(stats.toString({
      chunks: false,
      colors: true
    }))
  } else {
    inlineWorker()

    console.log('>>> finish <<<')

    process.exit(0)
  }
})
