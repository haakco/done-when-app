import type { ReactNode } from "react";
import type { AppPlanPart } from "@haakco/custd-sdk/browser";
import { Background, Controls, MarkerType, Position, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../styles/plan-canvas.css";

type PlanCanvasProps = {
  parts: readonly AppPlanPart[];
  names: ReadonlyMap<string, string>;
  connect?: (source: string, target: string) => void;
  inspect?: (id: string) => void;
  labelFor?: (id: string) => ReactNode;
};

export default function PlanCanvas({ parts, names, connect, inspect, labelFor }: PlanCanvasProps) {
  const depths = new Map<string, number>();
  for (let pass = 0; pass < parts.length; pass++) {
    for (const part of parts) {
      if (depths.has(part.itemUuid) || !part.prerequisites.every((id) => depths.has(id))) continue;
      depths.set(part.itemUuid, Math.max(0, ...part.prerequisites.map((id) => (depths.get(id) ?? 0) + 1)));
    }
  }
  const rows = new Map<number, number>();
  const nodes = parts.map((part, index) => {
    const column = depths.get(part.itemUuid) ?? 0;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return {
      id: part.itemUuid,
      data: { label: names.get(part.itemUuid) ?? labelFor?.(part.itemUuid) ?? `Part ${index + 1}` },
      position: { x: column * 225, y: row * 88 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });
  const edges = parts.flatMap((part) => part.prerequisites.map((id) => ({
    id: `${id}:${part.itemUuid}`,
    source: id,
    target: part.itemUuid,
    markerEnd: { type: MarkerType.ArrowClosed },
  })));
  return (
    <div className="plan-canvas" role="region" aria-label="Dependency canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodesDraggable={false}
        nodesConnectable={connect !== undefined}
        edgesReconnectable={false}
        deleteKeyCode={null}
        zoomOnScroll={false}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        onNodeClick={(_, node) => { inspect?.(node.id); }}
        onConnect={({ source, target }) => { connect?.(source, target); }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
