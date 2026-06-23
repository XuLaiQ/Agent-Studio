<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSettingsStore, type ThemeMode } from '../stores/settings'
import {
  locale,
  setLocale,
  t,
  LOCALE_OPTIONS,
  type Locale
} from '../i18n'
import type { AgentConfig } from '@shared/types'

const THEME_OPTIONS: { value: ThemeMode; labelKey: string }[] = [
  { value: 'dark', labelKey: 'settings.theme.dark' },
  { value: 'light', labelKey: 'settings.theme.light' }
]

const settings = useSettingsStore()

const editingAgentId = ref<string | null>(null)
const agentDraftName = ref('')
const agentDraftCommand = ref('')

const canSaveAgentConfig = computed(
  () => agentDraftName.value.trim().length > 0 && agentDraftCommand.value.trim().length > 0
)

function startAddAgentConfig(): void {
  editingAgentId.value = null
  agentDraftName.value = ''
  agentDraftCommand.value = ''
}

function startEditAgentConfig(config: AgentConfig): void {
  editingAgentId.value = config.id
  agentDraftName.value = config.name
  agentDraftCommand.value = config.command
}

function saveAgentConfig(): void {
  if (!canSaveAgentConfig.value) return
  settings.upsertAgentConfig({
    id: editingAgentId.value ?? undefined,
    name: agentDraftName.value,
    command: agentDraftCommand.value
  })
  startAddAgentConfig()
}

function removeAgentConfig(config: AgentConfig): void {
  settings.removeAgentConfig(config.id)
  if (editingAgentId.value === config.id) startAddAgentConfig()
}

function onThemeChange(v: ThemeMode): void {
  settings.setTheme(v)
}

function onLocaleChange(v: Locale): void {
  setLocale(v)
}

function onFontSizeChange(v: number | undefined): void {
  settings.setFontSizePx(v)
}
</script>

<template>
  <div class="settings-dashboard">
    <header class="dash-head">
      <div class="dash-title">
        <h1>{{ t('settings.title') }}</h1>
        <p>{{ t('settings.pageSubtitle') }}</p>
      </div>
    </header>

    <div class="dash-body">
      <!-- Appearance section -->
      <section class="settings-card">
        <h2>{{ t('settings.appearance') }}</h2>
        <div class="settings-grid">
          <div class="setting-row">
            <label for="theme-select">{{ t('settings.theme') }}</label>
            <el-select
              id="theme-select"
              :model-value="settings.theme"
              size="small"
              class="settings-select"
              @update:model-value="(v: ThemeMode) => onThemeChange(v)"
            >
              <el-option
                v-for="opt in THEME_OPTIONS"
                :key="opt.value"
                :value="opt.value"
                :label="t(opt.labelKey)"
              />
            </el-select>
          </div>
          <div class="setting-row">
            <label for="lang-select">{{ t('lang.label') }}</label>
            <el-select
              id="lang-select"
              :model-value="locale"
              size="small"
              class="settings-select"
              @update:model-value="(v: Locale) => onLocaleChange(v)"
            >
              <el-option
                v-for="opt in LOCALE_OPTIONS"
                :key="opt.value"
                :value="opt.value"
                :label="opt.label"
              />
            </el-select>
          </div>
          <div class="setting-row">
            <label for="font-size-px">{{ t('settings.fontSize') }}</label>
            <div class="font-size-control">
              <el-input-number
                id="font-size-px"
                :model-value="settings.fontSizePx"
                :min="settings.minFontSize"
                :max="settings.maxFontSize"
                :step="1"
                :controls="true"
                size="small"
                class="settings-number"
                controls-position="right"
                @update:model-value="onFontSizeChange"
              />
              <span class="font-size-preview" :style="{ fontSize: `${settings.fontSizePx}px` }">
                Aa
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Agent configs section -->
      <section class="settings-card">
        <div class="settings-section-head">
          <h2>{{ t('settings.agents') }}</h2>
          <button class="settings-link" type="button" @click="startAddAgentConfig">
            + {{ t('settings.agent.add') }}
          </button>
        </div>

        <div class="agent-config-list">
          <div
            v-for="config in settings.agentConfigs"
            :key="config.id"
            class="agent-config-item"
            :class="{ active: editingAgentId === config.id }"
          >
            <input
              type="checkbox"
              :checked="config.enabled"
              :disabled="settings.enabledAgentConfigs.length === 1 && config.enabled"
              :title="t('settings.agent.enabled')"
              @change="
                settings.setAgentTypeEnabled(
                  config.id,
                  ($event.target as HTMLInputElement).checked
                )
              "
            />
            <button class="agent-config-main" type="button" @click="startEditAgentConfig(config)">
              <span class="agent-setting-name">{{ config.name }}</span>
              <code>{{ config.command }}</code>
            </button>
            <button
              class="agent-config-delete"
              type="button"
              :disabled="config.builtin"
              :title="config.builtin ? t('settings.agent.builtin') : t('settings.agent.delete')"
              @click="removeAgentConfig(config)"
            >
              ×
            </button>
          </div>
        </div>

        <div class="agent-config-form">
          <input
            v-model="agentDraftName"
            class="settings-text"
            :placeholder="t('settings.agent.name')"
          />
          <input
            v-model="agentDraftCommand"
            class="settings-text"
            :placeholder="t('settings.agent.command')"
          />
          <div class="agent-config-actions">
            <button class="settings-link" type="button" @click="startAddAgentConfig">
              {{ t('common.cancel') }}
            </button>
            <button
              class="settings-primary"
              type="button"
              :disabled="!canSaveAgentConfig"
              @click="saveAgentConfig"
            >
              {{ editingAgentId ? t('common.save') : t('dialog.create') }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-dashboard {
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

.dash-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 18px 22px 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 640px;
}

.settings-card {
  display: flex;
  flex-direction: column;
  padding: 18px 20px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-panel);
}

.settings-card h2 {
  margin: 0 0 14px;
  font-size: var(--app-font-size-sm);
  font-weight: 600;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--text-dim);
}

.settings-grid {
  display: grid;
  gap: 14px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.setting-row label {
  color: var(--text);
  font-size: var(--app-font-size-sm);
  flex: 0 0 auto;
}

.settings-select {
  width: 160px;
}

.settings-number {
  width: 120px;
}

.font-size-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.font-size-preview {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-weight: 600;
  line-height: 1;
}

.settings-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.settings-section-head h2 {
  margin: 0;
}

.settings-link,
.settings-primary,
.agent-config-delete {
  border: 0;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-size: var(--app-font-size-xs);
  cursor: pointer;
}

.settings-link {
  color: var(--accent);
}

.settings-link:hover,
.agent-config-delete:hover {
  color: var(--text);
}

.settings-primary {
  min-width: 54px;
  height: 28px;
  padding: 0 14px;
  border-radius: 4px;
  background: var(--accent);
  color: #fff;
  font-size: var(--app-font-size-sm);
}

.settings-primary:disabled,
.agent-config-delete:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.agent-config-list {
  display: grid;
  gap: 4px;
  margin-bottom: 12px;
}

.agent-config-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--text);
}

.agent-config-item:hover,
.agent-config-item.active {
  border-color: var(--border);
  background: var(--list-hover);
}

.agent-config-item input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--accent);
}

.agent-config-main {
  min-width: 0;
  display: grid;
  flex: 1;
  gap: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.agent-setting-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--app-font-size-sm);
}

.agent-config-main code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-dim);
  font-size: var(--app-font-size-xs);
}

.agent-config-delete {
  width: 22px;
  height: 22px;
  display: inline-grid;
  place-items: center;
  padding: 0;
  font-size: var(--app-font-size-md);
  border-radius: 4px;
}

.agent-config-delete:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.agent-config-form {
  display: grid;
  gap: 8px;
  padding-top: 4px;
}

.settings-text {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: var(--app-font-size-sm);
}

.settings-text:focus {
  border-color: var(--accent);
  outline: none;
}

.agent-config-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
</style>
