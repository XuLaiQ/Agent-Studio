/// <reference types="vite/client" />

import type { StudioApi } from '../../preload'

declare global {
  interface Window {
    studio: StudioApi
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
