<script setup lang="ts">
import { ElMessageBox } from 'element-plus'
import { useStudioStore } from '../stores/studio'
import { t } from '../i18n'
import type { Project } from '@shared/types'

const store = useStudioStore()

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
</script>

<template>
  <div class="sidebar">
    <div class="section-head">
      <span>{{ t('projects.title') }}</span>
      <el-button size="small" type="primary" plain @click="store.importProject()">
        {{ t('projects.import') }}
      </el-button>
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
      >
        <div class="proj">
          <span class="name">{{ p.name }}</span>
          <span class="path">{{ p.path }}</span>
        </div>
        <span class="badge">{{ p.agents.length }}</span>
        <span class="del" :title="t('projects.remove.tip')" @click.stop="confirmRemove(p)">×</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.sidebar {
  padding: 8px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 4px 8px;
  font-weight: 600;
  color: var(--text-dim);
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
}
.empty {
  color: var(--text-dim);
  padding: 16px 6px;
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
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.list li:hover {
  background: var(--bg-panel);
}
.list li.active {
  background: var(--bg-panel);
  outline: 1px solid var(--accent);
}
.proj {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.name {
  font-weight: 600;
}
.path {
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge {
  background: var(--border);
  border-radius: 10px;
  padding: 0 7px;
  font-size: 11px;
  color: var(--text-dim);
}
.del {
  color: var(--text-dim);
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
}
.del:hover {
  color: #f38ba8;
}
</style>
