import { readdirSync } from 'fs'
import { join } from 'path'
import type { FileNode } from '../shared/types'

const IGNORED = new Set(['.git', 'node_modules', '.DS_Store', 'out', 'dist'])

/** Read a single directory level (lazy loading — children fetched on expand). */
export function readDir(dirPath: string): FileNode[] {
  let entries
  try {
    entries = readdirSync(dirPath, { withFileTypes: true })
  } catch (err) {
    console.error('[fileTree] readdir failed:', dirPath, err)
    return []
  }

  return entries
    .filter((e) => !IGNORED.has(e.name))
    .map<FileNode>((e) => ({
      name: e.name,
      path: join(dirPath, e.name),
      isDir: e.isDirectory()
    }))
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}
