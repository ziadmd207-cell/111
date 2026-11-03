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
  field_motivation: { ar: "إيه اللي جذبك للمجال", en: "What attracted you to the field" },
  current_role: { ar: "الوظيفة المستهدفة", en: "Target role" },
  career_goal: { ar: "المسار اللي بتستهدفه", en: "Career direction" },
  target_role: { ar: "الوظيفة المستهدفة", en: "Target role" },
  motivation: { ar: "سبب التعلّم", en: "Why you want to learn" },
  interests: { ar: "اهتماماتك", en: "Interests" },
  specialization_interest: { ar: "التخصصات اللي جذبتك", en: "Specialization interests" },
  background: { ar: "خلفيتك", en: "Background" },
  education: { ar: "تعليمك", en: "Education" },
  experience: {
    ar: "خبرتك",
    en: "Experience",
    map: {
      none: ["لسه مفيش خبرة سابقة", "No prior experience yet"],
      beginner: ["بداية من الصفر", "Starting from scratch"],
    },
  },
  obstacles: { ar: "التحديات", en: "Challenges" },
  stop_triggers: { ar: "حاجات بتضايقك في المذاكرة", en: "Study frustrations" },
  distractions: {
    ar: "الحاجات اللي بتشتتك",
    en: "Study distractions",
    map: { none: ["مفيش حاجة بتشتتني", "Nothing distracts me"] },
  },
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
  available_days: { ar: "أيامك", en: "Days" },
  study_hours_by_day: { ar: "ساعات المذاكرة لكل يوم", en: "Study hours per day" }
};

export default function DnaSummary({ profile, isAr, Arrow, onBack, onConfirm }) {
  const chips = Object.entries(FIELD_MAP)
    .map(([key, config]) => {
      const raw = profile?.[key];
      if (raw === null || raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0)) return null;
      if (key === "career_goal" && profile?.career_intent) return null;
      if (key === "target_role" && profile?.current_role) return null;
      if (key === "background" && profile?.education) return null;
      let value;
      if (Array.isArray(raw)) {
        value = raw.map((item) => {
          const dayMap = { monday: isAr ? "الاثنين" : "Mon", tuesday: isAr ? "الثلاثاء" : "Tue", wednesday: isAr ? "الأربعاء" : "Wed", thursday: isAr ? "الخميس" : "Thu", friday: isAr ? "الجمعة" : "Fri", saturday: isAr ? "السبت" : "Sat", sunday: isAr ? "الأحد" : "Sun" };
          return dayMap[String(item).toLowerCase()] || item;
        }).join("، ");
      } else if (config.map) {
        const mapped = config.map[String(raw).toLowerCase()];
        value = mapped ? mapped[isAr ? 0 : 1] : raw;
      } else if (key === "weekly_hours") {
        value = `${raw} ${isAr ? "ساعات" : "hrs"}`;
      } else if (key === "study_hours_by_day") {
        const dayMap = { monday: isAr ? "الاثنين" : "Mon", tuesday: isAr ? "الثلاثاء" : "Tue", wednesday: isAr ? "الأربعاء" : "Wed", thursday: isAr ? "الخميس" : "Thu", friday: isAr ? "الجمعة" : "Fri", saturday: isAr ? "السبت" : "Sat", sunday: isAr ? "الأحد" : "Sun" };
        value = Object.entries(raw).map(([day, hours]) => `${dayMap[day.toLowerCase()] || day}: ${hours} ${isAr ? "س" : "hrs"}`).join(isAr ? "، " : ", ");
      } else if (raw && typeof raw === "object") {
        value = Object.entries(raw).map(([label, item]) => `${label}: ${item}`).join(isAr ? "، " : ", ");
      } else {
        value = String(raw);
      }
      return { label: isAr ? config.ar : config.en, value };
    })
    .filter((chip) => chip && String(chip.value).trim());

  return (
    <div className="animate-fade-up">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-zeus-gold/15 border border-zeus-gold/30 flex items-center justify-center mb-3">
          <Brain className="text-zeus-gold" style={{ width: 26, height: 26 }} />
        </div>
        <h2 className="font-heading font-extrabold text-2xl sm:text-3xl">{isAr ? "ده الـ DNA بتاع تعلّمك" : "This is your Learning DNA"}</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          {isAr ? "ده ملخص هدفك ووقتك وخبرتك وطريقة تعلّمك. راجعه، ولو معلومة مش دقيقة ارجع للمحادثة وصححها." : "This summarizes your goal, time, experience, and learning preferences. Review it and return to the chat if anything needs correction."}
        </p>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
        className="grid sm:grid-cols-2 gap-2.5 mb-6">
        {chips.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.035 }}
            className="zeus-glass rounded-xl border border-border/70 bg-card/60 p-3">
            <div className="text-[11px] font-semibold text-muted-foreground mb-1">{c.label}</div>
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
          <button onClick={onBack} className="block mx-auto mb-3 min-h-10 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition">
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