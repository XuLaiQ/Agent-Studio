// Shared domain types used by both the Electron main process and the Vue renderer.

export type AgentType = string

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
  typeLabel?: string
  launchCommand?: string
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
  headHash?: string
  pushedHash?: string
}

export interface VersionCommitLog {
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
  relativeDate: string
  branches: string[]
  pushed: boolean
  pushedBranches: string[]
}

/** A single file touched by a commit, derived from `git show --name-status`. */
export interface VersionCommitFile {
  path: string
  originalPath?: string
  /** Single-letter git status: M, A, D, R, C. */
  status: string
}

export interface VersionCommitFilesInput {
  projectId: string
  hash: string
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

// ---- Token usage statistics (application-level usage history) ----

/** Cumulative token usage for a single model under one agent type. */
export interface ModelTokenUsage {
  /** Raw model id reported by the CLI transcript, e.g. 'claude-opus-4-8'. */
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  /** input + output + cache creation + cache read. */
  totalTokens: number
  /** Number of assistant responses that contributed usage. */
  messageCount: number
}

/** Token usage for one agent type, broken down by model. */
export interface AgentTokenUsage {
  type: AgentType
  models: ModelTokenUsage[]
  totalTokens: number
  /** False when no transcript/usage source is available for this agent type yet. */
  supported: boolean
}

/** App-wide token usage snapshot, aggregated from local CLI usage history. */
export interface TokenUsageStats {
  agents: AgentTokenUsage[]
  totalTokens: number
  scannedAt: number
}

/** Command + default args used to launch each agent's CLI. */
export const AGENT_COMMANDS: Record<string, { command: string; args: string[]; label: string }> = {
  claude: { command: 'claude', args: [], label: 'Claude' },
  codex: { command: 'codex', args: [], label: 'Codex' },
  gemini: { command: 'gemini', args: [], label: 'Gemini' },
  reasonix: { command: 'reasonix', args: [], label: 'Reasonix' }
}

export interface AgentConfig {
  id: AgentType
  name: string
  command: string
  enabled: boolean
  builtin?: boolean
}

export const DEFAULT_AGENT_CONFIGS: AgentConfig[] = Object.entries(AGENT_COMMANDS).map(
  ([id, config]) => ({
    id,
    name: config.label,
    command: config.command,
    enabled: true,
    builtin: true
  })
)

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
export const AGENT_MODELS: Record<string, ModelOption[]> = {
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
  label?: string
  command?: string
  name?: string
}

export interface PtyStartInput {
  agentId: string
  cwd: string
  type: AgentType
  launchCommand?: string
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

// ---- Agent Bus ----

/** A message forwarded from one agent to another (or broadcast within a project). */
export interface BusSendInput {
  projectId: string
  fromAgentId: string
  /** Target agent id, or null when broadcasting to every other agent in the project. */
  toAgentId: string | null
  text: string
  /** Press Enter in the target after injecting the text. */
  submit: boolean
}

export interface BusSkipped {
  agentId: string
  reason: 'not-running' | 'not-found' | 'self'
}

export interface BusDeliveryResult {
  delivered: string[]
  skipped: BusSkipped[]
}

/** Delivery receipt echoed back to the sender's renderer. */
export interface BusMessageEvent {
  projectId: string
  fromAgentId: string
  fromAgentName: string
  toAgentId: string
  toAgentName: string
  text: string
  timestamp: number
}

// ---- Task engine (workflows) ----

/** One step in a workflow: an instruction handed to a specific agent. */
export interface WorkflowStep {
  id: string
  agentId: string
  prompt: string
}

/** A named, ordered chain of steps that collaborate within a project. */
export interface Workflow {
  id: string
  projectId: string
  name: string
  steps: WorkflowStep[]
  createTime: number
}

export interface CreateWorkflowInput {
  projectId: string
  name: string
  steps: { agentId: string; prompt: string }[]
}

export interface UpdateWorkflowInput {
  id: string
  name: string
  steps: { agentId: string; prompt: string }[]
}

export type StepRunStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'
export type WorkflowRunStatus = 'running' | 'done' | 'error' | 'stopped'

export interface StartWorkflowInput {
  workflowId: string
  /** Output silence (ms) that marks a step complete. Defaults to 8000. */
  idleMs?: number
}

export interface StepRunState {
  stepId: string
  agentId: string
  status: StepRunStatus
}

/**
 * A full snapshot of a run, pushed to the renderer on every state change so the
 * UI can render directly without tracking deltas.
 */
export interface TaskRunEvent {
  runId: string
  workflowId: string
  projectId: string
  status: WorkflowRunStatus
  currentStepIndex: number
  steps: StepRunState[]
  /** Optional message, e.g. an error like "agent not running". */
  message?: string
  timestamp: number
}

// ---- Orchestrator (master agent → dynamic sub-agents) ----

/** Project-relative path where the master agent writes its plan. */
export const PLAN_FILE = '.agent-studio/orchestration-plan.json'

/** One sub-agent the master agent proposes: a role + task + dependencies. */
export interface PlanNode {
  /** Unique id within the plan, referenced by other nodes' dependsOn. */
  key: string
  /** Role name, used as the sub-agent's display name. */
  role: string
  /** CLI assigned to this role. */
  type: AgentType
  /** The instruction handed to this sub-agent. */
  task: string
  /** Keys of nodes that must finish before this one starts (forms a DAG). */
  dependsOn: string[]
}

export interface OrchestrationPlan {
  goal: string
  agents: PlanNode[]
}

export type OrchNodeStatus = 'pending' | 'blocked' | 'running' | 'done' | 'error'
export type OrchestratorRunStatus = 'running' | 'done' | 'error' | 'stopped'

/** A plan node bound to the real agent id the renderer created for it. */
export interface OrchestratorRunNode {
  key: string
  agentId: string
  task: string
  dependsOn: string[]
}

export interface OrchestratorRunInput {
  projectId: string
  /** Output silence (ms) that marks a node complete. Defaults to 8000. */
  idleMs?: number
  nodes: OrchestratorRunNode[]
}

export interface OrchestratorNodeState {
  key: string
  agentId: string
  status: OrchNodeStatus
}

export interface OrchestratorEvent {
  runId: string
  projectId: string
  status: OrchestratorRunStatus
  nodes: OrchestratorNodeState[]
  message?: string
  timestamp: number
}

/**
 * The prompt handed to the master agent. It must produce an OrchestrationPlan
 * and write it (only the JSON) to PLAN_FILE so the app can read it back.
 */
export function buildPlannerPrompt(goal: string): string {
  // Single line on purpose: embedded newlines would submit early in a CLI TUI.
  return (
    `你是一个软件项目的总负责人（主代理）。目标：「${goal}」。` +
    `请把它拆解成完成所需的多个角色（子代理），每个角色一个独立任务，并标注彼此依赖关系，` +
    `然后直接在当前项目目录创建文件 ${PLAN_FILE}（目录不存在就先创建），文件内容是一个 JSON 对象，不要输出额外解释。` +
    `JSON 结构为 {"goal": string, "agents": [{"key": string, "role": string, "type": "claude"|"codex"|"gemini"|"reasonix", "task": string, "dependsOn": string[]}]}。` +
    `约束：key 在计划内唯一；dependsOn 引用其它节点的 key 构成有向无环图（无依赖填空数组）；` +
    `type 按角色选合适的 CLI（写代码类用 codex，需求/架构/文档/审查类用 claude）；` +
    `task 要具体可独立执行，并说明该角色应把产出写到项目里的哪些文件以便协作；` +
    `角色数量通常 4~8 个，覆盖从需求到落地的关键环节。完成后只需写好 ${PLAN_FILE} 即可。`
  )
}
