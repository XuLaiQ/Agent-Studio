<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useVersionControlStore } from '../stores/versionControl'
import { t } from '../i18n'
import type { VersionBranch, VersionFileChange, VersionProvider } from '@shared/types'

const versionStore = useVersionControlStore()
const commitMessage = ref('')
const newBranchName = ref('')

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
const hasRemote = computed(() => Boolean(activeStatus.value?.remotes.length))

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

function currentProjectId(): string | null {
  return activeStatus.value?.projectId ?? null
}

async function withProject(action: (projectId: string) => Promise<void>): Promise<void> {
  const projectId = currentProjectId()
  if (!projectId) return

  try {
    await action(projectId)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err))
  }
}

async function refresh(): Promise<void> {
  try {
    await versionStore.scan()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err))
  }
}

async function addConnection(): Promise<void> {
  const name = form.name.trim()
  const url = form.url.trim()
  if (!name || !url) {
    ElMessage.warning(t('version.add.required'))
    return
  }

  await versionStore.addConnection({ name, provider: form.provider, url })
  form.name = ''
  form.provider = 'github'
  form.url = ''
  ElMessage.success(t('version.add.done'))
}

async function stageFile(change: VersionFileChange): Promise<void> {
  await withProject((projectId) => versionStore.stageFile(projectId, change.path))
}

async function unstageFile(change: VersionFileChange): Promise<void> {
  await withProject((projectId) => versionStore.unstageFile(projectId, change.path))
}

async function stageAll(): Promise<void> {
  await withProject((projectId) => versionStore.stageAll(projectId))
}

async function unstageAll(): Promise<void> {
  await withProject((projectId) => versionStore.unstageAll(projectId))
}

async function commitChanges(): Promise<void> {
  const message = commitMessage.value.trim()
  if (!message) {
    ElMessage.warning(t('version.commit.required'))
    return
  }

  await withProject(async (projectId) => {
    await versionStore.commit(projectId, message)
    commitMessage.value = ''
    ElMessage.success(t('version.commit.done'))
  })
}

async function fetchProject(): Promise<void> {
  await withProject((projectId) => versionStore.fetch(projectId))
}

async function pullProject(): Promise<void> {
  await withProject((projectId) => versionStore.pull(projectId))
}

async function pushProject(): Promise<void> {
  await withProject((projectId) => versionStore.push(projectId))
}

async function checkout(branch: VersionBranch): Promise<void> {
  if (branch.current) return
  await withProject((projectId) => versionStore.checkoutBranch(projectId, branch.name))
}

async function createBranch(): Promise<void> {
  const branch = newBranchName.value.trim()
  if (!branch) {
    ElMessage.warning(t('version.branch.required'))
    return
  }

  await withProject(async (projectId) => {
    await versionStore.createBranch(projectId, branch, true)
    newBranchName.value = ''
    ElMessage.success(t('version.branch.created'))
  })
}

onMounted(() => {
  if (!versionStore.scanResult) refresh()
})
</script>

<template>
  <section class="version-panel">
    <svg class="icon-sprite" aria-hidden="true">
      <symbol id="vc-graph" viewBox="0 0 16 16">
        <circle cx="4" cy="3" r="2" />
        <circle cx="4" cy="13" r="2" />
        <circle cx="12" cy="8" r="2" />
        <path d="M4 5v6M5.5 4.2c4.2.8 6.5 1.8 6.5 3.8M10.3 9.2C7.5 10.1 5.8 11.2 4.8 13" />
      </symbol>
      <symbol id="vc-refresh" viewBox="0 0 16 16">
        <path d="M13 3v4H9M3 13V9h4M12.2 6A4.8 4.8 0 0 0 4 4.8M3.8 10A4.8 4.8 0 0 0 12 11.2" />
      </symbol>
      <symbol id="vc-fetch" viewBox="0 0 16 16">
        <path d="M8 2v9M4.5 7.5 8 11l3.5-3.5M3 14h10" />
      </symbol>
      <symbol id="vc-pull" viewBox="0 0 16 16">
        <path d="M8 2v10M4.5 8.5 8 12l3.5-3.5M4 3h8" />
      </symbol>
      <symbol id="vc-push" viewBox="0 0 16 16">
        <path d="M8 14V4M4.5 7.5 8 4l3.5 3.5M4 13h8" />
      </symbol>
      <symbol id="vc-plus" viewBox="0 0 16 16">
        <path d="M8 3v10M3 8h10" />
      </symbol>
      <symbol id="vc-minus" viewBox="0 0 16 16">
        <path d="M3 8h10" />
      </symbol>
      <symbol id="vc-check" viewBox="0 0 16 16">
        <path d="m3 8 3 3 7-7" />
      </symbol>
      <symbol id="vc-branch" viewBox="0 0 16 16">
        <circle cx="4" cy="4" r="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="M4 6v2a4 4 0 0 0 4 4h2" />
      </symbol>
      <symbol id="vc-history" viewBox="0 0 16 16">
        <path d="M3 3v4h4" />
        <path d="M3.6 7A5 5 0 1 0 5 3.6" />
        <path d="M8 5.5V8l2 1.3" />
      </symbol>
    </svg>

    <div class="section-head">
      <button class="section-title" type="button" :title="t('version.title')">
        <svg><use href="#vc-graph" /></svg>
        <span>{{ t('version.graph') }}</span>
      </button>
      <div class="toolbar">
        <button class="icon-action" type="button" :title="t('version.fetch')" :disabled="!hasRemote" @click="fetchProject">
          <svg><use href="#vc-fetch" /></svg>
        </button>
        <button class="icon-action" type="button" :title="t('version.pull')" :disabled="!hasRemote" @click="pullProject">
          <svg><use href="#vc-pull" /></svg>
        </button>
        <button class="icon-action" type="button" :title="t('version.push')" :disabled="!hasRemote" @click="pushProject">
          <svg><use href="#vc-push" /></svg>
        </button>
        <button class="icon-action" type="button" :title="t('version.scan')" @click="refresh">
          <svg><use href="#vc-refresh" /></svg>
        </button>
      </div>
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
        <strong>{{ activeStatus.branch || t('version.noBranch') }}</strong>
        <span v-if="activeStatus.upstream">{{ activeStatus.upstream }}</span>
      </div>
      <div class="commit-box">
        <textarea
          v-model="commitMessage"
          class="commit-input"
          rows="3"
          :placeholder="t('version.commit.placeholder')"
        />
        <button class="commit-btn" type="button" :disabled="!canCommit" @click="commitChanges">
          <svg><use href="#vc-check" /></svg>
          <span>{{ t('version.commit') }}</span>
        </button>
      </div>

      <div class="group">
        <div class="group-head">
          <span>{{ t('version.staged') }} 路 {{ versionStore.stagedChanges.length }}</span>
          <button
            v-if="versionStore.stagedChanges.length"
            class="icon-action"
            type="button"
            :title="t('version.unstageAll')"
            @click="unstageAll"
          >
            <svg><use href="#vc-minus" /></svg>
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
          <span>{{ t('version.changes') }} 路 {{ versionStore.unstagedChanges.length }}</span>
          <button
            v-if="versionStore.unstagedChanges.length"
            class="icon-action"
            type="button"
            :title="t('version.stageAll')"
            @click="stageAll"
          >
            <svg><use href="#vc-plus" /></svg>
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

      <details class="details" open>
        <summary>{{ t('version.localBranches') }} 路 {{ activeStatus.localBranches.length }}</summary>
        <button
          v-for="branch in activeStatus.localBranches"
          :key="branch.name"
          class="branch-row"
          type="button"
          :class="{ current: branch.current }"
          @click="checkout(branch)"
        >
          <svg><use href="#vc-branch" /></svg>
          <span>{{ branch.name }}</span>
          <small v-if="branch.upstream">{{ branch.upstream }}</small>
        </button>
        <div class="branch-create">
          <input v-model="newBranchName" :placeholder="t('version.branch.placeholder')" @keyup.enter="createBranch" />
          <button class="icon-action" type="button" :title="t('version.branch.create')" @click="createBranch">
            <svg><use href="#vc-plus" /></svg>
          </button>
        </div>
      </details>

      <details class="details">
        <summary>{{ t('version.remoteBranches') }} 路 {{ activeStatus.remoteBranches.length }}</summary>
        <button
          v-for="branch in activeStatus.remoteBranches"
          :key="branch.name"
          class="branch-row"
          type="button"
          @click="checkout(branch)"
        >
          <svg><use href="#vc-branch" /></svg>
          <span>{{ branch.name }}</span>
        </button>
      </details>

      <details class="details" open>
        <summary>{{ t('version.commitHistory') }} 路 {{ activeStatus.commitHistory.length }}</summary>
        <div v-if="!activeStatus.commitHistory.length" class="empty small">
          {{ t('version.noCommitHistory') }}
        </div>
        <div
          v-for="commit in activeStatus.commitHistory"
          :key="commit.hash"
          class="commit-row"
          :title="`${commit.hash} ${commit.subject}`"
        >
          <svg><use href="#vc-history" /></svg>
          <div class="commit-content">
            <div class="commit-subject">{{ commit.subject }}</div>
            <div class="commit-meta">
              <span>{{ commit.shortHash }}</span>
              <span>{{ commit.author }}</span>
              <span>{{ commit.relativeDate }}</span>
            </div>
          </div>
        </div>
      </details>
    </template>

    <details class="details">
      <summary>{{ t('version.manualConnections') }} 路 {{ versionStore.connections.length }}</summary>
      <div v-for="connection in versionStore.connections" :key="connection.id" class="connection-row">
        <div>
          <div class="connection-name">{{ connection.name }}</div>
          <div class="connection-url">
            {{ versionStore.providerLabel(connection.provider) }} 路 {{ connection.url }}
          </div>
        </div>
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
.icon-sprite {
  display: none;
}
.section-head,
.repo-header,
.group-head,
.connection-row,
.branch-row,
.toolbar,
.section-title,
.commit-btn {
  display: flex;
  align-items: center;
}
.section-head {
  justify-content: space-between;
  padding: 4px 2px 8px;
}
.section-title {
  min-width: 0;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.section-title svg,
.icon-action svg,
.commit-btn svg,
.branch-row svg,
.commit-row svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.45;
}
.toolbar {
  gap: 3px;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.icon-action:hover,
.branch-row:hover {
  color: var(--accent);
}
.icon-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.repo-header {
  justify-content: space-between;
  gap: 8px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: rgba(42, 42, 60, 0.5);
}
.repo-header strong,
.repo-header span,
.file-path,
.connection-name,
.connection-url,
.branch-row span,
.branch-row small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.repo-header span,
.empty,
.connection-url,
.branch-row small {
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
.commit-box {
  padding-top: 8px;
}
.commit-input {
  width: 100%;
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
  justify-content: center;
  gap: 6px;
  height: 28px;
  margin-top: 6px;
}
.commit-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.details,
.group {
  margin-top: 10px;
}
.details summary,
.group-head {
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.35px;
  text-transform: uppercase;
}
.details summary {
  cursor: pointer;
}
.group-head {
  justify-content: space-between;
  height: 26px;
}
.branch-row,
.commit-row,
.change-row {
  width: 100%;
  min-width: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.branch-row {
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 6px;
  padding: 4px 5px;
}
.branch-row.current {
  background: rgba(137, 180, 250, 0.12);
  color: var(--accent);
}
.branch-row small {
  grid-column: 2;
}
.commit-row {
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 6px;
  padding: 5px;
}
.commit-row:hover {
  background: var(--bg-panel);
}
.commit-row svg {
  margin-top: 2px;
  color: var(--text-dim);
}
.commit-content {
  min-width: 0;
}
.commit-subject {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.commit-meta {
  display: flex;
  gap: 7px;
  min-width: 0;
  overflow: hidden;
  color: var(--text-dim);
  font-size: 11px;
  white-space: nowrap;
}
.branch-create,
.add-form {
  display: grid;
  gap: 5px;
}
.branch-create {
  grid-template-columns: 1fr 24px;
  margin-top: 6px;
}
.change-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  padding: 4px 6px;
}
.change-row:hover {
  background: var(--bg-panel);
}
.status-badge {
  flex: 0 0 18px;
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
.file-path {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  direction: ltr;
  text-align: left;
  unicode-bidi: plaintext;
}
.row-action {
  position: absolute;
  right: 6px;
  max-width: 76px;
  padding-left: 10px;
  background: linear-gradient(90deg, transparent, var(--bg-panel) 22%);
  color: var(--text-dim);
  font-size: 11px;
  opacity: 0;
}
.change-row:hover .row-action {
  opacity: 1;
}
.connection-row {
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
}
.add-form {
  grid-template-columns: 1fr 74px;
  margin-top: 6px;
}
.add-form input,
.add-form select,
.branch-create input {
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
