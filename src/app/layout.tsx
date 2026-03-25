import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "日文影片精讀 & 手寫標註",
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
