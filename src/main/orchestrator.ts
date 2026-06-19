import { randomUUID } from 'crypto'
import type { WebContents } from 'electron'
import { ptyManager } from './ptyManager'
import type {
  OrchestratorRunInput,
  OrchestratorEvent,
  OrchestratorRunStatus,
  OrchNodeStatus
} from '../shared/types'

const DEFAULT_IDLE_MS = 8000
const POLL_MS = 500

interface NodeState {
  key: string
  agentId: string
  task: string
  dependsOn: string[]
  status: OrchNodeStatus
  /** Captured terminal output, forwarded to dependent nodes. */
  output: string
  sawOutput: boolean
  startedAt: number
  poller: ReturnType<typeof setInterval> | null
}

interface RunState {
  runId: string
  projectId: string
  idleMs: number
  nodes: Map<string, NodeState>
  sender: WebContents
}

/**
 * Concurrent DAG scheduler. Sub-agents whose dependencies are all done run in
 * parallel; the rest wait. Each node injects its task (plus upstream outputs)
 * into its agent's terminal, then completes via idle detection — the same
 * mechanism the linear task engine uses, generalised to a dependency graph.
 */
class Orchestrator {
  private runs = new Map<string, RunState>()

  start(input: OrchestratorRunInput, sender: WebContents): string {
    const runId = randomUUID()
    const nodes = new Map<string, NodeState>()
    for (const n of input.nodes) {
      nodes.set(n.key, {
        key: n.key,
        agentId: n.agentId,
        task: n.task,
        dependsOn: n.dependsOn,
        status: n.dependsOn.length ? 'blocked' : 'pending',
        output: '',
        sawOutput: false,
        startedAt: 0,
        poller: null
      })
    }

    const run: RunState = {
      runId,
      projectId: input.projectId,
      idleMs: input.idleMs && input.idleMs > 0 ? input.idleMs : DEFAULT_IDLE_MS,
      nodes,
      sender
    }
    this.runs.set(runId, run)

    if (!nodes.size) {
      this.emit(run, 'done')
      this.runs.delete(runId)
      return runId
    }

    this.schedule(run)
    return runId
  }

  private schedule(run: RunState): void {
    const all = [...run.nodes.values()]

    // Launch every node whose dependencies are all done.
    for (const node of all) {
      if (node.status !== 'pending' && node.status !== 'blocked') continue
      const ready = node.dependsOn.every((dep) => run.nodes.get(dep)?.status === 'done')
      if (ready) this.launchNode(run, node)
    }

    // Run finished when no node is still pending/blocked/running.
    const active = all.some(
      (n) => n.status === 'pending' || n.status === 'blocked' || n.status === 'running'
    )
    if (!active) {
      const failed = all.some((n) => n.status === 'error')
      this.finish(run, failed ? 'error' : 'done')
    }
  }

  private launchNode(run: RunState, node: NodeState): void {
    if (!ptyManager.isRunning(node.agentId)) {
      node.status = 'error'
      this.emit(run, 'running')
      return
    }

    const upstream = node.dependsOn
      .map((dep) => run.nodes.get(dep)?.output)
      .filter((o): o is string => Boolean(o))
      .join('\n\n')

    const message = upstream
      ? `[上游产出]\n${upstream}\n\n[任务]\n${node.task}\r`
      : `${node.task}\r`

    ptyManager.beginCapture(node.agentId)
    ptyManager.write(node.agentId, message)

    node.status = 'running'
    node.sawOutput = false
    node.startedAt = Date.now()
    this.emit(run, 'running')

    node.poller = setInterval(() => this.poll(run, node), POLL_MS)
  }

  private poll(run: RunState, node: NodeState): void {
    const last = ptyManager.lastDataAt(node.agentId)
    if (last === undefined) return
    if (last > node.startedAt) node.sawOutput = true
    if (node.sawOutput && Date.now() - last >= run.idleMs) {
      this.completeNode(run, node)
    }
  }

  private completeNode(run: RunState, node: NodeState): void {
    this.clearNode(node)
    node.output = ptyManager.readCapture(node.agentId)
    ptyManager.endCapture(node.agentId)
    node.status = 'done'
    this.emit(run, 'running')
    this.schedule(run)
  }

  // ---- Controls ----

  stop(runId: string): void {
    const run = this.runs.get(runId)
    if (!run) return
    for (const node of run.nodes.values()) {
      this.clearNode(node)
      if (node.status === 'running') ptyManager.endCapture(node.agentId)
    }
    this.finish(run, 'stopped')
  }

  retry(runId: string, key: string): void {
    const run = this.runs.get(runId)
    const node = run?.nodes.get(key)
    if (!run || !node) return
    this.clearNode(node)
    ptyManager.endCapture(node.agentId)
    node.status = node.dependsOn.length ? 'blocked' : 'pending'
    node.output = ''
    this.schedule(run)
  }

  private finish(run: RunState, status: OrchestratorRunStatus): void {
    for (const node of run.nodes.values()) this.clearNode(node)
    this.emit(run, status)
    this.runs.delete(run.runId)
  }

  private clearNode(node: NodeState): void {
    if (node.poller) {
      clearInterval(node.poller)
      node.poller = null
    }
  }

  private emit(run: RunState, status: OrchestratorRunStatus): void {
    const event: OrchestratorEvent = {
      runId: run.runId,
      projectId: run.projectId,
      status,
      nodes: [...run.nodes.values()].map((n) => ({
        key: n.key,
        agentId: n.agentId,
        status: n.status
      })),
      timestamp: Date.now()
    }
    if (!run.sender.isDestroyed()) run.sender.send('orchestrator:event', event)
  }
}

export const orchestrator = new Orchestrator()
