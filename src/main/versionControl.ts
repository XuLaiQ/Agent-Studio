import { execFile } from 'child_process'
import { readFile } from 'fs/promises'
import { basename, join } from 'path'
import { promisify } from 'util'
import type {
  Project,
  ProjectRemote,
  ProjectVersionStatus,
  VersionBranch,
  VersionBranchInput,
  VersionCreateBranchInput,
  VersionCommitLog,
  VersionCommitFile,
  VersionCommitFilesInput,
  VersionCommitInput,
  VersionFileChange,
  VersionFileDiff,
  VersionFileDiffInput,
  VersionFileInput,
  VersionProvider,
  VersionProjectInput,
  VersionScanResult,
  VersionToolStatus
} from '../shared/types'
import { store } from './store'

const execFileAsync = promisify(execFile)

async function run(command: string, args: string[], cwd?: string, timeout = 5000): Promise<string> {
  const { stdout } = await execFileAsync(command, args, {
    cwd,
    timeout,
    windowsHide: true
  })
  return String(stdout).trim()
}

function firstLine(text: string): string | undefined {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
}

function providerFromRemote(url: string): VersionProvider {
  const normalized = url.toLowerCase()
  if (normalized.includes('github.com')) return 'github'
  if (normalized.includes('gitlab.com')) return 'gitlab'
  return 'git'
}

function parseRemotes(output: string): ProjectRemote[] {
  const remotes = new Map<string, ProjectRemote>()

  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/)
    if (!match) continue

    const [, name, url] = match
    if (!remotes.has(name)) {
      remotes.set(name, {
        name,
        url,
        provider: providerFromRemote(url)
      })
    }
  }

  return [...remotes.values()]
}

function parseStatusLine(line: string): VersionFileChange | null {
  if (line.length < 4) return null

  const match = line.match(/^(.)(.)\s+(.+)$/)
  if (!match) return null

  const [, indexStatus, workTreeStatus, content] = match
  const renameParts = content.split(' -> ')
  const path = renameParts[renameParts.length - 1]
  const originalPath = renameParts.length > 1 ? renameParts[0] : undefined

  return {
    path,
    originalPath,
    indexStatus,
    workTreeStatus,
    staged: indexStatus !== ' ' && indexStatus !== '?'
  }
}

function parseChanges(output: string): VersionFileChange[] {
  return output
    .split(/\r?\n/)
    .map(parseStatusLine)
    .filter((change): change is VersionFileChange => Boolean(change))
}

function parseAheadBehind(output: string, upstream: string): { upstream?: string; ahead: number; behind: number } {
  const [behindText = '0', aheadText = '0'] = output.split(/\s+/)
  return {
    upstream: upstream || undefined,
    ahead: Number(aheadText) || 0,
    behind: Number(behindText) || 0
  }
}

function parseLocalBranches(output: string): VersionBranch[] {
  return output
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return null

      const current = line.startsWith('*')
      const body = trimmed.replace(/^[*+]\s*/, '')
      const parts = body.split(/\s+/)
      const name = parts[0]
      const headHash = parts[1]
      const upstreamMatch = body.match(/\[([^\]:]+)(?::[^\]]+)?\]/)

      return {
        name,
        current,
        remote: false,
        upstream: upstreamMatch?.[1],
        headHash
      }
    })
    .filter((branch): branch is VersionBranch => Boolean(branch))
}

function parseRemoteBranches(output: string): VersionBranch[] {
  return output
    .split(/\r?\n/)
    .map((line) => {
      const [headHash, name] = line.trim().split('\t')
      if (!headHash || !name || name.endsWith('/HEAD')) return null

      return {
        name,
        current: false,
        remote: true,
        headHash,
        pushedHash: headHash
      }
    })
    .filter((branch): branch is VersionBranch => Boolean(branch))
}

function attachCommitBranches(commits: VersionCommitLog[], branches: VersionBranch[]): VersionCommitLog[] {
  const branchesByHash = new Map<string, string[]>()
  for (const branch of branches) {
    if (!branch.pushedHash) continue
    const commit = commits.find((item) => item.hash === branch.pushedHash || item.hash.startsWith(branch.pushedHash))
    if (!commit) continue
    const names = branchesByHash.get(commit.hash) ?? []
    names.push(branch.name)
    branchesByHash.set(commit.hash, names)
  }

  return commits.map((commit) => ({
    ...commit,
    branches: branchesByHash.get(commit.hash) ?? []
  }))
}

function displayBranchName(branch: VersionBranch, localBranches: VersionBranch[]): string {
  return localBranches.find((localBranch) => localBranch.upstream === branch.name)?.name ?? branch.name
}

function attachPushedState(
  commits: VersionCommitLog[],
  pushedBranchesByHash: Map<string, string[]>
): VersionCommitLog[] {
  return commits.map((commit) => ({
    ...commit,
    pushed: pushedBranchesByHash.has(commit.hash),
    pushedBranches: pushedBranchesByHash.get(commit.hash) ?? []
  }))
}

async function collectPushedBranchesByHash(
  projectPath: string,
  localBranches: VersionBranch[],
  remoteBranches: VersionBranch[]
): Promise<Map<string, string[]>> {
  const pushedBranchEntriesByHash = new Map<string, Array<{ name: string; distance: number }>>()
  const branchHistories = await Promise.all(
    remoteBranches.map(async (branch) => ({
      name: displayBranchName(branch, localBranches),
      output: await run('git', ['-C', projectPath, 'rev-list', '-n', '1000', branch.name]).catch(() => '')
    }))
  )

  for (const branch of branchHistories) {
    const hashes = branch.output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    hashes.forEach((hash, distance) => {
      const entries = pushedBranchEntriesByHash.get(hash) ?? []
      if (!entries.some((entry) => entry.name === branch.name)) {
        entries.push({ name: branch.name, distance })
      }
      pushedBranchEntriesByHash.set(hash, entries)
    })
  }

  const pushedBranchesByHash = new Map<string, string[]>()
  for (const [hash, entries] of pushedBranchEntriesByHash) {
    pushedBranchesByHash.set(
      hash,
      entries
        .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
        .map((entry) => entry.name)
    )
  }

  return pushedBranchesByHash
}

function pushedBranchMarkers(localBranches: VersionBranch[], remoteBranches: VersionBranch[]): VersionBranch[] {
  const remoteHashByName = new Map(remoteBranches.map((branch) => [branch.name, branch.headHash]))
  const trackedUpstreams = new Set<string>()

  const localMarkers = localBranches
    .map((branch) => {
      if (!branch.upstream) return null
      const pushedHash = remoteHashByName.get(branch.upstream)
      if (!pushedHash) return null

      trackedUpstreams.add(branch.upstream)
      return {
        name: branch.name,
        current: branch.current,
        remote: false,
        upstream: branch.upstream,
        pushedHash
      }
    })
    .filter((branch): branch is VersionBranch => Boolean(branch))

  const untrackedRemoteMarkers = remoteBranches
    .filter((branch) => !trackedUpstreams.has(branch.name))
    .map((branch) => ({
      ...branch,
      pushedHash: branch.headHash
    }))

  return [...localMarkers, ...untrackedRemoteMarkers]
}

function parseCommitHistory(output: string): VersionCommitLog[] {
  return output
    .split(/\r?\n/)
    .map((line) => {
      const [hash, shortHash, author, date, relativeDate, subject] = line.split('\x1f')
      if (!hash || !subject) return null

      return {
        hash,
        shortHash,
        author,
        date,
        relativeDate,
        subject,
        branches: [],
        pushed: false,
        pushedBranches: []
      }
    })
    .filter((commit): commit is VersionCommitLog => Boolean(commit))
}

function parseCommitFiles(output: string): VersionCommitFile[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t/)
      const status = (parts[0]?.[0] ?? '').toUpperCase()
      // Renames/copies are reported as "R100\told\tnew" (or "C100\told\tnew").
      if ((status === 'R' || status === 'C') && parts.length >= 3) {
        return { status, originalPath: parts[1], path: parts[2] }
      }
      return { status: status || 'M', path: parts[parts.length - 1] }
    })
    .filter((file): file is VersionCommitFile => Boolean(file.path))
}

export async function commitFiles(input: VersionCommitFilesInput): Promise<VersionCommitFile[]> {
  const project = findProject(input)
  const output = await run('git', [
    '-C',
    project.path,
    'show',
    '--name-status',
    '--format=',
    '-M',
    input.hash
  ])
  return parseCommitFiles(output)
}

async function detectTool(tool: 'git' | 'gh' | 'glab'): Promise<VersionToolStatus> {
  try {
    const path = firstLine(await run('where.exe', [tool]))
    const version = firstLine(await run(tool, ['--version']))
    return { tool, available: true, path, version }
  } catch (err) {
    return {
      tool,
      available: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

async function scanProject(project: Project): Promise<ProjectVersionStatus> {
  try {
    await run('git', ['-C', project.path, 'rev-parse', '--is-inside-work-tree'])

    const [
      branch,
      remoteOutput,
      dirtyOutput,
      lastCommit,
      branchOutput,
      remoteBranchOutput,
      upstreamOutput,
      trackingOutput,
      commitHistoryOutput
    ] = await Promise.all([
      run('git', ['-C', project.path, 'branch', '--show-current']).catch(() => ''),
      run('git', ['-C', project.path, 'remote', '-v']).catch(() => ''),
      run('git', ['-C', project.path, 'status', '--porcelain']).catch(() => ''),
      run('git', ['-C', project.path, 'log', '-1', '--pretty=%h %s']).catch(() => ''),
      run('git', ['-C', project.path, 'branch', '-vv', '--no-abbrev']).catch(() => ''),
      run('git', [
        '-C',
        project.path,
        'for-each-ref',
        '--format=%(objectname)\t%(refname:short)',
        'refs/remotes'
      ]).catch(() => ''),
      run('git', ['-C', project.path, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).catch(
        () => ''
      ),
      run('git', ['-C', project.path, 'rev-list', '--left-right', '--count', '@{u}...HEAD']).catch(
        () => ''
      ),
      run('git', [
        '-C',
        project.path,
        'log',
        'HEAD',
        '--branches',
        '--remotes',
        '--tags',
        '-n',
        '30',
        '--date=iso',
        '--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%ar%x1f%s'
      ]).catch(() => '')
    ])
    const tracking = parseAheadBehind(trackingOutput, upstreamOutput)
    const remoteBranches = parseRemoteBranches(remoteBranchOutput)
    const localBranches = parseLocalBranches(branchOutput)
    const pushedBranchesByHash = await collectPushedBranchesByHash(
      project.path,
      localBranches,
      remoteBranches
    )
    const commitHistory = attachCommitBranches(
      attachPushedState(parseCommitHistory(commitHistoryOutput), pushedBranchesByHash),
      pushedBranchMarkers(localBranches, remoteBranches)
    )

    return {
      projectId: project.id,
      projectName: project.name,
      path: project.path,
      isRepository: true,
      branch: branch || undefined,
      upstream: tracking.upstream,
      ahead: tracking.ahead,
      behind: tracking.behind,
      remotes: parseRemotes(remoteOutput),
      localBranches,
      remoteBranches,
      dirty: dirtyOutput.length > 0,
      lastCommit: lastCommit || undefined,
      commitHistory,
      changes: parseChanges(dirtyOutput)
    }
  } catch (err) {
    return {
      projectId: project.id,
      projectName: project.name,
      path: project.path,
      isRepository: false,
      remotes: [],
      localBranches: [],
      remoteBranches: [],
      ahead: 0,
      behind: 0,
      commitHistory: [],
      changes: [],
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

function findProject(input: VersionProjectInput): Project {
  const project = store.getProjects().find((item) => item.id === input.projectId)
  if (!project) throw new Error(`Project not found: ${input.projectId}`)
  return project
}

function looksBinary(content: string): boolean {
  return content.includes(String.fromCharCode(0))
}

export async function diffFile(input: VersionFileDiffInput): Promise<VersionFileDiff> {
  const project = findProject(input)
  const cwd = project.path
  const path = input.path

  const toplevel =
    (await run('git', ['-C', cwd, 'rev-parse', '--show-toplevel']).catch(() => '')) || cwd

  const showHead = (): Promise<string> =>
    run('git', ['-C', cwd, 'show', `HEAD:${path}`]).catch(() => '')
  const showIndex = (): Promise<string> =>
    run('git', ['-C', cwd, 'show', `:${path}`]).catch(() => '')
  const readWorkingTree = (): Promise<string> =>
    readFile(join(toplevel, path), 'utf8').catch(() => '')

  let original = ''
  let modified = ''

  if (input.staged) {
    // Staged change: HEAD (left) vs index (right).
    original = await showHead()
    modified = await showIndex()
  } else {
    // Working-tree change: index/HEAD (left) vs working file (right).
    original = (await showIndex()) || (await showHead())
    modified = await readWorkingTree()
  }

  const binary = looksBinary(original) || looksBinary(modified)

  return {
    path,
    name: basename(path),
    original: binary ? '' : original,
    modified: binary ? '' : modified,
    staged: input.staged,
    binary
  }
}

export async function stageFile(input: VersionFileInput): Promise<ProjectVersionStatus> {
  const project = findProject(input)
  await run('git', ['-C', project.path, 'add', '--', input.path])
  return scanProject(project)
}

export async function unstageFile(input: VersionFileInput): Promise<ProjectVersionStatus> {
  const project = findProject(input)
  await run('git', ['-C', project.path, 'restore', '--staged', '--', input.path])
  return scanProject(project)
}

export async function stageAll(input: VersionProjectInput): Promise<ProjectVersionStatus> {
  const project = findProject(input)
  // Refresh status before staging to ensure git index is current
  await run('git', ['-C', project.path, 'status']).catch(() => '')
  await run('git', ['-C', project.path, 'add', '--all'])
  return scanProject(project)
}

export async function unstageAll(input: VersionProjectInput): Promise<ProjectVersionStatus> {
  const project = findProject(input)
  // Refresh status before unstaging to ensure git index is current
  await run('git', ['-C', project.path, 'status']).catch(() => '')
  await run('git', ['-C', project.path, 'restore', '--staged', '--', '.'])
  return scanProject(project)
}

export async function commit(input: VersionCommitInput): Promise<ProjectVersionStatus> {
  const project = findProject(input)
  const message = input.message.trim()
  if (!message) throw new Error('Commit message is required')
  await run('git', ['-C', project.path, 'commit', '-m', message])
  return scanProject(project)
}

export async function fetchProject(input: VersionProjectInput): Promise<ProjectVersionStatus> {
  const project = findProject(input)
  await run('git', ['-C', project.path, 'fetch', '--all', '--prune'], undefined, 60000)
  return scanProject(project)
}

export async function pullProject(input: VersionProjectInput): Promise<ProjectVersionStatus> {
  const project = findProject(input)
  await run('git', ['-C', project.path, 'pull'], undefined, 60000)
  return scanProject(project)
}

export async function pushProject(input: VersionProjectInput): Promise<ProjectVersionStatus> {
  const project = findProject(input)
  await run('git', ['-C', project.path, 'push'], undefined, 60000)
  return scanProject(project)
}

export async function checkoutBranch(input: VersionBranchInput): Promise<ProjectVersionStatus> {
  const project = findProject(input)
  await run('git', ['-C', project.path, 'checkout', input.branch])
  return scanProject(project)
}

export async function createBranch(input: VersionCreateBranchInput): Promise<ProjectVersionStatus> {
  const project = findProject(input)
  const branch = input.branch.trim()
  if (!branch) throw new Error('Branch name is required')
  await run('git', ['-C', project.path, 'branch', branch])
  if (input.checkout) {
    await run('git', ['-C', project.path, 'checkout', branch])
  }
  return scanProject(project)
}

export async function scanVersionControl(): Promise<VersionScanResult> {
  const [tools, projects] = await Promise.all([
    Promise.all([detectTool('git'), detectTool('gh'), detectTool('glab')]),
    Promise.all(store.getProjects().map((project) => scanProject(project)))
  ])

  return {
    tools,
    projects,
    connections: store.getVersionConnections(),
    scannedAt: Date.now()
  }
}
