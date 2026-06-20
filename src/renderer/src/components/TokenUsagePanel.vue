<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useTokenStatsStore } from '../stores/tokenStats'
import { t } from '../i18n'
import { AGENT_COMMANDS, type AgentTokenUsage, type ModelTokenUsage } from '@shared/types'

const tokenStore = useTokenStatsStore()

const stats = computed(() => tokenStore.stats)

/** Largest single-model total, used to scale every bar consistently. */
const maxModelTotal = computed(() => {
  let max = 0
  for (const agent of stats.value?.agents ?? []) {
    for (const model of agent.models) {
      if (model.totalTokens > max) max = model.totalTokens
    }
  }
  return max
})

const hasAnyUsage = computed(() => (stats.value?.totalTokens ?? 0) > 0)

function agentLabel(type: AgentTokenUsage['type']): string {
  return AGENT_COMMANDS[type]?.label ?? type
}

/** Compact human number: 1234 -> 1.23K, 1_500_000 -> 1.5M. */
function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

interface Segment {
  key: string
  label: string
  value: number
  color: string
}

function segmentsOf(model: ModelTokenUsage): Segment[] {
  return [
    { key: 'input', label: t('tokens.input'), value: model.inputTokens, color: 'var(--accent)' },
    { key: 'output', label: t('tokens.output'), value: model.outputTokens, color: 'var(--success)' },
    {
      key: 'cacheWrite',
      label: t('tokens.cacheWrite'),
      value: model.cacheCreationTokens,
      color: 'var(--warning)'
    },
    {
      key: 'cacheRead',
      label: t('tokens.cacheRead'),
      value: model.cacheReadTokens,
      color: 'var(--accent-strong)'
    }
  ]
}

/** Bar length relative to the largest model across all agents. */
function barScale(model: ModelTokenUsage): number {
  if (maxModelTotal.value <= 0) return 0
  return (model.totalTokens / maxModelTotal.value) * 100
}

function segmentWidth(segment: Segment, model: ModelTokenUsage): number {
  if (model.totalTokens <= 0) return 0
  return (segment.value / model.totalTokens) * 100
}

const legend = computed<Segment[]>(() => [
  { key: 'input', label: t('tokens.input'), value: 0, color: 'var(--accent)' },
  { key: 'output', label: t('tokens.output'), value: 0, color: 'var(--success)' },
  { key: 'cacheWrite', label: t('tokens.cacheWrite'), value: 0, color: 'var(--warning)' },
  { key: 'cacheRead', label: t('tokens.cacheRead'), value: 0, color: 'var(--accent-strong)' }
])

async function refresh(): Promise<void> {
  try {
    await tokenStore.load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err))
  }
}

onMounted(() => {
  if (!tokenStore.stats) refresh()
})
</script>

<template>
  <section class="token-panel">
    <svg class="icon-sprite" aria-hidden="true">
      <symbol id="tk-refresh" viewBox="0 0 16 16">
        <path d="M13 3v4H9M3 13V9h4M12.2 6A4.8 4.8 0 0 0 4 4.8M3.8 10A4.8 4.8 0 0 0 12 11.2" />
      </symbol>
    </svg>

    <div class="section-head">
      <span class="section-title">{{ t('tokens.title') }}</span>
      <button class="icon-action" type="button" :title="t('tokens.refresh')" @click="refresh">
        <svg><use href="#tk-refresh" /></svg>
      </button>
    </div>

    <div class="summary">
      <div class="summary-total">
        <span class="summary-value">{{ formatTokens(stats?.totalTokens ?? 0) }}</span>
        <span class="summary-label">{{ t('tokens.total') }}</span>
      </div>
      <div class="summary-meta">
        {{ t('tokens.projects', { count: stats?.projectCount ?? 0 }) }}
      </div>
    </div>

    <div class="legend">
      <span v-for="item in legend" :key="item.key" class="legend-item">
        <span class="legend-swatch" :style="{ background: item.color }" />
        {{ item.label }}
      </span>
    </div>

    <div v-if="tokenStore.loading && !stats" class="empty">{{ t('tokens.loading') }}</div>
    <div v-else-if="!hasAnyUsage" class="empty">{{ t('tokens.empty') }}</div>

    <template v-else>
      <div v-for="agent in stats?.agents" :key="agent.type" class="agent-group">
        <div class="agent-head">
          <span class="agent-name">{{ agentLabel(agent.type) }}</span>
          <span class="agent-total">{{ formatTokens(agent.totalTokens) }}</span>
        </div>

        <div v-if="!agent.supported" class="empty small">{{ t('tokens.unsupported') }}</div>
        <div v-else-if="!agent.models.length" class="empty small">{{ t('tokens.noAgentUsage') }}</div>

        <div v-for="model in agent.models" :key="model.model" class="model-row">
          <div class="model-head">
            <span class="model-name" :title="model.model">{{ model.model }}</span>
            <span class="model-total">{{ formatTokens(model.totalTokens) }}</span>
          </div>
          <div class="bar-track">
            <div class="bar" :style="{ width: `${barScale(model)}%` }">
              <span
                v-for="segment in segmentsOf(model)"
                :key="segment.key"
                class="bar-seg"
                :style="{ width: `${segmentWidth(segment, model)}%`, background: segment.color }"
                :title="`${segment.label}: ${segment.value.toLocaleString()}`"
              />
            </div>
          </div>
          <div class="model-meta">
            <span :title="t('tokens.input')">↑ {{ formatTokens(model.inputTokens) }}</span>
            <span :title="t('tokens.output')">↓ {{ formatTokens(model.outputTokens) }}</span>
            <span :title="t('tokens.cacheRead')">⚡ {{ formatTokens(model.cacheReadTokens) }}</span>
            <span :title="t('tokens.messages')">✉ {{ model.messageCount }}</span>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.token-panel {
  padding: 0 0 12px;
}
.icon-sprite {
  display: none;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 0 8px 0 12px;
}
.section-title {
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.icon-action {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--bg-panel);
  color: var(--text);
  cursor: pointer;
}
.icon-action:hover {
  background: var(--list-hover);
}
.icon-action svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.45;
}
.summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.summary-total {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.summary-value {
  color: var(--text);
  font-size: 20px;
  font-weight: 700;
}
.summary-label {
  color: var(--text-dim);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.summary-meta {
  color: var(--text-dim);
  font-size: 11px;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 8px 12px 4px;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-dim);
  font-size: 11px;
}
.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
.empty {
  padding: 12px;
  color: var(--text-dim);
  font-size: 12px;
  line-height: 1.4;
}
.empty.small {
  padding: 4px 12px 8px;
  font-size: 11px;
}
.agent-group {
  margin-top: 6px;
}
.agent-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 26px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
}
.agent-name {
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
}
.agent-total {
  color: var(--text-dim);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.model-row {
  padding: 7px 12px 8px;
  border-bottom: 1px solid var(--border-subtle, var(--border));
}
.model-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.model-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
  font-size: 12px;
}
.model-total {
  flex: 0 0 auto;
  color: var(--text);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.bar-track {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: var(--bg);
  overflow: hidden;
}
.bar {
  display: flex;
  height: 100%;
  min-width: 1px;
  border-radius: 4px;
  overflow: hidden;
}
.bar-seg {
  height: 100%;
}
.model-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 5px;
  color: var(--text-dim);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
</style>
