import { readdir, readFile, stat } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import type { AgentType, SessionSummary } from '../shared/types'

const MAX_SESSIONS = 40
const TITLE_MAX_LEN = 60

function truncate(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > TITLE_MAX_LEN ? `${clean.slice(0, TITLE_MAX_LEN - 1)}…` : clean
}

/** Claude encodes a project's cwd into its sessions folder name. */
function claudeProjectDir(cwd: string): string {
  return join(homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))
}

/** Derive a human title for a session from its JSONL transcript. */
function titleFromTranscript(content: string, fallbackId: string): string {
  let aiTitle = ''
  let lastPrompt = ''
  let firstUser = ''

  for (const line of content.split('\n')) {
    if (!line) continue
    let rec: Record<string, unknown>
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }

    if (typeof rec.aiTitle === 'string' && rec.aiTitle) aiTitle = rec.aiTitle
    if (typeof rec.lastPrompt === 'string' && rec.lastPrompt) lastPrompt = rec.lastPrompt
    if (!firstUser && rec.type === 'user') {
      const message = rec.message as { content?: unknown } | undefined
      if (typeof message?.content === 'string') firstUser = message.content
    }
  }

  const title = aiTitle || lastPrompt || firstUser
  return title ? truncate(title) : fallbackId.slice(0, 8)
}

async function listClaudeSessions(cwd: string): Promise<SessionSummary[]> {
  const dir = claudeProjectDir(cwd)

  let entries: string[]
  try {
    entries = (await readdir(dir)).filter((f) => f.endsWith('.jsonl'))
  } catch {
    return [] // No sessions recorded for this project yet.
  }

  const stamped = await Promise.all(
    entries.map(async (file) => {
      try {
        const { mtimeMs } = await stat(join(dir, file))
        return { file, mtimeMs }
      } catch {
        return null
      }
    })
  )

  const newest = stamped
    .filter((e): e is { file: string; mtimeMs: number } => e !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_SESSIONS)

  return Promise.all(
    newest.map(async ({ file, mtimeMs }) => {
      const id = file.replace(/\.jsonl$/, '')
      let title = id.slice(0, 8)
      try {
        title = titleFromTranscript(await readFile(join(dir, file), 'utf8'), id)
      } catch {
        /* unreadable transcript — keep the id fallback */
      }
      return { id, title, updatedAt: mtimeMs }
    })
  )
}

/**
 * Lists past conversations for an agent in a given project directory. Only Claude
 * is supported today; other CLIs return an empty list (handled as an empty state
 * in the UI) until their transcript formats are wired up.
 */
export function listSessions(type: AgentType, cwd: string): Promise<SessionSummary[]> {
  switch (type) {
    case 'claude':
      return listClaudeSessions(cwd)
    default:
      return Promise.resolve([])
  }
}
