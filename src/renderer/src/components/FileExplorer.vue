<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useStudioStore } from '../stores/studio'
import { t } from '../i18n'
import type { FileChangeEvent, FileNode } from '@shared/types'

const props = defineProps<{
  selectedPath?: string | null
}>()

const emit = defineEmits<{
  (event: 'preview-file', node: FileNode): void
  (event: 'open-in-tab', node: FileNode): void
  (event: 'entry-deleted', node: FileNode): void
}>()

const store = useStudioStore()
const roots = ref<FileNode[]>([])
const expanded = ref<Set<string>>(new Set())
const childrenCache = ref<Record<string, FileNode[]>>({})
const contextMenu = ref<{ node: FileNode; x: number; y: number } | null>(null)

let refreshTimer: ReturnType<typeof window.setTimeout> | null = null
let pollTimer: ReturnType<typeof window.setInterval> | null = null
let watchedProjectPath: string | null = null
let unsubscribeFileChanged: (() => void) | null = null
let refreshRequestId = 0

watch(
  () => store.activeProject?.path,
  async (path) => {
    expanded.value = new Set()
    childrenCache.value = {}
    closeContextMenu()
    await switchWatchedProject(path)
    await refreshTree()
  },
  { immediate: true }
)

async function refreshTree(): Promise<void> {
  const projectPath = store.activeProject?.path
  const requestId = ++refreshRequestId
  if (!projectPath) {
    roots.value = []
    childrenCache.value = {}
    return
  }

  const nextRoots = await window.studio.readDir(projectPath)
  if (requestId !== refreshRequestId || store.activeProject?.path !== projectPath) return
  roots.value = nextRoots

  const expandedPaths = [...expanded.value]
  const entries = await Promise.all(
    expandedPaths.map(async (path) => [path, await window.studio.readDir(path)] as const)
  )
  if (requestId !== refreshRequestId || store.activeProject?.path !== projectPath) return
  childrenCache.value = Object.fromEntries(entries)
}

function scheduleRefresh(): void {
  if (refreshTimer) window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null
    refreshTree()
  }, 180)
}

async function switchWatchedProject(path?: string): Promise<void> {
  if (watchedProjectPath) {
    await window.studio.unwatchProjectFiles(watchedProjectPath)
    watchedProjectPath = null
  }

  if (!path) return

  watchedProjectPath = path
  const result = await window.studio.watchProjectFiles(path)
  if (!result.watching && result.error) {
    console.warn('[FileExplorer] file watcher unavailable:', result.error)
  }
}

function isActiveProjectChange(event: FileChangeEvent): boolean {
  const projectPath = store.activeProject?.path
  if (!projectPath) return false
  return normalizePath(event.projectPath).toLowerCase() === normalizePath(projectPath).toLowerCase()
}

let lastClickTime = 0
let lastClickNode: FileNode | null = null

async function toggle(node: FileNode): Promise<void> {
  const now = Date.now()
  const isDoubleClick = lastClickNode === node && now - lastClickTime < 300

  if (!node.isDir) {
    if (isDoubleClick) {
      emit('open-in-tab', node)
    } else {
      emit('preview-file', node)
    }
    lastClickTime = now
    lastClickNode = node
    return
  }

  if (expanded.value.has(node.path)) {
    expanded.value.delete(node.path)
  } else {
    childrenCache.value[node.path] = await window.studio.readDir(node.path)
    expanded.value.add(node.path)
  }
}

function openContextMenu(node: FileNode, event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()

  const menuWidth = 210
  const menuHeight = node.isDir ? 270 : 300
  contextMenu.value = {
    node,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
  }
}

function closeContextMenu(): void {
  contextMenu.value = null
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function relativePathFor(nodePath: string): string {
  const rootPath = store.activeProject?.path
  if (!rootPath) return nodePath

  const normalizedRoot = normalizePath(rootPath)
  const normalizedNode = nodePath.replace(/\\/g, '/')
  const rootPrefix = `${normalizedRoot}/`

  if (normalizedNode.toLowerCase() === normalizedRoot.toLowerCase()) return '.'
  if (!normalizedNode.toLowerCase().startsWith(rootPrefix.toLowerCase())) return nodePath

  const relative = normalizedNode.slice(rootPrefix.length)
  return rootPath.includes('\\') ? relative.replace(/\//g, '\\') : relative
}

function parentPathFor(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  const slashIndex = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'))
  if (slashIndex <= 0) return store.activeProject?.path ?? normalized
  return normalized.slice(0, slashIndex)
}

function createParentFor(node: FileNode): string {
  return node.isDir ? node.path : parentPathFor(node.path)
}

function copyPath(kind: 'relative' | 'absolute'): void {
  const node = contextMenu.value?.node
  if (!node) return

  const path = kind === 'relative' ? relativePathFor(node.path) : node.path
  window.studio.writeClipboardText(path)
  closeContextMenu()
  ElMessage.success(
    t(kind === 'relative' ? 'explorer.copy.relative.done' : 'explorer.copy.absolute.done')
  )
}

function openPreviewFromMenu(): void {
  const node = contextMenu.value?.node
  if (!node || node.isDir) return

  closeContextMenu()
  emit('open-in-tab', node)
}

function revealInFolder(): void {
  const node = contextMenu.value?.node
  if (!node) return

  closeContextMenu()
  window.studio.revealInFolder(node.path)
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function isDialogCancel(err: unknown): boolean {
  return err === 'cancel' || err === 'close'
}

async function createEntry(type: 'file' | 'directory'): Promise<void> {
  const node = contextMenu.value?.node
  const projectPath = store.activeProject?.path
  if (!node || !projectPath) return

  const parentPath = createParentFor(node)
  closeContextMenu()

  try {
    const { value } = await ElMessageBox.prompt(
      t(type === 'file' ? 'explorer.create.file.prompt' : 'explorer.create.folder.prompt'),
      t(type === 'file' ? 'explorer.create.file' : 'explorer.create.folder'),
      {
        inputPlaceholder: t('explorer.create.placeholder'),
        confirmButtonText: t('dialog.create'),
        cancelButtonText: t('common.cancel')
      }
    )
    const name = String(value ?? '').trim()
    if (!name) return

    await window.studio.createFileEntry({ projectPath, parentPath, name, type })
    await refreshTree()
    ElMessage.success(t('explorer.create.done'))
  } catch (err) {
    if (!isDialogCancel(err)) ElMessage.error(errorText(err))
  }
}

async function renameEntry(): Promise<void> {
  const node = contextMenu.value?.node
  const projectPath = store.activeProject?.path
  if (!node || !projectPath) return

  closeContextMenu()

  try {
    const { value } = await ElMessageBox.prompt(
      t('explorer.rename.prompt'),
      t('explorer.rename'),
      {
        inputValue: node.name,
        inputPlaceholder: t('explorer.create.placeholder'),
        confirmButtonText: t('common.save'),
        cancelButtonText: t('common.cancel')
      }
    )
    const newName = String(value ?? '').trim()
    if (!newName || newName === node.name) return

    await window.studio.renameFileEntry({ projectPath, path: node.path, newName })
    await refreshTree()
    ElMessage.success(t('explorer.rename.done'))
  } catch (err) {
    if (!isDialogCancel(err)) ElMessage.error(errorText(err))
  }
}

async function deleteEntry(): Promise<void> {
  const node = contextMenu.value?.node
  const projectPath = store.activeProject?.path
  if (!node || !projectPath) return

  closeContextMenu()

  try {
    await ElMessageBox.confirm(
      t('explorer.delete.confirm', { name: node.name }),
      t('explorer.delete'),
      {
        type: 'warning',
        confirmButtonText: t('explorer.delete'),
        cancelButtonText: t('common.cancel')
      }
    )

    await window.studio.deleteFileEntry({ projectPath, path: node.path })
    expanded.value.delete(node.path)
    await refreshTree()
    emit('entry-deleted', node)
    ElMessage.success(t('explorer.delete.done'))
  } catch (err) {
    if (!isDialogCancel(err)) ElMessage.error(errorText(err))
  }
}

function closeContextMenuOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeContextMenu()
}

onMounted(() => {
  window.addEventListener('click', closeContextMenu)
  window.addEventListener('contextmenu', closeContextMenu)
  window.addEventListener('keydown', closeContextMenuOnEscape)
  window.addEventListener('blur', closeContextMenu)
  window.addEventListener('scroll', closeContextMenu, true)

  unsubscribeFileChanged = window.studio.onFileChanged((event) => {
    if (isActiveProjectChange(event)) scheduleRefresh()
  })
  pollTimer = window.setInterval(scheduleRefresh, 3500)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeContextMenu)
  window.removeEventListener('contextmenu', closeContextMenu)
  window.removeEventListener('keydown', closeContextMenuOnEscape)
  window.removeEventListener('blur', closeContextMenu)
  window.removeEventListener('scroll', closeContextMenu, true)
  unsubscribeFileChanged?.()
  if (refreshTimer) window.clearTimeout(refreshTimer)
  if (pollTimer) window.clearInterval(pollTimer)
  if (watchedProjectPath) window.studio.unwatchProjectFiles(watchedProjectPath)
})
</script>

<template>
  <div class="explorer">
    <div class="section-head">{{ t('explorer.title') }}</div>
    <div v-if="!store.activeProject" class="empty">{{ t('explorer.empty') }}</div>
    <ul v-else class="tree">
      <FileRow
        v-for="node in roots"
        :key="node.path"
        :node="node"
        :depth="0"
        :expanded="expanded"
        :children-cache="childrenCache"
        :selected-path="props.selectedPath"
        @toggle="toggle"
        @open-menu="openContextMenu"
      />
    </ul>
    <div
      v-if="contextMenu"
      class="context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
      @contextmenu.prevent.stop
    >
      <button v-if="!contextMenu.node.isDir" type="button" @click="openPreviewFromMenu">
        {{ t('explorer.preview') }}
      </button>
      <button type="button" @click="copyPath('relative')">
        {{ t('explorer.copy.relative') }}
      </button>
      <button type="button" @click="copyPath('absolute')">
        {{ t('explorer.copy.absolute') }}
      </button>
      <button type="button" @click="revealInFolder">
        {{ t('explorer.reveal') }}
      </button>
      <button type="button" @click="renameEntry">
        {{ t('explorer.rename') }}
      </button>
      <div class="menu-separator" />
      <button type="button" @click="createEntry('file')">
        {{ t('explorer.create.file') }}
      </button>
      <button type="button" @click="createEntry('directory')">
        {{ t('explorer.create.folder') }}
      </button>
      <div class="menu-separator" />
      <button type="button" class="danger" @click="deleteEntry">
        {{ t('explorer.delete') }}
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, h, type PropType } from 'vue'
import type { FileNode } from '@shared/types'

function rowIcon(isDir: boolean, isOpen: boolean) {
  if (isDir) {
    return h(
      'svg',
      { class: 'row-icon', viewBox: '0 0 16 16', 'aria-hidden': 'true' },
      [
        h('path', {
          d: isOpen
            ? 'M2 5.25h4.1l1.15 1.25H14l-1.2 6H3.05L2 5.25Zm0-2h4.45l1.1 1.25H14v2H7.25L6.1 5.25H2v-2Z'
            : 'M2 4h4.45l1.1 1.25H14v7.5H2V4Z',
          fill: 'currentColor'
        })
      ]
    )
  }

  return h(
    'svg',
    { class: 'row-icon', viewBox: '0 0 16 16', 'aria-hidden': 'true' },
    [
      h('path', {
        d: 'M4 2.5h5.4L12 5.1v8.4H4v-11Zm5.1.9v2h2M5.6 8h4.8M5.6 10.2h3.2',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-width': '1.2'
      })
    ]
  )
}

const FileRow = defineComponent({
  name: 'FileRow',
  props: {
    node: { type: Object as PropType<FileNode>, required: true },
    depth: { type: Number, required: true },
    expanded: { type: Object as PropType<Set<string>>, required: true },
    childrenCache: { type: Object as PropType<Record<string, FileNode[]>>, required: true },
    selectedPath: { type: String as PropType<string | null | undefined>, default: null }
  },
  emits: ['toggle', 'open-menu'],
  setup(props, { emit }) {
    return () => {
      const isOpen = props.expanded.has(props.node.path)
      const rows = [
        h(
          'li',
          {
            class: [
              'row-item',
              {
                selected: !props.node.isDir && props.selectedPath === props.node.path
              }
            ],
            style: { paddingLeft: `${props.depth * 14 + 6}px` },
            title: props.node.path,
            onClick: () => emit('toggle', props.node),
            onContextmenu: (event: MouseEvent) => emit('open-menu', props.node, event)
          },
          [
            rowIcon(props.node.isDir, isOpen),
            h('span', { class: props.node.isDir ? 'dir' : 'file' }, props.node.name)
          ]
        )
      ]
      if (props.node.isDir && isOpen) {
        const children = props.childrenCache[props.node.path] ?? []
        for (const child of children) {
          rows.push(
            h(FileRow, {
              node: child,
              depth: props.depth + 1,
              expanded: props.expanded,
              childrenCache: props.childrenCache,
              selectedPath: props.selectedPath,
              onToggle: (n: FileNode) => emit('toggle', n),
              onOpenMenu: (n: FileNode, event: MouseEvent) => emit('open-menu', n, event)
            })
          )
        }
      }
      return rows
    }
  }
})

export default {
  components: { FileRow }
}
</script>

<style scoped>
.explorer {
  padding: 0 0 8px;
}
.section-head {
  min-height: 34px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-weight: 600;
  color: var(--text-dim);
  text-transform: uppercase;
  font-size: var(--app-font-size-xs);
  letter-spacing: 0.5px;
}
.empty {
  color: var(--text-dim);
  padding: 8px 12px;
  font-size: var(--app-font-size-sm);
}
.tree {
  list-style: none;
  margin: 0;
  padding: 0;
}
.context-menu {
  position: fixed;
  z-index: 50;
  min-width: 198px;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--bg-soft);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.32);
}
.context-menu button {
  width: 100%;
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.context-menu button:hover {
  background: var(--list-focus);
  color: var(--text);
}
.context-menu button.danger:hover {
  color: var(--danger);
}
.menu-separator {
  height: 1px;
  margin: 5px 3px;
  background: var(--border);
}
:deep(.row-item) {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
  padding: 2px 8px 2px 4px;
  border-radius: 0;
  cursor: pointer;
  white-space: nowrap;
}
:deep(.row-item:hover) {
  background: var(--list-hover);
}
:deep(.row-item.selected) {
  background: var(--list-focus);
  color: var(--text);
}
:deep(.row-icon) {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  color: var(--text-dim);
}
:deep(.dir) {
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
}
:deep(.file) {
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
}
</style>
