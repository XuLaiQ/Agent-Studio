import { clipboard, contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  Project,
  Agent,
  FileNode,
  CreateAgentInput,
  PtyStartInput,
  PtyDataEvent,
  PtyExitEvent,
  AgentStatus
} from '../shared/types'

const api = {
  // Projects
  listProjects: (): Promise<Project[]> => ipcRenderer.invoke('project:list'),
  importProject: (): Promise<Project | null> => ipcRenderer.invoke('project:import'),
  removeProject: (id: string): Promise<Project[]> => ipcRenderer.invoke('project:remove', id),

  // Agents
  createAgent: (input: CreateAgentInput): Promise<Agent> =>
    ipcRenderer.invoke('agent:create', input),
  removeAgent: (projectId: string, agentId: string): Promise<Project[]> =>
    ipcRenderer.invoke('agent:remove', projectId, agentId),

  // File tree
  readDir: (dirPath: string): Promise<FileNode[]> => ipcRenderer.invoke('fs:readdir', dirPath),

  // Clipboard
  readClipboardText: (): string => clipboard.readText(),
  writeClipboardText: (text: string): void => clipboard.writeText(text),

  // PTY control
  startPty: (input: PtyStartInput): void => ipcRenderer.send('pty:start', input),
  writePty: (agentId: string, data: string): void => ipcRenderer.send('pty:write', agentId, data),
  resizePty: (agentId: string, cols: number, rows: number): void =>
    ipcRenderer.send('pty:resize', agentId, cols, rows),
  killPty: (agentId: string): void => ipcRenderer.send('pty:kill', agentId),
  isPtyRunning: (agentId: string): Promise<boolean> => ipcRenderer.invoke('pty:isRunning', agentId),

  // PTY / status events. Each returns an unsubscribe function.
  onPtyData: (cb: (e: PtyDataEvent) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, payload: PtyDataEvent): void => cb(payload)
    ipcRenderer.on('pty:data', handler)
    return () => ipcRenderer.removeListener('pty:data', handler)
  },
  onPtyExit: (cb: (e: PtyExitEvent) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, payload: PtyExitEvent): void => cb(payload)
    ipcRenderer.on('pty:exit', handler)
    return () => ipcRenderer.removeListener('pty:exit', handler)
  },
  onAgentStatus: (cb: (e: { agentId: string; status: AgentStatus }) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, payload: { agentId: string; status: AgentStatus }): void =>
      cb(payload)
    ipcRenderer.on('agent:status', handler)
    return () => ipcRenderer.removeListener('agent:status', handler)
  }
}

export type StudioApi = typeof api

contextBridge.exposeInMainWorld('studio', api)
