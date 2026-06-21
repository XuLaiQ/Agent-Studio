import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  buildPlannerPrompt,
  type AgentConfig,
  type OrchestrationPlan,
  type OrchestratorEvent,
  type OrchestratorRunNode
} from '@shared/types'
import { useStudioStore } from './studio'

type Phase = 'idle' | 'planning' | 'review' | 'running' | 'done'

interface ProjectOrchestratorState {
  goal: string
  phase: Phase
  plan: OrchestrationPlan | null
  run: OrchestratorEvent | null
  error: string
  /** Maps plan node key -> the real sub-agent id created for it. */
  nodeAgentIds: Record<string, string>
  masterAgentId: string | null
}

function createState(): ProjectOrchestratorState {
  return {
    goal: '',
    phase: 'idle',
    plan: null,
    run: null,
    error: '',
    nodeAgentIds: {},
    masterAgentId: null
  }
}

/** Wait until predicate() is true, polling every `step` ms up to `timeout`. */
function waitFor(predicate: () => Promise<boolean>, timeout: number, step = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const tick = async (): Promise<void> => {
      if (await predicate()) return resolve(true)
      if (Date.now() - startedAt >= timeout) return resolve(false)
      setTimeout(tick, step)
    }
    void tick()
  })
}

export const useOrchestratorStore = defineStore('orchestrator', () => {
  const states = ref<Record<string, ProjectOrchestratorState>>({})
  const noProjectState = createState()

  function ensureState(projectId: string): ProjectOrchestratorState {
    states.value[projectId] ??= createState()
    return states.value[projectId]
  }

  const activeState = computed(() => {
    const studio = useStudioStore()
    return studio.activeProjectId ? ensureState(studio.activeProjectId) : noProjectState
  })

  const goal = computed({
    get: () => activeState.value.goal,
    set: (value: string) => {
      const studio = useStudioStore()
      if (!studio.activeProjectId) return
      ensureState(studio.activeProjectId).goal = value
    }
  })
  const phase = computed(() => activeState.value.phase)
  const plan = computed(() => activeState.value.plan)
  const run = computed(() => activeState.value.run)
  const error = computed(() => activeState.value.error)
  const nodeAgentIds = computed(() => activeState.value.nodeAgentIds)

  function reset(): void {
    const studio = useStudioStore()
    if (!studio.activeProjectId) return
    const currentGoal = ensureState(studio.activeProjectId).goal
    states.value[studio.activeProjectId] = { ...createState(), goal: currentGoal }
  }

  async function generatePlan(masterType: AgentConfig): Promise<void> {
    const studio = useStudioStore()
    const project = studio.activeProject
    const projectId = project?.id
    if (!projectId) return

    const state = ensureState(projectId)
    const text = state.goal.trim()
    if (!text) return

    state.phase = 'planning'
    state.plan = null
    state.run = null
    state.error = ''
    state.nodeAgentIds = {}

    const master = await studio.createAgentForProject(projectId, masterType, 'Master')
    if (!master) {
      state.error = 'no-project'
      state.phase = 'idle'
      return
    }
    state.masterAgentId = master.id

    // Wait for the master's terminal to come up, then hand it the planning prompt
    // once its CLI has finished booting (output settled) so input is not lost.
    const ready = await waitFor(() => window.studio.isPtyRunning(master.id), 20000)
    if (!ready) {
      state.error = 'master-not-running'
      state.phase = 'idle'
      return
    }
    const sent = await window.studio.sendPtyWhenIdle(master.id, `${buildPlannerPrompt(text)}\r`)
    if (!sent) {
      state.error = 'master-not-running'
      state.phase = 'idle'
      return
    }

    // Poll the project for the plan file the master is asked to write.
    const got = await waitFor(async () => {
      const parsed = await window.studio.readOrchestratorPlan(projectId)
      if (!parsed) return false
      state.plan = parsed
      return true
    }, 180000, 2000)

    if (!got) {
      state.error = 'plan-timeout'
      state.phase = 'idle'
      return
    }
    state.phase = 'review'
  }

  async function execute(idleMs: number, subAgentType: AgentConfig): Promise<void> {
    const studio = useStudioStore()
    const project = studio.activeProject
    const projectId = project?.id
    if (!projectId) return

    const state = ensureState(projectId)
    if (!state.plan) return

    state.phase = 'running'
    state.error = ''
    state.nodeAgentIds = {}

    // Create one real sub-agent per plan node, all using the chosen CLI type.
    const created: { key: string; agentId: string }[] = []
    for (const node of state.plan.agents) {
      const agent = await studio.createAgentForProject(projectId, subAgentType, node.role)
      if (agent) {
        state.nodeAgentIds[node.key] = agent.id
        created.push({ key: node.key, agentId: agent.id })
      }
    }

    if (created.length !== state.plan.agents.length) {
      state.error = 'no-project'
      state.phase = 'review'
      return
    }

    // Wait for every sub-agent terminal to come up.
    await waitFor(
      async () => {
        const checks = await Promise.all(created.map((c) => window.studio.isPtyRunning(c.agentId)))
        return checks.every(Boolean)
      },
      30000
    )

    const nodes: OrchestratorRunNode[] = state.plan.agents.map((node) => ({
      key: node.key,
      agentId: state.nodeAgentIds[node.key],
      task: node.task,
      dependsOn: node.dependsOn ?? []
    }))

    await window.studio.runOrchestrator({ projectId, idleMs, nodes })
  }

  function stop(): void {
    const currentRun = activeState.value.run
    if (currentRun) window.studio.stopOrchestrator(currentRun.runId)
  }

  function retryNode(key: string): void {
    const currentRun = activeState.value.run
    if (currentRun) window.studio.retryOrchestratorNode(currentRun.runId, key)
  }

  // Keep run snapshots in sync with the main process, keyed by project.
  window.studio.onOrchestratorEvent((event) => {
    const state = ensureState(event.projectId)
    state.run = event
    state.phase = event.status === 'running' ? 'running' : 'done'
  })

  return {
    states,
    goal,
    phase,
    plan,
    run,
    error,
    nodeAgentIds,
    reset,
    generatePlan,
    execute,
    stop,
    retryNode
  }
})
