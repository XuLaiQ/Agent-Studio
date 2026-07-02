import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { DEFAULT_AGENT_CONFIGS, type AgentConfig, type AgentType, type ModelOption } from '@shared/types'

const FONT_SIZE_STORAGE_KEY = 'agent-studio.settings.fontSizePx'
const LEGACY_SCALE_STORAGE_KEY = 'agent-studio.settings.fontScale'
const THEME_STORAGE_KEY = 'agent-studio.settings.theme'
const AGENT_TYPES_STORAGE_KEY = 'agent-studio.settings.enabledAgentTypes'
const AGENT_CONFIGS_STORAGE_KEY = 'agent-studio.settings.agentConfigs'
const DEFAULT_FONT_SIZE = 13
const MIN_FONT_SIZE = 10
const MAX_FONT_SIZE = 28

export type ThemeMode = 'dark' | 'light'

const DEFAULT_AGENT_TYPES = DEFAULT_AGENT_CONFIGS.map((config) => config.id)

const legacyScaleMap: Record<string, number> = {
  compact: 12,
  normal: 13,
  large: 15,
  extra: 17
}

function initialTheme(): ThemeMode {
  const saved = localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return 'dark'
}

function clampFontSize(value: number): number {
  return Math.min(Math.max(Math.round(value), MIN_FONT_SIZE), MAX_FONT_SIZE)
}

function initialFontSize(): number {
  const saved = Number(localStorage.getItem(FONT_SIZE_STORAGE_KEY))
  if (Number.isFinite(saved) && saved > 0) return clampFontSize(saved)

  const legacy = localStorage.getItem(LEGACY_SCALE_STORAGE_KEY)
  if (legacy && legacy in legacyScaleMap) return legacyScaleMap[legacy]

  return DEFAULT_FONT_SIZE
}

function initialAgentTypes(): AgentType[] {
  try {
    const saved = JSON.parse(localStorage.getItem(AGENT_TYPES_STORAGE_KEY) ?? '[]')
    if (Array.isArray(saved)) {
      const valid = saved.filter((type): type is AgentType => DEFAULT_AGENT_TYPES.includes(type))
      if (valid.length) return valid
    }
  } catch {
    /* ignore invalid persisted settings */
  }
  return DEFAULT_AGENT_TYPES
}

function normalizeAgentConfig(config: Partial<AgentConfig>): AgentConfig | null {
  const id = String(config.id ?? '').trim()
  const name = String(config.name ?? '').trim()
  const command = String(config.command ?? '').trim()
  const hasManualModels = config.modelSource === 'manual' && Array.isArray(config.models)
  const models = normalizeModelOptions(config.models)
  if (!id || !name || !command) return null
  return {
    id,
    name,
    command,
    ...(hasManualModels ? { models, modelSource: 'manual' as const } : {}),
    enabled: config.enabled !== false,
    builtin: Boolean(config.builtin)
  }
}

function normalizeModelOptions(models: unknown): ModelOption[] {
  if (!Array.isArray(models)) return []
  const normalized = models
    .map<ModelOption | null>((model) => {
      if (!model || typeof model !== 'object') return null
      const rec = model as Partial<ModelOption>
      const id = String(rec.id ?? '').trim()
      const label = String(rec.label ?? id).trim()
      if (!label) return null
      return {
        id,
        label,
        description: typeof rec.description === 'string' ? rec.description : undefined,
        defaultReasoningEffort:
          typeof rec.defaultReasoningEffort === 'string' ? rec.defaultReasoningEffort : undefined,
        reasoningEfforts: Array.isArray(rec.reasoningEfforts) ? rec.reasoningEfforts : undefined,
        defaultServiceTier:
          typeof rec.defaultServiceTier === 'string' ? rec.defaultServiceTier : undefined,
        serviceTiers: Array.isArray(rec.serviceTiers) ? rec.serviceTiers : undefined
      }
    })
    .filter((model): model is ModelOption => Boolean(model))

  return normalized.some((model) => !model.id)
    ? normalized
    : [{ id: '', label: 'Default' }, ...normalized]
}

function initialAgentConfigs(): AgentConfig[] {
  try {
    const saved = JSON.parse(localStorage.getItem(AGENT_CONFIGS_STORAGE_KEY) ?? '[]')
    if (Array.isArray(saved)) {
      const merged = new Map<string, AgentConfig>()
      for (const config of DEFAULT_AGENT_CONFIGS) merged.set(config.id, { ...config })
      for (const config of saved) {
        const normalized = normalizeAgentConfig(config)
        if (normalized) {
          const existing = merged.get(normalized.id)
          merged.set(normalized.id, {
            ...existing,
            ...normalized,
            models: normalized.modelSource === 'manual' ? normalized.models : existing?.models,
            modelSource:
              normalized.modelSource === 'manual'
                ? normalized.modelSource
                : existing?.modelSource
          })
        }
      }
      const configs = [...merged.values()]
      if (configs.some((config) => config.enabled)) return configs
    }
  } catch {
    /* ignore invalid persisted settings */
  }

  const enabledTypes = new Set(initialAgentTypes())
  return DEFAULT_AGENT_CONFIGS.map((config) => ({
    ...config,
    enabled: enabledTypes.has(config.id)
  }))
}

function persistAgentConfigs(configs: AgentConfig[]): void {
  localStorage.setItem(AGENT_CONFIGS_STORAGE_KEY, JSON.stringify(configs))
  localStorage.setItem(
    AGENT_TYPES_STORAGE_KEY,
    JSON.stringify(configs.filter((config) => config.enabled).map((config) => config.id))
  )
}

export const useSettingsStore = defineStore('settings', () => {
  const fontSizePx = ref(initialFontSize())
  const theme = ref<ThemeMode>(initialTheme())
  const agentConfigs = ref<AgentConfig[]>(initialAgentConfigs())

  const cssVars = computed<Record<string, string>>(() => {
    const base = fontSizePx.value
    return {
      '--app-theme': theme.value,
      '--app-font-size-xxs': `${Math.max(10, base - 3)}px`,
      '--app-font-size-xs': `${Math.max(10, base - 2)}px`,
      '--app-font-size-sm': `${Math.max(11, base - 1)}px`,
      '--app-font-size-base': `${base}px`,
      '--app-font-size-md': `${base + 1}px`,
      '--app-font-size-lg': `${base + 4}px`,
      '--app-font-size-xl': `${base + 7}px`,
      '--app-font-size-xxl': `${base + 13}px`,
      '--app-font-size-hero': `${base + 43}px`
    }
  })

  const terminalFontSize = computed(() => fontSizePx.value)
  const enabledAgentConfigs = computed(() => agentConfigs.value.filter((config) => config.enabled))
  const enabledAgentTypes = computed(() => enabledAgentConfigs.value.map((config) => config.id))

  function setFontSizePx(next: number | undefined): void {
    if (typeof next !== 'number' || !Number.isFinite(next)) return
    fontSizePx.value = clampFontSize(next)
  }

  function setTheme(next: ThemeMode): void {
    theme.value = next
  }

  function setAgentTypeEnabled(type: AgentType, enabled: boolean): void {
    const config = agentConfigs.value.find((item) => item.id === type)
    if (!config) return
    if (!enabled && enabledAgentConfigs.value.length <= 1 && config.enabled) return
    config.enabled = enabled
    persistAgentConfigs(agentConfigs.value)
  }

  function isAgentTypeEnabled(type: AgentType): boolean {
    return agentConfigs.value.some((config) => config.id === type && config.enabled)
  }

  function upsertAgentConfig(
    input: Pick<AgentConfig, 'name' | 'command'> & {
      id?: AgentType
      models?: ModelOption[]
      modelSource?: AgentConfig['modelSource']
    }
  ): AgentConfig | null {
    const existingId = input.id?.trim()
    const id = existingId || `custom-${Date.now().toString(36)}`
    const next = normalizeAgentConfig({
      id,
      name: input.name,
      command: input.command,
      models: input.models,
      modelSource: input.modelSource,
      enabled: true,
      builtin: agentConfigs.value.find((config) => config.id === id)?.builtin
    })
    if (!next) return null

    const index = agentConfigs.value.findIndex((config) => config.id === id)
    if (index >= 0) {
      const existing = agentConfigs.value[index]
      agentConfigs.value[index] = {
        ...existing,
        ...next,
        models: next.modelSource === 'manual' ? next.models : undefined,
        modelSource: next.modelSource
      }
    } else {
      agentConfigs.value.push(next)
    }
    persistAgentConfigs(agentConfigs.value)
    return next
  }

  function removeAgentConfig(id: AgentType): void {
    const target = agentConfigs.value.find((config) => config.id === id)
    if (!target || target.builtin) return
    if (target.enabled && enabledAgentConfigs.value.length <= 1) return
    agentConfigs.value = agentConfigs.value.filter((config) => config.id !== id)
    persistAgentConfigs(agentConfigs.value)
  }

  function agentConfigOf(type: AgentType): AgentConfig | undefined {
    return agentConfigs.value.find((config) => config.id === type)
  }

  watch(fontSizePx, (next) => localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(next)), { immediate: true })
  watch(theme, (next) => localStorage.setItem(THEME_STORAGE_KEY, next), { immediate: true })
  watch(
    agentConfigs,
    (next) => persistAgentConfigs(next),
    { deep: true, immediate: true }
  )

  return {
    fontSizePx,
    minFontSize: MIN_FONT_SIZE,
    maxFontSize: MAX_FONT_SIZE,
    theme,
    agentConfigs,
    enabledAgentConfigs,
    availableAgentTypes: DEFAULT_AGENT_TYPES,
    enabledAgentTypes,
    cssVars,
    terminalFontSize,
    setFontSizePx,
    setTheme,
    setAgentTypeEnabled,
    isAgentTypeEnabled,
    upsertAgentConfig,
    removeAgentConfig,
    agentConfigOf
  }
})
