<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useStudioStore } from '../stores/studio'
import { t } from '../i18n'
import { AGENT_COMMANDS, type Agent, type AgentStatus, type Project } from '@shared/types'
import AddAgentDialog from './AddAgentDialog.vue'
import TerminalView from './TerminalView.vue'

const store = useStudioStore()
const dialog = ref<InstanceType<typeof AddAgentDialog>>()
const visitedProjectIds = ref<string[]>([])
const agentOrder = ref<Record<string, string[]>>({})
const dragged = ref<{ projectId: string; agentId: string } | null>(null)

const statusColor: Record<AgentStatus, string> = {
  idle: '#9399b2',
  running: '#a6e3a1',
  error: '#f38ba8'
}

const visitedProjects = computed(() =>
  visitedProjectIds.value
    .map((id) => store.projects.find((project) => project.id === id))
    .filter((project): project is Project => Boolean(project))
)

watch(
  () => store.activeProjectId,
  (projectId) => {
    if (projectId && !visitedProjectIds.value.includes(projectId)) {
      visitedProjectIds.value.push(projectId)
    }
  },
  { immediate: true }
)

watch(
  () => store.projects.map((project) => project.id),
  (projectIds) => {
    visitedProjectIds.value = visitedProjectIds.value.filter((id) => projectIds.includes(id))
  }
)

function orderedAgents(project: Project): Agent[] {
  const order = agentOrder.value[project.id] ?? []
  return [...project.agents].sort((a, b) => {
    const aIndex = order.indexOf(a.id)
    const bIndex = order.indexOf(b.id)
    if (aIndex === -1 && bIndex === -1) return 0
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })
}

function reorderAgent(projectId: string, sourceAgentId: string, targetAgentId: string): void {
  if (sourceAgentId === targetAgentId) return

  const project = store.projects.find((item) => item.id === projectId)
  if (!project) return

  const nextOrder = orderedAgents(project).map((agent) => agent.id)
  const from = nextOrder.indexOf(sourceAgentId)
  const to = nextOrder.indexOf(targetAgentId)
  if (from === -1 || to === -1) return

  nextOrder.splice(from, 1)
  nextOrder.splice(to, 0, sourceAgentId)
  agentOrder.value = { ...agentOrder.value, [projectId]: nextOrder }
}

function startDrag(projectId: string, agentId: string, event: DragEvent): void {
  dragged.value = { projectId, agentId }
  event.dataTransfer?.setData('text/plain', agentId)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function dragOver(event: DragEvent): void {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function dropOn(projectId: string, targetAgentId: string, event: DragEvent): void {
  event.preventDefault()
  const source = dragged.value
  dragged.value = null
  if (!source || source.projectId !== projectId) return
  reorderAgent(projectId, source.agentId, targetAgentId)
}

async function closeAgent(agent: Agent): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('agent.close.confirm', { name: agent.name }),
      t('agent.close.title'),
      {
        type: 'warning',
        confirmButtonText: t('agent.close.button'),
        cancelButtonText: t('common.cancel')
      }
    )
    await store.removeAgent(agent)
  } catch {
    /* cancelled */
  }
}

async function closeAllAgents(): Promise<void> {
  const agents = [...store.agents]
  if (!agents.length) return

  try {
    await ElMessageBox.confirm(
      t('agent.closeAll.confirm', { count: agents.length }),
      t('agent.closeAll.title'),
      {
        type: 'warning',
        confirmButtonText: t('agent.closeAll.button'),
        cancelButtonText: t('common.cancel')
      }
    )

    for (const agent of agents) {
      await store.removeAgent(agent)
    }
  } catch {
    /* cancelled */
  }
}
</script>

<template>
  <div class="workspace">
    <div v-if="!store.activeProject" class="placeholder">
      <div class="big">*</div>
      <p>{{ t('workspace.placeholder') }}</p>
    </div>

    <template v-else>
      <div class="tabbar">
        <div class="workspace-title">
          <span>{{ store.activeProject.name }}</span>
          <span>{{ store.agents.length }}</span>
        </div>
        <div class="workspace-actions">
          <el-button size="small" type="danger" plain :disabled="!store.agents.length" @click="closeAllAgents">
            {{ t('agent.closeAll.button') }}
          </el-button>
          <el-button size="small" type="primary" @click="dialog?.open()">{{
            t('workspace.addAgent')
          }}</el-button>
        </div>
      </div>

      <div class="project-terminal-stage">
        <div v-if="!store.agents.length" class="placeholder stage-placeholder">
          <p>{{ t('workspace.noAgents', { action: t('workspace.addAgent') }) }}</p>
        </div>
        <div
          v-for="project in visitedProjects"
          v-show="project.id === store.activeProjectId"
          :key="project.id"
          class="terminals"
        >
          <section
            v-for="agent in orderedAgents(project)"
            :key="agent.id"
            class="terminal-panel"
            :class="{
              active: agent.id === store.activeAgentId,
              dragging: dragged?.agentId === agent.id
            }"
            @click="store.selectAgent(agent.id)"
            @dragover="dragOver"
            @drop="dropOn(project.id, agent.id, $event)"
          >
            <header
              class="terminal-head"
              draggable="true"
              @dragstart="startDrag(project.id, agent.id, $event)"
              @dragend="dragged = null"
            >
              <div class="terminal-title">
                <span class="drag-handle" title="Drag">::</span>
                <span class="dot" :style="{ background: statusColor[store.statusOf(agent.id)] }" />
                <span class="terminal-name">{{ agent.name }}</span>
                <span class="terminal-type">{{ AGENT_COMMANDS[agent.type].label }}</span>
              </div>
              <button
                class="close"
                type="button"
                :title="t('agent.close.button')"
                @click.stop="closeAgent(agent)"
              >
                x
              </button>
            </header>
            <div class="terminal-body">
              <TerminalView :agent="agent" :project-path="project.path" />
            </div>
          </section>
        </div>
      </div>
    </template>

    <AddAgentDialog ref="dialog" />
  </div>
</template>

<style scoped>
.workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--bg);
}
.placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
  gap: 8px;
}
.big {
  font-size: 56px;
  color: var(--accent);
  opacity: 0.4;
}
.tabbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-soft);
  border-bottom: 1px solid var(--border);
}
.workspace-title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.workspace-title span:first-child {
  min-width: 0;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workspace-title span:last-child {
  color: var(--text-dim);
  font-size: 11px;
}
.workspace-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.project-terminal-stage {
  flex: 1;
  min-height: 0;
  position: relative;
}
.stage-placeholder {
  position: absolute;
  inset: 0;
}
.terminals {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
  grid-auto-rows: minmax(280px, 1fr);
  gap: 8px;
  padding: 8px;
  overflow: auto;
}
.terminal-panel {
  min-width: 0;
  min-height: 280px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #1e1e2e;
}
.terminal-panel.active {
  border-color: var(--accent);
}
.terminal-panel.dragging {
  opacity: 0.55;
}
.terminal-head {
  flex: 0 0 auto;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px;
  background: var(--bg-soft);
  border-bottom: 1px solid var(--border);
  cursor: grab;
}
.terminal-head:active {
  cursor: grabbing;
}
.terminal-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  overflow: hidden;
}
.drag-handle {
  flex: 0 0 auto;
  color: var(--text-dim);
  font-size: 11px;
  letter-spacing: -1px;
}
.dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.terminal-name {
  min-width: 0;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.terminal-type {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--text-dim);
}
.close {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
}
.close:hover {
  color: #f38ba8;
}
.terminal-body {
  flex: 1;
  min-height: 0;
  position: relative;
}
</style>
