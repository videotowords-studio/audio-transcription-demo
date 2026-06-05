import { getReplicateApiToken } from '../src/config.js'
import {
  buildPlainText,
  buildSongLyricsLines,
  buildSongLyricsText,
  buildSubtitleLines,
  ensureLineBreaks,
  transformWhisperXToAlignedWords
} from '../src/transcription-utils.js'

const maxUploadBytes = Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024)
const whisperxModel =
  process.env.WHISPERX_MODEL ||
  'victor-upmeet/whisperx:84d2ad2d6194fe98a17d2b60bef1c7f910c46b2f6fd38996ca457afd9c8abfcb'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const replicateApiToken = getReplicateApiToken()
  if (!replicateApiToken) {
    sendJson(res, 500, {
      error: 'Missing REPLICATE_API_TOKEN. Set it in Vercel project environment variables.'
    })
    return
  }

  try {
    const contentType = req.headers['content-type'] || ''
    let audioFile
    let audioUrl

    if (contentType.includes('multipart/form-data')) {
      const body = await readRequestBody(req, maxUploadBytes)
      const boundary = getBoundary(contentType)
      if (!boundary) {
        sendJson(res, 400, { error: 'Missing multipart boundary.' })
        return
      }

      const form = parseMultipartForm(body, boundary)
      audioFile = form.files.audio
      audioUrl = form.fields.audioUrl?.trim()
    } else if (contentType.includes('application/json')) {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
      audioUrl = typeof payload.audioUrl === 'string' ? payload.audioUrl.trim() : ''
    } else {
      sendJson(res, 415, { error: 'Use multipart/form-data or application/json.' })
      return
    }

    const audioFileInput = audioFile?.data?.length
      ? bufferToDataUrl(audioFile.data, audioFile.contentType || 'application/octet-stream')
      : audioUrl

    if (!audioFileInput) {
      sendJson(res, 400, { error: 'Upload an audio file or provide an audio URL.' })
      return
    }

    if (audioUrl && !audioFile?.data?.length && !isHttpUrl(audioUrl)) {
      sendJson(res, 400, { error: 'audioUrl must be an http(s) URL.' })
      return
    }

    const startedAt = Date.now()
    const whisperxOutput = await runWhisperX(audioFileInput, replicateApiToken)
    const alignedWords = ensureLineBreaks(transformWhisperXToAlignedWords(whisperxOutput))

    sendJson(res, 200, {
      language: whisperxOutput.language || null,
      durationMs: Date.now() - startedAt,
      text: buildPlainText(alignedWords),
      lyricsText: buildSongLyricsText(alignedWords),
      lyricsLines: buildSongLyricsLines(alignedWords),
      subtitleLines: buildSubtitleLines(alignedWords),
      alignedWords,
      raw: whisperxOutput
    })
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Internal server error'
    })
  }
}

async function runWhisperX(audioFile, replicateApiToken) {
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${replicateApiToken}`,
      'Content-Type': 'application/json',
      Prefer: 'wait'
    },
    body: JSON.stringify({
      version: getReplicateVersion(whisperxModel),
      input: {
        audio_file: audioFile,
        align_output: true,
        batch_size: 8
      }
    })
  })

  const prediction = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      prediction?.detail || prediction?.error || `Replicate request failed: ${response.status}`
    )
  }

  const completed = await waitForPrediction(prediction, replicateApiToken)
  if (completed.status !== 'succeeded') {
    throw new Error(completed.error || `Replicate prediction ${completed.status}`)
  }

  return normalizeWhisperXOutput(completed.output)
}

async function waitForPrediction(initialPrediction, replicateApiToken) {
  let prediction = initialPrediction
  const startedAt = Date.now()
  const timeoutMs = Number(process.env.REPLICATE_TIMEOUT_MS || 5 * 60 * 1000)

  while (
    prediction.status !== 'succeeded' &&
    prediction.status !== 'failed' &&
    prediction.status !== 'canceled'
  ) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Replicate prediction timed out.')
    }

    await delay(1500)
    const getUrl = prediction.urls?.get
    if (!getUrl) {
      throw new Error('Replicate prediction did not include a polling URL.')
    }

    const response = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${replicateApiToken}` }
    })
    prediction = await response.json()

    if (!response.ok) {
      throw new Error(prediction?.detail || `Replicate polling failed: ${response.status}`)
    }
  }

  return prediction
}

function normalizeWhisperXOutput(output) {
  if (!output) return { segments: [] }
  if (Array.isArray(output)) return { segments: output }
  if (Array.isArray(output.segments)) return output
  return { segments: [], rawOutput: output }
}

function getReplicateVersion(model) {
  const parts = model.split(':')
  return parts.length > 1 ? parts.at(-1) : model
}

function readRequestBody(req, maxBytes) {
  return new Promise((resolveBody, reject) => {
    const chunks = []
    let size = 0

    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error(`Request body exceeds ${Math.round(maxBytes / 1024 / 1024)} MB.`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => resolveBody(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function parseMultipartForm(body, boundary) {
  const fields = {}
  const files = {}
  const boundaryText = `--${boundary}`
  const parts = body.toString('binary').split(boundaryText).slice(1, -1)

  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r\n/, '').replace(/\r\n$/, '')
    const separatorIndex = part.indexOf('\r\n\r\n')
    if (separatorIndex === -1) continue

    const rawHeaders = part.slice(0, separatorIndex)
    const rawContent = part.slice(separatorIndex + 4)
    const headers = parsePartHeaders(rawHeaders)
    const disposition = headers['content-disposition'] || ''
    const name = disposition.match(/name="([^"]+)"/)?.[1]
    const filename = disposition.match(/filename="([^"]*)"/)?.[1]

    if (!name) continue

    const contentBuffer = Buffer.from(rawContent, 'binary')
    if (filename) {
      files[name] = {
        filename,
        contentType: headers['content-type'] || 'application/octet-stream',
        data: contentBuffer
      }
    } else {
      fields[name] = contentBuffer.toString('utf8')
    }
  }

  return { fields, files }
}

function parsePartHeaders(rawHeaders) {
  const headers = {}
  for (const line of rawHeaders.split('\r\n')) {
    const index = line.indexOf(':')
    if (index === -1) continue
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim()
  }
  return headers
}

function getBoundary(contentType) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)
  return match?.[1] || match?.[2]
}

function bufferToDataUrl(buffer, contentType) {
  return `data:${contentType};base64,${buffer.toString('base64')}`
}

function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload)
}

function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}
