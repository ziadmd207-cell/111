import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

export default function ModuleGrid({ modules, Arrow }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {modules.map((m, i) => (
        <motion.div
          key={m.to}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 * i }}
          whileHover={{ y: -3 }}
        >
          <Link to={m.to}
            className="flex items-center gap-3 p-4 rounded-2xl border border-border/60 bg-card/55 backdrop-blur-xl hover:border-zeus-gold/50 transition group h-full">
            <div className="w-10 h-10 rounded-xl bg-zeus-gold/12 flex items-center justify-center shrink-0 group-hover:bg-zeus-gold/25 transition">
              <m.icon className="text-zeus-gold" style={{ width: 19, height: 19 }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-heading font-bold text-sm">{m.title}</div>
              <div className="text-[11px] text-muted-foreground truncate">{m.desc}</div>
            </div>
            <Arrow className="text-muted-foreground shrink-0 group-hover:text-zeus-gold group-hover:translate-x-0.5 transition" style={{ width: 16, height: 16 }} />
          </Link>
        </motion.div>
      ))}
    </div>
  );
}