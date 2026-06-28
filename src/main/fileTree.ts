import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'path'
import type {
  FileCreateInput,
  FileDeleteInput,
  FileRenameInput,
  FileNode,
  FileOperationResult,
  FilePreview,
  FilePreviewInput,
  FileWriteInput
} from '../shared/types'

const IGNORED = new Set(['.git', 'node_modules', '.DS_Store', 'out', 'dist'])
const TEXT_PREVIEW_LIMIT = 1024 * 1024
const IMAGE_PREVIEW_LIMIT = 5 * 1024 * 1024

const TEXT_EXTENSIONS = new Set([
  '.bat',
  '.bicep',
  '.c',
  '.cc',
  '.cjs',
  '.clj',
  '.cljs',
  '.cljc',
  '.cmd',
  '.coffee',
  '.conf',
  '.cpp',
  '.cs',
  '.css',
  '.csv',
  '.cts',
  '.cxx',
  '.dart',
  '.edn',
  '.ex',
  '.exs',
  '.fs',
  '.fsi',
  '.fsx',
  '.go',
  '.gql',
  '.graphql',
  '.h',
  '.hbs',
  '.hcl',
  '.hh',
  '.hpp',
  '.html',
  '.htm',
  '.hxx',
  '.ini',
  '.java',
  '.js',
  '.json',
  '.jsonc',
  '.jsx',
  '.kt',
  '.kts',
  '.less',
  '.log',
  '.lua',
  '.m',
  '.md',
  '.mdx',
  '.ml',
  '.mli',
  '.mjs',
  '.mts',
  '.pl',
  '.pm',
  '.php',
  '.proto',
  '.ps1',
  '.pug',
  '.py',
  '.pyw',
  '.r',
  '.rb',
  '.rhistory',
  '.rmd',
  '.rprofile',
  '.rs',
  '.sbt',
  '.sc',
  '.scala',
  '.scss',
  '.sh',
  '.sol',
  '.sql',
  '.svg',
  '.swift',
  '.tf',
  '.tfvars',
  '.toml',
  '.ts',
  '.tsx',
  '.twig',
  '.txt',
  '.vb',
  '.vue',
  '.wgsl',
  '.xml',
  '.yaml',
  '.yml'
])

const TEXT_FILENAMES = new Set([
  '.babelrc',
  '.dockerignore',
  '.editorconfig',
  '.env',
  '.eslintignore',
  '.eslintrc',
  '.gitattributes',
  '.gitignore',
  '.npmrc',
  '.prettierrc',
  'cmakelists.txt',
  'dockerfile',
  'gemfile',
  'jenkinsfile',
  'makefile',
  'podfile',
  'procfile',
  'rakefile',
  'vagrantfile'
])

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
}

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

function ensureInsideProject(projectPath: string, targetPath: string): { root: string; target: string } {
  const root = resolve(projectPath)
  const target = isAbsolute(targetPath) ? resolve(targetPath) : resolve(root, targetPath)
  const rel = relative(root, target)

  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return { root, target }
  }

  throw new Error('Path is outside the active project.')
}

function validateEntryName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name is required.')
  if (trimmed === '.' || trimmed === '..') throw new Error('Invalid name.')
  if (/[\\/]/.test(trimmed)) throw new Error('Name cannot include path separators.')
  if (/[<>:"|?*\x00]/.test(trimmed)) throw new Error('Name includes invalid characters.')
  return trimmed
}

function hasBinaryBytes(buffer: Buffer): boolean {
  for (const byte of buffer) {
    if (byte === 0) return true
  }
  return false
}

function readBytes(target: string, length: number): Buffer {
  const fd = openSync(target, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const bytesRead = readSync(fd, buffer, 0, length, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    closeSync(fd)
  }
}

function basePreview(target: string): Omit<FilePreview, 'kind'> {
  const stats = statSync(target)
  const extension = extname(target).toLowerCase()

  return {
    path: target,
    name: basename(target),
    extension,
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    mime: IMAGE_MIME_BY_EXTENSION[extension]
  }
}

export function readFilePreview(input: FilePreviewInput): FilePreview {
  const { target } = ensureInsideProject(input.projectPath, input.path)
  const stats = statSync(target)
  const base = basePreview(target)

  if (stats.isDirectory()) {
    return {
      ...base,
      kind: 'error',
      message: 'Directories cannot be previewed.'
    }
  }

  const extension = base.extension
  const imageMime = IMAGE_MIME_BY_EXTENSION[extension]

  if (imageMime) {
    if (stats.size > IMAGE_PREVIEW_LIMIT) {
      return {
        ...base,
        kind: 'too-large',
        message: 'Image is too large to preview.'
      }
    }

    const content = readFileSync(target)
    return {
      ...base,
      kind: 'image',
      mime: imageMime,
      dataUrl: `data:${imageMime};base64,${content.toString('base64')}`
    }
  }

  const probe = readBytes(target, Math.min(stats.size, 4096))
  const filename = base.name.toLowerCase()
  const looksLikeText =
    TEXT_EXTENSIONS.has(extension) || TEXT_FILENAMES.has(filename) || !hasBinaryBytes(probe)

  if (!looksLikeText) {
    return {
      ...base,
      kind: 'binary',
      message: 'Binary file preview is not available.'
    }
  }

  const bytes = readBytes(target, Math.min(stats.size, TEXT_PREVIEW_LIMIT))
  return {
    ...base,
    kind: 'text',
    content: bytes.toString('utf8'),
    truncated: stats.size > TEXT_PREVIEW_LIMIT
  }
}

export function createFileSystemEntry(input: FileCreateInput): FileOperationResult {
  const name = validateEntryName(input.name)
  const { root, target: parent } = ensureInsideProject(input.projectPath, input.parentPath)
  const target = join(parent, name)
  ensureInsideProject(root, target)

  if (existsSync(target)) throw new Error('A file or folder with this name already exists.')

  if (input.type === 'directory') {
    mkdirSync(target)
  } else {
    writeFileSync(target, '', { flag: 'wx' })
  }

  return { path: target }
}

export function deleteFileSystemEntry(input: FileDeleteInput): FileOperationResult {
  const { root, target } = ensureInsideProject(input.projectPath, input.path)
  if (root === target) throw new Error('The project root cannot be deleted here.')
  if (!existsSync(target)) return { path: target }

  rmSync(target, { recursive: true, force: false })
  return { path: target }
}

export function renameFileSystemEntry(input: FileRenameInput): FileOperationResult {
  const name = validateEntryName(input.newName)
  const { root, target } = ensureInsideProject(input.projectPath, input.path)
  if (root === target) throw new Error('The project root cannot be renamed here.')
  const newTarget = join(dirname(target), name)
  ensureInsideProject(root, newTarget)
  if (existsSync(newTarget)) throw new Error('A file or folder with this name already exists.')

  renameSync(target, newTarget)
  return { path: newTarget }
}

export function writeTextFile(input: FileWriteInput): FileOperationResult {
  const { target } = ensureInsideProject(input.projectPath, input.path)
  const stats = statSync(target)

  if (stats.isDirectory()) throw new Error('Directories cannot be edited.')

  writeFileSync(target, input.content, 'utf8')
  return { path: target }
}
