import '@testing-library/jest-dom/vitest'

// jsdom has no layout or viewport scrolling; browser checks cover navigation position.
window.scrollTo = () => {}

Object.defineProperty(globalThis, 'crypto', {
  value: { ...globalThis.crypto, randomUUID: () => 'test-idempotency-key' },
})
