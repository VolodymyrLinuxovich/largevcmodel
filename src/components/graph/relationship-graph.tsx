"use client";

import { useMemo, useState } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type RelationshipEdge = {
  id: string;
  fromNodeId: string;
  fromNodeLabel: string;
  fromNodeType: string;
  toNodeId: string;
  toNodeLabel: string;
  toNodeType: string;
  relationship: string;
  strength: number;
  evidence: string;
  sourceType: string;
  sourceId?: string | null;
};

export function RelationshipGraph({ edges, focusNodeId }: { edges: RelationshipEdge[]; focusNodeId?: string }) {
  const [selected, setSelected] = useState<RelationshipEdge | null>(edges[0] ?? null);
  const { nodes, flowEdges } = useMemo(() => buildGraph(edges, focusNodeId), [edges, focusNodeId]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Relationship Graph</CardTitle>
          <CardDescription>Partners, founders, advisors, portfolio founders, events, and warm introduction paths.</CardDescription>
        </CardHeader>
        <CardContent className="h-[540px] p-0">
          <ReactFlow
            nodes={nodes}
            edges={flowEdges}
            fitView
            onEdgeClick={(_, edge) => {
              const relationship = edges.find((item) => item.id === edge.id);
              if (relationship) setSelected(relationship);
            }}
            nodesDraggable
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={22} color="#d8d3c9" />
            <Controls />
          </ReactFlow>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Connection Evidence</CardTitle>
          <CardDescription>Click an edge to inspect provenance.</CardDescription>
        </CardHeader>
        <CardContent>
          {selected ? (
            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold">
                  {`${selected.fromNodeLabel} -> ${selected.toNodeLabel}`}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{selected.relationship}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Strength {selected.strength}/10</Badge>
                <Badge variant={selected.sourceType === "internal_crm" ? "warning" : "muted"}>{selected.sourceType}</Badge>
              </div>
              <p className="rounded-md bg-muted p-3 text-sm leading-6">{selected.evidence}</p>
              {selected.sourceId?.startsWith("/") ? (
                <a href={selected.sourceId} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary underline">
                  Open supporting source
                </a>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No relationship selected.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function buildGraph(edges: RelationshipEdge[], focusNodeId?: string): { nodes: Node[]; flowEdges: Edge[] } {
  const nodeMap = new Map<string, { id: string; label: string; type: string }>();
  for (const edge of edges) {
    nodeMap.set(edge.fromNodeId, { id: edge.fromNodeId, label: edge.fromNodeLabel, type: edge.fromNodeType });
    nodeMap.set(edge.toNodeId, { id: edge.toNodeId, label: edge.toNodeLabel, type: edge.toNodeType });
  }

  const typeOrder = ["partner", "portfolio_founder", "advisor", "founder"];
  const byType = typeOrder.map((type) => Array.from(nodeMap.values()).filter((node) => node.type === type));
  const nodes: Node[] = [];
  byType.forEach((group, column) => {
    group.forEach((node, row) => {
      nodes.push({
        id: node.id,
        position: { x: column * 260, y: row * 95 + (column % 2 ? 35 : 0) },
        data: { label: node.label },
        style: {
          border: node.id === focusNodeId ? "2px solid hsl(162 49% 24%)" : "1px solid #d7d0c5",
          background: node.type === "founder" ? "#ffffff" : node.type === "partner" ? "#ecf7f1" : "#f5f2ec",
          borderRadius: 8,
          color: "#1e293b",
          fontSize: 12,
          width: 168,
        },
      });
    });
  });

  const flowEdges = edges.map<Edge>((edge) => ({
    id: edge.id,
    source: edge.fromNodeId,
    target: edge.toNodeId,
    label: `${edge.relationship} (${edge.strength})`,
    type: "smoothstep",
    animated: edge.strength >= 8,
    style: { stroke: edge.strength >= 8 ? "hsl(162 49% 24%)" : "#8a8174" },
    labelStyle: { fontSize: 10, fill: "#475569" },
  }));

  return { nodes, flowEdges };
}
