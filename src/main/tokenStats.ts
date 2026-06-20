import { readdir, readFile, stat } from 'fs/promises'
import { homedir } from 'os'
import { basename, join } from 'path'
import type {
  AgentTokenUsage,
  AgentType,
  ModelTokenUsage,
  TokenUsageStats
} from '../shared/types'
import { AGENT_COMMANDS } from '../shared/types'
import { store } from './store'

/** Per-model running sums, keyed by raw model id. */
type ModelSums = Map<string, ModelTokenUsage>

/** Cached parse of a single transcript file, invalidated by mtime/size. */
interface FileCacheEntry {
  mtimeMs: number
  size: number
  sums: ModelSums
}

const fileCache = new Map<string, FileCacheEntry>()

function emptyModelUsage(model: string): ModelTokenUsage {
  return {
    model,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    messageCount: 0
  }
}

function addUsage(target: ModelTokenUsage, source: ModelTokenUsage): void {
  target.inputTokens += source.inputTokens
  target.outputTokens += source.outputTokens
  target.cacheCreationTokens += source.cacheCreationTokens
  target.cacheReadTokens += source.cacheReadTokens
  target.totalTokens += source.totalTokens
  target.messageCount += source.messageCount
}

function mergeSums(into: ModelSums, from: ModelSums): void {
  for (const [model, usage] of from) {
    const existing = into.get(model) ?? emptyModelUsage(model)
    addUsage(existing, usage)
    into.set(model, existing)
  }
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function addTokenUsage(
  sums: ModelSums,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens = 0,
  cacheReadTokens = 0
): void {
  const entry = sums.get(model) ?? emptyModelUsage(model)
  entry.inputTokens += Math.max(0, inputTokens)
  entry.outputTokens += Math.max(0, outputTokens)
  entry.cacheCreationTokens += Math.max(0, cacheCreationTokens)
  entry.cacheReadTokens += Math.max(0, cacheReadTokens)
  entry.totalTokens +=
    Math.max(0, inputTokens) +
    Math.max(0, outputTokens) +
    Math.max(0, cacheCreationTokens) +
    Math.max(0, cacheReadTokens)
  entry.messageCount += 1
  sums.set(model, entry)
}

async function listFilesRecursive(dir: string, predicate: (file: string) => boolean): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath, predicate)))
    } else if (entry.isFile() && predicate(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

function normalizePathForCompare(path: string): string {
  return path.replace(/[\\/]+$/, '').toLowerCase()
}

/** Claude encodes a project's cwd into its sessions folder name. */
function claudeProjectDir(cwd: string): string {
  return join(homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))
}

function codexSessionsDir(): string {
  return join(homedir(), '.codex', 'sessions')
}

function codexConfigFile(): string {
  return join(homedir(), '.codex', 'config.toml')
}

function reasonixUsageFile(): string {
  return join(homedir(), '.reasonix', 'usage.jsonl')
}

function reasonixSessionsDir(): string {
  return join(homedir(), '.reasonix', 'sessions')
}

/** Sum the per-model usage recorded in a single Claude JSONL transcript. */
function parseClaudeTranscript(content: string): ModelSums {
  const sums: ModelSums = new Map()

  for (const line of content.split('\n')) {
    if (!line) continue
    let rec: Record<string, unknown>
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }
    if (rec.type !== 'assistant') continue

    const message = rec.message as
      | { model?: unknown; usage?: Record<string, unknown> }
      | undefined
    const usage = message?.usage
    if (!usage) continue

    const model = typeof message?.model === 'string' && message.model ? message.model : 'unknown'
    // Claude Code injects placeholder assistant messages (interrupts, etc.) under
    // the '<synthetic>' model with no real token usage — skip them.
    if (model === '<synthetic>') continue
    const input = toNumber(usage.input_tokens)
    const output = toNumber(usage.output_tokens)
    const cacheCreation = toNumber(usage.cache_creation_input_tokens)
    const cacheRead = toNumber(usage.cache_read_input_tokens)

    addTokenUsage(sums, model, input, output, cacheCreation, cacheRead)
  }

  return sums
}

function parseCodexTranscript(content: string, projectPaths: Set<string>, fallbackModel: string): ModelSums {
  const records: Record<string, unknown>[] = []
  let cwd: string | null = null
  let model = fallbackModel

  for (const line of content.split('\n')) {
    if (!line) continue
    let rec: Record<string, unknown>
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }
    records.push(rec)

    if (rec.type === 'session_meta') {
      const payload = rec.payload as { cwd?: unknown } | undefined
      if (typeof payload?.cwd === 'string') cwd = payload.cwd
    } else if (rec.type === 'turn_context') {
      const payload = rec.payload as { model?: unknown } | undefined
      if (typeof payload?.model === 'string' && payload.model) model = payload.model
    }
  }

  if (!cwd || !projectPaths.has(normalizePathForCompare(cwd))) return new Map()

  const sums: ModelSums = new Map()
  for (const rec of records) {
    const payload = rec.payload as
      | {
          type?: unknown
          info?: {
            last_token_usage?: Record<string, unknown>
          }
        }
      | undefined
    if (rec.type !== 'event_msg' || payload?.type !== 'token_count') continue

    const usage = payload.info?.last_token_usage
    if (!usage) continue
    const cachedInput = toNumber(usage.cached_input_tokens)
    const input = Math.max(0, toNumber(usage.input_tokens) - cachedInput)
    const output = toNumber(usage.output_tokens)
    if (input + output + cachedInput <= 0) continue
    addTokenUsage(sums, model, input, output, 0, cachedInput)
  }

  return sums
}

function parseReasonixUsage(content: string, supportedSessions: Set<string>): ModelSums {
  const sums: ModelSums = new Map()

  for (const line of content.split('\n')) {
    if (!line) continue
    let rec: Record<string, unknown>
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }

    const session = typeof rec.session === 'string' ? rec.session : ''
    if (!session || !supportedSessions.has(session)) continue

    const model = typeof rec.model === 'string' && rec.model ? rec.model : 'unknown'
    const cacheRead = toNumber(rec.cacheHitTokens)
    const prompt = toNumber(rec.promptTokens)
    const input = Math.max(0, toNumber(rec.cacheMissTokens) || prompt - cacheRead)
    const output = toNumber(rec.completionTokens)
    if (input + output + cacheRead <= 0) continue
    addTokenUsage(sums, model, input, output, 0, cacheRead)
  }

  return sums
}

/** Read + parse one transcript, reusing the cache when the file is unchanged. */
async function readTranscriptSums(
  filePath: string,
  parser: (content: string) => ModelSums = parseClaudeTranscript,
  cacheScope = 'default'
): Promise<ModelSums> {
  let mtimeMs = 0
  let size = 0
  try {
    const info = await stat(filePath)
    mtimeMs = info.mtimeMs
    size = info.size
  } catch {
    return new Map()
  }

  const cacheKey = `${cacheScope}:${filePath}`
  const cached = fileCache.get(cacheKey)
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
    return cached.sums
  }

  try {
    const sums = parser(await readFile(filePath, 'utf8'))
    fileCache.set(cacheKey, { mtimeMs, size, sums })
    return sums
  } catch {
    return new Map()
  }
}

/** Aggregate Claude usage across every imported project's transcript folder. */
async function collectClaudeUsage(projectPaths: string[]): Promise<ModelSums> {
  const total: ModelSums = new Map()

  for (const cwd of projectPaths) {
    const dir = claudeProjectDir(cwd)
    let files: string[]
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue // No Claude sessions recorded for this project.
    }

    const perFile = await Promise.all(files.map((f) => readTranscriptSums(join(dir, f))))
    for (const sums of perFile) mergeSums(total, sums)
  }

  return total
}

async function readCodexModel(): Promise<string> {
  try {
    const config = await readFile(codexConfigFile(), 'utf8')
    const match = config.match(/^\s*model\s*=\s*["']([^"']+)["']/m)
    return match?.[1] || 'codex'
  } catch {
    return 'codex'
  }
}

/** Aggregate Codex usage from ~/.codex/sessions rollout JSONL files. */
async function collectCodexUsage(projectPaths: string[]): Promise<ModelSums> {
  const total: ModelSums = new Map()
  const projectSet = new Set(projectPaths.map(normalizePathForCompare))
  const model = await readCodexModel()
  const files = await listFilesRecursive(
    codexSessionsDir(),
    (file) => file.startsWith('rollout-') && file.endsWith('.jsonl')
  )

  const perFile = await Promise.all(
    files.map((file) =>
      readTranscriptSums(
        file,
        (content) => parseCodexTranscript(content, projectSet, model),
        `codex:${model}:${[...projectSet].join('|')}`
      )
    )
  )
  for (const sums of perFile) mergeSums(total, sums)

  return total
}

async function collectReasonixProjectSessions(projectPaths: string[]): Promise<Set<string>> {
  const projectSet = new Set(projectPaths.map(normalizePathForCompare))
  const sessions = new Set<string>()
  const files = await listFilesRecursive(reasonixSessionsDir(), (file) => file.endsWith('.meta.json'))

  await Promise.all(
    files.map(async (file) => {
      try {
        const meta = JSON.parse(await readFile(file, 'utf8')) as {
          workspace?: unknown
          session?: unknown
        }
        const workspace = typeof meta.workspace === 'string' ? meta.workspace : ''
        if (!projectSet.has(normalizePathForCompare(workspace))) return

        const session =
          typeof meta.session === 'string'
            ? meta.session
            : basename(file, '.meta.json')
        sessions.add(session)
      } catch {
        // Ignore malformed metadata; the usage log itself remains intact.
      }
    })
  )

  return sessions
}

/** Aggregate Reasonix usage from ~/.reasonix/usage.jsonl. */
async function collectReasonixUsage(projectPaths: string[]): Promise<ModelSums> {
  const sessions = await collectReasonixProjectSessions(projectPaths)
  if (!sessions.size) return new Map()
  return readTranscriptSums(
    reasonixUsageFile(),
    (content) => parseReasonixUsage(content, sessions),
    `reasonix:${[...sessions].sort().join('|')}`
  )
}

function finalizeAgent(type: AgentType, sums: ModelSums, supported: boolean): AgentTokenUsage {
  const models = [...sums.values()]
    .filter((m) => m.totalTokens > 0)
    .sort((a, b) => b.totalTokens - a.totalTokens)
  const totalTokens = models.reduce((n, m) => n + m.totalTokens, 0)
  return { type, models, totalTokens, supported }
}

/**
 * Builds the application-wide token usage snapshot. Usage is derived from the
 * CLIs' on-disk session transcripts, aggregated across all imported projects, so
 * it reflects real cumulative usage regardless of which project produced it.
 * Claude, Codex, and Reasonix expose parseable local usage records. Other agent
 * types are reported with an empty, `supported: false` entry until wired.
 */
export async function collectTokenUsage(): Promise<TokenUsageStats> {
  const projectPaths = store.getProjects().map((p) => p.path)
  const [claudeSums, codexSums, reasonixSums] = await Promise.all([
    collectClaudeUsage(projectPaths),
    collectCodexUsage(projectPaths),
    collectReasonixUsage(projectPaths)
  ])

  const agents: AgentTokenUsage[] = (Object.keys(AGENT_COMMANDS) as AgentType[]).map((type) => {
    if (type === 'claude') return finalizeAgent(type, claudeSums, true)
    if (type === 'codex') return finalizeAgent(type, codexSums, true)
    if (type === 'reasonix') return finalizeAgent(type, reasonixSums, true)
    return finalizeAgent(type, new Map(), false)
  })

  const totalTokens = agents.reduce((n, a) => n + a.totalTokens, 0)

  return {
    agents,
    totalTokens,
    projectCount: projectPaths.length,
    scannedAt: Date.now()
  }
}
