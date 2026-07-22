import { prisma } from "@/lib/prisma";
import { RelationshipGraph } from "@/components/graph/relationship-graph";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  const edges = await prisma.relationshipEdge.findMany({ orderBy: { strength: "desc" } });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Relationship Graph</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Click any edge to see whether it came from internal CRM data, event attendance, public research, or manual entry.
        </p>
      </div>
      <RelationshipGraph edges={edges} />
    </div>
  );
}
