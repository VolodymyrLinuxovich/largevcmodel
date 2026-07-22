"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/research", label: "Research" },
  { href: "/contacts", label: "Contacts" },
  { href: "/graph", label: "Relationship Graph" },
  { href: "/outreach", label: "Outreach" },
  { href: "/meetings", label: "Meetings" },
  { href: "/audit", label: "Audit Log" },
  { href: "/settings", label: "Settings" },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border bg-background/95 lg:block">
      <div className="border-b border-border px-5 py-5">
        <Link href="/" className="block">
          <span className="block text-lg font-semibold uppercase tracking-[0.08em]">LargeVCModel</span>
          <span className="mt-1 block font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
            Network Intelligence OS
          </span>
        </Link>
      </div>
      <nav className="px-0 py-3" aria-label="Primary">
        {navItems.map((item, index) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center justify-between border-b border-border px-5 py-3 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-foreground hover:text-background",
                active && "bg-foreground text-background",
              )}
            >
              <span>{item.label}</span>
              <span className={cn("text-muted-foreground group-hover:text-background", active && "text-background")}>
                {String(index + 1).padStart(2, "0")}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="absolute bottom-0 left-0 right-0 border-t border-border px-5 py-4">
        <p className="font-mono text-[0.64rem] uppercase leading-5 tracking-[0.1em] text-muted-foreground">
          No synthetic records. No automatic sends. No unconfirmed calendar writes.
        </p>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-3 py-3 backdrop-blur lg:hidden">
      <div className="mb-3 flex items-center justify-between px-1">
        <Link href="/" className="text-sm font-semibold uppercase tracking-[0.08em]">
          LargeVCModel
        </Link>
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground">Live Workspace</span>
      </div>
      <nav className="flex gap-2 overflow-x-auto" aria-label="Mobile primary">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 border border-border px-3 py-2 font-mono text-[0.64rem] uppercase tracking-[0.1em] text-muted-foreground",
                active && "bg-foreground text-background",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
