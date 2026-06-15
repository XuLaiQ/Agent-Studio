<script setup lang="ts">
import { onMounted } from 'vue'
import { useStudioStore } from './stores/studio'
import ProjectSidebar from './components/ProjectSidebar.vue'
import FileExplorer from './components/FileExplorer.vue'
import VersionControlPanel from './components/VersionControlPanel.vue'
import AgentWorkspace from './components/AgentWorkspace.vue'
import {
  locale,
  setLocale,
  elementLocale,
  t,
  LOCALE_OPTIONS,
  type Locale
} from './i18n'

const store = useStudioStore()
onMounted(() => store.loadProjects())
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <div class="app-shell">
      <header class="header">
        <span class="logo">⬡ Agent Studio</span>
        <span class="subtitle">{{ t('app.subtitle') }}</span>
        <div class="spacer" />
        <el-select
          :model-value="locale"
          size="small"
          class="lang-select"
          :title="t('lang.label')"
          @update:model-value="(v: Locale) => setLocale(v)"
        >
          <el-option
            v-for="opt in LOCALE_OPTIONS"
            :key="opt.value"
            :value="opt.value"
            :label="opt.label"
          />
        </el-select>
      </header>

      <div class="body">
        <aside class="left">
          <ProjectSidebar class="left-top" />
          <VersionControlPanel class="left-middle" />
          <FileExplorer class="left-bottom" />
        </aside>
        <main class="main">
          <AgentWorkspace />
        </main>
      </div>
    </div>
  </el-config-provider>
</template>

<style scoped>
.header {
  height: 40px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  background: var(--bg-soft);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
}
.logo {
  font-weight: 600;
  color: var(--accent);
}
.subtitle {
  color: var(--text-dim);
  font-size: 12px;
}
.spacer {
  flex: 1;
}
.lang-select {
  width: 110px;
  /* Re-enable interaction inside the draggable header. */
  -webkit-app-region: no-drag;
}
.body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.left {
  width: 280px;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  background: var(--bg-soft);
  border-right: 1px solid var(--border);
}
.left-top {
  flex: 0 0 auto;
  max-height: 34%;
  overflow: auto;
}
.left-middle {
  flex: 0 0 auto;
  max-height: 36%;
  border-top: 1px solid var(--border);
  overflow: auto;
}
.left-bottom {
  flex: 1;
  min-height: 0;
  border-top: 1px solid var(--border);
  overflow: auto;
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
}
</style>
