<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { EChartsCoreOption } from 'echarts/core'
import EChart from './EChart.vue'
import { useTokenStatsStore } from '../stores/tokenStats'
import { useSettingsStore } from '../stores/settings'
import { t } from '../i18n'
import { AGENT_COMMANDS, type AgentType, type ModelTokenUsage } from '@shared/types'

const tokenStore = useTokenStatsStore()
const settings = useSettingsStore()
const stats = computed(() => tokenStore.stats)

// ---- Theme constants (echarts canvas can't read CSS variables) ----
const DARK_THEME = {
  AXIS: '#a1a1aa',
  SPLIT: '#2a2a38',
  TEXT: '#f5f5f7',
  CARD_BG: '#16161f',
  PALETTE: ['#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#06b6d4', '#a855f7', '#eab308'],
  SEG: {
    input: '#8b5cf6',
    output: '#10b981',
    cacheWrite: '#f59e0b',
    cacheRead: '#3b82f6'
  }
}

const LIGHT_THEME = {
  AXIS: '#5f6570',
  SPLIT: '#d4d6da',
  TEXT: '#1a1a2e',
  CARD_BG: '#ffffff',
  PALETTE: ['#7c3aed', '#059669', '#d97706', '#2563eb', '#dc2626', '#0891b2', '#6d28d9', '#ca8a04'],
  SEG: {
    input: '#7c3aed',
    output: '#059669',
    cacheWrite: '#d97706',
    cacheRead: '#2563eb'
  }
}

const chartColors = computed(() => (settings.theme === 'light' ? LIGHT_THEME : DARK_THEME))
const chartFontXs = computed(() => Math.max(10, settings.fontSizePx - 2))
const chartFontBase = computed(() => settings.fontSizePx)
const tooltipBase = computed(() => ({
  backgroundColor: chartColors.value.CARD_BG,
  borderColor: chartColors.value.SPLIT,
  textStyle: { color: chartColors.value.TEXT, fontSize: chartFontXs.value }
}))

interface ModelRow extends ModelTokenUsage {
  type: AgentType
  short: string
}

/** All models that recorded usage, flattened across agent types, biggest first. */
const models = computed<ModelRow[]>(() => {
  const rows: ModelRow[] = []
  for (const agent of stats.value?.agents ?? []) {
    for (const m of agent.models) {
      if (m.totalTokens > 0) rows.push({ ...m, type: agent.type, short: shortModel(m.model) })
    }
  }
  return rows.sort((a, b) => b.totalTokens - a.totalTokens)
})

const hasUsage = computed(() => models.value.length > 0)

const totals = computed(() => {
  const acc = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, responses: 0 }
  for (const m of models.value) {
    acc.input += m.inputTokens
    acc.output += m.outputTokens
    acc.cacheWrite += m.cacheCreationTokens
    acc.cacheRead += m.cacheReadTokens
    acc.responses += m.messageCount
  }
  return acc
})

const agentTotals = computed(() => {
  return (stats.value?.agents ?? [])
    .filter((a) => a.totalTokens > 0)
    .map((a) => ({ type: a.type, label: AGENT_COMMANDS[a.type]?.label ?? a.type, total: a.totalTokens }))
})

function shortModel(id: string): string {
  return id
    .replace(/^claude-/, '')
    .replace(/-\d{6,}$/, '') // drop trailing date stamp, e.g. -20251001
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function agentLabel(type: AgentType): string {
  return AGENT_COMMANDS[type]?.label ?? type
}

// ---- Chart options ----

const modelShareOption = computed<EChartsCoreOption>(() => ({
  color: chartColors.value.PALETTE,
  tooltip: {
    trigger: 'item',
    ...tooltipBase.value,
    formatter: (p: { name: string; value: number; percent: number; marker: string }) =>
      `${p.marker}${p.name}<br/><b>${p.value.toLocaleString()}</b> (${p.percent}%)`
  },
  legend: {
    type: 'scroll',
    bottom: 0,
    icon: 'circle',
    textStyle: { color: chartColors.value.AXIS, fontSize: chartFontXs.value },
    pageTextStyle: { color: chartColors.value.AXIS }
  },
  series: [
    {
      name: t('tokens.byModel'),
      type: 'pie',
      radius: ['44%', '70%'],
      center: ['50%', '44%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: chartColors.value.CARD_BG, borderWidth: 2, borderRadius: 4 },
      label: { show: false },
      emphasis: {
        label: { show: true, color: chartColors.value.TEXT, fontSize: chartFontBase.value, fontWeight: 'bold', formatter: '{b}' }
      },
      data: models.value.map((m) => ({ name: m.short, value: m.totalTokens }))
    }
  ]
}))

const compositionOption = computed<EChartsCoreOption>(() => {
  const SEG = chartColors.value.SEG
  const data = [
    { name: t('tokens.input'), value: totals.value.input, color: SEG.input },
    { name: t('tokens.output'), value: totals.value.output, color: SEG.output },
    { name: t('tokens.cacheWrite'), value: totals.value.cacheWrite, color: SEG.cacheWrite },
    { name: t('tokens.cacheRead'), value: totals.value.cacheRead, color: SEG.cacheRead }
  ]
  return {
    tooltip: {
      trigger: 'item',
      ...tooltipBase.value,
      formatter: (p: { name: string; value: number; percent: number; marker: string }) =>
        `${p.marker}${p.name}<br/><b>${p.value.toLocaleString()}</b> (${p.percent}%)`
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      icon: 'circle',
      textStyle: { color: chartColors.value.AXIS, fontSize: chartFontXs.value }
    },
    series: [
      {
        name: t('tokens.composition'),
        type: 'pie',
        radius: ['44%', '70%'],
        center: ['50%', '44%'],
        itemStyle: { borderColor: chartColors.value.CARD_BG, borderWidth: 2, borderRadius: 4 },
        label: { show: false },
        emphasis: {
          label: { show: true, color: chartColors.value.TEXT, fontSize: chartFontBase.value, fontWeight: 'bold', formatter: '{b}' }
        },
        data: data.map((d) => ({ name: d.name, value: d.value, itemStyle: { color: d.color } }))
      }
    ]
  }
})

const byModelBarOption = computed<EChartsCoreOption>(() => {
  const SEG = chartColors.value.SEG
  // Reverse so the largest model sits at the top of the horizontal bar chart.
  const names = models.value.map((m) => m.short).reverse()
  const series = (
    [
      ['input', 'inputTokens', SEG.input],
      ['output', 'outputTokens', SEG.output],
      ['cacheWrite', 'cacheCreationTokens', SEG.cacheWrite],
      ['cacheRead', 'cacheReadTokens', SEG.cacheRead]
    ] as const
  ).map(([key, field, color]) => ({
    name: t(`tokens.${key}`),
    type: 'bar' as const,
    stack: 'total',
    color,
    barMaxWidth: 22,
    emphasis: { focus: 'series' as const },
    data: models.value.map((m) => m[field]).reverse()
  }))

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tooltipBase.value,
      valueFormatter: (v: number) => Number(v).toLocaleString()
    },
    legend: { top: 0, icon: 'roundRect', itemHeight: 9, textStyle: { color: chartColors.value.AXIS, fontSize: chartFontXs.value } },
    grid: { left: 8, right: 18, top: 38, bottom: 6, containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { color: chartColors.value.AXIS, fontSize: chartFontXs.value, formatter: (v: number) => formatTokens(v) },
      axisLine: { lineStyle: { color: chartColors.value.SPLIT } },
      splitLine: { lineStyle: { color: chartColors.value.SPLIT, type: 'dashed' } }
    },
    yAxis: {
      type: 'category',
      data: names,
      axisLabel: { color: chartColors.value.AXIS, fontSize: chartFontXs.value },
      axisLine: { lineStyle: { color: chartColors.value.SPLIT } },
      axisTick: { show: false }
    },
    series
  }
})

const byAgentOption = computed<EChartsCoreOption>(() => ({
  color: chartColors.value.PALETTE,
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    ...tooltipBase.value,
    valueFormatter: (v: number) => Number(v).toLocaleString()
  },
  grid: { left: 8, right: 18, top: 16, bottom: 6, containLabel: true },
  xAxis: {
    type: 'category',
    data: agentTotals.value.map((a) => a.label),
    axisLabel: { color: chartColors.value.AXIS, fontSize: chartFontXs.value },
    axisLine: { lineStyle: { color: chartColors.value.SPLIT } },
    axisTick: { show: false }
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: chartColors.value.AXIS, fontSize: chartFontXs.value, formatter: (v: number) => formatTokens(v) },
    axisLine: { lineStyle: { color: chartColors.value.SPLIT } },
    splitLine: { lineStyle: { color: chartColors.value.SPLIT, type: 'dashed' } }
  },
  series: [
    {
      type: 'bar',
      barMaxWidth: 48,
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      data: agentTotals.value.map((a, i) => ({
        value: a.total,
        itemStyle: { color: chartColors.value.PALETTE[i % chartColors.value.PALETTE.length] }
      }))
    }
  ]
}))

async function refresh(): Promise<void> {
  try {
    await tokenStore.load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err))
  }
}

async function toggleTodayAndReload(): Promise<void> {
  tokenStore.toggleToday()
  await refresh()
}

onMounted(() => {
  if (!tokenStore.stats) refresh()
})
</script>

<template>
  <div class="dashboard">
    <header class="dash-head">
      <div class="dash-title">
        <h1>{{ t('tokens.dashboardTitle') }}</h1>
        <p>{{ t('tokens.dashboardSubtitle') }}</p>
      </div>
      <div class="dash-actions">
        <button
          class="today-toggle"
          :class="{ active: tokenStore.todayOnly }"
          type="button"
          :disabled="tokenStore.loading"
          @click="toggleTodayAndReload"
        >
          {{ t('tokens.today') }}
        </button>
        <button class="refresh-btn" type="button" :disabled="tokenStore.loading" @click="refresh">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M13 3v4H9M3 13V9h4M12.2 6A4.8 4.8 0 0 0 4 4.8M3.8 10A4.8 4.8 0 0 0 12 11.2"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.45"
          />
        </svg>
        <span>{{ t('tokens.refresh') }}</span>
      </button>
      </div>
    </header>

    <div v-if="tokenStore.loading && !stats" class="state">{{ t('tokens.loading') }}</div>
    <div v-else-if="!hasUsage" class="state">{{ t('tokens.empty') }}</div>

    <div v-else class="dash-body">
      <!-- KPI cards -->
      <section class="kpi-grid">
        <div class="kpi-card accent">
          <span class="kpi-label">{{ t('tokens.total') }}</span>
          <span class="kpi-value">{{ formatTokens(stats?.totalTokens ?? 0) }}</span>
          <span class="kpi-sub">{{ (stats?.totalTokens ?? 0).toLocaleString() }}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">{{ t('tokens.messages') }}</span>
          <span class="kpi-value">{{ totals.responses.toLocaleString() }}</span>
          <span class="kpi-sub">{{ t('tokens.scope') }}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">{{ t('tokens.modelsTracked') }}</span>
          <span class="kpi-value">{{ models.length }}</span>
          <span class="kpi-sub">{{ t('tokens.agentsTracked', { count: agentTotals.length }) }}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">{{ t('tokens.cacheRead') }}</span>
          <span class="kpi-value">{{ formatTokens(totals.cacheRead) }}</span>
          <span class="kpi-sub">{{ t('tokens.output') }} {{ formatTokens(totals.output) }}</span>
        </div>
      </section>

      <!-- Chart row: two doughnuts -->
      <section class="chart-row">
        <div class="chart-card">
          <h2>{{ t('tokens.byModel') }}</h2>
          <EChart class="chart" :option="modelShareOption" />
        </div>
        <div class="chart-card">
          <h2>{{ t('tokens.composition') }}</h2>
          <EChart class="chart" :option="compositionOption" />
        </div>
        <div v-if="agentTotals.length > 1" class="chart-card">
          <h2>{{ t('tokens.byAgent') }}</h2>
          <EChart class="chart" :option="byAgentOption" />
        </div>
      </section>

      <!-- Stacked composition by model -->
      <section class="chart-card wide">
        <h2>{{ t('tokens.compositionByModel') }}</h2>
        <EChart class="chart tall" :option="byModelBarOption" />
      </section>

      <!-- Detail table -->
      <section class="table-card">
        <h2>{{ t('tokens.details') }}</h2>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th class="left">{{ t('tokens.model') }}</th>
                <th>{{ t('tokens.agent') }}</th>
                <th>{{ t('tokens.input') }}</th>
                <th>{{ t('tokens.output') }}</th>
                <th>{{ t('tokens.cacheWrite') }}</th>
                <th>{{ t('tokens.cacheRead') }}</th>
                <th>{{ t('tokens.messages') }}</th>
                <th>{{ t('tokens.total') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in models" :key="`${m.type}:${m.model}`">
                <td class="left" :title="m.model">{{ m.short }}</td>
                <td>{{ agentLabel(m.type) }}</td>
                <td>{{ m.inputTokens.toLocaleString() }}</td>
                <td>{{ m.outputTokens.toLocaleString() }}</td>
                <td>{{ m.cacheCreationTokens.toLocaleString() }}</td>
                <td>{{ m.cacheReadTokens.toLocaleString() }}</td>
                <td>{{ m.messageCount.toLocaleString() }}</td>
                <td class="strong">{{ m.totalTokens.toLocaleString() }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td class="left">{{ t('tokens.allModels') }}</td>
                <td></td>
                <td>{{ totals.input.toLocaleString() }}</td>
                <td>{{ totals.output.toLocaleString() }}</td>
                <td>{{ totals.cacheWrite.toLocaleString() }}</td>
                <td>{{ totals.cacheRead.toLocaleString() }}</td>
                <td>{{ totals.responses.toLocaleString() }}</td>
                <td class="strong">{{ (stats?.totalTokens ?? 0).toLocaleString() }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  overflow: hidden;
}
.dash-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--border);
}
.dash-title h1 {
  margin: 0;
  font-size: var(--app-font-size-lg);
  font-weight: 700;
  color: var(--text);
}
.dash-title p {
  margin: 3px 0 0;
  font-size: var(--app-font-size-sm);
  color: var(--text-dim);
}
.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 13px;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  background: var(--bg-panel);
  color: var(--text);
  font: inherit;
  font-size: var(--app-font-size-sm);
  cursor: pointer;
}
.refresh-btn:hover:not(:disabled) {
  border-color: var(--accent-hover);
  background: var(--bg-elevated);
}
.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.refresh-btn svg {
  width: 14px;
  height: 14px;
}
.dash-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.today-toggle {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 13px;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  background: var(--bg-panel);
  color: var(--text-dim);
  font: inherit;
  font-size: var(--app-font-size-sm);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.today-toggle:hover:not(:disabled) {
  border-color: var(--accent-hover);
  color: var(--accent);
}
.today-toggle.active {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}
.today-toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.state {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 40px;
  color: var(--text-dim);
  font-size: var(--app-font-size-base);
}
.dash-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 18px 22px 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 14px;
}
.kpi-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-panel);
}
.kpi-card.accent {
  border-color: var(--accent-active);
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.18), rgba(139, 92, 246, 0.04));
}
.kpi-label {
  font-size: var(--app-font-size-xs);
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.kpi-value {
  font-size: var(--app-font-size-xxl);
  font-weight: 700;
  line-height: 1.1;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.kpi-sub {
  font-size: var(--app-font-size-xs);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.chart-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 18px;
}
.chart-card,
.table-card {
  display: flex;
  flex-direction: column;
  padding: 14px 16px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-panel);
}
.chart-card h2,
.table-card h2 {
  margin: 0 0 10px;
  font-size: var(--app-font-size-sm);
  font-weight: 600;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.chart {
  width: 100%;
  height: 260px;
}
.chart.tall {
  height: 340px;
}
.chart-card.wide {
  width: 100%;
}
.table-scroll {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--app-font-size-sm);
  font-variant-numeric: tabular-nums;
}
th,
td {
  padding: 7px 10px;
  text-align: right;
  white-space: nowrap;
  border-bottom: 1px solid var(--border);
}
th {
  color: var(--text-dim);
  font-weight: 600;
  font-size: var(--app-font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
th.left,
td.left {
  text-align: left;
}
tbody td {
  color: var(--text-dim);
}
tbody td.left {
  color: var(--text);
  font-weight: 500;
}
td.strong {
  color: var(--text);
  font-weight: 600;
}
tbody tr:hover td {
  background: var(--list-hover);
}
tfoot td {
  border-top: 1px solid var(--border-strong);
  border-bottom: 0;
  color: var(--text);
  font-weight: 600;
}
</style>
