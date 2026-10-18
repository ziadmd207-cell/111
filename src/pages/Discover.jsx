import React, { useState, useEffect, useCallback } from "react";
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

  const load = useCallback(async () => {
    if (recs || !profile) return;
    setTyping(true);
    try {
      const res = await api.functions.invoke("recommendGoals", { profile, goal: profile.goal, lang });
      setRecs(res.data || res);
    } catch (e) {}
    setTyping(false);
  }, [profile, recs, lang]);

  useEffect(() => { load(); }, [load]);

  const pickGoal = async (goal) => {
    if (!goal.trim() || building) return;
    setBuilding(goal);
    try {
      await updateProfile({ goal, goal_recommendations: recs?.recommendations || [] });
      const res = await api.functions.invoke("generateRoadmap", { profile: { ...profile, goal }, goal, lang });
      const data = res.data || res;
      const nodes = data.nodes || [];
      await api.entities.Roadmap.updateMany({ status: "active" }, { $set: { status: "archived" } });
      await api.entities.Roadmap.create({ goal, version: 1, status: "active", nodes });
      const firstPhase = nodes.filter((n) => n.phase === 1);
      const cleanTasks = firstPhase.flatMap((node) =>
        (node.tasks || []).map((taskTitle, i, arr) => ({
          title: taskTitle, node_id: node.id, node_title: node.title, status: "todo",
          estimated_minutes: Math.round((node.estimated_hours || 4) * 60 / Math.max(1, arr.length)),
          difficulty: "medium", order: 0
        }))
      );
      if (cleanTasks.length) await api.entities.Task.bulkCreate(cleanTasks);
      await api.entities.Notification.create({
        type: "ai", title: isAr ? "هدفك الجديد جاهز! 🎯" : "Your new goal is ready! 🎯",
        body: isAr ? `بدأنا رحلتك نحو "${goal}". أول مهامك مستنية في تبويب تعلّم.` : `Your journey toward "${goal}" started. First tasks are in Learn.`,
        action_label: isAr ? "ابدأ" : "Start", action_url: "/learn"
      });
      nav("/roadmap", { replace: true });
    } catch (e) {
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
        <div className="zeus-glass p-10 text-center text-muted-foreground">{isAr ? "حصل خطأ، حدّث الصفحة" : "Something went wrong, refresh"}</div>
      )}
    </div>
  );
}