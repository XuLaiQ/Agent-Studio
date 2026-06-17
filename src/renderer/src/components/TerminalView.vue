<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { t } from '../i18n'
import type { Agent } from '@shared/types'

const props = defineProps<{ agent: Agent; projectPath: string }>()

const host = ref<HTMLDivElement>()
let term: Terminal | null = null
let fit: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
const cleanups: Array<() => void> = []
let started = false

function doFit(): void {
  if (!fit || !term || !host.value) return
  if (host.value.clientHeight === 0 || host.value.clientWidth === 0) return
  try {
    fit.fit()
    window.studio.resizePty(props.agent.id, term.cols, term.rows)
  } catch {
    /* ignore transient fit errors */
  }
}

function startSession(): void {
  if (started || !term) return
  started = true
  window.studio.startPty({
    agentId: props.agent.id,
    cwd: props.projectPath,
    type: props.agent.type,
    cols: term.cols || 80,
    rows: term.rows || 24
  })
}

function pasteClipboard(): void {
  const text = window.studio.readClipboardText()
  if (!text) return

  window.studio.writePty(props.agent.id, text)
}

onMounted(() => {
  if (!host.value) return

  term = new Terminal({
    fontFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace',
    fontSize: 13,
    cursorBlink: true,
    allowProposedApi: true,
    theme: {
      background: '#1e1e1e',
      foreground: '#cccccc',
      cursor: '#aeafad',
      selectionBackground: '#264f78'
    }
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(host.value)
  doFit()

  term.attachCustomKeyEventHandler((event) => {
    if (
      event.type === 'keydown' &&
      event.key.toLowerCase() === 'v' &&
      (event.ctrlKey || event.metaKey)
    ) {
      event.preventDefault()
      pasteClipboard()
      return false
    }

    return true
  })

  term.onData((data) => window.studio.writePty(props.agent.id, data))

  cleanups.push(
    window.studio.onPtyData((e) => {
      if (e.agentId === props.agent.id) term?.write(e.data)
    })
  )
  cleanups.push(
    window.studio.onPtyExit((e) => {
      if (e.agentId === props.agent.id) {
        term?.write(
          `\r\n\x1b[90m${t('terminal.exited', { code: e.exitCode })}\x1b[0m\r\n`
        )
        started = false
      }
    })
  )

  resizeObserver = new ResizeObserver(() => doFit())
  resizeObserver.observe(host.value)

  startSession()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  cleanups.forEach((fn) => fn())
  window.studio.killPty(props.agent.id)
  term?.dispose()
  term = null
})

function restart(): void {
  term?.reset()
  started = false
  startSession()
}

function copySelection(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()

  const selection = term?.getSelection()
  if (!selection) return

  window.studio.writeClipboardText(selection)
  term?.focus()
}
</script>

<template>
  <div class="term-wrap">
    <div ref="host" class="term-host" @click="term?.focus()" @contextmenu="copySelection" />
    <button class="restart" type="button" :title="t('terminal.restart')" @click="restart">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M13 3.5v3H10M12.4 6.5A4.8 4.8 0 1 0 13 9"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.4"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.term-wrap {
  position: absolute;
  inset: 0;
  padding: 6px 8px;
  background: var(--bg);
}
.term-host {
  width: 100%;
  height: 100%;
}
.restart {
  position: absolute;
  top: 8px;
  right: 12px;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: rgba(45, 45, 45, 0.88);
  color: var(--text-dim);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.term-wrap:hover .restart {
  opacity: 1;
}
.restart svg {
  width: 15px;
  height: 15px;
}
.restart:hover {
  color: var(--text);
  border-color: var(--accent);
}
</style>
