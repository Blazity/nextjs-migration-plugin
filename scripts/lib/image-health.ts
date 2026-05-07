export interface BrokenImage {
  src: string
  alt: string
  naturalWidth: number
  naturalHeight: number
}

export function summarizeBrokenImages(images: BrokenImage[]): { passed: boolean; detail?: string } {
  if (images.length === 0) return { passed: true }
  return {
    passed: false,
    detail: JSON.stringify({
      brokenImageCount: images.length,
      samples: images.slice(0, 10),
    }),
  }
}
