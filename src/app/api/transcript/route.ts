import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'

// Encode video ID as protobuf for get_transcript params
function encodeTranscriptParams(videoId: string): string {
  const videoIdBytes = new TextEncoder().encode(videoId)
  const proto = new Uint8Array(2 + videoIdBytes.length)
  proto[0] = 0x0a
  proto[1] = videoIdBytes.length
  proto.set(videoIdBytes, 2)
  return btoa(Array.from(proto).map(b => String.fromCharCode(b)).join(''))
}

// Method 1: YouTube's own "Show transcript" API (get_transcript)
async function fetchViaGetTranscript(videoId: string) {
  const params = encodeTranscriptParams(videoId)
  const res = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=${INNERTUBE_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en' } },
      params,
    }),
  })
  if (!res.ok) return null
  const json = await res.json()
  // Navigate the response structure
  const actions = json?.actions?.[0]?.updateEngagementPanelAction?.content
    ?.transcriptRenderer?.content?.transcriptSearchPanelRenderer
    ?.body?.transcriptSegmentListRenderer?.initialSegments
  if (!Array.isArray(actions)) return null
  return actions
    .map((a: { transcriptSegmentRenderer?: { snippet?: { runs?: { text: string }[] }; startMs?: string; endMs?: string } }) => {
      const seg = a?.transcriptSegmentRenderer
      if (!seg) return null
      const text = seg.snippet?.runs?.map((r: { text: string }) => r.text).join('') ?? ''
      const startMs = parseInt(seg.startMs ?? '0', 10)
      const endMs = parseInt(seg.endMs ?? '0', 10)
      return { text, startTime: startMs / 1000, endTime: endMs / 1000 }
    })
    .filter((s): s is { text: string; startTime: number; endTime: number } => !!s?.text)
}

// Method 2: InnerTube Android API → signed timedtext URL
const ANDROID_UA = `com.google.android.youtube/20.10.38 (Linux; U; Android 14; Pixel 8 Pro Build/AP2A.240805.005)`

async function fetchViaInnerTube(videoId: string) {
  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': ANDROID_UA,
      'X-YouTube-Client-Name': '3',
      'X-YouTube-Client-Version': '20.10.38',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/',
    },
    body: JSON.stringify({
      context: { client: {
        clientName: 'ANDROID',
        clientVersion: '20.10.38',
        androidSdkVersion: 34,
        userAgent: ANDROID_UA,
        osName: 'Android',
        osVersion: '14',
      }},
      videoId,
    }),
  })
  if (!res.ok) return null
  const json = await res.json()
  const tracks = json?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!Array.isArray(tracks) || !tracks.length) return null
  const track: { languageCode: string; baseUrl: string } =
    tracks.find((t: { languageCode: string }) => t.languageCode === 'ja') ?? tracks[0]
  const xmlRes = await fetch(track.baseUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!xmlRes.ok) return null
  return parseXml(await xmlRes.text())
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
}

function parseXml(xml: string) {
  const segments: { text: string; startTime: number; endTime: number }[] = []
  const pRe = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g
  let m
  while ((m = pRe.exec(xml)) !== null) {
    const offset = parseInt(m[1], 10)
    const duration = parseInt(m[2], 10)
    const inner = m[3]
    let text = ''
    const sRe = /<s[^>]*>([^<]*)<\/s>/g
    let s
    while ((s = sRe.exec(inner)) !== null) text += s[1]
    if (!text) text = inner.replace(/<[^>]+>/g, '')
    text = decodeEntities(text.trim())
    if (text) segments.push({ text, startTime: offset / 1000, endTime: (offset + duration) / 1000 })
  }
  if (segments.length > 0) return segments
  const textRe = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g
  while ((m = textRe.exec(xml)) !== null) {
    const offset = parseFloat(m[1])
    const duration = parseFloat(m[2])
    const text = decodeEntities(m[3].trim())
    if (text) segments.push({ text, startTime: offset, endTime: offset + duration })
  }
  return segments
}

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('videoId')
  if (!videoId) return NextResponse.json({ error: 'missing videoId' }, { status: 400 })

  try {
    // Try get_transcript first (YouTube's own transcript API)
    const fromGetTranscript = await fetchViaGetTranscript(videoId)
    if (fromGetTranscript?.length) {
      const segments = fromGetTranscript.map((s, i) => ({ index: i, ...s }))
      return NextResponse.json({ segments, source: 'get_transcript' })
    }

    // Fallback: InnerTube Android
    const fromInnerTube = await fetchViaInnerTube(videoId)
    if (fromInnerTube?.length) {
      const segments = fromInnerTube.map((s, i) => ({ index: i, ...s }))
      return NextResponse.json({ segments, source: 'innertube' })
    }

    return NextResponse.json({ error: 'no_transcript' }, { status: 404 })
  } catch (e) {
    console.error('[transcript]', e)
    return NextResponse.json({ error: 'no_transcript' }, { status: 404 })
  }
}
