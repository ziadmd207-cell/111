import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight, Award, BookOpen, Briefcase, Check, Clock, ExternalLink,
  FileText, Loader2, Pencil, Sparkles, Target, X,
} from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";

export default function Profile() {
  const { t, lang, dir } = useI18n();
  const { profile, updateProfile } = useProfile();
  const isAr = lang === "ar";
  const [me, setMe] = useState(null);
  const [cv, setCv] = useState(null);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [portfolioCopied, setPortfolioCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const [account, projectResult, taskResult, cvResult, certificateResult] = await Promise.allSettled([
        api.auth.me(),
        api.entities.Project.filter({}, "-created_date", 50),
        api.entities.Task.filter({}, "order", 200),
        api.entities.CV.filter({}, "-created_date", 1),
        api.certificates.mine(),
      ]);
      if (account.status === "fulfilled") setMe(account.value);
      if (projectResult.status === "fulfilled") setProjects(projectResult.value);
      if (taskResult.status === "fulfilled") setTasks(taskResult.value);
      if (cvResult.status === "fulfilled") setCv(cvResult.value[0] || null);
      if (certificateResult.status === "fulfilled") setCertificates(certificateResult.value.certificates || []);
      const failed = [account, projectResult, taskResult, cvResult, certificateResult].find((result) => result.status === "rejected");
      if (failed) setPageError(failed.reason?.message || (isAr ? "تعذر تحميل بعض بيانات التقدم." : "Couldn't load some progress data."));
      setLoading(false);
    })();
  }, [isAr]);

  useEffect(() => { if (profile) setDraft(profile); }, [profile]);

  const save = async () => {
    setSaving(true);
    setPageError("");
    try {
      await updateProfile(draft);
      setEditing(false);
    } catch (error) {
      setPageError(error.message || (isAr ? "تعذر حفظ الملف الشخصي." : "Couldn't save the profile."));
    } finally {
      setSaving(false);
    }
  };

  const copyPortfolioLink = async () => {
    if (!me?.id) {
      setPageError(isAr ? "تعذر إنشاء رابط الملف العام." : "Couldn't create your public profile link.");
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/portfolio/${me.id}`);
      setPortfolioCopied(true);
      window.setTimeout(() => setPortfolioCopied(false), 2200);
    } catch (error) {
      setPageError(error.message || (isAr ? "تعذر نسخ الرابط." : "Couldn't copy the link."));
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;
  if (!profile) return <div role="alert" className="zeus-glass p-6 text-sm text-destructive">{pageError || (isAr ? "ملف التعلّم غير متاح." : "Your learning profile is unavailable.")}</div>;

  const doneTasks = tasks.filter((x) => x.status === "done").length;
  const completedProjects = projects.filter((p) => p.status === "completed").length;
  const skillGraph = profile.skill_graph || [];
  const portfolioReady = !!(cv || completedProjects);

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
    <div dir={dir} className="space-y-7 pb-6">
      {pageError && <p role="alert" className="zeus-glass border border-destructive/40 p-3 text-sm text-destructive">{pageError}</p>}
      <section className="relative overflow-hidden rounded-[2rem] border border-zeus-gold/20 bg-gradient-to-br from-zeus-gold/10 via-card/80 to-card p-6 sm:p-9">
        <div className="pointer-events-none absolute -end-16 -top-20 h-64 w-64 rounded-full bg-zeus-gold/10 blur-3xl" />
        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-4 sm:gap-6">
            {cv?.photo_url ? (
              <img src={cv.photo_url} alt="" className="h-20 w-20 shrink-0 rounded-3xl border border-white/10 object-cover sm:h-24 sm:w-24" />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-zeus-gold to-amber-600 text-3xl font-extrabold text-zeus-midnight shadow-lg shadow-zeus-gold/15 sm:h-24 sm:w-24">
                {(me?.full_name || me?.email || "Z").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-zeus-brightgold">{isAr ? "مساحة التعلّم الخاصة بك" : "YOUR LEARNING SPACE"}</p>
              <h1 className="truncate font-heading text-2xl font-extrabold sm:text-4xl">{me?.full_name || me?.email || (isAr ? "ملفي الشخصي" : "My profile")}</h1>
              {me?.email && <p className="mt-1 truncate text-sm text-muted-foreground">{me.email}</p>}
              <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-zeus-gold/25 bg-zeus-gold/10 px-3 py-1.5 text-sm text-zeus-brightgold">
                <Target className="h-4 w-4 shrink-0" />
                <span className="truncate">{profile.goal || (isAr ? "حدد هدفك التعليمي" : "Choose your learning goal")}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/cv-builder" className="inline-flex items-center justify-center gap-2 rounded-xl bg-zeus-gold px-4 py-2.5 text-sm font-bold text-zeus-midnight transition hover:bg-zeus-brightgold">
              <FileText className="h-4 w-4" /> {isAr ? "السيرة الذاتية" : "Build your CV"}
            </Link>
            {portfolioReady && me?.id && (
              <>
                <Link to={`/portfolio/${me.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/40 px-4 py-2.5 text-sm font-semibold transition hover:border-zeus-gold/50">
                  <ExternalLink className="h-4 w-4" /> {isAr ? "عرض البورتفوليو" : "View portfolio"}
                </Link>
                <button type="button" onClick={copyPortfolioLink} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/40 px-4 py-2.5 text-sm font-semibold transition hover:border-zeus-gold/50">
                  <ArrowUpRight className="h-4 w-4" /> {portfolioCopied ? (isAr ? "تم نسخ الرابط" : "Link copied") : (isAr ? "مشاركة الرابط" : "Share portfolio")}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Check} label={isAr ? "مهام مكتملة" : "Tasks completed"} value={String(doneTasks)} detail={isAr ? "خطوة وراء خطوة" : "One step at a time"} />
        <Stat icon={Briefcase} label={isAr ? "مشاريع مكتملة" : "Projects completed"} value={String(completedProjects)} detail={isAr ? "أعمال في معرضك" : "In your portfolio"} />
        <Stat icon={Clock} label={isAr ? "ساعات أسبوعيًا" : "Hours per week"} value={String(profile.weekly_hours || 0)} detail={isAr ? "حسب خطتك" : "In your study plan"} />
        <Stat icon={Target} label={isAr ? "مستواك الحالي" : "Current level"} value={formatVal(profile.current_level, dnaFields[1], isAr)} detail={isAr ? "تقدم حسب مستواك" : "Your learning pace"} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,.7fr)]">
        <div className="zeus-glass p-5 sm:p-7">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-zeus-brightgold">{isAr ? "معلوماتك" : "YOUR PROFILE"}</p>
              <h2 className="font-heading text-xl font-bold">{t("profile.dna")}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{isAr ? "تفضيلاتك تساعد زيوس يضبط الخطة على طريقتك." : "Your preferences help ZEUS tailor your learning plan."}</p>
            </div>
            {editing ? (
              <div className="flex gap-2">
                <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-zeus-gold px-3.5 py-2 text-sm font-semibold text-zeus-midnight disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t("common.save")}
                </button>
                <button type="button" disabled={saving} onClick={() => { setDraft(profile); setEditing(false); setPageError(""); }} className="rounded-xl border border-border/70 p-2 text-muted-foreground hover:text-foreground disabled:opacity-50" aria-label={isAr ? "إلغاء" : "Cancel"}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-xl border border-border/70 px-3.5 py-2 text-sm font-semibold transition hover:border-zeus-gold/50">
                <Pencil className="h-4 w-4 text-zeus-gold" /> {isAr ? "تعديل بياناتي" : "Edit profile"}
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {dnaFields.map((field) => (
              <div key={field.key} className="rounded-2xl border border-border/60 bg-background/30 p-3.5 transition hover:border-zeus-gold/25">
                <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">{field.label}</label>
                {editing && !field.staticValue ? (
                  field.options ? (
                    <select value={draft[field.key] || ""} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} className="w-full rounded-lg border border-border/70 bg-card px-2.5 py-2 text-sm outline-none focus:border-zeus-gold">
                      <option value="">—</option>
                      {field.options.map((option, index) => <option key={option} value={option}>{field.labels[index]}</option>)}
                    </select>
                  ) : (
                    <input type={field.type || "text"} min={field.type === "number" ? 0 : undefined} value={draft[field.key] ?? ""} onChange={(event) => setDraft({ ...draft, [field.key]: field.type === "number" ? Number(event.target.value) : event.target.value })} className="w-full rounded-lg border border-border/70 bg-card px-2.5 py-2 text-sm outline-none focus:border-zeus-gold" />
                  )
                ) : (
                  <p className="break-words text-sm font-semibold">{formatVal(profile[field.key], field, isAr)}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="zeus-glass p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zeus-gold/10 text-zeus-gold"><Sparkles className="h-5 w-5" /></span>
              <div><p className="text-xs text-muted-foreground">{isAr ? "تطور مهاراتك" : "SKILL DEVELOPMENT"}</p><h2 className="font-heading font-bold">{t("profile.skills")}</h2></div>
            </div>
            {skillGraph.length ? (
              <div className="max-h-[28rem] space-y-4 overflow-y-auto pe-1">
                {skillGraph.map((skill) => {
                  const level = Math.max(0, Math.min(100, Number(skill.level) || 0));
                  return (
                    <div key={skill.skill}>
                      <div className="mb-1.5 flex justify-between gap-3 text-xs"><span className="truncate font-medium">{skill.skill}</span><span className="shrink-0 font-bold text-zeus-brightgold">{level}%</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-secondary/60"><div className="h-full rounded-full bg-gradient-to-r from-zeus-gold to-amber-300 transition-all" style={{ width: `${level}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">{isAr ? "مهاراتك هتظهر هنا مع تقدمك في الدروس." : "Your skills will appear here as you progress through lessons."}</p>
            )}
          </div>
          <div className="zeus-glass overflow-hidden">
            <div className="border-b border-border/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zeus-brightgold">{isAr ? "خطوتك التالية" : "YOUR NEXT STEP"}</p>
              <h2 className="mt-2 font-heading text-lg font-bold">{isAr ? "خلّي تقدمك يبان" : "Make your progress visible"}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{isAr ? "اجمع مشاريعك ومهاراتك في بورتفوليو، وجهّز سيرتك للتقديم." : "Bring your projects and skills together, then prepare a CV for your next opportunity."}</p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border/50">
              <Link to="/projects" className="flex items-center gap-2 bg-card/80 p-4 text-sm font-semibold transition hover:bg-zeus-gold/5">
                <BookOpen className="h-4 w-4 text-zeus-gold" /> {isAr ? "مشاريعي" : "My projects"}
              </Link>
              <Link to="/cv-builder" className="flex items-center gap-2 bg-card/80 p-4 text-sm font-semibold transition hover:bg-zeus-gold/5">
                <FileText className="h-4 w-4 text-zeus-gold" /> {isAr ? "السيرة الذاتية" : "My CV"}
              </Link>
              <Link to="/certificates" className="col-span-2 flex items-center justify-between gap-2 bg-card/80 p-4 text-sm font-semibold transition hover:bg-zeus-gold/5">
                <span className="flex items-center gap-2"><Award className="h-4 w-4 text-zeus-gold" /> {isAr ? "شهاداتي" : "My certificates"}</span>
                <span className="text-xs text-muted-foreground">{certificates.length}</span>
              </Link>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value, detail }) {
  return (
    <div className="zeus-glass min-w-0 p-4 sm:p-5">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-zeus-gold/10"><Icon className="h-5 w-5 text-zeus-gold" /></div>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-heading text-xl font-bold sm:text-2xl">{value}</div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</div>
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