<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useStudioStore } from './stores/studio'
import { useSettingsStore } from './stores/settings'
import ProjectSidebar from './components/ProjectSidebar.vue'
import FileExplorer from './components/FileExplorer.vue'
import VersionControlPanel from './components/VersionControlPanel.vue'
import WorkflowPanel from './components/WorkflowPanel.vue'
import OrchestratorPanel from './components/OrchestratorPanel.vue'
import TokenUsagePanel from './components/TokenUsagePanel.vue'
import TokenUsageDashboard from './components/TokenUsageDashboard.vue'
import SettingsDashboard from './components/SettingsDashboard.vue'
import AgentWorkspace from './components/AgentWorkspace.vue'
import FilePreview from './components/FilePreview.vue'
import FileDiffView from './components/FileDiffView.vue'
import {
  elementLocale,
  t
} from './i18n'
import type { FileNode, VersionDiffSelection, VersionFileChange } from '@shared/types'

interface Tab {
  id: string
  path: string
  name: string
  file: FileNode
}

const store = useStudioStore()
const settings = useSettingsStore()
const leftWidth = ref(Number(localStorage.getItem('agent-studio.leftWidth')) || 300)
const tabs = ref<Tab[]>([])
const activeTabPath = ref<string | null>(null)
const previewTabId = ref<string | null>(null)
const selectedDiff = ref<VersionDiffSelection | null>(null)
const activeWorkspace = ref<'agents' | 'preview'>('agents')
const sidebarView = ref<
  'explorer' | 'sourceControl' | 'workflow' | 'orchestrator' | 'tokens'
>('explorer')
const showSettingsPage = ref(false)
let resizing = false

const appStyle = computed(() => settings.cssVars)

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

function previewFile(node: FileNode): void {
  if (node.isDir) return
  selectedDiff.value = null
  activeWorkspace.value = 'preview'

  const normalizedPath = normalizePath(node.path)

  // 1. 检查文件是否已打开
  const existingTab = tabs.value.find((t) => normalizePath(t.path) === normalizedPath)
  if (existingTab) {
    activeTabPath.value = normalizedPath
    return
  }

  // 2. 查找现有预览标签
  if (previewTabId.value) {
    const previewTab = tabs.value.find((t) => t.id === previewTabId.value)
    if (previewTab) {
      previewTab.path = node.path
      previewTab.name = node.name
      previewTab.file = node
      activeTabPath.value = normalizedPath
      return
    }
  }

  // 3. 创建新的预览标签
  const newTab: Tab = {
    id: `preview-${Date.now()}`,
    path: node.path,
    name: node.name,
    file: node
  }
  tabs.value.push(newTab)
  previewTabId.value = newTab.id
  activeTabPath.value = normalizedPath
}

function openFileInTab(node: FileNode): void {
  if (node.isDir) return
  selectedDiff.value = null
  activeWorkspace.value = 'preview'

  const normalizedPath = normalizePath(node.path)

  // 1. 检查文件是否已打开
  const existingTab = tabs.value.find((t) => normalizePath(t.path) === normalizedPath)
  if (existingTab) {
    // 如果是预览标签，转换为普通标签
    if (existingTab.id === previewTabId.value) {
      previewTabId.value = null
    }
    activeTabPath.value = normalizedPath
    return
  }

  // 2. 创建新的普通标签
  const newTab: Tab = {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    path: node.path,
    name: node.name,
    file: node
  }
  tabs.value.push(newTab)
  activeTabPath.value = normalizedPath
}

function selectTab(tabPath: string): void {
  activeTabPath.value = tabPath
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

function closeTab(tabPath: string): void {
  const index = tabs.value.findIndex((t) => normalizePath(t.path) === normalizePath(tabPath))
  if (index === -1) return

  const closedTab = tabs.value[index]
  if (closedTab.id === previewTabId.value) {
    previewTabId.value = null
  }

  tabs.value.splice(index, 1)

  if (activeTabPath.value === normalizePath(tabPath)) {
    if (tabs.value.length > 0) {
      activeTabPath.value = normalizePath(tabs.value[Math.max(0, index - 1)].path)
    } else {
      activeTabPath.value = null
      activeWorkspace.value = 'agents'
    }
  }
}

function handleDeletedEntry(node: FileNode): void {
  const deletedPath = normalizePath(node.path)

  const affectedPaths = tabs.value
    .filter((t) => {
      const tabPath = normalizePath(t.path)
      return tabPath === deletedPath || tabPath.startsWith(`${deletedPath}/`)
    })
    .map((t) => t.path)

  affectedPaths.forEach((path) => closeTab(path))
  if (tabs.value.length === 0) activeWorkspace.value = 'agents'
}

onMounted(() => {
  leftWidth.value = clampLeftWidth(leftWidth.value)
  store.loadProjects()
  window.studio?.setTitleBarTheme?.(settings.theme)
})

watch(
  () => settings.theme,
  (theme) => window.studio?.setTitleBarTheme?.(theme)
)

onBeforeUnmount(() => stopResize())

const selectedFile = computed(() => {
  if (activeTabPath.value) {
    const tab = tabs.value.find((t) => normalizePath(t.path) === activeTabPath.value)
    return tab?.file ?? null
  }
  return null
})

function isTabActive(tabPath: string): boolean {
  return normalizePath(tabPath) === activeTabPath.value
}

watch(
  () => store.activeProjectId,
  () => {
    tabs.value = []
    activeTabPath.value = null
    previewTabId.value = null
    selectedDiff.value = null
    activeWorkspace.value = 'agents'
  }
)

function selectSidebar(view: typeof sidebarView.value): void {
  sidebarView.value = view
  showSettingsPage.value = false
}
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <div class="app-shell" :style="appStyle" :data-theme="settings.theme">
      <div class="titlebar">
        <svg class="titlebar-logo" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2.5 21 7.5v9L12 21.5 3 16.5v-9L12 2.5Z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
          />
          <circle cx="12" cy="12" r="2.6" fill="currentColor" />
          <circle cx="12" cy="6.2" r="1.2" fill="currentColor" />
          <circle cx="17" cy="14.9" r="1.2" fill="currentColor" />
          <circle cx="7" cy="14.9" r="1.2" fill="currentColor" />
        </svg>
        <div class="spacer" />
      </div>
      <div class="body">
        <nav class="activity-bar" aria-label="Workbench">
          <div class="activity-main">
          <button
            type="button"
            class="activity-item"
            :class="{ active: sidebarView === 'explorer' }"
            :title="t('explorer.title')"
            @click="selectSidebar('explorer')"
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
            @click="selectSidebar('sourceControl')"
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
          <button
            type="button"
            class="activity-item"
            :class="{ active: sidebarView === 'workflow' }"
            :title="t('workflow.title')"
            @click="selectSidebar('workflow')"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="7" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.6" />
              <rect x="14" y="15" width="7" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.6" />
              <path
                d="M6.5 9v3.5h11V15"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.6"
              />
            </svg>
          </button>
          <button
            type="button"
            class="activity-item"
            :class="{ active: sidebarView === 'orchestrator' }"
            :title="t('orchestrator.title')"
            @click="selectSidebar('orchestrator')"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6" />
              <circle cx="5.5" cy="18" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6" />
              <circle cx="12" cy="18" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6" />
              <circle cx="18.5" cy="18" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6" />
              <path
                d="M12 7.2v4.3m0 0L5.5 15.8M12 11.5v4.3m0-4.3 6.5 4.3"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-width="1.5"
              />
            </svg>
          </button>
          <button
            type="button"
            class="activity-item"
            :class="{ active: sidebarView === 'tokens' }"
            :title="t('tokens.title')"
            @click="selectSidebar('tokens')"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3.5" y="13" width="4" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.6" />
              <rect x="10" y="8" width="4" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.6" />
              <rect x="16.5" y="4" width="4" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="1.6" />
            </svg>
          </button>
          </div>
          <div class="activity-bottom">
            <button
              type="button"
              class="activity-item"
              :class="{ active: showSettingsPage }"
              :title="t('settings.title')"
              @click.stop="showSettingsPage = !showSettingsPage"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle
                  cx="12"
                  cy="12"
                  r="3"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                />
                <path
                  d="M19.2 13.4a7.6 7.6 0 0 0 0-2.8l2-1.2-2-3.4-2.3 1a7.4 7.4 0 0 0-2.4-1.4L14.2 3h-4.4l-.4 2.6A7.4 7.4 0 0 0 7 7L4.8 6l-2 3.4 2 1.2a7.6 7.6 0 0 0 0 2.8l-2 1.2 2 3.4 2.3-1a7.4 7.4 0 0 0 2.4 1.4l.4 2.6h4.4l.4-2.6A7.4 7.4 0 0 0 17 17l2.3 1 2-3.4-2.1-1.2Z"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.6"
                />
              </svg>
            </button>
          </div>
        </nav>

        <aside class="left" :style="{ width: `${leftWidth}px` }">
          <template v-if="sidebarView === 'explorer'">
            <ProjectSidebar class="left-top" />
            <FileExplorer
              class="left-bottom"
              :selected-path="selectedFile?.path"
              @preview-file="previewFile"
              @open-in-tab="openFileInTab"
              @entry-deleted="handleDeletedEntry"
            />
          </template>
          <template v-else-if="sidebarView === 'sourceControl'">
            <VersionControlPanel
              class="source-control-sidebar"
              @open-diff="openDiff"
            />
          </template>
          <WorkflowPanel v-else-if="sidebarView === 'workflow'" class="source-control-sidebar" />
          <OrchestratorPanel
            v-else-if="sidebarView === 'orchestrator'"
            class="source-control-sidebar"
          />
          <TokenUsagePanel v-else class="source-control-sidebar" />
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
          <SettingsDashboard v-if="showSettingsPage" />
          <TokenUsageDashboard v-else-if="sidebarView === 'tokens'" />
          <!-- Kept mounted (v-show, not v-if) so agent terminals/PTYs survive
               switching to the token dashboard and back. -->
          <div v-show="!showSettingsPage && sidebarView !== 'tokens'" class="workspace-stack">
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
            <div v-if="activeWorkspace === 'preview' && tabs.length > 0" class="editor-tabs">
              <div
                v-for="tab in tabs"
                :key="tab.id"
                :class="[
                  'tab-item',
                  {
                    active: isTabActive(tab.path),
                    preview: tab.id === previewTabId
                  }
                ]"
                :title="tab.path"
                @click="selectTab(tab.path)"
              >
                <span class="tab-name">{{ tab.name }}</span>
                <button
                  type="button"
                  class="tab-close"
                  @click.stop="closeTab(tab.path)"
                  :title="t('common.close')"
                  aria-label="Close tab"
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" /></svg>
                </button>
              </div>
            </div>
            <button
              v-else
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
              :file="selectedFile"
              :project-path="store.activeProject?.path"
            />
          </section>
          </div>
        </main>
      </div>
    </div>
  </el-config-provider>
</template>

<style scoped>
.titlebar {
  height: 34px;
  flex: 0 0 34px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  background: var(--titlebar-bg);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
  user-select: none;
}
.titlebar-logo {
  width: 18px;
  height: 18px;
  color: var(--accent);
  flex: 0 0 auto;
}
.spacer {
  flex: 1;
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
  justify-content: space-between;
  padding: 6px 0;
  background: var(--activity-bg);
  border-right: 1px solid var(--border);
}
.activity-main,
.activity-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.activity-bottom {
  position: relative;
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
  display: flex;
  flex-direction: column;
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.workspace-stack {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.main-switcher {
  flex: 0 0 35px;
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0;
  border-bottom: 1px solid var(--border);
  background: var(--bg-soft);
  overflow-x: auto;
  overflow-y: hidden;
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
.editor-tabs {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0;
  min-width: 0;
  overflow-x: auto;
}
.tab-item {
  position: relative;
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 0;
  border-right: 1px solid var(--border);
  border-radius: 0;
  background: var(--editor-tab);
  color: var(--text-dim);
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}
.tab-item:hover {
  background: var(--bg-elevated);
  color: var(--text);
}
.tab-item.active {
  background: var(--editor-tab-active);
  color: var(--text);
}
.tab-item.active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--accent);
}
.tab-item.preview {
  font-style: italic;
  opacity: 0.85;
}
.tab-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 0 1 auto;
  min-width: 0;
}
.tab-close {
  flex: 0 0 16px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: currentColor;
  cursor: pointer;
  border-radius: 2px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.15s;
}
.tab-close svg {
  width: 14px;
  height: 14px;
}
.tab-close:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.15);
}
.workspace-page {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
}
</style>
