import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_SCORING_WEIGHTS } from "@/lib/domain/scoring";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const provider = process.env.RESEARCH_PROVIDER ?? "mock";
  const hermesConfigured = Boolean(process.env.HERMES_API_URL);
  const hermesCommandConfigured = Boolean(process.env.HERMES_COMMAND);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Local demo configuration, scoring methodology, and Hermes adapter status.</p>
      </div>
      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Research Provider</CardTitle>
            <CardDescription>Mock mode works without credentials. Hermes mode requires an adapter endpoint.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-md border border-border bg-white p-3">
              <span>RESEARCH_PROVIDER</span>
              <Badge variant={provider === "hermes" ? "success" : "muted"}>{provider}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-white p-3">
              <span>HERMES_API_URL</span>
              <Badge variant={hermesConfigured ? "success" : "warning"}>{hermesConfigured ? "configured" : "not configured"}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-white p-3">
              <span>HERMES_COMMAND</span>
              <Badge variant={hermesCommandConfigured ? "success" : "warning"}>{hermesCommandConfigured ? "configured" : "not configured"}</Badge>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              `HERMES_COMMAND` can point to a local CLI such as `hermes`. When Hermes is unavailable or misconfigured, the API records a fallback and uses mock research rather than fabricating Hermes results.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Default Scoring Formula</CardTitle>
            <CardDescription>This is a prioritization heuristic, not an objective founder-quality score.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(DEFAULT_SCORING_WEIGHTS).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded-md border border-border bg-white p-3 text-sm">
                <span>{key.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`)}</span>
                <Badge variant="outline">{value}%</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Human Approval Model</CardTitle>
          <CardDescription>External actions stay simulated unless real credentials are added outside the MVP.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {["Draft-only", "Approval required", "Simulated send", "Simulated schedule"].map((item) => (
            <div key={item} className="rounded-md border border-border bg-white p-3 text-sm font-medium">{item}</div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
