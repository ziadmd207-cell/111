import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Target, Play, Clock } from "lucide-react";

export default function HeroCard({ greeting, name, goal, todayTask, progress, isAr, Arrow }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-3xl border border-zeus-gold/25 bg-card/60 backdrop-blur-xl p-5 sm:p-6"
    >
      <div className="absolute inset-0 zeus-grid-bg opacity-20" />
      <motion.div
        className="absolute -top-24 -end-16 w-56 h-56 rounded-full bg-zeus-gold/10 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative">
        <div className="text-xs text-muted-foreground">{greeting}</div>
        <h1 className="font-heading font-extrabold text-2xl sm:text-3xl mt-1 zeus-gold-text">{name}</h1>

        {goal && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zeus-gold/10 border border-zeus-gold/30 text-zeus-brightgold text-xs max-w-full">
            <Target style={{ width: 12, height: 12 }} className="shrink-0" /> <span className="truncate">{goal}</span>
          </div>
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
            <span>{isAr ? "تقدّمك الكلي" : "Overall progress"}</span>
            <span className="text-zeus-brightgold font-bold">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-zeus-gold to-zeus-brightgold"
              initial={{ width: 0 }} animate={{ width: `${progress}%` }}
              transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
            />
          </div>
        </div>

        <Link to="/learn"
          className="mt-5 flex items-center gap-3 p-3 rounded-2xl bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition shadow-gold group">
          <span className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Play style={{ width: 16, height: 16 }} />
          </span>
          <span className="flex-1 min-w-0 text-start">
            <span className="block text-sm">{todayTask ? (isAr ? "كمّل من هنا" : "Continue here") : (isAr ? "ابدأ رحلتك" : "Start your journey")}</span>
            {todayTask && (
              <span className="block text-[11px] opacity-80 truncate flex items-center gap-1">
                <Clock style={{ width: 10, height: 10 }} /> {todayTask.title}
              </span>
            )}
          </span>
          <Arrow className="shrink-0 group-hover:translate-x-0.5 transition" style={{ width: 18, height: 18 }} />
        </Link>
      </div>
    </motion.div>
  );
}