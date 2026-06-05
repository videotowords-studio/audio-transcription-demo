import assert from 'node:assert/strict'
import test from 'node:test'

import { getReplicateApiToken } from '../src/config.js'

test('getReplicateApiToken returns an empty value when env is empty', () => {
  assert.equal(getReplicateApiToken({ REPLICATE_API_TOKEN: '' }), '')
})

test('getReplicateApiToken lets env override the project constant', () => {
  assert.equal(
    getReplicateApiToken({ REPLICATE_API_TOKEN: 'runtime-token' }),
    'runtime-token'
  )
})
