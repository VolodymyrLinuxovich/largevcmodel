import { DEFAULT_SCORING_WEIGHTS } from "@/lib/domain/scoring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, HeroHeader, IntegrationStatusPanel, PageFrame, Section, SignInPanel } from "@/components/workspace/core";
import { getWorkspaceData } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="SETTINGS / SECURITY"
        title="Control integrations, permissions, and scoring."
        body="Review OAuth scopes, provider health, synchronization state, saved thesis criteria, and the human-approval model for external actions."
        actions={
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="outline">Sign out</Button>
          </form>
        }
      />
      <Section eyebrow="GOOGLE" title="Connected accounts">
        <IntegrationStatusPanel data={data} />
      </Section>
      <Section eyebrow="RESEARCH" title="Provider status">
        <div className="grid border-y border-border lg:grid-cols-3">
          <div className="border-b border-border py-5 lg:border-b-0 lg:border-r lg:pr-6">
            <p className="eyebrow">RESEARCH_PROVIDER</p>
            <p className="mt-3 text-lg font-semibold uppercase">{data.configuration.researchProvider}</p>
          </div>
          <div className="border-b border-border py-5 lg:border-b-0 lg:border-r lg:px-6">
            <p className="eyebrow">Hermes API URL</p>
            <Badge className="mt-3" variant={process.env.HERMES_API_URL ? "success" : "warning"}>{process.env.HERMES_API_URL ? "configured" : "not configured"}</Badge>
          </div>
          <div className="py-5 lg:pl-6">
            <p className="eyebrow">Hermes command</p>
            <Badge className="mt-3" variant={process.env.HERMES_COMMAND ? "success" : "warning"}>{process.env.HERMES_COMMAND ? "configured" : "not configured"}</Badge>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
          If Hermes is unavailable, research runs are marked unavailable and audited. The system does not fabricate replacement research.
        </p>
      </Section>
      <Section eyebrow="SCORING" title="Default weighting">
        <div className="grid border-y border-border md:grid-cols-3 xl:grid-cols-6">
          {Object.entries(DEFAULT_SCORING_WEIGHTS).map(([key, value]) => (
            <div key={key} className="border-b border-border py-5 md:border-r xl:border-b-0 xl:last:border-r-0 md:odd:pr-6 md:even:px-6">
              <p className="eyebrow">{key.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`)}</p>
              <p className="mt-3 font-mono text-2xl">{value}%</p>
            </div>
          ))}
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
          Thesis-fit scores are prioritization heuristics. Every score stores criterion-level evidence, missing information, confidence, date calculated, and provider/model metadata.
        </p>
      </Section>
      <Section eyebrow="PRIVACY" title="Data controls">
        <EmptyState
          title="Sensitive data stays server-side"
          body="OAuth client secrets, access tokens, refresh tokens, research keys, and database credentials are never sent to the browser. Disconnect integrations from the account cards above to revoke provider access."
        />
      </Section>
    </PageFrame>
  );
}
