<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useVersionControlStore } from '../stores/versionControl'
import { t } from '../i18n'
import type {
  VersionBranch,
  VersionCommitFile,
  VersionCommitLog,
  VersionFileChange,
  VersionProvider
} from '@shared/types'

const emit = defineEmits<{
  (event: 'open-diff', payload: { change: VersionFileChange; staged: boolean }): void
}>()

const props = defineProps<{
  viewMode?: 'full' | 'history'
}>()

const viewMode = computed(() => props.viewMode || 'full')

const versionStore = useVersionControlStore()
const commitMessage = ref('')
const newBranchName = ref('')

type ToolbarAction = 'fetch' | 'pull' | 'push' | 'refresh'

// Lazily-loaded files per commit, keyed by full hash, plus expand/loading state.
const commitFilesCache = reactive<Record<string, VersionCommitFile[]>>({})
const expandedCommits = ref<Set<string>>(new Set())
const loadingCommit = ref<string | null>(null)
const activeToolbarAction = ref<ToolbarAction | null>(null)

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
const currentToolbarAction = computed<ToolbarAction | null>(
  () => activeToolbarAction.value ?? (versionStore.loading ? 'refresh' : null)
)
const isToolbarBusy = computed(
  () => Boolean(currentToolbarAction.value) || versionStore.operationLoading
)

function branchHue(name: string): number {
  let hash = 0
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360
  }
  return hash
}

function branchBadgeStyle(name: string): Record<string, string> {
  const hue = branchHue(name)
  return {
    backgroundColor: `hsla(${hue}, 68%, 48%, 0.18)`,
    borderColor: `hsla(${hue}, 72%, 58%, 0.38)`,
    color: `hsl(${hue}, 82%, 74%)`
  }
}

function commitMarkerStyle(commit: VersionCommitLog): Record<string, string> {
  const branch = commit.branches[0] ?? commit.pushedBranches[0]
  if (!branch) {
    return {
      '--commit-marker-fill': 'var(--info)',
      '--commit-marker-glow': 'rgba(59, 130, 246, 0.18)'
    }
  }

  const hue = branchHue(branch)
  return {
    '--commit-marker-fill': `hsl(${hue}, 82%, 74%)`,
    '--commit-marker-glow': `hsla(${hue}, 68%, 48%, 0.18)`
  }
}

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

function commitFileLabel(file: VersionCommitFile): string {
  const code = (file.status || 'M').charAt(0).toUpperCase()
  if (code === 'A') return 'U'
  if (code === 'D') return 'D'
  if (code === 'R') return 'R'
  if (code === 'C') return 'C'
  return 'M'
}

function isCommitExpanded(hash: string): boolean {
  return expandedCommits.value.has(hash)
}

async function toggleCommit(commit: VersionCommitLog): Promise<void> {
  const next = new Set(expandedCommits.value)
  if (next.has(commit.hash)) {
    next.delete(commit.hash)
    expandedCommits.value = next
    return
  }

  next.add(commit.hash)
  expandedCommits.value = next

  if (commitFilesCache[commit.hash]) return

  const projectId = currentProjectId()
  if (!projectId) return

  loadingCommit.value = commit.hash
  try {
    commitFilesCache[commit.hash] = await versionStore.loadCommitFiles(projectId, commit.hash)
  } catch (err) {
    const revert = new Set(expandedCommits.value)
    revert.delete(commit.hash)
    expandedCommits.value = revert
    ElMessage.error(err instanceof Error ? err.message : String(err))
  } finally {
    loadingCommit.value = null
  }
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

function isToolbarActionLoading(action: ToolbarAction): boolean {
  return currentToolbarAction.value === action
}

async function runToolbarAction(action: ToolbarAction, task: () => Promise<void>): Promise<void> {
  if (isToolbarBusy.value) return

  activeToolbarAction.value = action
  try {
    await task()
  } finally {
    activeToolbarAction.value = null
  }
}

async function refresh(): Promise<void> {
  await runToolbarAction('refresh', async () => {
    try {
      await versionStore.scan()
    } catch (err) {
      ElMessage.error(err instanceof Error ? err.message : String(err))
    }
  })
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

function openDiff(change: VersionFileChange, staged: boolean): void {
  emit('open-diff', { change, staged })
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
  await runToolbarAction('fetch', () => withProject((projectId) => versionStore.fetch(projectId)))
}

async function pullProject(): Promise<void> {
  await runToolbarAction('pull', () => withProject((projectId) => versionStore.pull(projectId)))
}

async function pushProject(): Promise<void> {
  await runToolbarAction('push', () => withProject((projectId) => versionStore.push(projectId)))
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
  <section class="version-panel" :class="{ 'split-view': true }">
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
      <symbol id="vc-caret" viewBox="0 0 16 16">
        <path d="m6 4 4 4-4 4" />
      </symbol>
    </svg>

    <div class="section-head">
      <button class="section-title" type="button" :title="t('version.title')">
        <svg><use href="#vc-graph" /></svg>
        <span>{{ t('version.graph') }}</span>
      </button>
      <div class="toolbar">
        <button
          class="icon-action"
          type="button"
          data-action="fetch"
          :class="{ 'is-loading': isToolbarActionLoading('fetch') }"
          :title="t('version.fetch')"
          :disabled="!hasRemote || isToolbarBusy"
          :aria-busy="isToolbarActionLoading('fetch')"
          @click="fetchProject"
        >
          <svg><use href="#vc-fetch" /></svg>
        </button>
        <button
          class="icon-action"
          type="button"
          data-action="pull"
          :class="{ 'is-loading': isToolbarActionLoading('pull') }"
          :title="t('version.pull')"
          :disabled="!hasRemote || isToolbarBusy"
          :aria-busy="isToolbarActionLoading('pull')"
          @click="pullProject"
        >
          <svg><use href="#vc-pull" /></svg>
        </button>
        <button
          class="icon-action"
          type="button"
          data-action="push"
          :class="{ 'is-loading': isToolbarActionLoading('push') }"
          :title="t('version.push')"
          :disabled="!hasRemote || isToolbarBusy"
          :aria-busy="isToolbarActionLoading('push')"
          @click="pushProject"
        >
          <svg><use href="#vc-push" /></svg>
        </button>
        <button
          class="icon-action"
          type="button"
          data-action="refresh"
          :class="{ 'is-loading': isToolbarActionLoading('refresh') }"
          :title="t('version.scan')"
          :disabled="isToolbarBusy"
          :aria-busy="isToolbarActionLoading('refresh')"
          @click="refresh"
        >
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

      <details class="group" open>
        <summary class="group-head">
          <span>{{ t('version.staged') }} {{ versionStore.stagedChanges.length }}</span>
          <button
            v-if="versionStore.stagedChanges.length"
            class="icon-action"
            type="button"
            :title="t('version.unstageAll')"
            @click.stop="unstageAll"
          >
            <svg><use href="#vc-minus" /></svg>
          </button>
        </summary>
        <div v-if="!versionStore.stagedChanges.length" class="empty small">
          {{ t('version.noStaged') }}
        </div>
        <div
          v-for="change in versionStore.stagedChanges"
          :key="`staged:${change.path}`"
          class="change-row"
          role="button"
          tabindex="0"
          :title="`${statusTitle(change)}: ${change.path}`"
          @click="openDiff(change, true)"
          @keyup.enter="openDiff(change, true)"
        >
          <span class="status-badge" :data-status="statusLabel(change)">{{ statusLabel(change) }}</span>
          <span class="file-path">{{ change.path }}</span>
          <button
            class="row-action-btn"
            type="button"
            :title="t('version.unstage')"
            @click.stop="unstageFile(change)"
          >
            <svg><use href="#vc-minus" /></svg>
          </button>
        </div>
      </details>

      <details class="group" open>
        <summary class="group-head">
          <span>{{ t('version.changes') }} {{ versionStore.unstagedChanges.length }}</span>
          <button
            v-if="versionStore.unstagedChanges.length"
            class="icon-action"
            type="button"
            :title="t('version.stageAll')"
            @click.stop="stageAll"
          >
            <svg><use href="#vc-plus" /></svg>
          </button>
        </summary>
        <div v-if="!versionStore.unstagedChanges.length" class="empty small">
          {{ t('version.noChanges') }}
        </div>
        <div
          v-for="change in versionStore.unstagedChanges"
          :key="`change:${change.path}`"
          class="change-row"
          role="button"
          tabindex="0"
          :title="`${statusTitle(change)}: ${change.path}`"
          @click="openDiff(change, false)"
          @keyup.enter="openDiff(change, false)"
        >
          <span class="status-badge" :data-status="statusLabel(change)">{{ statusLabel(change) }}</span>
          <span class="file-path">{{ change.path }}</span>
          <button
            class="row-action-btn"
            type="button"
            :title="t('version.stage')"
            @click.stop="stageFile(change)"
          >
            <svg><use href="#vc-plus" /></svg>
          </button>
        </div>
      </details>

      <details class="details" open>
        <summary>{{ t('version.localBranches') }} {{ activeStatus.localBranches.length }}</summary>
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
        <summary>{{ t('version.remoteBranches') }} {{ activeStatus.remoteBranches.length }}</summary>
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

      <div class="history-divider"></div>

      <div class="history-container">
        <details class="details history-section" open>
          <summary>{{ t('version.commitHistory') }} {{ activeStatus.commitHistory.length }}</summary>
          <div v-if="!activeStatus.commitHistory.length" class="empty small">
            {{ t('version.noCommitHistory') }}
          </div>
          <div v-for="commit in activeStatus.commitHistory" :key="commit.hash" class="commit-item">
          <div
            class="commit-row"
            role="button"
            tabindex="0"
            :aria-expanded="isCommitExpanded(commit.hash)"
            :title="`${commit.hash} ${commit.subject}`"
            @click="toggleCommit(commit)"
            @keyup.enter="toggleCommit(commit)"
          >
            <span
              class="commit-marker"
              :class="{ pushed: commit.pushed }"
              :style="commitMarkerStyle(commit)"
              aria-hidden="true"
            />
            <div class="commit-content">
              <div class="commit-subject">{{ commit.subject }}</div>
              <div class="commit-meta">
                <span>{{ commit.shortHash }}</span>
                <span>{{ commit.author }}</span>
                <span>{{ commit.relativeDate }}</span>
              </div>
            </div>
            <div v-if="commit.branches.length" class="commit-branches" aria-label="Commit branches">
              <span
                v-for="branch in commit.branches"
                :key="branch"
                class="commit-branch"
                :style="branchBadgeStyle(branch)"
                :title="branch"
              >
                {{ branch }}
              </span>
            </div>
          </div>
          <div v-if="isCommitExpanded(commit.hash)" class="commit-files">
            <div v-if="loadingCommit === commit.hash" class="empty small">
              {{ t('version.commitFiles.loading') }}
            </div>
            <template v-else>
              <div v-if="!commitFilesCache[commit.hash]?.length" class="empty small">
                {{ t('version.commitFiles.empty') }}
              </div>
              <div
                v-for="file in commitFilesCache[commit.hash]"
                :key="file.path"
                class="commit-file-row"
                :title="`${file.status}: ${file.originalPath ? file.originalPath + ' -> ' : ''}${file.path}`"
              >
                <span class="status-badge" :data-status="commitFileLabel(file)">
                  {{ commitFileLabel(file) }}
                </span>
                <span class="file-path">{{ file.path }}</span>
              </div>
            </template>
          </div>
        </div>
        </details>
      </div>
    </template>

    <details class="details">
      <summary>{{ t('version.manualConnections') }} {{ versionStore.connections.length }}</summary>
      <div v-for="connection in versionStore.connections" :key="connection.id" class="connection-row">
        <div>
          <div class="connection-name">{{ connection.name }}</div>
          <div class="connection-url">
            {{ versionStore.providerLabel(connection.provider) }} {{ connection.url }}
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
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}
.version-panel.split-view {
  display: flex;
  flex-direction: column;
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
  position: relative;
  justify-content: space-between;
  min-height: 34px;
  padding: 0 8px 0 12px;
  overflow: hidden;
}
.section-head::after {
  content: '';
  position: absolute;
  right: 8px;
  bottom: 0;
  width: 86px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent-hover), transparent);
  opacity: 0;
  transform: translateX(-35%);
  pointer-events: none;
}
.section-head:has(.icon-action.is-loading)::after {
  opacity: 1;
  animation: vc-progress-line 1s ease-in-out infinite;
}
.section-title {
  min-width: 0;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-size: var(--app-font-size-xs);
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
  border-radius: 2px;
  background: var(--bg-panel);
  color: var(--text);
  cursor: pointer;
}
.icon-action {
  position: relative;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  overflow: hidden;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}
.icon-action:hover,
.branch-row:hover {
  color: var(--text);
  background: var(--list-hover);
}
.icon-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.icon-action.is-loading {
  border-color: color-mix(in srgb, var(--accent-hover) 72%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-panel));
  color: var(--accent-hover);
  opacity: 1;
}
.icon-action.is-loading::before {
  content: '';
  position: absolute;
  inset: 3px;
  border: 1.5px solid color-mix(in srgb, var(--accent-hover) 28%, transparent);
  border-top-color: var(--accent-hover);
  border-radius: 50%;
  animation: vc-spin 0.72s linear infinite;
}
.icon-action.is-loading svg {
  position: relative;
  z-index: 1;
}
.icon-action.is-loading[data-action='fetch'] svg,
.icon-action.is-loading[data-action='pull'] svg {
  animation: vc-flow-down 0.86s ease-in-out infinite;
}
.icon-action.is-loading[data-action='push'] svg {
  animation: vc-flow-up 0.86s ease-in-out infinite;
}
.icon-action.is-loading[data-action='refresh'] svg {
  animation: vc-refresh-spin 0.82s linear infinite;
}
.repo-header {
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  border: 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: var(--bg);
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
  font-size: var(--app-font-size-xs);
}
.empty {
  padding: 9px 12px;
  line-height: 1.4;
}
.empty.small {
  padding: 6px 12px;
}
.commit-box {
  padding: 8px 12px 0;
}
.commit-input {
  width: 100%;
  resize: vertical;
  min-height: 54px;
  max-height: 120px;
  border: 1px solid var(--border);
  border-radius: 2px;
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
  margin-top: 8px;
}
.details summary,
.group summary,
.group-head {
  position: relative;
  color: var(--text-dim);
  font-size: var(--app-font-size-xs);
  font-weight: 600;
  letter-spacing: 0.35px;
  text-transform: uppercase;
  cursor: pointer;
  user-select: none;
}
.details summary,
.group summary {
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 12px;
  list-style: none;
}
.details summary::-webkit-details-marker,
.group summary::-webkit-details-marker {
  display: none;
}
.details summary::before,
.group summary::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 50%;
  transform: translateY(-50%) rotate(90deg);
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--text-dim);
  transition: transform 0.2s ease;
}
.details[open] summary::before,
.group[open] summary::before {
  transform: translateY(-50%) rotate(180deg);
}
.group-head,
.group summary > span:first-child,
.details summary > span:first-child {
  flex: 1;
  text-align: left;
  padding-left: 10px;
}
.group-head {
  justify-content: space-between;
  height: 26px;
  padding: 0 8px 0 12px;
}
.group summary .icon-action,
.details summary .icon-action {
  flex-shrink: 0;
}
.branch-row,
.commit-row,
.change-row {
  width: 100%;
  min-width: 0;
  border: 0;
  border-radius: 0;
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
  padding: 4px 12px;
}
.branch-row.current {
  background: var(--list-focus);
  color: var(--text);
}
.branch-row small {
  grid-column: 2;
}
.commit-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 6px;
  align-items: start;
  padding: 5px 12px;
}
.commit-row:hover {
  background: var(--list-hover);
}
.commit-marker {
  width: 10px;
  height: 10px;
  margin: 4px 0 0 3px;
  border: 1.5px solid var(--text-muted);
  border-radius: 50%;
  background: transparent;
}
.commit-marker.pushed {
  border-color: var(--commit-marker-fill);
  background: var(--commit-marker-fill);
  box-shadow: 0 0 0 3px var(--commit-marker-glow);
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
  font-size: var(--app-font-size-xs);
  white-space: nowrap;
}
.commit-branches {
  grid-column: 2;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  width: 100%;
  min-width: 0;
  padding-top: 2px;
}
.commit-branch {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-width: 0;
  min-height: 18px;
  padding: 2px 6px;
  border: 1px solid;
  border-radius: 2px;
  font-size: var(--app-font-size-xxs);
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
  text-align: right;
}
.commit-files {
  padding: 2px 0 4px;
}
.commit-file-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 3px 12px 3px 30px;
}
.commit-file-row:hover {
  background: var(--list-hover);
}
.branch-create,
.add-form {
  display: grid;
  gap: 5px;
}
.branch-create {
  grid-template-columns: 1fr 24px;
  margin: 6px 12px 0;
}
.change-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 0;
  padding: 4px 12px;
}
.change-row:hover {
  background: var(--list-hover);
}
.status-badge {
  flex: 0 0 18px;
  width: 18px;
  color: var(--warning);
  font-size: var(--app-font-size-xs);
  font-weight: 700;
  text-align: center;
}
.status-badge[data-status='U'] {
  color: var(--success);
}
.status-badge[data-status='D'] {
  color: var(--danger);
}
.status-badge[data-status='R'] {
  color: var(--accent-strong);
}
.file-path {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  direction: ltr;
  text-align: left;
  unicode-bidi: plaintext;
}
.row-action-btn {
  position: absolute;
  right: 6px;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  opacity: 0;
}
.row-action-btn svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.45;
}
.row-action-btn:hover {
  color: var(--text);
  background: var(--list-focus);
}
.change-row:hover .row-action-btn,
.change-row:focus-visible .row-action-btn {
  opacity: 1;
}
.connection-row {
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
}
.add-form {
  grid-template-columns: 1fr 74px;
  margin: 6px 12px 0;
}
.add-form input,
.add-form select,
.branch-create input {
  min-width: 0;
  height: 26px;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  padding: 0 7px;
}
.add-form input:first-child,
.add-form input:nth-child(3) {
  grid-column: 1 / -1;
}

@keyframes vc-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes vc-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.history-divider {
  height: 1px;
  background: var(--border);
  margin: 8px 0;
  flex-shrink: 0;
}

.history-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

.history-section {
  margin-top: 0 !important;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.history-section > div:last-child {
  flex: 1;
  overflow-y: auto;
}

@keyframes vc-flow-down {
  0%,
  100% {
    transform: translateY(-1px);
    opacity: 0.72;
  }
  50% {
    transform: translateY(2px);
    opacity: 1;
  }
}

@keyframes vc-flow-up {
  0%,
  100% {
    transform: translateY(1px);
    opacity: 0.72;
  }
  50% {
    transform: translateY(-2px);
    opacity: 1;
  }
}

@keyframes vc-progress-line {
  0% {
    transform: translateX(-45%);
  }
  50% {
    transform: translateX(10%);
  }
  100% {
    transform: translateX(55%);
  }
}
</style>
