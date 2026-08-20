import { describe, expect, it } from 'vitest'

import { runnerSecurityHeadersFor } from '../../scripts/serve-visual-test.mjs'

describe('visual runner CSP', () => {
  it('allows legacy evaluation only for the exact 2.1.1 npm baseline', () => {
    expect(runnerSecurityHeadersFor('local', { version: '2.1.1', source: 'npm' })['Content-Security-Policy']).not.toContain("'unsafe-eval'")
    expect(runnerSecurityHeadersFor('baseline', { version: '2.2.0', source: 'npm' })['Content-Security-Policy']).not.toContain("'unsafe-eval'")
    expect(runnerSecurityHeadersFor('baseline', { version: '2.1.1', source: 'local' })['Content-Security-Policy']).not.toContain("'unsafe-eval'")
    expect(runnerSecurityHeadersFor('baseline', { version: '2.1.1', source: 'npm' })['Content-Security-Policy']).toContain("'unsafe-eval'")
  })
})
