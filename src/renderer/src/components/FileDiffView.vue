<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '../i18n'
import MonacoDiffViewer from './MonacoDiffViewer.vue'
import type { FileChangeEvent, VersionDiffSelection, VersionFileDiff } from '@shared/types'

const props = defineProps<{
  diff: VersionDiffSelection | null
  projectPath?: string
}>()

const loading = ref(false)
const error = ref('')
const result = ref<VersionFileDiff | null>(null)
let requestId = 0
let reloadTimer: ReturnType<typeof window.setTimeout> | null = null
let unsubscribeFileChanged: (() => void) | null = null

const displayPath = computed(() => props.diff?.originalPath ?? props.diff?.path ?? '')

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

async function loadDiff(): Promise<void> {
  const selection = props.diff
  const currentRequest = ++requestId

  error.value = ''

  if (!selection) {
    result.value = null
    return
  }

  loading.value = true
  try {
    const data = await window.studio.diffVersionFile({
      projectId: selection.projectId,
      path: selection.path,
      staged: selection.staged
    })
    if (currentRequest === requestId) result.value = data
  } catch (err) {
    if (currentRequest === requestId) {
      error.value = err instanceof Error ? err.message : String(err)
      result.value = null
    }
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

function isActiveFileChange(event: FileChangeEvent): boolean {
  if (!props.diff || !props.projectPath) return false

  const projectRoot = normalizePath(props.projectPath).replace(/\/+$/, '')
  if (normalizePath(event.projectPath).toLowerCase() !== projectRoot.toLowerCase()) return false
  if (!event.filename) return true

  const changed = normalizePath(event.filename).toLowerCase()
  return normalizePath(props.diff.path).toLowerCase().endsWith(changed)
}

function scheduleReload(): void {
  if (reloadTimer) window.clearTimeout(reloadTimer)
  reloadTimer = window.setTimeout(() => {
    reloadTimer = null
    loadDiff()
  }, 200)
}

watch(
  () => [props.diff?.path, props.diff?.staged, props.diff?.projectId],
  () => loadDiff(),
  { immediate: true }
)

onMounted(() => {
  unsubscribeFileChanged = window.studio.onFileChanged((event) => {
    // The diff is read-only, so a fresh fetch never clobbers local edits.
    if (!props.diff?.staged && isActiveFileChange(event)) scheduleReload()
  })
})

onBeforeUnmount(() => {
  if (reloadTimer) window.clearTimeout(reloadTimer)
  unsubscribeFileChanged?.()
})
</script>

<template>
  <div class="file-diff">
    <header class="diff-header">
      <div class="title-group">
        <svg class="header-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M9 4H5v16M9 4l6 0M9 4v6m6-6v16m0 0h4M15 20H9m0 0v-6"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.6"
          />
        </svg>
        <div>
          <div class="diff-title">
            <span>{{ diff?.name || t('version.diff.title') }}</span>
            <span class="status-pill" :class="{ staged: diff?.staged }">
              {{ diff?.staged ? t('version.diff.staged') : t('version.diff.working') }}
            </span>
          </div>
          <div class="diff-path">{{ displayPath }}</div>
        </div>
      </div>
    </header>

    <div v-if="!diff" class="empty-state">
      <p>{{ t('version.diff.empty') }}</p>
    </div>

    <div v-else-if="loading" class="empty-state">
      <div class="loader" />
      <p>{{ t('version.diff.loading') }}</p>
    </div>

    <div v-else-if="error" class="empty-state">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path
          d="M24 6 43 39H5L24 6Zm0 12v10m0 6h.01"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2.2"
        />
      </svg>
      <p>{{ error }}</p>
    </div>

    <div v-else-if="result?.binary" class="empty-state">
      <p>{{ t('version.diff.binary') }}</p>
    </div>

    <div v-else-if="result" class="diff-body">
      <MonacoDiffViewer
        :original="result.original"
        :modified="result.modified"
        :file-name="result.name"
      />
    </div>
  </div>
</template>

<style scoped>
.file-diff {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.diff-header {
  flex: 0 0 auto;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-soft);
}
.title-group {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
}
.header-icon {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  color: var(--text-dim);
}
.diff-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 600;
}
.status-pill {
  height: 18px;
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 500;
}
.status-pill.staged {
  border-color: rgba(63, 185, 80, 0.55);
  color: var(--success);
}
.diff-path {
  max-width: 68vw;
  overflow: hidden;
  color: var(--text-dim);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty-state {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  color: var(--text-dim);
  text-align: center;
}
.empty-state svg {
  width: 42px;
  height: 42px;
  color: var(--text-muted);
  opacity: 0.72;
}
.empty-state p {
  margin: 0;
}
.loader {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(121, 121, 121, 0.24);
  border-top-color: var(--accent-strong);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.diff-body {
  flex: 1;
  min-height: 0;
  display: flex;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
