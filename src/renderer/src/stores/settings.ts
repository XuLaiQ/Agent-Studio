import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'agent-studio.settings.fontSizePx'
const LEGACY_SCALE_STORAGE_KEY = 'agent-studio.settings.fontScale'
const DEFAULT_FONT_SIZE = 13
const MIN_FONT_SIZE = 10
const MAX_FONT_SIZE = 28

const legacyScaleMap: Record<string, number> = {
  compact: 12,
  normal: 13,
  large: 15,
  extra: 17
}

function clampFontSize(value: number): number {
  return Math.min(Math.max(Math.round(value), MIN_FONT_SIZE), MAX_FONT_SIZE)
}

function initialFontSize(): number {
  const saved = Number(localStorage.getItem(STORAGE_KEY))
  if (Number.isFinite(saved) && saved > 0) return clampFontSize(saved)

  const legacy = localStorage.getItem(LEGACY_SCALE_STORAGE_KEY)
  if (legacy && legacy in legacyScaleMap) return legacyScaleMap[legacy]

  return DEFAULT_FONT_SIZE
}

export const useSettingsStore = defineStore('settings', () => {
  const fontSizePx = ref(initialFontSize())

  const cssVars = computed<Record<string, string>>(() => {
    const base = fontSizePx.value
    return {
      '--app-font-size-xxs': `${Math.max(10, base - 3)}px`,
      '--app-font-size-xs': `${Math.max(10, base - 2)}px`,
      '--app-font-size-sm': `${Math.max(11, base - 1)}px`,
      '--app-font-size-base': `${base}px`,
      '--app-font-size-md': `${base + 1}px`,
      '--app-font-size-lg': `${base + 4}px`,
      '--app-font-size-xl': `${base + 7}px`,
      '--app-font-size-xxl': `${base + 13}px`,
      '--app-font-size-hero': `${base + 43}px`
    }
  })

  const terminalFontSize = computed(() => fontSizePx.value)

  function setFontSizePx(next: number | undefined): void {
    if (typeof next !== 'number' || !Number.isFinite(next)) return
    fontSizePx.value = clampFontSize(next)
  }

  watch(fontSizePx, (next) => localStorage.setItem(STORAGE_KEY, String(next)), { immediate: true })

  return {
    fontSizePx,
    minFontSize: MIN_FONT_SIZE,
    maxFontSize: MAX_FONT_SIZE,
    cssVars,
    terminalFontSize,
    setFontSizePx
  }
})
