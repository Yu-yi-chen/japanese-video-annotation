'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { TranscriptSegment } from '@/types'

interface UseSyncEngineOptions {
  segments: TranscriptSegment[]
  getCurrentTime: () => number
  isReady: boolean
}

function findActiveSegment(segments: TranscriptSegment[], time: number): string | null {
  for (const seg of segments) {
    if (seg.startTime < 0) continue
    if (time >= seg.startTime && time < seg.endTime) return seg.id
  }
  return null
}

export function useSyncEngine({
  segments,
  getCurrentTime,
  isReady,
}: UseSyncEngineOptions) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const lastIdRef = useRef<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    intervalRef.current = setInterval(() => {
      const time = getCurrentTime()
      const newId = findActiveSegment(segments, time)
      if (newId !== lastIdRef.current) {
        lastIdRef.current = newId
        setActiveId(newId)
      }
    }, 200)
  }, [segments, getCurrentTime, stopPolling])

  useEffect(() => {
    if (isReady && segments.length > 0) {
      startPolling()
    } else {
      stopPolling()
    }
    return stopPolling
  }, [isReady, segments, startPolling, stopPolling])

  return { activeId }
}
