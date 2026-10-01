import type { Metadata } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: {
    default: "36 — Creative Studio Marketplace",
    template: "%s · 36",
  },
  description:
    "Find and book independent recording, podcast, photo and video studios.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="air-theme">{children}<PwaRegister /></body>
    </html>
  );
}
