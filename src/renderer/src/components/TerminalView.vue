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
  // Skip while hidden (display:none gives a 0x0 box -> fit throws / NaN).
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
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      cursor: '#89b4fa',
      selectionBackground: '#45475a'
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

  // User keystrokes -> PTY
  term.onData((data) => window.studio.writePty(props.agent.id, data))

  // PTY output -> terminal
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

  // Refit when the container resizes or first becomes visible.
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
    <button class="restart" :title="t('terminal.restart')" @click="restart">↻</button>
  </div>
</template>

<style scoped>
.term-wrap {
  position: absolute;
  inset: 0;
  padding: 6px 8px;
}
.term-host {
  width: 100%;
  height: 100%;
}
.restart {
  position: absolute;
  top: 10px;
  right: 16px;
  background: var(--bg-panel);
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 6px;
  width: 26px;
  height: 26px;
  cursor: pointer;
  font-size: 14px;
}
.restart:hover {
  color: var(--accent);
}
</style>
