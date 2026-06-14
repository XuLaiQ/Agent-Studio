<script setup lang="ts">
import { ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useStudioStore } from '../stores/studio'
import { t } from '../i18n'
import { AGENT_COMMANDS, type Agent, type AgentStatus } from '@shared/types'
import AddAgentDialog from './AddAgentDialog.vue'
import TerminalView from './TerminalView.vue'

const store = useStudioStore()
const dialog = ref<InstanceType<typeof AddAgentDialog>>()

const statusColor: Record<AgentStatus, string> = {
  idle: '#9399b2',
  running: '#a6e3a1',
  error: '#f38ba8'
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
</script>

<template>
  <div class="workspace">
    <div v-if="!store.activeProject" class="placeholder">
      <div class="big">⬡</div>
      <p>{{ t('workspace.placeholder') }}</p>
    </div>

    <template v-else>
      <div class="tabbar">
        <div class="tabs">
          <div
            v-for="agent in store.agents"
            :key="agent.id"
            class="tab"
            :class="{ active: agent.id === store.activeAgentId }"
            @click="store.selectAgent(agent.id)"
          >
            <span class="dot" :style="{ background: statusColor[store.statusOf(agent.id)] }" />
            <span class="tab-name">{{ agent.name }}</span>
            <span class="tab-type">{{ AGENT_COMMANDS[agent.type].label }}</span>
            <span class="close" @click.stop="closeAgent(agent)">×</span>
          </div>
        </div>
        <el-button size="small" type="primary" @click="dialog?.open()">{{
          t('workspace.addAgent')
        }}</el-button>
      </div>

      <div v-if="!store.agents.length" class="placeholder">
        <p>{{ t('workspace.noAgents', { action: t('workspace.addAgent') }) }}</p>
      </div>

      <!-- Keep every terminal mounted so background sessions keep streaming;
           only the active one is shown. -->
      <div class="terminals">
        <TerminalView
          v-for="agent in store.agents"
          v-show="agent.id === store.activeAgentId"
          :key="agent.id"
          :agent="agent"
          :project-path="store.activeProject.path"
        />
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
.tabs {
  display: flex;
  gap: 4px;
  flex: 1;
  overflow-x: auto;
}
.tab {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px;
  border-radius: 6px 6px 0 0;
  background: var(--bg-panel);
  cursor: pointer;
  white-space: nowrap;
  border: 1px solid transparent;
}
.tab.active {
  border-color: var(--border);
  border-bottom-color: var(--bg);
  outline: 1px solid var(--accent);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.tab-name {
  font-weight: 600;
}
.tab-type {
  font-size: 11px;
  color: var(--text-dim);
}
.close {
  color: var(--text-dim);
  font-size: 15px;
  line-height: 1;
}
.close:hover {
  color: #f38ba8;
}
.terminals {
  flex: 1;
  min-height: 0;
  position: relative;
}
</style>
