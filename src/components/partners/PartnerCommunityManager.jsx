import { useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, Save, Users, X } from "lucide-react";
import { api } from "@/api/client";

export default function PartnerCommunityManager({ students, isAr, partnerId }) {
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState({ name: "", description: "", goal: "", stage: "", members: [] });
  const [editing, setEditing] = useState("");
  const [text, setText] = useState({ name: "", description: "", goal: "", stage: "" });
  const isAdmin = Boolean(partnerId);
  const t = (ar, en) => isAr ? ar : en;
  const activeStudents = students.filter((item) => item.member_status === "active");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = isAdmin
        ? await api.partners.adminCommunities(partnerId)
        : await api.partners.communities();
      setCommunities(result.communities || []);
    } catch (loadError) {
      setError(loadError.message || t("تعذر تحميل المجتمعات.", "Could not load communities."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [partnerId]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (isAdmin) await api.partners.adminCreateCommunity(partnerId, draft);
      else await api.partners.createCommunity(draft);
      setDraft({ name: "", description: "", goal: "", stage: "", members: [] });
      setNotice(t("تم إنشاء المجتمع.", "Community created."));
      await load();
    } catch (saveError) {
      setError(saveError.message || t("تعذر إنشاء المجتمع.", "Could not create community."));
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (community) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = { ...text, members: community.members || [] };
      if (isAdmin) await api.partners.adminUpdateCommunity(partnerId, community.id, data);
      else await api.partners.updateCommunity(community.id, data);
      setEditing("");
      setNotice(t("تم حفظ إعدادات المجتمع.", "Community settings saved."));
      await load();
    } catch (saveError) {
      setError(saveError.message || t("تعذر حفظ المجتمع.", "Could not save community."));
    } finally {
      setSaving(false);
    }
  };

  const toggleStudent = (state, setState, id) => {
    setState((current) => ({
      ...current,
      members: current.members.includes(id)
        ? current.members.filter((memberId) => memberId !== id)
        : [...current.members, id],
    }));
  };

  const fieldClass = "w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-xs";
  return <section className="space-y-4 rounded-2xl border border-border/50 bg-card/70 p-4">
    <header className="flex items-center justify-between gap-3"><div><h2 className="font-heading text-sm font-bold">{t("مجتمعات الشريك", "Partner communities")}</h2><p className="mt-1 text-[10px] text-muted-foreground">{t("المجتمعات هنا منفصلة عن مجتمعات المنصة، والطالب يصل للمجتمع المسجل به فقط.", "These communities are scoped to this partner; students only see communities they belong to.")}</p></div><button type="button" onClick={load} className="rounded-lg border border-border/60 p-2" aria-label={t("تحديث", "Refresh")}><RefreshCw className="h-4 w-4" /></button></header>
    {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300">{notice}</p>}
    <form onSubmit={save} className="grid gap-2 sm:grid-cols-2">
      <input className={fieldClass} required maxLength={160} placeholder={t("اسم المجتمع", "Community name")} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
      <input className={fieldClass} maxLength={200} placeholder={t("المجال أو الهدف", "Topic or goal")} value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} />
      <input className={fieldClass} maxLength={120} placeholder={t("المرحلة", "Stage")} value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value })} />
      <input className={fieldClass} maxLength={2000} placeholder={t("وصف المجتمع", "Community description")} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
      <fieldset className="max-h-32 space-y-1 overflow-auto rounded-xl border border-border/50 p-2 sm:col-span-2"><legend className="px-1 text-[10px] text-muted-foreground">{t("إضافة الطلاب", "Add students")}</legend>{activeStudents.length ? activeStudents.map((student) => <label key={student.id} className="flex items-center gap-2 text-[10px]"><input type="checkbox" checked={draft.members.includes(student.id)} onChange={() => toggleStudent(draft, setDraft, student.id)} />{student.full_name} · {student.email || student.username}</label>) : <span className="text-[10px] text-muted-foreground">{t("لا يوجد طلاب نشطون.", "No active students.")}</span>}</fieldset>
      <button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-zeus-gold/40 bg-zeus-gold/10 px-3 py-2 text-xs font-semibold text-zeus-brightgold disabled:opacity-50 sm:col-span-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{t("إنشاء مجتمع", "Create community")}</button>
    </form>
    {loading ? <div className="flex justify-center p-5"><Loader2 className="h-5 w-5 animate-spin text-zeus-gold" /></div>
      : communities.map((community) => <article key={community.id} className="space-y-3 rounded-xl border border-border/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-zeus-gold" /><strong className="text-xs">{community.name}</strong><span className="text-[10px] text-muted-foreground">{community.member_count} {t("طالب", "students")}</span></div><button type="button" disabled={saving} onClick={() => isAdmin ? api.partners.adminUpdateCommunity(partnerId, community.id, { is_closed: !community.is_closed }).then(load).catch((e) => setError(e.message)) : api.partners.updateCommunity(community.id, { is_closed: !community.is_closed }).then(load).catch((e) => setError(e.message))} className="rounded-lg border border-border/50 px-2 py-1 text-[10px]">{community.is_closed ? t("إعادة فتح", "Reopen") : t("إغلاق الكتابة", "Close posting")}</button></div>
        {editing === community.id ? <>
          <div className="grid gap-2 sm:grid-cols-2">{["name", "goal", "stage", "description"].map((key) => <input key={key} maxLength={key === "description" ? 2000 : key === "name" ? 160 : 200} className={fieldClass} placeholder={{ name: t("اسم المجتمع", "Community name"), goal: t("الهدف", "Goal"), stage: t("المرحلة", "Stage"), description: t("الوصف", "Description") }[key]} value={text[key] || ""} onChange={(event) => setText({ ...text, [key]: event.target.value })} />)}</div>
          <fieldset className="max-h-32 space-y-1 overflow-auto rounded-xl border border-border/50 p-2"><legend className="px-1 text-[10px] text-muted-foreground">{t("الطلاب", "Students")}</legend>{activeStudents.map((student) => <label key={student.id} className="flex items-center gap-2 text-[10px]"><input type="checkbox" checked={(community.members || []).includes(student.id)} onChange={() => toggleStudent(community, (fn) => { setCommunities((current) => current.map((item) => item.id === community.id ? fn(item) : item)); }, student.id)} />{student.full_name}</label>)}</fieldset>
          <div className="flex gap-2"><button type="button" disabled={saving} onClick={() => saveEdit(community)} className="inline-flex items-center gap-1 rounded-lg border border-zeus-gold/40 px-2 py-1 text-[10px]"><Save className="h-3 w-3" />{t("حفظ", "Save")}</button><button type="button" onClick={() => setEditing("")} className="rounded-lg border border-border/50 px-2 py-1 text-[10px]">{t("إلغاء", "Cancel")}</button></div>
        </> : <div className="flex items-start justify-between gap-2"><div><p className="text-[10px] text-muted-foreground">{community.description || community.goal || community.stage || "—"}</p><p className="mt-1 text-[10px] text-muted-foreground">{community.member_names?.join("، ") || t("لم يتم تعيين طلاب.", "No students assigned.")}</p></div><button type="button" onClick={() => { setEditing(community.id); setText({ name: community.name, goal: community.goal || "", stage: community.stage || "", description: community.description || "" }); }} className="rounded-lg border border-border/50 p-1.5" aria-label={t("تعديل", "Edit")}><X className="h-3.5 w-3.5 rotate-45" /></button></div>}
      </article>)}
  </section>;
}
