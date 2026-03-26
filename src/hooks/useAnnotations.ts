'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { SegmentMeta, TagType } from '@/types'
import { supabase } from '@/lib/supabase'

export type SaveStatus = 'idle' | 'saving' | 'saved'

// ── localStorage helpers (optimistic cache) ──
function getStorageKey(videoId: string) {
  return `annotations_${videoId}`
}
function loadFromStorage(videoId: string): Map<string, SegmentMeta> {
  if (typeof window === 'undefined') return new Map()
  try {
    const raw = localStorage.getItem(getStorageKey(videoId))
    if (!raw) return new Map()
    const arr: SegmentMeta[] = JSON.parse(raw)
    return new Map(arr.map((m) => [m.id, m]))
  } catch { return new Map() }
}
function saveToStorage(videoId: string, map: Map<string, SegmentMeta>) {
  try {
    const arr = Array.from(map.values()).filter(
      (m) => m.highlightCanvas !== null || m.tag !== null || m.handwriting !== null
    )
    if (arr.length === 0) localStorage.removeItem(getStorageKey(videoId))
    else localStorage.setItem(getStorageKey(videoId), JSON.stringify(arr))
  } catch {}
}

// ── Supabase helpers ──
async function loadFromSupabase(videoId: string): Promise<Map<string, SegmentMeta>> {
  const { data, error } = await supabase
    .from('annotations')
    .select('segment_id, tag, highlight_canvas, handwriting')
    .eq('video_id', videoId)
  if (error || !data) return new Map()
  return new Map(
    data.map((row) => [
      row.segment_id,
      {
        id: row.segment_id,
        tag: row.tag ?? null,
        highlightCanvas: row.highlight_canvas ?? null,
        handwriting: row.handwriting ?? null,
      } as SegmentMeta,
    ])
  )
}

async function upsertAnnotation(videoId: string, meta: SegmentMeta) {
  await supabase.from('annotations').upsert({
    segment_id: meta.id,
    video_id: videoId,
    tag: meta.tag ?? null,
    highlight_canvas: meta.highlightCanvas ?? null,
    handwriting: meta.handwriting ?? null,
    updated_at: new Date().toISOString(),
  })
}

async function deleteAnnotation(segmentId: string) {
  await supabase.from('annotations').delete().eq('segment_id', segmentId)
}

async function deleteAllAnnotations(videoId: string) {
  await supabase.from('annotations').delete().eq('video_id', videoId)
}

// ────────────────────────────────────────────────────────────
interface UseAnnotationsOptions {
  videoId: string
  onStorageFull?: () => void
}

export function useAnnotations({ videoId }: UseAnnotationsOptions) {
  const [metas, setMetas] = useState<Map<string, SegmentMeta>>(new Map())
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<Map<string, SegmentMeta | null>>(new Map())

  // Load on videoId change: show localStorage immediately, then fetch Supabase
  useEffect(() => {
    if (!videoId) return
    let cancelled = false
    const local = loadFromStorage(videoId)
    setMetas(local)
    ;(async () => {
      const remote = await loadFromSupabase(videoId)
      if (!cancelled && remote.size > 0) {
        setMetas(remote)
        saveToStorage(videoId, remote)
      }
    })()
    return () => { cancelled = true }
  }, [videoId])

  const persist = useCallback(
    (nextMap: Map<string, SegmentMeta>, changedId?: string, deleted?: boolean) => {
      setSaveStatus('saving')
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (changedId) {
        pendingRef.current.set(changedId, deleted ? null : (nextMap.get(changedId) ?? null))
      }
      debounceRef.current = setTimeout(async () => {
        saveToStorage(videoId, nextMap)
        const pending = new Map(pendingRef.current)
        pendingRef.current.clear()
        await Promise.all(
          Array.from(pending.entries()).map(([id, meta]) =>
            meta === null ? deleteAnnotation(id) : upsertAnnotation(videoId, meta)
          )
        )
        setSaveStatus('saved')
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
      }, 300)
    },
    [videoId]
  )

  const saveHighlightCanvas = useCallback((id: string, base64: string) => {
    setMetas((prev) => {
      const next = new Map(prev)
      const m = next.get(id) ?? { id, highlightCanvas: null, tag: null, handwriting: null }
      next.set(id, { ...m, highlightCanvas: base64 })
      persist(next, id)
      return next
    })
  }, [persist])

  const clearHighlightCanvas = useCallback((id: string) => {
    setMetas((prev) => {
      const next = new Map(prev)
      const m = next.get(id)
      if (!m) return prev
      const updated = { ...m, highlightCanvas: null }
      const isEmpty = updated.handwriting === null && updated.tag === null
      if (isEmpty) { next.delete(id); persist(next, id, true) }
      else { next.set(id, updated); persist(next, id) }
      return next
    })
  }, [persist])

  const setTag = useCallback((id: string, tag: TagType | null) => {
    setMetas((prev) => {
      const next = new Map(prev)
      const m = next.get(id) ?? { id, highlightCanvas: null, tag: null, handwriting: null }
      next.set(id, { ...m, tag })
      persist(next, id)
      return next
    })
  }, [persist])

  const saveHandwriting = useCallback((id: string, base64: string) => {
    setMetas((prev) => {
      const next = new Map(prev)
      const m = next.get(id) ?? { id, highlightCanvas: null, tag: null, handwriting: null }
      next.set(id, { ...m, handwriting: base64 })
      persist(next, id)
      return next
    })
  }, [persist])

  const clearHandwriting = useCallback((id: string) => {
    setMetas((prev) => {
      const next = new Map(prev)
      const m = next.get(id)
      if (!m) return prev
      const updated = { ...m, handwriting: null }
      const isEmpty = updated.highlightCanvas === null && updated.tag === null
      if (isEmpty) { next.delete(id); persist(next, id, true) }
      else { next.set(id, updated); persist(next, id) }
      return next
    })
  }, [persist])

  const clearAll = useCallback(() => {
    setMetas(new Map())
    saveToStorage(videoId, new Map())
    deleteAllAnnotations(videoId)
  }, [videoId])

  const reloadForVideo = useCallback(() => {
    // handled by useEffect on videoId
  }, [])

  return {
    metas,
    saveStatus,
    saveHighlightCanvas,
    clearHighlightCanvas,
    setTag,
    saveHandwriting,
    clearHandwriting,
    clearAll,
    reloadForVideo,
  }
}
