import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export default function SkillsCard({ skills, isAr }) {
  if (!skills.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-5 text-center">
        <p className="text-sm text-muted-foreground mb-3">{isAr ? "مفيش مهارات مقيّمة لسه" : "No skills assessed yet"}</p>
        <Link to="/learn" className="inline-flex px-4 py-2 rounded-full bg-zeus-gold/15 text-zeus-brightgold text-xs font-semibold hover:bg-zeus-gold/25 transition">
          {isAr ? "ابدأ تعلّم" : "Start learning"}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/55 backdrop-blur-xl p-5 space-y-3.5">
      {skills.slice(0, 5).map((s, i) => (
        <div key={s.skill}>
          <div className="flex justify-between text-xs mb-1.5 gap-2">
            <span className="truncate">{s.skill}</span>
            <span className="text-zeus-brightgold font-bold shrink-0">{s.level}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-zeus-gold to-zeus-brightgold"
              initial={{ width: 0 }} animate={{ width: `${s.level}%` }}
              transition={{ duration: 0.8, delay: 0.15 + i * 0.1, ease: "easeOut" }}
            />
          </div>
        </div>
      ))}
      {skills.length > 5 && (
        <Link to="/progress" className="flex items-center justify-center gap-1.5 text-[11px] text-zeus-brightgold pt-1 hover:underline">
          <Sparkles style={{ width: 11, height: 11 }} /> {isAr ? `+${skills.length - 5} مهارة تانية` : `+${skills.length - 5} more skills`}
        </Link>
      )}
    </div>
  );
}