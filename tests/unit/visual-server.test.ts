import { describe, expect, it } from 'vitest'

import {
  apiRunnerSecurityHeaders,
  runnerSecurityHeadersFor,
} from '../../scripts/serve-visual-test.mjs'

describe('visual runner CSP', () => {
  it('allows legacy evaluation only for the exact 2.1.1 npm baseline', () => {
    expect(
      runnerSecurityHeadersFor('local', { version: '2.1.1', source: 'npm' })[
        'Content-Security-Policy'
      ],
    ).not.toContain("'unsafe-eval'")
    expect(
      runnerSecurityHeadersFor('baseline', { version: '2.2.0', source: 'npm' })[
        'Content-Security-Policy'
      ],
    ).not.toContain("'unsafe-eval'")
    expect(
      runnerSecurityHeadersFor('baseline', { version: '2.1.1', source: 'local' })[
        'Content-Security-Policy'
      ],
    ).not.toContain("'unsafe-eval'")
    expect(
      runnerSecurityHeadersFor('baseline', { version: '2.1.1', source: 'npm' })[
        'Content-Security-Policy'
      ],
    ).toContain("'unsafe-eval'")
  })

  it('grants evaluation only to the API lab runner, not to the API lab page', () => {
    expect(apiRunnerSecurityHeaders['Content-Security-Policy']).toContain("'unsafe-eval'")
    expect(apiRunnerSecurityHeaders['Content-Security-Policy']).toContain('worker-src blob:')
    expect(apiRunnerSecurityHeaders['Cache-Control']).toBe('no-store')
    expect(apiRunnerSecurityHeaders['X-Content-Type-Options']).toBe('nosniff')
    expect(
      runnerSecurityHeadersFor('local', { version: '2.2.0', source: 'local' })[
        'Content-Security-Policy'
      ],
    ).not.toContain("'unsafe-eval'")
  })
})
