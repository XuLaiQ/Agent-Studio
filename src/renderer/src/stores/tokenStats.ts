import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { TokenUsageStats } from '@shared/types'

export const useTokenStatsStore = defineStore('tokenStats', () => {
  const stats = ref<TokenUsageStats | null>(null)
  const loading = ref(false)
  const todayOnly = ref(false)

  async function load(): Promise<void> {
    loading.value = true
    try {
      stats.value = await window.studio.getTokenUsageStats(todayOnly.value)
    } finally {
      loading.value = false
    }
  }

  function toggleToday(): void {
    todayOnly.value = !todayOnly.value
  }

  return {
    stats,
    loading,
    todayOnly,
    load,
    toggleToday
  }
})
