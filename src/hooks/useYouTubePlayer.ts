'use client'

import { useEffect, useRef, useCallback } from 'react'

// @types/youtube provides the YT namespace globally
declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void
  }
}

interface UseYouTubePlayerOptions {
  videoId: string
  onReady?: () => void
  onError?: (code: number) => void
  onStateChange?: (state: number) => void
}

interface UseYouTubePlayerReturn {
  playerRef: React.RefObject<HTMLDivElement>
  isReady: boolean
  seekTo: (seconds: number) => void
  getCurrentTime: () => number
  getPlayerState: () => number
}

let apiLoading = false
let apiReady = false
const readyCallbacks: (() => void)[] = []

function loadYouTubeAPI(): Promise<void> {
  return new Promise((resolve) => {
    if (apiReady) {
      resolve()
      return
    }
    readyCallbacks.push(resolve)
    if (!apiLoading) {
      apiLoading = true
      const prevReady = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        apiReady = true
        if (prevReady) prevReady()
        readyCallbacks.forEach((cb) => cb())
        readyCallbacks.length = 0
      }
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
    }
  })
}

export function useYouTubePlayer({
  videoId,
  onReady,
  onError,
  onStateChange,
}: UseYouTubePlayerOptions): UseYouTubePlayerReturn {
  const containerRef = useRef<HTMLDivElement>(null!)
  const playerRef = useRef<YT.Player | null>(null)
  const isReadyRef = useRef(false)

  const seekTo = useCallback((seconds: number) => {
    if (playerRef.current && isReadyRef.current) {
      playerRef.current.seekTo(seconds, true)
    }
  }, [])

  const getCurrentTime = useCallback((): number => {
    if (playerRef.current && isReadyRef.current) {
      return playerRef.current.getCurrentTime()
    }
    return 0
  }, [])

  const getPlayerState = useCallback((): number => {
    if (playerRef.current && isReadyRef.current) {
      return playerRef.current.getPlayerState()
    }
    return -1
  }, [])

  useEffect(() => {
    if (!videoId) return

    let destroyed = false

    loadYouTubeAPI().then(() => {
      if (destroyed || !containerRef.current) return

      // Clear previous player
      if (playerRef.current) {
        playerRef.current.destroy()
        playerRef.current = null
        isReadyRef.current = false
      }
      containerRef.current.innerHTML = ''
      const div = document.createElement('div')
      containerRef.current.appendChild(div)

      div.setAttribute('allow', 'autoplay; fullscreen; encrypted-media')
      playerRef.current = new window.YT.Player(div, {
        videoId,
        playerVars: {
          rel: 0,
          playsinline: 1,
          modestbranding: 1,
          fs: 1,
        },
        events: {
          onReady: () => {
            if (destroyed) return
            isReadyRef.current = true
            onReady?.()
          },
          onError: (e) => {
            if (destroyed) return
            onError?.(e.data)
          },
          onStateChange: (e) => {
            if (destroyed) return
            onStateChange?.(e.data)
          },
        },
      })
    })

    return () => {
      destroyed = true
      if (playerRef.current) {
        try { playerRef.current.destroy() } catch {}
        playerRef.current = null
        isReadyRef.current = false
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  return {
    playerRef: containerRef,
    isReady: isReadyRef.current,
    seekTo,
    getCurrentTime,
    getPlayerState,
  }
}
