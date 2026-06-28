import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  type Agent,
  PLAN_FILE,
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

function startAgentPty(agent: Agent, cwd: string, config: AgentConfig): void {
  window.studio.startPty({
    agentId: agent.id,
    cwd,
    type: agent.type,
    launchCommand: agent.launchCommand || config.command,
    cols: 80,
    rows: 24
  })
}

async function clearPlanFile(projectPath: string): Promise<void> {
  try {
    await window.studio.deleteFileEntry({
      projectPath,
      path: PLAN_FILE
    })
  } catch {
    /* ignore missing file */
  }
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

  async function generatePlan(masterType: AgentConfig, autoExecute = false, subAgentType?: AgentConfig, idleMs = 8000): Promise<void> {
    const studio = useStudioStore()
    const project = studio.activeProject
    const projectId = project?.id
    if (!projectId) return

    const state = ensureState(projectId)
    const text = state.goal.trim()
    if (!text) return

    console.log('[orchestrator.generatePlan] Starting plan generation for goal:', text)
    state.phase = 'planning'
    state.plan = null
    state.run = null
    state.error = ''
    state.nodeAgentIds = {}
    await clearPlanFile(project.path)
    console.log('[orchestrator.generatePlan] Cleared old plan file')

    const master = await studio.createAgentForProject(projectId, masterType, 'Master')
    if (!master) {
      console.error('[orchestrator.generatePlan] Failed to create master agent')
      state.error = 'no-project'
      state.phase = 'idle'
      return
    }
    state.masterAgentId = master.id
    console.log('[orchestrator.generatePlan] Created master agent:', master.id)

    // Orchestration owns the master PTY startup. Relying on TerminalView's
    // mount side effect is racy: the prompt can be sent before any PTY exists,
    // or a later mount can restart the PTY and lose the prompt.
    console.log('[orchestrator.generatePlan] Starting master PTY')
    startAgentPty(master, project.path, masterType)

    // Wait for the master's PTY to be running. The PTY initial boot output
    // (from the shell/CLI startup) will be detected, and once it settles,
    // we send the planning prompt.
    console.log('[orchestrator.generatePlan] Waiting for PTY to be running...')
    const ready = await waitFor(() => window.studio.isPtyRunning(master.id), 20000)
    if (!ready) {
      console.error('[orchestrator.generatePlan] PTY failed to start in time')
      state.error = 'master-not-running'
      state.phase = 'idle'
      return
    }
    console.log('[orchestrator.generatePlan] PTY is now running')

    // Send prompt once CLI is ready. Use aggressive timing: detect readiness
    // after 800ms of idle output, timeout after 8 seconds if still booting.
    console.log('[orchestrator.generatePlan] Sending planning prompt to master agent...')
    const sent = await window.studio.sendPtyWhenIdle(
      master.id,
      `${buildPlannerPrompt(text)}\r`,
      800,  // idleMs: time to wait without output before sending
      8000  // timeoutMs: force send after this timeout
    )
    if (!sent) {
      console.error('[orchestrator.generatePlan] Failed to send prompt to master agent')
      state.error = 'master-not-running'
      state.phase = 'idle'
      return
    }
    console.log('[orchestrator.generatePlan] Planning prompt sent successfully, waiting for plan file...')

    // Poll the project for the plan file the master is asked to write.
    console.log('[orchestrator.generatePlan] Polling for plan file (timeout: 180s)...')
    const got = await waitFor(async () => {
      const parsed = await window.studio.readOrchestratorPlan(projectId)
      if (!parsed) return false
      console.log('[orchestrator.generatePlan] Plan file found with', parsed.agents.length, 'agents')
      state.plan = parsed
      return true
    }, 180000, 2000)

    if (!got) {
      console.error('[orchestrator.generatePlan] Timed out waiting for plan file')
      state.error = 'plan-timeout'
      state.phase = 'idle'
      return
    }

    console.log('[orchestrator.generatePlan] Plan generation complete')
    if (autoExecute && subAgentType) {
      console.log('[orchestrator.generatePlan] Auto-execute enabled, starting execution...')
      await execute(idleMs, subAgentType)
    } else {
      console.log('[orchestrator.generatePlan] Plan ready for review')
      state.phase = 'review'
    }
  }

  async function execute(idleMs: number, subAgentType: AgentConfig): Promise<void> {
    const studio = useStudioStore()
    const project = studio.activeProject
    const projectId = project?.id
    if (!projectId) return

    const state = ensureState(projectId)
    if (!state.plan) return

    console.log('[orchestrator.execute] Starting execution of plan with', state.plan.agents.length, 'agents')
    state.phase = 'running'
    state.error = ''
    state.nodeAgentIds = {}

    // Create and start one real sub-agent per plan node using the plan's type.
    // The selected subAgentType remains a fallback for custom/unknown plan types.
    const created: { key: string; agentId: string }[] = []
    for (const node of state.plan.agents) {
      console.log(`[orchestrator.execute] Creating agent for node: ${node.key} (${node.role})`)
      const config = agentTypes.value.find((item) => item.id === node.type) ?? subAgentType
      const agent = await studio.createAgentForProject(projectId, config, node.role)
      if (agent) {
        state.nodeAgentIds[node.key] = agent.id
        created.push({ key: node.key, agentId: agent.id })
        console.log(`[orchestrator.execute] Created agent ${agent.id} for node ${node.key}`)
        startAgentPty(agent, project.path, config)
      }
    }

    if (created.length !== state.plan.agents.length) {
      console.error('[orchestrator.execute] Failed to create all sub-agents')
      state.error = 'no-project'
      state.phase = 'review'
      return
    }

    // Wait for every sub-agent terminal to come up.
    console.log('[orchestrator.execute] Waiting for all sub-agent terminals to be ready...')
    await waitFor(
      async () => {
        const checks = await Promise.all(created.map((c) => window.studio.isPtyRunning(c.agentId)))
        return checks.every(Boolean)
      },
      30000
    )
    console.log('[orchestrator.execute] All sub-agent terminals are ready')

    const nodes: OrchestratorRunNode[] = state.plan.agents.map((node) => ({
      key: node.key,
      agentId: state.nodeAgentIds[node.key],
      task: node.task,
      dependsOn: node.dependsOn ?? []
    }))

    console.log('[orchestrator.execute] Running orchestrator DAG scheduler')
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
