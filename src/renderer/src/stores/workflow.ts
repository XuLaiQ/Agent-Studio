import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  CreateWorkflowInput,
  StepRunStatus,
  TaskRunEvent,
  UpdateWorkflowInput,
  Workflow
} from '@shared/types'
import { useStudioStore } from './studio'

export const useWorkflowStore = defineStore('workflow', () => {
  const workflows = ref<Workflow[]>([])
  /** Latest run snapshot pushed from the main process (null when idle). */
  const run = ref<TaskRunEvent | null>(null)
  const loading = ref(false)

  const isRunning = computed(() => run.value?.status === 'running')

  async function load(projectId: string): Promise<void> {
    loading.value = true
    try {
      workflows.value = await window.studio.listWorkflows(projectId)
    } finally {
      loading.value = false
    }
  }

  async function create(input: CreateWorkflowInput): Promise<Workflow> {
    const workflow = await window.studio.createWorkflow(input)
    workflows.value.push(workflow)
    return workflow
  }

  async function update(input: UpdateWorkflowInput): Promise<void> {
    const updated = await window.studio.updateWorkflow(input)
    if (!updated) return
    const index = workflows.value.findIndex((w) => w.id === updated.id)
    if (index >= 0) workflows.value[index] = updated
  }

  async function remove(id: string, projectId: string): Promise<void> {
    workflows.value = await window.studio.removeWorkflow(id, projectId)
  }

  async function start(workflowId: string, idleMs?: number): Promise<void> {
    run.value = null
    await window.studio.startTask({ workflowId, idleMs })
  }

  function advance(): void {
    if (run.value) window.studio.advanceTask(run.value.runId)
  }

  function retry(): void {
    if (run.value) window.studio.retryTask(run.value.runId)
  }

  function stop(): void {
    if (run.value) window.studio.stopTask(run.value.runId)
  }

  function stepStatus(stepId: string): StepRunStatus | undefined {
    return run.value?.steps.find((s) => s.stepId === stepId)?.status
  }

  // Keep the run snapshot in sync with main-process events.
  window.studio.onTaskEvent((event) => {
    const studioStore = useStudioStore()
    if (event.projectId === studioStore.activeProjectId) run.value = event
  })

  return {
    workflows,
    run,
    loading,
    isRunning,
    load,
    create,
    update,
    remove,
    start,
    advance,
    retry,
    stop,
    stepStatus
  }
})
