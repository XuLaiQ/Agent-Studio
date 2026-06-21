<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  AGENT_THEME,
  defineAgentTheme,
  ensureMonacoEnvironment,
  languageForFile,
  monaco
} from './monaco/setup'
import { useSettingsStore } from '../stores/settings'

const props = defineProps<{
  modelValue: string
  fileName?: string
  readonly?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'save'): void
}>()

const host = ref<HTMLDivElement>()
const settings = useSettingsStore()
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let model: monaco.editor.ITextModel | null = null
let resizeObserver: ResizeObserver | null = null
let internalUpdate = false

const language = computed(() => languageForFile(props.fileName ?? ''))

function createModel(): monaco.editor.ITextModel {
  return monaco.editor.createModel(props.modelValue, language.value)
}

function syncEditorValue(nextValue: string): void {
  if (!model || nextValue === model.getValue()) return

  const position = editor?.getPosition()
  const selection = editor?.getSelection()
  internalUpdate = true
  model.setValue(nextValue)
  internalUpdate = false
  if (selection) editor?.setSelection(selection)
  if (position) editor?.setPosition(position)
}

onMounted(() => {
  if (!host.value) return

  ensureMonacoEnvironment()
  defineAgentTheme()

  model = createModel()
  editor = monaco.editor.create(host.value, {
    model,
    theme: AGENT_THEME,
    readOnly: props.readonly,
    automaticLayout: false,
    fontFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace',
    fontSize: settings.terminalFontSize,
    lineHeight: settings.terminalFontSize + 7,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    tabSize: 2,
    insertSpaces: true,
    detectIndentation: true,
    autoIndent: 'full',
    formatOnPaste: true,
    formatOnType: true,
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    wordWrap: 'off',
    scrollbar: {
      vertical: 'visible',
      horizontal: 'visible',
      verticalScrollbarSize: 12,
      horizontalScrollbarSize: 12,
      useShadows: true,
      alwaysConsumeMouseWheel: false
    },
    renderWhitespace: 'selection',
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    padding: { top: 12, bottom: 18 }
  })

  editor.onDidChangeModelContent(() => {
    if (!model || internalUpdate) return
    emit('update:modelValue', model.getValue())
  })

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => emit('save'))

  resizeObserver = new ResizeObserver(() => editor?.layout())
  resizeObserver.observe(host.value)
})

watch(
  () => props.modelValue,
  (value) => syncEditorValue(value)
)

watch(language, (nextLanguage) => {
  if (model) monaco.editor.setModelLanguage(model, nextLanguage)
})

watch(
  () => props.readonly,
  (readonly) => editor?.updateOptions({ readOnly: readonly })
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
  model?.dispose()
  editor = null
  model = null
})
</script>

<template>
  <div ref="host" class="monaco-host" />
</template>

<style scoped>
.monaco-host {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
