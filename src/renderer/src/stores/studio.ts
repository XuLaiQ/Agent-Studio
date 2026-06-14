import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Project, Agent, AgentType, AgentStatus } from '@shared/types'

export const useStudioStore = defineStore('studio', () => {
  const projects = ref<Project[]>([])
  const activeProjectId = ref<string | null>(null)
  /** Currently-focused agent (tab) per project. */
  const activeAgentId = ref<string | null>(null)
  /** Live runtime status, keyed by agent id (overrides persisted 'idle'). */
  const statusMap = ref<Record<string, AgentStatus>>({})

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

  async function loadProjects(): Promise<void> {
    projects.value = await window.studio.listProjects()
    if (!activeProjectId.value && projects.value.length) {
      selectProject(projects.value[0].id)
    }
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
  }

  function selectProject(id: string): void {
    activeProjectId.value = id
    const proj = projects.value.find((p) => p.id === id)
    activeAgentId.value = proj?.agents[0]?.id ?? null
  }

  async function createAgent(type: AgentType, name?: string): Promise<void> {
    if (!activeProjectId.value) return
    const agent = await window.studio.createAgent({
      projectId: activeProjectId.value,
      type,
      name
    })
    activeProject.value?.agents.push(agent)
    activeAgentId.value = agent.id
  }

  async function removeAgent(agent: Agent): Promise<void> {
    projects.value = await window.studio.removeAgent(agent.projectId, agent.id)
    delete statusMap.value[agent.id]
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

  return {
    projects,
    activeProjectId,
    activeAgentId,
    statusMap,
    activeProject,
    agents,
    activeAgent,
    statusOf,
    loadProjects,
    importProject,
    removeProject,
    selectProject,
    createAgent,
    removeAgent,
    selectAgent,
    setStatus
  }
})
