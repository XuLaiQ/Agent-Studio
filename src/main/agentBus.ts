import type { WebContents } from 'electron'
import { store } from './store'
import { ptyManager } from './ptyManager'
import type { BusSendInput, BusDeliveryResult, BusMessageEvent } from '../shared/types'

/**
 * Routes messages between agents. The hub writes a sender-labelled payload into
 * each live target PTY, optionally submitting it. Targets that are not running
 * are reported back as skipped rather than failing the whole send.
 */
class AgentBus {
  forward(input: BusSendInput, sender: WebContents): BusDeliveryResult {
    const result: BusDeliveryResult = { delivered: [], skipped: [] }

    const text = input.text.trim()
    if (!text) return result

    const from = store.getAgent(input.projectId, input.fromAgentId)
    const fromName = from?.name ?? 'agent'

    const targets = input.toAgentId
      ? [input.toAgentId]
      : store
          .getProjectAgents(input.projectId)
          .filter((a) => a.id !== input.fromAgentId)
          .map((a) => a.id)

    for (const toAgentId of targets) {
      if (toAgentId === input.fromAgentId) {
        result.skipped.push({ agentId: toAgentId, reason: 'self' })
        continue
      }

      const target = store.getAgent(input.projectId, toAgentId)
      if (!target) {
        result.skipped.push({ agentId: toAgentId, reason: 'not-found' })
        continue
      }

      if (!ptyManager.isRunning(toAgentId)) {
        result.skipped.push({ agentId: toAgentId, reason: 'not-running' })
        continue
      }

      const payload = `[来自 ${fromName}] ${text}` + (input.submit ? '\r' : '')
      ptyManager.write(toAgentId, payload)
      result.delivered.push(toAgentId)

      const receipt: BusMessageEvent = {
        projectId: input.projectId,
        fromAgentId: input.fromAgentId,
        fromAgentName: fromName,
        toAgentId,
        toAgentName: target.name,
        text,
        timestamp: Date.now()
      }
      sender.send('bus:message', receipt)
    }

    return result
  }
}

export const agentBus = new AgentBus()
