import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Target, Flame, Users, MessageSquare, Sparkles, TrendingUp, BookOpen } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";
import HeroCard from "@/components/zeus/dashboard/HeroCard";
import StatStrip from "@/components/zeus/dashboard/StatStrip";
import SkillsCard from "@/components/zeus/dashboard/SkillsCard";
import { ZEUS_IMAGES, withImageFallback } from "@/lib/zeus-images";
import { thumbUrl, fmtDur } from "@/lib/youtube";

export default function Home() {
  const { t, lang, dir } = useI18n();
  const { profile } = useProfile();
  const isAr = lang === "ar";
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  const [roadmap, setRoadmap] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [companion, setCompanion] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [r, tk, ls, c] = await Promise.all([
          api.entities.Roadmap.filter({ status: "active" }, "-created_date", 1),
          api.entities.Task.filter({}, "order", 100),
          api.entities.Lesson.filter({}, "order", 50),
          api.entities.Conversation.filter({ type: "companion" }, "-created_date", 1)
        ]);
        if (r.length) setRoadmap(r[0]);
        setTasks(tk);
        setLessons(ls);
        if (c.length) setCompanion(c[0]);
      } catch {
        // Partial dashboard still renders with empty sections.
      }
    })();
  }, []);

  const greeting = new Date().getHours() < 12 ? t("dash.greeting.morning") : t("dash.greeting.evening");
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((x) => x.status === "done").length;
  const progress = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const todayTask = tasks.find((x) => x.status !== "done");
  const nodes = roadmap?.nodes || [];
  const skills = (profile?.skill_graph || []).slice().sort((a, b) => b.level - a.level);
  const lastMsg = companion?.messages?.slice(-1)[0];
  const streak = computeStreak(tasks);

  const currentLesson = lessons.find((l) => l.status === "available");
  const phases = [...new Set(nodes.map((n) => n.phase || 1))].sort((a, b) => a - b);

  return (
    <div className="space-y-6 pb-4" dir={dir}>
      <HeroCard
        greeting={greeting}
        name={profile?.companion_name ? `${profile.companion_name}` : "ZEUS"}
        goal={profile?.goal}
        todayTask={todayTask}
        progress={progress}
        isAr={isAr}
        Arrow={Arrow}
      />

      <StatStrip stats={[
        { icon: Flame, value: streak, label: isAr ? "يوم متتالي" : "day streak" },
        { icon: Target, value: `${doneTasks}/${totalTasks}`, label: isAr ? "مهام" : "tasks" },
        { icon: TrendingUp, value: `${progress}%`, label: isAr ? "تقدّم" : "progress" }
      ]} />

      <Section title={isAr ? "كمّل تعلّمك" : "Continue Learning"} icon={BookOpen} delay={0.15}>
        <Link to={currentLesson ? `/lesson/${currentLesson.id}` : "/schedule"} className="block zeus-glass p-4 hover:zeus-gold-border transition group">
          <div className="flex items-center gap-3">
            {(() => {
              const thumb = currentLesson ? thumbUrl(currentLesson.video_url || currentLesson.video_iframe_url) : null;
              const dur = currentLesson ? fmtDur(currentLesson.video_duration) : "";
              return thumb ? (
                <div className="relative shrink-0 w-24 aspect-video rounded-lg overflow-hidden bg-black/40">
                  <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
                  {dur && <span className="absolute bottom-0.5 end-0.5 px-1 rounded bg-black/70 text-white text-[10px]">{dur}</span>}
                </div>
              ) : null;
            })()}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <span className="font-heading font-bold text-sm truncate">{currentLesson?.node_title || (isAr ? "ابدأ أول درس" : "Start your first lesson")}</span>
                <Arrow className="text-muted-foreground group-hover:text-zeus-gold transition shrink-0" style={{ width: 16, height: 16 }} />
              </div>
              <p className="text-muted-foreground text-xs truncate">{currentLesson?.video_title || ""}</p>
              <p className="text-muted-foreground text-xs">{currentLesson ? (isAr ? `أسبوع ${currentLesson.week} · ${currentLesson.day}` : `Week ${currentLesson.week} · ${currentLesson.day}`) : (isAr ? "دروسك مستنية في الجدول" : "Your lessons are waiting in the schedule")}</p>
            </div>
          </div>
        </Link>
      </Section>

      <Section title={isAr ? "تقدّم المسار" : "Roadmap Progress"} icon={TrendingUp} delay={0.2}>
        <Link to="/roadmap" className="block zeus-glass p-4 hover:zeus-gold-border transition group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">{isAr ? "عدد المراحل" : "Total Stages"}</span>
            <span className="font-heading font-bold text-zeus-gold">{phases.length || 1}</span>
          </div>
          <div className="h-2.5 rounded-full bg-secondary/60 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-zeus-gold to-zeus-brightgold rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{progress}%</span>
            <span>{isAr ? `${nodes.length} محطة` : `${nodes.length} nodes`}</span>
          </div>
        </Link>
      </Section>

      <Section title={isAr ? "مدرّبك" : "Your Coach"} icon={MessageSquare} delay={0.25}>
        <Link to="/companion" className="flex items-center gap-3 p-4 rounded-2xl border border-border/60 bg-card/55 backdrop-blur-xl hover:border-zeus-gold/50 transition group">
          <div className="relative shrink-0">
            <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-zeus-gold/40 shrink-0">
              <img src={ZEUS_IMAGES.avatar} alt="Zeus" className="w-full h-full object-cover object-top" onError={withImageFallback} />
            </div>
            <span className="absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-card animate-pulse-soft" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-heading font-bold text-sm">{profile?.companion_name || "ZEUS"}</div>
            <div className="text-[11px] text-muted-foreground line-clamp-1">{lastMsg ? lastMsg.content : (isAr ? "اسأل مدرّبك أي حاجة" : "Ask your coach anything")}</div>
          </div>
          <Arrow className="text-muted-foreground shrink-0 group-hover:text-zeus-gold transition" style={{ width: 16, height: 16 }} />
        </Link>
      </Section>

      <Section title={isAr ? "مهاراتي" : "My Skills"} icon={Sparkles} delay={0.3}>
        <SkillsCard skills={skills} isAr={isAr} />
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, delay, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay }}>
      <h2 className="font-heading font-bold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
        <Icon className="text-zeus-gold" style={{ width: 15, height: 15 }} /> {title}
      </h2>
      {children}
    </motion.div>
  );
}

function computeStreak(tasks) {
  const done = tasks.filter((x) => x.status === "done" && x.completed_date);
  if (!done.length) return 0;
  const days = new Set(done.map((x) => x.completed_date.slice(0, 10)));
  let streak = 0;
  const d = new Date();
  while (days.has(d.toISOString().slice(0, 10))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}