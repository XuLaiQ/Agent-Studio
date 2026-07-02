<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { ElMessage } from 'element-plus'
import { t } from '../i18n'
import { useStudioStore } from '../stores/studio'
import { useSettingsStore, type ThemeMode } from '../stores/settings'
import {
  type Agent,
  type SessionSummary
} from '@shared/types'

interface TerminalTheme {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
}

const TERMINAL_THEMES: Record<ThemeMode, TerminalTheme> = {
  dark: {
    background: '#0A0A0F',
    foreground: '#F5F5F7',
    cursor: '#9D74FF',
    selectionBackground: '#4C1D95'
  },
  light: {
    background: '#FAFBFC',
    foreground: '#1A1A2E',
    cursor: '#7C3AED',
    selectionBackground: '#C4B5FD'
  }
}

function getTerminalTheme(theme: ThemeMode): TerminalTheme {
  return TERMINAL_THEMES[theme]
}

const props = defineProps<{ agent: Agent; projectPath: string }>()

const store = useStudioStore()
const settings = useSettingsStore()

const host = ref<HTMLDivElement>()
let term: Terminal | null = null
let fit: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
const cleanups: Array<() => void> = []
let started = false

const historyOpen = ref(false)
const sessions = ref<SessionSummary[]>([])
const historyLoading = ref(false)

async function loadSessions(): Promise<void> {
  historyLoading.value = true
  try {
    sessions.value = await window.studio.listSessions({
      type: props.agent.type,
      cwd: props.projectPath
    })
  } finally {
    historyLoading.value = false
  }
}

function toggleHistory(): void {
  historyOpen.value = !historyOpen.value
  forwardOpen.value = false
  if (historyOpen.value) loadSessions()
}

function resumeSession(id: string): void {
  historyOpen.value = false
  term?.reset()
  started = false
  startSession({ resumeSessionId: id })
  // Return focus to the terminal so the resumed session accepts input at once.
  term?.focus()
}

// ---- Agent Bus (forward to another agent) ----
const forwardOpen = ref(false)
const forwardText = ref('')

/** Other agents in the same project — the possible forward targets. */
const otherAgents = computed(() => {
  const project = store.projects.find((p) => p.id === props.agent.projectId)
  return (project?.agents ?? []).filter((a) => a.id !== props.agent.id)
})

function toggleForward(): void {
  forwardOpen.value = !forwardOpen.value
  historyOpen.value = false
}

/** Message to forward: the composer text, or the current terminal selection. */
function forwardPayload(): string {
  return forwardText.value.trim() || term?.getSelection().trim() || ''
}

async function forwardTo(toAgentId: string | null): Promise<void> {
  const text = forwardPayload()
  if (!text) {
    ElMessage.warning(t('terminal.forward.empty'))
    return
  }

  const result = await window.studio.sendToAgent({
    projectId: props.agent.projectId,
    fromAgentId: props.agent.id,
    toAgentId,
    text,
    submit: true
  })

  forwardOpen.value = false
  forwardText.value = ''

  if (result.delivered.length) {
    ElMessage.success(t('terminal.forward.sent', { count: result.delivered.length }))
  } else {
    ElMessage.warning(t('terminal.forward.noTarget'))
  }
}

function closePopovers(): void {
  historyOpen.value = false
  forwardOpen.value = false
}

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

function startSession(opts: { resumeSessionId?: string } = {}): void {
  if (started || !term) return
  started = true
  window.studio.startPty({
    agentId: props.agent.id,
    cwd: props.projectPath,
    type: props.agent.type,
    launchCommand: settings.agentConfigOf(props.agent.type)?.command || props.agent.launchCommand,
    cols: term.cols || 80,
    rows: term.rows || 24,
    resumeSessionId: opts.resumeSessionId
  })
}

async function attachOrStartSession(): Promise<void> {
  if (started || !term) return
  if (await window.studio.isPtyRunning(props.agent.id)) {
    started = true
    return
  }
  startSession()
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
    fontSize: settings.terminalFontSize,
    cursorBlink: true,
    allowProposedApi: true,
    theme: getTerminalTheme(settings.theme)
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

  cleanups.push(
    watch(
      () => settings.terminalFontSize,
      (fontSize) => {
        if (!term) return
        term.options.fontSize = fontSize
        doFit()
      }
    )
  )
  cleanups.push(
    watch(
      () => settings.theme,
      (theme) => {
        if (!term) return
        term.options.theme = getTerminalTheme(theme)
      }
    )
  )

  document.addEventListener('click', closePopovers)

  void attachOrStartSession()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  cleanups.forEach((fn) => fn())
  document.removeEventListener('click', closePopovers)
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

    <div class="term-toolbar" :class="{ open: historyOpen || forwardOpen }" @click.stop>
      <!-- Conversation history -->
      <div class="tool">
        <button
          class="tool-btn"
          type="button"
          :title="t('terminal.history')"
          @click="toggleHistory"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 4.5V8l2.5 1.5M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.4"
            />
          </svg>
        </button>
        <div v-if="historyOpen" class="popover history-popover">
          <div class="history-head">
            <span>{{ t('terminal.history') }}</span>
            <button
              class="history-refresh"
              type="button"
              :title="t('terminal.historyRefresh')"
              :aria-label="t('terminal.historyRefresh')"
              @click="loadSessions"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M12.8 4.2v3h-3M12.2 7.2A4.4 4.4 0 1 0 12.7 10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4" />
              </svg>
            </button>
          </div>
          <ul class="history-list">
            <li v-if="historyLoading" class="history-empty">
              <svg class="loading-icon" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M13 8a5 5 0 1 1-1.5-3.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" />
              </svg>
            </li>
            <li v-else-if="!sessions.length" class="history-empty">
              {{ t('terminal.historyEmpty') }}
            </li>
            <li
              v-for="s in sessions"
              v-else
              :key="s.id"
              class="history-item"
              @click="resumeSession(s.id)"
            >
              {{ s.title }}
            </li>
          </ul>
        </div>
      </div>

      <!-- Forward to another agent (Agent Bus) -->
      <div class="tool">
        <button
          class="tool-btn"
          type="button"
          :title="t('terminal.forward.title')"
          @click="toggleForward"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M2.5 8h9M8 4.5 11.5 8 8 11.5"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.4"
            />
          </svg>
        </button>
        <div v-if="forwardOpen" class="popover forward-popover">
          <textarea
            v-model="forwardText"
            class="forward-input"
            rows="2"
            :placeholder="t('terminal.forward.placeholder')"
            @keydown.stop
          />
          <div class="forward-head">{{ t('terminal.forward.target') }}</div>
          <ul class="forward-list">
            <li v-if="!otherAgents.length" class="forward-empty">
              {{ t('terminal.forward.noAgents') }}
            </li>
            <li
              v-for="a in otherAgents"
              :key="a.id"
              class="forward-item"
              @click="forwardTo(a.id)"
            >
              {{ a.name }}
            </li>
          </ul>
          <button
            v-if="otherAgents.length"
            class="forward-broadcast"
            type="button"
            @click="forwardTo(null)"
          >
            {{ t('terminal.forward.broadcast') }}
          </button>
        </div>
      </div>

      <!-- Restart (rightmost) -->
      <button class="tool-btn" type="button" :title="t('terminal.restart')" @click="restart">
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
  </div>
</template>

<style scoped>
.term-wrap {
  position: absolute;
  inset: 0;
  padding: 6px 8px;
  background: var(--bg-terminal);
}
.term-host {
  width: 100%;
  height: 100%;
}
.term-toolbar {
  position: absolute;
  top: 8px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.term-wrap:hover .term-toolbar,
.term-toolbar.open {
  opacity: 1;
}
.tool {
  position: relative;
}
.tool-btn {
  height: 26px;
  min-width: 26px;
  padding: 0 6px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--bg-panel);
  color: var(--text-dim);
  cursor: pointer;
  font-size: var(--app-font-size-xs);
  line-height: 1;
}
.tool-btn:hover {
  color: var(--text);
  border-color: var(--accent-hover);
}
.tool-btn svg {
  width: 15px;
  height: 15px;
}
/* Popovers */
.popover {
  position: absolute;
  top: 30px;
  right: 0;
  z-index: 20;
  margin: 0;
  padding: 4px;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: rgba(18, 18, 26, 0.98);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}
.history-popover {
  min-width: 240px;
  max-width: min(340px, 90vw);
  width: max-content;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text-dim);
  font-size: var(--app-font-size-xs);
}
.history-refresh {
  border: none;
  background: none;
  color: var(--accent-hover);
  cursor: pointer;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  padding: 0;
}
.history-refresh svg {
  width: 14px;
  height: 14px;
}
.history-list {
  margin: 0;
  padding: 4px;
  list-style: none;
  max-height: 260px;
  overflow-y: auto;
}
.history-item {
  padding: 6px 8px;
  border-radius: 2px;
  color: var(--text-dim);
  cursor: pointer;
  font-size: var(--app-font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-item:hover {
  background: rgba(157, 116, 255, 0.16);
  color: var(--text);
}
.history-empty {
  padding: 12px 8px;
  text-align: center;
  color: var(--text-dim);
  font-size: var(--app-font-size-sm);
}
.loading-icon {
  width: 16px;
  height: 16px;
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Forward (Agent Bus) */
.forward-popover {
  width: 240px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.forward-input {
  width: 100%;
  resize: none;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: rgba(10, 10, 15, 0.9);
  color: var(--text);
  font-family: inherit;
  font-size: var(--app-font-size-sm);
  outline: none;
}
.forward-input:focus {
  border-color: var(--accent-hover);
}
.forward-head {
  color: var(--text-dim);
  font-size: var(--app-font-size-xs);
  padding: 0 2px;
}
.forward-list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 180px;
  overflow-y: auto;
}
.forward-item {
  padding: 6px 8px;
  border-radius: 2px;
  color: var(--text-dim);
  cursor: pointer;
  font-size: var(--app-font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.forward-item:hover {
  background: rgba(157, 116, 255, 0.16);
  color: var(--text);
}
.forward-empty {
  padding: 10px 8px;
  text-align: center;
  color: var(--text-dim);
  font-size: var(--app-font-size-sm);
}
.forward-broadcast {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: rgba(157, 116, 255, 0.16);
  color: var(--text);
  cursor: pointer;
  font-size: var(--app-font-size-sm);
}
.forward-broadcast:hover {
  background: rgba(157, 116, 255, 0.28);
}
</style>
