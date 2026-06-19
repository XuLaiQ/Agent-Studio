<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useStudioStore } from './stores/studio'
import ProjectSidebar from './components/ProjectSidebar.vue'
import FileExplorer from './components/FileExplorer.vue'
import VersionControlPanel from './components/VersionControlPanel.vue'
import AgentWorkspace from './components/AgentWorkspace.vue'
import FilePreview from './components/FilePreview.vue'
import FileDiffView from './components/FileDiffView.vue'
import {
  locale,
  setLocale,
  elementLocale,
  t,
  LOCALE_OPTIONS,
  type Locale
} from './i18n'
import type { FileNode, VersionDiffSelection, VersionFileChange } from '@shared/types'

const store = useStudioStore()
const leftWidth = ref(Number(localStorage.getItem('agent-studio.leftWidth')) || 300)
const selectedPreviewFile = ref<FileNode | null>(null)
const selectedDiff = ref<VersionDiffSelection | null>(null)
const activeWorkspace = ref<'agents' | 'preview'>('agents')
const sidebarView = ref<'explorer' | 'sourceControl'>('explorer')
let resizing = false

function clampLeftWidth(width: number): number {
  const max = Math.max(280, window.innerWidth - 560)
  return Math.min(Math.max(width, 240), max)
}

function onResizeMove(event: PointerEvent): void {
  if (!resizing) return
  leftWidth.value = clampLeftWidth(event.clientX - 48)
}

function stopResize(): void {
  if (!resizing) return
  resizing = false
  document.body.classList.remove('resizing-panels')
  localStorage.setItem('agent-studio.leftWidth', String(leftWidth.value))
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', stopResize)
}

function startResize(event: PointerEvent): void {
  resizing = true
  event.preventDefault()
  document.body.classList.add('resizing-panels')
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', stopResize)
}

function openFilePreview(node: FileNode): void {
  if (node.isDir) return
  selectedDiff.value = null
  selectedPreviewFile.value = node
  activeWorkspace.value = 'preview'
}

function openDiff(payload: { change: VersionFileChange; staged: boolean }): void {
  const projectId = store.activeProjectId
  if (!projectId) return

  const { change, staged } = payload
  selectedDiff.value = {
    projectId,
    path: change.path,
    originalPath: change.originalPath,
    name: change.path.replace(/\\/g, '/').split('/').pop() ?? change.path,
    staged
  }
  activeWorkspace.value = 'preview'
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function handleDeletedEntry(node: FileNode): void {
  const selected = selectedPreviewFile.value
  if (!selected) return

  const deletedPath = normalizePath(node.path)
  const selectedPath = normalizePath(selected.path)
  if (selectedPath === deletedPath || selectedPath.startsWith(`${deletedPath}/`)) {
    selectedPreviewFile.value = null
    activeWorkspace.value = 'agents'
  }
}

onMounted(() => {
  leftWidth.value = clampLeftWidth(leftWidth.value)
  store.loadProjects()
})

onBeforeUnmount(() => stopResize())

watch(
  () => store.activeProjectId,
  () => {
    selectedPreviewFile.value = null
    selectedDiff.value = null
    activeWorkspace.value = 'agents'
  }
)
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <div class="app-shell">
      <header class="header">
        <span class="logo">Agent Studio</span>
        <span class="subtitle">{{ t('app.subtitle') }}</span>
        <div class="spacer" />
        <el-select
          :model-value="locale"
          size="small"
          class="lang-select"
          :title="t('lang.label')"
          @update:model-value="(v: Locale) => setLocale(v)"
        >
          <el-option
            v-for="opt in LOCALE_OPTIONS"
            :key="opt.value"
            :value="opt.value"
            :label="opt.label"
          />
        </el-select>
      </header>

      <div class="body">
        <nav class="activity-bar" aria-label="Workbench">
          <button
            type="button"
            class="activity-item"
            :class="{ active: sidebarView === 'explorer' }"
            :title="t('explorer.title')"
            @click="sidebarView = 'explorer'"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M3.5 5.5h6l1.8 2h9.2v11h-17v-13Z"
                fill="none"
                stroke="currentColor"
                stroke-linejoin="round"
                stroke-width="1.6"
              />
            </svg>
          </button>
          <button
            type="button"
            class="activity-item"
            :class="{ active: sidebarView === 'sourceControl' }"
            :title="t('version.title')"
            @click="sidebarView = 'sourceControl'"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="7" cy="5" r="2" fill="currentColor" />
              <circle cx="7" cy="19" r="2" fill="currentColor" />
              <circle cx="17" cy="12" r="2" fill="currentColor" />
              <path
                d="M7 7v10M8.8 6.2c5.5 1 8.2 2.8 8.2 5.8M15.2 13.2C11.6 14.3 9 16 7.8 19"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-width="1.5"
              />
            </svg>
          </button>
        </nav>

        <aside class="left" :style="{ width: `${leftWidth}px` }">
          <template v-if="sidebarView === 'explorer'">
            <ProjectSidebar class="left-top" />
            <FileExplorer
              class="left-bottom"
              :selected-path="selectedPreviewFile?.path"
              @open-preview="openFilePreview"
              @entry-deleted="handleDeletedEntry"
            />
          </template>
          <VersionControlPanel v-else class="source-control-sidebar" @open-diff="openDiff" />
        </aside>
        <div
          class="splitter"
          role="separator"
          aria-orientation="vertical"
          :aria-valuenow="leftWidth"
          aria-valuemin="240"
          aria-valuemax="900"
          @pointerdown="startResize"
        />
        <main class="main">
          <div class="main-switcher">
            <button
              type="button"
              :class="{ active: activeWorkspace === 'agents' }"
              @click="activeWorkspace = 'agents'"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M2.5 4.5h11v7h-11v-7Zm2 9h7M6.5 11.5v2m3-2v2"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.3"
                />
              </svg>
              <span>{{ t('workspace.agentsTab') }}</span>
            </button>
            <button
              type="button"
              :class="{ active: activeWorkspace === 'preview' }"
              @click="activeWorkspace = 'preview'"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M4 2.5h5.3L12 5.2v8.3H4v-11Zm5 .8v2.2h2.2M6 8h4M6 10.2h2.6"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.2"
                />
              </svg>
              <span>{{ t('workspace.previewTab') }}</span>
            </button>
          </div>
          <section v-show="activeWorkspace === 'agents'" class="workspace-page">
            <AgentWorkspace />
          </section>
          <section v-show="activeWorkspace === 'preview'" class="workspace-page">
            <FileDiffView
              v-if="selectedDiff"
              :diff="selectedDiff"
              :project-path="store.activeProject?.path"
            />
            <FilePreview
              v-else
              :file="selectedPreviewFile"
              :project-path="store.activeProject?.path"
            />
          </section>
        </main>
      </div>
    </div>
  </el-config-provider>
</template>

<style scoped>
.header {
  height: 34px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  background: var(--titlebar-bg);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
}
.logo {
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
}
.subtitle {
  color: var(--text-dim);
  font-size: 12px;
}
.spacer {
  flex: 1;
}
.lang-select {
  width: 110px;
  -webkit-app-region: no-drag;
}
.body {
  flex: 1;
  display: flex;
  min-height: 0;
  background: var(--bg);
}
.activity-bar {
  flex: 0 0 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 6px;
  background: var(--activity-bg);
  border-right: 1px solid var(--border);
}
.activity-item {
  position: relative;
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
}
.activity-item svg {
  width: 24px;
  height: 24px;
}
.activity-item:hover,
.activity-item.active {
  color: var(--text);
}
.activity-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: var(--accent);
}
.left {
  min-width: 240px;
  display: flex;
  flex-direction: column;
  background: var(--bg-soft);
  border-right: 1px solid var(--border);
}
.splitter {
  flex: 0 0 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s ease;
}
.splitter:hover {
  background: var(--accent);
}
.left-top {
  flex: 0 0 auto;
  max-height: 38%;
  overflow: auto;
}
.left-bottom {
  flex: 1;
  min-height: 0;
  border-top: 1px solid var(--border);
  overflow: auto;
}
.source-control-sidebar {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.main-switcher {
  flex: 0 0 35px;
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0;
  border-bottom: 1px solid var(--border);
  background: var(--bg-soft);
}
.main-switcher button {
  position: relative;
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 13px;
  border: 0;
  border-right: 1px solid var(--border);
  border-radius: 0;
  background: var(--editor-tab);
  color: var(--text-dim);
  font: inherit;
  cursor: pointer;
}
.main-switcher button:hover {
  color: var(--text);
  background: var(--bg-elevated);
}
.main-switcher button.active {
  background: var(--editor-tab-active);
  color: var(--text);
}
.main-switcher button.active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--accent);
}
.main-switcher svg {
  width: 14px;
  height: 14px;
}
.workspace-page {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
}
</style>
