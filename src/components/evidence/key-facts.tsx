import { Badge } from "@/components/ui/badge";
import type { KeyFact } from "@/lib/evidence/types";

export function KeyFactsTable({ facts, citations }: { facts: KeyFact[]; citations: Map<string, number> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <caption className="sr-only">Sensitive investment facts and whether stored evidence establishes them</caption>
        <thead className="border-b border-border font-mono text-[0.66rem] uppercase tracking-[0.08em] text-muted-foreground">
          <tr>
            <th scope="col" className="py-2 pr-3">Fact</th>
            <th scope="col" className="py-2 pr-3">Status</th>
            <th scope="col" className="py-2">Evidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {facts.map((fact) => (
            <tr key={fact.key} className="align-top">
              <th scope="row" className="py-2 pr-3 font-normal">{fact.label}</th>
              <td className="py-2 pr-3">
                <Badge variant={fact.status === "ESTABLISHED" ? "success" : fact.status === "UNVERIFIED" ? "warning" : "muted"}>
                  {fact.status === "UNAVAILABLE" ? "Unavailable" : fact.status === "UNVERIFIED" ? "Unverified" : "Supported"}
                </Badge>
              </td>
              <td className="py-2 text-xs leading-5 text-muted-foreground">
                {fact.items.length
                  ? fact.items.slice(0, 3).map((item) => (
                      <span key={item.id} className="block">
                        {item.text}
                        {item.sourceIds.map((id) => (citations.get(id) ? ` [${citations.get(id)}]` : "")).join("")}
                      </span>
                    ))
                  : "Not established by stored evidence."}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
