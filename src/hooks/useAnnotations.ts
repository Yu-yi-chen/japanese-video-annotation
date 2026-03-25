'use client'

import { useState, useCallback, useRef } from 'react'
import { SegmentMeta, TagType } from '@/types'

export type SaveStatus = 'idle' | 'saving' | 'saved'

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
  } catch {
    return new Map()
  }
}

interface UseAnnotationsOptions {
  videoId: string
  onStorageFull?: () => void
}

export function useAnnotations({ videoId, onStorageFull }: UseAnnotationsOptions) {
  const [metas, setMetas] = useState<Map<string, SegmentMeta>>(() =>
    loadFromStorage(videoId)
  )
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persist = useCallback(
    (nextMap: Map<string, SegmentMeta>) => {
      setSaveStatus('saving')
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        try {
          const arr = Array.from(nextMap.values()).filter(
            (m) => m.highlightCanvas !== null || m.tag !== null || m.handwriting !== null
          )
          if (arr.length === 0) {
            localStorage.removeItem(getStorageKey(videoId))
          } else {
            localStorage.setItem(getStorageKey(videoId), JSON.stringify(arr))
          }
          setSaveStatus('saved')
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
          savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
        } catch (err) {
          setSaveStatus('idle')
          if (
            err instanceof DOMException &&
            (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
          ) {
            onStorageFull?.()
          }
        }
      }, 300)
    },
    [videoId, onStorageFull]
  )


  const saveHighlightCanvas = useCallback(
    (id: string, base64: string) => {
      setMetas((prev) => {
        const next = new Map(prev)
        const m = next.get(id) ?? { id, highlightCanvas: null, tag: null, handwriting: null }
        next.set(id, { ...m, highlightCanvas: base64 })
        persist(next)
        return next
      })
    },
    [persist]
  )

  const clearHighlightCanvas = useCallback(
    (id: string) => {
      setMetas((prev) => {
        const next = new Map(prev)
        const m = next.get(id)
        if (!m) return prev
        const updated = { ...m, highlightCanvas: null }
        if (updated.handwriting === null && updated.tag === null) {
          next.delete(id)
        } else {
          next.set(id, updated)
        }
        persist(next)
        return next
      })
    },
    [persist]
  )

  const setTag = useCallback(
    (id: string, tag: TagType | null) => {
      setMetas((prev) => {
        const next = new Map(prev)
        const m = next.get(id) ?? { id, highlightCanvas: null, tag: null, handwriting: null }
        next.set(id, { ...m, tag })
        persist(next)
        return next
      })
    },
    [persist]
  )

  const saveHandwriting = useCallback(
    (id: string, base64: string) => {
      setMetas((prev) => {
        const next = new Map(prev)
        const m = next.get(id) ?? { id, highlightCanvas: null, tag: null, handwriting: null }
        next.set(id, { ...m, handwriting: base64 })
        persist(next)
        return next
      })
    },
    [persist]
  )

  const clearHandwriting = useCallback(
    (id: string) => {
      setMetas((prev) => {
        const next = new Map(prev)
        const m = next.get(id)
        if (!m) return prev
        const updated = { ...m, handwriting: null }
        if (updated.highlightCanvas === null && updated.tag === null) {
          next.delete(id)
        } else {
          next.set(id, updated)
        }
        persist(next)
        return next
      })
    },
    [persist]
  )

  const clearAll = useCallback(() => {
    setMetas(new Map())
    localStorage.removeItem(getStorageKey(videoId))
  }, [videoId])

  // Reload when videoId changes
  const reloadForVideo = useCallback((newVideoId: string) => {
    setMetas(loadFromStorage(newVideoId))
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
