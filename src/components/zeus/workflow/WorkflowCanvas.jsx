import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { buildGraph, NODE_W, PAD } from "./layout";
import WorkflowEdges from "./WorkflowEdges";
import WorkflowNode from "./WorkflowNode";

export default function WorkflowCanvas({ nodes, activeId, onSelect, isAr }) {
  const graph = useMemo(() => buildGraph(nodes), [nodes]);
  const [zoom, setZoom] = useState(0.85);

  return (
    <div className="relative rounded-3xl border border-border/60 bg-background/40 overflow-hidden">
      <div className="absolute inset-0 zeus-grid-bg opacity-25 pointer-events-none" />

      <div className="absolute top-3 end-3 z-20 flex items-center gap-1.5 rounded-full bg-card/90 backdrop-blur-xl border border-border/60 p-1">
        <ZoomBtn onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))} icon={ZoomOut} />
        <span className="text-[10px] text-muted-foreground w-9 text-center font-mono">{Math.round(zoom * 100)}%</span>
        <ZoomBtn onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.15).toFixed(2)))} icon={ZoomIn} />
        <ZoomBtn onClick={() => setZoom(0.85)} icon={Maximize2} />
      </div>

      <div className="overflow-auto" style={{ maxHeight: "62vh" }}>
        <div style={{ width: graph.width * zoom, height: graph.height * zoom }}>
          <div dir="ltr" className="relative origin-top-left" style={{ width: graph.width, height: graph.height, transform: `scale(${zoom})` }}>
            {graph.columns.map((c, i) => (
              <motion.div
                key={c.phase}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="absolute flex items-center gap-2"
                style={{ left: c.x, top: PAD - 8, width: NODE_W }}
              >
                <span className="w-6 h-6 rounded-lg bg-zeus-gold text-zeus-midnight text-[11px] font-bold flex items-center justify-center">{c.phase}</span>
                <span className="text-[11px] font-semibold text-zeus-brightgold uppercase tracking-wider">
                  {isAr ? `مرحلة ${c.phase}` : `Phase ${c.phase}`}
                </span>
              </motion.div>
            ))}

            <WorkflowEdges edges={graph.edges} width={graph.width} height={graph.height} activeId={activeId} />

            {graph.nodes.map((node, i) => (
              <WorkflowNode
                key={node.id}
                node={node}
                index={i}
                active={activeId === node.id}
                onClick={() => onSelect(node.id)}
                isAr={isAr}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 py-2.5 border-t border-border/50 bg-card/40 text-[10px] text-muted-foreground text-center">
        {isAr ? "اسحب الشبكة للتنقل · دوس على أي محطة تشوف مصادرها" : "Drag to pan · tap any node to see its resources"}
      </div>
    </div>
  );
}

function ZoomBtn({ onClick, icon: Icon }) {
  return (
    <button onClick={onClick} className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-zeus-brightgold hover:bg-zeus-gold/10 transition">
      <Icon style={{ width: 13, height: 13 }} />
    </button>
  );
}