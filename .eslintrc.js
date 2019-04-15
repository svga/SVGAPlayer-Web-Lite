'use strict'

module.exports = {
  parser: 'typescript-eslint-parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: false
    }
  },
  extends: [
    'standard'
  ],
  plugins: [
    'typescript'
  ],
  rules: {
    'eqeqeq': 'off',
    'no-undef': 'off',
    'no-unused-vars': 'off',
    'space-infix-ops': 'off',
    'strict': 'off',
    'no-dupe-class-members': 'off',
    'no-use-before-define': 'off'
  }
}
