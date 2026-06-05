import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

test('audio URL input updates the preview player source', async () => {
  const { elements, runPageScript } = await loadPageScript()

  const audioUrl = 'https://example.com/song.mp3'
  elements.audioUrl.value = audioUrl
  elements.audioUrl.dispatch('input')

  assert.equal(elements.playerField.hidden, false)
  assert.equal(elements.audioPreview.src, audioUrl)
})

async function loadPageScript() {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1]
  assert.ok(script, 'index.html should include the page script')

  const elements = createElements()
  const document = createDocument(elements)

  const context = {
    document,
    URL: {
      createObjectURL: () => 'blob:local-audio',
      revokeObjectURL: () => {}
    },
    console,
    fetch: async () => ({ ok: true, json: async () => ({ alignedWords: [] }) }),
    FormData: class FormDataStub {
      append() {}
    }
  }

  const runPageScript = () => vm.runInNewContext(script, context)
  runPageScript()

  return { elements, runPageScript }
}

function createElements() {
  return Object.fromEntries(
    [
      'transcribeForm',
      'audioFile',
      'audioUrl',
      'submitButton',
      'resetButton',
      'statusBox',
      'statusTitle',
      'statusText',
      'playerField',
      'audioPreview',
      'languageValue',
      'durationValue',
      'wordsValue',
      'transcriptText',
      'plainText',
      'subtitleLines',
      'jsonOutput'
    ].map((id) => [id, new ElementStub(id, { hidden: id === 'playerField' })])
  )
}

function createDocument(elements) {
  return {
    querySelector(selector) {
      return elements[selector.slice(1)]
    },
    querySelectorAll() {
      return []
    },
    createElement(tagName) {
      return new ElementStub(tagName)
    }
  }
}

class ElementStub {
  constructor(id, options = {}) {
    this.id = id
    this.hidden = Boolean(options.hidden)
    this.value = ''
    this.files = []
    this.src = ''
    this.textContent = ''
    this.innerHTML = ''
    this.listeners = new Map()
    this.classList = new ClassListStub()
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) {
      listener({
        type,
        target: this,
        preventDefault() {}
      })
    }
  }

  setAttribute() {}

  removeAttribute(name) {
    if (name === 'src') this.src = ''
  }

  append() {}
}

class ClassListStub {
  add() {}

  remove() {}

  toggle() {}
}
