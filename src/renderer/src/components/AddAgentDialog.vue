<script setup lang="ts">
import { ref } from 'vue'
import { useStudioStore } from '../stores/studio'
import { t } from '../i18n'
import { AGENT_COMMANDS, type AgentType } from '@shared/types'

const store = useStudioStore()
const visible = ref(false)
const selected = ref<AgentType>('claude')
const name = ref('')

const options = (Object.keys(AGENT_COMMANDS) as AgentType[]).map((type) => ({
  type,
  label: AGENT_COMMANDS[type].label,
  command: AGENT_COMMANDS[type].command
}))

function open(): void {
  selected.value = 'claude'
  name.value = ''
  visible.value = true
}

async function confirm(): Promise<void> {
  await store.createAgent(selected.value, name.value)
  visible.value = false
}

defineExpose({ open })
</script>

<template>
  <el-dialog v-model="visible" :title="t('dialog.addAgent.title')" width="440px" align-center>
    <div class="grid">
      <div
        v-for="opt in options"
        :key="opt.type"
        class="card"
        :class="{ active: selected === opt.type }"
        @click="selected = opt.type"
      >
        <div class="card-label">{{ opt.label }}</div>
        <code class="card-cmd">{{ opt.command }}</code>
      </div>
    </div>

    <el-input
      v-model="name"
      class="name-input"
      :placeholder="t('dialog.addAgent.namePlaceholder')"
    />

    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="confirm">{{ t('dialog.create') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.card {
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 12px;
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s;
}
.card:hover {
  border-color: var(--accent);
  background: var(--list-hover);
}
.card.active {
  border-color: var(--accent);
  background: var(--list-active);
  box-shadow: inset 0 0 0 1px rgba(139, 92, 246, 0.45);
}
.card-label {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}
.card-cmd {
  font-size: 12px;
  color: var(--text-dim);
}
.name-input {
  margin-top: 14px;
}
</style>
