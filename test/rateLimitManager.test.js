import test from 'node:test'
import assert from 'node:assert/strict'

import {
  backoffRemainingMs,
  isBlocked,
  record429,
  recordSuccess,
  resetRateLimitState,
} from '../src/api/rateLimitManager.js'

test('rate-limit state is isolated per bucket', () => {
  resetRateLimitState()

  record429(30, 'detail')

  assert.equal(isBlocked('detail'), true)
  assert.equal(isBlocked('feed'), false)
  assert.equal(backoffRemainingMs('feed'), 0)
})

test('success clears only the targeted bucket', () => {
  resetRateLimitState()

  record429(30, 'feed')
  record429(30, 'detail')
  recordSuccess('detail')

  assert.equal(isBlocked('detail'), false)
  assert.equal(isBlocked('feed'), true)
})

test('header-based backoff is capped to a sane retry window', () => {
  resetRateLimitState()

  record429(24 * 60 * 60, 'feed')

  assert.equal(isBlocked('feed'), true)
  assert.ok(backoffRemainingMs('feed') <= 5 * 60 * 1000)
})
