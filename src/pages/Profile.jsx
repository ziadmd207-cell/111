import React, { useState, useEffect } from "react";
import { User, Loader2, Pencil, Check, X, Award, Target, Clock } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";

export default function Profile() {
  const { t, lang, dir } = useI18n();
  const { profile, updateProfile } = useProfile();
  const isAr = lang === "ar";
  const [me, setMe] = useState(null);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setMe(await api.auth.me()); } catch (e) {}
      const p = await api.entities.Project.filter({}, "-created_date", 50);
      setProjects(p);
      const tk = await api.entities.Task.filter({}, "order", 200);
      setTasks(tk);
      setLoading(false);
    })();
  }, []);

  useEffect(() => { if (profile) setDraft(profile); }, [profile]);

  const save = async () => { await updateProfile(draft); setEditing(false); };

  if (loading || !profile) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;

  const doneTasks = tasks.filter((x) => x.status === "done").length;
  const completedProjects = projects.filter((p) => p.status === "completed").length;
  const skillGraph = profile.skill_graph || [];

  const dnaFields = [
    { key: "goal", label: isAr ? "الهدف" : "Goal" },
    { key: "current_level", label: isAr ? "المستوى" : "Level", options: ["beginner","intermediate","advanced"], labels: isAr ? ["مبتدئ","متوسط","متقدم"] : ["Beginner","Intermediate","Advanced"] },
    { key: "learning_style", label: isAr ? "أسلوب التعلّم" : "Learning Style", options: ["visual","video","reading","hands_on","mixed"], labels: isAr ? ["بصري","فيديو","قراءة","تطبيقي","مختلط"] : ["Visual","Video","Reading","Hands-on","Mixed"] },
    { key: "preferred_language", label: isAr ? "اللغة" : "Language", options: ["ar","en","mixed"], labels: isAr ? ["عربي","إنجليزي","مختلط"] : ["Arabic","English","Mixed"] },
    { key: "weekly_hours", label: isAr ? "ساعات/أسبوع" : "Hours/week", type: "number" },
    { key: "motivation", label: isAr ? "التحفيز" : "Motivation" },
    { key: "strengths", label: isAr ? "نقاط القوة" : "Strengths" },
    { key: "weaknesses", label: isAr ? "نقاط الضعف" : "Weaknesses" },
    { key: "career_intent", label: isAr ? "النية المهنية" : "Career Intent" },
    { key: "video_preference", label: isAr ? "المصادر التعليمية" : "Learning Resources", staticValue: isAr ? "مصادر مجانية بالكامل من YouTube" : "Exclusively Free from YouTube" }
  ];

  return (
    <div dir={dir} className="space-y-6">
      {/* Header */}
      <div className="zeus-glass p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-zeus-gold to-zeus-brightgold text-white flex items-center justify-center font-heading font-extrabold text-3xl shrink-0">
          {(me?.full_name || me?.email || "Z").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="font-heading font-extrabold text-2xl">{me?.full_name || me?.email}</h1>
          <p className="text-muted-foreground text-sm">{me?.email}</p>
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zeus-gold/10 border border-zeus-gold/30 text-zeus-brightgold text-sm">
            <Target style={{ width: 14, height: 14 }} /> {profile.goal}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Check} label={isAr ? "مهام مكتملة" : "Tasks done"} value={String(doneTasks)} />
        <Stat icon={Award} label={isAr ? "مشاريع مكتملة" : "Projects done"} value={String(completedProjects)} />
        <Stat icon={Clock} label={isAr ? "ساعات/أسبوع" : "Hours/week"} value={String(profile.weekly_hours || 0)} />
        <Stat icon={Target} label={isAr ? "المستوى" : "Level"} value={profile.current_level || "—"} />
      </div>

      {/* Learning DNA */}
      <div className="zeus-glass p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-bold text-lg flex items-center gap-2"><User className="text-zeus-gold" style={{ width: 18, height: 18 }} /> {t("profile.dna")}</h2>
          {editing ? (
            <div className="flex gap-2">
              <button onClick={save} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-zeus-gold text-zeus-midnight text-sm font-medium"><Check style={{ width: 14, height: 14 }} /> {t("common.save")}</button>
              <button onClick={() => { setDraft(profile); setEditing(false); }} className="p-2 rounded-full hover:bg-secondary/60"><X style={{ width: 16, height: 16 }} /></button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-sm text-zeus-brightgold hover:underline"><Pencil style={{ width: 14, height: 14 }} /> {isAr ? "تعديل" : "Edit"}</button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {dnaFields.map((f) => (
            <div key={f.key} className="p-3 rounded-xl bg-secondary/20 border border-border/60">
              <label className="text-xs text-muted-foreground block mb-1">{f.label}</label>
              {editing ? (
                f.options ? (
                  <select value={draft[f.key] || ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} className="w-full bg-transparent border border-border/60 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:zeus-gold-border">
                    <option value="">—</option>
                    {f.options.map((o, i) => <option key={o} value={o} className="bg-card">{f.labels[i]}</option>)}
                  </select>
                ) : (
                  <input type={f.type || "text"} value={draft[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })} className="w-full bg-transparent border border-border/60 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:zeus-gold-border" />
                )
              ) : (
                <div className="font-medium text-sm">{formatVal(profile[f.key], f, isAr)}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Skill graph */}
      <div className="zeus-glass p-6">
        <h2 className="font-heading font-bold text-lg mb-4">{t("profile.skills")}</h2>
        {skillGraph.length ? (
          <div className="space-y-3">
            {skillGraph.map((s) => (
              <div key={s.skill}>
                <div className="flex justify-between text-sm mb-1"><span className="font-medium">{s.skill}</span><span className="text-zeus-gold font-semibold">{s.level}%</span></div>
                <div className="h-2.5 rounded-full bg-secondary/60 overflow-hidden"><div className="h-full bg-gradient-to-r from-zeus-gold to-zeus-brightgold" style={{ width: `${s.level}%` }} /></div>
              </div>
            ))}
          </div>
        ) : <p className="text-muted-foreground text-sm">—</p>}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="zeus-glass p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-zeus-gold/15 flex items-center justify-center"><Icon className="text-zeus-gold" style={{ width: 20, height: 20 }} /></div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-heading font-bold text-lg">{value}</div></div>
    </div>
  );
}

function formatVal(v, f, isAr) {
  if (f.staticValue) return f.staticValue;
  if (v === undefined || v === null || v === "") return "—";
  if (f.options && f.labels) {
    const i = f.options.indexOf(v);
    return i >= 0 ? (isAr ? f.labels[i] : f.options[i].charAt(0).toUpperCase() + f.options[i].slice(1)) : v;
  }
  return String(v);
}