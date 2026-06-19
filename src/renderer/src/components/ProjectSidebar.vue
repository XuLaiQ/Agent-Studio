<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useStudioStore } from '../stores/studio'
import { t } from '../i18n'
import type { Project } from '@shared/types'

const store = useStudioStore()
const contextMenu = ref<{ project: Project; x: number; y: number } | null>(null)

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
          {{ t('projects.import') }}
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
          <span class="name">{{ p.name }}</span>
          <span class="path">{{ p.path }}</span>
        </div>
        <span class="badge">{{ p.agents.length }}</span>
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
  font-size: 11px;
  letter-spacing: 0.5px;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.empty {
  color: var(--text-dim);
  padding: 14px 12px;
  line-height: 1.6;
  font-size: 12px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.list li {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 4px 8px 4px 12px;
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
}
.name {
  color: var(--text);
  font-weight: 500;
}
.path {
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge {
  background: var(--bg-elevated);
  border-radius: 999px;
  padding: 0 7px;
  font-size: 11px;
  color: var(--text-dim);
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
  padding: 0 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.context-menu button:hover {
  background: var(--list-focus);
  color: var(--text);
}
</style>
