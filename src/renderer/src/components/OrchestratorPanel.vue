<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStudioStore } from '../stores/studio'
import { useOrchestratorStore } from '../stores/orchestrator'
import { t } from '../i18n'
import { AGENT_COMMANDS, type AgentType, type OrchNodeStatus } from '@shared/types'

const store = useStudioStore()
const orch = useOrchestratorStore()
const idleSeconds = ref(8)

// Same option set (and default = first) as the Add Agent dialog.
const agentTypes = Object.keys(AGENT_COMMANDS) as AgentType[]
const masterType = ref<AgentType>(agentTypes[0])
const subAgentType = ref<AgentType>(agentTypes[0])

const statusColor: Record<OrchNodeStatus, string> = {
  pending: '#6B7280',
  blocked: '#6B7280',
  running: '#10B981',
  done: '#8B5CF6',
  error: '#EF4444'
}

function nodeStatus(key: string): OrchNodeStatus {
  return orch.run?.nodes.find((n) => n.key === key)?.status ?? 'pending'
}

const isBusy = computed(() => orch.phase === 'planning' || orch.phase === 'running')

function generate(): void {
  if (!orch.goal.trim()) return
  orch.generatePlan(masterType.value)
}
</script>

<template>
  <div class="orch-panel">
    <div class="orch-head">
      <span class="orch-title">{{ t('orchestrator.title') }}</span>
      <button
        v-if="orch.phase !== 'idle'"
        class="orch-reset"
        type="button"
        :disabled="isBusy"
        @click="orch.reset()"
      >
        {{ t('orchestrator.reset') }}
      </button>
    </div>

    <div v-if="!store.activeProject" class="orch-empty">{{ t('orchestrator.noProject') }}</div>

    <template v-else>
      <!-- Goal input -->
      <div class="orch-goal">
        <textarea
          v-model="orch.goal"
          class="orch-input"
          rows="3"
          :placeholder="t('orchestrator.goalPlaceholder')"
          :disabled="isBusy"
        />
        <div class="orch-type-row">
          <label>{{ t('orchestrator.masterAgent') }}</label>
          <select v-model="masterType" class="orch-type-select" :disabled="isBusy">
            <option v-for="ty in agentTypes" :key="ty" :value="ty">
              {{ AGENT_COMMANDS[ty].label }}
            </option>
          </select>
        </div>
        <div class="orch-type-row">
          <label>{{ t('orchestrator.subAgent') }}</label>
          <select v-model="subAgentType" class="orch-type-select" :disabled="isBusy">
            <option v-for="ty in agentTypes" :key="ty" :value="ty">
              {{ AGENT_COMMANDS[ty].label }}
            </option>
          </select>
        </div>
        <button
          class="orch-btn primary"
          type="button"
          :disabled="isBusy || !orch.goal.trim()"
          @click="generate"
        >
          {{ orch.phase === 'planning' ? t('orchestrator.planning') : t('orchestrator.generate') }}
        </button>
      </div>

      <p v-if="orch.error" class="orch-error">{{ t(`orchestrator.error.${orch.error}`) }}</p>

      <p v-if="orch.phase === 'planning'" class="orch-hint">
        {{ t('orchestrator.planningHint') }}
      </p>

      <!-- Plan review / run board -->
      <div v-if="orch.plan" class="orch-plan">
        <div class="orch-goal-line">{{ orch.plan.goal }}</div>

        <ul class="orch-nodes">
          <li v-for="node in orch.plan.agents" :key="node.key" class="orch-node">
            <div class="orch-node-head">
              <span class="orch-dot" :style="{ background: statusColor[nodeStatus(node.key)] }" />
              <span class="orch-role">{{ node.role }}</span>
              <span class="orch-type">{{ AGENT_COMMANDS[node.type]?.label ?? node.type }}</span>
              <button
                v-if="orch.phase === 'running' && nodeStatus(node.key) === 'error'"
                class="orch-node-retry"
                type="button"
                @click="orch.retryNode(node.key)"
              >
                {{ t('orchestrator.retry') }}
              </button>
            </div>
            <p class="orch-task">{{ node.task }}</p>
            <p v-if="node.dependsOn?.length" class="orch-deps">
              {{ t('orchestrator.dependsOn') }}: {{ node.dependsOn.join(', ') }}
            </p>
          </li>
        </ul>

        <!-- Review controls -->
        <div v-if="orch.phase === 'review'" class="orch-actions">
          <div class="orch-idle">
            <label>{{ t('orchestrator.idleSeconds') }}</label>
            <input v-model.number="idleSeconds" type="number" min="1" />
          </div>
          <div class="orch-actions-row">
            <button
              class="orch-btn primary"
              type="button"
              @click="orch.execute(Math.max(1, idleSeconds) * 1000, subAgentType)"
            >
              {{ t('orchestrator.execute') }}
            </button>
            <button class="orch-btn" type="button" @click="generate">
              {{ t('orchestrator.regenerate') }}
            </button>
          </div>
        </div>

        <!-- Run controls -->
        <div v-if="orch.run" class="orch-actions">
          <p class="orch-run-status" :class="orch.run.status">
            {{ t(`orchestrator.status.${orch.run.status}`) }}
          </p>
          <button
            v-if="orch.run.status === 'running'"
            class="orch-btn danger"
            type="button"
            @click="orch.stop()"
          >
            {{ t('orchestrator.stop') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.orch-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  color: var(--text);
}
.orch-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.orch-title {
  font-size: var(--app-font-size-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
}
.orch-reset {
  border: 1px solid var(--border);
  border-radius: 3px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  font-size: var(--app-font-size-xs);
  padding: 2px 8px;
}
.orch-reset:disabled {
  opacity: 0.4;
  cursor: default;
}
.orch-empty {
  padding: 16px 12px;
  color: var(--text-dim);
  font-size: var(--app-font-size-sm);
}
.orch-goal {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.orch-input {
  width: 100%;
  resize: vertical;
  padding: 7px 8px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: rgba(10, 10, 15, 0.6);
  color: var(--text);
  font-family: inherit;
  font-size: var(--app-font-size-sm);
  outline: none;
}
.orch-input:focus {
  border-color: var(--accent-hover);
}
.orch-type-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--app-font-size-sm);
  color: var(--text-dim);
}
.orch-type-row label {
  flex: 0 0 64px;
}
.orch-type-select {
  flex: 1;
  min-width: 0;
  padding: 5px 6px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: rgba(10, 10, 15, 0.6);
  color: var(--text);
  font-size: var(--app-font-size-sm);
}
.orch-type-select:disabled {
  opacity: 0.5;
}
.orch-btn {
  border: 1px solid var(--border);
  border-radius: 3px;
  background: rgba(22, 22, 31, 0.9);
  color: var(--text);
  cursor: pointer;
  font-size: var(--app-font-size-sm);
  padding: 6px 12px;
}
.orch-btn:hover:not(:disabled) {
  border-color: var(--accent-hover);
}
.orch-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.orch-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.orch-btn.danger:hover {
  border-color: var(--danger);
  color: var(--danger);
}
.orch-error {
  margin: 0 8px;
  color: var(--danger);
  font-size: var(--app-font-size-sm);
}
.orch-hint {
  margin: 0 8px;
  color: var(--text-dim);
  font-size: var(--app-font-size-sm);
}
.orch-plan {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border);
}
.orch-goal-line {
  font-size: var(--app-font-size-sm);
  font-weight: 600;
  color: var(--text);
}
.orch-nodes {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.orch-node {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 7px 8px;
  background: var(--bg-soft);
}
.orch-node-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.orch-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
}
.orch-role {
  font-size: var(--app-font-size-sm);
  font-weight: 600;
}
.orch-type {
  font-size: var(--app-font-size-xs);
  color: var(--text-dim);
}
.orch-node-retry {
  margin-left: auto;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: transparent;
  color: var(--accent-hover);
  cursor: pointer;
  font-size: var(--app-font-size-xs);
  padding: 1px 6px;
}
.orch-task {
  margin: 5px 0 0;
  font-size: var(--app-font-size-sm);
  color: var(--text-dim);
  white-space: pre-wrap;
}
.orch-deps {
  margin: 4px 0 0;
  font-size: var(--app-font-size-xs);
  color: var(--text-muted);
}
.orch-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}
.orch-idle {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-dim);
  font-size: var(--app-font-size-sm);
}
.orch-idle input {
  width: 56px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: rgba(10, 10, 15, 0.6);
  color: var(--text);
  font-size: var(--app-font-size-sm);
}
.orch-actions-row {
  display: flex;
  gap: 6px;
}
.orch-run-status {
  margin: 0;
  font-size: var(--app-font-size-sm);
  color: var(--text-dim);
}
.orch-run-status.done {
  color: var(--success);
}
.orch-run-status.error {
  color: var(--danger);
}
</style>
