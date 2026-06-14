<script setup lang="ts">
import { ref, watch } from 'vue'
import { useStudioStore } from '../stores/studio'
import { t } from '../i18n'
import type { FileNode } from '@shared/types'

const store = useStudioStore()
const roots = ref<FileNode[]>([])
const expanded = ref<Set<string>>(new Set())
const childrenCache = ref<Record<string, FileNode[]>>({})

watch(
  () => store.activeProject?.path,
  async (path) => {
    expanded.value = new Set()
    childrenCache.value = {}
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
      />
    </ul>
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
  emits: ['toggle'],
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
            onClick: () => emit('toggle', props.node)
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
              onToggle: (n: FileNode) => emit('toggle', n)
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
