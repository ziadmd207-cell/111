import React from "react";
import { CheckCircle2, Circle, Clock, ListChecks, ChevronDown, Globe } from "lucide-react";

export default function RoadmapTree({ nodes, isAr, openId, onToggle, children }) {
  const phases = [...new Set(nodes.map((n) => n.phase))].sort((a, b) => a - b);

  return (
    <div className="relative">
      <div className="absolute top-0 bottom-0 start-[15px] w-0.5 bg-gradient-to-b from-zeus-gold/60 via-zeus-gold/25 to-transparent" />
      <div className="space-y-7">
        {phases.map((p) => (
          <div key={p} className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative z-10 w-8 h-8 rounded-full bg-zeus-gold text-zeus-midnight font-bold flex items-center justify-center text-sm shadow-gold shrink-0">{p}</div>
              <h2 className="font-heading font-bold text-base sm:text-lg">{isAr ? `المرحلة ${p}` : `Phase ${p}`}</h2>
            </div>
            <div className="space-y-3 ms-[15px] ps-6">
              {nodes.filter((n) => n.phase === p).map((node) => (
                <NodeBranch key={node.id} node={node} isAr={isAr} open={openId === node.id} onToggle={() => onToggle(node.id)}>
                  {openId === node.id ? children : null}
                </NodeBranch>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeBranch({ node, isAr, open, onToggle, children }) {
  const done = node.status === "completed";
  const count = (node.resources || []).length;

  return (
    <div className="relative">
      <div className="absolute -start-6 top-7 w-6 h-0.5 bg-zeus-gold/30" />
      <div className={`rounded-2xl border transition ${open ? "bg-card/80 border-zeus-gold/40" : "bg-card/50 border-border/60 hover:border-zeus-gold/30"}`}>
        <button onClick={onToggle} className="w-full text-start p-4 flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            {done ? <CheckCircle2 className="text-zeus-gold" style={{ width: 18, height: 18 }} />
              : <Circle className="text-muted-foreground/40" style={{ width: 18, height: 18 }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-heading font-bold text-sm sm:text-base">{node.title}</div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{node.objective}</p>
            <div className="mt-2.5 flex items-center gap-2.5 text-[11px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><Clock style={{ width: 11, height: 11 }} /> {node.estimated_hours || 0} {isAr ? "س" : "h"}</span>
              <span className="flex items-center gap-1"><ListChecks style={{ width: 11, height: 11 }} /> {(node.tasks || []).length} {isAr ? "مهام" : "tasks"}</span>
              <span className={`flex items-center gap-1 ${count ? "text-zeus-brightgold" : ""}`}>
                <Globe style={{ width: 11, height: 11 }} /> {count ? `${count} ${isAr ? "مصدر" : "resources"}` : (isAr ? "افتح لجلب المصادر" : "open to load resources")}
              </span>
            </div>
          </div>
          <ChevronDown className={`shrink-0 text-muted-foreground transition ${open ? "rotate-180 text-zeus-gold" : ""}`} style={{ width: 18, height: 18 }} />
        </button>
        {open && <div className="px-4 pb-4 border-t border-border/50 pt-4">{children}</div>}
      </div>
    </div>
  );
}