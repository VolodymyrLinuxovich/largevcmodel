"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/overview", label: "Overview" },
  { href: "/research", label: "Research" },
  { href: "/contacts", label: "Contacts" },
  { href: "/graph", label: "Relationship Graph" },
  { href: "/outreach", label: "Outreach" },
  { href: "/meetings", label: "Meetings" },
  { href: "/audit", label: "Audit Log" },
];

export function AppHeaderNav({
  ctaDisabled,
  ctaHref,
  ctaLabel,
}: {
  ctaDisabled: boolean;
  ctaHref: string;
  ctaLabel: string;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-[74px] w-full max-w-[1560px] items-center gap-5 px-5 sm:px-8 lg:px-10">
        <Link href="/" className="shrink-0 leading-none">
          <span className="block text-sm font-semibold uppercase tracking-[0.18em] text-foreground">LargeVCModel</span>
          <span className="mt-1 block font-mono text-[0.62rem] uppercase tracking-[0.16em] text-muted-foreground">
            Network Intelligence OS
          </span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-6 xl:flex" aria-label="Primary">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative py-7 font-mono text-[0.67rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground",
                  active && "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-primary",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden items-center gap-3 sm:flex">
          <Link
            href="/settings"
            className={cn(
              "font-mono text-[0.67rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground",
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
      </div>

      <nav
        className="mx-auto flex w-full max-w-[1560px] gap-5 overflow-x-auto border-t border-border px-5 py-3 sm:px-8 lg:px-10 xl:hidden"
        aria-label="Mobile primary"
      >
        {[...navItems, { href: "/settings", label: "Settings" }].map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 font-mono text-[0.64rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground",
                active && "text-foreground underline decoration-primary underline-offset-[14px]",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
