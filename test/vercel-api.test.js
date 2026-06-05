import assert from 'node:assert/strict'
import test from 'node:test'

import handler from '../api/transcribe.js'

test('Vercel API reports missing Replicate token instead of returning 404', async () => {
  const previousToken = process.env.REPLICATE_API_TOKEN
  delete process.env.REPLICATE_API_TOKEN

  const req = {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: {
      audioUrl: 'https://example.com/audio.mp3'
    }
  }
  const res = createResponse()

  try {
    await handler(req, res)
  } finally {
    if (previousToken === undefined) {
      delete process.env.REPLICATE_API_TOKEN
    } else {
      process.env.REPLICATE_API_TOKEN = previousToken
    }
  }

  assert.equal(res.statusCode, 500)
  assert.match(res.payload.error, /Missing REPLICATE_API_TOKEN/)
})

function createResponse() {
  return {
    statusCode: null,
    payload: null,
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
    json(payload) {
      this.payload = payload
      return this
    }
  }
}
