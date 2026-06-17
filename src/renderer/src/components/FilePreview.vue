<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { t } from '../i18n'
import type { FileChangeEvent, FileNode, FilePreview as FilePreviewData } from '@shared/types'

const props = defineProps<{
  file: FileNode | null
  projectPath?: string
}>()

const loading = ref(false)
const saving = ref(false)
const preview = ref<FilePreviewData | null>(null)
const error = ref('')
const editorContent = ref('')
const savedContent = ref('')
const externalChanged = ref(false)
let requestId = 0
let reloadTimer: ReturnType<typeof window.setTimeout> | null = null
let unsubscribeFileChanged: (() => void) | null = null

const dirty = computed(() => editorContent.value !== savedContent.value)
const canEdit = computed(() => preview.value?.kind === 'text' && !preview.value.truncated)

const relativePath = computed(() => {
  if (!props.file || !props.projectPath) return props.file?.path ?? ''

  const root = normalizePath(props.projectPath).replace(/\/+$/, '')
  const target = normalizePath(props.file.path)
  const prefix = `${root}/`

  if (target.toLowerCase() === root.toLowerCase()) return '.'
  if (!target.toLowerCase().startsWith(prefix.toLowerCase())) return props.file.path

  return target.slice(prefix.length)
})

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString()
}

function applyPreview(result: FilePreviewData): void {
  preview.value = result
  error.value = ''
  externalChanged.value = false

  if (result.kind === 'text') {
    const content = result.content ?? ''
    editorContent.value = content
    savedContent.value = content
  } else {
    editorContent.value = ''
    savedContent.value = ''
  }
}

function scheduleReload(): void {
  if (dirty.value) {
    externalChanged.value = true
    return
  }

  if (reloadTimer) window.clearTimeout(reloadTimer)
  reloadTimer = window.setTimeout(() => {
    reloadTimer = null
    loadPreview()
  }, 160)
}

function isActiveFileChange(event: FileChangeEvent): boolean {
  if (!props.file || !props.projectPath) return false

  const projectRoot = normalizePath(props.projectPath).replace(/\/+$/, '')
  if (normalizePath(event.projectPath).toLowerCase() !== projectRoot.toLowerCase()) return false
  if (!event.filename) return true

  const changedPath = `${projectRoot}/${normalizePath(event.filename)}`
  return normalizePath(props.file.path).toLowerCase() === changedPath.toLowerCase()
}

async function loadPreview(): Promise<void> {
  const file = props.file
  const projectPath = props.projectPath
  const currentRequest = ++requestId

  error.value = ''
  preview.value = null

  if (!file || !projectPath || file.isDir) {
    editorContent.value = ''
    savedContent.value = ''
    externalChanged.value = false
    return
  }

  loading.value = true
  try {
    const result = await window.studio.readFilePreview({ projectPath, path: file.path })
    if (currentRequest === requestId) applyPreview(result)
  } catch (err) {
    if (currentRequest === requestId) {
      error.value = err instanceof Error ? err.message : String(err)
      editorContent.value = ''
      savedContent.value = ''
      externalChanged.value = false
    }
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

async function saveFile(): Promise<void> {
  const file = props.file
  const projectPath = props.projectPath
  if (!file || !projectPath || !canEdit.value || !dirty.value) return

  saving.value = true
  try {
    await window.studio.writeFileContent({
      projectPath,
      path: file.path,
      content: editorContent.value
    })
    savedContent.value = editorContent.value
    externalChanged.value = false
    ElMessage.success(t('preview.save.done'))
    await loadPreview()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err))
  } finally {
    saving.value = false
  }
}

function revertChanges(): void {
  editorContent.value = savedContent.value
}

async function reloadFromDisk(): Promise<void> {
  if (dirty.value) {
    try {
      await ElMessageBox.confirm(t('preview.reload.confirm'), t('preview.reload'), {
        type: 'warning',
        confirmButtonText: t('preview.reload'),
        cancelButtonText: t('common.cancel')
      })
    } catch {
      return
    }
  }

  await loadPreview()
}

function handleEditorKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    saveFile()
  }
}

watch(
  () => [props.file?.path, props.projectPath],
  () => {
    requestId++
    loadPreview()
  },
  { immediate: true }
)

onMounted(() => {
  unsubscribeFileChanged = window.studio.onFileChanged((event) => {
    if (isActiveFileChange(event) && !saving.value) scheduleReload()
  })
})

onBeforeUnmount(() => {
  if (reloadTimer) window.clearTimeout(reloadTimer)
  unsubscribeFileChanged?.()
})
</script>

<template>
  <div class="file-preview">
    <header class="preview-header">
      <div class="title-group">
        <svg class="header-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 3.75h7.25L18 8.5v11.75H6V3.75Zm7 1.5v3.5h3.5M8.5 13h7M8.5 16h5"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.7"
          />
        </svg>
        <div>
          <div class="preview-title">
            <span>{{ t('preview.title') }}</span>
            <span v-if="dirty" class="status-pill">{{ t('preview.modified') }}</span>
          </div>
          <div class="preview-path">{{ relativePath || t('preview.emptyPath') }}</div>
        </div>
      </div>

      <div v-if="preview" class="meta">
        <span>{{ formatBytes(preview.size) }}</span>
        <span>{{ formatTime(preview.mtimeMs) }}</span>
      </div>

      <div v-if="preview?.kind === 'text'" class="editor-actions">
        <button type="button" :title="t('preview.reload')" @click="reloadFromDisk">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M13 3.5v3H10M12.4 6.5A4.8 4.8 0 1 0 13 9"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.4"
            />
          </svg>
          <span>{{ t('preview.reload') }}</span>
        </button>
        <button type="button" :disabled="!dirty || saving" @click="revertChanges">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M6 4H3v3m.4-.5A4.9 4.9 0 1 0 5.3 3"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.4"
            />
          </svg>
          <span>{{ t('preview.revert') }}</span>
        </button>
        <button
          type="button"
          class="primary"
          :disabled="!canEdit || !dirty || saving"
          @click="saveFile"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M3 2.5h8.2L13 4.3v9.2H3v-11Zm2 0v4h5v-4M5 11h6"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.3"
            />
          </svg>
          <span>{{ saving ? t('preview.saving') : t('preview.save') }}</span>
        </button>
      </div>
    </header>

    <div v-if="!file" class="empty-state">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path
          d="M13 7h14l8 8v26H13V7Zm13.5 1.5V16H34M18 25h12M18 30h8"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />
      </svg>
      <p>{{ t('preview.empty') }}</p>
    </div>

    <div v-else-if="loading" class="empty-state">
      <div class="loader" />
      <p>{{ t('preview.loading') }}</p>
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

    <div v-else-if="preview" class="preview-body">
      <div v-if="preview.kind === 'text'" class="text-preview">
        <div v-if="preview.truncated" class="notice">{{ t('preview.truncated') }}</div>
        <div v-else-if="externalChanged" class="notice warning">
          {{ t('preview.externalChanged') }}
        </div>
        <textarea
          v-model="editorContent"
          class="editor"
          :readonly="!canEdit"
          spellcheck="false"
          :aria-label="t('preview.editorLabel')"
          @keydown="handleEditorKeydown"
        />
      </div>

      <div v-else-if="preview.kind === 'image'" class="image-preview">
        <img :src="preview.dataUrl" :alt="preview.name" />
      </div>

      <div v-else class="empty-state">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path
            d="M14 6h13l7 7v29H14V6Zm12.5 1.5V14H33M19 25h10M19 30h6"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
          />
        </svg>
        <p>{{ preview.message || t('preview.unsupported') }}</p>
        <span>{{ preview.mime || preview.extension || t('preview.unknownType') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-preview {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.preview-header {
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
.preview-title {
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
  border: 1px solid rgba(204, 167, 0, 0.55);
  border-radius: 999px;
  color: var(--warning);
  font-size: 11px;
  font-weight: 500;
}
.preview-path {
  max-width: 68vw;
  overflow: hidden;
  color: var(--text-dim);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-dim);
  font-size: 12px;
}
.editor-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.editor-actions button {
  height: 26px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--bg-panel);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.editor-actions button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--text);
}
.editor-actions button.primary {
  border-color: #0e639c;
  background: #0e639c;
  color: #ffffff;
}
.editor-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.editor-actions svg {
  width: 14px;
  height: 14px;
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
.empty-state span {
  color: var(--text-dim);
  font-size: 12px;
}
.loader {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(121, 121, 121, 0.24);
  border-top-color: var(--accent-strong);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.preview-body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.text-preview {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.notice {
  flex: 0 0 auto;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  background: rgba(204, 167, 0, 0.12);
  color: var(--warning);
  font-size: 12px;
}
.notice.warning {
  background: rgba(241, 76, 76, 0.12);
  color: var(--danger);
}
.editor {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 14px 16px 28px;
  overflow: auto;
  border: 0;
  outline: 0;
  resize: none;
  background: var(--bg);
  color: var(--text);
  font-family: 'Consolas', 'Cascadia Mono', monospace;
  font-size: 12px;
  line-height: 1.55;
  tab-size: 2;
  white-space: pre;
}
.editor[readonly] {
  color: var(--text-dim);
}
.image-preview {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  overflow: auto;
}
.image-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--bg-soft);
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
