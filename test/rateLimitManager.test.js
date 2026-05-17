import test from 'node:test'
import assert from 'node:assert/strict'

import {
  backoffRemainingMs,
  getState,
  isBlocked,
  record429,
  recordSuccess,
} from '../src/api/rateLimitManager.js'

function withPatchedNow(fn) {
  const originalNow = Date.now
  let now = 1_700_000_000_000
  Date.now = () => now

  const clock = {
    now: () => now,
    advance: ms => {
      now += ms
    },
  }

  try {
    fn(clock)
  } finally {
    Date.now = originalNow
    recordSuccess()
  }
}

test('record429 uses Retry-After seconds when present', () => {
  withPatchedNow(clock => {
    recordSuccess()
    const start = clock.now()
    record429(42)

    const state = getState()
    assert.equal(state.consecutiveErrors, 1)
    assert.equal(state.lastErrorAt, start)
    assert.equal(state.lastBackoffMs, 42_000)
    assert.equal(state.backoffUntil, start + 42_000)
    assert.equal(isBlocked(), true)
    assert.equal(backoffRemainingMs(), 42_000)

    clock.advance(10_000)
    assert.equal(backoffRemainingMs(), 32_000)

    clock.advance(32_000)
    assert.equal(isBlocked(), false)
    assert.equal(backoffRemainingMs(), 0)
  })
})

test('record429 jitter path is deterministic with stubbed random and honors cap', () => {
  const originalRandom = Math.random
  try {
    withPatchedNow(clock => {
      recordSuccess()

      Math.random = () => 0
      const firstStart = clock.now()
      record429()
      let state = getState()
      assert.equal(state.lastBackoffMs, 30_000)
      assert.equal(state.backoffUntil, firstStart + 30_000)

      Math.random = () => 1
      const secondStart = clock.now()
      record429()
      state = getState()
      assert.equal(state.lastBackoffMs, 90_000)
      assert.equal(state.backoffUntil, secondStart + 90_000)

      for (let i = 0; i < 8; i++) {
        const start = clock.now()
        record429()
        state = getState()
        assert.ok(state.lastBackoffMs <= 300_000)
        assert.equal(state.backoffUntil, start + state.lastBackoffMs)
      }
    })
  } finally {
    Math.random = originalRandom
  }
})

test('recordSuccess fully resets limiter state', () => {
  withPatchedNow(() => {
    record429(5)
    assert.equal(isBlocked(), true)

    recordSuccess()
    const state = getState()
    assert.equal(state.consecutiveErrors, 0)
    assert.equal(state.lastBackoffMs, 0)
    assert.equal(state.backoffUntil, null)
    assert.equal(state.lastErrorAt, null)
    assert.equal(isBlocked(), false)
    assert.equal(backoffRemainingMs(), 0)
  })
})
