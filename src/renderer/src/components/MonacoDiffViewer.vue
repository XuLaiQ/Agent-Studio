<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  AGENT_THEME,
  defineAgentTheme,
  ensureMonacoEnvironment,
  getAgentTheme,
  languageForFile,
  monaco
} from './monaco/setup'
import { useSettingsStore } from '../stores/settings'

const props = defineProps<{
  original: string
  modified: string
  fileName?: string
}>()

const host = ref<HTMLDivElement>()
const settings = useSettingsStore()
let editor: monaco.editor.IStandaloneDiffEditor | null = null
let originalModel: monaco.editor.ITextModel | null = null
let modifiedModel: monaco.editor.ITextModel | null = null
let resizeObserver: ResizeObserver | null = null

function language(): string {
  return languageForFile(props.fileName ?? '')
}

function buildModels(): void {
  const lang = language()
  originalModel = monaco.editor.createModel(props.original, lang)
  modifiedModel = monaco.editor.createModel(props.modified, lang)
  editor?.setModel({ original: originalModel, modified: modifiedModel })
}

function disposeModels(): void {
  originalModel?.dispose()
  modifiedModel?.dispose()
  originalModel = null
  modifiedModel = null
}

onMounted(() => {
  if (!host.value) return

  ensureMonacoEnvironment()
  defineAgentTheme()

  editor = monaco.editor.createDiffEditor(host.value, {
    theme: getAgentTheme(settings.theme),
    readOnly: true,
    originalEditable: false,
    automaticLayout: false,
    renderSideBySide: true,
    fontFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace',
    fontSize: settings.terminalFontSize,
    lineHeight: settings.terminalFontSize + 7,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    ignoreTrimWhitespace: false,
    renderOverviewRuler: true,
    scrollbar: {
      vertical: 'visible',
      horizontal: 'visible',
      verticalScrollbarSize: 12,
      horizontalScrollbarSize: 12,
      useShadows: true,
      alwaysConsumeMouseWheel: false
    },
    smoothScrolling: true
  })
  buildModels()

  resizeObserver = new ResizeObserver(() => editor?.layout())
  resizeObserver.observe(host.value)
})

watch(
  () => [props.original, props.modified, props.fileName],
  () => {
    if (!editor) return
    disposeModels()
    buildModels()
  }
)

watch(
  () => settings.terminalFontSize,
  (fontSize) => {
    editor?.updateOptions({ fontSize, lineHeight: fontSize + 7 })
    editor?.layout()
  }
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  editor?.dispose()
  disposeModels()
  editor = null
})
</script>

<template>
  <div ref="host" class="diff-host" />
</template>

<style scoped>
.diff-host {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
