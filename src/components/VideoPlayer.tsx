'use client'

import { useState, useCallback, useRef } from 'react'
import { useYouTubePlayer } from '@/hooks/useYouTubePlayer'
import { Link, AlertCircle, Loader2 } from 'lucide-react'
import clsx from 'clsx'

interface VideoPlayerProps {
  onPlayerReady: (controls: {
    seekTo: (s: number) => void
    getCurrentTime: () => number
    getPlayerState: () => number
  }) => void
  onVideoLoad: (videoId: string) => void
}

function parseVideoId(input: string): string | null {
  try {
    const url = new URL(input)
    if (url.hostname.includes('youtu.be')) {
      return url.pathname.slice(1).split('?')[0]
    }
    if (url.hostname.includes('youtube.com')) {
      return url.searchParams.get('v')
    }
  } catch {}
  // bare ID (11 chars)
  if (/^[A-Za-z0-9_-]{11}$/.test(input.trim())) return input.trim()
  return null
}

export default function VideoPlayer({ onPlayerReady, onVideoLoad }: VideoPlayerProps) {
  const [url, setUrl] = useState('')
  const [videoId, setVideoId] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const controlsReadyRef = useRef(false)

  const handleReady = useCallback(() => {
    if (controlsReadyRef.current) return
    controlsReadyRef.current = true
    setStatus('ready')
    onPlayerReady({ seekTo, getCurrentTime, getPlayerState })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleError = useCallback((code: number) => {
    const msgs: Record<number, string> = {
      2: '影片 ID 無效，請確認連結格式。',
      5: '影片無法在嵌入播放器中播放。',
      100: '影片無法載入，請確認連結是否公開或存在。',
      101: '影片擁有者不允許嵌入播放。',
      150: '影片擁有者不允許嵌入播放。',
    }
    setErrorMsg(msgs[code] ?? `影片載入失敗（錯誤碼 ${code}），請確認連結是否公開。`)
    setStatus('error')
  }, [])

  const { playerRef, seekTo, getCurrentTime, getPlayerState } = useYouTubePlayer({
    videoId: videoId ?? '',
    onReady: handleReady,
    onError: handleError,
  })

  const handleLoad = () => {
    const id = parseVideoId(url.trim())
    if (!id) {
      setErrorMsg('無法解析 YouTube 連結，請貼入完整 URL 或 11 位影片 ID。')
      setStatus('error')
      return
    }
    controlsReadyRef.current = false
    setStatus('loading')
    setErrorMsg('')
    setVideoId(id)
    onVideoLoad(id)
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* URL Input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
            placeholder="貼入 YouTube URL 或影片 ID…"
            className={clsx(
              'w-full pl-9 pr-4 py-2.5 rounded-xl text-sm',
              'bg-slate-800 border border-slate-600 text-slate-100 placeholder-slate-500',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
              'transition-all'
            )}
          />
        </div>
        <button
          onClick={handleLoad}
          disabled={status === 'loading'}
          className={clsx(
            'px-4 py-2.5 rounded-xl text-sm font-semibold',
            'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-all duration-150'
          )}
        >
          {status === 'loading' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : '載入'}
        </button>
      </div>

      {/* Error */}
      {status === 'error' && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Player Container */}
      <div
        className={clsx(
          'relative w-full rounded-xl overflow-hidden bg-black',
          'aspect-video',
          !videoId && 'hidden'
        )}
      >
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          </div>
        )}
        <div ref={playerRef} className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full" />
      </div>

      {!videoId && (
        <div className="flex items-center justify-center aspect-video rounded-xl bg-slate-800/50 border-2 border-dashed border-slate-700">
          <div className="text-center text-slate-500 px-4">
            <div className="text-4xl mb-2">▶</div>
            <p className="text-sm">貼入 YouTube URL 開始學習</p>
          </div>
        </div>
      )}
    </div>
  )
}
