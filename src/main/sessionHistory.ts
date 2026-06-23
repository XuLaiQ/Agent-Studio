import { readdir, readFile, stat } from 'fs/promises'
import { homedir } from 'os'
import { basename, join, resolve } from 'path'
import type { AgentType, SessionSummary } from '../shared/types'

const MAX_SESSIONS = 40
const TITLE_MAX_LEN = 60

interface StampedFile {
  path: string
  file: string
  mtimeMs: number
}

function truncate(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > TITLE_MAX_LEN ? `${clean.slice(0, TITLE_MAX_LEN - 1)}...` : clean
}

function fallbackTitle(id: string): string {
  return id.slice(0, 8)
}

function samePath(a: string, b: string): boolean {
  const left = resolve(a)
  const right = resolve(b)
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

async function listFilesRecursive(
  dir: string,
  predicate: (file: string) => boolean
): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath, predicate)))
    } else if (entry.isFile() && predicate(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

async function newestFiles(files: string[], limit = MAX_SESSIONS): Promise<StampedFile[]> {
  const stamped = await Promise.all(
    files.map(async (path) => {
      try {
        const { mtimeMs, size } = await stat(path)
        if (size <= 0) return null
        return { path, file: basename(path), mtimeMs }
      } catch {
        return null
      }
    })
  )

  return stamped
    .filter((e): e is StampedFile => e !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
}

/** Claude encodes a project's cwd into its sessions folder name. */
function claudeProjectDir(cwd: string): string {
  return join(homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))
}

function codexSessionsDir(): string {
  return join(homedir(), '.codex', 'sessions')
}

function reasonixSessionsDir(): string {
  return join(homedir(), '.reasonix', 'sessions')
}

/** Derive a human title for a Claude session from its JSONL transcript. */
function titleFromClaudeTranscript(content: string, fallbackId: string): string {
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
  return title ? truncate(title) : fallbackTitle(fallbackId)
}

function parseCodexTranscript(
  content: string,
  cwd: string,
  fallbackId: string
): SessionSummary | null {
  let id = ''
  let title = ''
  let matchesProject = false

  for (const line of content.split('\n')) {
    if (!line) continue
    let rec: Record<string, unknown>
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }

    const payload = rec.payload as
      | {
          id?: unknown
          cwd?: unknown
          type?: unknown
          message?: unknown
          text_elements?: unknown
        }
      | undefined

    if (rec.type === 'session_meta') {
      if (typeof payload?.id === 'string' && payload.id) id = payload.id
      if (typeof payload?.cwd === 'string') matchesProject = samePath(payload.cwd, cwd)
    }

    if (!title && rec.type === 'event_msg' && payload?.type === 'user_message') {
      if (typeof payload.message === 'string') {
        title = payload.message
      } else if (Array.isArray(payload.text_elements)) {
        title = payload.text_elements.filter((item) => typeof item === 'string').join(' ')
      }
    }
  }

  if (!matchesProject) return null
  const sessionId = id || fallbackId
  return {
    id: sessionId,
    title: title ? truncate(title) : fallbackTitle(sessionId),
    updatedAt: 0
  }
}

function titleFromReasonixTranscript(content: string, fallbackId: string): string {
  for (const line of content.split('\n')) {
    if (!line) continue
    let rec: Record<string, unknown>
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }

    if (rec.role !== 'user') continue
    if (typeof rec.content === 'string' && rec.content) return truncate(rec.content)
    if (Array.isArray(rec.content)) {
      const text = rec.content
        .map((item) => {
          if (typeof item === 'string') return item
          const part = item as { text?: unknown; content?: unknown }
          if (typeof part.text === 'string') return part.text
          if (typeof part.content === 'string') return part.content
          return ''
        })
        .filter(Boolean)
        .join(' ')
      if (text) return truncate(text)
    }
  }

  return fallbackTitle(fallbackId)
}

async function titleFromReasonixSession(filePath: string, id: string): Promise<string> {
  const metaPath = filePath.replace(/\.jsonl$/, '.meta.json')
  try {
    const meta = JSON.parse(await readFile(metaPath, 'utf8')) as { summary?: unknown }
    if (typeof meta.summary === 'string' && meta.summary) return truncate(meta.summary)
  } catch {
    /* fall back to transcript below */
  }

  try {
    return titleFromReasonixTranscript(await readFile(filePath, 'utf8'), id)
  } catch {
    return fallbackTitle(id)
  }
}

async function listClaudeSessions(cwd: string): Promise<SessionSummary[]> {
  const dir = claudeProjectDir(cwd)
  let entries: string[]
  try {
    entries = (await readdir(dir)).filter((f) => f.endsWith('.jsonl'))
  } catch {
    return []
  }

  const newest = await newestFiles(entries.map((file) => join(dir, file)))
  return Promise.all(
    newest.map(async ({ path, file, mtimeMs }) => {
      const id = file.replace(/\.jsonl$/, '')
      let title = fallbackTitle(id)
      try {
        title = titleFromClaudeTranscript(await readFile(path, 'utf8'), id)
      } catch {
        /* unreadable transcript: keep the id fallback */
      }
      return { id, title, updatedAt: mtimeMs }
    })
  )
}

async function listCodexSessions(cwd: string): Promise<SessionSummary[]> {
  const files = await listFilesRecursive(
    codexSessionsDir(),
    (file) => file.startsWith('rollout-') && file.endsWith('.jsonl')
  )
  const stamped = await newestFiles(files, files.length)
  const summaries = await Promise.all(
    stamped.map(async ({ path, file, mtimeMs }) => {
      try {
        const fallbackId = file.replace(/\.jsonl$/, '')
        const summary = parseCodexTranscript(await readFile(path, 'utf8'), cwd, fallbackId)
        return summary ? { ...summary, updatedAt: mtimeMs } : null
      } catch {
        return null
      }
    })
  )

  return summaries
    .filter((summary): summary is SessionSummary => summary !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS)
}

async function listReasonixSessions(cwd: string): Promise<SessionSummary[]> {
  const metaFiles = await listFilesRecursive(
    reasonixSessionsDir(),
    (file) => file.endsWith('.meta.json')
  )
  const matches = await Promise.all(
    metaFiles.map(async (metaPath) => {
      try {
        const meta = JSON.parse(await readFile(metaPath, 'utf8')) as { workspace?: unknown }
        if (typeof meta.workspace !== 'string' || !samePath(meta.workspace, cwd)) return null
        const filePath = metaPath.replace(/\.meta\.json$/, '.jsonl')
        const { mtimeMs, size } = await stat(filePath)
        if (size <= 0) return null
        const id = basename(filePath).replace(/\.jsonl$/, '')
        return {
          id,
          title: await titleFromReasonixSession(filePath, id),
          updatedAt: mtimeMs
        }
      } catch {
        return null
      }
    })
  )

  return matches
    .filter((summary): summary is SessionSummary => summary !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS)
}

/**
 * Lists past conversations for an agent in a given project directory from each
 * CLI's local transcript store.
 */
export function listSessions(type: AgentType, cwd: string): Promise<SessionSummary[]> {
  switch (type) {
    case 'claude':
      return listClaudeSessions(cwd)
    case 'codex':
      return listCodexSessions(cwd)
    case 'reasonix':
      return listReasonixSessions(cwd)
    default:
      return Promise.resolve([])
  }
}
