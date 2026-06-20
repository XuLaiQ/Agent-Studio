<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useStudioStore } from '../stores/studio'
import { useWorkflowStore } from '../stores/workflow'
import { t } from '../i18n'
import { AGENT_COMMANDS, type StepRunStatus, type Workflow } from '@shared/types'

const store = useStudioStore()
const wf = useWorkflowStore()

interface DraftStep {
  agentId: string
  prompt: string
}

const editingId = ref<string | null>(null)
const draftName = ref('')
const draftSteps = ref<DraftStep[]>([])
const idleSeconds = ref(8)

const agents = computed(() => store.activeProject?.agents ?? [])

const statusColor: Record<StepRunStatus, string> = {
  pending: '#6B7280',
  running: '#10B981',
  done: '#8B5CF6',
  error: '#EF4444',
  skipped: '#6B7280'
}

watch(
  () => store.activeProjectId,
  (projectId) => {
    resetDraft()
    if (projectId) wf.load(projectId)
  },
  { immediate: true }
)

function resetDraft(): void {
  editingId.value = null
  draftName.value = ''
  draftSteps.value = []
}

function newWorkflow(): void {
  editingId.value = null
  draftName.value = ''
  draftSteps.value = [{ agentId: agents.value[0]?.id ?? '', prompt: '' }]
}

function editWorkflow(workflow: Workflow): void {
  editingId.value = workflow.id
  draftName.value = workflow.name
  draftSteps.value = workflow.steps.map((s) => ({ agentId: s.agentId, prompt: s.prompt }))
}

function addStep(): void {
  draftSteps.value.push({ agentId: agents.value[0]?.id ?? '', prompt: '' })
}

function removeStep(index: number): void {
  draftSteps.value.splice(index, 1)
}

function moveStep(index: number, delta: number): void {
  const to = index + delta
  if (to < 0 || to >= draftSteps.value.length) return
  const steps = draftSteps.value
  ;[steps[index], steps[to]] = [steps[to], steps[index]]
}

const canSave = computed(
  () =>
    Boolean(store.activeProjectId) &&
    draftName.value.trim().length > 0 &&
    draftSteps.value.length > 0 &&
    draftSteps.value.every((s) => s.agentId && s.prompt.trim())
)

async function save(): Promise<void> {
  if (!store.activeProjectId || !canSave.value) {
    ElMessage.warning(t('workflow.invalid'))
    return
  }
  const steps = draftSteps.value.map((s) => ({ agentId: s.agentId, prompt: s.prompt.trim() }))

  if (editingId.value) {
    await wf.update({ id: editingId.value, name: draftName.value.trim(), steps })
  } else {
    const created = await wf.create({
      projectId: store.activeProjectId,
      name: draftName.value.trim(),
      steps
    })
    editingId.value = created.id
  }
  ElMessage.success(t('workflow.saved'))
}

async function remove(): Promise<void> {
  if (!editingId.value || !store.activeProjectId) return
  try {
    await ElMessageBox.confirm(t('workflow.delete.confirm', { name: draftName.value }), {
      type: 'warning',
      confirmButtonText: t('workflow.delete'),
      cancelButtonText: t('common.cancel')
    })
    await wf.remove(editingId.value, store.activeProjectId)
    resetDraft()
  } catch {
    /* cancelled */
  }
}

async function run(): Promise<void> {
  if (!editingId.value) {
    ElMessage.warning(t('workflow.runSaveFirst'))
    return
  }
  await wf.start(editingId.value, Math.max(1, idleSeconds.value) * 1000)
}

const runForThisWorkflow = computed(() =>
  wf.run && wf.run.workflowId === editingId.value ? wf.run : null
)
</script>

<template>
  <div class="workflow-panel">
    <div class="wf-head">
      <span class="wf-title">{{ t('workflow.title') }}</span>
      <button class="wf-new" type="button" @click="newWorkflow">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" />
        </svg>
        <span>{{ t('workflow.new') }}</span>
      </button>
    </div>

    <div v-if="!store.activeProject" class="wf-empty">{{ t('workflow.noProject') }}</div>

    <template v-else>
      <!-- Saved workflows -->
      <ul v-if="wf.workflows.length" class="wf-list">
        <li
          v-for="w in wf.workflows"
          :key="w.id"
          :class="{ active: w.id === editingId }"
          @click="editWorkflow(w)"
        >
          <span class="wf-list-name">{{ w.name }}</span>
          <span class="wf-list-count">{{ w.steps.length }}</span>
        </li>
      </ul>

      <!-- Editor -->
      <div v-if="draftSteps.length || editingId !== null" class="wf-editor">
        <input v-model="draftName" class="wf-input" :placeholder="t('workflow.namePlaceholder')" />

        <div v-for="(step, index) in draftSteps" :key="index" class="wf-step">
          <div class="wf-step-bar">
            <span
              class="wf-step-dot"
              :style="{
                background: statusColor[runForThisWorkflow?.steps[index]?.status ?? 'pending']
              }"
            />
            <span class="wf-step-index">{{ index + 1 }}</span>
            <select v-model="step.agentId" class="wf-select">
              <option v-for="a in agents" :key="a.id" :value="a.id">
                {{ a.name }} · {{ AGENT_COMMANDS[a.type].label }}
              </option>
            </select>
            <div class="wf-step-actions">
              <button type="button" :disabled="index === 0" @click="moveStep(index, -1)">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 3.5v9M4.5 7 8 3.5 11.5 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4" />
                </svg>
              </button>
              <button type="button" :disabled="index === draftSteps.length - 1" @click="moveStep(index, 1)">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4" />
                </svg>
              </button>
              <button type="button" @click="removeStep(index)">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" />
                </svg>
              </button>
            </div>
          </div>
          <textarea
            v-model="step.prompt"
            class="wf-prompt"
            rows="2"
            :placeholder="t('workflow.promptPlaceholder')"
          />
        </div>

        <button class="wf-add" type="button" @click="addStep">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" />
          </svg>
          <span>{{ t('workflow.addStep') }}</span>
        </button>

        <div class="wf-editor-actions">
          <button class="wf-btn" type="button" :disabled="!canSave" @click="save">
            {{ t('workflow.save') }}
          </button>
          <button
            v-if="editingId"
            class="wf-btn danger"
            type="button"
            @click="remove"
          >
            {{ t('workflow.delete') }}
          </button>
        </div>
      </div>

      <!-- Run controls -->
      <div v-if="editingId" class="wf-run">
        <div class="wf-run-config">
          <label>{{ t('workflow.idleSeconds') }}</label>
          <input v-model.number="idleSeconds" class="wf-idle" type="number" min="1" />
        </div>
        <div class="wf-run-actions">
          <button
            class="wf-btn primary"
            type="button"
            :disabled="wf.isRunning"
            @click="run"
          >
            {{ t('workflow.run') }}
          </button>
          <template v-if="runForThisWorkflow?.status === 'running'">
            <button class="wf-btn" type="button" @click="wf.advance()">
              {{ t('workflow.advance') }}
            </button>
            <button class="wf-btn" type="button" @click="wf.retry()">
              {{ t('workflow.retry') }}
            </button>
            <button class="wf-btn danger" type="button" @click="wf.stop()">
              {{ t('workflow.stop') }}
            </button>
          </template>
        </div>
        <p v-if="runForThisWorkflow" class="wf-run-status" :class="runForThisWorkflow.status">
          {{ t(`workflow.status.${runForThisWorkflow.status}`) }}
          <span v-if="runForThisWorkflow.message === 'agent-not-running'">
            · {{ t('workflow.agentNotRunning') }}
          </span>
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.workflow-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  color: var(--text);
}
.wf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.wf-title {
  font-size: var(--app-font-size-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
}
.wf-new {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: transparent;
  color: var(--accent-hover);
  cursor: pointer;
  font-size: var(--app-font-size-xs);
  padding: 2px 8px;
}
.wf-new:hover {
  border-color: var(--accent-hover);
}
.wf-new svg,
.wf-add svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
}
.wf-empty {
  padding: 16px 12px;
  color: var(--text-dim);
  font-size: var(--app-font-size-sm);
}
.wf-list {
  margin: 0;
  padding: 4px;
  list-style: none;
  border-bottom: 1px solid var(--border);
}
.wf-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: var(--app-font-size-sm);
}
.wf-list li:hover {
  background: rgba(157, 116, 255, 0.12);
}
.wf-list li.active {
  background: rgba(157, 116, 255, 0.22);
}
.wf-list-count {
  color: var(--text-dim);
  font-size: var(--app-font-size-xs);
}
.wf-editor {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wf-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: rgba(10, 10, 15, 0.6);
  color: var(--text);
  font-size: var(--app-font-size-sm);
  outline: none;
}
.wf-input:focus {
  border-color: var(--accent-hover);
}
.wf-step {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px;
  background: var(--bg-soft);
}
.wf-step-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.wf-step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
}
.wf-step-index {
  color: var(--text-dim);
  font-size: var(--app-font-size-xs);
  width: 14px;
}
.wf-select {
  flex: 1;
  min-width: 0;
  padding: 3px 4px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: rgba(10, 10, 15, 0.6);
  color: var(--text);
  font-size: var(--app-font-size-xs);
}
.wf-step-actions {
  display: flex;
  gap: 2px;
}
.wf-step-actions button {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  font-size: var(--app-font-size-xs);
  line-height: 1;
}
.wf-step-actions svg {
  width: 13px;
  height: 13px;
}
.wf-step-actions button:disabled {
  opacity: 0.35;
  cursor: default;
}
.wf-step-actions button:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--accent-hover);
}
.wf-prompt {
  width: 100%;
  resize: vertical;
  padding: 5px 7px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: rgba(10, 10, 15, 0.6);
  color: var(--text);
  font-family: inherit;
  font-size: var(--app-font-size-sm);
  outline: none;
}
.wf-prompt:focus {
  border-color: var(--accent-hover);
}
.wf-add {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px dashed var(--border);
  border-radius: 3px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  font-size: var(--app-font-size-sm);
  padding: 4px 10px;
}
.wf-add:hover {
  color: var(--text);
  border-color: var(--accent-hover);
}
.wf-editor-actions,
.wf-run-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.wf-btn {
  border: 1px solid var(--border);
  border-radius: 3px;
  background: rgba(22, 22, 31, 0.9);
  color: var(--text);
  cursor: pointer;
  font-size: var(--app-font-size-sm);
  padding: 5px 12px;
}
.wf-btn:hover:not(:disabled) {
  border-color: var(--accent-hover);
}
.wf-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.wf-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.wf-btn.danger:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
}
.wf-run {
  padding: 8px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wf-run-config {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-dim);
  font-size: var(--app-font-size-sm);
}
.wf-idle {
  width: 56px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: rgba(10, 10, 15, 0.6);
  color: var(--text);
  font-size: var(--app-font-size-sm);
}
.wf-run-status {
  margin: 0;
  font-size: var(--app-font-size-sm);
  color: var(--text-dim);
}
.wf-run-status.done {
  color: var(--success);
}
.wf-run-status.error {
  color: var(--danger);
}
</style>
