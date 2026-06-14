import * as pty from '@lydell/node-pty'
import { platform } from 'os'
import type { WebContents } from 'electron'
import { AGENT_COMMANDS, type PtyStartInput } from '../shared/types'

interface Session {
  proc: pty.IPty
  agentId: string
}

/**
 * Owns every live PTY. Each agent gets one PTY running its CLI in the
 * project directory. Output is streamed to the renderer over IPC events.
 */
class PtyManager {
  private sessions = new Map<string, Session>()

  start(input: PtyStartInput, sender: WebContents): void {
    // Restarting an existing agent: kill the old session first.
    this.kill(input.agentId)

    const { command, args } = AGENT_COMMANDS[input.type]
    const isWin = platform() === 'win32'
    // On Windows the bare command often needs the shell to resolve PATH/.cmd
    // shims that npm-installed CLIs use, so launch through the shell.
    const shell = isWin ? 'powershell.exe' : (process.env.SHELL || 'bash')
    const fullArgs = [command, ...args].join(' ')
    const shellArgs = isWin
      ? ['-NoLogo', '-NoProfile', '-Command', fullArgs]
      : ['-lc', fullArgs]

    let proc: pty.IPty
    try {
      proc = pty.spawn(shell, shellArgs, {
        name: 'xterm-color',
        cols: input.cols || 80,
        rows: input.rows || 24,
        cwd: input.cwd,
        env: { ...process.env } as Record<string, string>
      })
    } catch (err) {
      sender.send('pty:exit', { agentId: input.agentId, exitCode: -1 })
      sender.send('agent:status', { agentId: input.agentId, status: 'error' })
      console.error('[pty] spawn failed:', err)
      return
    }

    this.sessions.set(input.agentId, { proc, agentId: input.agentId })
    sender.send('agent:status', { agentId: input.agentId, status: 'running' })

    proc.onData((data) => {
      sender.send('pty:data', { agentId: input.agentId, data })
    })

    proc.onExit(({ exitCode }) => {
      this.sessions.delete(input.agentId)
      sender.send('pty:exit', { agentId: input.agentId, exitCode })
      sender.send('agent:status', {
        agentId: input.agentId,
        status: exitCode === 0 ? 'idle' : 'error'
      })
    })
  }

  write(agentId: string, data: string): void {
    this.sessions.get(agentId)?.proc.write(data)
  }

  resize(agentId: string, cols: number, rows: number): void {
    try {
      this.sessions.get(agentId)?.proc.resize(cols, rows)
    } catch {
      /* resizing a dead pty throws — ignore */
    }
  }

  kill(agentId: string): void {
    const session = this.sessions.get(agentId)
    if (session) {
      try {
        session.proc.kill()
      } catch {
        /* already gone */
      }
      this.sessions.delete(agentId)
    }
  }

  isRunning(agentId: string): boolean {
    return this.sessions.has(agentId)
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id)
  }
}

export const ptyManager = new PtyManager()
