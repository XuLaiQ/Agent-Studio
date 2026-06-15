import { execFile } from 'child_process'
import { promisify } from 'util'
import type {
  Project,
  ProjectRemote,
  ProjectVersionStatus,
  VersionBranch,
  VersionBranchInput,
  VersionCreateBranchInput,
  VersionCommitInput,
  VersionFileChange,
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

  const indexStatus = line[0]
  const workTreeStatus = line[1]
  const content = line.slice(3)
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
      const body = trimmed.replace(/^\*\s*/, '')
      const name = body.split(/\s+/)[0]
      const upstreamMatch = body.match(/\[([^\]:]+)(?::[^\]]+)?\]/)

      return {
        name,
        current,
        remote: false,
        upstream: upstreamMatch?.[1]
      }
    })
    .filter((branch): branch is VersionBranch => Boolean(branch))
}

function parseRemoteBranches(output: string): VersionBranch[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.includes(' -> '))
    .map((name) => ({
      name,
      current: false,
      remote: true
    }))
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
      trackingOutput
    ] = await Promise.all([
      run('git', ['-C', project.path, 'branch', '--show-current']).catch(() => ''),
      run('git', ['-C', project.path, 'remote', '-v']).catch(() => ''),
      run('git', ['-C', project.path, 'status', '--porcelain']).catch(() => ''),
      run('git', ['-C', project.path, 'log', '-1', '--pretty=%h %s']).catch(() => ''),
      run('git', ['-C', project.path, 'branch', '-vv']).catch(() => ''),
      run('git', ['-C', project.path, 'branch', '-r']).catch(() => ''),
      run('git', ['-C', project.path, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).catch(
        () => ''
      ),
      run('git', ['-C', project.path, 'rev-list', '--left-right', '--count', '@{u}...HEAD']).catch(
        () => ''
      )
    ])
    const tracking = parseAheadBehind(trackingOutput, upstreamOutput)

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
      localBranches: parseLocalBranches(branchOutput),
      remoteBranches: parseRemoteBranches(remoteBranchOutput),
      dirty: dirtyOutput.length > 0,
      lastCommit: lastCommit || undefined,
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
  await run('git', ['-C', project.path, 'add', '--all'])
  return scanProject(project)
}

export async function unstageAll(input: VersionProjectInput): Promise<ProjectVersionStatus> {
  const project = findProject(input)
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
