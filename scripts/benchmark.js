const path = require('path')
const browserSync = require('browser-sync')

const BrowserSyncOptions = {
  server: {
    baseDir: path.resolve(__dirname, '../'),
    directory: true
  },
  https: false,
  ui: false,
  notify: false,
  ghostMode: false,
  port: 8080,
  open: true,
  timestamps: true
}

browserSync(BrowserSyncOptions)
