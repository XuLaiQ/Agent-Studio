// Shared domain types used by both the Electron main process and the Vue renderer.

export type AgentType = 'claude' | 'codex' | 'gemini' | 'reasonix'

export type AgentStatus = 'idle' | 'running' | 'error'

export interface Project {
  id: string
  name: string
  path: string
  agents: Agent[]
  createTime: number
}

export interface Agent {
  id: string
  projectId: string
  name: string
  type: AgentType
  status: AgentStatus
  /** Identifies the backing PTY session in the main process. Equals the agent id. */
  terminalId: string
}

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  /** Lazily-loaded children (only for directories that have been expanded). */
  children?: FileNode[]
}

export type FilePreviewKind = 'text' | 'image' | 'binary' | 'too-large' | 'error'

export interface FilePreview {
  path: string
  name: string
  extension: string
  size: number
  mtimeMs: number
  kind: FilePreviewKind
  mime?: string
  content?: string
  dataUrl?: string
  truncated?: boolean
  message?: string
}

export interface FilePreviewInput {
  projectPath: string
  path: string
}

export interface FileCreateInput {
  projectPath: string
  parentPath: string
  name: string
  type: 'file' | 'directory'
}

export interface FileDeleteInput {
  projectPath: string
  path: string
}

export interface FileWriteInput {
  projectPath: string
  path: string
  content: string
}

export interface FileOperationResult {
  path: string
}

export interface FileWatchResult {
  watching: boolean
  error?: string
}

export interface FileChangeEvent {
  projectPath: string
  eventType: string
  filename?: string
  timestamp: number
}

export type VersionProvider = 'git' | 'github' | 'gitlab'

export interface VersionToolStatus {
  tool: 'git' | 'gh' | 'glab'
  available: boolean
  version?: string
  path?: string
  error?: string
}

export interface ProjectRemote {
  name: string
  url: string
  provider: VersionProvider
}

export interface VersionFileChange {
  path: string
  originalPath?: string
  indexStatus: string
  workTreeStatus: string
  staged: boolean
}

export interface VersionBranch {
  name: string
  current: boolean
  remote: boolean
  upstream?: string
}

export interface VersionCommitLog {
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
  relativeDate: string
}

export interface ProjectVersionStatus {
  projectId: string
  projectName: string
  path: string
  isRepository: boolean
  branch?: string
  upstream?: string
  ahead: number
  behind: number
  remotes: ProjectRemote[]
  localBranches: VersionBranch[]
  remoteBranches: VersionBranch[]
  dirty?: boolean
  lastCommit?: string
  commitHistory: VersionCommitLog[]
  changes: VersionFileChange[]
  error?: string
}

export interface VersionConnection {
  id: string
  name: string
  provider: VersionProvider
  url: string
  createTime: number
}

export interface CreateVersionConnectionInput {
  name: string
  provider: VersionProvider
  url: string
}

export interface VersionScanResult {
  tools: VersionToolStatus[]
  projects: ProjectVersionStatus[]
  connections: VersionConnection[]
  scannedAt: number
}

export interface VersionProjectInput {
  projectId: string
}

export interface VersionFileInput {
  projectId: string
  path: string
}

export interface VersionFileDiffInput {
  projectId: string
  path: string
  staged: boolean
}

export interface VersionDiffSelection {
  projectId: string
  path: string
  originalPath?: string
  name: string
  staged: boolean
}

export interface VersionFileDiff {
  path: string
  originalPath?: string
  name: string
  /** Baseline content shown on the left side of the diff. */
  original: string
  /** Current content shown on the right side of the diff. */
  modified: string
  staged: boolean
  binary: boolean
}

export interface VersionCommitInput {
  projectId: string
  message: string
}

export interface VersionBranchInput {
  projectId: string
  branch: string
}

export interface VersionCreateBranchInput {
  projectId: string
  branch: string
  checkout: boolean
}

/** Command + default args used to launch each agent's CLI. */
export const AGENT_COMMANDS: Record<AgentType, { command: string; args: string[]; label: string }> = {
  claude: { command: 'claude', args: [], label: 'Claude' },
  codex: { command: 'codex', args: [], label: 'Codex' },
  gemini: { command: 'gemini', args: [], label: 'Gemini' },
  reasonix: { command: 'reasonix', args: [], label: 'Reasonix' }
}

/** A selectable model for an agent. An empty `id` means "use the CLI default". */
export interface ModelOption {
  id: string
  label: string
}

/**
 * Models offered in each agent's model switcher. Ids are the values passed to the
 * CLI (`--model` for claude, `-m` for codex). Labels are proper nouns, so they are
 * intentionally not run through i18n.
 */
export const AGENT_MODELS: Record<AgentType, ModelOption[]> = {
  claude: [
    { id: '', label: 'Default' },
    { id: 'opus', label: 'Opus 4.8' },
    { id: 'sonnet', label: 'Sonnet 4.6' },
    { id: 'haiku', label: 'Haiku 4.5' },
    { id: 'fable', label: 'Fable 5' }
  ],
  codex: [
    { id: '', label: 'Default' },
    { id: 'gpt-5-codex', label: 'GPT-5 Codex' },
    { id: 'o3', label: 'o3' }
  ],
  gemini: [{ id: '', label: 'Default' }],
  reasonix: [{ id: '', label: 'Default' }]
}

export interface AgentLaunchOptions {
  /** Model id to launch with (CLI default when empty/undefined). */
  model?: string
  /** Resume an existing conversation by its session id. */
  resumeSessionId?: string
}

/**
 * Assembles the CLI arguments (after the base command) for launching an agent
 * with an optional model and/or resumed conversation. Each CLI has its own flag
 * shape, so this is the single place that knows them.
 */
export function buildAgentArgs(type: AgentType, opts: AgentLaunchOptions = {}): string[] {
  const { model, resumeSessionId } = opts
  switch (type) {
    case 'claude':
      return [
        ...(resumeSessionId ? ['--resume', resumeSessionId] : []),
        ...(model ? ['--model', model] : [])
      ]
    case 'codex':
      // Resume is a subcommand: `codex resume <id>`.
      return resumeSessionId
        ? ['resume', resumeSessionId, ...(model ? ['-m', model] : [])]
        : model
          ? ['-m', model]
          : []
    case 'gemini':
      return model ? ['-m', model] : []
    case 'reasonix':
    default:
      return []
  }
}

/**
 * The slash command that switches the model of an already-running session
 * without restarting it, or `null` if the CLI has no such command.
 */
export function liveModelCommand(type: AgentType, modelId: string): string | null {
  if (!modelId) return null
  switch (type) {
    case 'claude':
    case 'codex':
      return `/model ${modelId}`
    default:
      return null
  }
}

/** One past conversation surfaced in the terminal's history list. */
export interface SessionSummary {
  id: string
  title: string
  /** Epoch ms of the session's last activity (file mtime). */
  updatedAt: number
}

export interface SessionListInput {
  type: AgentType
  cwd: string
}

// ---- IPC payload shapes ----

export interface CreateAgentInput {
  projectId: string
  type: AgentType
  name?: string
}

export interface PtyStartInput {
  agentId: string
  cwd: string
  type: AgentType
  cols: number
  rows: number
  /** Launch the CLI with this model (CLI default when empty/undefined). */
  model?: string
  /** Resume an existing conversation by its session id. */
  resumeSessionId?: string
}

export interface PtyDataEvent {
  agentId: string
  data: string
}

export interface PtyExitEvent {
  agentId: string
  exitCode: number
}
