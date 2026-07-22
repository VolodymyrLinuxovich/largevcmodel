"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  ContactRound,
  GitBranch,
  History,
  MailCheck,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Overview", icon: BarChart3 },
  { href: "/research", label: "Research", icon: Search },
  { href: "/contacts", label: "Contacts", icon: ContactRound },
  { href: "/graph", label: "Relationship Graph", icon: GitBranch },
  { href: "/outreach", label: "Outreach", icon: MailCheck },
  { href: "/meetings", label: "Meetings", icon: CalendarDays },
  { href: "/audit", label: "Audit Log", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-border bg-white/85 px-4 py-5 backdrop-blur lg:block">
      <Link href="/" className="mb-7 flex items-center gap-3 rounded-md px-2 text-foreground">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <span>
          <span className="block text-sm font-semibold">LargeVCModel</span>
          <span className="block text-xs text-muted-foreground">AI-native VC OS</span>
        </span>
      </Link>
      <nav className="space-y-1" aria-label="Primary">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                active && "bg-accent text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-8 rounded-lg border border-border bg-muted/55 p-3 text-xs leading-5 text-muted-foreground">
        Demo mode uses seeded fictional CRM data and local demo sources. Hermes results appear only when explicitly configured.
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-white/90 px-3 py-3 backdrop-blur lg:hidden">
      <div className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        LargeVCModel
      </div>
      <nav className="flex gap-2 overflow-x-auto" aria-label="Mobile primary">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground",
                active && "bg-accent text-accent-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
