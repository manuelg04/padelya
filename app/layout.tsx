import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";

import "./globals.css";
import { Providers } from "@/app/providers";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "Padel por Link",
  description: "Organiza partidos de pádel por link para WhatsApp.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Padel por Link",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.svg", type: "image/svg+xml" },
      { url: "/icon-512.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon-192.svg" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${geist.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
