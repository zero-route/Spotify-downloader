import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TuneSave - Spotify Downloader",
  description:
    "Unduh lagu Spotify sebagai MP3 lengkap dengan cover dan info lagu.",
    icons: {
      icon: "/logo.png", 
      shortcut: "/logo.png", 
      apple: "/logo.png"
    }, 
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0b0c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
