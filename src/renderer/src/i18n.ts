// Lightweight, dependency-free i18n for the renderer.
// Provides a reactive `locale`, a `t(key, vars?)` translator and persistence
// to localStorage. Also exposes the matching Element Plus locale object so the
// built-in components (dialogs, message boxes, etc.) follow the same language.
import { ref, computed } from 'vue'
import enElement from 'element-plus/es/locale/lang/en'
import zhElement from 'element-plus/es/locale/lang/zh-cn'

export type Locale = 'en' | 'zh'

const STORAGE_KEY = 'agent-studio.locale'

function detectInitial(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'en' || saved === 'zh') return saved
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export const locale = ref<Locale>(detectInitial())

type Dict = Record<string, string>

const messages: Record<Locale, Dict> = {
  en: {
    'app.subtitle': 'Multi-agent CLI workspace',
    'lang.label': 'Language',

    'projects.title': 'Projects',
    'projects.import': '+ Import',
    'projects.empty.line1': 'No projects yet.',
    'projects.empty.line2': 'Click {action} to add a folder.',
    'projects.remove.title': 'Remove project',
    'projects.remove.confirm':
      'Remove project "{name}"? Its agents and terminals will be closed.',
    'projects.remove.button': 'Remove',
    'projects.remove.tip': 'Remove project',

    'explorer.title': 'Explorer',
    'explorer.empty': 'Select a project to browse files.',
    'explorer.copy.relative': 'Copy relative path',
    'explorer.copy.absolute': 'Copy absolute path',
    'explorer.copy.relative.done': 'Relative path copied',
    'explorer.copy.absolute.done': 'Absolute path copied',

    'version.title': 'Version Control',
    'version.scan': 'Scan',
    'version.scanning': 'Scanning',
    'version.tools': 'tools',
    'version.repositories': 'repos',
    'version.manual': 'manual',
    'version.lastScan': 'Last scan:',
    'version.neverScanned': 'not scanned',
    'version.localTools': 'Local tools',
    'version.projectRepos': 'Project repositories',
    'version.manualConnections': 'Manual connections',
    'version.notFound': 'Not found',
    'version.scanHint': 'Scan to detect local tools.',
    'version.repo': 'repo',
    'version.notRepo': 'not repo',
    'version.noBranch': 'no branch',
    'version.dirty': 'dirty',
    'version.noProjects': 'No imported projects.',
    'version.noConnections': 'No manual connections.',
    'version.namePlaceholder': 'Connection name',
    'version.urlPlaceholder': 'Remote URL or host',
    'version.add': 'Add',
    'version.add.required': 'Name and URL are required',
    'version.add.done': 'Connection added',
    'version.noActiveProject': 'Select a project to view source control.',
    'version.notRepoHint': 'This project is not a Git repository.',
    'version.commit.placeholder': 'Message',
    'version.commit': 'Commit',
    'version.commit.required': 'Commit message is required',
    'version.commit.done': 'Committed',
    'version.staged': 'Staged Changes',
    'version.changes': 'Changes',
    'version.stage': 'Stage',
    'version.unstage': 'Unstage',
    'version.stageAll': 'Stage all',
    'version.unstageAll': 'Unstage all',
    'version.noStaged': 'No staged changes.',
    'version.noChanges': 'No changes.',
    'version.change.modified': 'Modified',
    'version.change.untracked': 'Untracked',
    'version.change.deleted': 'Deleted',
    'version.change.renamed': 'Renamed',
    'version.change.changed': 'Changed',

    'workspace.placeholder': 'Import a project on the left to get started.',
    'workspace.noAgents': 'No agents yet. Click {action} to launch a CLI.',
    'workspace.addAgent': '+ Add Agent',
    'agent.close.title': 'Close agent',
    'agent.close.confirm': 'Close agent "{name}"?',
    'agent.close.button': 'Close',

    'dialog.addAgent.title': 'Add Agent',
    'dialog.addAgent.namePlaceholder': 'Optional name (defaults to agent type)',
    'dialog.create': 'Create',

    'terminal.restart': 'Restart CLI',
    'terminal.exited': '[process exited with code {code}]',

    'common.cancel': 'Cancel'
  },
  zh: {
    'app.subtitle': '多智能体 CLI 工作台',
    'lang.label': '语言',

    'projects.title': '项目',
    'projects.import': '+ 导入',
    'projects.empty.line1': '暂无项目。',
    'projects.empty.line2': '点击 {action} 添加文件夹。',
    'projects.remove.title': '移除项目',
    'projects.remove.confirm': '移除项目「{name}」？其智能体和终端将被关闭。',
    'projects.remove.button': '移除',
    'projects.remove.tip': '移除项目',

    'explorer.title': '文件浏览器',
    'explorer.empty': '选择一个项目以浏览文件。',

    'workspace.placeholder': '从左侧导入一个项目开始使用。',
    'workspace.noAgents': '暂无智能体。点击 {action} 启动一个 CLI。',
    'workspace.addAgent': '+ 添加智能体',
    'agent.close.title': '关闭智能体',
    'agent.close.confirm': '关闭智能体「{name}」？',
    'agent.close.button': '关闭',

    'dialog.addAgent.title': '添加智能体',
    'dialog.addAgent.namePlaceholder': '可选名称（默认使用智能体类型）',
    'dialog.create': '创建',

    'terminal.restart': '重启 CLI',
    'terminal.exited': '[进程已退出，代码 {code}]',

    'common.cancel': '取消'
  }
}

const zhFallbackMessages: Dict = {
  'explorer.copy.relative': '复制相对路径',
  'explorer.copy.absolute': '复制绝对路径',
  'explorer.copy.relative.done': '已复制相对路径',
  'explorer.copy.absolute.done': '已复制绝对路径',
  'version.title': '版本管理',
  'version.scan': '扫描',
  'version.scanning': '扫描中',
  'version.tools': '工具',
  'version.repositories': '仓库',
  'version.manual': '手动',
  'version.lastScan': '上次扫描：',
  'version.neverScanned': '尚未扫描',
  'version.localTools': '本地工具',
  'version.projectRepos': '项目仓库',
  'version.manualConnections': '手动连接',
  'version.notFound': '未找到',
  'version.scanHint': '点击扫描检测本地工具。',
  'version.repo': '仓库',
  'version.notRepo': '非仓库',
  'version.noBranch': '无分支',
  'version.dirty': '有改动',
  'version.noProjects': '暂无导入项目。',
  'version.noConnections': '暂无手动连接。',
  'version.namePlaceholder': '连接名称',
  'version.urlPlaceholder': '远程地址或主机',
  'version.add': '添加',
  'version.add.required': '请填写名称和地址',
  'version.add.done': '连接已添加',
  'version.noActiveProject': '选择项目后查看源代码管理。',
  'version.notRepoHint': '当前项目不是 Git 仓库。',
  'version.commit.placeholder': '提交消息',
  'version.commit': '提交',
  'version.commit.required': '请填写提交消息',
  'version.commit.done': '提交完成',
  'version.staged': '暂存的更改',
  'version.changes': '更改',
  'version.stage': '暂存',
  'version.unstage': '取消暂存',
  'version.stageAll': '全部暂存',
  'version.unstageAll': '全部取消暂存',
  'version.noStaged': '没有暂存的更改。',
  'version.noChanges': '没有更改。',
  'version.change.modified': '已修改',
  'version.change.untracked': '未跟踪',
  'version.change.deleted': '已删除',
  'version.change.renamed': '已重命名',
  'version.change.changed': '已更改'
}

/** Interpolate {placeholder} tokens with values from `vars`. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`
  )
}

/** Reactive translate. Use inside templates/computed so it tracks `locale`. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = messages[locale.value]
  const fallback = locale.value === 'zh' ? zhFallbackMessages[key] : undefined
  return interpolate(dict[key] ?? fallback ?? messages.en[key] ?? key, vars)
}

export function setLocale(next: Locale): void {
  locale.value = next
  localStorage.setItem(STORAGE_KEY, next)
}

/** The Element Plus locale object matching the current language. */
export const elementLocale = computed(() => (locale.value === 'zh' ? zhElement : enElement))

export const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' }
]
