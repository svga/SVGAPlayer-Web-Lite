const path = require('path')
const webpack = require('webpack')
const config = require('./webpack.config.js')
const inlineWorker = require('./inline-worker')

webpack(config, (error, stats) => {
  if (error || stats.hasErrors()) {
    console.error(error)
  } else {
    inlineWorker()

    console.log('>>> finish <<<')

    process.exit(0)
  }
})
