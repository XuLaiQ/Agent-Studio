import { randomUUID } from 'crypto'
import type { WebContents } from 'electron'
import { ptyManager } from './ptyManager'
import type {
  Workflow,
  StepRunState,
  TaskRunEvent,
  WorkflowRunStatus
} from '../shared/types'

const DEFAULT_IDLE_MS = 8000
const POLL_MS = 500

interface RunState {
  runId: string
  workflow: Workflow
  projectId: string
  idleMs: number
  currentIndex: number
  /** Output captured from the previous step, forwarded into the next one. */
  previousOutput: string
  steps: StepRunState[]
  /** Whether the current step's agent has produced any output yet. */
  sawOutput: boolean
  stepStartedAt: number
  poller: ReturnType<typeof setInterval> | null
  sender: WebContents
}

/**
 * Runs workflows: a linear chain of steps, each handed to an agent. A step is
 * considered complete when its agent's terminal goes quiet for `idleMs`; its
 * captured output is then prepended to the next step's instruction. Manual
 * advance / retry / stop controls override the idle heuristic.
 */
class TaskEngine {
  private runs = new Map<string, RunState>()

  start(workflow: Workflow, projectId: string, idleMs: number, sender: WebContents): string {
    const runId = randomUUID()
    const run: RunState = {
      runId,
      workflow,
      projectId,
      idleMs: idleMs > 0 ? idleMs : DEFAULT_IDLE_MS,
      currentIndex: 0,
      previousOutput: '',
      steps: workflow.steps.map((s) => ({
        stepId: s.id,
        agentId: s.agentId,
        status: 'pending'
      })),
      sawOutput: false,
      stepStartedAt: 0,
      poller: null,
      sender
    }
    this.runs.set(runId, run)

    if (!workflow.steps.length) {
      this.finish(run, 'done')
      return runId
    }

    this.runStep(run)
    return runId
  }

  private runStep(run: RunState): void {
    const step = run.workflow.steps[run.currentIndex]
    const stepState = run.steps[run.currentIndex]

    if (!ptyManager.isRunning(step.agentId)) {
      stepState.status = 'error'
      this.finish(run, 'error', 'agent-not-running')
      return
    }

    const message = run.previousOutput
      ? `[上一步产出]\n${run.previousOutput}\n\n[任务]\n${step.prompt}\r`
      : `${step.prompt}\r`

    ptyManager.beginCapture(step.agentId)
    ptyManager.write(step.agentId, message)

    run.sawOutput = false
    run.stepStartedAt = Date.now()
    stepState.status = 'running'
    this.emit(run, 'running')

    run.poller = setInterval(() => this.poll(run), POLL_MS)
  }

  private poll(run: RunState): void {
    const step = run.workflow.steps[run.currentIndex]
    const last = ptyManager.lastDataAt(step.agentId)
    if (last === undefined) return

    if (last > run.stepStartedAt) run.sawOutput = true
    if (run.sawOutput && Date.now() - last >= run.idleMs) {
      this.completeStep(run)
    }
  }

  private completeStep(run: RunState): void {
    this.clearPoller(run)
    const step = run.workflow.steps[run.currentIndex]
    run.previousOutput = ptyManager.readCapture(step.agentId)
    ptyManager.endCapture(step.agentId)
    run.steps[run.currentIndex].status = 'done'

    run.currentIndex += 1
    if (run.currentIndex >= run.workflow.steps.length) {
      this.finish(run, 'done')
      return
    }
    this.emit(run, 'running')
    this.runStep(run)
  }

  // ---- Manual controls ----

  advance(runId: string): void {
    const run = this.runs.get(runId)
    if (run?.poller) this.completeStep(run)
  }

  retry(runId: string): void {
    const run = this.runs.get(runId)
    if (!run) return
    this.clearPoller(run)
    const step = run.workflow.steps[run.currentIndex]
    if (step) ptyManager.endCapture(step.agentId)
    if (run.steps[run.currentIndex]) run.steps[run.currentIndex].status = 'pending'
    this.runStep(run)
  }

  stop(runId: string): void {
    const run = this.runs.get(runId)
    if (!run) return
    this.clearPoller(run)
    const step = run.workflow.steps[run.currentIndex]
    if (step) ptyManager.endCapture(step.agentId)
    this.finish(run, 'stopped')
  }

  private finish(run: RunState, status: WorkflowRunStatus, message?: string): void {
    this.clearPoller(run)
    this.emit(run, status, message)
    this.runs.delete(run.runId)
  }

  private clearPoller(run: RunState): void {
    if (run.poller) {
      clearInterval(run.poller)
      run.poller = null
    }
  }

  private emit(run: RunState, status: WorkflowRunStatus, message?: string): void {
    const event: TaskRunEvent = {
      runId: run.runId,
      workflowId: run.workflow.id,
      projectId: run.projectId,
      status,
      currentStepIndex: run.currentIndex,
      steps: run.steps.map((s) => ({ ...s })),
      message,
      timestamp: Date.now()
    }
    if (!run.sender.isDestroyed()) run.sender.send('task:event', event)
  }
}

export const taskEngine = new TaskEngine()
