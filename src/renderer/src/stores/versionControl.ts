import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  CreateVersionConnectionInput,
  ProjectVersionStatus,
  VersionConnection,
  VersionProvider,
  VersionScanResult
} from '@shared/types'
import { useStudioStore } from './studio'

export const useVersionControlStore = defineStore('versionControl', () => {
  const scanResult = ref<VersionScanResult | null>(null)
  const connections = ref<VersionConnection[]>([])
  const loading = ref(false)

  const tools = computed(() => scanResult.value?.tools ?? [])
  const projects = computed(() => scanResult.value?.projects ?? [])
  const scannedAt = computed(() => scanResult.value?.scannedAt ?? null)
  const activeProjectStatus = computed(() => {
    const studioStore = useStudioStore()
    const activeProjectId = studioStore.activeProjectId
    return projects.value.find((project) => project.projectId === activeProjectId) ?? null
  })
  const stagedChanges = computed(() =>
    activeProjectStatus.value?.changes.filter((change) => change.staged) ?? []
  )
  const unstagedChanges = computed(() =>
    activeProjectStatus.value?.changes.filter((change) => !change.staged) ?? []
  )

  function replaceProjectStatus(status: ProjectVersionStatus): void {
    if (!scanResult.value) return

    const index = scanResult.value.projects.findIndex(
      (project) => project.projectId === status.projectId
    )
    if (index >= 0) {
      scanResult.value.projects[index] = status
    } else {
      scanResult.value.projects.push(status)
    }
    scanResult.value.scannedAt = Date.now()
  }

  async function scan(): Promise<void> {
    loading.value = true
    try {
      scanResult.value = await window.studio.scanVersionControl()
      connections.value = scanResult.value.connections
    } finally {
      loading.value = false
    }
  }

  async function loadConnections(): Promise<void> {
    connections.value = await window.studio.listVersionConnections()
  }

  async function addConnection(input: CreateVersionConnectionInput): Promise<void> {
    const connection = await window.studio.addVersionConnection(input)
    connections.value.push(connection)
    if (scanResult.value) scanResult.value.connections = connections.value
  }

  async function removeConnection(id: string): Promise<void> {
    connections.value = await window.studio.removeVersionConnection(id)
    if (scanResult.value) scanResult.value.connections = connections.value
  }

  async function stageFile(projectId: string, path: string): Promise<void> {
    replaceProjectStatus(await window.studio.stageVersionFile({ projectId, path }))
  }

  async function unstageFile(projectId: string, path: string): Promise<void> {
    replaceProjectStatus(await window.studio.unstageVersionFile({ projectId, path }))
  }

  async function stageAll(projectId: string): Promise<void> {
    replaceProjectStatus(await window.studio.stageAllVersionChanges({ projectId }))
  }

  async function unstageAll(projectId: string): Promise<void> {
    replaceProjectStatus(await window.studio.unstageAllVersionChanges({ projectId }))
  }

  async function commit(projectId: string, message: string): Promise<void> {
    replaceProjectStatus(await window.studio.commitVersionChanges({ projectId, message }))
  }

  function providerLabel(provider: VersionProvider): string {
    if (provider === 'github') return 'GitHub'
    if (provider === 'gitlab') return 'GitLab'
    return 'Git'
  }

  return {
    scanResult,
    connections,
    loading,
    tools,
    projects,
    scannedAt,
    activeProjectStatus,
    stagedChanges,
    unstagedChanges,
    scan,
    loadConnections,
    addConnection,
    removeConnection,
    stageFile,
    unstageFile,
    stageAll,
    unstageAll,
    commit,
    providerLabel
  }
})
