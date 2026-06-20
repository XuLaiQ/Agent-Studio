import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { TokenUsageStats } from '@shared/types'

export const useTokenStatsStore = defineStore('tokenStats', () => {
  const stats = ref<TokenUsageStats | null>(null)
  const loading = ref(false)

  async function load(): Promise<void> {
    loading.value = true
    try {
      stats.value = await window.studio.getTokenUsageStats()
    } finally {
      loading.value = false
    }
  }

  return {
    stats,
    loading,
    load
  }
})
