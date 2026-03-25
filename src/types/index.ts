export interface TranscriptSegment {
  id: string // "{videoId}_{index}"
  startTime: number // seconds (float), -1 = no timestamp
  endTime: number // seconds (float)
  kanji: string // HTML string with <ruby> tags
  translation?: string // optional Chinese translation
}

export interface SegmentMeta {
  id: string
  highlightCanvas: string | null // Base64 PNG of pencil highlight overlay, null if empty
  tag: 'important' | 'unknown' | 'lookup' | null
  handwriting: string | null // Base64 PNG of handwriting notes, null if empty
}

export interface VideoSession {
  videoId: string
  title: string
  segments: TranscriptSegment[]
}

export type TagType = 'important' | 'unknown' | 'lookup'
