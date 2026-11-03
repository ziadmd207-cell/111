import { useEffect, useMemo, useState } from "react";
import {
  Building2, Check, Clock3, Download, Eye, Loader2, Pencil, Plus,
  RefreshCw, Search, ShieldCheck, Trash2, Users, X,
} from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import PartnerCommunityManager from "@/components/partners/PartnerCommunityManager";

const TYPES = ["school", "university", "educational_institution", "training_center", "other"];
const PLANS = ["STARTER", "PRO", "PRIME"];
const PLAN_FEATURES = {
  STARTER: { learning: true },
  PRO: { learning: true, statistics: true, projects: true },
  PRIME: { learning: true, statistics: true, community: true, projects: true, cv: true, portfolio: true, career: true, certificates: true },
};
const FEATURE_KEYS = ["learning", "statistics", "community", "projects", "cv", "portfolio", "career", "certificates"];

const labels = {
  school: ["مدرسة", "School"],
  university: ["جامعة", "University"],
  educational_institution: ["مؤسسة تعليمية", "Educational institution"],
  training_center: ["مركز تدريب", "Training center"],
  other: ["أخرى", "Other"],
};

function useText() {
  const { lang, dir } = useI18n();
  const isAr = lang === "ar";
  return { isAr, dir, text: (ar, en) => isAr ? ar : en };
}

function Button({ children, onClick, disabled, tone = "default", type = "button" }) {
  const style = tone === "danger"
    ? "border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
    : tone === "primary"
      ? "border-zeus-gold/40 bg-zeus-gold/10 text-zeus-brightgold hover:bg-zeus-gold/20"
      : "border-border/60 text-foreground hover:bg-secondary/60";
  return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${style}`}>{children}</button>;
}

function Field({ label, ...props }) {
  return <label className="block space-y-1.5 text-xs"><span className="font-medium text-muted-foreground">{label}</span><input {...props} className={`w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm outline-none focus:border-zeus-gold/60 ${props.className || ""}`} /></label>;
}

function Metric({ label, value, icon: Icon }) {
  return <div className="zeus-glass flex items-center gap-3 rounded-2xl border border-border/50 p-4"><span className="rounded-xl bg-zeus-gold/10 p-2.5 text-zeus-gold"><Icon className="h-4 w-4" /></span><div><div className="text-[11px] text-muted-foreground">{label}</div><div className="mt-0.5 font-heading text-xl font-extrabold text-zeus-brightgold">{value}</div></div></div>;
}

export default function AdminPartners() {
  const { isAr, dir, text } = useText();
  const [partners, setPartners] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentStatus, setStudentStatus] = useState("all");
  const [performance, setPerformance] = useState("all");
  const [studentSort, setStudentSort] = useState("performance_desc");
  const [exporting, setExporting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [student, setStudent] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [newMember, setNewMember] = useState({ member_type: "student", full_name: "", email: "", username: "", password: "", national_id: "", phone: "" });
  const [newPartner, setNewPartner] = useState({ name: "", institution_type: "school", full_name: "", email: "", password: "", subscription_plan: "PRO", subscription_days: 30, max_students: "" });

  const loadList = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.partners.adminList(search);
      setPartners(result.partners || []);
      if (selectedId && !(result.partners || []).some((item) => item.id === selectedId)) {
        setSelectedId("");
        setDetail(null);
      }
    } catch (loadError) {
      setError(loadError.message || text("تعذر تحميل الشركاء.", "Could not load partners."));
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id = selectedId) => {
    if (!id) return;
    setError("");
    try {
      setDetail(await api.partners.adminDetails(id));
    } catch (loadError) {
      setError(loadError.message || text("تعذر تحميل بيانات الشريك.", "Could not load partner details."));
    }
  };

  useEffect(() => { loadList(); }, []);
  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId]);

  const submitPartner = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await api.partners.adminCreate({
        ...newPartner,
        max_students: newPartner.max_students || null,
      });
      setFormOpen(false);
      setNotice(text("تم إنشاء حساب الشريك.", "Partner account created."));
      setSelectedId(created.id);
      setNewPartner({ name: "", institution_type: "school", full_name: "", email: "", password: "", subscription_plan: "PRO", subscription_days: 30, max_students: "" });
      await loadList();
    } catch (saveError) {
      setError(saveError.message || text("تعذر إنشاء الشريك.", "Could not create partner."));
    } finally {
      setSaving(false);
    }
  };

  const addMember = async (event) => {
    event.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setError("");
    try {
      await api.partners.adminAddMember(selectedId, { ...newMember, member_type: "student" });
      setNotice(text("تمت إضافة الحساب.", "Account added."));
      setNewMember({ member_type: "student", full_name: "", email: "", username: "", password: "", national_id: "", phone: "" });
      await loadDetail();
      await loadList();
    } catch (saveError) {
      setError(saveError.message || text("تعذرت إضافة الحساب.", "Could not add account."));
    } finally {
      setSaving(false);
    }
  };

  const savePartner = async (event) => {
    event.preventDefault();
    if (!detail?.partner) return;
    setSaving(true);
    setError("");
    try {
      const { partner } = detail;
      await api.partners.adminUpdate(partner.id, {
        name: partner.name,
        full_name: partner.full_name,
        email: partner.email,
        password: partner.password || undefined,
        institution_type: partner.institution_type,
        subscription_plan: partner.subscription_plan,
        subscription_status: partner.subscription_status,
        subscription_start: partner.subscription_start ? partner.subscription_start.slice(0, 10) : null,
        subscription_expires: partner.subscription_expires ? partner.subscription_expires.slice(0, 10) : null,
        status: partner.status,
        max_students: partner.max_students,
        features: partner.features,
      });
      setNotice(text("تم حفظ إعدادات الشريك.", "Partner settings saved."));
      setDetail((current) => ({ ...current, password: "" }));
      await loadDetail();
      await loadList();
    } catch (saveError) {
      setError(saveError.message || text("تعذر حفظ إعدادات الشريك.", "Could not save partner settings."));
    } finally {
      setSaving(false);
    }
  };

  const extendSubscription = async () => {
    const raw = window.prompt(text("أدخل عدد الأيام للإضافة أو الخصم (مثال: 30 أو -5)", "Days to add or remove (for example 30 or -5)"), "30");
    if (raw === null) return;
    const days = Number(raw);
    if (!Number.isInteger(days) || days === 0) {
      setError(text("أدخل عدد أيام صحيحًا غير صفر.", "Enter a non-zero whole number of days."));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.partners.adminExtend(selectedId, days);
      setNotice(text("تم تحديث مدة الاشتراك.", "Subscription duration updated."));
      await loadDetail();
      await loadList();
    } catch (saveError) {
      setError(saveError.message || text("تعذر تحديث الاشتراك.", "Could not update subscription."));
    } finally {
      setSaving(false);
    }
  };

  const deletePartner = async () => {
    if (!selectedId || !window.confirm(text("سيتم تعطيل وصول الشريك وطلابه مع الاحتفاظ بالحسابات وسجلات التعلم. متابعة؟", "This disables partner and student access while preserving accounts and learning records. Continue?"))) return;
    setSaving(true);
    setError("");
    try {
      await api.partners.adminDelete(selectedId);
      setSelectedId("");
      setDetail(null);
      setNotice(text("تم إيقاف الشريك وحفظ سجلاته.", "Partner suspended; records were preserved."));
      await loadList();
    } catch (saveError) {
      setError(saveError.message || text("تعذر إيقاف الشريك.", "Could not suspend partner."));
    } finally {
      setSaving(false);
    }
  };

  const saveMember = async (event) => {
    event.preventDefault();
    if (!editingMember || !selectedId) return;
    setSaving(true);
    setError("");
    try {
      await api.partners.adminUpdateMember(selectedId, editingMember.id, {
        full_name: editingMember.full_name,
        email: editingMember.email || undefined,
        username: editingMember.username || "",
        phone: editingMember.phone || "",
        national_id: editingMember.national_id || "",
        status: editingMember.status || editingMember.member_status,
        password: editingMember.password || undefined,
      });
      setEditingMember(null);
      setNotice(text("تم تحديث بيانات الطالب.", "Student account updated."));
      await loadDetail();
      await loadList();
    } catch (saveError) {
      setError(saveError.message || text("تعذر تحديث بيانات الطالب.", "Could not update student."));
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (studentId) => {
    if (!window.confirm(text("إيقاف الحساب مع الاحتفاظ بسجلاته؟", "Suspend this account while preserving its records?"))) return;
    setSaving(true);
    setError("");
    try {
      await api.partners.adminRemoveMember(selectedId, studentId);
      setNotice(text("تم إيقاف حساب الطالب وحفظ سجله.", "Student suspended; learning history preserved."));
      await loadDetail();
      await loadList();
    } catch (saveError) {
      setError(saveError.message || text("تعذر إيقاف حساب الطالب.", "Could not suspend student."));
    } finally {
      setSaving(false);
    }
  };

  const patchDetail = (key, value) => setDetail((current) => ({ ...current, partner: { ...current.partner, [key]: value } }));
  const selectedLabel = useMemo(() => partners.find((item) => item.id === selectedId)?.name || "", [partners, selectedId]);
  const students = detail?.students || [];
  const learningStatusLabel = (status) => ({
    completed: text("مكتمل", "Completed"),
    learning: text("قيد التعلم", "In progress"),
    not_started: text("لم يبدأ", "Not started"),
  })[status] || text("غير معروف", "Unknown");
  const performanceBandLabel = (band) => ({
    high: text("مرتفع", "High"),
    average: text("مستقر", "On track"),
    needs_support: text("يحتاج دعمًا", "Needs support"),
  })[band] || text("لا توجد بيانات", "No data");
  const filteredStudents = useMemo(() => {
    const needle = studentSearch.trim().toLocaleLowerCase();
    const filtered = students.filter((item) => {
      const searchable = [item.full_name, item.email, item.username, item.phone, item.track]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      const matchesStatus = studentStatus === "all"
        || (studentStatus === "completed" && item.learning_status === "completed")
        || (studentStatus === "learning" && item.learning_status === "learning")
        || (studentStatus === "not_started" && item.learning_status === "not_started")
        || (studentStatus === "inactive" && item.member_status !== "active")
        || (studentStatus === "needs_review" && item.quiz_attempts?.length && item.average_quiz_score < 70);
      return (!needle || searchable.includes(needle))
        && matchesStatus
        && (performance === "all" || item.performance_band === performance);
    });
    const sorters = {
      performance_desc: (a, b) => b.performance_score - a.performance_score,
      progress_desc: (a, b) => b.progress_percent - a.progress_percent,
      quiz_desc: (a, b) => b.average_quiz_score - a.average_quiz_score,
      exam_desc: (a, b) => b.average_exam_score - a.average_exam_score,
      progress_asc: (a, b) => a.progress_percent - b.progress_percent,
      name_asc: (a, b) => (a.full_name || "").localeCompare(b.full_name || ""),
    };
    return [...filtered].sort((a, b) => sorters[studentSort](a, b) || (a.full_name || "").localeCompare(b.full_name || ""));
  }, [students, studentSearch, studentStatus, performance, studentSort]);

  const exportFilteredStudents = async () => {
    if (!selectedId) return;
    setExporting(true);
    setError("");
    try {
      const filters = {
        search: studentSearch.trim(),
        status: studentStatus,
        performance,
        sort: studentSort,
      };
      const blob = await api.partners.adminExportStudents(selectedId, filters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `zeus-partner-students-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportError) {
      setError(exportError.message || text("تعذر تصدير نتائج الطلاب.", "Could not export student results."));
    } finally {
      setExporting(false);
    }
  };

  return (
    <main dir={dir} className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="font-heading text-2xl font-extrabold">{text("إدارة الشركاء", "Partners management")}</h1><p className="mt-1 text-xs text-muted-foreground">{text("إدارة المدارس والجامعات وحساباتها وطلابها واشتراكاتها.", "Manage educational partners, accounts, students, and subscriptions.")}</p></div>
        <div className="flex gap-2">
          <Button onClick={loadList}><RefreshCw className="h-3.5 w-3.5" />{text("تحديث", "Refresh")}</Button>
          <Button tone="primary" onClick={() => setFormOpen((value) => !value)}><Plus className="h-3.5 w-3.5" />{text("إضافة شريك", "Add partner")}</Button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">{notice}</p>}

      {formOpen && <form onSubmit={submitPartner} className="zeus-glass grid gap-3 rounded-2xl border border-zeus-gold/30 p-4 md:grid-cols-3">
        <Field label={text("اسم الجهة", "Partner name")} required maxLength={160} value={newPartner.name} onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })} />
        <Field label={text("اسم مسؤول الحساب", "Account owner name")} value={newPartner.full_name} onChange={(e) => setNewPartner({ ...newPartner, full_name: e.target.value })} />
        <Field label={text("البريد الإلكتروني للدخول", "Login email")} type="email" required value={newPartner.email} onChange={(e) => setNewPartner({ ...newPartner, email: e.target.value })} />
        <Field label={text("كلمة المرور (8 أحرف على الأقل)", "Password (8+ characters)")} type="password" minLength={8} required value={newPartner.password} onChange={(e) => setNewPartner({ ...newPartner, password: e.target.value })} />
        <label className="block space-y-1.5 text-xs"><span className="font-medium text-muted-foreground">{text("نوع الجهة", "Institution type")}</span><select value={newPartner.institution_type} onChange={(e) => setNewPartner({ ...newPartner, institution_type: e.target.value })} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm">{TYPES.map((type) => <option key={type} value={type}>{labels[type][isAr ? 0 : 1]}</option>)}</select></label>
        <label className="block space-y-1.5 text-xs"><span className="font-medium text-muted-foreground">{text("الخطة", "Plan")}</span><select value={newPartner.subscription_plan} onChange={(e) => setNewPartner({ ...newPartner, subscription_plan: e.target.value })} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm">{PLANS.map((plan) => <option key={plan}>{plan}</option>)}</select></label>
        <Field label={text("مدة الاشتراك بالأيام", "Subscription duration in days")} type="number" min="1" max="3650" required value={newPartner.subscription_days} onChange={(e) => setNewPartner({ ...newPartner, subscription_days: Number(e.target.value) })} />
        <Field label={text("الحد الأقصى للطلاب (اختياري)", "Student limit (optional)")} type="number" min="1" value={newPartner.max_students} onChange={(e) => setNewPartner({ ...newPartner, max_students: e.target.value })} />
        <div className="flex items-end gap-2"><Button type="submit" tone="primary" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{text("إنشاء الحساب", "Create account")}</Button><Button onClick={() => setFormOpen(false)}>{text("إلغاء", "Cancel")}</Button></div>
      </form>}

      <section className="grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.8fr)]">
        <div className="zeus-glass space-y-3 rounded-2xl border border-border/50 p-4">
          <label className="relative block"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadList()} placeholder={text("بحث عن شريك أو بريد...", "Search partner or email...")} className="w-full rounded-xl border border-border/60 bg-background py-2.5 ps-9 pe-3 text-xs" /></label>
          <div className="max-h-[70vh] space-y-2 overflow-auto">
            {loading ? <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-zeus-gold" /></div>
              : partners.length === 0 ? <p className="p-5 text-center text-xs text-muted-foreground">{text("لا يوجد شركاء بعد.", "No partners yet.")}</p>
                : partners.map((item) => <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl border p-3 text-start transition ${item.id === selectedId ? "border-zeus-gold/60 bg-zeus-gold/10" : "border-border/50 hover:bg-secondary/40"}`}>
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold">{item.name}</span><span className={`rounded-full px-2 py-1 text-[9px] ${item.status === "active" ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>{item.status === "active" ? text("نشط", "Active") : item.status === "deleted" ? text("معطل", "Disabled") : text("موقوف", "Suspended")}</span></div>
                  <p className="mt-1 truncate text-[10px] text-muted-foreground">{item.email}</p>
                  <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>{item.student_count} {text("طالب", "students")}</span><span>{item.subscription_plan}</span></div>
                </button>)}
          </div>
        </div>

        {!selectedId || !detail?.partner ? <div className="zeus-glass flex min-h-72 flex-col items-center justify-center rounded-2xl border border-border/50 p-8 text-center text-muted-foreground"><Building2 className="mb-3 h-8 w-8 text-zeus-gold" /><p className="text-sm font-semibold">{text("اختر شريكًا لعرض وإدارة ملفه", "Select a partner to manage its account")}</p></div>
          : <div className="space-y-4">
            <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
              <Metric icon={Users} label={text("إجمالي الطلاب", "Students")} value={detail.stats?.students || 0} />
              <Metric icon={Check} label={text("أكملوا المسار", "Completed")} value={detail.stats?.completed || 0} />
              <Metric icon={Clock3} label={text("ما زالوا يتعلمون", "Learning")} value={detail.stats?.learning || 0} />
              <Metric icon={ShieldCheck} label={text("متوسط الإنجاز", "Average progress")} value={`${detail.stats?.average_progress || 0}%`} />
              <Metric icon={ShieldCheck} label={text("متوسط الامتحانات", "Exam average")} value={`${detail.stats?.average_exam_score || 0}%`} />
              <Metric icon={Check} label={text("امتحانات نهائية مكتملة", "Final exams submitted")} value={detail.stats?.final_exams_completed || 0} />
            </section>

            <form onSubmit={savePartner} className="zeus-glass space-y-4 rounded-2xl border border-border/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-heading text-base font-bold">{selectedLabel}</h2><p className="text-[10px] text-muted-foreground">{detail.partner.email}</p></div><div className="flex gap-2"><Button type="submit" tone="primary" disabled={saving}><Check className="h-3.5 w-3.5" />{text("حفظ الإعدادات", "Save settings")}</Button><Button onClick={extendSubscription}><Clock3 className="h-3.5 w-3.5" />{text("تمديد الاشتراك", "Extend subscription")}</Button><Button tone="danger" onClick={deletePartner}><Trash2 className="h-3.5 w-3.5" />{text("إيقاف وحذف", "Disable")}</Button></div></div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Field label={text("اسم الجهة", "Partner name")} value={detail.partner.name} onChange={(e) => patchDetail("name", e.target.value)} />
                <Field label={text("اسم المسؤول", "Account owner")} value={detail.partner.full_name || ""} onChange={(e) => patchDetail("full_name", e.target.value)} />
                <Field label={text("البريد", "Email")} type="email" value={detail.partner.email} onChange={(e) => patchDetail("email", e.target.value)} />
                <SelectNative label={text("نوع الجهة", "Institution type")} value={detail.partner.institution_type} options={TYPES} labelFor={(option) => labels[option][isAr ? 0 : 1]} onChange={(value) => patchDetail("institution_type", value)} />
                <SelectNative label={text("الخطة", "Plan")} value={detail.partner.subscription_plan} options={PLANS} onChange={(value) => { patchDetail("subscription_plan", value); patchDetail("features", { ...PLAN_FEATURES[value] }); }} />
                <SelectNative label={text("حالة الحساب", "Account status")} value={detail.partner.status} options={["active", "suspended", "deleted"]} labelFor={(option) => option === "active" ? text("نشط", "Active") : option === "deleted" ? text("محذوف مع حفظ البيانات", "Disabled (data retained)") : text("موقوف", "Suspended")} onChange={(value) => patchDetail("status", value)} />
                <SelectNative label={text("حالة الاشتراك", "Subscription status")} value={detail.partner.subscription_status} options={["active", "suspended", "expired"]} labelFor={(option) => option === "active" ? text("نشط", "Active") : option === "expired" ? text("منتهي", "Expired") : text("موقوف", "Suspended")} onChange={(value) => patchDetail("subscription_status", value)} />
                <Field label={text("حد الطلاب", "Student limit")} type="number" min={detail.stats?.students || 0} value={detail.partner.max_students ?? ""} onChange={(e) => patchDetail("max_students", e.target.value === "" ? null : Number(e.target.value))} />
                <Field label={text("تغيير كلمة المرور (اختياري)", "Reset password (optional)")} type="password" minLength={8} value={detail.partner.password || ""} onChange={(e) => patchDetail("password", e.target.value)} />
                <Field label={text("بداية الاشتراك", "Subscription start")} type="date" value={detail.partner.subscription_start?.slice(0, 10) || ""} onChange={(e) => patchDetail("subscription_start", e.target.value || null)} />
                <Field label={text("انتهاء الاشتراك", "Subscription expiration")} type="date" value={detail.partner.subscription_expires?.slice(0, 10) || ""} onChange={(e) => patchDetail("subscription_expires", e.target.value || null)} />
              </div>
              <div><p className="mb-2 text-xs font-semibold">{text("الصلاحيات والميزات", "Feature permissions")}</p><div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">{FEATURE_KEYS.map((key) => <label key={key} className="flex items-center gap-2 rounded-lg border border-border/50 p-2 text-[11px]"><input type="checkbox" checked={Boolean(detail.partner.features?.[key])} onChange={(e) => patchDetail("features", { ...(detail.partner.features || {}), [key]: e.target.checked })} /><span>{featureLabel(key, isAr)}</span></label>)}</div></div>
            </form>

            <section className="zeus-glass space-y-3 rounded-2xl border border-border/50 p-4">
              <div className="flex items-center justify-between"><div><h2 className="font-heading text-sm font-bold">{text("إضافة حساب", "Add account")}</h2><p className="text-[10px] text-muted-foreground">{text("كلمة المرور لا تظهر بعد إنشاء الحساب.", "Passwords are never shown after account creation.")}</p></div><Users className="h-4 w-4 text-zeus-gold" /></div>
              <form onSubmit={addMember} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Field label={text("الاسم بالكامل", "Full name")} required value={newMember.full_name} onChange={(e) => setNewMember({ ...newMember, full_name: e.target.value })} />
                <Field label={text("البريد الإلكتروني", "Email address")} type="email" required value={newMember.email} onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} />
                <Field label={text("اسم المستخدم (اختياري)", "Username (optional alias)")} value={newMember.username} onChange={(e) => setNewMember({ ...newMember, username: e.target.value })} />
                <Field label={text("كلمة المرور", "Password")} type="password" minLength={8} required value={newMember.password} onChange={(e) => setNewMember({ ...newMember, password: e.target.value })} />
                <Field label={text("الرقم القومي", "National ID")} required value={newMember.national_id} onChange={(e) => setNewMember({ ...newMember, national_id: e.target.value })} />
                <Field label={text("رقم الهاتف (اختياري)", "Phone number (optional)")} value={newMember.phone} onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })} />
                <div className="flex items-end"><Button type="submit" tone="primary" disabled={saving}><Plus className="h-3.5 w-3.5" />{text("إضافة", "Add")}</Button></div>
              </form>
            </section>

            <PartnerCommunityManager key={selectedId} partnerId={selectedId} students={students} isAr={isAr} />

            <section className="zeus-glass overflow-hidden rounded-2xl border border-border/50">
              <div className="flex flex-wrap items-end gap-3 border-b border-border/50 p-4">
                <h2 className="me-auto font-heading text-sm font-bold">{text("طلاب الشريك", "Partner students")} ({filteredStudents.length}/{students.length})</h2>
                <label className="relative min-w-48 flex-1 sm:flex-none"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder={text("بحث بالاسم أو البريد أو الهاتف أو المسار", "Search name, email, phone, or track")} className="w-full rounded-xl border border-border/60 bg-background py-2 ps-9 pe-3 text-xs" /></label>
                <SelectNative label={text("حالة التقدم", "Progress status")} value={studentStatus} options={["all", "completed", "learning", "not_started", "needs_review", "inactive"]} labelFor={(option) => ({
                  all: text("كل الحالات", "All statuses"),
                  completed: text("أكملوا المسار", "Completed"),
                  learning: text("يتعلمون حاليًا", "Learning"),
                  not_started: text("لم يبدأوا", "Not started"),
                  needs_review: text("يحتاجون مراجعة", "Needs review"),
                  inactive: text("حسابات موقوفة", "Inactive"),
                })[option]} onChange={setStudentStatus} />
                <SelectNative label={text("الأداء", "Performance")} value={performance} options={["all", "high", "average", "needs_support"]} labelFor={(option) => ({
                  all: text("كل المستويات", "All levels"),
                  high: text("مرتفع (80 فأكثر)", "High (80+)"),
                  average: text("مستقر (60–79)", "On track (60–79)"),
                  needs_support: text("يحتاج دعمًا (أقل من 60)", "Needs support (<60)"),
                })[option]} onChange={setPerformance} />
                <SelectNative label={text("الترتيب", "Sort")} value={studentSort} options={["performance_desc", "progress_desc", "quiz_desc", "exam_desc", "progress_asc", "name_asc"]} labelFor={(option) => ({
                  performance_desc: text("الأعلى أداءً", "Best overall performance"),
                  progress_desc: text("الأعلى تقدمًا", "Highest progress"),
                  quiz_desc: text("أعلى متوسط كويز", "Highest quiz average"),
                  exam_desc: text("أعلى متوسط امتحانات", "Highest exam average"),
                  progress_asc: text("الأقل تقدمًا", "Lowest progress"),
                  name_asc: text("الاسم أ–ي", "Name A–Z"),
                })[option]} onChange={setStudentSort} />
                <Button onClick={exportFilteredStudents} disabled={exporting}><Download className="h-3.5 w-3.5" />{exporting ? text("جارٍ تجهيز Excel...", "Preparing Excel...") : text("تنزيل Excel المفلتر", "Export filtered Excel")}</Button>
              </div>
              <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-start text-xs"><thead className="bg-secondary/30 text-[10px] text-muted-foreground"><tr><th className="p-3 text-start">{text("الطالب", "Student")}</th><th className="p-3 text-start">{text("المسار", "Track")}</th><th className="p-3 text-start">{text("التقدم", "Progress")}</th><th className="p-3 text-start">{text("متوسط الاختبارات", "Quiz average")}</th><th className="p-3 text-start">{text("الأداء", "Performance")}</th><th className="p-3 text-start">{text("المشروع النهائي", "Capstone")}</th><th className="p-3 text-start">{text("حالة التعلم", "Learning status")}</th><th className="p-3 text-start">{text("الإدارة", "Actions")}</th></tr></thead><tbody>{filteredStudents.map((item) => <tr key={item.id} className="border-t border-border/40"><td className="p-3"><div className="font-semibold">{item.full_name}</div><div className="text-[10px] text-muted-foreground">{item.email || item.username} · {item.phone || "—"}</div></td><td className="p-3">{item.track || text("لم يبدأ", "Not started")}</td><td className="p-3">{item.progress_percent}% <span className="text-muted-foreground">({item.lessons_completed}/{item.lessons_total})</span></td><td className="p-3">{item.quiz_attempts?.length ? `${item.average_quiz_score}%` : "—"}</td><td className="p-3 font-semibold">{item.has_learning_activity ? `${item.performance_score}% · ${performanceBandLabel(item.performance_band)}` : performanceBandLabel(null)}</td><td className="p-3">{item.capstone_completed ? text("مكتمل", "Complete") : item.capstone_exists ? text("متبقي", "Pending") : "—"}</td><td className="p-3"><span>{learningStatusLabel(item.learning_status)}</span><span className="ms-1 text-[10px] text-muted-foreground">· {item.member_status}</span></td><td className="p-3"><div className="flex gap-1"><Button onClick={async () => { try { setStudent(await api.partners.adminStudent(selectedId, item.id)); } catch (e) { setError(e.message); } }}><Eye className="h-3.5 w-3.5" />{text("إحصائيات", "Profile & stats")}</Button><Button onClick={() => setEditingMember({ ...item, password: "" })}><Pencil className="h-3.5 w-3.5" /></Button>{item.member_status === "active" && <Button tone="danger" onClick={() => removeMember(item.id)}><X className="h-3.5 w-3.5" /></Button>}</div></td></tr>)}</tbody></table></div>
              {filteredStudents.length === 0 && <p className="p-6 text-center text-xs text-muted-foreground">{students.length === 0 ? text("لا يوجد طلاب مسجلون.", "No enrolled students.") : text("لا توجد نتائج مطابقة للبحث.", "No students match these filters.")}</p>}
            </section>
          </div>}
      </section>
      {student && <StudentDetails student={student} isAr={isAr} text={text} onClose={() => setStudent(null)} />}
      {editingMember && <MemberEditor member={editingMember} isAr={isAr} text={text} saving={saving} onChange={(key, value) => setEditingMember((current) => ({ ...current, [key]: value }))} onClose={() => setEditingMember(null)} onSubmit={saveMember} />}
    </main>
  );
}

function MemberEditor({ member, isAr, text, saving, onChange, onClose, onSubmit }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3" role="dialog" aria-modal="true" aria-label={text("تعديل الحساب", "Edit account")}><form onSubmit={onSubmit} dir={isAr ? "rtl" : "ltr"} className="w-full max-w-xl space-y-4 rounded-2xl border border-border/60 bg-background p-5 shadow-2xl">
    <div className="flex items-center justify-between"><h2 className="font-heading text-lg font-bold">{text("تعديل بيانات الحساب", "Edit account")}</h2><button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-secondary" aria-label={text("إغلاق", "Close")}><X className="h-4 w-4" /></button></div>
    <div className="grid gap-3 sm:grid-cols-2"><Field label={text("الاسم", "Full name")} value={member.full_name || ""} onChange={(e) => onChange("full_name", e.target.value)} /><Field label={text("البريد", "Email")} value={member.email || ""} onChange={(e) => onChange("email", e.target.value)} /><Field label={text("اسم المستخدم", "Username")} value={member.username || ""} onChange={(e) => onChange("username", e.target.value)} /><Field label={text("الهاتف", "Phone")} value={member.phone || ""} onChange={(e) => onChange("phone", e.target.value)} /><Field label={text("الرقم القومي", "National ID")} value={member.national_id || ""} onChange={(e) => onChange("national_id", e.target.value)} /><Field label={text("كلمة مرور جديدة (اختياري)", "New password (optional)")} type="password" minLength={8} value={member.password || ""} onChange={(e) => onChange("password", e.target.value)} /><SelectNative label={text("حالة الحساب", "Account status")} value={member.status || member.member_status} options={["active", "suspended"]} onChange={(value) => onChange("status", value)} /></div>
    <div className="flex justify-end gap-2"><Button onClick={onClose}>{text("إلغاء", "Cancel")}</Button><Button type="submit" tone="primary" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{text("حفظ", "Save")}</Button></div>
  </form></div>;
}

function SelectNative({ label, value, options, onChange, labelFor = (option) => option }) {
  return <label className="block space-y-1.5 text-xs"><span className="font-medium text-muted-foreground">{label}</span><select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm">{options.map((option) => <option key={option || "empty"} value={option}>{labelFor(option)}</option>)}</select></label>;
}

function featureLabel(key, isAr) {
  const names = {
    learning: ["التعلم والدروس", "Learning & lessons"], statistics: ["الإحصائيات", "Statistics"],
    community: ["المجتمعات", "Communities"], projects: ["المشاريع", "Projects"],
    cv: ["السيرة الذاتية", "CV"], portfolio: ["البورتفوليو", "Portfolio"],
    career: ["الوظائف", "Career"], certificates: ["الشهادات", "Certificates"],
  };
  return names[key]?.[isAr ? 0 : 1] || key;
}

export function StudentDetails({ student, isAr, text, onClose }) {
  const scores = student.quiz_attempts || [];
  const maxScore = Math.max(100, ...scores.map((item) => item.score || 0));
  const skills = [...(student.skills || []), ...(student.target_skills || []).map((skill) => ({ skill, level: null }))];
  const hasActivity = Boolean(student.lessons_total || scores.length || student.exam_attempt_count);
  const performanceLabel = hasActivity ? `${student.performance_score ?? 0}%` : text("لا توجد بيانات بعد", "No activity yet");
  const performanceBand = {
    high: text("مرتفع", "High"),
    average: text("مستقر", "On track"),
    needs_support: text("يحتاج دعمًا", "Needs support"),
  }[student.performance_band];
  const profileItems = [
    [text("الهدف", "Learning goal"), student.profile?.goal],
    [text("الوظيفة المستهدفة", "Target role"), student.profile?.current_role || student.profile?.career_intent],
    [text("التعليم", "Education"), student.profile?.education],
    [text("الخبرة", "Experience"), student.profile?.experience],
    [text("الخلفية", "Background"), student.profile?.background],
    [text("المستوى الحالي", "Current level"), student.profile?.current_level],
    [text("أسلوب التعلم", "Learning style"), student.profile?.learning_style],
    [text("ساعات الدراسة أسبوعيًا", "Study hours per week"), student.profile?.weekly_hours],
    [text("أيام الدراسة", "Study days"), student.profile?.available_days],
    [text("وقت الدراسة المفضل", "Preferred study time"), student.profile?.preferred_time],
    [text("نقاط قوة ذكرها الطالب", "Student-reported strengths"), student.profile?.declared_strengths],
    [text("مجالات تحسين ذكرها الطالب", "Student-reported improvement areas"), student.profile?.declared_weaknesses],
  ].filter(([, value]) => value != null && value !== "");
  const chartMetrics = [
    [text("التقدم", "Progress"), student.lessons_total ? student.progress_percent : null],
    [text("متوسط الكويز", "Quiz average"), scores.length ? student.average_quiz_score : null],
    [text("متوسط الامتحان", "Exam average"), student.exam_attempt_count ? student.average_exam_score : null],
    [text("الأداء الإجمالي", "Overall performance"), hasActivity ? student.performance_score : null],
  ];
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={text("إحصائيات الطالب", "Student statistics")}>
    <div dir={isAr ? "rtl" : "ltr"} className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-2xl border border-border/60 bg-background p-4 shadow-2xl sm:p-6">
      <header className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-heading text-xl font-extrabold">{student.full_name}</h2><p className="text-xs text-muted-foreground">{student.email || student.username} · {student.phone || text("لا يوجد هاتف", "No phone")}</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-secondary" aria-label={text("إغلاق", "Close")}><X className="h-4 w-4" /></button></header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Users} label={text("المسارات", "Tracks")} value={(student.roadmaps || []).length} />
        <Metric icon={Check} label={text("الدروس المكتملة", "Lessons complete")} value={`${student.lessons_completed}/${student.lessons_total}`} />
        <Metric icon={ShieldCheck} label={text("متوسط الاختبارات", "Quiz average")} value={scores.length ? `${student.average_quiz_score}%` : "—"} />
        <Metric icon={Clock3} label={text("التقدم", "Progress")} value={`${student.progress_percent}%`} />
        <Metric icon={ShieldCheck} label={text("الأداء الإجمالي", "Overall performance")} value={performanceBand ? `${performanceLabel} · ${performanceBand}` : performanceLabel} />
        <Metric icon={Check} label={text("متوسط الامتحانات", "Exam average")} value={student.exam_attempt_count ? `${student.average_exam_score}%` : "—"} />
      </div>
      <section className="mt-4 rounded-xl border border-border/50 p-4">
        <h3 className="mb-4 text-sm font-bold">{text("ملخص الأداء", "Performance overview")}</h3>
        <div className="space-y-3">
          {chartMetrics.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[minmax(90px,0.7fr)_2fr_48px] items-center gap-3 text-[10px]">
              <span>{label}</span>
              <div className="h-2.5 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${label}: ${value == null ? "—" : `${value}%`}`}>
                {value != null && <div className="h-full rounded-full bg-zeus-gold" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />}
              </div>
              <strong className="text-end">{value == null ? "—" : `${value}%`}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-border/50 p-4">
          <h3 className="mb-3 text-sm font-bold text-emerald-300">{text("نقاط القوة", "Strengths")}</h3>
          {(student.strength_topics || []).length ? <div className="space-y-2">{student.strength_topics.map((item) => <div key={item.topic} className="flex items-center justify-between gap-3 rounded-lg bg-emerald-500/5 p-2 text-xs"><span className="truncate">{item.topic}</span><strong className="shrink-0">{item.accuracy}% · {item.correct}/{item.questions}</strong></div>)}</div> : <p className="text-xs text-muted-foreground">{text("لا توجد محاولات كافية لتحديد نقاط قوة بعد.", "Not enough quiz answers to identify strengths yet.")}</p>}
        </article>
        <article className="rounded-xl border border-border/50 p-4">
          <h3 className="mb-3 text-sm font-bold text-amber-300">{text("نقاط تحتاج مراجعة", "Areas to improve")}</h3>
          {(student.weak_topics || []).length ? <div className="space-y-2">{student.weak_topics.map((item) => <div key={item.topic} className="flex items-center justify-between gap-3 rounded-lg bg-amber-500/5 p-2 text-xs"><span className="truncate">{item.topic}</span><strong className="shrink-0">{item.accuracy}% · {item.incorrect}/{item.questions} {text("إجابة غير صحيحة", "incorrect")}</strong></div>)}</div> : <p className="text-xs text-muted-foreground">{text("لا توجد نقاط ضعف مسجلة في إجابات الكويزات.", "No quiz-answer weaknesses are recorded.")}</p>}
        </article>
      </section>
      <section className="mt-4 rounded-xl border border-border/50 p-4">
        <h3 className="mb-3 text-sm font-bold">{text("درجات كل محاولة كويز وتحليل الإجابات", "Every quiz attempt and answer review")}</h3>
        {scores.length ? <>
          <div className="mb-4 flex h-36 items-end gap-2 border-b border-border/50 px-1 pb-1" role="img" aria-label={text("رسم درجات آخر محاولات الكويز", "Recent quiz scores chart")}>
            {scores.slice(-12).map((attempt, index) => <div key={`chart-${attempt.lesson_id}-${attempt.submitted_at}-${index}`} className="flex h-full min-w-5 flex-1 flex-col items-center justify-end gap-1" title={`${attempt.lesson_title}: ${attempt.score}%`}>
              <span className="text-[9px] text-muted-foreground">{attempt.score}%</span>
              <div className={`w-full max-w-8 rounded-t-sm ${attempt.passed ? "bg-emerald-500/80" : "bg-amber-500/80"}`} style={{ height: `${Math.max(3, Math.min(100, Math.max(0, attempt.score)))}%` }} />
              <span className="max-w-12 truncate text-[8px] text-muted-foreground">{attempt.lesson_title}</span>
            </div>)}
          </div>
          <div className="space-y-3">{scores.map((attempt, index) => <article key={`${attempt.lesson_id}-${attempt.submitted_at}-${index}`} className="rounded-lg border border-border/40 p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_2fr_auto] items-center gap-2 text-[10px]"><span className="truncate font-semibold">{attempt.lesson_title}</span><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${attempt.passed ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${Math.min(100, Math.max(0, attempt.score / maxScore * 100))}%` }} /></div><strong>{attempt.score}% · {attempt.passed ? text("ناجح", "Passed") : text("لم يجتز", "Not passed")}</strong></div>
            {attempt.feedback?.length > 0 && <div className="mt-3 space-y-2 border-t border-border/40 pt-2">{attempt.feedback.map((answer, answerIndex) => <div key={`${answer.topic}-${answerIndex}`} className="rounded-md bg-secondary/20 p-2 text-[10px]">
              <p className="font-semibold">{answer.topic} · <span className={answer.correct ? "text-emerald-300" : "text-amber-300"}>{answer.correct ? text("إجابة صحيحة", "Correct") : text("تحتاج مراجعة", "Review")}</span></p>
              {answer.question && <p className="mt-1">{answer.question}</p>}
              {!answer.correct && <p className="mt-1 text-muted-foreground">{text("إجابة الطالب:", "Student answer:")} {answer.student_answer || "—"} · {text("الصحيح:", "Correct:")} {answer.correct_answer || "—"}</p>}
              {answer.feedback && <p className="mt-1 text-muted-foreground">{answer.feedback}</p>}
            </div>)}</div>}
          </article>)}</div>
        </> : <p className="text-xs text-muted-foreground">{text("لا توجد محاولات اختبار مسجلة حتى الآن.", "No quiz attempts recorded yet.")}</p>}
      </section>
      {student.exam_results?.length > 0 && <section className="mt-4 rounded-xl border border-border/50 p-4"><h3 className="mb-3 text-sm font-bold">{text("درجات الامتحانات", "Exam grades")}</h3><div className="space-y-2">{student.exam_results.map((exam) => <article key={exam.assessment_id} className="rounded-lg bg-secondary/30 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{exam.title}</p><span className="text-[10px] text-muted-foreground">{exam.kind === "final_exam" ? text("امتحان نهائي", "Final exam") : text("امتحان", "Exam")}</span></div><div className="mt-2 space-y-1">{exam.attempts.map((attempt) => <p key={attempt.id} className="flex justify-between text-[10px]"><span>{attempt.submitted_date ? new Date(attempt.submitted_date).toLocaleDateString(isAr ? "ar-EG" : "en-US") : "—"}</span><strong>{attempt.percentage}% ({attempt.score}/{attempt.total_points})</strong></p>)}</div></article>)}</div></section>}
      <section className="mt-4 rounded-xl border border-border/50 p-4"><h3 className="mb-3 text-sm font-bold">{text("البيانات الشخصية", "Personal details")}</h3><div className="grid gap-3 text-xs sm:grid-cols-2"><div><p className="text-[10px] text-muted-foreground">{text("الهاتف", "Phone")}</p><p>{student.phone || "—"}</p></div><div><p className="text-[10px] text-muted-foreground">{text("الرقم القومي", "National ID")}</p><p>{student.national_id || "—"}</p></div><div><p className="text-[10px] text-muted-foreground">{text("حالة الحساب", "Account status")}</p><p>{student.status} · {student.member_status}</p></div><div><p className="text-[10px] text-muted-foreground">{text("تاريخ الانضمام", "Joined")}</p><p>{student.created_date ? new Date(student.created_date).toLocaleDateString(isAr ? "ar-EG" : "en-US") : "—"}</p></div></div></section>
      {profileItems.length > 0 && <section className="mt-4 rounded-xl border border-border/50 p-4"><h3 className="mb-3 text-sm font-bold">{text("ملف الطالب التعليمي", "Student learning profile")}</h3><div className="grid gap-3 text-xs sm:grid-cols-2">{profileItems.map(([label, value]) => <div key={label}><p className="text-[10px] text-muted-foreground">{label}</p><p className="whitespace-pre-wrap">{Array.isArray(value) ? value.join("، ") : value}</p></div>)}</div></section>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-border/50 p-4"><h3 className="mb-3 text-sm font-bold">{text("المسارات التعليمية", "Learning tracks")}</h3>{student.roadmaps?.length ? student.roadmaps.map((track) => <div key={track.id} className="mb-2 rounded-lg bg-secondary/30 p-3"><p className="text-xs font-semibold">{track.goal}</p><p className="mt-1 text-[10px] text-muted-foreground">{track.status} · v{track.version}</p></div>) : <p className="text-xs text-muted-foreground">{text("لم يبدأ مسارًا بعد.", "No learning track started.")}</p>}</section>
        <section className="rounded-xl border border-border/50 p-4"><h3 className="mb-3 text-sm font-bold">{text("المهارات والمشاريع", "Skills & projects")}</h3><div className="mb-3 flex flex-wrap gap-1.5">{skills.map((item, index) => <span key={`${item.skill}-${index}`} className="rounded-full bg-zeus-gold/10 px-2.5 py-1 text-[10px]">{item.skill}{Number.isFinite(item.level) ? ` · ${item.level}%` : ""}</span>)}</div>{(student.projects || []).map((project) => <article key={project.id} className="border-t border-border/40 py-2"><p className="text-xs font-semibold">{project.title}</p><p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{project.description}</p></article>)}{student.cv_url && <a className="mt-2 inline-flex text-xs text-zeus-brightgold underline" href={student.cv_url} target="_blank" rel="noreferrer">{text("فتح الملف المهني", "Open portfolio")}</a>}</section>
      </div>
      <section className="mt-4 rounded-xl border border-border/50 p-4"><h3 className="mb-3 text-sm font-bold">{text("سجل الدروس ومشاهدة الفيديو", "Lesson & video progress")}</h3>{student.lessons?.length ? <div className="max-h-72 space-y-2 overflow-auto">{student.lessons.map((lesson) => <div key={lesson.id} className="grid gap-1 rounded-lg bg-secondary/30 p-3 sm:grid-cols-[minmax(0,1.3fr)_0.7fr_0.7fr] sm:items-center"><div><p className="truncate text-xs font-semibold">{lesson.title}</p><p className="text-[10px] text-muted-foreground">{text("المرحلة", "Phase")} {lesson.phase} · {lesson.status}</p></div><p className="text-[10px] text-muted-foreground">{lesson.video_title || text("لا يوجد فيديو", "No video")} · {lesson.video_watched ? text("تمت المشاهدة", "Watched") : `${Math.floor((lesson.video_position_sec || 0) / 60)} ${text("دقيقة", "min")}`}</p><p className="text-[10px]">{text("الاختبار", "Quiz")}: {lesson.quiz_score ?? "—"}% · {lesson.attempts} {text("محاولات", "attempts")}</p></div>)}</div> : <p className="text-xs text-muted-foreground">{text("لا توجد دروس مسجلة بعد.", "No lesson activity recorded yet.")}</p>}</section>
    </div>
  </div>;
}
