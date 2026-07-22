import type { Metadata } from "next";
import "./globals.css";
import { AppHeader } from "@/components/app-header";

export const metadata: Metadata = {
  title: "LargeVCModel",
  description: "AI-native operating system for VC relationship discovery and outreach.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <AppHeader />
        <main className="min-w-0">{children}</main>
      </body>
    </html>
  );
}
