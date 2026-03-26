import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false'
const CLIENT_VERSION = '20.10.38'
const ANDROID_UA = `com.google.android.youtube/${CLIENT_VERSION} (Linux; U; Android 14)`

// Try fetching via web page scraping (browser-like)
async function fetchViaWebPage(videoId: string) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'ja,en;q=0.9',
    },
  })
  if (!res.ok) return null
  const html = await res.text()
  // Extract caption tracks from ytInitialPlayerResponse
  const match = html.match(/"captionTracks":(\[.*?\])/)
  if (!match) return null
  try {
    const tracks = JSON.parse(match[1])
    return Array.isArray(tracks) && tracks.length > 0 ? tracks : null
  } catch {
    return null
  }
}

// Try InnerTube Android API
async function fetchViaInnerTube(videoId: string) {
  const res = await fetch(INNERTUBE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': ANDROID_UA,
    },
    body: JSON.stringify({
      context: { client: { clientName: 'ANDROID', clientVersion: CLIENT_VERSION } },
      videoId,
    }),
  })
  if (!res.ok) return null
  const json = await res.json()
  const tracks = json?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  return Array.isArray(tracks) && tracks.length > 0 ? tracks : null
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
}

function parseXml(xml: string) {
  const segments: { text: string; offset: number; duration: number }[] = []
  // New format <p t="..." d="...">
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
    if (text) segments.push({ text, offset, duration })
  }
  if (segments.length > 0) return segments
  // Legacy format <text start="..." dur="...">
  const textRe = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g
  while ((m = textRe.exec(xml)) !== null) {
    const offset = Math.round(parseFloat(m[1]) * 1000)
    const duration = Math.round(parseFloat(m[2]) * 1000)
    const text = decodeEntities(m[3].trim())
    if (text) segments.push({ text, offset, duration })
  }
  return segments
}

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('videoId')
  if (!videoId) return NextResponse.json({ error: 'missing videoId' }, { status: 400 })

  try {
    // Try both methods
    let tracks = await fetchViaInnerTube(videoId)
    if (!tracks) tracks = await fetchViaWebPage(videoId)
    if (!tracks) return NextResponse.json({ error: 'no_transcript' }, { status: 404 })

    // Prefer Japanese, fallback to first track
    const track: { languageCode: string; baseUrl: string } =
      tracks.find((t: { languageCode: string }) => t.languageCode === 'ja') ?? tracks[0]

    const xmlRes = await fetch(track.baseUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!xmlRes.ok) return NextResponse.json({ error: 'no_transcript' }, { status: 404 })
    const xml = await xmlRes.text()
    const raw = parseXml(xml)
    if (!raw.length) return NextResponse.json({ error: 'no_transcript' }, { status: 404 })

    const segments = raw.map((s, i) => ({
      index: i,
      startTime: s.offset / 1000,
      endTime: (s.offset + s.duration) / 1000,
      text: s.text,
    }))
    return NextResponse.json({ segments })
  } catch (e) {
    console.error('[transcript]', e)
    return NextResponse.json({ error: 'no_transcript' }, { status: 404 })
  }
}
