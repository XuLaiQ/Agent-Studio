import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import type {
  Project,
  Agent,
  CreateAgentInput,
  CreateVersionConnectionInput,
  VersionConnection,
  Workflow,
  CreateWorkflowInput,
  UpdateWorkflowInput
} from '../shared/types'
import { AGENT_COMMANDS } from '../shared/types'
import { randomUUID } from 'crypto'

interface StoreData {
  projects: Project[]
  versionConnections: VersionConnection[]
  workflows: Workflow[]
}

/**
 * Tiny JSON-file backed store for projects/agents.
 * The plan calls for SQLite in phase 3; for the MVP a single JSON file in
 * the app's userData directory is enough and dependency-free.
 */
class Store {
  private file: string
  private data: StoreData = { projects: [], versionConnections: [], workflows: [] }

  constructor() {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'agent-studio.json')
    this.load()
  }

  private load(): void {
    try {
      if (existsSync(this.file)) {
        this.data = JSON.parse(readFileSync(this.file, 'utf-8'))
      }
    } catch (err) {
      console.error('[store] failed to load, starting fresh:', err)
      this.data = { projects: [], versionConnections: [], workflows: [] }
    }
    if (!Array.isArray(this.data.projects)) this.data.projects = []
    if (!Array.isArray(this.data.versionConnections)) this.data.versionConnections = []
    if (!Array.isArray(this.data.workflows)) this.data.workflows = []
  }

  private persist(): void {
    // Agents always start a session as 'idle'; runtime status is not persisted.
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  getProjects(): Project[] {
    return this.data.projects
  }

  addProject(name: string, path: string): Project {
    const existing = this.data.projects.find((p) => p.path === path)
    if (existing) return existing
    const project: Project = {
      id: randomUUID(),
      name,
      path,
      agents: [],
      createTime: Date.now()
    }
    this.data.projects.push(project)
    this.persist()
    return project
  }

  removeProject(id: string): void {
    this.data.projects = this.data.projects.filter((p) => p.id !== id)
    this.persist()
  }

  private findProject(id: string): Project | undefined {
    return this.data.projects.find((p) => p.id === id)
  }

  addAgent(input: CreateAgentInput): Agent {
    const project = this.findProject(input.projectId)
    if (!project) throw new Error(`Project not found: ${input.projectId}`)
    const id = randomUUID()
    const count = project.agents.filter((a) => a.type === input.type).length
    const builtin = AGENT_COMMANDS[input.type]
    const label = input.label?.trim() || builtin?.label || input.type
    const command = input.command?.trim() || builtin?.command || input.type
    const agent: Agent = {
      id,
      projectId: project.id,
      name: input.name?.trim() || (count > 0 ? `${label} ${count + 1}` : label),
      type: input.type,
      typeLabel: label,
      launchCommand: command,
      status: 'idle',
      terminalId: id
    }
    project.agents.push(agent)
    this.persist()
    return agent
  }

  removeAgent(projectId: string, agentId: string): void {
    const project = this.findProject(projectId)
    if (!project) return
    project.agents = project.agents.filter((a) => a.id !== agentId)
    this.persist()
  }

  getAgent(projectId: string, agentId: string): Agent | undefined {
    return this.findProject(projectId)?.agents.find((a) => a.id === agentId)
  }

  getProjectAgents(projectId: string): Agent[] {
    return this.findProject(projectId)?.agents ?? []
  }

  getVersionConnections(): VersionConnection[] {
    return this.data.versionConnections
  }

  addVersionConnection(input: CreateVersionConnectionInput): VersionConnection {
    const connection: VersionConnection = {
      id: randomUUID(),
      name: input.name.trim(),
      provider: input.provider,
      url: input.url.trim(),
      createTime: Date.now()
    }
    this.data.versionConnections.push(connection)
    this.persist()
    return connection
  }

  removeVersionConnection(id: string): void {
    this.data.versionConnections = this.data.versionConnections.filter((c) => c.id !== id)
    this.persist()
  }

  getWorkflows(projectId?: string): Workflow[] {
    return projectId
      ? this.data.workflows.filter((w) => w.projectId === projectId)
      : this.data.workflows
  }

  getWorkflow(id: string): Workflow | undefined {
    return this.data.workflows.find((w) => w.id === id)
  }

  addWorkflow(input: CreateWorkflowInput): Workflow {
    const workflow: Workflow = {
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name.trim(),
      steps: input.steps.map((s) => ({
        id: randomUUID(),
        agentId: s.agentId,
        prompt: s.prompt
      })),
      createTime: Date.now()
    }
    this.data.workflows.push(workflow)
    this.persist()
    return workflow
  }

  updateWorkflow(input: UpdateWorkflowInput): Workflow | undefined {
    const workflow = this.data.workflows.find((w) => w.id === input.id)
    if (!workflow) return undefined
    workflow.name = input.name.trim()
    workflow.steps = input.steps.map((s) => ({
      id: randomUUID(),
      agentId: s.agentId,
      prompt: s.prompt
    }))
    this.persist()
    return workflow
  }

  removeWorkflow(id: string): void {
    this.data.workflows = this.data.workflows.filter((w) => w.id !== id)
    this.persist()
  }
}

export const store = new Store()
