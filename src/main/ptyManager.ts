import * as pty from '@lydell/node-pty'
import { platform } from 'os'
import type { WebContents } from 'electron'
import { AGENT_COMMANDS, buildAgentArgs, type PtyStartInput } from '../shared/types'

interface Session {
  proc: pty.IPty
  agentId: string
  /** Epoch ms of the most recent output chunk — used for idle detection. */
  lastDataAt: number
  /** When true, output chunks are buffered for the task engine to read. */
  capturing: boolean
  captureChunks: string[]
}

/** Strip ANSI escape / control sequences so captured output reads cleanly. */
// eslint-disable-next-line no-control-regex
const CSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]/g
// eslint-disable-next-line no-control-regex
const OSC_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
// eslint-disable-next-line no-control-regex
const OTHER_ESC = /\x1b[@-Z\\-_]/g

function stripAnsi(text: string): string {
  return text
    .replace(OSC_PATTERN, '')
    .replace(CSI_PATTERN, '')
    .replace(OTHER_ESC, '')
    .replace(/\r/g, '')
}

/** Cap on buffered capture characters to avoid unbounded memory growth. */
const CAPTURE_LIMIT = 100_000

/**
 * Owns every live PTY. Each agent gets one PTY running its CLI in the
 * project directory. Output is streamed to the renderer over IPC events.
 */
class PtyManager {
  private sessions = new Map<string, Session>()

  start(input: PtyStartInput, sender: WebContents): void {
    // Restarting an existing agent: kill the old session first.
    this.kill(input.agentId)

    const command = input.launchCommand?.trim() || AGENT_COMMANDS[input.type]?.command || input.type
    const args = buildAgentArgs(
      input.type,
      {
        model: input.model,
        reasoningEffort: input.reasoningEffort,
        serviceTier: input.serviceTier,
        resumeSessionId: input.resumeSessionId
      },
      command
    )
    const isWin = platform() === 'win32'
    // On Windows the bare command often needs the shell to resolve PATH/.cmd
    // shims that npm-installed CLIs use, so launch through the shell.
    const shell = isWin ? 'powershell.exe' : (process.env.SHELL || 'bash')
    const fullArgs = [command, ...args].join(' ')
    const shellArgs = isWin
      ? ['-NoLogo', '-NoProfile', '-Command', fullArgs]
      : ['-lc', fullArgs]

    console.log(`[ptyManager.start] Spawning PTY for agent ${input.agentId}`)
    console.log(`[ptyManager.start] Shell: ${shell}`)
    console.log(`[ptyManager.start] Shell args:`, shellArgs)
    console.log(`[ptyManager.start] CWD: ${input.cwd}`)

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
      console.error('[ptyManager.start] PTY spawn failed:', err)
      sender.send('pty:exit', { agentId: input.agentId, exitCode: -1 })
      sender.send('agent:status', { agentId: input.agentId, status: 'error' })
      console.error('[pty] spawn failed:', err)
      return
    }

    const session: Session = {
      proc,
      agentId: input.agentId,
      lastDataAt: Date.now(),
      capturing: false,
      captureChunks: []
    }
    this.sessions.set(input.agentId, session)
    sender.send('agent:status', { agentId: input.agentId, status: 'running' })
    console.log(`[ptyManager] PTY started for agent ${input.agentId}, command: ${command} ${args.join(' ')}`)

    proc.onData((data) => {
      // Ignore trailing output from a proc that has already been superseded by
      // a resume/restart under the same agentId.
      if (this.sessions.get(input.agentId) !== session) return
      session.lastDataAt = Date.now()
      if (session.capturing) {
        session.captureChunks.push(data)
        // Keep only the most recent chunks once the buffer grows too large.
        let total = session.captureChunks.reduce((n, c) => n + c.length, 0)
        while (total > CAPTURE_LIMIT && session.captureChunks.length > 1) {
          total -= session.captureChunks.shift()!.length
        }
      }
      sender.send('pty:data', { agentId: input.agentId, data })
    })

    proc.onExit(({ exitCode }) => {
      // A resume/restart kills the previous proc and immediately spawns a new
      // one under the same agentId. The old proc's exit fires asynchronously —
      // only tear down the map entry / notify the renderer if THIS session is
      // still the active one, otherwise we'd evict the freshly-started session
      // and its terminal would stop accepting input.
      if (this.sessions.get(input.agentId) !== session) return
      this.sessions.delete(input.agentId)
      sender.send('pty:exit', { agentId: input.agentId, exitCode })
      sender.send('agent:status', {
        agentId: input.agentId,
        status: exitCode === 0 ? 'idle' : 'error'
      })
    })
  }

  write(agentId: string, data: string): void {
    const session = this.sessions.get(agentId)
    if (!session) {
      console.log(`[ptyManager.write] Session not found for agent: ${agentId}`)
      return
    }
    console.log(`[ptyManager.write] Writing ${data.length} bytes to agent ${agentId}`)
    console.log(`[ptyManager.write] Data preview:`, data.substring(0, 100))
    try {
      session.proc.write(data)
      console.log(`[ptyManager.write] Write succeeded for agent ${agentId}`)
    } catch (err) {
      console.error(`[ptyManager.write] Write failed for agent ${agentId}:`, err)
    }
  }

  /**
   * Write `data` after the agent's terminal has gone quiet for `idleMs`, which
   * indicates its CLI has likely finished booting and is ready for input. Falls
   * back to writing anyway after `timeoutMs`. Resolves false if the session
   * never existed.
   *
   * For CLI startup that generates initial output, use smaller idleMs (e.g. 800ms)
   * and smaller timeoutMs (e.g. 8000ms) to detect readiness faster.
   */
  sendWhenIdle(
    agentId: string,
    data: string,
    idleMs = 800,
    timeoutMs = 8000
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const session = this.sessions.get(agentId)
      if (!session) {
        console.log(`[ptyManager.sendWhenIdle] Session not found for agent: ${agentId}`)
        return resolve(false)
      }

      console.log(`[ptyManager.sendWhenIdle] Starting for agent ${agentId}, idleMs=${idleMs}, timeoutMs=${timeoutMs}`)
      const startedAt = Date.now()
      let lastIdleCheck = Date.now()

      const timer = setInterval(() => {
        const s = this.sessions.get(agentId)
        if (!s) {
          console.log(`[ptyManager.sendWhenIdle] Session lost for agent ${agentId}`)
          clearInterval(timer)
          return resolve(false)
        }

        const timeSinceStart = Date.now() - startedAt
        const timeSinceLastData = Date.now() - s.lastDataAt
        const idle = timeSinceLastData >= idleMs
        const timedOut = timeSinceStart >= timeoutMs

        // Ready to send if: idle has been detected and we've waited min time,
        // or timeout reached. Check idle continuously to catch the moment it happens.
        if ((idle && timeSinceStart >= Math.min(idleMs * 1.5, 1000)) || timedOut) {
          clearInterval(timer)
          const reason = timedOut ? 'timeout' : 'idle'
          console.log(`[ptyManager.sendWhenIdle] Ready to send to ${agentId} (reason: ${reason}, elapsed: ${timeSinceStart}ms, lastDataDelay: ${timeSinceLastData}ms)`)
          console.log(`[ptyManager.sendWhenIdle] Data to write (${data.length} bytes):`, JSON.stringify(data.substring(0, 150)))
          try {
            // For long prompts, write in chunks with delays to avoid buffer overflow
            if (data.length > 500) {
              console.log(`[ptyManager.sendWhenIdle] Long prompt detected (${data.length} bytes), sending in chunks...`)
              const chunks = data.match(/[\s\S]{1,200}/g) || []
              let chunkIndex = 0
              const sendChunk = (): void => {
                if (chunkIndex < chunks.length) {
                  const chunk = chunks[chunkIndex]
                  console.log(`[ptyManager.sendWhenIdle] Sending chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} bytes)`)
                  s.proc.write(chunk)
                  chunkIndex++
                  setTimeout(sendChunk, 50)
                } else {
                  console.log(`[ptyManager.sendWhenIdle] All chunks sent successfully to ${agentId}`)
                  resolve(true)
                }
              }
              sendChunk()
            } else {
              s.proc.write(data)
              console.log(`[ptyManager.sendWhenIdle] Prompt sent successfully to ${agentId}`)
              resolve(true)
            }
          } catch (err) {
            console.error(`[ptyManager.sendWhenIdle] Failed to write to ${agentId}:`, err)
            resolve(false)
          }
        }
      }, 100)
    })
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

  // ---- Output capture (used by the task engine for step hand-off) ----

  /** Start buffering this agent's output from now on. */
  beginCapture(agentId: string): void {
    const session = this.sessions.get(agentId)
    if (!session) return
    session.capturing = true
    session.captureChunks = []
    session.lastDataAt = Date.now()
  }

  /** Return the captured output so far, stripped of ANSI sequences. */
  readCapture(agentId: string): string {
    const session = this.sessions.get(agentId)
    if (!session) return ''
    return stripAnsi(session.captureChunks.join('')).trim()
  }

  /** Stop buffering and drop the buffer. */
  endCapture(agentId: string): void {
    const session = this.sessions.get(agentId)
    if (!session) return
    session.capturing = false
    session.captureChunks = []
  }

  /** Epoch ms of this agent's most recent output, or undefined if not running. */
  lastDataAt(agentId: string): number | undefined {
    return this.sessions.get(agentId)?.lastDataAt
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id)
  }
}

export const ptyManager = new PtyManager()
