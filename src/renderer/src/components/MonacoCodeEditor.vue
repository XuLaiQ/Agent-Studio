<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/basic-languages/bat/bat.contribution'
import 'monaco-editor/esm/vs/basic-languages/bicep/bicep.contribution'
import 'monaco-editor/esm/vs/basic-languages/clojure/clojure.contribution'
import 'monaco-editor/esm/vs/basic-languages/coffee/coffee.contribution'
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution'
import 'monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution'
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution'
import 'monaco-editor/esm/vs/basic-languages/dart/dart.contribution'
import 'monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile.contribution'
import 'monaco-editor/esm/vs/basic-languages/elixir/elixir.contribution'
import 'monaco-editor/esm/vs/basic-languages/fsharp/fsharp.contribution'
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution'
import 'monaco-editor/esm/vs/basic-languages/graphql/graphql.contribution'
import 'monaco-editor/esm/vs/basic-languages/handlebars/handlebars.contribution'
import 'monaco-editor/esm/vs/basic-languages/hcl/hcl.contribution'
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution'
import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution'
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'
import 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution'
import 'monaco-editor/esm/vs/basic-languages/less/less.contribution'
import 'monaco-editor/esm/vs/basic-languages/lua/lua.contribution'
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution'
import 'monaco-editor/esm/vs/basic-languages/mdx/mdx.contribution'
import 'monaco-editor/esm/vs/basic-languages/objective-c/objective-c.contribution'
import 'monaco-editor/esm/vs/basic-languages/perl/perl.contribution'
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution'
import 'monaco-editor/esm/vs/basic-languages/powershell/powershell.contribution'
import 'monaco-editor/esm/vs/basic-languages/protobuf/protobuf.contribution'
import 'monaco-editor/esm/vs/basic-languages/pug/pug.contribution'
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution'
import 'monaco-editor/esm/vs/basic-languages/r/r.contribution'
import 'monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution'
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution'
import 'monaco-editor/esm/vs/basic-languages/scala/scala.contribution'
import 'monaco-editor/esm/vs/basic-languages/scss/scss.contribution'
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution'
import 'monaco-editor/esm/vs/basic-languages/solidity/solidity.contribution'
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution'
import 'monaco-editor/esm/vs/basic-languages/swift/swift.contribution'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'
import 'monaco-editor/esm/vs/basic-languages/twig/twig.contribution'
import 'monaco-editor/esm/vs/basic-languages/vb/vb.contribution'
import 'monaco-editor/esm/vs/basic-languages/wgsl/wgsl.contribution'
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution'
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution'
import 'monaco-editor/esm/vs/language/css/monaco.contribution'
import 'monaco-editor/esm/vs/language/html/monaco.contribution'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import 'monaco-editor/min/vs/editor/editor.main.css'

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
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let model: monaco.editor.ITextModel | null = null
let resizeObserver: ResizeObserver | null = null
let internalUpdate = false

const language = computed(() => languageForFile(props.fileName ?? ''))

const languageByExtension: Record<string, string> = {
  '.babelrc': 'json',
  '.bat': 'bat',
  '.bicep': 'bicep',
  '.c': 'c',
  '.cc': 'cpp',
  '.cjs': 'javascript',
  '.clj': 'clojure',
  '.cljs': 'clojure',
  '.cljc': 'clojure',
  '.cmd': 'bat',
  '.coffee': 'coffeescript',
  '.conf': 'ini',
  '.cpp': 'cpp',
  '.cs': 'csharp',
  '.css': 'css',
  '.csv': 'plaintext',
  '.cts': 'typescript',
  '.cxx': 'cpp',
  '.dart': 'dart',
  '.dockerfile': 'dockerfile',
  '.edn': 'clojure',
  '.env': 'ini',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.fs': 'fsharp',
  '.fsi': 'fsharp',
  '.fsx': 'fsharp',
  '.go': 'go',
  '.gql': 'graphql',
  '.graphql': 'graphql',
  '.hbs': 'handlebars',
  '.h': 'cpp',
  '.hh': 'cpp',
  '.hcl': 'hcl',
  '.hpp': 'cpp',
  '.html': 'html',
  '.htm': 'html',
  '.hxx': 'cpp',
  '.ini': 'ini',
  '.java': 'java',
  '.js': 'javascript',
  '.json': 'json',
  '.jsonc': 'json',
  '.jsx': 'javascript',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.less': 'less',
  '.log': 'plaintext',
  '.lua': 'lua',
  '.m': 'objective-c',
  '.md': 'markdown',
  '.mdx': 'mdx',
  '.ml': 'fsharp',
  '.mli': 'fsharp',
  '.mjs': 'javascript',
  '.mts': 'typescript',
  '.p8': 'perl',
  '.pl': 'perl',
  '.pm': 'perl',
  '.php': 'php',
  '.proto': 'proto',
  '.ps1': 'powershell',
  '.pug': 'pug',
  '.pyw': 'python',
  '.py': 'python',
  '.r': 'r',
  '.rhistory': 'r',
  '.rmd': 'r',
  '.rprofile': 'r',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.sbt': 'scala',
  '.scala': 'scala',
  '.sc': 'scala',
  '.scss': 'scss',
  '.sh': 'shell',
  '.sol': 'sol',
  '.sql': 'sql',
  '.svg': 'xml',
  '.swift': 'swift',
  '.tf': 'hcl',
  '.tfvars': 'hcl',
  '.toml': 'ini',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.twig': 'twig',
  '.txt': 'plaintext',
  '.vb': 'vb',
  '.vue': 'html',
  '.wgsl': 'wgsl',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml'
}

const languageByFileName: Record<string, string> = {
  '.babelrc': 'json',
  '.dockerignore': 'plaintext',
  '.editorconfig': 'ini',
  '.env': 'ini',
  '.eslintignore': 'plaintext',
  '.eslintrc': 'json',
  '.gitattributes': 'plaintext',
  '.gitignore': 'plaintext',
  '.npmrc': 'ini',
  '.prettierrc': 'json',
  'cmakelists.txt': 'plaintext',
  dockerfile: 'dockerfile',
  gemfile: 'ruby',
  jenkinsfile: 'shell',
  makefile: 'shell',
  podfile: 'ruby',
  procfile: 'shell',
  rakefile: 'ruby',
  vagrantfile: 'ruby'
}

function ensureMonacoEnvironment(): void {
  const target = globalThis as typeof globalThis & {
    MonacoEnvironment?: { getWorker: (_workerId: string, label: string) => Worker }
  }

  if (target.MonacoEnvironment) return

  target.MonacoEnvironment = {
    getWorker: (_workerId, label) => {
      if (label === 'json') return new JsonWorker()
      if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
      if (label === 'typescript' || label === 'javascript') return new TsWorker()
      return new EditorWorker()
    }
  }
}

function defineAgentTheme(): void {
  monaco.editor.defineTheme('agent-dark-purple', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '8B5CF6' },
      { token: 'string', foreground: 'F59E0B' },
      { token: 'number', foreground: '22C55E' },
      { token: 'comment', foreground: '6B7280', fontStyle: 'italic' },
      { token: 'type', foreground: 'F472B6' },
      { token: 'class', foreground: 'F472B6' },
      { token: 'function', foreground: '60A5FA' },
      { token: 'variable', foreground: 'E5E7EB' }
    ],
    colors: {
      'editor.background': '#0A0A0F',
      'editor.foreground': '#F5F5F7',
      'editorLineNumber.foreground': '#6B7280',
      'editorLineNumber.activeForeground': '#A1A1AA',
      'editorCursor.foreground': '#9D74FF',
      'editor.selectionBackground': '#4C1D95',
      'editor.inactiveSelectionBackground': '#312E81',
      'editor.lineHighlightBackground': '#16161F',
      'editorIndentGuide.background1': '#2A2A38',
      'editorIndentGuide.activeBackground1': '#8B5CF6',
      'editorBracketMatch.background': '#1E1E2A',
      'editorBracketMatch.border': '#8B5CF6'
    }
  })
}

function extensionOf(fileName: string): string {
  const normalized = fileName.toLowerCase()
  if (normalized.endsWith('dockerfile')) return '.dockerfile'
  const dot = normalized.lastIndexOf('.')
  return dot === -1 ? '' : normalized.slice(dot)
}

function baseNameOf(fileName: string): string {
  return fileName.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? ''
}

function languageForFile(fileName: string): string {
  const baseName = baseNameOf(fileName)
  return languageByFileName[baseName] ?? languageByExtension[extensionOf(baseName)] ?? 'plaintext'
}

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
    theme: 'agent-dark-purple',
    readOnly: props.readonly,
    automaticLayout: false,
    fontFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace',
    fontSize: 13,
    lineHeight: 20,
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
