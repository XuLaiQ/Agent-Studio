import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useVersionControlStore } from './versionControl'
import type { Project, Agent, AgentConfig, AgentStatus } from '@shared/types'

export type AgentRuntimeState = 'stopped' | 'ready' | 'busy' | 'error'

export interface AgentRuntimeSummary {
  agent: Agent
  state: AgentRuntimeState
}

export interface ProjectRuntimeSummary {
  total: number
  busy: number
  ready: number
  stopped: number
  error: number
  agents: AgentRuntimeSummary[]
}

const BUSY_WINDOW_MS = 8000

export const useStudioStore = defineStore('studio', () => {
  const versionControlStore = useVersionControlStore()
  const projects = ref<Project[]>([])
  const activeProjectId = ref<string | null>(null)
  /** Currently-focused agent (tab) per project. */
  const activeAgentId = ref<string | null>(null)
  /** Live runtime status, keyed by agent id (overrides persisted 'idle'). */
  const statusMap = ref<Record<string, AgentStatus>>({})
  /** Last terminal output timestamp, keyed by agent id. */
  const lastOutputAtMap = ref<Record<string, number>>({})
  const runtimeNow = ref(Date.now())

  const activeProject = computed(
    () => projects.value.find((p) => p.id === activeProjectId.value) ?? null
  )

  const agents = computed(() => activeProject.value?.agents ?? [])

  const activeAgent = computed(
    () => agents.value.find((a) => a.id === activeAgentId.value) ?? null
  )

  function statusOf(agentId: string): AgentStatus {
    return statusMap.value[agentId] ?? 'idle'
  }

  function runtimeOf(agentId: string): AgentRuntimeState {
    const status = statusOf(agentId)
    if (status === 'error') return 'error'
    if (status !== 'running') return 'stopped'
    const lastOutputAt = lastOutputAtMap.value[agentId] ?? 0
    return runtimeNow.value - lastOutputAt <= BUSY_WINDOW_MS ? 'busy' : 'ready'
  }

  function projectRuntimeSummary(projectId: string): ProjectRuntimeSummary {
    const project = projects.value.find((p) => p.id === projectId)
    const agents = (project?.agents ?? []).map((agent) => ({
      agent,
      state: runtimeOf(agent.id)
    }))
    return agents.reduce<ProjectRuntimeSummary>(
      (summary, item) => {
        summary.agents.push(item)
        summary[item.state] += 1
        return summary
      },
      {
        total: agents.length,
        busy: 0,
        ready: 0,
        stopped: 0,
        error: 0,
        agents: []
      }
    )
  }

  async function loadProjects(): Promise<void> {
    projects.value = await window.studio.listProjects()
    if (!activeProjectId.value && projects.value.length) {
      selectProject(projects.value[0].id)
    }
    await versionControlStore.scan()
  }

  async function importProject(): Promise<void> {
    const project = await window.studio.importProject()
    if (project) {
      await loadProjects()
      selectProject(project.id)
    }
  }

  async function removeProject(id: string): Promise<void> {
    projects.value = await window.studio.removeProject(id)
    if (activeProjectId.value === id) {
      activeProjectId.value = projects.value[0]?.id ?? null
      activeAgentId.value = activeProject.value?.agents[0]?.id ?? null
    }
    await versionControlStore.scan()
  }

  async function removeAllProjects(): Promise<void> {
    for (const id of projects.value.map((p) => p.id)) {
      projects.value = await window.studio.removeProject(id)
    }
    activeProjectId.value = projects.value[0]?.id ?? null
    activeAgentId.value = activeProject.value?.agents[0]?.id ?? null
    await versionControlStore.scan()
  }

  function selectProject(id: string): void {
    activeProjectId.value = id
    const proj = projects.value.find((p) => p.id === id)
    activeAgentId.value = proj?.agents[0]?.id ?? null
  }

  async function createAgentForProject(
    projectId: string,
    config: AgentConfig,
    name?: string
  ): Promise<Agent | null> {
    const project = projects.value.find((p) => p.id === projectId)
    if (!project) return null
    const agent = await window.studio.createAgent({
      projectId,
      type: config.id,
      label: config.name,
      command: config.command,
      name
    })
    project.agents.push(agent)
    if (activeProjectId.value === projectId) activeAgentId.value = agent.id
    return agent
  }

  async function createAgent(config: AgentConfig, name?: string): Promise<Agent | null> {
    if (!activeProjectId.value) return null
    return createAgentForProject(activeProjectId.value, config, name)
  }

  async function removeAgent(agent: Agent): Promise<void> {
    projects.value = await window.studio.removeAgent(agent.projectId, agent.id)
    delete statusMap.value[agent.id]
    delete lastOutputAtMap.value[agent.id]
    if (activeAgentId.value === agent.id) {
      activeAgentId.value = activeProject.value?.agents[0]?.id ?? null
    }
  }

  function selectAgent(id: string): void {
    activeAgentId.value = id
  }

  function setStatus(agentId: string, status: AgentStatus): void {
    statusMap.value[agentId] = status
  }

  // Keep the runtime status map in sync with main-process events.
  window.studio.onAgentStatus(({ agentId, status }) => setStatus(agentId, status))
  window.studio.onPtyData(({ agentId }) => {
    lastOutputAtMap.value[agentId] = Date.now()
  })
  setInterval(() => {
    runtimeNow.value = Date.now()
  }, 1000)

  return {
    projects,
    activeProjectId,
    activeAgentId,
    statusMap,
    lastOutputAtMap,
    activeProject,
    agents,
    activeAgent,
    statusOf,
    runtimeOf,
    projectRuntimeSummary,
    loadProjects,
    importProject,
    removeProject,
    removeAllProjects,
    selectProject,
    createAgentForProject,
    createAgent,
    removeAgent,
    selectAgent,
    setStatus
  }
})
