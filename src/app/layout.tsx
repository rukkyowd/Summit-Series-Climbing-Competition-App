import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Summit Series | Climbing Competition",
  description: "Live scoring and leaderboard for Summit Series climbing competition",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,600;1,9..40,400&family=Share+Tech+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body bg-rock text-chalk antialiased">
        {children}
      </body>
    </html>
  );
}
