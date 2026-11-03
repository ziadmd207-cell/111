import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen, Check, Clock3, Download, FileSpreadsheet, Loader2, LogOut, Pencil, Plus, Search, X,
  RefreshCw, ShieldCheck, Upload, Users,
} from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import { StudentDetails } from "@/pages/Partners";
import PartnerCommunityManager from "@/components/partners/PartnerCommunityManager";
import PartnerAssessments from "@/pages/PartnerAssessments";
import LanguageToggle from "@/components/zeus/LanguageToggle";
import ThemeToggle from "@/components/zeus/ThemeToggle";

const words = {
  en: {
    title: "Partner learning center", students: "Students", total: "Total students",
    completed: "Completed tracks", learning: "Currently learning", notStarted: "Not started",
    averageProgress: "Average progress", quizAverage: "Quiz average", capstone: "Final projects complete",
    addStudent: "Add student", fullName: "Full name", email: "Email",
    username: "Username (optional alias)", password: "Temporary password (8+ characters)", nationalId: "National ID",
    phone: "Phone number",
    add: "Create account", bulkTitle: "Import students from Excel", chooseFile: "Choose .xlsx file",
    preview: "Validate spreadsheet", confirm: "Confirm import", valid: "Ready to import", errors: "Rows with errors",
    track: "Learning track", topics: "Topics", skills: "Skills", saveTrack: "Save partner curriculum",
    account: "Account", trackMode: "Learning method", subscription: "Partner subscription", student: "Student",
    progress: "Progress", quiz: "Quiz average", details: "Open profile & statistics", noStudents: "No students enrolled yet.",
    reload: "Refresh", logout: "Sign out", passwordNote: "Set a temporary password and share it securely with the account owner.",
    imported: "Students created", invalidRows: "Skipped rows", noFile: "Select an Excel file first.",
    loadError: "Could not load partner data.", saveError: "Could not save your changes.", pleaseWait: "Loading...",
    capstoneDone: "Complete", capstonePending: "Pending", noCapstone: "Not assigned", examAverage: "Exam average", finalExam: "Final exams completed", usernameOne: "Enter an email or username.",
    partnerArea: "Partner workspace", doctor: "Partner-guided setup", discover: "Student discovery",
    discoveryToggle: "Student discovery with ZEUS", discoveryOn: "On — ZEUS runs the usual discovery conversation.",
    discoveryOff: "Off — your organization sets the curriculum; ZEUS asks about schedule and experience.",
    savingMode: "Saving learning mode...",
    usage: "This curriculum is shared with your organization's enrolled students.",
    instructions: "Learning instructions", instructionsHint: "Explain the outcomes, topics, and skills students should master.",
    performance: "Performance", high: "High (80+)", averageBand: "On track (60–79)", needsSupport: "Needs support (<60)",
    performanceFilter: "Performance level", sortBy: "Sort students", highestPerformance: "Highest overall performance",
    highestProgress: "Highest progress", highestQuiz: "Highest quiz average", highestExam: "Highest exam average",
    lowestProgress: "Lowest progress", alphabetical: "Name A–Z", exportStudents: "Export filtered Excel",
    exporting: "Preparing Excel...", template: "Download Excel template",
    requiredColumns: "Required columns: full_name, email, password, national_id. Phone and username are optional. Keep the spreadsheet private because it contains passwords.",
  },
  ar: {
    title: "مركز الجهة التعليمي", students: "الطلاب", total: "إجمالي الطلاب",
    completed: "أكملوا المسار", learning: "يتعلمون حاليًا", notStarted: "لم يبدأوا", averageProgress: "متوسط التقدم",
    quizAverage: "متوسط درجات الكويز", capstone: "المشاريع النهائية المكتملة", addStudent: "إضافة طالب",
    fullName: "الاسم بالكامل", email: "البريد الإلكتروني",
    username: "اسم مستخدم (اختياري)", password: "كلمة مرور مؤقتة (8 أحرف فأكثر)",
    nationalId: "الرقم القومي", phone: "رقم الهاتف",
    add: "إنشاء حساب الطالب", bulkTitle: "إضافة طلاب من Excel",
    chooseFile: "اختر ملف .xlsx", preview: "فحص الملف", confirm: "تأكيد الإضافة",
    valid: "جاهزون للإضافة", errors: "صفوف بها أخطاء", track: "المسار التعليمي", topics: "الموضوعات",
    skills: "المهارات", saveTrack: "حفظ محتوى الجهة", account: "الحساب", trackMode: "طريقة التعلم",
    subscription: "اشتراك الشريك", student: "الطالب", progress: "التقدم", quiz: "متوسط الكويز",
    details: "فتح الملف والإحصائيات", noStudents: "لا يوجد طلاب مسجلون بعد.", reload: "تحديث",
    logout: "تسجيل الخروج", passwordNote: "أنشئ كلمة مرور مؤقتة وشاركها مع صاحب الحساب بطريقة آمنة.",
    imported: "طلاب تم إنشاؤهم", invalidRows: "صفوف تم تخطيها", noFile: "اختر ملف Excel أولًا.",
    loadError: "تعذر تحميل بيانات الشريك.", saveError: "تعذر حفظ التغييرات.", pleaseWait: "جارٍ التحميل...",
    capstoneDone: "مكتمل", capstonePending: "متبقي", noCapstone: "غير محدد", examAverage: "متوسط الامتحانات", finalExam: "الامتحانات النهائية المنجزة",
    usernameOne: "أدخل البريد الإلكتروني.",
    partnerArea: "مساحة الجهة", doctor: "إعداد الجهة", discover: "اكتشاف الطالب",
    discoveryToggle: "اكتشاف الطالب مع ZEUS", discoveryOn: "مفعّل — ZEUS يجري محادثة اكتشاف المجال والهدف المعتادة.",
    discoveryOff: "متوقف — الجهة تحدد المحتوى، وZEUS يسأل عن الوقت والخبرة فقط.",
    savingMode: "جارٍ حفظ طريقة التعلم...",
    usage: "يُشارك محتوى الجهة مع الطلاب المسجلين لديها.",
    instructions: "تعليمات الجهة للتعلم", instructionsHint: "اكتب نواتج التعلم والموضوعات والمهارات المطلوب من الطلاب إتقانها.",
    performance: "الأداء", high: "مرتفع (80 فأكثر)", averageBand: "مستقر (60–79)", needsSupport: "يحتاج دعمًا (أقل من 60)",
    performanceFilter: "مستوى الأداء", sortBy: "ترتيب الطلاب", highestPerformance: "الأعلى أداءً إجمالًا",
    highestProgress: "الأعلى تقدمًا", highestQuiz: "أعلى متوسط كويز", highestExam: "أعلى متوسط امتحانات",
    lowestProgress: "الأقل تقدمًا", alphabetical: "الاسم أ–ي", exportStudents: "تنزيل Excel المفلتر",
    exporting: "جارٍ تجهيز Excel...", template: "تنزيل قالب Excel",
    requiredColumns: "الأعمدة المطلوبة: full_name وemail وpassword وnational_id. الهاتف وusername اختياريان. احتفظ بالملف بسرية لأنه يحتوي على كلمات مرور.",
  },
};

const MODES = { doctor_assigned: "doctor", student_discovery: "discover" };

function Metric({ label, value, icon: Icon }) {
  return <div className="rounded-2xl border border-border/50 bg-card/70 p-4"><div className="flex items-center justify-between"><span className="text-[11px] text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-zeus-gold" /></div><div className="mt-2 font-heading text-2xl font-extrabold text-zeus-brightgold">{value}</div></div>;
}

function Input({ label, ...props }) {
  return <label className="block space-y-1.5 text-xs"><span className="font-medium text-muted-foreground">{label}</span><input {...props} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm outline-none focus:border-zeus-gold/60" /></label>;
}

export default function PartnerWorkspace() {
  const { user } = useAuth();
  const { lang, dir } = useI18n();
  const text = (key) => words[lang]?.[key] || words.en[key] || key;
  const isAr = lang === "ar";
  const location = useLocation();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [student, setStudent] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newMember, setNewMember] = useState({ member_type: "student", full_name: "", email: "", username: "", password: "", national_id: "", phone: "" });
  const [file, setFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentStatus, setStudentStatus] = useState("all");
  const [performance, setPerformance] = useState("all");
  const [studentSort, setStudentSort] = useState("performance_desc");
  const [exporting, setExporting] = useState(false);
  const [track, setTrack] = useState("");
  const [skills, setSkills] = useState("");
  const [topics, setTopics] = useState("");
  const [instructions, setInstructions] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.partners.dashboard();
      setDashboard(result);
      const curriculum = result.partner?.doctor_track || {};
      setTrack(curriculum.track || "");
      setSkills((curriculum.skills || []).join(", "));
      setTopics((curriculum.topics || []).join("\n"));
      setInstructions(curriculum.instructions || "");
    } catch (loadError) {
      setError(loadError.message || text("loadError"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const students = dashboard?.students || [];
  const statisticsEnabled = Boolean(dashboard?.partner?.features?.statistics);
  const learningStatusLabel = (status) => ({
    completed: text("completed"),
    learning: isAr ? "قيد التعلم" : "In progress",
    not_started: text("notStarted"),
  })[status] || (isAr ? "غير معروف" : "Unknown");
  const performanceBandLabel = (band) => ({
    high: text("high"),
    average: text("averageBand"),
    needs_support: text("needsSupport"),
  })[band] || (isAr ? "لا توجد بيانات" : "No data");
  const filteredStudents = useMemo(() => {
    const needle = studentSearch.trim().toLocaleLowerCase();
    const filtered = students.filter((item) => {
      const searchable = [item.full_name, item.email, item.username, item.phone, item.track]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      const matchesStatus = !dashboard?.partner?.features?.statistics || studentStatus === "all"
        || (studentStatus === "completed" && item.learning_status === "completed")
        || (studentStatus === "learning" && item.learning_status === "learning")
        || (studentStatus === "not_started" && item.learning_status === "not_started")
        || (studentStatus === "needs_review" && item.quiz_attempts?.length && item.average_quiz_score < 70);
      const matchesPerformance = performance === "all" || item.performance_band === performance;
      return (!needle || searchable.includes(needle)) && matchesStatus && matchesPerformance;
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
  }, [dashboard?.partner?.features?.statistics, students, studentSearch, studentStatus, performance, studentSort]);
  const isInstructor = user?.role === "doctor";
  const canEditCurriculum = dashboard?.partner?.learning_mode !== "student_discovery"
    && user?.role === "partner";

  if (user?.role === "admin") return <Navigate to="/admin/partners" replace />;
  if (user?.role === "partner_student") return <Navigate to="/app" replace />;
  if (["partner", "doctor"].includes(user?.role) && location.pathname !== "/partner") return <Navigate to="/partner" replace />;
  if (!["partner", "doctor"].includes(user?.role)) return <Navigate to="/app" replace />;

  const submitMember = async (event) => {
    event.preventDefault();
    if (!newMember.email.trim()) {
      setError(text("usernameOne"));
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.partners.addMember({ ...newMember, member_type: "student" });
      setNewMember({ member_type: "student", full_name: "", email: "", username: "", password: "", national_id: "", phone: "" });
      setNotice(text("addStudent") + " ✓");
      await load();
    } catch (saveError) {
      setError(saveError.message || text("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const previewFile = async () => {
    if (!file) {
      setError(text("noFile"));
      return;
    }
    setSaving(true);
    setError("");
    setImportPreview(null);
    try {
      setImportPreview(await api.partners.importStudents(file, false));
    } catch (uploadError) {
      setError(uploadError.message || text("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const confirmImport = async () => {
    if (!file || !importPreview?.valid_count) return;
    setSaving(true);
    setError("");
    try {
      const result = await api.partners.importStudents(file, true);
      setNotice(`${text("imported")}: ${result.created} · ${text("invalidRows")}: ${result.skipped}`);
      setImportPreview(null);
      setFile(null);
      await load();
    } catch (uploadError) {
      setError(uploadError.message || text("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const saveCurriculum = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.partners.updateTrack({
        track,
        skills: skills.split(/[,،\n]/).map((value) => value.trim()).filter(Boolean),
        topics: topics.split(/\n/).map((value) => value.trim()).filter(Boolean),
        instructions,
      });
      setNotice(text("saveTrack") + " ✓");
      await load();
    } catch (saveError) {
      setError(saveError.message || text("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const toggleDiscovery = async (enabled) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.partners.updateLearningMode(enabled);
      setNotice(enabled ? text("تم تشغيل اكتشاف الطالب.", "Student discovery enabled.") : text("تم إيقاف اكتشاف الطالب. أكمل إعداد المسار والتعليمات.", "Student discovery disabled. Complete the track and instructions setup."));
      await load();
    } catch (saveError) {
      setError(saveError.message || text("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportFilteredStudents = async () => {
    setExporting(true);
    setError("");
    try {
      const blob = await api.partners.exportStudents({
        search: studentSearch.trim(),
        status: statisticsEnabled ? studentStatus : "all",
        performance: statisticsEnabled ? performance : "all",
        sort: statisticsEnabled ? studentSort : "name_asc",
      });
      downloadBlob(blob, `zeus-students-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (exportError) {
      setError(exportError.message || text("saveError"));
    } finally {
      setExporting(false);
    }
  };

  const downloadImportTemplate = async () => {
    setError("");
    try {
      const blob = await api.partners.importTemplate();
      downloadBlob(blob, "zeus-student-import-template.xlsx");
    } catch (templateError) {
      setError(templateError.message || text("saveError"));
    }
  };

  const openStudent = async (id) => {
    setError("");
    try {
      setStudent(await api.partners.student(id));
    } catch (detailError) {
      setError(detailError.message || text("loadError"));
    }
  };

  const saveStudent = async (event) => {
    event.preventDefault();
    if (!editingStudent) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        full_name: editingStudent.full_name,
        phone: editingStudent.phone || "",
        national_id: editingStudent.national_id || "",
      };
      if (editingStudent.email?.trim()) payload.email = editingStudent.email.trim();
      if (editingStudent.username !== undefined) payload.username = editingStudent.username || "";
      if (editingStudent.password) payload.password = editingStudent.password;
      await api.partners.updateMember(editingStudent.id, payload);
      setEditingStudent(null);
      setNotice(isAr ? "تم تحديث بيانات الطالب." : "Student account updated.");
      await load();
    } catch (saveError) {
      setError(saveError.message || text("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const removeStudent = async (id) => {
    if (!window.confirm(isAr ? "إيقاف حساب الطالب مع الاحتفاظ بسجله التعليمي؟" : "Suspend this student while preserving their learning history?")) return;
    setSaving(true);
    setError("");
    try {
      await api.partners.removeMember(id);
      setNotice(isAr ? "تم إيقاف حساب الطالب وحفظ سجله." : "Student suspended; learning history preserved.");
      await load();
    } catch (removeError) {
      setError(removeError.message || text("saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center" dir={dir}><Loader2 className="h-7 w-7 animate-spin text-zeus-gold" /></div>;

  const stats = dashboard?.stats || {};
  const partner = dashboard?.partner || {};
  const reviewStudents = students.filter((item) => item.quiz_attempts?.length && item.average_quiz_score < 70);
  const totalStudents = Math.max(1, stats.students || 0);

  return <main dir={dir} className="partner-console min-h-screen bg-background px-4 py-5 sm:px-7">
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zeus-gold">{text("partnerArea")}</p><h1 className="mt-1 font-heading text-2xl font-extrabold">{partner.name || text("title")}</h1><p className="mt-1 text-xs text-muted-foreground">{text("trackMode")}: {text(MODES[partner.learning_mode] || "discover")} · {text("subscription")}: {partner.subscription_plan} · {partner.subscription_expires ? new Date(partner.subscription_expires).toLocaleDateString(isAr ? "ar-EG" : "en-US") : "—"}</p></div>
        <div className="flex gap-2"><button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-xs"><RefreshCw className="h-3.5 w-3.5" />{text("reload")}</button><button type="button" onClick={async () => { await api.auth.logout(); navigate("/login"); }} className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-xs"><LogOut className="h-3.5 w-3.5" />{text("logout")}</button><LanguageToggle /><ThemeToggle /></div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">{notice}</p>}

      <label className="flex items-start gap-3 rounded-2xl border border-zeus-gold/30 bg-card/70 p-4 text-xs">
        <input type="checkbox" className="mt-0.5 accent-[var(--zeus-gold)]" checked={partner.learning_mode === "student_discovery"} disabled={saving} onChange={(event) => toggleDiscovery(event.target.checked)} />
        <span><span className="block font-semibold">{text("discoveryToggle")}</span><span className="mt-1 block text-[10px] text-muted-foreground">{text(partner.learning_mode === "student_discovery" ? "discoveryOn" : "discoveryOff")}</span>{saving && <span className="mt-1 block text-[10px] text-zeus-gold">{text("savingMode")}</span>}</span>
      </label>

      {statisticsEnabled && <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <Metric label={text("total")} value={stats.students || 0} icon={Users} />
        <Metric label={text("completed")} value={stats.completed || 0} icon={Check} />
        <Metric label={text("learning")} value={stats.learning || 0} icon={BookOpen} />
        <Metric label={text("notStarted")} value={stats.not_started || 0} icon={Clock3} />
        <Metric label={text("averageProgress")} value={`${stats.average_progress || 0}%`} icon={ShieldCheck} />
        <Metric label={text("quizAverage")} value={`${stats.average_quiz_score || 0}%`} icon={FileSpreadsheet} />
        <Metric label={text("examAverage")} value={`${stats.average_exam_score || 0}%`} icon={FileSpreadsheet} />
        <Metric label={isAr ? "أكملوا المشروع النهائي" : "Final projects complete"} value={stats.capstones_completed || 0} icon={Check} />
        <Metric label={text("finalExam")} value={stats.final_exams_completed || 0} icon={Check} />
        <Metric label={isAr ? "يحتاجون إلى مراجعة" : "Need review"} value={stats.needs_review || 0} icon={ShieldCheck} />
      </section>}

      {statisticsEnabled && <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-border/50 bg-card/70 p-4">
          <h2 className="mb-4 font-heading text-sm font-bold">{isAr ? "توزيع تقدم الطلاب" : "Student progress distribution"}</h2>
          {[["completed", stats.completed || 0, "bg-emerald-500"], ["learning", stats.learning || 0, "bg-zeus-gold"], ["notStarted", stats.not_started || 0, "bg-slate-400"]].map(([key, count, color]) => <div key={key} className="mb-3 last:mb-0"><div className="mb-1 flex justify-between text-[11px]"><span>{text(key)}</span><strong>{count}</strong></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, count / totalStudents * 100)}%` }} /></div></div>)}
        </article>
        <article className="rounded-2xl border border-border/50 bg-card/70 p-4">
          <h2 className="mb-3 font-heading text-sm font-bold">{isAr ? "طلاب يحتاجون دعمًا" : "Students who may need support"}</h2>
          {reviewStudents.length ? <div className="space-y-2">{reviewStudents.slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/30 p-3 text-xs"><span className="truncate font-semibold">{item.full_name}</span><span className="shrink-0 text-amber-300">{item.average_quiz_score}%</span><button type="button" onClick={() => openStudent(item.id)} className="shrink-0 rounded-lg border border-border/50 px-2 py-1 text-[10px]">{text("details")}</button></div>)}</div> : <p className="text-xs text-muted-foreground">{isAr ? "لا توجد حالات تحتاج مراجعة بناءً على درجات الكويزات المسجلة." : "No students currently need review based on recorded quiz scores."}</p>}
        </article>
      </section>}

      {canEditCurriculum && <form onSubmit={saveCurriculum} className="rounded-2xl border border-zeus-gold/30 bg-card/70 p-4">
        <h2 className="mb-1 font-heading text-sm font-bold">{text("saveTrack")}</h2><p className="mb-4 text-[10px] text-muted-foreground">{text("usage")}</p>
        <div className="grid gap-3 md:grid-cols-3"><Input label={text("track")} value={track} onChange={(e) => setTrack(e.target.value)} required /><label className="block space-y-1.5 text-xs"><span className="font-medium text-muted-foreground">{text("skills")}</span><textarea rows={3} value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Machine Learning, Python" className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm" /></label><label className="block space-y-1.5 text-xs"><span className="font-medium text-muted-foreground">{text("topics")}</span><textarea rows={3} value={topics} onChange={(e) => setTopics(e.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm" /></label><label className="block space-y-1.5 text-xs md:col-span-3"><span className="font-medium text-muted-foreground">{text("instructions")}</span><span className="block text-[10px] text-muted-foreground">{text("instructionsHint")}</span><textarea rows={4} maxLength={5000} value={instructions} onChange={(e) => setInstructions(e.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm" /></label></div>
        <button disabled={saving} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-zeus-gold/40 bg-zeus-gold/10 px-3 py-2 text-xs font-semibold text-zeus-brightgold disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{text("saveTrack")}</button>
      </form>}

      {partner.features?.community && <PartnerCommunityManager students={students} isAr={isAr} />}
      <PartnerAssessments embedded />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/70">
          <div className="flex flex-wrap items-end gap-3 border-b border-border/50 p-4">
            <div className="me-auto"><h2 className="font-heading text-sm font-bold">{text("students")} ({filteredStudents.length}/{students.length})</h2><p className="mt-1 text-[10px] text-muted-foreground">{text("details")}</p></div>
            <label className="relative min-w-48 flex-1 sm:flex-none"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder={isAr ? "بحث بالاسم أو البريد أو الهاتف أو المسار" : "Search name, email, phone, or track"} className="w-full rounded-xl border border-border/60 bg-background py-2 ps-9 pe-3 text-xs" /></label>
            {statisticsEnabled && <>
              <label className="block space-y-1.5 text-xs"><span className="font-medium text-muted-foreground">{isAr ? "حالة التقدم" : "Progress status"}</span><select value={studentStatus} onChange={(event) => setStudentStatus(event.target.value)} className="rounded-xl border border-border/60 bg-background px-3 py-2 text-xs"><option value="all">{isAr ? "كل الحالات" : "All statuses"}</option><option value="completed">{text("completed")}</option><option value="learning">{text("learning")}</option><option value="not_started">{text("notStarted")}</option><option value="needs_review">{isAr ? "يحتاجون مراجعة" : "Needs review"}</option></select></label>
              <label className="block space-y-1.5 text-xs"><span className="font-medium text-muted-foreground">{text("performanceFilter")}</span><select value={performance} onChange={(event) => setPerformance(event.target.value)} className="rounded-xl border border-border/60 bg-background px-3 py-2 text-xs"><option value="all">{isAr ? "كل المستويات" : "All levels"}</option><option value="high">{text("high")}</option><option value="average">{text("averageBand")}</option><option value="needs_support">{text("needsSupport")}</option></select></label>
              <label className="block space-y-1.5 text-xs"><span className="font-medium text-muted-foreground">{text("sortBy")}</span><select value={studentSort} onChange={(event) => setStudentSort(event.target.value)} className="rounded-xl border border-border/60 bg-background px-3 py-2 text-xs"><option value="performance_desc">{text("highestPerformance")}</option><option value="progress_desc">{text("highestProgress")}</option><option value="quiz_desc">{text("highestQuiz")}</option><option value="exam_desc">{text("highestExam")}</option><option value="progress_asc">{text("lowestProgress")}</option><option value="name_asc">{text("alphabetical")}</option></select></label>
            </>}
            {statisticsEnabled && <button type="button" onClick={exportFilteredStudents} disabled={exporting} className="inline-flex items-center gap-2 rounded-xl border border-zeus-gold/40 px-3 py-2 text-xs font-semibold disabled:opacity-50">{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{exporting ? text("exporting") : text("exportStudents")}</button>}
          </div>
          <div className="overflow-x-auto">
            <table className={`w-full ${statisticsEnabled ? "min-w-[700px]" : "min-w-[440px]"} text-start text-xs`}>
              <thead className="bg-secondary/30 text-[10px] text-muted-foreground">
                <tr>
                  <th className="p-3 text-start">{text("student")}</th>
                  <th className="p-3 text-start">{text("track")}</th>
                  {statisticsEnabled && <>
                    <th className="p-3 text-start">{text("progress")}</th>
                    <th className="p-3 text-start">{text("quiz")}</th>
                    <th className="p-3 text-start">{text("performance")}</th>
                    <th className="p-3 text-start">{isAr ? "حالة التعلم" : "Learning status"}</th>
                    <th className="p-3 text-start">{text("capstone")}</th>
                    <th className="p-3 text-start">{text("details")}</th>
                  </>}
                  {!isInstructor && <th className="p-3 text-start">{isAr ? "الإدارة" : "Management"}</th>}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((item) => (
                  <tr key={item.id} className="border-t border-border/40">
                    <td className="p-3">
                      <p className="font-semibold">{item.full_name}</p>
                      <p className="text-[10px] text-muted-foreground">{item.email || item.username} · {item.phone || "—"}</p>
                    </td>
                    <td className="max-w-40 truncate p-3">{item.track || "—"}</td>
                    {statisticsEnabled && <>
                      <td className="p-3">{item.progress_percent}% <span className="text-muted-foreground">({item.lessons_completed}/{item.lessons_total})</span></td>
                      <td className="p-3">{item.quiz_attempts?.length ? `${item.average_quiz_score}%` : "—"}</td>
                      <td className="p-3 font-semibold">{item.has_learning_activity ? `${item.performance_score}% · ${performanceBandLabel(item.performance_band)}` : performanceBandLabel(null)}</td>
                      <td className="p-3">{learningStatusLabel(item.learning_status)}</td>
                      <td className="p-3">{item.capstone_completed ? text("capstoneDone") : item.capstone_exists ? text("capstonePending") : text("noCapstone")}</td>
                      <td className="p-3"><button type="button" onClick={() => openStudent(item.id)} className="rounded-lg border border-border/50 px-2.5 py-1.5 text-[10px] hover:border-zeus-gold/50">{text("details")}</button></td>
                    </>}
                    {!isInstructor && <td className="p-3"><div className="flex gap-1"><button type="button" onClick={() => setEditingStudent({ ...item, password: "" })} className="rounded-lg border border-border/50 p-1.5" aria-label={isAr ? "تعديل الطالب" : "Edit student"}><Pencil className="h-3.5 w-3.5" /></button><button type="button" disabled={saving} onClick={() => removeStudent(item.id)} className="rounded-lg border border-rose-500/30 p-1.5 text-rose-300 disabled:opacity-50" aria-label={isAr ? "إيقاف الطالب" : "Suspend student"}><X className="h-3.5 w-3.5" /></button></div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filteredStudents.length && <p className="p-8 text-center text-xs text-muted-foreground">{students.length === 0 ? text("noStudents") : isAr ? "لا توجد نتائج مطابقة للبحث." : "No students match these filters."}</p>}
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-border/50 bg-card/70 p-4">
            <h2 className="mb-1 font-heading text-sm font-bold">{text("addStudent")}</h2><p className="mb-3 text-[10px] text-muted-foreground">{text("passwordNote")}</p>
            <form onSubmit={submitMember} className="space-y-3">
              <Input label={text("fullName")} required value={newMember.full_name} onChange={(e) => setNewMember({ ...newMember, full_name: e.target.value })} />
              <Input label={text("email")} type="email" required value={newMember.email} onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} />
              <Input label={text("username")} value={newMember.username} onChange={(e) => setNewMember({ ...newMember, username: e.target.value })} />
              <Input label={text("password")} type="password" minLength={8} required value={newMember.password} onChange={(e) => setNewMember({ ...newMember, password: e.target.value })} />
              <Input label={text("nationalId")} required value={newMember.national_id} onChange={(e) => setNewMember({ ...newMember, national_id: e.target.value })} />
              <Input label={text("phone")} value={newMember.phone} onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })} />
              <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zeus-gold/40 bg-zeus-gold/10 px-3 py-2.5 text-xs font-semibold text-zeus-brightgold disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{text("add")}</button>
            </form>
          </section>

          {!isInstructor && <section className="rounded-2xl border border-border/50 bg-card/70 p-4">
            <div className="mb-3 flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-zeus-gold" /><h2 className="font-heading text-sm font-bold">{text("bulkTitle")}</h2></div>
            <p className="mb-3 text-[10px] text-muted-foreground">{text("requiredColumns")}</p>
            <button type="button" onClick={downloadImportTemplate} className="mb-3 inline-flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-xs"><Download className="h-3.5 w-3.5" />{text("template")}</button>
            <Input type="file" accept=".xlsx" label={text("chooseFile")} onChange={(e) => { setFile(e.target.files?.[0] || null); setImportPreview(null); }} />
            <button type="button" onClick={previewFile} disabled={saving || !file} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-xs disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{text("preview")}</button>
            {importPreview && <div className="mt-3 space-y-2">
              <div className="flex justify-between text-[10px]"><span>{text("valid")}: <b className="text-emerald-400">{importPreview.valid_count}</b></span><span>{text("errors")}: <b className="text-rose-400">{importPreview.error_count}</b></span></div>
              <div className="max-h-44 space-y-1 overflow-auto">{(importPreview.preview || []).map((row) => <div key={row.row} className={`rounded-lg p-2 text-[10px] ${row.valid ? "bg-emerald-500/5" : "bg-rose-500/5"}`}><div className="flex justify-between gap-2"><span>#{row.row} · {row.full_name}</span><span>{row.email || row.username}</span></div>{row.errors.length > 0 && <p className="mt-1 text-rose-300">{row.errors.join(" · ")}</p>}</div>)}</div>
              {importPreview.valid_count > 0 && <button type="button" onClick={confirmImport} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{text("confirm")}</button>}
            </div>}
          </section>}
        </div>
      </section>
    </div>
    {student && <StudentDetails student={student} isAr={isAr} text={(ar, en) => isAr ? ar : en} onClose={() => setStudent(null)} />}
    {editingStudent && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3" role="dialog" aria-modal="true" aria-label={isAr ? "تعديل حساب الطالب" : "Edit student account"}><form onSubmit={saveStudent} dir={dir} className="w-full max-w-xl space-y-4 rounded-2xl border border-border/60 bg-background p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="font-heading text-lg font-bold">{isAr ? "تعديل بيانات الطالب" : "Edit student account"}</h2><button type="button" onClick={() => setEditingStudent(null)} aria-label={isAr ? "إغلاق" : "Close"}><X className="h-4 w-4" /></button></div><div className="grid gap-3 sm:grid-cols-2"><Input label={text("fullName")} required value={editingStudent.full_name || ""} onChange={(event) => setEditingStudent({ ...editingStudent, full_name: event.target.value })} /><Input label={text("email")} type="email" value={editingStudent.email || ""} onChange={(event) => setEditingStudent({ ...editingStudent, email: event.target.value })} /><Input label={text("username")} value={editingStudent.username || ""} onChange={(event) => setEditingStudent({ ...editingStudent, username: event.target.value })} /><Input label={text("nationalId")} value={editingStudent.national_id || ""} onChange={(event) => setEditingStudent({ ...editingStudent, national_id: event.target.value })} /><Input label={text("phone")} value={editingStudent.phone || ""} onChange={(event) => setEditingStudent({ ...editingStudent, phone: event.target.value })} /><Input label={isAr ? "كلمة مرور جديدة (اختياري)" : "New password (optional)"} type="password" minLength={8} value={editingStudent.password || ""} onChange={(event) => setEditingStudent({ ...editingStudent, password: event.target.value })} /></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingStudent(null)} className="rounded-xl border border-border/60 px-3 py-2 text-xs">{isAr ? "إلغاء" : "Cancel"}</button><button disabled={saving} className="rounded-xl border border-zeus-gold/40 bg-zeus-gold/10 px-3 py-2 text-xs font-semibold text-zeus-brightgold disabled:opacity-50">{isAr ? "حفظ" : "Save"}</button></div></form></div>}
  </main>;
}
