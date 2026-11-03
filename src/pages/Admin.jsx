import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Loader2, Search, Trash2, KeyRound, Crown, RefreshCw, Plus, Pencil, X, Check, Megaphone,
  CreditCard, Eye, CheckCircle2, XCircle, AlertCircle, Clock, ExternalLink, Sparkles, DollarSign, Key, Save, LifeBuoy, Facebook, Linkedin, Instagram, Music2, MessageCircle, Download, Send, Pin, Lock, Unlock
} from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import AdminSupportChats from "@/pages/AdminSupportChats";

const AI_TASK_LABELS = {
  discovery: { ar: "تحليل الشخصية والأسئلة", en: "Learner discovery" },
  planning: { ar: "إنشاء خريطة التعلم", en: "Roadmap generation" },
  tutor: { ar: "شرح الدروس", en: "Lesson tutor" },
  companion: { ar: "شات رفيق التعلم", en: "Learning companion chat" },
  review: { ar: "مراجعة المحتوى", en: "Content review" },
  quiz: { ar: "إنشاء الاختبارات", en: "Quiz generation" },
  assessment: { ar: "تقييم الإجابات", en: "Answer assessment" },
  recommend: { ar: "اقتراح الأهداف", en: "Goal recommendations" },
  rewrite: { ar: "إعادة صياغة المحتوى", en: "Content rewriting" },
  jobs: { ar: "البحث عن الوظائف", en: "Job search" },
};

export default function Admin({ tab: initialTab }) {
  const { lang, dir } = useI18n();
  const isAr = lang === "ar";
  const [tab, setTab] = useState(initialTab || "stats");

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  return (
    <div dir={dir} className="admin-page space-y-6">
      <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {tab === "stats" && <StatsTab isAr={isAr} />}
        {tab === "users" && <UsersTab isAr={isAr} />}
        {tab === "subscribers" && <SubscribersTab isAr={isAr} />}
        {tab === "communities" && <CommunitiesTab isAr={isAr} />}
        {tab === "broadcast" && <BroadcastTab isAr={isAr} />}
        {tab === "support" && <SupportTab isAr={isAr} />}
        {tab === "support-chats" && <AdminSupportChats />}
        {tab === "settings" && <SettingsTab isAr={isAr} />}
      </motion.div>
    </div>
  );
}

/* ---------------- Stats ---------------- */
function StatsTab({ isAr }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setStats(await api.admin.get("/stats"));
    } catch (loadError) {
      setError(loadError.message || (isAr ? "تعذر تحميل الإحصائيات." : "Could not load statistics."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  if (loading && !stats) return <Spin />;
  if (!stats) return <AdminLoadError message={error || (isAr ? "تعذر تحميل الإحصائيات." : "Could not load statistics.")} isAr={isAr} onRetry={load} />;
  const cards = [
    { label: isAr ? "المستخدمون" : "Users", value: stats.users, sub: `+${stats.new7} / 7d` },
    { label: isAr ? "خرائط نشطة" : "Active roadmaps", value: stats.active_roadmaps, sub: `${stats.roadmaps} total` },
    { label: isAr ? "دروس مكتملة" : "Lessons done", value: stats.lessons_done, sub: `${stats.lessons} total` },
    { label: isAr ? "متوسط الكويز" : "Avg quiz", value: `${stats.avg_quiz}%`, sub: isAr ? "الناجحون" : "scores" },
    { label: isAr ? "المجتمعات" : "Communities", value: stats.communities, sub: `${stats.members_total} members` },
    { label: isAr ? "الرسائل" : "Messages", value: stats.messages, sub: isAr ? "المجتمعات" : "communities" },
  ];
  const maxSignup = Math.max(1, ...stats.signups.map((s) => s.count));
  const maxGoal = Math.max(1, ...stats.top_goals.map((g) => g.count));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c, i) => (
          <div key={i} className="zeus-glass p-5">
            <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
            <div className="font-heading font-extrabold text-3xl text-zeus-brightgold">{c.value}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{c.sub}</div>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="zeus-glass p-5">
          <h3 className="font-heading font-bold text-sm mb-4">{isAr ? "تسجيلات آخر 30 يوم" : "Signups last 30 days"}</h3>
          <div className="flex items-end gap-1 h-28">
            {stats.signups.map((s) => (
              <div key={s.day} title={`${s.day}: ${s.count}`} className="flex-1 rounded-t bg-gradient-to-t from-zeus-gold/40 to-zeus-gold min-h-[3px]" style={{ height: `${Math.max(3, (s.count / maxSignup) * 100)}%` }} />
            ))}
          </div>
        </div>
        <div className="zeus-glass p-5">
          <h3 className="font-heading font-bold text-sm mb-4">{isAr ? "أشهر الأهداف" : "Top goals"}</h3>
          <div className="space-y-2.5">
            {stats.top_goals.length === 0 && <p className="text-xs text-muted-foreground">{isAr ? "لا بيانات بعد" : "No data yet"}</p>}
            {stats.top_goals.map((g) => (
              <div key={g.goal}>
                <div className="flex justify-between text-xs mb-1"><span className="truncate font-medium">{g.goal}</span><span className="text-zeus-gold font-bold">{g.count}</span></div>
                <div className="h-2 rounded-full bg-secondary/60 overflow-hidden"><div className="h-full bg-gradient-to-r from-zeus-gold to-zeus-brightgold" style={{ width: `${(g.count / maxGoal) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="zeus-glass p-5">
          <h3 className="font-heading font-bold text-sm mb-1">{isAr ? "توزيع درجات الاختبارات" : "Quiz score distribution"}</h3>
          <p className="mb-4 text-[10px] text-muted-foreground">{isAr ? `بناءً على ${stats.quiz_attempts || 0} درجة فعلية` : `Based on ${stats.quiz_attempts || 0} recorded scores`}</p>
          <div className="space-y-3">
            {(stats.quiz_bands || []).map((band) => {
              const maxBand = Math.max(1, ...(stats.quiz_bands || []).map((item) => item.count));
              return <div key={band.label}>
                <div className="mb-1 flex justify-between text-xs"><span>{band.label}</span><strong className="text-zeus-brightgold">{band.count}</strong></div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary/60"><div className="h-full rounded-full bg-gradient-to-r from-zeus-gold to-zeus-brightgold" style={{ width: `${(band.count / maxBand) * 100}%` }} /></div>
              </div>;
            })}
            {!stats.quiz_attempts && <p className="text-xs text-muted-foreground">{isAr ? "لا توجد درجات مسجلة بعد." : "No recorded quiz scores yet."}</p>}
          </div>
        </div>
      </div>
      <UsersAnalytics isAr={isAr} refreshKey={refreshKey} />
      <button disabled={loading} onClick={() => { load(); setRefreshKey((current) => current + 1); }} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-zeus-gold transition disabled:opacity-50"><RefreshCw className={loading ? "animate-spin" : ""} style={{ width: 13, height: 13 }} /> {isAr ? "تحديث" : "Refresh"}</button>
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
    </div>
  );
}

function UsersAnalytics({ isAr, refreshKey }) {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    account_type: "all",
    account_status: "all",
    subscription_status: "all",
    plan: "all",
    payment_status: "all",
    completion_status: "all",
    learning_status: "all",
    performance: "all",
    sort: "performance_desc",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [exporting, setExporting] = useState(false);

  const filterQuery = () => {
    const params = new URLSearchParams({ search: search.trim(), ...filters });
    return params.toString();
  };
  const load = async (append = false) => {
    setLoading(true);
    setError("");
    try {
      const offset = append ? users.length : 0;
      const result = await api.admin.get(`/users?${filterQuery()}&include_admins=false&limit=200&offset=${offset}`);
      setUsers((current) => append ? [...current, ...(result.users || [])] : (result.users || []));
      setTotal(result.total || 0);
    } catch (loadError) {
      setError(loadError.message || (isAr ? "تعذر تحميل بيانات المستخدمين." : "Could not load user data."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [refreshKey]);

  const exportUsers = async () => {
    setExporting(true);
    setError("");
    try {
      const blob = await api.admin.download(`/users/export.xlsx?${filterQuery()}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `zeus-users-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportError) {
      setError(exportError.message || (isAr ? "تعذر تصدير الملف." : "Could not export the file."));
    } finally {
      setExporting(false);
    }
  };

  const exportCompletedUsers = async () => {
    setExporting(true);
    setError("");
    try {
      const blob = await api.admin.download(`/users/export-completed.xlsx?account_type=${encodeURIComponent(filters.account_type)}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `zeus-completed-users-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportError) {
      setError(exportError.message || (isAr ? "تعذر تصدير المستخدمين المكتملين." : "Could not export completed users."));
    } finally {
      setExporting(false);
    }
  };

  const updateFilter = (key, value) => {
    setUsers([]);
    setTotal(0);
    setExpanded(null);
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const selectClass = "rounded-xl bg-card border border-border/60 px-3 py-2.5 text-xs outline-none focus:zeus-gold-border";
  const fields = [
    { key: "account_type", label: isAr ? "فئة الحساب" : "Account type", options: [["all", isAr ? "كل الحسابات" : "All account types"], ["individual", isAr ? "طلاب أفراد" : "Individual learners"], ["institution", isAr ? "كل حسابات الجهات" : "All institution accounts"], ["partner_student", isAr ? "طلاب الجهات" : "Institution students"], ["partner", isAr ? "حسابات الجهات" : "Institution accounts"], ["doctor", isAr ? "مدرسو الجهات" : "Institution instructors"]] },
    { key: "account_status", label: isAr ? "حالة الحساب" : "Account", options: [["all", isAr ? "كل الحسابات" : "All accounts"], ["pending", isAr ? "بانتظار التفعيل" : "Pending"], ["active", isAr ? "مفعّل" : "Active"], ["suspended", isAr ? "موقوف" : "Suspended"]] },
    { key: "subscription_status", label: isAr ? "الاشتراك" : "Subscription", options: [["all", isAr ? "كل حالات الاشتراك" : "All subscriptions"], ["active", isAr ? "اشتراك نشط" : "Active"], ["none", isAr ? "بدون اشتراك" : "No subscription"], ["expired", isAr ? "منتهي" : "Expired"]] },
    { key: "plan", label: isAr ? "الباقة" : "Plan", options: [["all", isAr ? "كل الباقات" : "All plans"], ["STARTER", "STARTER"], ["PRO", "PRO"], ["PRIME", "PRIME"]] },
    { key: "payment_status", label: isAr ? "الدفع" : "Payment", options: [["all", isAr ? "كل حالات الدفع" : "All payments"], ["paid", isAr ? "دفع مؤكد" : "Confirmed payment"], ["unpaid", isAr ? "غير مدفوع" : "Unpaid"]] },
    { key: "completion_status", label: isAr ? "إكمال الكورس" : "Course", options: [["all", isAr ? "كل مستويات التقدم" : "All progress"], ["completed", isAr ? "أكمل كل الدروس" : "Course completed"], ["not_completed", isAr ? "لم يكمل الكورس" : "Not completed"]] },
    { key: "learning_status", label: isAr ? "حالة المسار" : "Track status", options: [["all", isAr ? "كل المسارات" : "All tracks"], ["not_started", isAr ? "لم يبدأ" : "Not started"], ["active", isAr ? "قيد التعلم" : "Active"], ["completed", isAr ? "أكمل المسار" : "Track completed"], ["finished", isAr ? "أنهى رحلة التعلم" : "Journey finished"], ["archived", isAr ? "مؤرشف" : "Archived"]] },
    { key: "performance", label: isAr ? "مستوى الأداء" : "Performance level", options: [["all", isAr ? "كل المستويات" : "All levels"], ["high", isAr ? "مرتفع (80 فأكثر)" : "High (80+)"], ["average", isAr ? "مستقر (60–79)" : "On track (60–79)"], ["needs_support", isAr ? "يحتاج دعمًا (أقل من 60)" : "Needs support (<60)"]] },
    { key: "sort", label: isAr ? "ترتيب الطلاب" : "Sort students", options: [["performance_desc", isAr ? "الأعلى أداءً" : "Highest overall performance"], ["progress_desc", isAr ? "الأعلى تقدمًا" : "Highest progress"], ["quiz_desc", isAr ? "أعلى متوسط كويز" : "Highest quiz average"], ["exam_desc", isAr ? "أعلى متوسط امتحانات" : "Highest exam average"], ["progress_asc", isAr ? "الأقل تقدمًا" : "Lowest progress"], ["name_asc", isAr ? "الاسم أ–ي" : "Name A–Z"]] },
  ];

  return (
    <section className="zeus-glass p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading font-bold text-base">{isAr ? "بحث وتصدير المستخدمين" : "Find & export users"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{isAr ? "ابحث بالاسم أو البريد أو الهاتف، ثم رشّح حسب الحساب والاشتراك والتقدم والأداء ودرجات الاختبارات." : "Search by name, email or phone, then filter by account, subscription, progress, performance and assessment scores."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportUsers} disabled={exporting}
            className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-4 py-2.5 text-xs font-bold disabled:opacity-50">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isAr ? "تنزيل النتائج المفلترة" : "Export filtered users"}
          </button>
          <button type="button" onClick={exportCompletedUsers} disabled={exporting}
            className="inline-flex items-center gap-2 rounded-xl bg-zeus-gold px-4 py-2.5 text-xs font-bold text-zeus-midnight disabled:opacity-50">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isAr ? "تصدير المستخدمين المكتملين" : "Export Completed Users"}
          </button>
        </div>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); load(); }} className="space-y-3">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(event) => { setSearch(event.target.value); setUsers([]); setTotal(0); setExpanded(null); }}
            placeholder={isAr ? "بحث بالاسم أو البريد الإلكتروني أو الهاتف..." : "Search name, email or phone..."}
            className="w-full rounded-xl border border-border/60 bg-card py-2.5 ps-10 pe-4 text-sm outline-none focus:zeus-gold-border" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {fields.map((field) => (
            <label key={field.key} className="grid gap-1 text-[11px] text-muted-foreground">
              <span>{field.label}</span>
              <select value={filters[field.key]} onChange={(event) => updateFilter(field.key, event.target.value)} className={selectClass}>
                {field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{isAr ? `المعروض ${users.length} من ${total}` : `Showing ${users.length} of ${total}`}</p>
          <button type="submit" disabled={loading} className="rounded-xl border border-border/60 bg-secondary/40 px-4 py-2 text-xs font-semibold disabled:opacity-50">
            {loading ? (isAr ? "جارٍ البحث..." : "Searching...") : (isAr ? "تطبيق الفلاتر" : "Apply filters")}
          </button>
        </div>
      </form>
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
      <p className="text-[11px] text-muted-foreground">{isAr ? "ملف Excel يحتوي بيانات التواصل والحساب والاشتراك والتقدم فقط، ولا يحتوي كلمات مرور." : "The Excel file contains contact, account, subscription and progress data only; it never includes passwords."}</p>
      <div className="divide-y divide-border/40 rounded-xl border border-border/50">
        {users.map((user) => {
          const complete = user.lessons_total > 0 && user.lessons_done === user.lessons_total;
          const expandedRow = expanded === user.id;
          return (
            <button type="button" key={user.id} onClick={() => setExpanded(expandedRow ? null : user.id)}
              className="block w-full p-3 text-start hover:bg-secondary/20">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold">{user.full_name || user.email}</span>
                <span className="text-xs text-zeus-brightgold">{user.subscription_plan || (isAr ? "بدون باقة" : "No plan")}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>{user.email}</span>
                <span dir="ltr">{user.phone_e164 || (isAr ? "لا يوجد هاتف" : "No phone")}</span>
                <span>{user.status === "active" ? (isAr ? "الحساب مفعّل" : "Account active") : user.status === "pending" ? (isAr ? "بانتظار التفعيل" : "Pending activation") : (isAr ? "موقوف" : "Suspended")}</span>
                <span>{user.lessons_done}/{user.lessons_total} {isAr ? "درس" : "lessons"} · {complete ? (isAr ? "مكتمل" : "Completed") : (isAr ? "غير مكتمل" : "Not completed")}</span>
                <span>{isAr ? "الأداء" : "Performance"}: {user.performance_score}%</span>
                <span>{isAr ? "الكويزات" : "Quizzes"}: {user.average_quiz_score}%</span>
                <span>{isAr ? "الامتحانات" : "Exams"}: {user.average_exam_score}%</span>
                {user.latest_track && <span>{user.latest_track} · {user.learning_status}</span>}
              </div>
              {expandedRow && (
                <div className="mt-3 grid gap-2 border-t border-border/40 pt-3 text-xs sm:grid-cols-2">
                  <span>{isAr ? "الدولة:" : "Country:"} {user.phone_country || "—"}</span>
                  <span>{isAr ? "الدفع:" : "Payment:"} {user.payment_status}</span>
                  <span>{isAr ? "الاشتراك:" : "Subscription:"} {user.effective_subscription_status}</span>
                  <span>{isAr ? "الهدف:" : "Goal:"} {user.goal || "—"}</span>
                  <span>{isAr ? "تصنيف الأداء:" : "Performance band:"} {user.performance_band}</span>
                  <span>{isAr ? "تاريخ التسجيل:" : "Registered:"} {(user.created_date || "").slice(0, 10) || "—"}</span>
                  <span>{isAr ? "ينتهي الاشتراك:" : "Subscription expires:"} {(user.subscription_expires || "").slice(0, 10) || "—"}</span>
                </div>
              )}
            </button>
          );
        })}
        {!loading && users.length === 0 && <p className="p-5 text-center text-xs text-muted-foreground">{isAr ? "لا يوجد مستخدمون مطابقون للفلاتر." : "No users match these filters."}</p>}
      </div>
      {users.length < total && (
        <button type="button" onClick={() => load(true)} disabled={loading}
          className="mx-auto flex items-center gap-2 rounded-full border border-border/60 px-5 py-2.5 text-xs font-semibold disabled:opacity-50">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isAr ? "تحميل المزيد" : "Load more"}
        </button>
      )}
    </section>
  );
}

/* ---------------- Users ---------------- */
function UsersTab({ isAr }) {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loadedSearch, setLoadedSearch] = useState("");
  const [accountType, setAccountType] = useState("all");
  const [loadedAccountType, setLoadedAccountType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [communities, setCommunities] = useState([]);
  const [planModalUser, setPlanModalUser] = useState(null);
  const [planPrices, setPlanPrices] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState("STARTER");
  const [subscriptionStart, setSubscriptionStart] = useState("");
  const [subscriptionExpires, setSubscriptionExpires] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [passwordResetUser, setPasswordResetUser] = useState(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: "", email: "", phone_number: "", password: "", subscription_plan: "" });
  const [error, setError] = useState("");

  const load = async (append = false) => {
    setLoadingMore(append);
    if (!append) setLoading(true);
    setError("");
    try {
      const query = append ? loadedSearch : search;
      const queryAccountType = append ? loadedAccountType : accountType;
      const offset = append ? users.length : 0;
      const r = await api.admin.get(`/users?search=${encodeURIComponent(query)}&account_type=${encodeURIComponent(queryAccountType)}&limit=100&offset=${offset}`);
      setLoadedSearch(query);
      setLoadedAccountType(queryAccountType);
      setUsers((current) => append ? [...current, ...(r.users || [])] : (r.users || []));
      setTotal(r.total || 0);
      const cl = await api.admin.get("/communities");
      setCommunities(cl || []);
    } catch (loadError) {
      setError(loadError.message || (isAr ? "تعذر تحميل المستخدمين." : "Could not load users."));
    } finally {
      setLoadingMore(false);
      if (!append) setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const act = async (fn) => {
    setError("");
    try {
      await fn();
      await load();
    } catch (actionError) {
      setError(actionError.message || (isAr ? "تعذر تنفيذ الإجراء." : "Could not complete the action."));
    }
  };

  const openPlanModal = async (user) => {
    setError("");
    try {
      const settings = await api.admin.get("/settings");
      setPlanPrices({
        STARTER: settings.starter_price,
        PRO: settings.pro_price,
        PRIME: settings.prime_price,
        currency: settings.currency,
      });
    } catch (settingsError) {
      setError(settingsError.message || (isAr ? "تعذر تحميل أسعار الباقات." : "Could not load plan prices."));
      return;
    }

    const now = new Date();
    const defaultExpiry = new Date(now);
    defaultExpiry.setDate(defaultExpiry.getDate() + 30);
    const toDateInput = (date) => {
      const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      return localDate.toISOString().slice(0, 10);
    };
    setPlanModalUser(user);
    setSelectedPlan(user.subscription_plan || "STARTER");
    setSubscriptionStart(user.subscription_start?.slice(0, 10) || toDateInput(now));
    setSubscriptionExpires(user.subscription_expires?.slice(0, 10) || toDateInput(defaultExpiry));
  };

  const assign = async (communityId, userId, isNew, newName) => {
    setError("");
    try {
      let cid = communityId;
      if (isNew) {
        const created = await api.admin.post("/communities", { name: newName });
        cid = created.id;
      }
      await api.admin.post(`/communities/${cid}/members`, { user_id: userId });
      await load();
    } catch (actionError) {
      setError(actionError.message || (isAr ? "تعذر إضافة المستخدم للمجتمع." : "Could not add user to the community."));
    }
  };

  const handleActivateWithPlan = async (e) => {
    e.preventDefault();
    if (!planModalUser) return;
    setSavingPlan(true);
    try {
      await api.admin.put(`/users/${planModalUser.id}`, {
        status: "active",
        subscription_plan: selectedPlan,
        subscription_start: subscriptionStart,
        subscription_expires: subscriptionExpires,
      });
      setPlanModalUser(null);
      await load();
    } catch (err) {
      alert(err.message || (isAr ? "تعذر تحديث باقة المستخدم." : "Failed to update user plan."));
    } finally {
      setSavingPlan(false);
    }
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setSavingUser(true);
    setError("");
    try {
      await api.admin.post("/users", {
        ...newUser,
        subscription_plan: newUser.subscription_plan || null,
      });
      setNewUser({ full_name: "", email: "", phone_number: "", password: "", subscription_plan: "" });
      setCreatingUser(false);
      await load();
    } catch (createError) {
      setError(createError.message || (isAr ? "تعذر إنشاء الحساب." : "Could not create the account."));
    } finally {
      setSavingUser(false);
    }
  };

  if (loading && users.length === 0) return <Spin />;

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">{error}</p>}
      {loading && <Spin />}
      <div className="flex justify-end">
        <button type="button" onClick={() => setCreatingUser((open) => !open)}
          className="inline-flex items-center gap-2 rounded-xl bg-zeus-gold px-4 py-2.5 text-xs font-bold text-zeus-midnight">
          <Plus className="h-4 w-4" /> {isAr ? "إنشاء حساب مستخدم" : "Create user account"}
        </button>
      </div>
      {creatingUser && (
        <form onSubmit={handleCreateUser} className="zeus-glass grid gap-3 p-4 sm:grid-cols-2">
          <h3 className="font-heading font-bold sm:col-span-2">{isAr ? "بيانات الحساب والخطة" : "Account and plan details"}</h3>
          <input required maxLength={160} value={newUser.full_name} onChange={(event) => setNewUser((current) => ({ ...current, full_name: event.target.value }))}
            placeholder={isAr ? "الاسم بالكامل" : "Full name"} className="rounded-xl border border-border/60 bg-card px-3 py-2.5 text-sm" />
          <input required type="email" maxLength={254} value={newUser.email} onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))}
            placeholder={isAr ? "البريد الإلكتروني" : "Email"} className="rounded-xl border border-border/60 bg-card px-3 py-2.5 text-sm" />
          <input type="tel" maxLength={32} value={newUser.phone_number} onChange={(event) => setNewUser((current) => ({ ...current, phone_number: event.target.value }))}
            placeholder={isAr ? "رقم الهاتف (اختياري)" : "Phone number (optional)"} className="rounded-xl border border-border/60 bg-card px-3 py-2.5 text-sm" />
          <input required type="password" minLength={8} maxLength={72} autoComplete="new-password" value={newUser.password} onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))}
            placeholder={isAr ? "كلمة المرور (8 أحرف على الأقل)" : "Password (at least 8 characters)"} className="rounded-xl border border-border/60 bg-card px-3 py-2.5 text-sm" />
          <select value={newUser.subscription_plan} onChange={(event) => setNewUser((current) => ({ ...current, subscription_plan: event.target.value }))}
            className="rounded-xl border border-border/60 bg-card px-3 py-2.5 text-sm">
            <option value="">{isAr ? "بدون باقة — الحساب ينتظر التفعيل" : "No plan — account remains pending"}</option>
            <option value="STARTER">STARTER</option><option value="PRO">PRO</option><option value="PRIME">PRIME</option>
          </select>
          <button type="submit" disabled={savingUser} className="inline-flex items-center justify-center gap-2 rounded-xl bg-zeus-gold px-4 py-2.5 text-xs font-bold text-zeus-midnight disabled:opacity-50">
            {savingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isAr ? "إنشاء الحساب" : "Create account"}
          </button>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="admin-account-type-filter">{isAr ? "تصفية حسب فئة الحساب" : "Filter by account type"}</label>
        <select id="admin-account-type-filter" aria-label={isAr ? "تصفية حسب فئة الحساب" : "Filter by account type"}
          value={accountType}
          onChange={(event) => {
            setAccountType(event.target.value);
            setUsers([]);
            setTotal(0);
            setExpanded(null);
          }}
          className="rounded-xl border border-border/60 bg-card px-3 py-2.5 text-sm outline-none focus:zeus-gold-border">
          <option value="all">{isAr ? "كل فئات الحسابات" : "All account types"}</option>
          <option value="individual">{isAr ? "طلاب أفراد" : "Individual learners"}</option>
          <option value="institution">{isAr ? "كل حسابات الجهات" : "All institution accounts"}</option>
          <option value="partner_student">{isAr ? "طلاب الجهات" : "Institution students"}</option>
          <option value="partner">{isAr ? "حسابات الجهات" : "Institution accounts"}</option>
          <option value="doctor">{isAr ? "مدرسو الجهات" : "Institution instructors"}</option>
          <option value="admin">{isAr ? "المسؤولون" : "Administrators"}</option>
        </select>
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder={isAr ? "بحث بالاسم أو البريد أو الهاتف أو المسار..." : "Search name, email, phone, or track..."}
            className="w-full ps-10 pe-4 py-2.5 rounded-xl bg-card border border-border/60 text-sm outline-none focus:zeus-gold-border" />
        </div>
        <button type="button" onClick={() => load()} className="px-4 rounded-xl bg-secondary/40 border border-border/60 text-sm hover:border-zeus-gold/40 transition">{isAr ? "بحث" : "Search"}</button>
      </div>
      <p className="text-xs text-muted-foreground">{isAr ? `عرض ${users.length} من ${total}` : `Showing ${users.length} of ${total}`}</p>

      <div className="space-y-2">
        {users.map((u) => {
          const pct = u.lessons_total ? Math.round((u.lessons_done / u.lessons_total) * 100) : 0;
          const isOpen = expanded === u.id;
          const status = u.status || "active";
          const statusLabel = status === "active" ? (isAr ? "مفعّل" : "Active") : status === "suspended" ? (isAr ? "موقوف" : "Suspended") : (isAr ? "بانتظار التفعيل" : "Pending");
          const statusCls = status === "active" ? "bg-emerald-500/15 text-emerald-400" : status === "suspended" ? "bg-red-500/15 text-red-400" : "bg-orange-500/15 text-orange-400";

          const planName = u.subscription_plan;
          const planBadgeColor =
            planName === "PRIME"
              ? "bg-purple-500/15 text-purple-400 border-purple-500/40"
              : planName === "PRO"
              ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/40"
              : planName === "STARTER"
              ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
              : "bg-secondary/60 text-muted-foreground border-border/60";

          return (
            <div key={u.id} className="zeus-glass p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <button onClick={() => setExpanded(isOpen ? null : u.id)} className="min-w-0 flex-1 text-start">
                  <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                    <span className="truncate">{u.full_name || u.email}</span>
                    {u.role === "admin" && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zeus-gold/15 text-zeus-brightgold text-[10px]"><Crown style={{ width: 10, height: 10 }} /> admin</span>}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusCls}`}>
                      {statusLabel}
                    </span>

                    {/* Assigned Plan Column / Badge */}
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        openPlanModal(u);
                      }}
                      title={isAr ? "تحديد أو تغيير باقة هذا المستخدم" : "Assign or change user plan"}
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border cursor-pointer hover:opacity-80 transition ${planBadgeColor}`}
                    >
                      <CreditCard style={{ width: 11, height: 11 }} />
                      <span>{planName || (isAr ? "بدون باقة (FREE)" : "FREE (No Plan)")}</span>
                      <Pencil style={{ width: 9, height: 9 }} className="opacity-70 ms-0.5" />
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {u.email} · {isAr ? "انضم" : "joined"} {(u.created_date || "").slice(0, 10)}
                    {u.phone_e164 && <span className="ms-2" dir="ltr">· {u.phone_e164}</span>}
                    {u.subscription_expires && (
                      <span className="text-zeus-brightgold ms-2">
                        · {isAr ? "ينتهي الاشتراك:" : "Expires:"} {u.subscription_expires.slice(0, 10)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {(u.goal || (isAr ? "بدون هدف" : "no goal"))} · {u.lessons_done}/{u.lessons_total} ({pct}%)
                        {u.latest_track && <span> · {isAr ? "آخر مسار:" : "Latest track:"} {u.latest_track}</span>}
                        <span className={u.learning_status === "finished" ? "text-emerald-400" : ""}> · {isAr ? "حالة التعلّم:" : "Learning:"} {u.learning_status || "not_started"}</span>
                        {(u.memberships || []).length > 0 && <span className="text-zeus-brightgold"> · {isAr ? "عضو في" : "in"}: {(u.memberships || []).map((m) => m.name).join("، ")}</span>}
                      </div>
                </button>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Link to={`/admin/users/${encodeURIComponent(u.id)}/preview`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-zeus-gold/40 px-3 py-2 text-xs font-semibold text-zeus-brightgold hover:bg-zeus-gold/10">
                    <Eye className="h-3.5 w-3.5" />{isAr ? "معاينة الحساب" : "Preview account"}
                  </Link>
                  {status !== "active" ? (
                    <button
                      onClick={() => {
                        openPlanModal(u);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-400 transition shadow-sm"
                    >
                      <Check style={{ width: 13, height: 13 }} /> {isAr ? "تحديد الباقة والتفعيل" : "Specify Plan & Activate"}
                    </button>
                  ) : (
                    <button onClick={() => { if (window.confirm(isAr ? `إيقاف حساب ${u.email}؟ مش هيقدر يدخل لحد ما تفعله تاني.` : `Suspend ${u.email}? They won't be able to log in until reactivated.`)) act(() => api.admin.put(`/users/${u.id}`, { status: "suspended" })); }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-orange-500/40 text-orange-400 text-xs font-medium hover:bg-orange-500/10 transition disabled:opacity-40"
                      disabled={u.role === "admin"}>
                      {isAr ? "إيقاف" : "Suspend"}
                    </button>
                  )}
                  <button onClick={() => { if (window.confirm(isAr ? `حذف ${u.email} نهائيًا بكل بياناته؟` : `Delete ${u.email} with all data?`)) act(() => api.admin.del(`/users/${u.id}`)); }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-red-500/15 border border-red-500/40 text-red-400 text-xs font-bold hover:bg-red-500/25 transition">
                    <Trash2 style={{ width: 13, height: 13 }} /> {isAr ? "حذف" : "Delete"}
                  </button>
                  <button title={isAr ? "ترقية/تخفيض أدمن" : "Toggle admin"} onClick={() => act(() => api.admin.put(`/users/${u.id}`, { role: u.role === "admin" ? "user" : "admin" }))}
                    className="p-2 rounded-lg bg-secondary/40 border border-border/60 hover:border-zeus-gold/40 transition"><Crown style={{ width: 14, height: 14 }} className={u.role === "admin" ? "text-zeus-gold" : "text-muted-foreground"} /></button>
                  <button title={isAr ? "إعادة تعيين كلمة المرور" : "Reset password"} onClick={() => setPasswordResetUser(u)}
                    className="p-2 rounded-lg bg-secondary/40 border border-border/60 hover:border-zeus-gold/40 transition"><KeyRound style={{ width: 14, height: 14 }} className="text-muted-foreground" /></button>
                </div>
              </div>
              {isOpen && <UserDetail u={u} isAr={isAr} communities={communities} onAssign={assign} />}
            </div>
          );
        })}
      </div>
      {users.length < total && (
        <button type="button" onClick={() => load(true)} disabled={loading || loadingMore}
          className="mx-auto flex items-center gap-2 rounded-full border border-border/60 px-5 py-2.5 text-xs font-semibold hover:border-zeus-gold/60 disabled:opacity-50">
          {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {loadingMore ? (isAr ? "جارٍ التحميل..." : "Loading...") : (isAr ? "تحميل المزيد من المستخدمين" : "Load more users")}
        </button>
      )}

      {/* Plan Specification & Account Activation Modal */}
      {planModalUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleActivateWithPlan}
            className="w-full max-w-md bg-card rounded-2xl border border-border/80 p-5 space-y-4 shadow-2xl animate-fade-up"
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h3 className="font-heading font-bold text-base text-foreground flex items-center gap-2">
                <CreditCard className="text-zeus-gold" style={{ width: 18, height: 18 }} />
                <span>{isAr ? "تحديد باقة المستخدم والتفعيل" : "Specify Plan & Activate Account"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setPlanModalUser(null)}
                className="p-1 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            <div className="text-xs text-muted-foreground">
              {isAr
                ? `يرجى تحديد الباقة التي سينضم إليها المستخدم (${planModalUser.full_name || planModalUser.email}) قبل التفعيل:`
                : `Please specify the subscription plan for (${planModalUser.full_name || planModalUser.email}) before activation:`}
            </div>

            <div className="space-y-2">
              {[
                { id: "STARTER", name: "STARTER", priceKey: "STARTER", descAr: "خريطة مخصصة + مساعد ذكي", descEn: "Personalized Roadmap + AI", cls: "border-amber-500/40 text-amber-400" },
                { id: "PRO", name: "PRO", priceKey: "PRO", descAr: "كافة مميزات ستارتر + كويزات ومشاريع بعد كل مرحلة", descEn: "Quizzes + Projects after stages", cls: "border-cyan-500/40 text-cyan-400" },
                { id: "PRIME", name: "PRIME", priceKey: "PRIME", descAr: "شامل كل شيء + وظائف ومجتمعات وCV وبورتفوليو", descEn: "All features + Jobs + CV + Community", cls: "border-purple-500/40 text-purple-400" },
              ].map((p) => {
                const checked = selectedPlan === p.id;
                return (
                  <label
                    key={p.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                      checked
                        ? "bg-zeus-gold/10 border-zeus-gold text-foreground shadow-sm"
                        : "bg-secondary/30 border-border/40 hover:bg-secondary/50 text-muted-foreground"
                    }`}
                  >
                    <input
                      type="radio"
                      name="plan_choice"
                      value={p.id}
                      checked={checked}
                      onChange={() => setSelectedPlan(p.id)}
                      className="mt-1 text-zeus-gold focus:ring-zeus-gold"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs flex items-center justify-between">
                        <span>{p.name}</span>
                        {checked && <span className="text-[10px] text-zeus-brightgold font-bold">✓ {isAr ? "محدد" : "Selected"}</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {isAr ? p.descAr : p.descEn}
                        {" · "}
                        {planPrices[p.priceKey]} {planPrices.currency}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs font-semibold">
                <span>{isAr ? "تاريخ بداية الاشتراك" : "Subscription start date"}</span>
                <input
                  type="date"
                  required
                  value={subscriptionStart}
                  onChange={(event) => setSubscriptionStart(event.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-card px-3 py-2.5 text-xs"
                />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                <span>{isAr ? "تاريخ انتهاء الاشتراك" : "Subscription expiry date"}</span>
                <input
                  type="date"
                  required
                  min={subscriptionStart}
                  value={subscriptionExpires}
                  onChange={(event) => setSubscriptionExpires(event.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-card px-3 py-2.5 text-xs"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <button
                type="button"
                onClick={() => setPlanModalUser(null)}
                className="px-4 py-2 rounded-xl border border-border/60 text-xs text-muted-foreground hover:bg-secondary/40 transition"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                disabled={savingPlan}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-zeus-gold text-zeus-midnight text-xs font-bold hover:bg-zeus-brightgold transition shadow-md disabled:opacity-50"
              >
                {savingPlan ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Check style={{ width: 13, height: 13 }} />}
                <span>{isAr ? "تأكيد وتفعيل الحساب" : "Confirm & Activate"}</span>
              </button>
            </div>
          </form>
        </div>
      )}
      {passwordResetUser && (
        <PasswordResetModal
          user={passwordResetUser}
          isAr={isAr}
          onClose={() => setPasswordResetUser(null)}
          onSave={async (password) => {
            await api.admin.put(`/users/${passwordResetUser.id}`, { password });
            await load();
            setPasswordResetUser(null);
          }}
        />
      )}
    </div>
  );
}

function UserDetail({ u, isAr, communities, onAssign }) {
  const [pick, setPick] = useState("");
  const [newName, setNewName] = useState("");
  const [learning, setLearning] = useState(null);
  const [learningLoading, setLearningLoading] = useState(true);
  const [learningError, setLearningError] = useState("");
  const dna = u.dna || {};
  const chips = [
    dna.goal && `${isAr ? "الهدف" : "Goal"}: ${dna.goal}`,
    dna.current_level && `${isAr ? "المستوى" : "Level"}: ${dna.current_level}`,
    dna.learning_style && `${isAr ? "الأسلوب" : "Style"}: ${dna.learning_style}`,
    dna.weekly_hours && `${isAr ? "أسبوعيًا" : "Weekly"}: ${dna.weekly_hours}h`,
    (dna.available_days || []).length > 0 && `${isAr ? "الأيام" : "Days"}: ${dna.available_days.length}`,
  ].filter(Boolean);
  const submit = async () => {
    if (pick === "__new__") {
      if (!newName.trim()) return;
      await onAssign(null, u.id, true, newName.trim());
    } else if (pick) {
      await onAssign(pick, u.id, false);
    }
    setPick(""); setNewName("");
  };
  useEffect(() => {
    let active = true;
    setLearningLoading(true);
    setLearningError("");
    api.admin.get(`/users/${encodeURIComponent(u.id)}/learning`)
      .then((result) => { if (active) setLearning(result); })
      .catch((error) => { if (active) setLearningError(error.message || (isAr ? "تعذر تحميل سجل التعلم." : "Couldn't load learning history.")); })
      .finally(() => { if (active) setLearningLoading(false); });
    return () => { active = false; };
  }, [u.id, isAr]);

  const retryLearning = () => {
    setLearningLoading(true);
    setLearningError("");
    api.admin.get(`/users/${encodeURIComponent(u.id)}/learning`)
      .then(setLearning)
      .catch((error) => setLearningError(error.message || (isAr ? "تعذر تحميل سجل التعلم." : "Couldn't load learning history.")))
      .finally(() => setLearningLoading(false));
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/40 space-y-3">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c, i) => <span key={i} className="px-2.5 py-1 rounded-full bg-secondary/40 text-[11px]">{c}</span>)}
        </div>
      )}
      {u.suggested && (
        <div className="p-3 rounded-xl bg-zeus-gold/10 border border-zeus-gold/25 text-xs">
          <span className="text-zeus-brightgold font-bold">{isAr ? "المجتمع المقترح: " : "Suggested: "}{u.suggested.name}</span>
          <span className="text-muted-foreground"> — {u.suggested.reason}</span>
          <button onClick={() => onAssign(u.suggested.community_id, u.id, false)}
            className="ms-2 px-3 py-1.5 rounded-full bg-zeus-gold text-zeus-midnight font-bold hover:bg-zeus-brightgold transition">
            {isAr ? "أضف فورًا" : "Add now"}
          </button>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        <select value={pick} onChange={(e) => setPick(e.target.value)}
          className="flex-1 min-w-[180px] bg-card border border-border/60 rounded-xl px-3 py-2.5 text-xs outline-none focus:zeus-gold-border">
          <option value="">{isAr ? "اختر مجتمعًا..." : "Pick a community..."}</option>
          {communities.filter((c) => !(u.memberships || []).some((m) => m.id === c.id)).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value="__new__">{isAr ? "＋ مجتمع جديد..." : "+ New community..."}</option>
        </select>
        {pick === "__new__" && (
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={isAr ? "اسم المجتمع الجديد" : "New community name"}
            className="flex-1 min-w-[180px] bg-card border border-border/60 rounded-xl px-3 py-2.5 text-xs outline-none focus:zeus-gold-border" />
        )}
        <button onClick={submit} disabled={!pick || (pick === "__new__" && !newName.trim())}
          className="px-4 py-2.5 rounded-xl bg-zeus-gold text-zeus-midnight text-xs font-bold hover:bg-zeus-brightgold transition disabled:opacity-40">
          {isAr ? "إضافة للمجتمع" : "Add"}
        </button>
      </div>
      <section className="space-y-3 rounded-xl border border-border/50 bg-secondary/10 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold">{isAr ? "سجل التعلم والاختبارات" : "Learning and quiz history"}</h3>
          {learning && <span className="text-[10px] text-muted-foreground">{learning.lessons?.length || 0} {isAr ? "درسًا" : "lessons"}</span>}
        </div>
        {learningLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{isAr ? "جارٍ تحميل السجل..." : "Loading learning history..."}</div>}
        {learningError && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-rose-400">
            <span role="alert">{learningError}</span>
            <button type="button" onClick={retryLearning} className="rounded-lg border border-border/60 px-2.5 py-1.5">{isAr ? "إعادة المحاولة" : "Retry"}</button>
          </div>
        )}
        {learning && (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
              <span>{learning.user?.full_name || u.full_name || "—"}</span>
              <span>{learning.user?.email || u.email}</span>
              <span dir="ltr">{learning.user?.phone || u.phone_e164 || "—"}</span>
              <Link to={`/admin/users/${encodeURIComponent(u.id)}/preview`} className="inline-flex items-center gap-1 text-zeus-brightgold underline">
                <Eye className="h-3 w-3" />{isAr ? "معاينة حساب الطالب للقراءة فقط" : "Preview student account (read-only)"}
              </Link>
              {learning.user?.portfolio_url && (
                <a href={new URL(learning.user.portfolio_url, window.location.origin).href} target="_blank" rel="noreferrer" className="text-zeus-brightgold underline">
                  {isAr ? "فتح البورتفوليو" : "Open portfolio"}
                </a>
              )}
              {learning.user?.cv_url && (
                <a href={new URL(learning.user.cv_url, window.location.origin).href} target="_blank" rel="noreferrer" className="text-zeus-brightgold underline">
                  {isAr ? "فتح السيرة المنشورة" : "Open shared CV"}
                </a>
              )}
            </div>
            {learning.cv && (
              <div className="rounded-lg border border-border/40 bg-card/60 p-2.5 text-[10px]">
                <p className="font-semibold">{learning.cv.title_role || (isAr ? "السيرة الذاتية" : "CV")}</p>
                {learning.cv.summary && <p className="mt-1 text-muted-foreground">{learning.cv.summary}</p>}
                {!!learning.cv.skills?.length && <p className="mt-1">{isAr ? "المهارات:" : "Skills:"} {learning.cv.skills.map((skill) => typeof skill === "string" ? skill : skill.name).filter(Boolean).join(", ")}</p>}
                {!!learning.cv.projects?.length && <p className="mt-1">{isAr ? "مشاريع السيرة:" : "CV projects:"} {learning.cv.projects.length}</p>}
              </div>
            )}
            {learning.profile && (
              <div className="rounded-lg border border-border/40 bg-card/60 p-2.5 text-[10px]">
                <p><span className="font-semibold">{isAr ? "المجال والوظيفة المستهدفة:" : "Goal and target role:"}</span> {learning.profile.current_role || learning.profile.career_intent || learning.profile.goal || "—"}</p>
                <p className="mt-1"><span className="font-semibold">{isAr ? "المستوى:" : "Level:"}</span> {learning.profile.current_level || "—"}</p>
                {!!learning.profile.strengths && <p className="mt-1"><span className="font-semibold">{isAr ? "نقاط القوة المصرّح بها:" : "Declared strengths:"}</span> {learning.profile.strengths}</p>}
                {!!learning.profile.weaknesses && <p className="mt-1"><span className="font-semibold">{isAr ? "مجالات التحسين المصرّح بها:" : "Declared growth areas:"}</span> {learning.profile.weaknesses}</p>}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {(learning.tracks || []).map((track) => (
                <span key={track.id} className="rounded-full border border-border/50 bg-card px-2.5 py-1 text-[10px]">
                  {track.goal} · {track.status} · {track.lessons_completed || 0}/{track.lessons_total || 0}
                  {track.capstone_exists ? ` · ${track.capstone_completed ? (isAr ? "مشروع التخرج مكتمل" : "Capstone complete") : (isAr ? "مشروع التخرج متبقٍ" : "Capstone pending")}` : ""}
                </span>
              ))}
            </div>
            {(learning.skill_graph || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(learning.skill_graph || []).map((skill) => (
                  <span key={skill.skill} className="rounded-lg bg-zeus-gold/10 px-2 py-1 text-[10px] text-zeus-brightgold">
                    {skill.skill}: {skill.level}%
                  </span>
                ))}
              </div>
            )}
            {!!learning.skills_in_progress?.length && <p className="rounded-lg border border-border/40 bg-card/60 p-2.5 text-[10px]"><span className="font-semibold">{isAr ? "مهارات قيد التعلم:" : "Skills in progress:"}</span> {learning.skills_in_progress.join(", ")}</p>}
            {!!learning.strength_topics?.length && (
              <details className="rounded-lg border border-border/40 bg-card/60 p-2.5">
                <summary className="cursor-pointer text-[10px] font-semibold text-emerald-400">{isAr ? "نقاط قوة مثبتة بالكويزات" : "Quiz-evidenced strengths"}</summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {learning.strength_topics.map((topic) => <span key={topic.topic} className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">{topic.topic} · {Math.round(topic.correct / topic.questions * 100)}%</span>)}
                </div>
              </details>
            )}
              {!!learning.weak_topics?.length && (
                <details className="rounded-lg border border-border/40 bg-card/60 p-2.5">
                  <summary className="cursor-pointer text-[10px] font-semibold text-amber-300">
                    {isAr ? "موضوعات تكررت فيها الأخطاء" : "Topics with repeated quiz mistakes"}
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {learning.weak_topics.map((topic) => (
                      <span key={topic.topic} className="rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
                        {topic.topic} · {topic.incorrect_answers}
                      </span>
                    ))}
                  </div>
                </details>
              )}
              {!!learning.tutor_chats?.length && (
                <details className="rounded-lg border border-border/40 bg-card/60 p-2.5">
                  <summary className="cursor-pointer text-[10px] font-semibold">
                    {isAr ? `تفاعلات الشرح والمراجعة (${learning.tutor_chats.length})` : `Tutor and review interactions (${learning.tutor_chats.length})`}
                  </summary>
                  <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pe-1">
                    {learning.tutor_chats.map((chat, chatIndex) => (
                      <article key={`${chat.type}-${chat.lesson_id || "review"}-${chatIndex}`} className="rounded-md bg-secondary/30 p-2">
                        <p className="mb-1 text-[10px] font-semibold text-zeus-brightgold">
                          {chat.lesson_title || (chat.type === "learning_review" ? (isAr ? "مدرس المراجعة" : "Review tutor") : (isAr ? "محادثة الدرس" : "Lesson chat"))}
                        </p>
                        {(chat.messages || []).map((message, messageIndex) => (
                          <p key={messageIndex} className="mb-1 whitespace-pre-wrap text-[10px] text-muted-foreground">
                            <span className="font-semibold">{message.role === "user" ? (isAr ? "الطالب: " : "Student: ") : (isAr ? "المعلم: " : "Tutor: ")}</span>
                            {message.content}
                          </p>
                        ))}
                      </article>
                    ))}
                  </div>
                </details>
              )}
              <div className="max-h-72 space-y-2 overflow-y-auto pe-1">
              {(learning.lessons || []).map((lesson) => {
                const latestAttempt = lesson.quiz_history?.[lesson.quiz_history.length - 1];
                return (
                  <article key={lesson.id} className="rounded-lg border border-border/40 bg-card/60 p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{lesson.title || lesson.node_id}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {isAr ? `مرحلة ${lesson.phase}` : `Phase ${lesson.phase}`} · {lesson.status}
                        {lesson.quiz_score != null ? ` · ${lesson.quiz_score}%` : ""}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                      <span>{lesson.attempts} {isAr ? "محاولات" : "attempts"}</span>
                      {lesson.project && <span>{lesson.capstone ? (isAr ? "مشروع التخرج" : "Capstone") : (isAr ? "مشروع مرحلة" : "Phase project")}</span>}
                      {lesson.video_title && <span>{isAr ? "فيديو:" : "Video:"} {lesson.video_title}{lesson.video_verified ? " ✓" : ""}</span>}
                      {lesson.video_duration > 0 && (
                        <span>
                          {isAr ? "المشاهدة الفعلية:" : "Actually watched:"} {Math.min(100, Math.round((lesson.video_watched_sec || 0) / lesson.video_duration * 100))}%
                          {lesson.video_watched && ` · ${isAr ? "اكتمل" : "Complete"}`}
                          {" · "}{isAr ? "المتبقي تقريبًا:" : "about"} {Math.ceil(Math.max(0, lesson.video_duration - (lesson.video_position_sec || 0)) / 60)} {isAr ? "دقيقة" : "min left"}
                        </span>
                      )}
                    </div>
                    {lesson.project_submission && (
                      <div className="mt-2 space-y-1 rounded-md bg-secondary/30 p-2 text-[10px]">
                        {lesson.project_submission.text && <p className="whitespace-pre-wrap">{lesson.project_submission.text}</p>}
                        {lesson.project_submission.url && /^https?:\/\//i.test(lesson.project_submission.url) && (
                          <a href={lesson.project_submission.url} target="_blank" rel="noreferrer" className="text-zeus-brightgold underline">
                            {isAr ? "رابط المشروع" : "Project link"}
                          </a>
                        )}
                        {lesson.project_submission.score != null && (
                          <p>{isAr ? "نتيجة المراجعة:" : "Review score:"} {lesson.project_submission.score}% · {lesson.project_submission.approved ? (isAr ? "مقبول" : "Approved") : (isAr ? "يحتاج تحسينًا" : "Needs improvement")}</p>
                        )}
                      </div>
                    )}
                    {!!latestAttempt?.feedback?.length && (
                      <details className="mt-2 text-[10px]">
                        <summary className="cursor-pointer text-zeus-brightgold">{isAr ? `تفاصيل آخر محاولة (${latestAttempt.score}%)` : `Latest quiz attempt (${latestAttempt.score}%)`}</summary>
                        <ul className="mt-2 space-y-1.5">
                          {latestAttempt.feedback.map((item, index) => (
                            <li key={`${lesson.id}-feedback-${index}`} className={item.correct ? "text-emerald-400" : "text-amber-300"}>
                              {item.correct ? "✓ " : "• "}{item.question || (isAr ? `السؤال ${index + 1}` : `Question ${index + 1}`)}
                              {item.student_answer && <span className="block ps-3 text-muted-foreground">{isAr ? "إجابة الطالب:" : "Student answer:"} {item.student_answer}</span>}
                              {!item.correct && item.correct_answer && <span className="block ps-3 text-emerald-400">{isAr ? "الإجابة الصحيحة:" : "Correct answer:"} {item.correct_answer}</span>}
                              {item.feedback && <span className="block ps-3 text-muted-foreground">{item.feedback}</span>}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function PasswordResetModal({ user, isAr, onClose, onSave }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (password.length < 8 || password.length > 72) {
      setError(isAr ? "كلمة المرور يجب أن تكون من 8 إلى 72 حرفًا." : "Password must be 8-72 characters.");
      return;
    }
    if (password !== confirm) {
      setError(isAr ? "كلمتا المرور غير متطابقتين." : "Passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      await onSave(password);
    } catch (saveError) {
      setError(saveError.message || (isAr ? "تعذر تغيير كلمة المرور." : "Could not reset the password."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-heading font-bold">{isAr ? "إعادة تعيين كلمة المرور" : "Reset password"}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-secondary/60" aria-label={isAr ? "إغلاق" : "Close"}><X className="h-4 w-4" /></button>
        </div>
        <label className="block space-y-1 text-xs">
          <span>{isAr ? "كلمة المرور الجديدة" : "New password"}</span>
          <input type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password}
            onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5" />
        </label>
        <label className="block space-y-1 text-xs">
          <span>{isAr ? "تأكيد كلمة المرور" : "Confirm password"}</span>
          <input type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={confirm}
            onChange={(event) => setConfirm(event.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5" />
        </label>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        <button type="submit" disabled={saving} className="w-full rounded-xl bg-zeus-gold px-4 py-2.5 text-sm font-bold text-zeus-midnight disabled:opacity-50">
          {saving ? (isAr ? "جارٍ الحفظ..." : "Saving...") : (isAr ? "حفظ كلمة المرور الجديدة" : "Save new password")}
        </button>
      </form>
    </div>
  );
}

/* ---------------- Communities ---------------- */
function CommunitiesTab({ isAr }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", goal: "", stage: "" });
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setList(await api.admin.get("/communities"));
    } catch (loadError) {
      setError(loadError.message || (isAr ? "تعذر تحميل المجتمعات." : "Could not load communities."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      if (editing) await api.admin.put(`/communities/${editing}`, form);
      else await api.admin.post("/communities", form);
      setForm({ name: "", goal: "", stage: "" });
      setEditing(null);
      await load();
    } catch (saveError) {
      setError(saveError.message || (isAr ? "تعذر حفظ المجتمع." : "Could not save community."));
    } finally {
      setSaving(false);
    }
  };
  if (loading && list.length === 0) return <Spin />;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-bold">{isAr ? "المجتمعات والإشراف" : "Communities & moderation"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{isAr ? "إدارة المجتمعات ومتابعة الرسائل والأعضاء من مكان واحد." : "Manage communities, messages, and members in one place."}</p>
      </div>
      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">{error}</p>}
      {loading && <Spin />}
      <form onSubmit={submit} className="zeus-glass p-4">
        <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-1.5">
          {editing ? <Pencil style={{ width: 14, height: 14 }} className="text-zeus-gold" /> : <Plus style={{ width: 14, height: 14 }} className="text-zeus-gold" />}
          {editing ? (isAr ? "تعديل مجتمع" : "Edit community") : (isAr ? "مجتمع جديد (يظهر لكل المستخدمين)" : "New community (visible to all users)")}
        </h3>
        <div className="grid sm:grid-cols-3 gap-2 mb-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={isAr ? "الاسم *" : "Name *"}
            className="px-3.5 py-2.5 rounded-xl bg-card border border-border/60 text-sm outline-none focus:zeus-gold-border" />
          <input value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder={isAr ? "الهدف/المسار" : "Goal/track"}
            className="px-3.5 py-2.5 rounded-xl bg-card border border-border/60 text-sm outline-none focus:zeus-gold-border" />
          <input value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} placeholder={isAr ? "المرحلة" : "Stage"}
            className="px-3.5 py-2.5 rounded-xl bg-card border border-border/60 text-sm outline-none focus:zeus-gold-border" />
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-zeus-gold text-zeus-midnight text-sm font-semibold hover:bg-zeus-brightgold transition disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check style={{ width: 14, height: 14 }} />} {editing ? (isAr ? "حفظ" : "Save") : (isAr ? "إنشاء" : "Create")}
          </button>
          {editing && <button type="button" onClick={() => { setEditing(null); setForm({ name: "", goal: "", stage: "" }); }} className="px-4 rounded-full border border-border/60 text-sm text-muted-foreground"><X style={{ width: 14, height: 14 }} /></button>}
        </div>
      </form>
      <div className="space-y-2">
        {list.map((c) => (
          <CommunityCard key={c.id} c={c} isAr={isAr} onEdit={() => { setEditing(c.id); setForm({ name: c.name || "", goal: c.goal || "", stage: c.stage || "" }); }} onChanged={load} />
        ))}
        {list.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">{isAr ? "لا مجتمعات — أنشئ أول واحد فوق." : "No communities — create the first one above."}</p>}
      </div>
    </div>
  );
}

function CommunityCard({ c, isAr, onEdit, onChanged }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [messageError, setMessageError] = useState("");
  const loadMessages = async () => {
    setMessagesLoading(true);
    setMessageError("");
    try {
      setMessages(await api.admin.get(`/communities/${c.id}/messages`));
    } catch (loadError) {
      setMessageError(loadError.message || (isAr ? "تعذر تحميل رسائل المجتمع." : "Could not load community messages."));
    } finally {
      setMessagesLoading(false);
    }
  };
  useEffect(() => {
    if (!open) return;
    let active = true;
    setMessagesLoading(true);
    setMessageError("");
    api.admin.get(`/communities/${c.id}/messages`).then((loadedMessages) => {
      if (active) setMessages(loadedMessages);
    }).catch((loadError) => {
      if (active) setMessageError(loadError.message || (isAr ? "تعذر تحميل رسائل المجتمع." : "Could not load community messages."));
    }).finally(() => {
      if (active) setMessagesLoading(false);
    });
    return () => { active = false; };
  }, [open, c.id]);
  const runAction = async (action) => {
    setError("");
    try {
      await action();
      await onChanged();
    } catch (actionError) {
      setError(actionError.message || (isAr ? "تعذر تنفيذ الإجراء." : "Could not complete the action."));
    }
  };
  const sendAdminMessage = async (event) => {
    event.preventDefault();
    const text = messageText.trim();
    if (!text || sending) return;
    setSending(true);
    setMessageError("");
    try {
      await api.admin.post(`/communities/${c.id}/messages`, { text });
      setMessageText("");
      await loadMessages();
      await onChanged();
    } catch (sendError) {
      setMessageError(sendError.message || (isAr ? "تعذر إرسال الرسالة." : "Could not send message."));
    } finally {
      setSending(false);
    }
  };
  const togglePinned = async (message) => {
    try {
      await api.admin.post(`/messages/${message.id}/pin`, { is_pinned: !message.is_pinned });
      await loadMessages();
    } catch (pinError) {
      setMessageError(pinError.message || (isAr ? "تعذر تثبيت الرسالة." : "Could not pin message."));
    }
  };
  const deleteMessage = async (messageId) => {
    if (!window.confirm(isAr ? "تحذف الرسالة دي؟" : "Delete this message?")) return;
    try {
      await api.admin.del(`/messages/${messageId}`);
      await loadMessages();
      await onChanged();
    } catch (deleteError) {
      setMessageError(deleteError.message || (isAr ? "تعذر حذف الرسالة." : "Could not delete message."));
    }
  };
  return (
    <div className="zeus-glass p-4">
      {error && <p role="alert" className="mb-3 text-xs text-rose-400">{error}</p>}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => setOpen(!open)} className="text-start flex-1 min-w-0">
          <div className="font-medium text-sm">{c.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{c.goal || "—"} · {c.stage || "—"} · {c.member_count || 0} {isAr ? "عضو" : "members"} · {c.messages || 0} {isAr ? "رسالة" : "msgs"} · {c.is_closed ? (isAr ? "مغلق" : "Closed") : (isAr ? "مفتوح" : "Open")}</div>
        </button>
        <div className="flex gap-1.5">
          <button type="button" aria-label={c.is_closed ? (isAr ? "فتح المجتمع" : "Reopen community") : (isAr ? "إغلاق المجتمع" : "Close community")}
            title={c.is_closed ? (isAr ? "فتح المجتمع" : "Reopen community") : (isAr ? "إغلاق المجتمع" : "Close community")}
            onClick={() => {
              const closing = !c.is_closed;
              if (closing && !window.confirm(isAr ? "إغلاق المجتمع؟ الأعضاء هيقدروا يقرأوا الرسائل لكن مش هيقدروا يبعتوا." : "Close this community? Members will still be able to read, but cannot post.")) return;
              runAction(() => api.admin.put(`/communities/${c.id}`, { is_closed: closing }));
            }}
            className="p-2 rounded-lg bg-secondary/40 border border-border/60 hover:border-amber-500/40 transition">
            {c.is_closed ? <Unlock style={{ width: 14, height: 14 }} className="text-amber-400" /> : <Lock style={{ width: 14, height: 14 }} className="text-amber-400" />}
          </button>
          <button onClick={onEdit} className="p-2 rounded-lg bg-secondary/40 border border-border/60 hover:border-zeus-gold/40 transition"><Pencil style={{ width: 14, height: 14 }} className="text-muted-foreground" /></button>
          <button onClick={() => { if (window.confirm(isAr ? "حذف المجتمع ورسائله؟" : "Delete community + messages?")) runAction(() => api.admin.del(`/communities/${c.id}`)); }} className="p-2 rounded-lg bg-secondary/40 border border-border/60 hover:border-red-500/50 transition"><Trash2 style={{ width: 14, height: 14 }} className="text-red-400" /></button>
        </div>
      </div>
      {open && (
        <div className="mt-3 pt-3 border-t border-border/40 space-y-3">
          {(c.member_users || []).length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-muted-foreground mb-1.5">{isAr ? "الأعضاء" : "Members"}</div>
              <div className="space-y-1">
                {(c.member_users || []).map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-xs bg-secondary/30 rounded-lg px-3 py-2">
                    <span className="min-w-0 truncate font-semibold" dir="ltr">{m.email}</span>
                    <button onClick={() => {
                      if (window.confirm(isAr ? `تشيل ${m.email} من المجتمع؟` : `Remove ${m.email} from this community?`)) {
                        runAction(() => api.admin.del(`/communities/${c.id}/members/${m.id}`));
                      }
                    }}
                      className="text-red-400 hover:underline shrink-0 ms-2">{isAr ? "إزالة" : "Remove"}</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(c.suggested_members || []).length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-zeus-brightgold mb-1.5">{isAr ? "أعضاء مقترحون (من الـ DNA)" : "Suggested (from DNA)"}</div>
              <div className="space-y-1">
                {(c.suggested_members || []).map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 text-xs bg-zeus-gold/5 border border-zeus-gold/20 rounded-lg px-3 py-2">
                    <span className="truncate">{m.full_name || m.email} <span className="text-muted-foreground">· {m.reason}</span></span>
                    <button onClick={() => runAction(() => api.admin.post(`/communities/${c.id}/members`, { user_id: m.id }))}
                      className="px-3 py-1.5 rounded-full bg-zeus-gold text-zeus-midnight font-bold shrink-0 hover:bg-zeus-brightgold transition">
                      {isAr ? "أضف" : "Add"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(c.member_users || []).length === 0 && (c.suggested_members || []).length === 0 && (
            <p className="text-xs text-muted-foreground">{isAr ? "لا أعضاء ولا مقترحون بعد." : "No members or suggestions yet."}</p>
          )}
          <section className="border-t border-border/40 pt-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold">{isAr ? "رسائل المجتمع" : "Community messages"}</h4>
              <button type="button" onClick={loadMessages} disabled={messagesLoading}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 px-3 py-1.5 text-xs hover:border-zeus-gold/50 disabled:opacity-50">
                <RefreshCw style={{ width: 12, height: 12 }} className={messagesLoading ? "animate-spin" : ""} />
                {isAr ? "تحديث" : "Refresh"}
              </button>
            </div>
            {messageError && <p role="alert" className="text-xs text-rose-400">{messageError}</p>}
            <form onSubmit={sendAdminMessage} className="flex gap-2">
              <textarea value={messageText} onChange={(event) => setMessageText(event.target.value)} rows={2}
                placeholder={isAr ? "اكتب رسالة باسم الأدمن..." : "Write a message as admin..."}
                className="min-w-0 flex-1 resize-y rounded-xl border border-border/60 bg-card px-3 py-2 text-sm outline-none focus:zeus-gold-border" />
              <button type="submit" disabled={sending || !messageText.trim()}
                className="inline-flex items-center gap-1 self-end rounded-full bg-zeus-gold px-4 py-2 text-sm font-bold text-zeus-midnight disabled:opacity-50">
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send style={{ width: 14, height: 14 }} />}
                {isAr ? "إرسال" : "Send"}
              </button>
            </form>
            {messagesLoading && messages.length === 0 ? <Spin /> : (
              <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-xl bg-[#efeae2] p-3 pe-1 dark:bg-[#0b141a]"
                style={{ backgroundImage: "radial-gradient(circle, rgba(120, 120, 120, 0.10) 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
                {messages.map((message) => (
                  <article key={message.id} className={`flex ${message.is_admin ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[92%] rounded-lg px-3 py-2 shadow-sm sm:max-w-[82%] ${message.is_admin ? "bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]" : "bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]"}`}>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-semibold text-[11px]" dir="ltr">{message.user_email}</span>
                          {message.is_admin && <span className="ms-1.5 rounded-full bg-[#128c7e]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[#075e54] dark:text-[#25d366]">{isAr ? "الأدمن" : "Admin"}</span>}
                        </div>
                        <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => togglePinned(message)}
                          aria-label={message.is_pinned ? (isAr ? "إلغاء تثبيت الرسالة" : "Unpin message") : (isAr ? "تثبيت الرسالة" : "Pin message")}
                          title={message.is_pinned ? (isAr ? "إلغاء التثبيت" : "Unpin") : (isAr ? "تثبيت" : "Pin")}
                          className="rounded-md p-1 text-[#667781] hover:bg-black/5 hover:text-[#128c7e] dark:text-[#aebac1] dark:hover:bg-white/5 dark:hover:text-[#25d366]">
                          <Pin style={{ width: 13, height: 13 }} />
                        </button>
                        <button type="button" onClick={() => deleteMessage(message.id)} aria-label={isAr ? "حذف الرسالة" : "Delete message"}
                          className="rounded-md p-1 text-[#667781] hover:bg-red-500/10 hover:text-red-500 dark:text-[#aebac1]">
                          <Trash2 style={{ width: 13, height: 13 }} />
                        </button>
                      </div>
                    </div>
                      {message.is_pinned && <p className="mb-1 text-[10px] font-semibold text-[#128c7e] dark:text-[#25d366]">{isAr ? "📌 رسالة مثبتة" : "📌 Pinned message"}</p>}
                      <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{message.text}</p>
                      <div className="mt-1 flex items-center justify-end gap-2">
                        <time className="text-[10px] text-[#667781] dark:text-[#8696a0]">
                          {message.created_date ? new Date(message.created_date).toLocaleTimeString(isAr ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" }) : ""}
                        </time>
                      </div>
                    </div>
                  </article>
                ))}
                {!messagesLoading && messages.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">{isAr ? "لا توجد رسائل في المجتمع حتى الآن." : "No messages in this community yet."}</p>}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------------- Broadcast ---------------- */
function BroadcastTab({ isAr }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);
  const send = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setDone(null);
    try {
      const r = await api.admin.post("/broadcast", { title: title.trim(), body: body.trim(), action_url: url.trim() || undefined, action_label: url.trim() ? (isAr ? "افتح" : "Open") : undefined, user_email: target.trim() || undefined });
      setDone(r);
      setTitle(""); setBody(""); setUrl(""); setTarget("");
    } catch (err) {
      setDone({ error: err.message });
    }
    setSending(false);
  };
  return (
    <form onSubmit={send} className="zeus-glass p-5 space-y-3 max-w-2xl">
      <h3 className="font-heading font-bold text-sm flex items-center gap-1.5"><Megaphone style={{ width: 15, height: 15 }} className="text-zeus-gold" />{isAr ? "إشعار للمستخدمين" : "Notify users"}</h3>
      <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={isAr ? "إيميل أو اسم شخص معين (فاضي = الكل)" : "Specific email/name (empty = everyone)"} dir="ltr"
        className="w-full px-4 py-3 rounded-xl bg-card border border-zeus-gold/30 text-sm outline-none focus:zeus-gold-border" />
      <p className="text-[11px] text-muted-foreground">
        {isAr ? "لو الاسم متكرر، استخدم البريد الإلكتروني لتحديد الشخص بدقة." : "If a name matches multiple people, use the email address to target the right person."}
      </p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isAr ? "العنوان *" : "Title *"}
        className="w-full px-4 py-3 rounded-xl bg-card border border-border/60 text-sm outline-none focus:zeus-gold-border" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder={isAr ? "نص الإشعار *" : "Message *"}
        className="w-full px-4 py-3 rounded-xl bg-card border border-border/60 text-sm outline-none focus:zeus-gold-border resize-none" />
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={isAr ? "رابط (اختياري)" : "Link (optional)"} dir="ltr"
        className="w-full px-4 py-3 rounded-xl bg-card border border-border/60 text-sm outline-none focus:zeus-gold-border" />
      <button type="submit" disabled={sending} className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-zeus-gold text-zeus-midnight text-sm font-semibold hover:bg-zeus-brightgold transition disabled:opacity-50">
        {sending ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <Megaphone style={{ width: 15, height: 15 }} />}
        {target.trim() ? (isAr ? "إرسال للشخص" : "Send to person") : (isAr ? "إرسال للكل" : "Send to all")}
      </button>
      {done && !done.error && <p className="text-xs text-zeus-brightgold">{isAr ? `وصل ${done.sent} ${done.targeted ? "للشخص المحدد" : "مستخدم"} ✓` : `Sent to ${done.targeted ? "targeted user" : `${done.sent} users`} ✓`}</p>}
      {done && done.error && <p className="text-xs text-red-400">{done.error}</p>}
    </form>
  );
}

function Spin() {
  return <div className="flex justify-center py-16"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;
}

function AdminLoadError({ message, isAr, onRetry }) {
  return (
    <div className="zeus-glass space-y-3 rounded-2xl border border-rose-500/30 p-6 text-center">
      <p role="alert" className="text-sm text-rose-400">{message}</p>
      <button type="button" onClick={onRetry} className="rounded-full bg-zeus-gold px-4 py-2 text-sm font-semibold text-zeus-midnight">
        {isAr ? "إعادة المحاولة" : "Retry"}
      </button>
    </div>
  );
}

/* ---------------- Subscribers & Payments ---------------- */
function SubscribersTab({ isAr }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [actionId, setActionId] = useState(null);
  const [passwordResetUser, setPasswordResetUser] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.admin.get("/subscribers");
      setList(res || []);
    } catch (err) {
      setError(err.message || (isAr ? "تعذر تحميل الاشتراكات." : "Could not load subscriptions."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id) => {
    if (!window.confirm(isAr ? "تفعيل الاشتراك أو تمديده لمدة 30 يومًا إضافية؟" : "Activate this subscription or extend it by 30 days?")) return;
    setActionId(id);
    setError("");
    try {
      await api.admin.post(`/subscribers/${id}/approve`);
      await load();
    } catch (err) {
      setError(err.message || (isAr ? "تعذر تفعيل الاشتراك." : "Failed to approve the subscription."));
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (id) => {
    const reason = window.prompt(isAr ? "سبب الرفض (اختياري):" : "Reason for rejection (optional):");
    if (reason === null) return;
    setActionId(id);
    setError("");
    try {
      await api.admin.post(`/subscribers/${id}/reject`, { reason });
      await load();
    } catch (err) {
      setError(err.message || (isAr ? "تعذر رفض طلب الاشتراك." : "Failed to reject the subscription request."));
    } finally {
      setActionId(null);
    }
  };

  const handleEditAccountEmail = async (item) => {
    if (!item.user_id) {
      setError(isAr ? "لا يوجد حساب مرتبط بهذا الطلب حتى الآن." : "This request is not linked to an account yet.");
      return;
    }
    const email = window.prompt(isAr ? "أدخل البريد الإلكتروني الجديد للحساب:" : "Enter the new account email:", item.email);
    if (email === null || !email.trim()) return;
    setActionId(item.id);
    setError("");
    try {
      await api.admin.put(`/users/${item.user_id}`, { email: email.trim() });
      await load();
    } catch (editError) {
      setError(editError.message || (isAr ? "تعذر تعديل البريد الإلكتروني." : "Could not update the email."));
    } finally {
      setActionId(null);
    }
  };

  const handleStopSubscription = async (item) => {
    if (!item.user_id) return;
    const confirmed = window.confirm(
      isAr
        ? `إيقاف اشتراك ${item.email} الآن؟ سيتم تسجيل خروجه ومنعه من الدخول حتى تجديد الاشتراك.`
        : `Stop ${item.email}'s subscription now? They will be signed out and blocked until renewal.`,
    );
    if (!confirmed) return;
    setActionId(item.id);
    setError("");
    try {
      await api.admin.post(`/users/${item.user_id}/stop-subscription`);
      await load();
    } catch (stopError) {
      setError(stopError.message || (isAr ? "تعذر إيقاف الاشتراك." : "Could not stop the subscription."));
    } finally {
      setActionId(null);
    }
  };

  const filtered = list.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.user_name || "").toLowerCase().includes(q) ||
      (r.email || "").toLowerCase().includes(q) ||
      (r.phone || "").toLowerCase().includes(q) ||
      (r.plan || "").toLowerCase().includes(q)
    );
  });

  const pendingCount = list.filter((r) => r.status === "pending").length;
  const approvedCount = list.filter((r) => r.status === "approved" && r.is_active).length;
  const totalRevenue = list
    .filter((r) => r.status === "approved")
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  if (loading) return <Spin />;
  if (error && list.length === 0) {
    return <AdminLoadError message={error} isAr={isAr} onRetry={load} />;
  }

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">{error}</p>}
      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="zeus-glass p-4">
          <div className="text-xs text-muted-foreground mb-1">{isAr ? "إجمالي الطلبات" : "Total Requests"}</div>
          <div className="font-heading font-extrabold text-2xl text-foreground">{list.length}</div>
        </div>
        <div className="zeus-glass p-4 border-amber-500/30 bg-amber-500/5">
          <div className="text-xs text-amber-400 mb-1">{isAr ? "بانتظار المراجعة" : "Pending Review"}</div>
          <div className="font-heading font-extrabold text-2xl text-amber-400">{pendingCount}</div>
        </div>
        <div className="zeus-glass p-4 border-emerald-500/30 bg-emerald-500/5">
          <div className="text-xs text-emerald-400 mb-1">{isAr ? "اشتراكات نشطة" : "Active Subs"}</div>
          <div className="font-heading font-extrabold text-2xl text-emerald-400">{approvedCount}</div>
        </div>
        <div className="zeus-glass p-4 border-zeus-gold/30 bg-zeus-gold/5">
          <div className="text-xs text-zeus-brightgold mb-1">{isAr ? "إجمالي الإيرادات" : "Total Revenue"}</div>
          <div className="font-heading font-extrabold text-2xl text-zeus-brightgold">{totalRevenue} <span className="text-xs font-normal">EGP</span></div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? "بحث بالاسم، الإيميل، الهاتف، أو الخطة..." : "Search name, email, phone, or plan..."}
            className="w-full ps-10 pe-4 py-2.5 rounded-xl bg-card border border-border/60 text-sm outline-none focus:zeus-gold-border"
          />
        </div>
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "all", label: isAr ? "الكل" : "All" },
            { id: "pending", label: isAr ? "معلقة" : "Pending" },
            { id: "approved", label: isAr ? "مقبولة" : "Approved" },
            { id: "rejected", label: isAr ? "مرفوضة" : "Rejected" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                filter === f.id
                  ? "bg-zeus-gold text-zeus-midnight font-bold"
                  : "bg-secondary/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={load}
            title={isAr ? "تحديث" : "Refresh"}
            className="p-2 rounded-xl bg-secondary/40 border border-border/60 text-muted-foreground hover:text-zeus-gold transition shrink-0"
          >
            <RefreshCw style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>

      {/* Subscribers Table */}
      <div className="zeus-glass overflow-hidden rounded-2xl border border-border/60">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-secondary/50 text-muted-foreground border-b border-border/60">
              <tr>
                <th className="px-4 py-3 font-semibold text-start">{isAr ? "المستخدم" : "User"}</th>
                <th className="px-4 py-3 font-semibold text-start">{isAr ? "الخطة والمبلغ" : "Plan & Amount"}</th>
                <th className="px-4 py-3 font-semibold text-start">{isAr ? "هاتف الدفع" : "Payment Phone"}</th>
                <th className="px-4 py-3 font-semibold text-center">{isAr ? "إيصال التحويل" : "Receipt"}</th>
                <th className="px-4 py-3 font-semibold text-start">{isAr ? "الحالة والمدة" : "Status & Period"}</th>
                <th className="px-4 py-3 font-semibold text-start">{isAr ? "تاريخ الطلب" : "Submitted"}</th>
                <th className="px-4 py-3 font-semibold text-end">{isAr ? "إجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((item) => {
                const isPending = item.status === "pending";
                const isApproved = item.status === "approved";
                const isRejected = item.status === "rejected";

                let statusBadge = (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <Clock style={{ width: 11, height: 11 }} /> {isAr ? "قيد المراجعة" : "Pending"}
                  </span>
                );

                if (isApproved) {
                  if (item.is_expired) {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        <AlertCircle style={{ width: 11, height: 11 }} /> {isAr ? "منتهي الصلاحية" : "Expired"}
                      </span>
                    );
                  } else if (item.is_scheduled) {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                        <Clock style={{ width: 11, height: 11 }} /> {isAr ? "مجدول" : "Scheduled"}
                      </span>
                    );
                  } else if (!item.is_active) {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-secondary/60 text-muted-foreground border border-border/50">
                        <AlertCircle style={{ width: 11, height: 11 }} /> {isAr ? "غير فعال" : "Inactive"}
                      </span>
                    );
                  } else {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 style={{ width: 11, height: 11 }} /> {isAr ? "نشط ومفعل" : "Active"}
                      </span>
                    );
                  }
                } else if (isRejected) {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                      <XCircle style={{ width: 11, height: 11 }} /> {isAr ? "مرفوض" : "Rejected"}
                    </span>
                  );
                }

                const planColor =
                  item.plan === "PRIME"
                    ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                    : item.plan === "PRO"
                    ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                    : "bg-amber-500/15 text-amber-400 border-amber-500/30";

                return (
                  <tr key={item.id} className="hover:bg-secondary/20 transition-colors">
                    {/* User */}
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-foreground text-sm">{item.user_name || "—"}</div>
                      <div className="text-muted-foreground text-xs">{item.email}</div>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] ${
                        item.user_account_status === "not_registered"
                          ? "bg-secondary/60 text-muted-foreground"
                          : item.user_account_status === "pending"
                            ? "bg-orange-500/15 text-orange-400"
                            : item.user_account_status === "suspended"
                              ? "bg-red-500/15 text-red-400"
                              : "bg-emerald-500/15 text-emerald-400"
                      }`}>
                        {item.user_account_status === "not_registered"
                          ? (isAr ? "لا يوجد حساب" : "Not registered")
                          : item.user_account_status === "pending"
                            ? (isAr ? "الحساب بانتظار التفعيل" : "Account pending")
                            : item.user_account_status === "suspended"
                              ? (isAr ? "الحساب موقوف" : "Account suspended")
                              : (isAr ? "حساب مسجل" : "Registered account")}
                      </span>
                      {item.notes && (
                        <div className="mt-1 text-[11px] text-muted-foreground/80 bg-secondary/30 p-1.5 rounded-lg max-w-xs">
                          <span className="font-semibold">{isAr ? "ملاحظة: " : "Note: "}</span>
                          {item.notes}
                        </div>
                      )}
                    </td>

                    {/* Plan */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${planColor}`}>
                          {item.plan}
                        </span>
                        <span className="font-bold text-foreground">{item.amount} EGP</span>
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="px-4 py-3.5 font-mono text-xs text-foreground/90">
                      {item.phone || "—"}
                    </td>

                    {/* Payment Receipt Image */}
                    <td className="px-4 py-3.5 text-center">
                      {item.payment_image_url ? (
                        <button
                          type="button"
                          onClick={() => setSelectedReceipt(item.payment_image_url)}
                          className="relative group inline-block rounded-lg overflow-hidden border border-border/80 hover:border-zeus-gold transition"
                        >
                          <img
                            src={item.payment_image_url}
                            alt="Receipt"
                            className="w-12 h-12 object-cover transition-transform group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Eye style={{ width: 14, height: 14 }} className="text-white" />
                          </div>
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      )}
                    </td>

                    {/* Status & Period */}
                    <td className="px-4 py-3.5">
                      <div className="space-y-1">
                        <div>{statusBadge}</div>
                        {isApproved && item.start_date && (
                          <div className="text-[11px] text-muted-foreground">
                            <div>{isAr ? "البداية: " : "Start: "}{item.start_date.slice(0, 10)}</div>
                            <div>{isAr ? "الانتهاء: " : "Expires: "}{item.expires_at ? item.expires_at.slice(0, 10) : "—"}</div>
                            <div className={`font-semibold ${item.is_expired ? "text-rose-400" : item.is_active ? "text-emerald-400" : "text-muted-foreground"}`}>
                              {item.is_expired
                                ? (isAr ? "منتهي" : "Expired")
                                : item.is_scheduled
                                  ? (isAr ? `يبدأ بعد ${item.starts_in_days} يوم` : `Starts in ${item.starts_in_days} days`)
                                : item.is_active
                                  ? (isAr ? `متبقي ${item.remaining_days} يوم` : `${item.remaining_days} days left`)
                                  : (isAr ? "الحساب أو الباقة غير فعالين" : "Account or plan is inactive")}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Submitted Date */}
                    <td className="px-4 py-3.5 text-muted-foreground text-[11px]">
                      {item.created_date ? item.created_date.slice(0, 16).replace("T", " ") : "—"}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.user_id && (
                          <>
                            <button type="button" onClick={() => handleEditAccountEmail(item)} disabled={actionId === item.id}
                              title={isAr ? "تعديل بريد الحساب" : "Edit account email"}
                              className="rounded-lg border border-border/60 bg-secondary/40 p-2 text-muted-foreground hover:text-foreground disabled:opacity-50">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => setPasswordResetUser({ id: item.user_id, email: item.email })} disabled={actionId === item.id}
                              title={isAr ? "إعادة تعيين كلمة المرور" : "Reset account password"}
                              className="rounded-lg border border-border/60 bg-secondary/40 p-2 text-muted-foreground hover:text-foreground disabled:opacity-50">
                              <KeyRound className="h-3.5 w-3.5" />
                            </button>
                            {item.is_active && (
                              <button type="button" onClick={() => handleStopSubscription(item)} disabled={actionId === item.id}
                                title={isAr ? "إيقاف الاشتراك وتسجيل خروج المستخدم" : "Stop subscription and sign the user out"}
                                className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20 disabled:opacity-50">
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </>
                        )}
                        {isPending && (
                          <>
                            <button
                              onClick={() => handleApprove(item.id)}
                              disabled={actionId === item.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs transition disabled:opacity-50"
                            >
                              {actionId === item.id ? <Loader2 className="animate-spin w-3 h-3" /> : <Check style={{ width: 12, height: 12 }} />}
                              {isAr ? "موافقة وتفعيل" : "Approve"}
                            </button>
                            <button
                              onClick={() => handleReject(item.id)}
                              disabled={actionId === item.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 font-medium text-xs transition disabled:opacity-50"
                            >
                              <X style={{ width: 12, height: 12 }} />
                              {isAr ? "رفض" : "Reject"}
                            </button>
                          </>
                        )}
                        {!isPending && (
                          <button
                            onClick={() => handleApprove(item.id)}
                            disabled={actionId === item.id}
                            title={isAr ? "تجديد / تمديد الاشتراك 30 يوم" : "Re-activate 30 days"}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary/50 border border-border/60 hover:border-zeus-gold/40 text-muted-foreground hover:text-foreground text-xs transition"
                          >
                            <RefreshCw style={{ width: 11, height: 11 }} />
                            {isAr ? "تمديد 30 يوم" : "Renew 30d"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {isAr ? "لا توجد طلبات اشتراك مطابقة" : "No subscription requests found"}
          </div>
        )}
      </div>

      {/* Receipt Image Modal */}
      {selectedReceipt && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedReceipt(null)}
        >
          <div
            className="relative max-w-2xl max-h-[90vh] bg-card rounded-2xl border border-border/80 overflow-hidden p-2 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-2 border-b border-border/60">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <CreditCard style={{ width: 14, height: 14 }} className="text-zeus-gold" />
                {isAr ? "إيصال التحويل البنكي / المحفظة" : "Payment Transfer Receipt"}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={selectedReceipt}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition"
                  title={isAr ? "فتح في نافذة جديدة" : "Open in new window"}
                >
                  <ExternalLink style={{ width: 14, height: 14 }} />
                </a>
                <button
                  onClick={() => setSelectedReceipt(null)}
                  className="p-1 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition"
                >
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>
            </div>
            <div className="p-2 overflow-auto flex items-center justify-center">
              <img
                src={selectedReceipt}
                alt="Receipt Full Preview"
                className="max-w-full max-h-[75vh] object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
      {passwordResetUser && (
        <PasswordResetModal
          user={passwordResetUser}
          isAr={isAr}
          onClose={() => setPasswordResetUser(null)}
          onSave={async (password) => {
            await api.admin.put(`/users/${passwordResetUser.id}`, { password });
            await load();
            setPasswordResetUser(null);
          }}
        />
      )}
    </div>
  );
}

function SupportTab({ isAr }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState("");
  const statusLabels = {
    open: isAr ? "جديد" : "Open",
    in_progress: isAr ? "قيد المتابعة" : "In progress",
    resolved: isAr ? "تم الحل" : "Resolved",
    closed: isAr ? "مغلق" : "Closed",
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setRequests(await api.admin.get("/support-requests"));
    } catch (err) {
      setError(err.message || (isAr ? "تعذر تحميل طلبات الدعم." : "Could not load support requests."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (requestId, status) => {
    setUpdating(requestId);
    setError("");
    try {
      const updated = await api.admin.put(`/support-requests/${requestId}`, { status });
      setRequests((items) => items.map((item) => item.id === requestId ? updated : item));
    } catch (err) {
      setError(err.message || (isAr ? "تعذر تحديث حالة الطلب." : "Could not update request status."));
    } finally {
      setUpdating("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold"><LifeBuoy className="h-5 w-5 text-zeus-gold" />{isAr ? "طلبات الدعم" : "Support requests"}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{isAr ? "طلبات المستخدمين المرسلة من نموذج الدعم في الموقع." : "Requests submitted through the support form across the site."}</p>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-2 text-xs hover:border-zeus-gold/60">
          <RefreshCw className="h-3.5 w-3.5" />{isAr ? "تحديث" : "Refresh"}
        </button>
      </div>
      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">{error}</p>}
      {loading ? <Spin /> : requests.length === 0 ? (
        <div className="zeus-glass rounded-2xl p-8 text-center text-sm text-muted-foreground">{isAr ? "مفيش طلبات دعم لسه." : "No support requests yet."}</div>
      ) : (
        <div className="space-y-3">
          {requests.map((item) => (
            <article key={item.id} className="zeus-glass space-y-4 rounded-2xl border border-border/60 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <a href={`mailto:${item.email}`} className="font-semibold text-zeus-brightgold hover:underline">{item.email}</a>
                  <a href={`tel:${item.phone}`} dir="ltr" className="block w-fit text-muted-foreground hover:text-foreground">{item.phone}</a>
                  <time className="block text-[11px] text-muted-foreground" dateTime={item.created_date}>
                    {new Date(item.created_date).toLocaleString(isAr ? "ar-EG" : "en-US")}
                  </time>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{isAr ? "الحالة" : "Status"}</span>
                  <select
                    value={item.status}
                    disabled={updating === item.id}
                    onChange={(event) => updateStatus(item.id, event.target.value)}
                    className="rounded-lg border border-border/60 bg-background px-2.5 py-2 text-xs outline-none focus:border-zeus-gold disabled:opacity-50"
                    aria-label={isAr ? `حالة طلب ${item.email}` : `Status for ${item.email}`}
                  >
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>
              <p className="whitespace-pre-wrap break-words rounded-xl bg-secondary/30 p-3 text-sm leading-relaxed">{item.problem}</p>
              {item.attachments?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {item.attachments.map((attachment, index) => (
                    <a key={`${attachment}-${index}`} href={attachment} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-border/60">
                      <img src={attachment} alt={`${isAr ? "مرفق" : "Attachment"} ${index + 1}`} className="h-24 w-24 object-cover transition hover:scale-105" />
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Platform Settings (Pricing, AI Models, YouTube API, External Services) ---------------- */
function SettingsTab({ isAr }) {
  const secretFields = ["groq_api_key", "gemini_api_key", "openai_api_key", "youtube_api_key"];
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [savedSecretHints, setSavedSecretHints] = useState(
    Object.fromEntries(secretFields.map((field) => [field, ""]))
  );
  const [aiStatus, setAiStatus] = useState(null);
  const [clearSecrets, setClearSecrets] = useState([]);
  const [testingProvider, setTestingProvider] = useState("");
  const [testResults, setTestResults] = useState({});

  const [form, setForm] = useState({
    starter_price: 99,
    pro_price: 199,
    prime_price: 399,
    currency: "EGP",
    subscription_contact_email: "zeus.eduai@gmail.com",
    starter_description_ar: "خطة البداية الأساسية لرحلة التعلم المخصصة والذكية.",
    starter_description_en: "The essential plan for your personalized learning journey.",
    starter_features_ar: "إنشاء خريطة تعلم مخصصة بالكامل لخبرتك وأهدافك\nعرض خارطة الطريق والجدول الدراسي\nالمساعد الذكي ZEUS",
    starter_features_en: "Create a personalized learning roadmap\nView the roadmap and study schedule\nZEUS AI assistant",
    pro_description_ar: "الخطة الاحترافية للتطبيق العملي واختبار المعرفة خطوة بخطوة.",
    pro_description_en: "A professional plan for hands-on practice and learning assessments.",
    pro_features_ar: "كل مميزات باقة STARTER\nفتح الدروس ومحتواها وفيديوهاتها\nاختبار من 30 سؤالًا بعد كل درس، والنجاح من 80%\nمشروع عملي شامل بعد كل مرحلة ومتابعة التقدم",
    pro_features_en: "Everything in STARTER\nUnlock lessons, learning content, and videos\n30-question quiz after each lesson; 80% required to pass\nA hands-on project after every stage and learning progress",
    prime_description_ar: "الخطة الشاملة للتأهيل والجاهزية لسوق العمل والتوظيف.",
    prime_description_en: "The complete plan for career preparation and job readiness.",
    prime_features_ar: "كل مميزات باقة PRO\nالملف الشخصي والشهادات\nبحث واقتراحات وظائف ذكية تطابق مجالك وخبرتك\nالانضمام لمجتمع المتخصصين والزملاء في مجالك\nأداة بناء وتحسين السيرة الذاتية الاحترافية (CV)\nأداة بناء وعرض البورتفوليو العام لمشاريعك",
    prime_features_en: "Everything in PRO\nProfile and certificates\nJob search/recommendations relevant to your field\nAccess to a community related to your field\nCV builder\nPublic portfolio builder",
    gemini_api_key: "",
    gemini_model: "gemini-3.8-flash",
    openai_api_key: "",
    openai_model: "gpt-4o-mini",
    groq_api_key: "",
    groq_model: "openai/gpt-oss-20b",
    ai_task_routes: {},
    youtube_api_key: "",
    facebook_url: "",
    linkedin_url: "",
    instagram_url: "",
    tiktok_url: "",
    whatsapp_url: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const [data, status] = await Promise.all([
        api.admin.get("/settings"),
        api.admin.get("/settings/ai-status"),
      ]);
      setLoadError(false);
      setAiStatus(status);
      if (data) {
        setSavedSecretHints(Object.fromEntries(secretFields.map((field) => [field, data[field] || ""])));
        setForm((prev) => ({
          ...prev,
          ...data,
          ...Object.fromEntries(secretFields.map((field) => [field, ""])),
          ai_task_routes: status.task_assignments || {},
          starter_price: data.starter_price ?? 99,
          pro_price: data.pro_price ?? 199,
          prime_price: data.prime_price ?? 399,
          currency: data.currency ?? "EGP",
          subscription_contact_email: data.subscription_contact_email || "zeus.eduai@gmail.com",
          ...Object.fromEntries(["starter", "pro", "prime"].flatMap((plan) => {
            const description = data[`${plan}_description`] || {};
            const features = data[`${plan}_features`] || [];
            return [
              [`${plan}_description_ar`, description.ar || prev[`${plan}_description_ar`]],
              [`${plan}_description_en`, description.en || prev[`${plan}_description_en`]],
              [`${plan}_features_ar`, features.length ? features.map((item) => item.ar).join("\n") : prev[`${plan}_features_ar`]],
              [`${plan}_features_en`, features.length ? features.map((item) => item.en).join("\n") : prev[`${plan}_features_en`]],
            ];
          })),
        }));
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
      setLoadError(true);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg("");
    setErrorMsg("");
    try {
      const plansPayload = {};
      for (const plan of ["starter", "pro", "prime"]) {
        const arabicFeatures = form[`${plan}_features_ar`].split("\n").map((item) => item.trim()).filter(Boolean);
        const englishFeatures = form[`${plan}_features_en`].split("\n").map((item) => item.trim()).filter(Boolean);
        if (arabicFeatures.length !== englishFeatures.length || arabicFeatures.length === 0) {
          throw new Error(isAr
            ? `تأكد من تطابق عدد المميزات بالعربية والإنجليزية في باقة ${plan.toUpperCase()}`
            : `Enter the same non-empty number of Arabic and English features for ${plan.toUpperCase()}`);
        }
        plansPayload[`${plan}_description`] = {
          ar: form[`${plan}_description_ar`],
          en: form[`${plan}_description_en`],
        };
        plansPayload[`${plan}_features`] = arabicFeatures.map((ar, index) => ({ ar, en: englishFeatures[index] }));
      }
      const { ai_task_routes: _legacyAiRoutes, ...platformForm } = form;
      const saved = await api.admin.put("/settings", {
        ...platformForm,
        ...plansPayload,
        clear_secrets: clearSecrets,
      });
      window.dispatchEvent(new Event("zeus-social-links-updated"));
      setSavedSecretHints(Object.fromEntries(secretFields.map((field) => [field, saved.settings?.[field] || ""])));
      setForm((prev) => ({
        ...prev,
        ...Object.fromEntries(secretFields.map((field) => [field, ""])),
      }));
      setClearSecrets([]);
      setSuccessMsg(isAr ? "تم حفظ جميع الإعدادات بنجاح في قاعدة البيانات وتحديث النظام فوراً ✓" : "Settings saved successfully to database and synced immediately ✓");
      setTimeout(() => setSuccessMsg(""), 5000);
      try {
        setAiStatus(await api.admin.get("/settings/ai-status"));
      } catch (err) {
        setErrorMsg(err.message || (isAr ? "تم الحفظ لكن تعذر تحديث حالة المزودين" : "Settings saved, but provider status could not be refreshed"));
      }
    } catch (err) {
      setErrorMsg(err.message || (isAr ? "فشل حفظ الإعدادات" : "Failed to save settings"));
    }
    setSaving(false);
  };

  const testProvider = async (provider, model, resultKey = provider) => {
    setTestingProvider(resultKey);
    setTestResults((prev) => ({ ...prev, [resultKey]: null }));
    try {
      const result = await api.admin.post("/settings/test-provider", {
        provider,
        ...(model ? { model } : {}),
        language: isAr ? "ar" : "en",
      });
      setTestResults((prev) => ({ ...prev, [resultKey]: result }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [resultKey]: { success: false, message: err.message || (isAr ? "فشل اختبار الاتصال" : "Provider test failed") },
      }));
    } finally {
      setTestingProvider("");
    }
  };

  const applySuggestedModel = (resultKey, model) => {
    if (resultKey.startsWith("task:")) {
      const task = resultKey.slice("task:".length);
      setForm((prev) => ({
        ...prev,
        ai_task_routes: {
          ...prev.ai_task_routes,
          [task]: {
            ...(prev.ai_task_routes?.[task] || aiStatus?.task_assignments?.[task] || {}),
            model,
          },
        },
      }));
      return;
    }

    const provider = providerFields.find((item) => item.id === resultKey);
    if (provider) {
      setForm((prev) => ({ ...prev, [provider.model]: model }));
    }
  };

  const toggleSecretClear = (field) => {
    const isMarked = clearSecrets.includes(field);
    setClearSecrets((prev) => isMarked ? prev.filter((key) => key !== field) : [...prev, field]);
    if (!isMarked) setForm((prev) => ({ ...prev, [field]: "" }));
  };

  const providerFields = [
    { id: "groq", title: "Groq", url: "https://console.groq.com", key: "groq_api_key", model: "groq_model", placeholder: "gsk_...", modelPlaceholder: "openai/gpt-oss-20b", assignment: isAr ? "لن يعمل إلا بعد تعيينه لمهمة" : "Inactive until assigned to a task" },
    { id: "openai", title: "OpenAI", url: "https://platform.openai.com", key: "openai_api_key", model: "openai_model", placeholder: "sk-proj-...", modelPlaceholder: "gpt-4o-mini", assignment: isAr ? "عيّن المهام والموديلات من القائمة أدناه" : "Assign tasks and models below" },
    { id: "gemini", title: "Google Gemini", url: "https://aistudio.google.com", key: "gemini_api_key", model: "gemini_model", placeholder: "AIzaSy...", modelPlaceholder: "gemini-3.8-flash", assignment: isAr ? "عيّن المهام والموديلات من القائمة أدناه" : "Assign tasks and models below" },
  ];

  if (loading) return <Spin />;
  if (loadError) return (
    <div className="zeus-glass p-6 rounded-2xl border border-rose-500/30 max-w-4xl text-center">
      <p className="text-sm text-muted-foreground mb-4">
        {isAr ? "تعذر تحميل الإعدادات. لم يتم تفعيل الحفظ لتجنب الكتابة فوق إعداداتك." : "Settings could not be loaded. Saving is disabled to avoid overwriting existing values."}
      </p>
      <button type="button" onClick={load} className="px-4 py-2 rounded-full bg-zeus-gold text-zeus-midnight text-sm font-semibold">
        {isAr ? "إعادة المحاولة" : "Retry"}
      </button>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {/* Pricing Configuration */}
      <div className="zeus-glass p-5 rounded-2xl border border-border/60 space-y-4">
        <div className="flex items-center gap-2 border-b border-border/40 pb-3">
          <DollarSign className="text-zeus-gold" style={{ width: 20, height: 20 }} />
          <div>
            <h3 className="font-heading font-bold text-base text-foreground">
              {isAr ? "أسعار باقات الاشتراكات (ديناميكية)" : "Subscription Pricing Configuration"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr ? "الأسعار المعروضة للمستخدمين تؤخذ مباشرة من هنا ولا توجد قيم ثابتة في الكود." : "Dynamic pricing rendered across all public subscription pages from database."}
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              STARTER ({form.currency}/mo)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.starter_price}
              onChange={(e) => setForm({ ...form, starter_price: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-card border border-border/60 text-sm font-bold text-foreground outline-none focus:zeus-gold-border"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              PRO ({form.currency}/mo)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.pro_price}
              onChange={(e) => setForm({ ...form, pro_price: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-card border border-border/60 text-sm font-bold text-foreground outline-none focus:zeus-gold-border"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              PRIME ({form.currency}/mo)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.prime_price}
              onChange={(e) => setForm({ ...form, prime_price: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-card border border-border/60 text-sm font-bold text-foreground outline-none focus:zeus-gold-border"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              {isAr ? "العملة" : "Currency Code"}
            </label>
            <input
              type="text"
              maxLength={3}
              pattern="[A-Za-z]{3}"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-card border border-border/60 text-sm font-bold text-foreground outline-none focus:zeus-gold-border uppercase"
              required
            />
          </div>
        </div>
      </div>

      <div className="zeus-glass p-5 rounded-2xl border border-border/60 space-y-4">
        <div>
          <h3 className="font-heading font-bold text-base">{isAr ? "تفاصيل الباقات وبريد التواصل" : "Plan Details & Contact Email"}</h3>
          <p className="text-xs text-muted-foreground mt-1">{isAr ? "تظهر التعديلات مباشرة في صفحة الاشتراكات. اكتب كل ميزة في سطر، وبنفس الترتيب باللغتين." : "Changes appear on the subscriptions page. Enter one feature per line, in matching Arabic and English order."}</p>
        </div>
        <label className="block text-xs font-semibold">
          {isAr ? "بريد التواصل الظاهر للمستخدمين" : "Subscription contact email"}
          <input type="email" required maxLength={254} value={form.subscription_contact_email}
            onChange={(e) => setForm({ ...form, subscription_contact_email: e.target.value })}
            className="mt-1 w-full px-3.5 py-2.5 rounded-xl bg-card border border-border/60 text-sm outline-none focus:zeus-gold-border" />
        </label>
        {["starter", "pro", "prime"].map((plan) => (
          <section key={plan} className="rounded-xl bg-secondary/20 border border-border/50 p-4 space-y-3">
            <h4 className="text-sm font-bold">{plan.toUpperCase()}</h4>
            <div className="grid sm:grid-cols-2 gap-3">
              {["ar", "en"].map((language) => (
                <div key={`${plan}-description-${language}`}>
                  <label className="block text-xs font-semibold mb-1">{isAr ? `وصف الباقة (${language === "ar" ? "عربي" : "إنجليزي"})` : `${plan.toUpperCase()} description (${language})`}</label>
                  <textarea rows={2} maxLength={500} required value={form[`${plan}_description_${language}`]}
                    onChange={(e) => setForm({ ...form, [`${plan}_description_${language}`]: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-card border border-border/60 text-xs outline-none focus:zeus-gold-border resize-y" />
                  <label className="block text-xs font-semibold mt-3 mb-1">{isAr ? `المميزات سطر لكل ميزة (${language === "ar" ? "عربي" : "إنجليزي"})` : `Features, one per line (${language})`}</label>
                  <textarea rows={5} maxLength={3000} required value={form[`${plan}_features_${language}`]}
                    onChange={(e) => setForm({ ...form, [`${plan}_features_${language}`]: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-card border border-border/60 text-xs outline-none focus:zeus-gold-border resize-y" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Link to="/admin/ai-settings" className="flex items-center justify-between gap-3 rounded-2xl border border-zeus-gold/30 bg-zeus-gold/5 p-4 transition hover:border-zeus-gold/60">
        <span>
          <span className="block text-sm font-bold">{isAr ? "إعدادات الذكاء الاصطناعي وYouTube" : "AI & YouTube settings"}</span>
          <span className="mt-1 block text-xs text-muted-foreground">{isAr ? "افتح الصفحة المستقلة لإعداد المهام والمفاتيح والمراجع." : "Open the separate page to configure tasks, API keys, and reviewer."}</span>
        </span>
        <Sparkles className="h-5 w-5 shrink-0 text-zeus-gold" />
      </Link>

      {/* Legacy AI settings are retained for backward compatibility but configured on the dedicated page. */}
      <div className="hidden">
        <div className="flex items-center gap-2 border-b border-border/40 pb-3">
          <Sparkles className="text-zeus-gold" style={{ width: 20, height: 20 }} />
          <div>
            <h3 className="font-heading font-bold text-base text-foreground">
              {isAr ? "مزودي ونماذج الذكاء الاصطناعي (AI Orchestration)" : "AI Providers & Model Configurations"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr ? "المفاتيح محفوظة على الخادم ولا تظهر كاملة في المتصفح. تغييراتك تُستخدم فوراً في كل الطلبات." : "Keys stay on the server and are never shown in full. Saved changes apply immediately to new requests."}
            </p>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {providerFields.map((provider) => {
            const configured = aiStatus?.providers?.[provider.id]?.configured;
            const result = testResults[provider.id];
            return (
              <div key={provider.id} className="p-3.5 rounded-xl bg-secondary/30 border border-border/60 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-foreground">{provider.title} <span className="ml-1 text-[10px] text-muted-foreground font-normal">{provider.assignment}</span></div>
                    <a href={provider.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground hover:text-zeus-brightgold">{provider.url}</a>
                  </div>
                  <span className={`text-[10px] font-semibold ${configured ? "text-emerald-400" : "text-muted-foreground"}`}>
                    {configured ? (isAr ? "مفتاح محفوظ" : "Key configured") : (isAr ? "غير مضبوط" : "Not configured")}
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={form[provider.key] || ""}
                    onChange={(e) => setForm({ ...form, [provider.key]: e.target.value })}
                    placeholder={savedSecretHints[provider.key] ? `${savedSecretHints[provider.key]} saved — paste to replace` : provider.placeholder}
                    aria-label={`${provider.title} API key`}
                    className="px-3 py-2 rounded-lg bg-card border border-border/60 text-xs font-mono outline-none focus:zeus-gold-border"
                  />
                  <input
                    type="text"
                    value={form[provider.model] || ""}
                    onChange={(e) => setForm({ ...form, [provider.model]: e.target.value })}
                    placeholder={provider.modelPlaceholder}
                    aria-label={`${provider.title} model`}
                    className="px-3 py-2 rounded-lg bg-card border border-border/60 text-xs font-mono outline-none focus:zeus-gold-border"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => testProvider(provider.id, form[provider.model])} disabled={testingProvider === provider.id || !configured} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 text-[11px] font-semibold hover:border-zeus-gold/60 disabled:opacity-50">
                    {testingProvider === provider.id && <Loader2 className="w-3 h-3 animate-spin" />}
                    {isAr ? "اختبار الاتصال" : "Test connection"}
                  </button>
                  {configured && (
                    <button type="button" onClick={() => toggleSecretClear(provider.key)} className={`text-[11px] ${clearSecrets.includes(provider.key) ? "text-rose-400 font-bold" : "text-muted-foreground hover:text-rose-400"}`}>
                      {clearSecrets.includes(provider.key) ? (isAr ? "سيتم حذف المفتاح عند الحفظ" : "Key will be cleared on save") : (isAr ? "حذف المفتاح" : "Clear key")}
                    </button>
                  )}
                  {result && <span className={`inline-flex items-center gap-1 text-[11px] ${result.success ? "text-emerald-400" : "text-rose-400"}`}>
                    {result.success ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {result.message}
                  </span>}
                  {result?.suggested_model && (
                    <button
                      type="button"
                      onClick={() => applySuggestedModel(provider.id, result.suggested_model)}
                      className="rounded-full border border-amber-500/40 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/10"
                    >
                      {isAr ? `استخدم الموديل المقترح: ${result.suggested_model}` : `Use suggested model: ${result.suggested_model}`}
                    </button>
                  )}
                  {result?.available_models?.length > 0 && (
                    <div className="basis-full text-[11px] text-muted-foreground">
                      {isAr
                        ? "قائمة Google للموديلات الداعمة للطلب (قد لا تكون كلها مفعّلة لهذا المفتاح):"
                        : "Google's generation-capable model list (not all may be enabled for this key):"}{" "}
                      <span className="font-mono text-foreground/80">
                        {result.available_models.join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2 space-y-3">
          <div className="text-xs font-bold">{isAr ? "اختيار المزوّد والموديل لكل مهمة" : "Choose a provider and model for each task"}</div>
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(aiStatus?.task_assignments || {}).map(([task, assignment]) => {
              const route = form.ai_task_routes?.[task] || assignment;
              return (
                <div key={task} className="grid gap-2 rounded-xl border border-border/50 bg-secondary/20 p-3">
                  <div className="text-xs font-semibold">{AI_TASK_LABELS[task]?.[isAr ? "ar" : "en"] || task}</div>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-2">
                    <select
                      value={route.provider}
                      onChange={(event) => {
                        const provider = event.target.value;
                        setForm((prev) => ({
                          ...prev,
                          ai_task_routes: {
                            ...prev.ai_task_routes,
                            [task]: { provider, model: aiStatus?.providers?.[provider]?.model || "" },
                          },
                        }));
                      }}
                      aria-label={`${AI_TASK_LABELS[task]?.en || task} provider`}
                      className="min-w-0 rounded-lg border border-border/60 bg-card px-2.5 py-2 text-xs"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="gemini">Google Gemini</option>
                      <option value="groq">Groq</option>
                    </select>
                    <input
                      type="text"
                      maxLength={120}
                      value={route.model}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        ai_task_routes: {
                          ...prev.ai_task_routes,
                          [task]: { ...(prev.ai_task_routes?.[task] || assignment), model: event.target.value },
                        },
                      }))}
                      aria-label={`${AI_TASK_LABELS[task]?.en || task} model`}
                      placeholder={isAr ? "اسم الموديل" : "Model name"}
                      className="min-w-0 rounded-lg border border-border/60 bg-card px-2.5 py-2 text-xs font-mono"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => testProvider(route.provider, route.model, `task:${task}`)}
                      disabled={
                        testingProvider === `task:${task}`
                        || !aiStatus?.providers?.[route.provider]?.configured
                        || !route.model?.trim()
                      }
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-[11px] font-semibold hover:border-zeus-gold/60 disabled:opacity-50"
                    >
                      {testingProvider === `task:${task}` && <Loader2 className="h-3 w-3 animate-spin" />}
                      {isAr ? "اختبار الموديل المحدد" : "Test selected model"}
                    </button>
                    {testResults[`task:${task}`] && (
                      <span className={`inline-flex items-center gap-1 text-[11px] ${testResults[`task:${task}`].success ? "text-emerald-400" : "text-rose-400"}`}>
                        {testResults[`task:${task}`].success
                          ? <CheckCircle2 className="h-3 w-3" />
                          : <XCircle className="h-3 w-3" />}
                        {testResults[`task:${task}`].message}
                      </span>
                    )}
                    {testResults[`task:${task}`]?.suggested_model && (
                      <button
                        type="button"
                        onClick={() => applySuggestedModel(`task:${task}`, testResults[`task:${task}`].suggested_model)}
                        className="rounded-full border border-amber-500/40 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/10"
                      >
                        {isAr
                          ? `استخدم الموديل المقترح: ${testResults[`task:${task}`].suggested_model}`
                          : `Use suggested model: ${testResults[`task:${task}`].suggested_model}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {isAr
              ? "التوزيع الحالي هو الافتراضي. Groq غير مستخدم في أي مهمة إلا بعد تعيينه وحفظ الإعدادات."
              : "The current assignments are defaults. Groq is not used for any task until you assign it and save."}
          </p>
        </div>
      </div>

      {/* YouTube keys are configured on the dedicated AI settings page. */}
      <div className="hidden">
        <div className="flex items-center gap-2 border-b border-border/40 pb-3">
          <Key className="text-zeus-gold" style={{ width: 20, height: 20 }} />
          <div>
            <h3 className="font-heading font-bold text-base text-foreground">
              {isAr ? "مفتاح YouTube Data API v3" : "YouTube Data API v3 Key"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? "تستخدم لجلب الفيديوهات من YouTube والتحقق منها تلقائياً وحساب مدة الدراسة بناءً على ساعاتك اليومية."
                : "Used to fetch, validate YouTube videos, and dynamically calculate study duration based on daily hours."}
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">
            YouTube Data API v3 Key
          </label>
          <input
            type="password"
            value={form.youtube_api_key || ""}
            onChange={(e) => setForm({ ...form, youtube_api_key: e.target.value })}
            placeholder={savedSecretHints.youtube_api_key ? `${savedSecretHints.youtube_api_key} saved — paste to replace` : "AIzaSy... (Required for video search & duration calculation)"}
            className="w-full px-3.5 py-2.5 rounded-xl bg-card border border-border/60 text-xs font-mono outline-none focus:zeus-gold-border"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            {isAr
              ? "احصل على مفتاحك المجاني من console.cloud.google.com → YouTube Data API v3"
              : "Get your free key from console.cloud.google.com → YouTube Data API v3 → Enable → Create Credentials"}
          </p>
        </div>
      </div>

      <div className="zeus-glass space-y-4 rounded-2xl border border-border/60 p-5">
        <div className="flex items-center gap-2 border-b border-border/40 pb-3">
          <ExternalLink className="h-5 w-5 text-zeus-gold" />
          <div>
            <h3 className="font-heading text-base font-bold">{isAr ? "روابط حسابات ZEUS" : "ZEUS social links"}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{isAr ? "أضف الروابط التي تريد إظهارها كأيقونات في فوتر كل الصفحات. اترك الحقل فارغاً لإخفاء الأيقونة." : "These links appear as icons in the footer on every page. Leave a field blank to hide that icon."}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { key: "facebook_url", label: "Facebook", Icon: Facebook, placeholder: "https://facebook.com/your-page" },
            { key: "linkedin_url", label: "LinkedIn", Icon: Linkedin, placeholder: "https://linkedin.com/company/your-page" },
            { key: "instagram_url", label: "Instagram", Icon: Instagram, placeholder: "https://instagram.com/your-account" },
            { key: "tiktok_url", label: "TikTok", Icon: Music2, placeholder: "https://tiktok.com/@your-account" },
            { key: "whatsapp_url", label: "WhatsApp", Icon: MessageCircle, placeholder: "https://wa.me/201xxxxxxxxx" },
          ].map(({ key, label, Icon, placeholder }) => (
            <label key={key} className="space-y-1.5 text-xs font-semibold">
              <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-zeus-gold" />{label}</span>
              <input
                type="url"
                value={form[key] || ""}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                placeholder={placeholder}
                className="w-full rounded-xl border border-border/60 bg-card px-3.5 py-2.5 text-sm font-normal outline-none focus:border-zeus-gold"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 style={{ width: 16, height: 16 }} />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
          <AlertCircle style={{ width: 16, height: 16 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-zeus-gold text-zeus-midnight text-sm font-bold hover:bg-zeus-brightgold transition shadow-md disabled:opacity-50"
      >
        {saving ? <Loader2 className="animate-spin w-4 h-4" /> : <Save style={{ width: 16, height: 16 }} />}
        <span>{saving ? (isAr ? "جار الحفظ..." : "Saving...") : (isAr ? "حفظ كافة التغييرات" : "Save All Settings")}</span>
      </button>
    </form>
  );
}
