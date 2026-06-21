import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { DEFAULT_AGENT_CONFIGS, type AgentConfig, type AgentType } from '@shared/types'

const FONT_SIZE_STORAGE_KEY = 'agent-studio.settings.fontSizePx'
const LEGACY_SCALE_STORAGE_KEY = 'agent-studio.settings.fontScale'
const AGENT_TYPES_STORAGE_KEY = 'agent-studio.settings.enabledAgentTypes'
const AGENT_CONFIGS_STORAGE_KEY = 'agent-studio.settings.agentConfigs'
const DEFAULT_FONT_SIZE = 13
const MIN_FONT_SIZE = 10
const MAX_FONT_SIZE = 28

const DEFAULT_AGENT_TYPES = DEFAULT_AGENT_CONFIGS.map((config) => config.id)

const legacyScaleMap: Record<string, number> = {
  compact: 12,
  normal: 13,
  large: 15,
  extra: 17
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
  if (!id || !name || !command) return null
  return {
    id,
    name,
    command,
    enabled: config.enabled !== false,
    builtin: Boolean(config.builtin)
  }
}

function initialAgentConfigs(): AgentConfig[] {
  try {
    const saved = JSON.parse(localStorage.getItem(AGENT_CONFIGS_STORAGE_KEY) ?? '[]')
    if (Array.isArray(saved)) {
      const merged = new Map<string, AgentConfig>()
      for (const config of DEFAULT_AGENT_CONFIGS) merged.set(config.id, { ...config })
      for (const config of saved) {
        const normalized = normalizeAgentConfig(config)
        if (normalized) merged.set(normalized.id, normalized)
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
  const agentConfigs = ref<AgentConfig[]>(initialAgentConfigs())

  const cssVars = computed<Record<string, string>>(() => {
    const base = fontSizePx.value
    return {
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

  function upsertAgentConfig(input: Pick<AgentConfig, 'name' | 'command'> & { id?: AgentType }): AgentConfig | null {
    const existingId = input.id?.trim()
    const id = existingId || `custom-${Date.now().toString(36)}`
    const next = normalizeAgentConfig({
      id,
      name: input.name,
      command: input.command,
      enabled: true,
      builtin: agentConfigs.value.find((config) => config.id === id)?.builtin
    })
    if (!next) return null

    const index = agentConfigs.value.findIndex((config) => config.id === id)
    if (index >= 0) {
      agentConfigs.value[index] = { ...agentConfigs.value[index], ...next }
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
  watch(
    agentConfigs,
    (next) => persistAgentConfigs(next),
    { deep: true, immediate: true }
  )

  return {
    fontSizePx,
    minFontSize: MIN_FONT_SIZE,
    maxFontSize: MAX_FONT_SIZE,
    agentConfigs,
    enabledAgentConfigs,
    availableAgentTypes: DEFAULT_AGENT_TYPES,
    enabledAgentTypes,
    cssVars,
    terminalFontSize,
    setFontSizePx,
    setAgentTypeEnabled,
    isAgentTypeEnabled,
    upsertAgentConfig,
    removeAgentConfig,
    agentConfigOf
  }
})
