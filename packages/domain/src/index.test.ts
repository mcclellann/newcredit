import { describe, expect, it } from 'vitest'
import { assertTransition, aud } from './index.js'

describe('domain primitives', () => {
  it('converts decimal fixture amounts to integer cents', () => {
    expect(aud('679.29')).toEqual({ amountMinor: 67929, currency: 'AUD' })
    expect(aud('0.29')).toEqual({ amountMinor: 29, currency: 'AUD' })
    expect(aud('-1184.93')).toEqual({ amountMinor: -118493, currency: 'AUD' })
    expect(() => aud('10.999')).toThrow('Invalid AUD amount')
  })

  it('allows only the next workflow transition', () => {
    expect(() => assertTransition('ready_to_submit', 'submitted')).not.toThrow()
    expect(() => assertTransition('ready_to_submit', 'not_approved')).not.toThrow()
    expect(() => assertTransition('ready_to_submit', 'funded')).toThrow(
      'Invalid application transition',
    )
  })
})
