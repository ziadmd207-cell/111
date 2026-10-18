import React from "react";
import { motion } from "framer-motion";

export default function StatStrip({ stats }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
          whileHover={{ y: -3 }}
          className="rounded-2xl border border-border/60 bg-card/55 backdrop-blur-xl p-3 text-center"
        >
          <s.icon className="text-zeus-gold mx-auto mb-1.5" style={{ width: 17, height: 17 }} />
          <div className="font-heading font-extrabold text-lg leading-none">{s.value}</div>
          <div className="text-[10px] text-muted-foreground mt-1">{s.label}</div>
        </motion.div>
      ))}
    </div>
  );
}