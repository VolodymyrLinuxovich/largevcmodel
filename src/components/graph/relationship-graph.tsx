"use client";

import { useMemo, useState } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";

type RelationshipEdgeRecord = {
  id: string;
  fromNodeId: string;
  fromNodeLabel: string | null;
  fromNodeType: string;
  toNodeId: string;
  toNodeLabel: string | null;
  toNodeType: string;
  relationship: string;
  strength: number;
  evidence: string;
  source: string;
  sourceRecordId?: string | null;
};

export function RelationshipGraph({ edges, focusNodeId }: { edges: RelationshipEdgeRecord[]; focusNodeId?: string }) {
  const [selected, setSelected] = useState<RelationshipEdgeRecord | null>(edges[0] ?? null);
  const { nodes, flowEdges } = useMemo(() => buildGraph(edges, focusNodeId), [edges, focusNodeId]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="h-[560px] border border-border">
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
          <Background gap={24} color="rgba(255,255,255,0.12)" />
          <Controls />
        </ReactFlow>
      </div>
      <aside className="border border-border">
        <div className="border-b border-border p-4">
          <p className="eyebrow mb-2">EDGE EVIDENCE</p>
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em]">Relationship basis</h2>
        </div>
        <div className="p-4">
          {selected ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold">
                  {selected.fromNodeLabel ?? selected.fromNodeId} / {selected.toNodeLabel ?? selected.toNodeId}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{selected.relationship}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">strength {selected.strength}</Badge>
                <Badge variant="muted">{selected.source}</Badge>
              </div>
              <p className="border border-border p-3 text-sm leading-6">{selected.evidence}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select an edge to inspect provenance.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function buildGraph(edges: RelationshipEdgeRecord[], focusNodeId?: string): { nodes: Node[]; flowEdges: Edge[] } {
  const nodeMap = new Map<string, { id: string; label: string; type: string }>();
  for (const edge of edges) {
    nodeMap.set(edge.fromNodeId, { id: edge.fromNodeId, label: edge.fromNodeLabel ?? edge.fromNodeId, type: edge.fromNodeType });
    nodeMap.set(edge.toNodeId, { id: edge.toNodeId, label: edge.toNodeLabel ?? edge.toNodeId, type: edge.toNodeType });
  }

  const groups = Array.from(new Set(Array.from(nodeMap.values()).map((node) => node.type)));
  const nodes: Node[] = [];
  groups.forEach((type, column) => {
    Array.from(nodeMap.values())
      .filter((node) => node.type === type)
      .forEach((node, row) => {
        nodes.push({
          id: node.id,
          position: { x: column * 260, y: row * 92 + (column % 2 ? 38 : 0) },
          data: { label: node.label },
          style: {
            border: node.id === focusNodeId ? "2px solid #f1eee8" : "1px solid rgba(255,255,255,0.22)",
            background: "#171310",
            borderRadius: 2,
            color: "#f1eee8",
            fontFamily: "SFMono-Regular, Consolas, monospace",
            fontSize: 11,
            width: 178,
            textTransform: "uppercase",
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
    animated: false,
    style: { stroke: edge.strength >= 8 ? "#f1eee8" : "rgba(255,255,255,0.38)" },
    labelStyle: { fontSize: 10, fill: "#a39a90" },
  }));

  return { nodes, flowEdges };
}
