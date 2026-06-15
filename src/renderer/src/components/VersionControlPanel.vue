<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useVersionControlStore } from '../stores/versionControl'
import { t } from '../i18n'
import type { VersionFileChange, VersionProvider } from '@shared/types'

const versionStore = useVersionControlStore()
const commitMessage = ref('')

const form = reactive({
  name: '',
  provider: 'github' as VersionProvider,
  url: ''
})

const providerOptions: Array<{ value: VersionProvider; label: string }> = [
  { value: 'github', label: 'GitHub' },
  { value: 'gitlab', label: 'GitLab' },
  { value: 'git', label: 'Git' }
]

const activeStatus = computed(() => versionStore.activeProjectStatus)
const canCommit = computed(
  () => Boolean(activeStatus.value?.isRepository) && versionStore.stagedChanges.length > 0
)

function statusLabel(change: VersionFileChange): string {
  const code = change.staged ? change.indexStatus : change.workTreeStatus
  if (code === 'M') return 'M'
  if (code === 'A' || code === '?') return 'U'
  if (code === 'D') return 'D'
  if (code === 'R') return 'R'
  if (code === 'C') return 'C'
  return code.trim() || 'M'
}

function statusTitle(change: VersionFileChange): string {
  const label = statusLabel(change)
  if (label === 'M') return t('version.change.modified')
  if (label === 'U') return t('version.change.untracked')
  if (label === 'D') return t('version.change.deleted')
  if (label === 'R') return t('version.change.renamed')
  return t('version.change.changed')
}

function resetForm(): void {
  form.name = ''
  form.provider = 'github'
  form.url = ''
}

async function addConnection(): Promise<void> {
  const name = form.name.trim()
  const url = form.url.trim()
  if (!name || !url) {
    ElMessage.warning(t('version.add.required'))
    return
  }

  await versionStore.addConnection({ name, provider: form.provider, url })
  resetForm()
  ElMessage.success(t('version.add.done'))
}

async function stageFile(change: VersionFileChange): Promise<void> {
  if (!activeStatus.value) return
  await versionStore.stageFile(activeStatus.value.projectId, change.path)
}

async function unstageFile(change: VersionFileChange): Promise<void> {
  if (!activeStatus.value) return
  await versionStore.unstageFile(activeStatus.value.projectId, change.path)
}

async function stageAll(): Promise<void> {
  if (!activeStatus.value) return
  await versionStore.stageAll(activeStatus.value.projectId)
}

async function unstageAll(): Promise<void> {
  if (!activeStatus.value) return
  await versionStore.unstageAll(activeStatus.value.projectId)
}

async function commitChanges(): Promise<void> {
  if (!activeStatus.value) return

  const message = commitMessage.value.trim()
  if (!message) {
    ElMessage.warning(t('version.commit.required'))
    return
  }

  await versionStore.commit(activeStatus.value.projectId, message)
  commitMessage.value = ''
  ElMessage.success(t('version.commit.done'))
}

onMounted(() => {
  if (!versionStore.scanResult) versionStore.scan()
})
</script>

<template>
  <section class="version-panel">
    <div class="section-head">
      <span>{{ t('version.title') }}</span>
      <button class="icon-action" type="button" :title="t('version.scan')" @click="versionStore.scan">
        ↻
      </button>
    </div>

    <div v-if="!activeStatus" class="empty">{{ t('version.noActiveProject') }}</div>
    <template v-else-if="!activeStatus.isRepository">
      <div class="repo-header">
        <strong>{{ activeStatus.projectName }}</strong>
        <span>{{ t('version.notRepo') }}</span>
      </div>
      <div class="empty">{{ t('version.notRepoHint') }}</div>
    </template>

    <template v-else>
      <div class="repo-header">
        <strong>{{ activeStatus.projectName }}</strong>
        <span>{{ activeStatus.branch || t('version.noBranch') }}</span>
      </div>

      <textarea
        v-model="commitMessage"
        class="commit-input"
        rows="3"
        :placeholder="t('version.commit.placeholder')"
      />
      <button class="commit-btn" type="button" :disabled="!canCommit" @click="commitChanges">
        ✓ {{ t('version.commit') }}
      </button>

      <div class="group">
        <div class="group-head">
          <span>{{ t('version.staged') }} · {{ versionStore.stagedChanges.length }}</span>
          <button
            v-if="versionStore.stagedChanges.length"
            class="icon-action"
            type="button"
            :title="t('version.unstageAll')"
            @click="unstageAll"
          >
            -
          </button>
        </div>
        <div v-if="!versionStore.stagedChanges.length" class="empty small">
          {{ t('version.noStaged') }}
        </div>
        <button
          v-for="change in versionStore.stagedChanges"
          :key="`staged:${change.path}`"
          class="change-row"
          type="button"
          :title="change.path"
          @click="unstageFile(change)"
        >
          <span class="status-badge" :data-status="statusLabel(change)">{{ statusLabel(change) }}</span>
          <span class="file-path">{{ change.path }}</span>
          <span class="row-action">{{ t('version.unstage') }}</span>
        </button>
      </div>

      <div class="group">
        <div class="group-head">
          <span>{{ t('version.changes') }} · {{ versionStore.unstagedChanges.length }}</span>
          <button
            v-if="versionStore.unstagedChanges.length"
            class="icon-action"
            type="button"
            :title="t('version.stageAll')"
            @click="stageAll"
          >
            +
          </button>
        </div>
        <div v-if="!versionStore.unstagedChanges.length" class="empty small">
          {{ t('version.noChanges') }}
        </div>
        <button
          v-for="change in versionStore.unstagedChanges"
          :key="`change:${change.path}`"
          class="change-row"
          type="button"
          :title="`${statusTitle(change)}: ${change.path}`"
          @click="stageFile(change)"
        >
          <span class="status-badge" :data-status="statusLabel(change)">{{ statusLabel(change) }}</span>
          <span class="file-path">{{ change.path }}</span>
          <span class="row-action">{{ t('version.stage') }}</span>
        </button>
      </div>
    </template>

    <details class="details">
      <summary>{{ t('version.localTools') }}</summary>
      <div v-for="tool in versionStore.tools" :key="tool.tool" class="tool-row">
        <span class="status-dot" :class="{ online: tool.available }" />
        <span>{{ tool.tool }}</span>
        <span>{{ tool.available ? tool.version : t('version.notFound') }}</span>
      </div>
    </details>

    <details class="details">
      <summary>{{ t('version.manualConnections') }} · {{ versionStore.connections.length }}</summary>
      <div v-for="connection in versionStore.connections" :key="connection.id" class="connection-row">
        <div>
          <div class="connection-name">{{ connection.name }}</div>
          <div class="connection-url">
            {{ versionStore.providerLabel(connection.provider) }} · {{ connection.url }}
          </div>
        </div>
        <button class="icon-action danger" type="button" @click="versionStore.removeConnection(connection.id)">
          ×
        </button>
      </div>

      <div class="add-form">
        <input v-model="form.name" :placeholder="t('version.namePlaceholder')" />
        <select v-model="form.provider">
          <option v-for="option in providerOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <input v-model="form.url" :placeholder="t('version.urlPlaceholder')" />
        <button type="button" @click="addConnection">{{ t('version.add') }}</button>
      </div>
    </details>
  </section>
</template>

<style scoped>
.version-panel {
  padding: 8px;
}
.section-head,
.repo-header,
.group-head,
.connection-row,
.tool-row {
  display: flex;
  align-items: center;
}
.section-head,
.group-head {
  justify-content: space-between;
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.section-head {
  padding: 4px 4px 8px;
}
.icon-action,
.commit-btn,
.add-form button {
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-panel);
  color: var(--text);
  cursor: pointer;
}
.icon-action {
  width: 24px;
  height: 24px;
  padding: 0;
}
.icon-action:hover {
  color: var(--accent);
}
.icon-action.danger:hover {
  color: #f38ba8;
}
.repo-header {
  justify-content: space-between;
  gap: 8px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: rgba(42, 42, 60, 0.5);
}
.repo-header strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.repo-header span,
.empty,
.connection-url,
.tool-row span:last-child {
  color: var(--text-dim);
  font-size: 11px;
}
.empty {
  padding: 9px 6px;
  line-height: 1.4;
}
.empty.small {
  padding: 6px;
}
.commit-input {
  width: 100%;
  margin-top: 8px;
  resize: vertical;
  min-height: 54px;
  max-height: 120px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  padding: 7px;
}
.commit-btn {
  width: 100%;
  height: 28px;
  margin-top: 6px;
}
.commit-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.group {
  margin-top: 10px;
}
.group-head {
  height: 26px;
}
.change-row {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 20px 1fr auto;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  padding: 4px 5px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.change-row:hover {
  background: var(--bg-panel);
}
.status-badge {
  width: 18px;
  color: #f9e2af;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}
.status-badge[data-status='U'] {
  color: #a6e3a1;
}
.status-badge[data-status='D'] {
  color: #f38ba8;
}
.status-badge[data-status='R'] {
  color: #cba6f7;
}
.file-path,
.connection-name,
.connection-url,
.tool-row span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-action {
  color: var(--text-dim);
  font-size: 11px;
  opacity: 0;
}
.change-row:hover .row-action {
  opacity: 1;
}
.details {
  margin-top: 10px;
}
.details summary {
  cursor: pointer;
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}
.tool-row {
  display: grid;
  grid-template-columns: 10px 34px 1fr;
  gap: 6px;
  padding: 5px 2px;
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f38ba8;
}
.status-dot.online {
  background: #a6e3a1;
}
.connection-row {
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
}
.add-form {
  display: grid;
  grid-template-columns: 1fr 74px;
  gap: 5px;
  margin-top: 6px;
}
.add-form input,
.add-form select {
  min-width: 0;
  height: 26px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  padding: 0 7px;
}
.add-form input:first-child,
.add-form input:nth-child(3) {
  grid-column: 1 / -1;
}
</style>
