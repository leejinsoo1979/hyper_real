/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string
  readonly VITE_GEMINI_MODEL: string
  readonly VITE_USE_MOCK: string
  readonly VITE_MATERIAL_CDN_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
