import { NextRequest, NextResponse } from 'next/server'
import { YoutubeTranscript } from 'youtube-transcript'

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('videoId')
  if (!videoId) return NextResponse.json({ error: 'missing videoId' }, { status: 400 })

  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId)
    const segments = items.map((item, i) => ({
      index: i,
      startTime: item.offset / 1000,
      endTime: (item.offset + item.duration) / 1000,
      text: item.text,
    }))
    return NextResponse.json({ segments })
  } catch {
    return NextResponse.json({ error: 'no_transcript' }, { status: 404 })
  }
}
