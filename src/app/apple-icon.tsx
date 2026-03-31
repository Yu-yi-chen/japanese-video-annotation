import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
          borderRadius: 40,
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderTop: '32px solid transparent',
            borderBottom: '32px solid transparent',
            borderLeft: '56px solid white',
            marginLeft: 8,
          }}
        />
      </div>
    ),
    { ...size }
  )
}
