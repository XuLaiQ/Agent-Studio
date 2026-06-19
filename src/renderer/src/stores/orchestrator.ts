import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  buildPlannerPrompt,
  type AgentType,
  type OrchestrationPlan,
  type OrchestratorEvent,
  type OrchestratorRunNode
} from '@shared/types'
import { useStudioStore } from './studio'

type Phase = 'idle' | 'planning' | 'review' | 'running' | 'done'

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
  const goal = ref('')
  const phase = ref<Phase>('idle')
  const plan = ref<OrchestrationPlan | null>(null)
  const run = ref<OrchestratorEvent | null>(null)
  const error = ref('')
  /** Maps plan node key -> the real sub-agent id created for it. */
  const nodeAgentIds = ref<Record<string, string>>({})
  let masterAgentId: string | null = null

  function reset(): void {
    phase.value = 'idle'
    plan.value = null
    run.value = null
    error.value = ''
    nodeAgentIds.value = {}
    masterAgentId = null
  }

  async function generatePlan(masterType: AgentType): Promise<void> {
    const studio = useStudioStore()
    const project = studio.activeProject
    const text = goal.value.trim()
    if (!project || !text) return

    phase.value = 'planning'
    plan.value = null
    run.value = null
    error.value = ''

    const master = await studio.createAgent(masterType, '主代理')
    if (!master) {
      error.value = 'no-project'
      phase.value = 'idle'
      return
    }
    masterAgentId = master.id

    // Wait for the master's terminal to come up, then hand it the planning prompt
    // once its CLI has finished booting (output settled) so input isn't lost.
    const ready = await waitFor(() => window.studio.isPtyRunning(master.id), 20000)
    if (!ready) {
      error.value = 'master-not-running'
      phase.value = 'idle'
      return
    }
    await window.studio.sendPtyWhenIdle(master.id, `${buildPlannerPrompt(text)}\r`)

    // Poll the project for the plan file the master is asked to write.
    const got = await waitFor(async () => {
      const parsed = await window.studio.readOrchestratorPlan(project.id)
      if (!parsed) return false
      plan.value = parsed
      return true
    }, 180000, 2000)

    if (!got) {
      error.value = 'plan-timeout'
      phase.value = 'idle'
      return
    }
    phase.value = 'review'
  }

  async function execute(idleMs: number, subAgentType: AgentType): Promise<void> {
    const studio = useStudioStore()
    const project = studio.activeProject
    if (!project || !plan.value) return

    phase.value = 'running'
    error.value = ''
    nodeAgentIds.value = {}

    // Create one real sub-agent per plan node, all using the chosen CLI type.
    const created: { key: string; agentId: string }[] = []
    for (const node of plan.value.agents) {
      const agent = await studio.createAgent(subAgentType, node.role)
      if (agent) {
        nodeAgentIds.value[node.key] = agent.id
        created.push({ key: node.key, agentId: agent.id })
      }
    }

    // Wait for every sub-agent terminal to come up.
    await waitFor(
      async () => {
        const checks = await Promise.all(
          created.map((c) => window.studio.isPtyRunning(c.agentId))
        )
        return checks.every(Boolean)
      },
      30000
    )

    const nodes: OrchestratorRunNode[] = plan.value.agents.map((node) => ({
      key: node.key,
      agentId: nodeAgentIds.value[node.key],
      task: node.task,
      dependsOn: node.dependsOn ?? []
    }))

    await window.studio.runOrchestrator({ projectId: project.id, idleMs, nodes })
  }

  function stop(): void {
    if (run.value) window.studio.stopOrchestrator(run.value.runId)
  }

  function retryNode(key: string): void {
    if (run.value) window.studio.retryOrchestratorNode(run.value.runId, key)
  }

  // Keep run snapshots in sync with the main process (filter to active project).
  window.studio.onOrchestratorEvent((event) => {
    const studio = useStudioStore()
    if (event.projectId !== studio.activeProjectId) return
    run.value = event
    if (event.status !== 'running') phase.value = 'done'
  })

  return {
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
