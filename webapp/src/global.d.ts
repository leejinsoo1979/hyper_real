export {}

declare global {
  interface Window {
    vizmakerNative?: {
      getSketchUpSourceId: () => Promise<string | null>
      setSketchUpTitleHint: (title: string) => void
    }
  }
}
