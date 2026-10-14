// Browser helpers around the output: images made PDF-ready, print, download, file names.
import type { ResolvedImage } from '../context.ts'
import { blobToDataUri, dataUriType, isDataUri } from '../images.ts'
import type { Resolution } from '../resolve.ts'

export const PDF_TYPE = 'application/pdf'
export const HTML_TYPE = 'text/html'

// Converts an image that PDF can't embed (GIF, WebP) to PNG through a canvas; null without a canvas.
async function toPng(blob: Blob): Promise<string | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
  try {
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
    bitmap.close()
    const url = canvas.toDataURL('image/png')
    return url.startsWith('data:image/png;base64,') ? url : null
  } catch {
    return null
  }
}

async function pdfReady(image: ResolvedImage, fetcher: typeof fetch): Promise<ResolvedImage | null> {
  const type = isDataUri(image.src) ? dataUriType(image.src) : null
  if (type === 'image/png' || type === 'image/jpeg') return image
  try {
    // The source was vouched for by the provider (data:, blob: or https:, see images.ts).
    const blob = await (await fetcher(image.src, { credentials: 'omit', redirect: 'error' })).blob()
    const uri = await blobToDataUri(blob)
    const usable = uri && /^data:image\/(png|jpeg);/.test(uri) ? uri : await toPng(blob)
    return usable ? { ...image, src: usable } : null
  } catch {
    return null
  }
}

// The resolution with every image as a PNG or JPEG `data:` URI, as PDF needs; an image that can't be
// converted is left out (and so not printed).
export async function withPdfImages(resolution: Resolution, fetcher: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<Resolution> {
  const entries = await Promise.all([...resolution.images].map(async ([id, image]) => [id, await pdfReady(image, fetcher)] as const))
  return { ...resolution, images: new Map(entries.filter((e): e is readonly [string, ResolvedImage] => e[1] !== null)) }
}

export const PRINT_FRAME_ID = 'ie-print-frame'
const PRINT_FRAME_LIFETIME_MS = 60_000
let cleanupPrint: (() => void) | null = null

// Opens the browser's print dialog on a PDF through a hidden same-origin frame.
export function printPdf(bytes: Uint8Array, frameTitle = 'PDF'): void {
  cleanupPrint?.()
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: PDF_TYPE }))
  const frame = document.createElement('iframe')
  frame.id = PRINT_FRAME_ID
  frame.title = frameTitle
  frame.hidden = true
  frame.src = url
  frame.addEventListener('load', () => frame.contentWindow?.print(), { once: true })
  document.body.append(frame)
  const timer = setTimeout(() => cleanupPrint?.(), PRINT_FRAME_LIFETIME_MS)
  cleanupPrint = () => {
    clearTimeout(timer)
    frame.remove()
    URL.revokeObjectURL(url)
    cleanupPrint = null
  }
}

export function downloadBytes(bytes: Uint8Array | string, fileName: string, type: string): void {
  const blob = new Blob([typeof bytes === 'string' ? bytes : (bytes as Uint8Array<ArrayBuffer>)], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const pad = (n: number) => String(n).padStart(2, '0')
export const fileDay = (at: Date): string => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`

// A name reduced to lowercase ASCII letters, digits and dashes (accents folded), or the fallback.
export function safeFileSegment(name: string, fallback: string): string {
  const segment = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return segment || fallback
}

// `<yyyy-mm-dd>-<name>-<timestamp>.<extension>`.
export const documentFileName = (name: string, at: Date, extension = 'pdf'): string => `${fileDay(at)}-${safeFileSegment(name, 'document')}-${at.getTime()}.${extension}`
