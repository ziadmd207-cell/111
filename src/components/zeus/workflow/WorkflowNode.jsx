import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, ListChecks, Globe, Lock } from "lucide-react";
import { NODE_W, NODE_H } from "./layout";

export default function WorkflowNode({ node, index, active, onClick, isAr }) {
  const done = node.status === "completed";
  const resources = (node.resources || []).filter((r) => r.rank).length;

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 18, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      dir={isAr ? "rtl" : "ltr"}
      className={`absolute text-start rounded-2xl border p-3.5 flex flex-col backdrop-blur-xl transition-colors ${
        active
          ? "bg-zeus-gold/10 border-zeus-gold shadow-gold"
          : done
          ? "bg-card/70 border-zeus-gold/35"
          : "bg-card/60 border-border/70 hover:border-zeus-gold/50"
      }`}
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
    >
      <div className="flex items-start gap-2">
        <div className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center ${done ? "bg-zeus-gold text-zeus-midnight" : active ? "bg-zeus-gold/25 text-zeus-brightgold" : "bg-secondary/60 text-muted-foreground"}`}>
          {done ? <CheckCircle2 style={{ width: 15, height: 15 }} /> : <Lock style={{ width: 13, height: 13 }} />}
        </div>
        <div className="font-heading font-bold text-[13px] leading-snug line-clamp-2 flex-1">{node.title}</div>
      </div>

      <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2 leading-relaxed flex-1">{node.objective}</p>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-2 border-t border-border/40">
        <span className="flex items-center gap-1"><Clock style={{ width: 10, height: 10 }} />{node.estimated_hours || 0}{isAr ? "س" : "h"}</span>
        <span className="flex items-center gap-1"><ListChecks style={{ width: 10, height: 10 }} />{(node.tasks || []).length}</span>
        <span className={`flex items-center gap-1 ms-auto ${resources ? "text-zeus-brightgold" : ""}`}>
          <Globe style={{ width: 10, height: 10 }} />{resources || "—"}
        </span>
      </div>
    </motion.button>
  );
}