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
}

export interface PtyDataEvent {
  agentId: string
  data: string
}

export interface PtyExitEvent {
  agentId: string
  exitCode: number
}
