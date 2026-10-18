import React from "react";
import { motion } from "framer-motion";
import { edgePath } from "./layout";

export default function WorkflowEdges({ edges, width, height, activeId }) {
  return (
    <svg width={width} height={height} className="absolute inset-0 pointer-events-none overflow-visible">
      <defs>
        <linearGradient id="zeusEdge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,193,7,0.15)" />
          <stop offset="100%" stopColor="rgba(255,193,7,0.55)" />
        </linearGradient>
        <linearGradient id="zeusEdgeActive" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,193,7,0.6)" />
          <stop offset="100%" stopColor="rgba(255,213,79,1)" />
        </linearGradient>
      </defs>

      {edges.map((e, i) => {
        const active = activeId && (e.from.id === activeId || e.to.id === activeId);
        return (
          <g key={e.id}>
            <motion.path
              d={edgePath(e.from, e.to)}
              fill="none"
              stroke={active ? "url(#zeusEdgeActive)" : "url(#zeusEdge)"}
              strokeWidth={active ? 2.5 : 1.75}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.15 + i * 0.05, ease: "easeInOut" }}
            />
            {active && (
              <motion.circle
                r={3.5}
                fill="#FFD54F"
                initial={{ offsetDistance: "0%" }}
                animate={{ offsetDistance: "100%" }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
                style={{ offsetPath: `path("${edgePath(e.from, e.to)}")` }}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}