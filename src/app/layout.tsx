import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Bebas_Neue, DM_Sans, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

const displayFont = Bebas_Neue({
  subsets: ["latin"],
  variable: "--font-display",
  weight: "400",
});

const bodyFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

const monoFont = Share_Tech_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: "400",
});

export const metadata: Metadata = {
  title: "Summit Series | Climbing Competition",
  description: "Live scoring and leaderboard for Summit Series climbing competition",
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} font-body bg-rock text-chalk antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
