import Link from "next/link";
import { HealthStateBadge } from "@/components/relationships/health-state-badge";
import { enumLabel } from "@/components/pipeline/labels";
import { SignalFeed, type FeedSignal } from "@/components/watchlist/signal-feed";
import { WatchButton } from "@/components/watchlist/watch-button";
import { ApiActionButton } from "@/components/workspace/api-action-button";
import { EmptyState, HeroHeader, PageFrame, Section, SignInPanel } from "@/components/workspace/core";
import { prisma } from "@/lib/prisma";
import { formatTime } from "@/lib/utils";
import { listSignals, listWatchlist } from "@/lib/watchlist/service";
import { getWorkspaceData } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type Item = Awaited<ReturnType<typeof listWatchlist>>[number];

function describeItem(item: Item): { label: string; href: string | null; targetId: string } {
  if (item.contact) return { label: item.contact.fullName ?? item.contact.primaryEmail ?? "Unnamed contact", href: `/contacts/${item.contact.id}`, targetId: item.contact.id };
  if (item.opportunity) return { label: `${item.opportunity.company.name} opportunity`, href: `/pipeline/${item.opportunity.id}`, targetId: item.opportunity.id };
  return { label: item.company?.name ?? "Company", href: null, targetId: item.company?.id ?? "" };
}

export default async function WatchlistPage() {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;
  const [items, signals] = await Promise.all([listWatchlist(prisma, data.user.id), listSignals(prisma, data.user.id, { limit: 100 })]);
  const byId = new Map(items.map((item) => [item.id, describeItem(item)]));
  const lastChecked = items.reduce<Date | null>((latest, item) => (!latest || item.lastCheckedAt > latest ? item.lastCheckedAt : latest), null);
  const feed: FeedSignal[] = signals.map((signal) => {
    const target = byId.get(signal.watchlistItemId);
    return { ...signal, targetLabel: target?.label ?? "Removed item", targetHref: target?.href ?? null };
  });
  const unread = signals.filter((signal) => !signal.readAt).length;

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="WATCHLIST / SIGNALS"
        title="What changed in your evidence."
        body="Signals are derived only from records LargeVCModel already stores: Gmail and Calendar syncs, research runs you started, relationship-health recalculations, fit scores and pipeline changes. LargeVCModel does not monitor the internet or external news."
      />
      <Section
        eyebrow="Signals"
        title={unread ? `${unread} unread ${unread === 1 ? "signal" : "signals"}` : "No unread signals"}
        aside={
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <ApiActionButton endpoint="/api/watchlist/refresh" variant="outline" size="sm" refreshOnSuccess disabled={!items.length}>
              Check for changes
            </ApiActionButton>
            <ApiActionButton endpoint="/api/watchlist/signals/read" payload={{ all: true }} variant="ghost" size="sm" refreshOnSuccess disabled={!unread}>
              Mark all read
            </ApiActionButton>
          </div>
        }
      >
        <p className="mb-5 font-mono text-[0.66rem] uppercase tracking-[0.12em] text-muted-foreground">
          Last checked: {lastChecked ? formatTime(lastChecked) : "never"}. Checks also run after each sync pass.
        </p>
        {feed.length ? (
          <SignalFeed signals={feed} />
        ) : (
          <EmptyState
            title="No signals yet"
            body={
              items.length
                ? "Nothing new has been stored for your watched items since they were added. Sync Gmail or Calendar, run research, or update the pipeline, then check for changes."
                : "Watch a contact from their profile or an opportunity and its company from the pipeline to start receiving signals."
            }
          />
        )}
      </Section>
      <Section eyebrow="Watched" title={`${items.length} watched ${items.length === 1 ? "item" : "items"}`}>
        {items.length ? (
          <ul className="divide-y divide-border border-y border-border">
            {items.map((item) => {
              const target = describeItem(item);
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {target.href ? (
                        <Link href={target.href} className="underline-offset-4 hover:underline">
                          {target.label}
                        </Link>
                      ) : (
                        target.label
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {enumLabel(item.entityType)} / watching since {formatTime(item.createdAt)} / {item._count.signals} unread
                      {item.opportunity ? ` / ${enumLabel(item.opportunity.stage)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.contact ? <HealthStateBadge state={item.contact.healthState} score={item.contact.healthScore} /> : null}
                    <WatchButton entityType={item.entityType} targetId={target.targetId} itemId={item.id} label={target.label} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="Nothing watched" body="Use the Watch buttons on contact profiles and opportunity pages." />
        )}
      </Section>
    </PageFrame>
  );
}
