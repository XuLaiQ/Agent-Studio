// Shared Monaco setup: language contributions, web workers, the custom theme
// and file -> language detection. Imported by both the single-file editor and
// the diff viewer so the heavy side-effect imports happen exactly once.
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

export { monaco }

export const AGENT_THEME = 'agent-dark-purple'
export const AGENT_THEME_LIGHT = 'agent-light'

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

export function ensureMonacoEnvironment(): void {
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

export function defineAgentTheme(): void {
  monaco.editor.defineTheme(AGENT_THEME, {
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
      'editorBracketMatch.border': '#8B5CF6',
      'scrollbarSlider.background': '#6B728066',
      'scrollbarSlider.hoverBackground': '#8B5CF688',
      'scrollbarSlider.activeBackground': '#9D74FFAA'
    }
  })

  monaco.editor.defineTheme(AGENT_THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '7C3AED' },
      { token: 'string', foreground: 'B45309' },
      { token: 'number', foreground: '059669' },
      { token: 'comment', foreground: '8B9099', fontStyle: 'italic' },
      { token: 'type', foreground: 'DB2777' },
      { token: 'class', foreground: 'DB2777' },
      { token: 'function', foreground: '2563EB' },
      { token: 'variable', foreground: '1A1A2E' }
    ],
    colors: {
      'editor.background': '#FAFBFC',
      'editor.foreground': '#1A1A2E',
      'editorLineNumber.foreground': '#8B9099',
      'editorLineNumber.activeForeground': '#5F6570',
      'editorCursor.foreground': '#7C3AED',
      'editor.selectionBackground': '#C4B5FD',
      'editor.inactiveSelectionBackground': '#DDD6FE',
      'editor.lineHighlightBackground': '#F0F1F3',
      'editorIndentGuide.background1': '#D4D6DA',
      'editorIndentGuide.activeBackground1': '#7C3AED',
      'editorBracketMatch.background': '#E9EAED',
      'editorBracketMatch.border': '#7C3AED',
      'scrollbarSlider.background': '#00000033',
      'scrollbarSlider.hoverBackground': '#7C3AED88',
      'scrollbarSlider.activeBackground': '#7C3AEDAA'
    }
  })
}

import type { ThemeMode } from '../../stores/settings'

export function getAgentTheme(theme: ThemeMode): string {
  return theme === 'light' ? AGENT_THEME_LIGHT : AGENT_THEME
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

export function languageForFile(fileName: string): string {
  const baseName = baseNameOf(fileName)
  return languageByFileName[baseName] ?? languageByExtension[extensionOf(baseName)] ?? 'plaintext'
}
