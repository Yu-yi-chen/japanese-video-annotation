import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: "Nihonote",
  description: "以 YouTube 影片學習日文，搭配逐字稿同步、手寫標註與 Apple Pencil 支援",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="dark">
      <body className="antialiased bg-[#0a0d14] text-slate-100">
        {children}
      </body>
    </html>
  );
}
