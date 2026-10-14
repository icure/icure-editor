// Image safety rules. An image node holds a reference (`imageId`) to the host's image provider; the
// provider resolves it to a source. What may reach an `<img src>`:
// - a `data:` URI of a raster type (PNG, JPEG, GIF, WebP), base64, within the size limit;
// - a `blob:` URL (created by the host for bytes it holds);
// - an `https:` URL, only because the host's provider returned it (never from a document or a paste).
// SVG is refused (it is a document format that can carry scripts and external references).

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
export type ImageType = (typeof IMAGE_TYPES)[number]
// Defaults for uploads; the host may lower or raise them.
export const DEFAULT_MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const MIN_IMAGE_WIDTH = 16
export const MAX_IMAGE_WIDTH = 1600
export const MAX_ALT_LENGTH = 500

const IMAGE_ID = /^[\p{L}\p{N}_.:@/-]{1,200}$/u
export const safeImageId = (value: unknown): string | null => (typeof value === 'string' && IMAGE_ID.test(value) ? value : null)

// Plain text, single line, bounded; control characters become spaces. Not trimmed: it is edited
// keystroke by keystroke.
export function safeAltText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, MAX_ALT_LENGTH)
}

// A width in CSS pixels within bounds, or null (natural size, capped by the page width).
export function clampImageWidth(value: unknown): number | null {
  const width = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,5}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN
  if (!Number.isFinite(width) || width <= 0) return null
  return Math.round(Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, width)))
}

const DATA_URI = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/
// Base64 grows bytes by 4/3.
const base64Bytes = (payload: string): number => Math.floor((payload.length * 3) / 4)

export interface ImageSourceOptions {
  readonly maxBytes?: number
}

// The source an `<img>` may show, or null when it breaks the rules above.
export function safeImageSrc(value: unknown, { maxBytes = DEFAULT_MAX_IMAGE_BYTES }: ImageSourceOptions = {}): string | null {
  if (typeof value !== 'string') return null
  const src = value.trim()
  const data = DATA_URI.exec(src)
  if (data) return base64Bytes(data[2]!) <= maxBytes ? src : null
  if (src.startsWith('blob:')) return /^blob:[^\s"'<>]+$/.test(src) ? src : null
  try {
    const url = new URL(src)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

export const isDataUri = (src: string): boolean => DATA_URI.test(src)
export const dataUriType = (src: string): ImageType | null => (DATA_URI.exec(src)?.[1] as ImageType | undefined) ?? null

export type ImageFileError = 'type' | 'size' | 'content'

export interface ImageFileRules {
  readonly maxBytes?: number
  readonly types?: readonly ImageType[]
}

// The magic numbers of each accepted type: the declared type must match the bytes.
function sniff(bytes: Uint8Array): ImageType | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b)
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif'
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'
  return null
}

// Checks a file before it is handed to the host's upload: declared type, size, and actual content.
export async function checkImageFile(file: Blob, { maxBytes = DEFAULT_MAX_IMAGE_BYTES, types = IMAGE_TYPES }: ImageFileRules = {}): Promise<ImageFileError | null> {
  if (!(types as readonly string[]).includes(file.type)) return 'type'
  if (file.size > maxBytes) return 'size'
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  return sniff(head) === file.type ? null : 'content'
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

// A blob as a `data:` URI, when it is an accepted raster type (its content sniffed).
export async function blobToDataUri(blob: Blob, rules: ImageFileRules = {}): Promise<string | null> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const type = sniff(bytes.subarray(0, 12))
  const allowed = rules.types ?? IMAGE_TYPES
  if (!type || !allowed.includes(type) || bytes.length > (rules.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES)) return null
  return `data:${type};base64,${bytesToBase64(bytes)}`
}
