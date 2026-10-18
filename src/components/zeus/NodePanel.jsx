import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, Layers } from "lucide-react";
import NodeDetail from "@/components/zeus/NodeDetail";

export default function NodePanel({ node, isAr, dir, loading, failed, onRefresh, onClose }) {
  return (
    <AnimatePresence>
      {node && (
        <div className="fixed inset-0 z-50 flex justify-end" dir={dir}>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: isAr ? "-100%" : "100%" }}
            animate={{ x: 0 }}
            exit={{ x: isAr ? "-100%" : "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="relative h-full w-full max-w-md bg-card border-s border-border/60 overflow-y-auto"
          >
            <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl p-4 border-b border-border/60 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] text-zeus-brightgold mb-1">
                  <span className="flex items-center gap-1"><Layers style={{ width: 11, height: 11 }} /> {isAr ? `مرحلة ${node.phase}` : `Phase ${node.phase}`}</span>
                  <span className="text-muted-foreground flex items-center gap-1"><Clock style={{ width: 11, height: 11 }} /> {node.estimated_hours || 0}{isAr ? "س" : "h"}</span>
                </div>
                <h3 className="font-heading font-bold text-lg leading-tight">{node.title}</h3>
                {node.objective && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{node.objective}</p>}
              </div>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary/60 shrink-0 transition">
                <X style={{ width: 17, height: 17 }} />
              </button>
            </div>
            <div className="p-4">
              <NodeDetail node={node} isAr={isAr} loading={loading} failed={failed} onRefresh={onRefresh} />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}