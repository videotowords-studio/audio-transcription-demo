export function transformWhisperXToAlignedWords(output) {
  const result = []

  for (const segment of output?.segments ?? []) {
    const words = Array.isArray(segment.words) ? segment.words : []

    if (!words.length) {
      const text = String(segment.text ?? '').trim()
      if (!text) continue

      result.push({
        word: `${text}\n`,
        success: true,
        startS: Number(segment.start ?? 0),
        endS: Number(segment.end ?? segment.start ?? 0),
        palign: 0
      })
      continue
    }

    for (let index = 0; index < words.length; index++) {
      const word = words[index]
      const cleanWord = String(word.word ?? '').trim()
      if (!cleanWord) continue

      const isLastWordInSegment = index === words.length - 1
      result.push({
        word: isLastWordInSegment ? `${cleanWord}\n` : `${cleanWord} `,
        success: true,
        startS: Number(word.start ?? segment.start ?? 0),
        endS: Number(word.end ?? segment.end ?? word.start ?? 0),
        palign: 0
      })
    }
  }

  return result
}

export function ensureLineBreaks(words, maxWordsPerLine = 7) {
  const result = words.map((word) => ({ ...word }))
  const punctuationPattern = /[,，、。！？；;!?.]/
  const commaPattern = /[,，]/
  const cjkPattern = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/
  const isCjk = result.some((item) => cjkPattern.test(item.word))
  const softThreshold = isCjk ? 6 : 4
  const hardThreshold = isCjk ? 15 : maxWordsPerLine
  const charLengthLimit = 35

  let lineMetric = 0
  let lineCharCount = 0
  let lineStartIndex = 0

  const addLineBreak = (index) => {
    result[index] = {
      ...result[index],
      word: `${result[index].word.trimEnd()}\n`
    }
  }

  for (let index = 0; index < result.length; index++) {
    const cleanWord = result[index].word.replace(/[\s\n]/g, '')

    lineMetric += isCjk ? cleanWord.length : 1
    lineCharCount += cleanWord.length

    if (result[index].word.endsWith('\n')) {
      lineMetric = 0
      lineCharCount = 0
      lineStartIndex = index + 1
      continue
    }

    if (lineMetric >= softThreshold && commaPattern.test(cleanWord)) {
      addLineBreak(index)
      lineMetric = 0
      lineCharCount = 0
      lineStartIndex = index + 1
      continue
    }

    if (!isCjk && lineCharCount >= charLengthLimit && punctuationPattern.test(cleanWord)) {
      addLineBreak(index)
      lineMetric = 0
      lineCharCount = 0
      lineStartIndex = index + 1
      continue
    }

    if (lineMetric < hardThreshold) continue

    let breakIndex = -1
    for (let cursor = index; cursor >= lineStartIndex; cursor--) {
      if (punctuationPattern.test(result[cursor].word)) {
        breakIndex = cursor
        break
      }
    }

    if (breakIndex >= 0) {
      addLineBreak(breakIndex)
      lineMetric = 0
      lineCharCount = 0
      lineStartIndex = breakIndex + 1

      for (let cursor = breakIndex + 1; cursor <= index; cursor++) {
        const word = result[cursor].word.replace(/[\s\n]/g, '')
        lineMetric += isCjk ? word.length : 1
        lineCharCount += word.length
      }
    } else {
      addLineBreak(index)
      lineMetric = 0
      lineCharCount = 0
      lineStartIndex = index + 1
    }
  }

  return result
}

export function buildPlainText(words) {
  return words
    .map((item) => item.word.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
}

export function buildSongLyricsText(words) {
  return buildSongLyricsLines(words)
    .map((line) => line.text)
    .join('\n')
}

export function buildSongLyricsLines(words) {
  const lines = []
  let currentWords = []
  let startS = null
  let endS = null

  const flush = () => {
    const text = currentWords.join(' ').replace(/\s+/g, ' ').trim()
    if (text && startS !== null && endS !== null) {
      lines.push({ text, startS, endS })
    }
    currentWords = []
    startS = null
    endS = null
  }

  for (let index = 0; index < words.length; index++) {
    const item = words[index]
    const cleanWord = item.word.replace(/[\s\n]/g, '')
    if (!cleanWord) continue

    if (startS === null) startS = item.startS
    endS = item.endS
    currentWords.push(cleanWord)

    const next = words[index + 1]
    const lineWordCount = currentWords.length
    const hasExplicitBreak = item.word.endsWith('\n')
    const hasSentenceEnd = /[.!?。！？]$/.test(cleanWord)
    const hasSoftPunctuation = /[,，、;；:]$/.test(cleanWord)
    const nextPause = next ? Math.max(0, Number(next.startS) - Number(item.endS)) : 0
    const nextCleanWord = next ? next.word.replace(/[\s\n]/g, '') : ''
    const nextEndsSentence = /[.!?。！？]$/.test(nextCleanWord)
    const nextStartsPreposition = /^(in|on|at|for|with|from|of|through|like)$/i.test(
      nextCleanWord
    )
    const currentLooksLikeClause = currentWords.some((word, wordIndex) => {
      const normalized = word.toLowerCase().replace(/[^a-z']/g, '')
      return (
        (wordIndex === 0 &&
          /^(i|you|he|she|we|they|it|but|and|so|cause|because)$/.test(normalized)) ||
        /^(am|are|is|was|were|be|been|being|do|does|did|have|has|had|saw|see|seen|know|knew|hold|held|wake|woke|want|need|feel|felt|go|went|come|came|get|got|make|made|take|took|love|loved|hate|hated)$/.test(
          normalized
        )
      )
    })
    const shouldBreakBeforePreposition =
      nextStartsPreposition &&
      (lineWordCount >= 4 || (lineWordCount >= 3 && !currentLooksLikeClause))

    if (
      !next ||
      hasExplicitBreak ||
      (hasSentenceEnd && lineWordCount >= 3) ||
      (hasSoftPunctuation && lineWordCount >= 3) ||
      (nextPause >= 0.45 && lineWordCount >= 3) ||
      shouldBreakBeforePreposition ||
      (lineWordCount >= 5 && !nextEndsSentence) ||
      lineWordCount >= 7
    ) {
      flush()
    }
  }

  flush()
  return lines
}

export function buildSubtitleLines(words) {
  const lines = []
  let currentText = ''
  let startS = null
  let endS = null

  const flush = () => {
    const text = currentText.replace(/\s+/g, ' ').trim()
    if (text && startS !== null && endS !== null) {
      lines.push({ text, startS, endS })
    }
    currentText = ''
    startS = null
    endS = null
  }

  for (const item of words) {
    if (startS === null) startS = item.startS
    endS = item.endS
    currentText += item.word.replace(/\n/g, ' ')

    if (item.word.endsWith('\n')) {
      flush()
    }
  }

  flush()
  return lines
}
