import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPlainText,
  buildSongLyricsText,
  buildSubtitleLines,
  ensureLineBreaks,
  transformWhisperXToAlignedWords
} from '../src/transcription-utils.js'

test('transformWhisperXToAlignedWords keeps word timings and marks segment endings', () => {
  const output = {
    language: 'en',
    segments: [
      {
        start: 0,
        end: 1.1,
        text: 'Hello world',
        words: [
          { word: 'Hello', start: 0.1, end: 0.4 },
          { word: 'world', start: 0.5, end: 1.0 }
        ]
      },
      {
        start: 1.2,
        end: 1.8,
        text: 'Again',
        words: [{ word: 'Again', start: 1.25, end: 1.7 }]
      }
    ]
  }

  assert.deepEqual(transformWhisperXToAlignedWords(output), [
    { word: 'Hello ', success: true, startS: 0.1, endS: 0.4, palign: 0 },
    { word: 'world\n', success: true, startS: 0.5, endS: 1.0, palign: 0 },
    { word: 'Again\n', success: true, startS: 1.25, endS: 1.7, palign: 0 }
  ])
})

test('transformWhisperXToAlignedWords falls back to segment text when word timings are absent', () => {
  const output = {
    segments: [{ start: 2, end: 4, text: 'No word timings here' }]
  }

  assert.deepEqual(transformWhisperXToAlignedWords(output), [
    { word: 'No word timings here\n', success: true, startS: 2, endS: 4, palign: 0 }
  ])
})

test('ensureLineBreaks caps long English lines', () => {
  const words = 'one two three four five six seven eight nine'
    .split(' ')
    .map((word, index) => ({
      word: `${word} `,
      success: true,
      startS: index,
      endS: index + 0.5,
      palign: 0
    }))

  const result = ensureLineBreaks(words, 4)

  assert.equal(result[3].word, 'four\n')
  assert.equal(result[7].word, 'eight\n')
})

test('buildPlainText removes timing line breaks without collapsing words', () => {
  const words = [
    { word: 'Hello ', success: true, startS: 0, endS: 0.2, palign: 0 },
    { word: 'world\n', success: true, startS: 0.3, endS: 0.8, palign: 0 },
    { word: 'Again\n', success: true, startS: 1, endS: 1.4, palign: 0 }
  ]

  assert.equal(buildPlainText(words), 'Hello world Again')
})

test('buildSubtitleLines groups words by line breaks and timings', () => {
  const words = [
    { word: 'Hello ', success: true, startS: 0, endS: 0.2, palign: 0 },
    { word: 'world\n', success: true, startS: 0.3, endS: 0.8, palign: 0 },
    { word: 'Again\n', success: true, startS: 1, endS: 1.4, palign: 0 }
  ]

  assert.deepEqual(buildSubtitleLines(words), [
    { text: 'Hello world', startS: 0, endS: 0.8 },
    { text: 'Again', startS: 1, endS: 1.4 }
  ])
})

test('buildSongLyricsText formats transcription like editable song lyrics', () => {
  const words = [
    ['You', 0],
    ['woke', 0.2],
    ['up', 0.4],
    ['heavy.', 0.7],
    ['I', 1.4],
    ['saw', 1.6],
    ['it', 1.8],
    ['in', 2],
    ['your', 2.2],
    ['face.', 2.5],
    ['Too', 3.3],
    ['much', 3.5],
    ['weather', 3.7],
    ['in', 4],
    ['one', 4.2],
    ['small', 4.4],
    ['place.', 4.7],
    ['But', 5.6],
    ['I', 5.8],
    ['know', 6],
    ['your', 6.2],
    ['hand', 6.4],
    ['is', 6.6],
    ['in', 6.8],
    ['all', 7],
    ['how', 7.2],
    ['to', 7.4],
    ['hold', 7.6],
    ['even', 7.8],
    ['when', 8],
    ['the', 8.2],
    ['night', 8.4],
    ['gets', 8.6],
    ['sharp', 8.8],
    ['and', 9],
    ['cold.', 9.2]
  ].map(([word, start], index, source) => ({
    word: `${word} `,
    success: true,
    startS: start,
    endS: index === source.length - 1 ? start + 0.25 : source[index + 1][1] - 0.05,
    palign: 0
  }))

  assert.equal(
    buildSongLyricsText(words),
    [
      'You woke up heavy.',
      'I saw it in your face.',
      'Too much weather',
      'in one small place.',
      'But I know your hand',
      'is in all how to',
      'hold even when the night',
      'gets sharp and cold.'
    ].join('\n')
  )
})
