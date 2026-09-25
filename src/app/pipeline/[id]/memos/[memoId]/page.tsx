import Link from "next/link";
import { notFound } from "next/navigation";
import { FinalizeMemoForm } from "@/components/memos/memo-actions";
import { MemoView } from "@/components/memos/memo-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HeroHeader, PageFrame, Section, SignInPanel } from "@/components/workspace/core";
import { getInvestmentMemo } from "@/lib/memos/service";
import { prisma } from "@/lib/prisma";
import { formatTime } from "@/lib/utils";
import { getWorkspaceData } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function InvestmentMemoPage({ params }: { params: Promise<{ id: string; memoId: string }> }) {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;
  const { id, memoId } = await params;
  const memo = await getInvestmentMemo(prisma, data.user.id, memoId);
  if (!memo || memo.opportunityId !== id) notFound();

  return (
    <PageFrame>
      <HeroHeader
        eyebrow={`IC MEMO / VERSION ${memo.version} / ${memo.status}`}
        title={memo.title}
        body={`Assembled ${formatTime(memo.generatedAt)} from stored evidence. ${memo.content.counts.claims} claims and ${memo.content.counts.sources} cited sources were considered.`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/pipeline/${id}`}>Back to opportunity</Link>
          </Button>
        }
      />
      <Section eyebrow="Review" title={memo.status === "FINALIZED" ? "Finalized for investment committee" : "Draft awaiting review"}>
        {memo.status === "FINALIZED" ? (
          <div className="space-y-3 text-sm">
            <Badge variant="success">Finalized</Badge>
            <p className="text-muted-foreground">
              Finalized by {memo.finalizedBy} on {memo.finalizedAt ? formatTime(memo.finalizedAt) : "unknown date"}.
            </p>
            {memo.reviewerNotes ? (
              <div>
                <p className="eyebrow mb-1">Reviewer notes (user provided)</p>
                <p className="whitespace-pre-wrap leading-6">{memo.reviewerNotes}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <FinalizeMemoForm memoId={memo.id} />
        )}
      </Section>
      <MemoView content={memo.content} />
    </PageFrame>
  );
}
