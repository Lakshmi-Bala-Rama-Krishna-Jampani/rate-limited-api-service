import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rate-Limited API Service",
  description: "HTTP API with per-user rate limiting and stats",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
