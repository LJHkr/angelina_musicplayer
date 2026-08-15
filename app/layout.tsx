import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InkTune · 手绘音乐播放器",
  description: "将本地音乐变成会随节拍呼吸的手绘画面。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
