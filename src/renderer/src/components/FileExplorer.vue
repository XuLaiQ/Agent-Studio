<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useStudioStore } from '../stores/studio'
import { t } from '../i18n'
import type { FileNode } from '@shared/types'

const store = useStudioStore()
const roots = ref<FileNode[]>([])
const expanded = ref<Set<string>>(new Set())
const childrenCache = ref<Record<string, FileNode[]>>({})
const contextMenu = ref<{ node: FileNode; x: number; y: number } | null>(null)

watch(
  () => store.activeProject?.path,
  async (path) => {
    expanded.value = new Set()
    childrenCache.value = {}
    closeContextMenu()
    roots.value = path ? await window.studio.readDir(path) : []
  },
  { immediate: true }
)

async function toggle(node: FileNode): Promise<void> {
  if (!node.isDir) return
  if (expanded.value.has(node.path)) {
    expanded.value.delete(node.path)
  } else {
    if (!childrenCache.value[node.path]) {
      childrenCache.value[node.path] = await window.studio.readDir(node.path)
    }
    expanded.value.add(node.path)
  }
}

function openContextMenu(node: FileNode, event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()

  const menuWidth = 190
  const menuHeight = 74
  contextMenu.value = {
    node,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
  }
}

function closeContextMenu(): void {
  contextMenu.value = null
}

function relativePathFor(nodePath: string): string {
  const rootPath = store.activeProject?.path
  if (!rootPath) return nodePath

  const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedNode = nodePath.replace(/\\/g, '/')
  const rootPrefix = `${normalizedRoot}/`

  if (normalizedNode.toLowerCase() === normalizedRoot.toLowerCase()) return '.'
  if (!normalizedNode.toLowerCase().startsWith(rootPrefix.toLowerCase())) return nodePath

  const relative = normalizedNode.slice(rootPrefix.length)
  return rootPath.includes('\\') ? relative.replace(/\//g, '\\') : relative
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

function closeContextMenuOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeContextMenu()
}

onMounted(() => {
  window.addEventListener('click', closeContextMenu)
  window.addEventListener('contextmenu', closeContextMenu)
  window.addEventListener('keydown', closeContextMenuOnEscape)
  window.addEventListener('blur', closeContextMenu)
  window.addEventListener('scroll', closeContextMenu, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeContextMenu)
  window.removeEventListener('contextmenu', closeContextMenu)
  window.removeEventListener('keydown', closeContextMenuOnEscape)
  window.removeEventListener('blur', closeContextMenu)
  window.removeEventListener('scroll', closeContextMenu, true)
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
      <button type="button" @click="copyPath('relative')">
        {{ t('explorer.copy.relative') }}
      </button>
      <button type="button" @click="copyPath('absolute')">
        {{ t('explorer.copy.absolute') }}
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, h, type PropType } from 'vue'

// Recursive row rendered with a render function so it can reference itself.
const FileRow = defineComponent({
  name: 'FileRow',
  props: {
    node: { type: Object as PropType<FileNode>, required: true },
    depth: { type: Number, required: true },
    expanded: { type: Object as PropType<Set<string>>, required: true },
    childrenCache: { type: Object as PropType<Record<string, FileNode[]>>, required: true }
  },
  emits: ['toggle', 'open-menu'],
  setup(props, { emit }) {
    return () => {
      const isOpen = props.expanded.has(props.node.path)
      const icon = props.node.isDir ? (isOpen ? '▾' : '▸') : '·'
      const rows = [
        h(
          'li',
          {
            class: 'row-item',
            style: { paddingLeft: `${props.depth * 14 + 6}px` },
            onClick: () => emit('toggle', props.node),
            onContextmenu: (event: MouseEvent) => emit('open-menu', props.node, event)
          },
          [
            h('span', { class: 'icon' }, icon),
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
  padding: 8px;
}
.section-head {
  padding: 4px 4px 8px;
  font-weight: 600;
  color: var(--text-dim);
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
}
.empty {
  color: var(--text-dim);
  padding: 8px 6px;
  font-size: 12px;
}
.tree {
  list-style: none;
  margin: 0;
  padding: 0;
}
.context-menu {
  position: fixed;
  z-index: 50;
  min-width: 178px;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: 6px;
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
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.context-menu button:hover {
  background: var(--bg-panel);
  color: var(--accent);
}
:deep(.row-item) {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}
:deep(.row-item:hover) {
  background: var(--bg-panel);
}
:deep(.icon) {
  width: 12px;
  color: var(--text-dim);
}
:deep(.dir) {
  color: var(--accent);
}
:deep(.file) {
  color: var(--text);
}
</style>
