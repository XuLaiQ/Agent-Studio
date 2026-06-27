import { execFile } from 'child_process'
import { platform } from 'os'
import { promisify } from 'util'
import {
  AGENT_MODELS,
  type AgentModelCatalog,
  type AgentType,
  type ModelOption,
  type ReasoningEffortOption,
  type ServiceTierOption
} from '../shared/types'

const execFileAsync = promisify(execFile)
const IS_WIN = platform() === 'win32'

interface CodexModelEntry {
  slug?: unknown
  display_name?: unknown
  description?: unknown
  visibility?: unknown
  default_reasoning_level?: unknown
  default_reasoning_effort?: unknown
  supported_reasoning_levels?: unknown
  supported_reasoning_efforts?: unknown
  default_service_tier?: unknown
  service_tiers?: unknown
}

function fallbackCatalog(type: AgentType, error?: string): AgentModelCatalog {
  return {
    type,
    models: AGENT_MODELS[type] ?? [{ id: '', label: 'Default' }],
    source: 'static',
    error
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeReasoningEfforts(value: unknown): ReasoningEffortOption[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return { id: item, label: effortLabel(item) }
      if (!item || typeof item !== 'object') return null
      const rec = item as Record<string, unknown>
      const id = asString(rec.effort) ?? asString(rec.id)
      if (!id) return null
      return {
        id,
        label: effortLabel(id),
        description: asString(rec.description)
      }
    })
    .filter((item): item is ReasoningEffortOption => Boolean(item))
}

function normalizeServiceTiers(value: unknown): ServiceTierOption[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return { id: item, label: serviceTierLabel(item) }
      if (!item || typeof item !== 'object') return null
      const rec = item as Record<string, unknown>
      const id = asString(rec.id)
      if (!id) return null
      return {
        id,
        label: asString(rec.name) ?? serviceTierLabel(id),
        description: asString(rec.description)
      }
    })
    .filter((item): item is ServiceTierOption => Boolean(item))
}

function effortLabel(id: string): string {
  const labels: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'XHigh',
    max: 'Max'
  }
  return labels[id] ?? id
}

function serviceTierLabel(id: string): string {
  const labels: Record<string, string> = {
    priority: 'Fast'
  }
  return labels[id] ?? id
}

function normalizeCodexModels(raw: unknown): ModelOption[] {
  const source = raw && typeof raw === 'object' ? (raw as { models?: unknown }).models : undefined
  if (!Array.isArray(source)) return []

  const models: ModelOption[] = source
    .map<ModelOption | null>((item) => {
      if (!item || typeof item !== 'object') return null
      const rec = item as CodexModelEntry
      const id = asString(rec.slug)
      if (!id || rec.visibility === 'hide') return null

      return {
        id,
        label: asString(rec.display_name) ?? id,
        description: asString(rec.description),
        defaultReasoningEffort:
          asString(rec.default_reasoning_level) ?? asString(rec.default_reasoning_effort),
        reasoningEfforts: normalizeReasoningEfforts(
          rec.supported_reasoning_levels ?? rec.supported_reasoning_efforts
        ),
        defaultServiceTier: asString(rec.default_service_tier),
        serviceTiers: normalizeServiceTiers(rec.service_tiers)
      }
    })
    .filter((item): item is ModelOption => item !== null)

  const defaultSource = models[0]
  const defaultModel: ModelOption = {
    id: '',
    label: 'Default',
    defaultReasoningEffort: defaultSource?.defaultReasoningEffort,
    reasoningEfforts: defaultSource?.reasoningEfforts,
    defaultServiceTier: defaultSource?.defaultServiceTier,
    serviceTiers: defaultSource?.serviceTiers
  }

  return [defaultModel, ...models]
}

async function loadCodexCatalog(command?: string): Promise<AgentModelCatalog> {
  const executable = command?.trim() || 'codex'
  try {
    const shell = IS_WIN ? 'powershell.exe' : (process.env.SHELL || 'bash')
    const args = IS_WIN
      ? ['-NoLogo', '-NoProfile', '-Command', `${executable} debug models`]
      : ['-lc', `${executable} debug models`]
    const { stdout } = await execFileAsync(shell, args, {
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 5 * 1024 * 1024
    })
    const models = normalizeCodexModels(JSON.parse(stdout))
    if (!models.length) return fallbackCatalog('codex', 'No Codex models returned')
    return { type: 'codex', models, source: 'cli' }
  } catch (err) {
    return fallbackCatalog('codex', err instanceof Error ? err.message : String(err))
  }
}

export async function listModelCatalog(
  type: AgentType,
  command?: string
): Promise<AgentModelCatalog> {
  if (type === 'codex') return loadCodexCatalog(command)
  return fallbackCatalog(type)
}
