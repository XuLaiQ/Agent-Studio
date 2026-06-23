import { readdir, readFile, stat } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import type {
  AgentTokenUsage,
  AgentType,
  ModelTokenUsage,
  TokenUsageStats
} from '../shared/types'
import { AGENT_COMMANDS } from '../shared/types'

/** Per-model running sums, keyed by raw model id. */
type ModelSums = Map<string, ModelTokenUsage>

/** Cached parse of a single transcript file, invalidated by mtime/size. */
interface FileCacheEntry {
  mtimeMs: number
  size: number
  sums: ModelSums
}

const fileCache = new Map<string, FileCacheEntry>()

/** Timestamp helpers for "today" filtering. */
const TODAY_START_MS = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
})()

function isToday(ts: number): boolean {
  return ts >= TODAY_START_MS
}

const TIMESTAMP_FIELDS = ['timestamp', 'created_at', 'createdAt', 'date', 'time', 'ts']

/** Try to extract a millisecond epoch from a record's common timestamp fields. */
function extractTimestamp(rec: Record<string, unknown>): number | null {
  for (const field of TIMESTAMP_FIELDS) {
    const raw = rec[field]
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw < 1e12 ? raw * 1000 : raw
    }
    if (typeof raw === 'string' && raw) {
      const parsed = Date.parse(raw)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

/** Returns true when the record should be skipped because todayOnly is active and the record is not from today. */
function skipByDate(rec: Record<string, unknown>, todayOnly: boolean): boolean {
  if (!todayOnly) return false
  const ts = extractTimestamp(rec)
  return ts === null || !isToday(ts)
}

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

function claudeProjectsDir(): string {
  return join(homedir(), '.claude', 'projects')
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

/** Sum the per-model usage recorded in a single Claude JSONL transcript. */
function parseClaudeTranscript(content: string, todayOnly = false): ModelSums {
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
    if (skipByDate(rec, todayOnly)) continue

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

function parseCodexTranscript(content: string, fallbackModel: string, todayOnly = false): ModelSums {
  const records: Record<string, unknown>[] = []
  let model = fallbackModel

  for (const line of content.split('\n')) {
    if (!line) continue
    let rec: Record<string, unknown>
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }
    if (skipByDate(rec, todayOnly)) continue
    records.push(rec)

    if (rec.type === 'turn_context') {
      const payload = rec.payload as { model?: unknown } | undefined
      if (typeof payload?.model === 'string' && payload.model) model = payload.model
    }
  }

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

function parseReasonixUsage(content: string, todayOnly = false): ModelSums {
  const sums: ModelSums = new Map()

  for (const line of content.split('\n')) {
    if (!line) continue
    let rec: Record<string, unknown>
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }
    if (skipByDate(rec, todayOnly)) continue

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

/** Read + parse one transcript, reusing the cache when the file is unchanged.
 *  The cache key includes todayOnly so switching modes invalidates the cache. */
async function readTranscriptSums(
  filePath: string,
  parser: (content: string, todayOnly: boolean) => ModelSums,
  todayOnly: boolean,
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

  const cacheKey = `${cacheScope}:${todayOnly ? 'today' : 'all'}:${filePath}`
  const cached = fileCache.get(cacheKey)
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
    return cached.sums
  }

  try {
    const sums = parser(await readFile(filePath, 'utf8'), todayOnly)
    fileCache.set(cacheKey, { mtimeMs, size, sums })
    return sums
  } catch {
    return new Map()
  }
}

/** Aggregate Claude usage across every local transcript folder. */
async function collectClaudeUsage(todayOnly: boolean): Promise<ModelSums> {
  const total: ModelSums = new Map()
  const files = await listFilesRecursive(claudeProjectsDir(), (file) => file.endsWith('.jsonl'))
  const perFile = await Promise.all(files.map((file) => readTranscriptSums(file, parseClaudeTranscript, todayOnly)))
  for (const sums of perFile) mergeSums(total, sums)

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
async function collectCodexUsage(todayOnly: boolean): Promise<ModelSums> {
  const total: ModelSums = new Map()
  const model = await readCodexModel()
  const files = await listFilesRecursive(
    codexSessionsDir(),
    (file) => file.startsWith('rollout-') && file.endsWith('.jsonl')
  )

  const perFile = await Promise.all(
    files.map((file) =>
      readTranscriptSums(
        file,
        (content, td) => parseCodexTranscript(content, model, td),
        todayOnly,
        `codex:${model}`
      )
    )
  )
  for (const sums of perFile) mergeSums(total, sums)

  return total
}

/** Aggregate Reasonix usage from ~/.reasonix/usage.jsonl. */
async function collectReasonixUsage(todayOnly: boolean): Promise<ModelSums> {
  return readTranscriptSums(
    reasonixUsageFile(),
    (content, td) => parseReasonixUsage(content, td),
    todayOnly,
    'reasonix'
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
 * CLIs' on-disk session transcripts and usage logs, independent of the current
 * project list, so it reflects real cumulative usage even after projects close.
 * Claude, Codex, and Reasonix expose parseable local usage records. Other agent
 * types are reported with an empty, `supported: false` entry until wired.
 */
export async function collectTokenUsage(todayOnly = false): Promise<TokenUsageStats> {
  const [claudeSums, codexSums, reasonixSums] = await Promise.all([
    collectClaudeUsage(todayOnly),
    collectCodexUsage(todayOnly),
    collectReasonixUsage(todayOnly)
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
    scannedAt: Date.now()
  }
}
