import type { Metadata } from "next";
import "./globals.css";
import { AppSidebar, MobileNav } from "@/components/app-sidebar";

export const metadata: Metadata = {
  title: "LargeVCModel",
  description: "AI-native operating system for VC relationship discovery and outreach.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <div className="flex min-h-screen">
          <AppSidebar />
          <main className="min-w-0 flex-1">
            <MobileNav />
            <div className="w-full">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
