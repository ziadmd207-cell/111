import React from "react";
import { motion } from "framer-motion";
import { Check, Brain } from "lucide-react";

const FIELD_MAP = {
  current_level: { ar: "مستواك", en: "Level", map: { beginner: ["مبتدئ", "Beginner"], intermediate: ["متوسط", "Intermediate"], advanced: ["متقدم", "Advanced"] } },
  weekly_hours: { ar: "وقتك أسبوعياً", en: "Weekly study time" },
  learning_style: { ar: "أسلوبك", en: "Style", map: { visual: ["بصري", "Visual"], video: ["فيديو", "Video"], reading: ["قراءة", "Reading"], hands_on: ["تطبيقي", "Hands-on"], mixed: ["مختلط", "Mixed"] } },
  preferred_language: { ar: "لغة المحتوى", en: "Content language", map: { ar: ["عربي", "Arabic"], en: ["إنجليزي", "English"], mixed: ["مختلط", "Mixed"] } },
  depth: { ar: "العمق", en: "Depth", map: { overview: ["نظرة عامة", "Overview"], balanced: ["متوازن", "Balanced"], deep: ["تعمّق", "Deep"] } },
  career_intent: { ar: "هدفك المهني", en: "Career goal" },
  current_role: { ar: "الوظيفة المستهدفة", en: "Target role" },
  career_goal: { ar: "المسار اللي بتستهدفه", en: "Career direction" },
  target_role: { ar: "الوظيفة المستهدفة", en: "Target role" },
  motivation: { ar: "سبب التعلّم", en: "Why you want to learn" },
  interests: { ar: "اهتماماتك", en: "Interests" },
  specialization_interest: { ar: "التخصصات اللي جذبتك", en: "Specialization interests" },
  background: { ar: "خلفيتك", en: "Background" },
  education: { ar: "تعليمك", en: "Education" },
  experience: { ar: "خبرتك", en: "Experience" },
  obstacles: { ar: "التحديات", en: "Challenges" },
  stop_triggers: { ar: "حاجات بتضايقك في المذاكرة", en: "Study frustrations" },
  weaknesses: { ar: "المهارات اللي محتاجة تقوية", en: "Skills to strengthen" },
  available_time: { ar: "الوقت المتاح", en: "Available time" },
  deadline: { ar: "الإطار الزمني", en: "Target timeline" },
  video_preference: {
    ar: "المصادر التعليمية",
    en: "Learning Resources",
    map: {
      free: ["مصادر مجانية بالكامل من YouTube", "Exclusively Free from YouTube"],
      mixed: ["مصادر مجانية ومدفوعة", "Free and paid resources"],
      youtube: ["مصادر مجانية بالكامل من YouTube", "Exclusively Free from YouTube"],
    }
  },
  video_length_preference: {
    ar: "مدة الفيديوهات المفضلة",
    en: "Preferred video length",
    map: {
      short: ["قصيرة ومركزة", "Short and focused"],
      mixed: ["مزيج حسب الدرس", "A mix depending on the lesson"],
      long: ["طويلة ومفصلة", "Long and detailed"],
    }
  },
  known_skills: { ar: "مهاراتك الحالية", en: "Current skills" },
  target_skills: { ar: "مهارات مستهدفة", en: "Target skills" },
  strengths: { ar: "نقاط قوتك", en: "Strengths" },
  goal: { ar: "المجال المختار", en: "Chosen field" },
  available_days: { ar: "أيامك", en: "Days" }
};

export default function DnaSummary({ profile, isAr, Arrow, onBack, onConfirm }) {
  const chips = Object.entries(FIELD_MAP)
    .map(([key, config]) => {
      const raw = profile?.[key];
      if (!raw || (Array.isArray(raw) && raw.length === 0)) return null;
      let value;
      if (Array.isArray(raw)) {
        value = raw.map((d) => {
          const dayMap = { monday: isAr ? "الاثنين" : "Mon", tuesday: isAr ? "الثلاثاء" : "Tue", wednesday: isAr ? "الأربعاء" : "Wed", thursday: isAr ? "الخميس" : "Thu", friday: isAr ? "الجمعة" : "Fri", saturday: isAr ? "السبت" : "Sat", sunday: isAr ? "الأحد" : "Sun" };
          return dayMap[d] || d;
        }).join("، ");
      } else if (config.map) {
        value = config.map[raw] ? config.map[raw][isAr ? 0 : 1] : raw;
      } else if (key === "weekly_hours") {
        value = `${raw} ${isAr ? "ساعات" : "hrs"}`;
      } else if (key === "obstacles" || key === "weaknesses" || key === "strengths" || key === "known_skills" || key === "target_skills" || key === "interests") {
        value = Array.isArray(raw) ? raw.join(isAr ? "، " : ", ") : String(raw);
      } else {
        value = String(raw);
      }
      return { label: isAr ? config.ar : config.en, value };
    })
    .filter(Boolean);

  return (
    <div className="animate-fade-up">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-zeus-gold/15 border border-zeus-gold/30 flex items-center justify-center mb-3">
          <Brain className="text-zeus-gold" style={{ width: 26, height: 26 }} />
        </div>
        <h2 className="font-heading font-extrabold text-2xl sm:text-3xl">{isAr ? "ده الـ DNA بتاع تعلّمك" : "This is your Learning DNA"}</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          {isAr ? "دي الصورة اللي فهمتها عنك. لو حاجة مش دقيقة ارجع للمحادثة وصححها قبل ما نختار المجال." : "This is what I understood about you. If anything is off, return to the chat and correct it before choosing a field."}
        </p>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
        className="grid sm:grid-cols-2 gap-2.5 mb-6">
        {chips.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.035 }}
            className="zeus-glass rounded-xl border border-border/50 p-3">
            <div className="text-[11px] font-semibold text-zeus-brightgold mb-1">{c.label}</div>
            <div className="text-sm text-foreground leading-relaxed break-words">{c.value}</div>
          </motion.div>
        ))}
        {chips.length === 0 && (
          <p className="text-muted-foreground text-sm sm:col-span-2 text-center">
            {isAr ? "لسه مفيش بيانات كفاية — ارجع كمل الشات عشان أتعرف عليك أكتر." : "Not enough data yet — go back and chat more so I can learn about you."}
          </p>
        )}
      </motion.div>

      <div className="text-center mt-6">
        {onBack && (
          <button onClick={onBack} className="block mx-auto mb-3 px-4 py-2 text-xs text-muted-foreground hover:text-zeus-brightgold transition">
            {isAr ? "رجوع للمحادثة وتصحيح الإجابات" : "Back to chat and correct answers"}
          </button>
        )}
        <button onClick={() => onConfirm({})}
          className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition shadow-gold">
          <Check style={{ width: 18, height: 18 }} /> {isAr ? "كمّل" : "Continue"} <Arrow style={{ width: 18, height: 18 }} />
        </button>
      </div>
    </div>
  );
}