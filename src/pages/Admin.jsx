import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck, Loader2, Search, Trash2, KeyRound, Crown, RefreshCw, Plus, Pencil, X, Check, Megaphone,
  CreditCard, Eye, CheckCircle2, XCircle, AlertCircle, Clock, ExternalLink, Sparkles, DollarSign, Key, Save, LifeBuoy, Facebook, Linkedin, Instagram, Music2, MessageCircle
} from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";

export default function Admin({ tab: initialTab }) {
  const { lang, dir } = useI18n();
  const isAr = lang === "ar";
  const [tab, setTab] = useState(initialTab || "stats");

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  return (
    <div dir={dir} className="space-y-6">
      <div>
        <h1 className="font-heading font-extrabold text-2xl sm:text-3xl flex items-center gap-2">
          <ShieldCheck className="text-zeus-gold" style={{ width: 28, height: 28 }} />
          {isAr ? "لوحة الإدارة" : "Admin Dashboard"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{isAr ? "إحصائيات وتحكم كامل في المنصة" : "Platform stats and full control"}</p>
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {tab === "stats" && <StatsTab isAr={isAr} />}
        {tab === "users" && <UsersTab isAr={isAr} />}
        {tab === "subscribers" && <SubscribersTab isAr={isAr} />}
        {tab === "communities" && <CommunitiesTab isAr={isAr} />}
        {tab === "moderation" && <ModerationTab isAr={isAr} />}
        {tab === "broadcast" && <BroadcastTab isAr={isAr} />}
        {tab === "support" && <SupportTab isAr={isAr} />}
        {tab === "settings" && <SettingsTab isAr={isAr} />}
      </motion.div>
    </div>
  );
}

/* ---------------- Stats ---------------- */
function StatsTab({ isAr }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try { setStats(await api.admin.get("/stats")); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  if (loading || !stats) return <Spin />;
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
      </div>
      <button onClick={load} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-zeus-gold transition"><RefreshCw style={{ width: 13, height: 13 }} /> {isAr ? "تحديث" : "Refresh"}</button>
    </div>
  );
}

/* ---------------- Users ---------------- */
function UsersTab({ isAr }) {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [communities, setCommunities] = useState([]);
  const [planModalUser, setPlanModalUser] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState("STARTER");
  const [savingPlan, setSavingPlan] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.admin.get(`/users?search=${encodeURIComponent(search)}&limit=100`);
      setUsers(r.users || []);
      setTotal(r.total || 0);
      const cl = await api.admin.get("/communities");
      setCommunities(cl || []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const act = async (fn) => { await fn(); load(); };

  const assign = async (communityId, userId, isNew, newName) => {
    let cid = communityId;
    if (isNew) {
      const created = await api.admin.post("/communities", { name: newName });
      cid = created.id;
    }
    await api.admin.post(`/communities/${cid}/members`, { user_id: userId });
    load();
  };

  const handleActivateWithPlan = async (e) => {
    e.preventDefault();
    if (!planModalUser) return;
    setSavingPlan(true);
    try {
      await api.admin.put(`/users/${planModalUser.id}`, {
        status: "active",
        subscription_plan: selectedPlan,
      });
      setPlanModalUser(null);
      await load();
    } catch (err) {
      alert(err.message || "Failed to update user plan");
    } finally {
      setSavingPlan(false);
    }
  };

  if (loading) return <Spin />;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder={isAr ? "بحث بالإيميل أو الاسم..." : "Search email or name..."}
            className="w-full ps-10 pe-4 py-2.5 rounded-xl bg-card border border-border/60 text-sm outline-none focus:zeus-gold-border" />
        </div>
        <button onClick={load} className="px-4 rounded-xl bg-secondary/40 border border-border/60 text-sm hover:border-zeus-gold/40 transition">{isAr ? "بحث" : "Search"}</button>
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
                        setPlanModalUser(u);
                        setSelectedPlan(u.subscription_plan || "STARTER");
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
                    {u.subscription_expires && (
                      <span className="text-zeus-brightgold ms-2">
                        · {isAr ? "ينتهي الاشتراك:" : "Expires:"} {u.subscription_expires.slice(0, 10)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {(u.goal || (isAr ? "بدون هدف" : "no goal"))} · {u.lessons_done}/{u.lessons_total} ({pct}%)
                    {(u.memberships || []).length > 0 && <span className="text-zeus-brightgold"> · {isAr ? "عضو في" : "in"}: {(u.memberships || []).map((m) => m.name).join("، ")}</span>}
                  </div>
                </button>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {status !== "active" ? (
                    <button
                      onClick={() => {
                        setPlanModalUser(u);
                        setSelectedPlan(u.subscription_plan || "STARTER");
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
                  <button title={isAr ? "باسورد جديد" : "New password"} onClick={() => { const p = window.prompt(isAr ? "باسورد جديد (6+ حروف):" : "New password (6+ chars):"); if (p) act(() => api.admin.put(`/users/${u.id}`, { password: p })); }}
                    className="p-2 rounded-lg bg-secondary/40 border border-border/60 hover:border-zeus-gold/40 transition"><KeyRound style={{ width: 14, height: 14 }} className="text-muted-foreground" /></button>
                </div>
              </div>
              {isOpen && <UserDetail u={u} isAr={isAr} communities={communities} onAssign={assign} />}
            </div>
          );
        })}
      </div>

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
                { id: "STARTER", name: "STARTER", descAr: "خريطة مخصصة + مساعد ذكي (99 EGP)", descEn: "Personalized Roadmap + AI (99 EGP)", cls: "border-amber-500/40 text-amber-400" },
                { id: "PRO", name: "PRO", descAr: "كافة مميزات ستارتر + كويزات ومشاريع بعد كل مرحلة (199 EGP)", descEn: "Quizzes + Projects after stages (199 EGP)", cls: "border-cyan-500/40 text-cyan-400" },
                { id: "PRIME", name: "PRIME", descAr: "شامل كل شيء + وظائف ومجتمعات وCV وبورتفوليو (399 EGP)", descEn: "All features + Jobs + CV + Community (399 EGP)", cls: "border-purple-500/40 text-purple-400" },
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
                      </div>
                    </div>
                  </label>
                );
              })}
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
    </div>
  );
}

function UserDetail({ u, isAr, communities, onAssign }) {
  const [pick, setPick] = useState("");
  const [newName, setNewName] = useState("");
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
    </div>
  );
}

/* ---------------- Communities ---------------- */
function CommunitiesTab({ isAr }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", goal: "", stage: "" });
  const load = async () => {
    setLoading(true);
    try { setList(await api.admin.get("/communities")); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editing) await api.admin.put(`/communities/${editing}`, form);
    else await api.admin.post("/communities", form);
    setForm({ name: "", goal: "", stage: "" });
    setEditing(null);
    load();
  };
  if (loading) return <Spin />;
  return (
    <div className="space-y-4">
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
          <button type="submit" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-zeus-gold text-zeus-midnight text-sm font-semibold hover:bg-zeus-brightgold transition">
            <Check style={{ width: 14, height: 14 }} /> {editing ? (isAr ? "حفظ" : "Save") : (isAr ? "إنشاء" : "Create")}
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
  return (
    <div className="zeus-glass p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => setOpen(!open)} className="text-start flex-1 min-w-0">
          <div className="font-medium text-sm">{c.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{c.goal || "—"} · {c.stage || "—"} · {c.member_count || 0} {isAr ? "عضو" : "members"} · {c.messages || 0} {isAr ? "رسالة" : "msgs"}</div>
        </button>
        <div className="flex gap-1.5">
          <button onClick={onEdit} className="p-2 rounded-lg bg-secondary/40 border border-border/60 hover:border-zeus-gold/40 transition"><Pencil style={{ width: 14, height: 14 }} className="text-muted-foreground" /></button>
          <button onClick={async () => { if (window.confirm(isAr ? "حذف المجتمع ورسائله؟" : "Delete community + messages?")) { await api.admin.del(`/communities/${c.id}`); onChanged(); } }} className="p-2 rounded-lg bg-secondary/40 border border-border/60 hover:border-red-500/50 transition"><Trash2 style={{ width: 14, height: 14 }} className="text-red-400" /></button>
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
                    <span className="truncate">{m.full_name || m.email}</span>
                    <button onClick={async () => { await api.admin.del(`/communities/${c.id}/members/${m.id}`); onChanged(); }}
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
                    <button onClick={async () => { await api.admin.post(`/communities/${c.id}/members`, { user_id: m.id }); onChanged(); }}
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
        </div>
      )}
    </div>
  );
}

/* ---------------- Moderation ---------------- */
function ModerationTab({ isAr }) {
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try { setMsgs(await api.admin.get("/messages?limit=100")); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  if (loading) return <Spin />;
  return (
    <div className="space-y-2">
      {msgs.map((m) => (
        <div key={m.id} className="zeus-glass p-4">
          <div className="text-sm mb-1.5">{m.text}</div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11px] text-muted-foreground">{m.user_email} · {m.community_name} · {(m.created_date || "").slice(0, 16).replace("T", " ")}</div>
            <button onClick={async () => { if (window.confirm(isAr ? "حذف الرسالة؟" : "Delete message?")) { await api.admin.del(`/messages/${m.id}`); load(); } }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-red-500/40 text-red-400 text-xs hover:bg-red-500/10 transition"><Trash2 style={{ width: 12, height: 12 }} /> {isAr ? "حذف" : "Delete"}</button>
          </div>
        </div>
      ))}
      {msgs.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">{isAr ? "لا رسائل بعد." : "No messages yet."}</p>}
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

/* ---------------- Subscribers & Payments ---------------- */
function SubscribersTab({ isAr }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [actionId, setActionId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.admin.get("/subscribers");
      setList(res || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id) => {
    if (!window.confirm(isAr ? "هل أنت متأكد من تفعيل هذا الاشتراك لمدة 30 يوم؟" : "Approve and activate this subscription for 30 days?")) return;
    setActionId(id);
    try {
      await api.admin.post(`/subscribers/${id}/approve`);
      await load();
    } catch (err) {
      alert(err.message || "Failed to approve");
    }
    setActionId(null);
  };

  const handleReject = async (id) => {
    const reason = window.prompt(isAr ? "سبب الرفض (اختياري):" : "Reason for rejection (optional):");
    if (reason === null) return;
    setActionId(id);
    try {
      await api.admin.post(`/subscribers/${id}/reject`, { reason });
      await load();
    } catch (err) {
      alert(err.message || "Failed to reject");
    }
    setActionId(null);
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
  const approvedCount = list.filter((r) => r.status === "approved" && !r.is_expired).length;
  const totalRevenue = list
    .filter((r) => r.status === "approved")
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  if (loading) return <Spin />;

  return (
    <div className="space-y-5">
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
                            <div className={`font-semibold ${item.is_expired ? "text-rose-400" : "text-emerald-400"}`}>
                              {item.is_expired
                                ? (isAr ? "منتهي" : "Expired")
                                : (isAr ? `متبقي ${item.remaining_days} يوم` : `${item.remaining_days} days left`)}
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
  const secretFields = ["gemini_api_key", "openai_api_key", "youtube_api_key"];
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [savedSecretHints, setSavedSecretHints] = useState({});
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
    starter_features_ar: "خريطة تعلم مخصصة بالكامل لخبرتك وأهدافك\nالمساعد الذكي ZEUS رفيقك الدراسي خطوة بخطوة",
    starter_features_en: "Personalized learning roadmap\nAI Assistant",
    pro_description_ar: "الخطة الاحترافية للتطبيق العملي واختبار المعرفة خطوة بخطوة.",
    pro_description_en: "A professional plan for hands-on practice and learning assessments.",
    pro_features_ar: "كل مميزات باقة STARTER\nاختبارات تفاعلية بعد كل درس لتقييم فهمك\nمشروع عملي وتطبيقي شامل بعد كل مرحلة",
    pro_features_en: "Everything in STARTER\nInteractive quizzes after every lesson\nA project after every stage",
    prime_description_ar: "الخطة الشاملة للتأهيل والجاهزية لسوق العمل والتوظيف.",
    prime_description_en: "The complete plan for career preparation and job readiness.",
    prime_features_ar: "كل مميزات باقة PRO\nبحث واقتراحات وظائف ذكية تطابق مجالك وخبرتك\nالانضمام لمجتمع المتخصصين والزملاء في مجالك\nأداة بناء وتحسين السيرة الذاتية الاحترافية (CV)\nأداة بناء وعرض البورتفوليو العام لمشاريعك",
    prime_features_en: "Everything in PRO\nJob search/recommendations relevant to your field\nAccess to a community related to your field\nCV functionality\nPortfolio functionality",
    gemini_api_key: "",
    gemini_model: "gemini-2.5-flash",
    openai_api_key: "",
    openai_model: "gpt-4o-mini",
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
      const saved = await api.admin.put("/settings", {
        ...form,
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

  const testProvider = async (provider) => {
    setTestingProvider(provider);
    setTestResults((prev) => ({ ...prev, [provider]: null }));
    try {
      const result = await api.admin.post("/settings/test-provider", {
        provider,
        language: isAr ? "ar" : "en",
      });
      setTestResults((prev) => ({ ...prev, [provider]: result }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [provider]: { success: false, message: err.message || (isAr ? "فشل اختبار الاتصال" : "Provider test failed") },
      }));
    } finally {
      setTestingProvider("");
    }
  };

  const toggleSecretClear = (field) => {
    const isMarked = clearSecrets.includes(field);
    setClearSecrets((prev) => isMarked ? prev.filter((key) => key !== field) : [...prev, field]);
    if (!isMarked) setForm((prev) => ({ ...prev, [field]: "" }));
  };

  const providerFields = [
    { id: "openai", title: "OpenAI", url: "https://platform.openai.com", key: "openai_api_key", model: "openai_model", placeholder: "sk-proj-...", modelPlaceholder: "gpt-4o-mini", assignment: isAr ? "الاكتشاف والتوصيات والتخطيط + بحث الوظائف" : "Discovery, recommendations, planning + job research" },
    { id: "gemini", title: "Google Gemini", url: "https://aistudio.google.com", key: "gemini_api_key", model: "gemini_model", placeholder: "AIzaSy...", modelPlaceholder: "gemini-2.5-flash", assignment: isAr ? "بحث الوظائف والبديل للمهام الأخرى" : "Job research and fallback for other tasks" },
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
              STARTER (EGP/mo)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.starter_price}
              onChange={(e) => setForm({ ...form, starter_price: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-card border border-border/60 text-sm font-bold text-foreground outline-none focus:zeus-gold-border"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              PRO (EGP/mo)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.pro_price}
              onChange={(e) => setForm({ ...form, pro_price: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-card border border-border/60 text-sm font-bold text-foreground outline-none focus:zeus-gold-border"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              PRIME (EGP/mo)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.prime_price}
              onChange={(e) => setForm({ ...form, prime_price: e.target.value })}
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

      {/* AI Models Configuration */}
      <div className="zeus-glass p-5 rounded-2xl border border-border/60 space-y-4">
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
                  <button type="button" onClick={() => testProvider(provider.id)} disabled={testingProvider === provider.id || !configured} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 text-[11px] font-semibold hover:border-zeus-gold/60 disabled:opacity-50">
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
                  {result?.available_models?.length > 0 && (
                    <div className="basis-full text-[11px] text-muted-foreground">
                      {isAr ? "الموديلات المتاحة:" : "Available models:"}{" "}
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
          <div className="text-xs font-bold">{isAr ? "توزيع المهام الحالي" : "Current task assignments"}</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {Object.entries(aiStatus?.task_routes || {}).map(([task, providers]) => (
              <div key={task} className="rounded-lg bg-secondary/20 border border-border/40 p-2.5 text-[11px]">
                <span className="font-semibold capitalize">{task.replaceAll("_", " ")}</span>
                <span className="text-muted-foreground"> — {providers.join(" → ")}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {isAr
              ? "الاكتشاف وتوليد الخرائط يستخدمان OpenAI. ويُستخدم Gemini لبحث الوظائف كمان وكبديل لباقي المهام عند تعذر OpenAI."
              : "Discovery and roadmap generation use OpenAI. Gemini also powers career research and is the fallback for other tasks when OpenAI is unavailable."}
          </p>
          <div className="text-[11px] text-muted-foreground">
            {isAr ? "بحث الوظائف مضبوط حالياً: " : "Career research configured: "}
            {[
              ["Gemini", aiStatus?.career_research?.gemini],
              ["OpenAI", aiStatus?.career_research?.openai],
            ].map(([name, configured]) => (
              <span key={name} className={configured ? "text-emerald-400 me-2" : "text-rose-400 me-2"}>
                {name} {configured ? (isAr ? "جاهز" : "ready") : (isAr ? "مفتاحه غير مضبوط" : "key not configured")}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* External APIs — YouTube only (the only external API actively used) */}
      <div className="zeus-glass p-5 rounded-2xl border border-border/60 space-y-4">
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
