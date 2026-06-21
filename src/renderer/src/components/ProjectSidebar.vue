<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useStudioStore } from '../stores/studio'
import { t } from '../i18n'
import type { AgentRuntimeState, ProjectRuntimeSummary } from '../stores/studio'
import type { Project } from '@shared/types'

const store = useStudioStore()
const contextMenu = ref<{ project: Project; x: number; y: number } | null>(null)
const MAX_AGENT_DOTS = 6
const EMPTY_SUMMARY: ProjectRuntimeSummary = {
  total: 0,
  busy: 0,
  ready: 0,
  stopped: 0,
  error: 0,
  agents: []
}

const projectSummaries = computed<Record<string, ProjectRuntimeSummary>>(() => {
  return Object.fromEntries(
    store.projects.map((project) => [project.id, store.projectRuntimeSummary(project.id)])
  )
})

function runtimeLabel(state: AgentRuntimeState): string {
  return t(`projects.runtime.${state}`)
}

function summaryOf(project: Project): ProjectRuntimeSummary {
  return projectSummaries.value[project.id] ?? EMPTY_SUMMARY
}

function summaryLabel(summary: ProjectRuntimeSummary): string {
  if (summary.error) return t('projects.summary.error', { count: summary.error })
  if (summary.busy) return t('projects.summary.busy', { count: summary.busy })
  if (summary.ready) return t('projects.summary.ready', { count: summary.ready })
  if (summary.total) return t('projects.summary.stopped', { count: summary.total })
  return t('projects.summary.none')
}

function summaryTone(summary: ProjectRuntimeSummary): AgentRuntimeState {
  if (summary.error) return 'error'
  if (summary.busy) return 'busy'
  if (summary.ready) return 'ready'
  return 'stopped'
}

function agentsTitle(summary: ProjectRuntimeSummary): string {
  if (!summary.total) return t('projects.summary.none')
  return summary.agents
    .map(({ agent, state }) => `${agent.name}: ${runtimeLabel(state)}`)
    .join('\n')
}

async function confirmRemove(project: Project): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('projects.remove.confirm', { name: project.name }),
      t('projects.remove.title'),
      {
        type: 'warning',
        confirmButtonText: t('projects.remove.button'),
        cancelButtonText: t('common.cancel')
      }
    )
    await store.removeProject(project.id)
  } catch {
    /* cancelled */
  }
}

async function confirmRemoveAll(): Promise<void> {
  if (!store.projects.length) return
  try {
    await ElMessageBox.confirm(
      t('projects.removeAll.confirm', { count: store.projects.length }),
      t('projects.removeAll.title'),
      {
        type: 'warning',
        confirmButtonText: t('projects.removeAll.button'),
        cancelButtonText: t('common.cancel')
      }
    )
    await store.removeAllProjects()
  } catch {
    /* cancelled */
  }
}

function openContextMenu(project: Project, event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()

  const menuWidth = 190
  const menuHeight = 38
  contextMenu.value = {
    project,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
  }
}

function closeContextMenu(): void {
  contextMenu.value = null
}

async function openInFileManager(): Promise<void> {
  const project = contextMenu.value?.project
  if (!project) return
  closeContextMenu()
  await window.studio.openProjectPath(project.path)
}

function closeContextMenuOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeContextMenu()
}

onMounted(() => {
  window.addEventListener('click', closeContextMenu)
  window.addEventListener('contextmenu', closeContextMenu)
  window.addEventListener('keydown', closeContextMenuOnEscape)
  window.addEventListener('blur', closeContextMenu)
  window.addEventListener('scroll', closeContextMenu, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeContextMenu)
  window.removeEventListener('contextmenu', closeContextMenu)
  window.removeEventListener('keydown', closeContextMenuOnEscape)
  window.removeEventListener('blur', closeContextMenu)
  window.removeEventListener('scroll', closeContextMenu, true)
})
</script>

<template>
  <div class="sidebar">
    <div class="section-head">
      <span>{{ t('projects.title') }}</span>
      <div class="head-actions">
        <el-button
          size="small"
          type="danger"
          plain
          :disabled="!store.projects.length"
          @click="confirmRemoveAll"
        >
          {{ t('projects.removeAll.button') }}
        </el-button>
        <el-button size="small" type="primary" plain @click="store.importProject()">
          <svg class="button-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 3.5v9M3.5 8h9"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="1.5"
            />
          </svg>
          <span>{{ t('projects.import') }}</span>
        </el-button>
      </div>
    </div>

    <div v-if="!store.projects.length" class="empty">
      {{ t('projects.empty.line1') }}<br />
      {{ t('projects.empty.line2', { action: t('projects.import') }) }}
    </div>

    <ul class="list">
      <li
        v-for="p in store.projects"
        :key="p.id"
        :class="{ active: p.id === store.activeProjectId }"
        @click="store.selectProject(p.id)"
        @contextmenu="openContextMenu(p, $event)"
      >
        <div class="proj">
          <div class="proj-line">
            <span class="name">{{ p.name }}</span>
            <span class="agent-total">{{ summaryOf(p).total }}</span>
          </div>
          <span class="path">{{ p.path }}</span>
          <div class="agent-strip" :title="agentsTitle(summaryOf(p))">
            <span
              v-for="item in summaryOf(p).agents.slice(0, MAX_AGENT_DOTS)"
              :key="item.agent.id"
              class="agent-dot"
              :class="item.state"
              :aria-label="`${item.agent.name}: ${runtimeLabel(item.state)}`"
            />
            <span v-if="summaryOf(p).total > MAX_AGENT_DOTS" class="agent-more">
              +{{ summaryOf(p).total - MAX_AGENT_DOTS }}
            </span>
          </div>
        </div>
        <span class="badge" :class="summaryTone(summaryOf(p))">
          {{ summaryLabel(summaryOf(p)) }}
        </span>
        <button class="del" type="button" :title="t('projects.remove.tip')" @click.stop="confirmRemove(p)">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="1.5"
            />
          </svg>
        </button>
      </li>
    </ul>

    <div
      v-if="contextMenu"
      class="context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
      @contextmenu.prevent.stop
    >
      <button type="button" @click="openInFileManager">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M3 4.5h4l1.2 1.4H13v5.6H3v-7Z"
            fill="none"
            stroke="currentColor"
            stroke-linejoin="round"
            stroke-width="1.3"
          />
          <path
            d="M10 3h3v3M9 7l4-4"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.3"
          />
        </svg>
        {{ t('projects.open.external') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  padding: 0 0 8px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  padding: 0 12px;
  font-weight: 600;
  color: var(--text-dim);
  text-transform: uppercase;
  font-size: var(--app-font-size-xs);
  letter-spacing: 0.5px;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.button-icon {
  width: 14px;
  height: 14px;
  margin-right: 4px;
}
.empty {
  color: var(--text-dim);
  padding: 14px 12px;
  line-height: 1.6;
  font-size: var(--app-font-size-sm);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.list li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 6px 8px 6px 12px;
  border-radius: 0;
  cursor: pointer;
}
.list li:hover {
  background: var(--list-hover);
}
.list li.active {
  background: var(--list-focus);
  outline: 0;
}
.proj {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.proj-line {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.name {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-total {
  flex: 0 0 auto;
  min-width: 16px;
  height: 16px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 2px;
  color: var(--text-muted);
  font-size: var(--app-font-size-xxs);
  line-height: 1;
}
.path {
  font-size: var(--app-font-size-xs);
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-strip {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 10px;
}
.agent-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--text-muted);
  box-shadow: 0 0 0 1px rgba(245, 245, 247, 0.08);
}
.agent-dot.busy {
  background: var(--success);
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.14);
}
.agent-dot.ready {
  background: #22d3ee;
  box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.32);
}
.agent-dot.stopped {
  background: var(--text-muted);
  opacity: 0.65;
}
.agent-dot.error {
  background: var(--danger);
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.16);
}
.agent-more {
  color: var(--text-muted);
  font-size: var(--app-font-size-xxs);
  line-height: 1;
}
.badge {
  flex: 0 0 auto;
  max-width: 64px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--bg-elevated);
  padding: 2px 6px;
  font-size: var(--app-font-size-xs);
  line-height: 1.25;
  color: var(--text-dim);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge.busy {
  border-color: rgba(16, 185, 129, 0.45);
  color: var(--success);
}
.badge.ready {
  border-color: rgba(34, 211, 238, 0.42);
  color: #67e8f9;
}
.badge.error {
  border-color: rgba(239, 68, 68, 0.48);
  color: var(--danger);
}
.badge.stopped {
  color: var(--text-muted);
}
.del {
  width: 22px;
  height: 22px;
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  opacity: 0;
}
.del svg {
  width: 14px;
  height: 14px;
}
.list li:hover .del,
.list li.active .del {
  opacity: 1;
}
.del:hover {
  color: var(--danger);
}
.context-menu {
  position: fixed;
  z-index: 60;
  min-width: 178px;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--bg-soft);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.32);
}
.context-menu button {
  width: 100%;
  height: 28px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.context-menu button svg {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
}
.context-menu button:hover {
  background: var(--list-focus);
  color: var(--text);
}
</style>
