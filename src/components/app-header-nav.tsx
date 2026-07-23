"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/overview", label: "Overview" },
  { href: "/research", label: "Research" },
  { href: "/contacts", label: "Contacts" },
  { href: "/profile", label: "Profile" },
  { href: "/audit", label: "Audit Log" },
];

export function AppHeaderNav({
  accountLabel,
  ctaDisabled,
  ctaHref,
  ctaLabel,
}: {
  accountLabel?: string | null;
  ctaDisabled: boolean;
  ctaHref: string;
  ctaLabel: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeFor = (href: string) => pathname === href || (href === "/overview" && pathname === "/") || (href !== "/" && pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-30 bg-background/96 backdrop-blur">
      <div className="mx-auto flex min-h-[72px] w-full max-w-[1480px] items-center gap-5 px-5 sm:px-8 lg:px-10">
        <Link href="/" className="shrink-0 leading-none">
          <span className="block text-sm font-medium uppercase tracking-[0.19em] text-foreground">LARGEVCMODEL</span>
          <span className="mt-1 block text-[0.58rem] uppercase tracking-[0.18em] text-muted-foreground">
            Network Intelligence
          </span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-7 lg:flex" aria-label="Primary">
          {navItems.map((item) => {
            const active = activeFor(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative py-7 text-[0.68rem] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground",
                  active && "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-primary",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden items-center gap-4 sm:flex">
          {accountLabel ? (
            <span className="hidden max-w-[180px] truncate text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground xl:block">
              {accountLabel}
            </span>
          ) : null}
          <Link
            href="/settings"
            className={cn(
              "text-[0.68rem] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground",
              pathname.startsWith("/settings") && "text-foreground",
            )}
          >
            Settings
          </Link>
          {ctaDisabled ? (
            <Button variant="outline" size="sm" disabled>
              {ctaLabel}
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link href={ctaHref}>{ctaLabel}</Link>
            </Button>
          )}
        </div>

        <button
          type="button"
          className="ml-auto border border-border px-3 py-2 text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground sm:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
        >
          Menu
        </button>
      </div>

      {mobileOpen ? (
        <nav
          id="mobile-navigation"
          className="fixed inset-x-0 top-[72px] z-40 border-y border-border bg-background px-5 py-7 sm:hidden"
          aria-label="Mobile primary"
        >
          <div className="space-y-5">
            {[...navItems, { href: "/settings", label: "Settings" }].map((item) => {
              const active = activeFor(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "block text-sm uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground",
                    active && "text-foreground underline decoration-primary underline-offset-8",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            {ctaDisabled ? (
              <Button variant="outline" size="sm" disabled>
                {ctaLabel}
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href={ctaHref} onClick={() => setMobileOpen(false)}>
                  {ctaLabel}
                </Link>
              </Button>
            )}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
