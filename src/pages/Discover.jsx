import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";

export default function Discover() {
  const { lang, dir } = useI18n();
  const { profile, updateProfile } = useProfile();
  const isAr = lang === "ar";
  const nav = useNavigate();
  const [recs, setRecs] = useState(null);
  const [typing, setTyping] = useState(false);
  const [building, setBuilding] = useState(null);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const [roadmapSaved, setRoadmapSaved] = useState(false);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (recs || !profile || loadingRef.current) return;
    loadingRef.current = true;
    setTyping(true);
    setError("");
    try {
      const res = await api.functions.invoke("recommendGoals", { profile, goal: profile.goal, lang });
      const data = res.data || res;
      if (!Array.isArray(data.recommendations) || !data.recommendations.length) {
        throw new Error(data.message || data.reply || (isAr ? "لم تصل اقتراحات صالحة." : "No valid recommendations were returned."));
      }
      setRecs(data);
    } catch (loadError) {
      setError(loadError.message || (isAr ? "تعذر تحميل اقتراحات المجالات." : "Couldn't load field recommendations."));
    } finally {
      loadingRef.current = false;
      setTyping(false);
    }
  }, [profile, recs, lang, isAr]);

  useEffect(() => { load(); }, [load]);

  const pickGoal = async (goal) => {
    if (!goal.trim() || building) return;
    setBuilding(goal);
    setError("");
    setRoadmapSaved(false);
    let roadmapWasSaved = false;
    try {
      const res = await api.functions.invoke("generateRoadmap", { profile: { ...profile, goal }, goal, lang });
      const data = res.data || res;
      const nodes = data.nodes || [];
      if (data.error || data.credit_exhausted || !Array.isArray(nodes) || nodes.length < 3) {
        throw new Error(data.message || data.reply || (isAr ? "تعذر إنشاء خريطة مكتملة؛ لم نغيّر مسارك الحالي." : "A complete roadmap could not be generated; your current path was not changed."));
      }
      const replacement = await api.functions.invoke("replaceRoadmap", { goal, nodes });
      const roadmap = replacement.data?.roadmap || replacement.roadmap;
      if (!roadmap?.id) throw new Error(isAr ? "تم إنشاء الخريطة دون رقم صالح." : "The roadmap was saved without a valid ID.");
      roadmapWasSaved = true;
      setRoadmapSaved(true);
      await updateProfile({ goal, goal_recommendations: recs?.recommendations || [] });
      const scheduleResponse = await api.functions.invoke("generateSchedule", { roadmapId: roadmap.id, availableDays: profile.available_days || [], lang });
      const lessons = scheduleResponse.data?.lessons || scheduleResponse.lessons || [];
      if (!lessons.length) throw new Error(isAr ? "تم حفظ الخريطة لكن تعذر إنشاء جدول الدروس." : "The roadmap was saved, but its lesson schedule could not be created.");
      let taskOrder = 0;
      const cleanTasks = nodes.flatMap((node) => {
        const nodeTasks = Array.isArray(node.tasks) ? node.tasks.filter((task) => typeof task === "string" && task.trim()) : [];
        return nodeTasks.map((taskTitle) => ({
          title: taskTitle, node_id: node.id, node_title: node.title, status: "todo",
          estimated_minutes: Math.round((node.estimated_hours || 4) * 60 / Math.max(1, nodeTasks.length)),
          difficulty: "medium", order: taskOrder++
        }));
      });
      if (cleanTasks.length) await api.entities.Task.bulkCreate(cleanTasks);
      await api.entities.Notification.create({
        type: "ai", title: isAr ? "هدفك الجديد جاهز! 🎯" : "Your new goal is ready! 🎯",
        body: isAr ? `بدأنا رحلتك نحو "${goal}". خريطتك والجدول جاهزين.` : `Your journey toward "${goal}" has started. Your roadmap and schedule are ready.`,
        action_label: isAr ? "افتح الجدول" : "Open schedule", action_url: "/schedule"
      });
      nav("/schedule", { replace: true });
    } catch (buildError) {
      const prefix = roadmapWasSaved
        ? (isAr ? "تم حفظ الخريطة، لكن لم يكتمل تجهيز بقية الرحلة: " : "The roadmap was saved, but the rest of the setup did not finish: ")
        : "";
      setError(prefix + (buildError.message || (isAr ? "تعذر إنشاء المسار؛ لم يتغير مسارك الحالي." : "Couldn't create the new path; your current path was not changed.")));
    } finally {
      setBuilding(null);
    }
  };

  return (
    <div className="space-y-6" dir={dir}>
      <div>
        <h1 className="font-heading font-extrabold text-2xl sm:text-3xl flex items-center gap-2"><Compass className="text-zeus-gold" style={{ width: 28, height: 28 }} /> {isAr ? "اكتشف مجالات" : "Discover Fields"}</h1>
        <p className="text-muted-foreground mt-1">{isAr ? "مسارات جديدة تناسب ملفك وقدراتك" : "New paths that fit your profile and skills"}</p>
      </div>

      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <span>{error}</span>
        {roadmapSaved && <button type="button" onClick={() => nav("/schedule")} className="shrink-0 underline">{isAr ? "افتح الجدول" : "Open schedule"}</button>}
        {!recs && <button type="button" onClick={() => { setError(""); load(); }} className="shrink-0 underline">{isAr ? "إعادة المحاولة" : "Retry"}</button>}
      </div>}

      {typing ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="text-zeus-gold animate-spin" style={{ width: 32, height: 32 }} />
          <p className="text-muted-foreground text-sm">{isAr ? "بحلّل أفضل مسار ليك..." : "Analyzing your best paths..."}</p>
        </div>
      ) : recs ? (
        <div className="space-y-3">
          {recs.recommendations?.map((r, i) => (
            <button key={i} onClick={() => pickGoal(r.goal)} disabled={!!building}
              className="w-full text-start zeus-glass p-5 hover:zeus-gold-border transition disabled:opacity-60">
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <span className="font-heading font-bold text-lg">{r.goal}</span>
                <span className="text-zeus-gold font-bold text-xl shrink-0">{r.score}%</span>
              </div>
              <p className="text-muted-foreground text-sm">{r.reason}</p>
              <div className="mt-2 h-1.5 rounded-full bg-secondary/60 overflow-hidden"><div className="h-full bg-gradient-to-r from-zeus-gold to-zeus-brightgold" style={{ width: `${r.score}%` }} /></div>
              {building === r.goal && <div className="mt-3 flex items-center gap-2 text-xs text-zeus-brightgold"><Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> {isAr ? "ببني خريطتك..." : "Building your roadmap..."}</div>}
            </button>
          ))}
          <div className="zeus-glass p-5">
            <label className="text-xs text-muted-foreground block mb-2">{isAr ? "أو اكتب مجال مختلف" : "Or type a different field"}</label>
            <div className="flex gap-2">
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={isAr ? "اكتب مجال" : "Your field"}
                className="flex-1 bg-transparent border border-border/60 rounded-lg px-3 py-2.5 text-sm outline-none focus:zeus-gold-border" />
              <button onClick={() => pickGoal(custom.trim())} disabled={!custom.trim() || !!building}
                className="px-4 rounded-lg bg-zeus-gold text-zeus-midnight font-medium text-sm disabled:opacity-50">{isAr ? "ابدأ" : "Start"}</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="zeus-glass p-10 text-center text-muted-foreground">
          <p>{error || (isAr ? "تعذر تحميل الاقتراحات." : "Recommendations are unavailable.")}</p>
          <button type="button" onClick={() => { setError(""); load(); }} className="mt-3 rounded-full bg-zeus-gold px-4 py-2 text-sm font-semibold text-zeus-midnight">{isAr ? "حاول مرة أخرى" : "Try again"}</button>
        </div>
      )}
    </div>
  );
}