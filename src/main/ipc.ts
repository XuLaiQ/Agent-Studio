import { ipcMain, dialog, BrowserWindow, shell, webContents } from 'electron'
import { watch, existsSync, readFileSync, type FSWatcher } from 'fs'
import { basename, resolve, join } from 'path'
import { store } from './store'
import { ptyManager } from './ptyManager'
import { agentBus } from './agentBus'
import { taskEngine } from './taskEngine'
import { orchestrator } from './orchestrator'
import { listSessions } from './sessionHistory'
import { collectTokenUsage } from './tokenStats'
import {
  createFileSystemEntry,
  deleteFileSystemEntry,
  readDir,
  readFilePreview,
  writeTextFile
} from './fileTree'
import {
  checkoutBranch,
  commit,
  commitFiles,
  createBranch,
  diffFile,
  fetchProject,
  pullProject,
  pushProject,
  scanVersionControl,
  stageAll,
  stageFile,
  unstageAll,
  unstageFile
} from './versionControl'
import type {
  CreateAgentInput,
  FileChangeEvent,
  FileCreateInput,
  FileDeleteInput,
  FilePreviewInput,
  FileWatchResult,
  FileWriteInput,
  CreateVersionConnectionInput,
  BusSendInput,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  StartWorkflowInput,
  OrchestratorRunInput,
  OrchestrationPlan,
  PtyStartInput,
  SessionListInput,
  VersionBranchInput,
  VersionCommitInput,
  VersionCommitFilesInput,
  VersionCreateBranchInput,
  VersionFileDiffInput,
  VersionFileInput,
  VersionProjectInput
} from '../shared/types'
import { PLAN_FILE } from '../shared/types'

/** Read and parse the orchestration plan file the master agent writes, or null. */
function readOrchestrationPlan(projectId: string): OrchestrationPlan | null {
  const project = store.getProjects().find((p) => p.id === projectId)
  if (!project) return null
  const file = join(project.path, PLAN_FILE)
  if (!existsSync(file)) return null
  try {
    const raw = readFileSync(file, 'utf-8')
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    const data = JSON.parse(raw.slice(start, end + 1))
    if (!Array.isArray(data.agents) || !data.agents.length) return null
    return data as OrchestrationPlan
  } catch {
    return null
  }
}

const fileWatchers = new Map<
  string,
  {
    watcher: FSWatcher
    subscriberIds: Set<number>
  }
>()

function closeProjectWatcher(projectPath: string): void {
  const key = resolve(projectPath)
  const entry = fileWatchers.get(key)
  if (!entry) return

  entry.watcher.close()
  fileWatchers.delete(key)
}

function subscribeToProjectChanges(projectPath: string, senderId: number): FileWatchResult {
  const key = resolve(projectPath)
  const existing = fileWatchers.get(key)
  if (existing) {
    existing.subscriberIds.add(senderId)
    return { watching: true }
  }

  try {
    const subscriberIds = new Set([senderId])
    const watcher = watch(key, { recursive: true }, (eventType, filename) => {
      const payload: FileChangeEvent = {
        projectPath: key,
        eventType,
        filename: filename?.toString(),
        timestamp: Date.now()
      }

      for (const id of [...subscriberIds]) {
        const contents = webContents.fromId(id)
        if (!contents || contents.isDestroyed()) {
          subscriberIds.delete(id)
          continue
        }
        contents.send('fs:changed', payload)
      }

      if (subscriberIds.size === 0) closeProjectWatcher(key)
    })

    watcher.on('error', (error) => {
      console.error('[fileTree] watcher failed:', key, error)
      closeProjectWatcher(key)
    })

    fileWatchers.set(key, { watcher, subscriberIds })
    return { watching: true }
  } catch (err) {
    return { watching: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function unsubscribeFromProjectChanges(projectPath: string, senderId: number): FileWatchResult {
  const key = resolve(projectPath)
  const entry = fileWatchers.get(key)
  if (!entry) return { watching: false }

  entry.subscriberIds.delete(senderId)
  if (entry.subscriberIds.size === 0) closeProjectWatcher(key)
  return { watching: false }
}

export function registerIpc(): void {
  // ---- Projects ----
  ipcMain.handle('project:list', () => store.getProjects())

  ipcMain.handle('project:import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const dir = result.filePaths[0]
    return store.addProject(basename(dir), dir)
  })

  ipcMain.handle('project:remove', (_e, id: string) => {
    const project = store.getProjects().find((p) => p.id === id)
    project?.agents.forEach((a) => ptyManager.kill(a.id))
    store.removeProject(id)
    return store.getProjects()
  })

  ipcMain.handle('project:openPath', (_e, projectPath: string) => shell.openPath(projectPath))

  // Reveal a file or folder in the OS file manager (Explorer / Finder / etc.).
  ipcMain.handle('fs:revealInFolder', (_e, targetPath: string) => {
    shell.showItemInFolder(targetPath)
  })

  // ---- Agents ----
  ipcMain.handle('agent:create', (_e, input: CreateAgentInput) => store.addAgent(input))

  ipcMain.handle('agent:remove', (_e, projectId: string, agentId: string) => {
    ptyManager.kill(agentId)
    store.removeAgent(projectId, agentId)
    return store.getProjects()
  })

  // ---- File tree ----
  ipcMain.handle('fs:readdir', (_e, dirPath: string) => readDir(dirPath))
  ipcMain.handle('fs:preview', (_e, input: FilePreviewInput) => readFilePreview(input))
  ipcMain.handle('fs:create', (_e, input: FileCreateInput) => createFileSystemEntry(input))
  ipcMain.handle('fs:delete', (_e, input: FileDeleteInput) => deleteFileSystemEntry(input))
  ipcMain.handle('fs:writeFile', (_e, input: FileWriteInput) => writeTextFile(input))
  ipcMain.handle('fs:watchProject', (event, projectPath: string) =>
    subscribeToProjectChanges(projectPath, event.sender.id)
  )
  ipcMain.handle('fs:unwatchProject', (event, projectPath: string) =>
    unsubscribeFromProjectChanges(projectPath, event.sender.id)
  )

  // ---- Version control ----
  ipcMain.handle('version:scan', () => scanVersionControl())
  ipcMain.handle('version:connections', () => store.getVersionConnections())
  ipcMain.handle('version:addConnection', (_e, input: CreateVersionConnectionInput) =>
    store.addVersionConnection(input)
  )
  ipcMain.handle('version:removeConnection', (_e, id: string) => {
    store.removeVersionConnection(id)
    return store.getVersionConnections()
  })
  ipcMain.handle('version:fileDiff', (_e, input: VersionFileDiffInput) => diffFile(input))
  ipcMain.handle('version:commitFiles', (_e, input: VersionCommitFilesInput) => commitFiles(input))
  ipcMain.handle('version:stageFile', (_e, input: VersionFileInput) => stageFile(input))
  ipcMain.handle('version:unstageFile', (_e, input: VersionFileInput) => unstageFile(input))
  ipcMain.handle('version:stageAll', (_e, input: VersionProjectInput) => stageAll(input))
  ipcMain.handle('version:unstageAll', (_e, input: VersionProjectInput) => unstageAll(input))
  ipcMain.handle('version:commit', (_e, input: VersionCommitInput) => commit(input))
  ipcMain.handle('version:fetch', (_e, input: VersionProjectInput) => fetchProject(input))
  ipcMain.handle('version:pull', (_e, input: VersionProjectInput) => pullProject(input))
  ipcMain.handle('version:push', (_e, input: VersionProjectInput) => pushProject(input))
  ipcMain.handle('version:checkoutBranch', (_e, input: VersionBranchInput) =>
    checkoutBranch(input)
  )
  ipcMain.handle('version:createBranch', (_e, input: VersionCreateBranchInput) =>
    createBranch(input)
  )

  ipcMain.handle('tokens:stats', () => collectTokenUsage())

  // ---- PTY / terminal ----
  ipcMain.on('pty:start', (event, input: PtyStartInput) => {
    ptyManager.start(input, event.sender)
  })

  ipcMain.on('pty:write', (_e, agentId: string, data: string) => {
    ptyManager.write(agentId, data)
  })

  ipcMain.handle('pty:sendWhenIdle', (_e, agentId: string, data: string) =>
    ptyManager.sendWhenIdle(agentId, data)
  )

  ipcMain.on('pty:resize', (_e, agentId: string, cols: number, rows: number) => {
    ptyManager.resize(agentId, cols, rows)
  })

  ipcMain.on('pty:kill', (_e, agentId: string) => {
    ptyManager.kill(agentId)
  })

  ipcMain.handle('pty:isRunning', (_e, agentId: string) => ptyManager.isRunning(agentId))

  // ---- Conversation history ----
  ipcMain.handle('sessions:list', (_e, input: SessionListInput) =>
    listSessions(input.type, input.cwd)
  )

  // ---- Agent Bus ----
  ipcMain.handle('bus:send', (event, input: BusSendInput) =>
    agentBus.forward(input, event.sender)
  )

  // ---- Workflows (task collaboration) ----
  ipcMain.handle('workflow:list', (_e, projectId: string) => store.getWorkflows(projectId))
  ipcMain.handle('workflow:create', (_e, input: CreateWorkflowInput) => store.addWorkflow(input))
  ipcMain.handle('workflow:update', (_e, input: UpdateWorkflowInput) =>
    store.updateWorkflow(input)
  )
  ipcMain.handle('workflow:remove', (_e, id: string, projectId: string) => {
    store.removeWorkflow(id)
    return store.getWorkflows(projectId)
  })

  ipcMain.handle('task:start', (event, input: StartWorkflowInput) => {
    const workflow = store.getWorkflow(input.workflowId)
    if (!workflow) return null
    return taskEngine.start(workflow, workflow.projectId, input.idleMs ?? 0, event.sender)
  })
  ipcMain.on('task:advance', (_e, runId: string) => taskEngine.advance(runId))
  ipcMain.on('task:retry', (_e, runId: string) => taskEngine.retry(runId))
  ipcMain.on('task:stop', (_e, runId: string) => taskEngine.stop(runId))

  // ---- Orchestrator (master agent → dynamic sub-agents) ----
  ipcMain.handle('orchestrator:run', (event, input: OrchestratorRunInput) =>
    orchestrator.start(input, event.sender)
  )
  ipcMain.on('orchestrator:stop', (_e, runId: string) => orchestrator.stop(runId))
  ipcMain.on('orchestrator:retry', (_e, runId: string, key: string) =>
    orchestrator.retry(runId, key)
  )
  ipcMain.handle('orchestrator:readPlan', (_e, projectId: string) =>
    readOrchestrationPlan(projectId)
  )
}
