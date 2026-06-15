import { ipcMain, dialog, BrowserWindow } from 'electron'
import { basename } from 'path'
import { store } from './store'
import { ptyManager } from './ptyManager'
import { readDir } from './fileTree'
import {
  commit,
  scanVersionControl,
  stageAll,
  stageFile,
  unstageAll,
  unstageFile
} from './versionControl'
import type {
  CreateAgentInput,
  CreateVersionConnectionInput,
  PtyStartInput,
  VersionCommitInput,
  VersionFileInput,
  VersionProjectInput
} from '../shared/types'

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

  // ---- Agents ----
  ipcMain.handle('agent:create', (_e, input: CreateAgentInput) => store.addAgent(input))

  ipcMain.handle('agent:remove', (_e, projectId: string, agentId: string) => {
    ptyManager.kill(agentId)
    store.removeAgent(projectId, agentId)
    return store.getProjects()
  })

  // ---- File tree ----
  ipcMain.handle('fs:readdir', (_e, dirPath: string) => readDir(dirPath))

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
  ipcMain.handle('version:stageFile', (_e, input: VersionFileInput) => stageFile(input))
  ipcMain.handle('version:unstageFile', (_e, input: VersionFileInput) => unstageFile(input))
  ipcMain.handle('version:stageAll', (_e, input: VersionProjectInput) => stageAll(input))
  ipcMain.handle('version:unstageAll', (_e, input: VersionProjectInput) => unstageAll(input))
  ipcMain.handle('version:commit', (_e, input: VersionCommitInput) => commit(input))

  // ---- PTY / terminal ----
  ipcMain.on('pty:start', (event, input: PtyStartInput) => {
    ptyManager.start(input, event.sender)
  })

  ipcMain.on('pty:write', (_e, agentId: string, data: string) => {
    ptyManager.write(agentId, data)
  })

  ipcMain.on('pty:resize', (_e, agentId: string, cols: number, rows: number) => {
    ptyManager.resize(agentId, cols, rows)
  })

  ipcMain.on('pty:kill', (_e, agentId: string) => {
    ptyManager.kill(agentId)
  })

  ipcMain.handle('pty:isRunning', (_e, agentId: string) => ptyManager.isRunning(agentId))
}
