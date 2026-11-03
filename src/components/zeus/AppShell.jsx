import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate, Link, Navigate } from "react-router-dom";
import {
  Home, TrendingUp, Users, Briefcase, Compass, FolderKanban,
  Settings, LogOut, Menu, X, Calendar, Bell, Sparkles, Award, ClipboardList
} from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { useProfile } from "@/lib/ProfileContext";
import Logo from "./Logo";
import FloatingCompanion from "./FloatingCompanion";
import LanguageToggle from "./LanguageToggle";
import ThemeToggle from "./ThemeToggle";
import { ZEUS_IMAGES, withImageFallback } from "@/lib/zeus-images";
import { getUserTier, canAccessPath } from "@/lib/tier";

const NAV = [
  { key: "nav.home", to: "/app", icon: Home, minTier: "STARTER", feature: "learning" },
  { key: "nav.schedule", to: "/schedule", icon: Calendar, labelAr: "خطة ودروس", labelEn: "Plan & Lessons", minTier: "STARTER", feature: "learning" },
  { key: "nav.discover", to: "/discover", icon: Compass, minTier: "STARTER", feature: "learning" },
  { key: "nav.progress", to: "/statistics", icon: TrendingUp, labelAr: "إحصائيات التعلم", labelEn: "Learning statistics", minTier: "PRO", feature: "statistics" },
  { key: "partner.assessments", to: "/partner/assessments", icon: ClipboardList, labelAr: "اختبارات الشريك", labelEn: "Partner exams", minTier: "STARTER", feature: "learning" },
  { key: "nav.projects", to: "/projects", icon: FolderKanban, minTier: "PRO", feature: "projects" },
  { key: "nav.subscriptions", to: "/subscriptions", icon: Sparkles, labelAr: "الاشتراكات", labelEn: "Subscriptions", minTier: "NONE" },
  { key: "certificates", to: "/certificates", icon: Award, labelAr: "الشهادات", labelEn: "Certificates", minTier: "PRIME", feature: "certificates" },
  { key: "nav.community", to: "/community", icon: Users, minTier: "PRIME", feature: "community" },
  { key: "nav.career", to: "/career", icon: Briefcase, minTier: "PRIME", feature: "career" },
  { key: "nav.settings", to: "/settings", icon: Settings, minTier: "NONE" }
];

const BOTTOM = ["nav.home", "nav.roadmap", "nav.schedule", "nav.progress", "nav.settings"];

export default function AppShell() {
  const { t, dir, lang } = useI18n();
  const isAr = lang === "ar";
  const { profile, loading } = useProfile();
  const { user } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // No free tier: hide anything the user's plan doesn't include, and keep
  // users without an active subscription on the subscriptions page only.
  const userTier = getUserTier(user);
  const rankOf = (t) => ({ NONE: 0, STARTER: 1, PRO: 2, PRIME: 3 }[t] ?? 0);
  const isFeatureEnabled = (feature) => {
    if (!user?.subscription?.partner_managed || !feature) return true;
    if (typeof user.subscription.features?.[feature] === "boolean") return user.subscription.features[feature];
    return ({ STARTER: ["learning"], PRO: ["learning", "statistics", "projects"], PRIME: ["learning", "statistics", "community", "projects", "cv", "portfolio", "career", "certificates"] }[userTier] || []).includes(feature);
  };
  const navItems = NAV.filter((n) => (
    (n.key !== "partner.assessments" || user?.role === "partner_student")
    && (user?.subscription?.partner_managed || rankOf(userTier) >= rankOf(n.minTier || "STARTER"))
    && isFeatureEnabled(n.feature)
  ));

  useEffect(() => {
    if (!user || user.role === "admin") return undefined;
    let active = true;
    const refreshUnread = async () => {
      try {
        const notifications = await api.entities.Notification.filter({}, "-created_date", 100);
        if (active) setUnreadNotifications(notifications.filter((item) => !item.read).length);
      } catch (error) {
        console.error("Unable to load notification count", error);
      }
    };
    refreshUnread();
    const timer = window.setInterval(refreshUnread, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user?.id, user?.role]);

  // Hard separation: admins never live in user pages.
  if (user?.role === "admin") {
    return <Navigate to="/admin" replace />;
  }
  if (user?.role === "partner") {
    return <Navigate to="/partner" replace />;
  }
  if (user?.role === "doctor") {
    return <Navigate to="/doctor" replace />;
  }

  // Direct-URL protection: typing /career or /projects without the tier
  // bounces to /subscriptions instead of showing a dead page.
  if (!user?.subscription?.partner_managed && !canAccessPath(loc.pathname, userTier) && loc.pathname !== "/settings") {
    return <Navigate to="/subscriptions" replace />;
  }
  const pathFeature = loc.pathname.startsWith("/statistics") ? "statistics"
    : loc.pathname.startsWith("/projects") ? "projects"
      : loc.pathname.startsWith("/community") ? "community"
        : loc.pathname.startsWith("/career") ? "career"
          : loc.pathname.startsWith("/cv-builder") ? "cv"
            : loc.pathname.startsWith("/certificates") ? "certificates"
              : ["schedule", "discover", "lesson"].some((part) => loc.pathname.startsWith(`/${part}`)) ? "learning"
                : null;
  if (!isFeatureEnabled(pathFeature)) return <Navigate to="/app" replace />;

  const handleLogout = async () => {
    await api.auth.logout();
    nav("/");
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-9 h-9 border-4 border-zeus-gold/30 border-t-zeus-gold rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile || profile.onboarding_step !== "done") {
    return <Navigate to="/onboarding" replace />;
  }

  const SidebarLink = ({ item }) => {
    const active = loc.pathname === item.to || (item.to === "/schedule" && loc.pathname === "/roadmap");
    const Icon = item.icon;
    const label = item.labelAr ? (isAr ? item.labelAr : item.labelEn) : t(item.key);
    return (
      <Link
        to={item.to}
        className={`group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
          active
            ? "bg-zeus-gold/15 text-zeus-brightgold zeus-gold-border"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        }`}
      >
        <Icon className={active ? "text-zeus-gold" : ""} style={{ width: 18, height: 18 }} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex overflow-x-hidden" dir={dir}>
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-e border-border/60 bg-card/40 backdrop-blur-xl">
        <div className="px-5 py-6">
          <Link to="/app"><Logo size={32} /></Link>
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => <SidebarLink key={item.key} item={item} />)}
        </nav>
        <div className="p-3 border-t border-border/60">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition">
            <LogOut style={{ width: 18, height: 18 }} />
            <span>{t("nav.logout")}</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 pb-24 lg:pb-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 lg:px-8 h-16 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <div className="lg:hidden"><Logo size={28} /></div>
          <div className="hidden lg:block text-sm text-muted-foreground">
            {t("brand.tagline")}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/subscriptions"
              title={isAr ? "إدارة باقة الاشتراك" : "Manage Subscription"}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${
                user?.subscription_plan
                  ? "bg-gradient-to-r from-zeus-gold/20 to-zeus-brightgold/20 text-zeus-brightgold border border-zeus-gold/40 shadow-gold-sm"
                  : "bg-secondary/70 text-foreground hover:bg-secondary border border-border"
              }`}
            >
              <Sparkles style={{ width: 13, height: 13 }} className="text-zeus-gold" />
              <span>{user?.subscription_plan || (isAr ? "الاشتراكات" : "Subscriptions")}</span>
            </Link>
            <LanguageToggle />
            <ThemeToggle />
            <Link to="/notifications" className="relative p-2 rounded-full hover:bg-secondary/60 transition">
              <Bell style={{ width: 18, height: 18 }} className="text-muted-foreground" />
              {unreadNotifications > 0 && <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}
            </Link>
            <Link to="/profile" className="w-9 h-9 rounded-full overflow-hidden border-2 border-zeus-gold/40 hover:border-zeus-gold transition">
              <img src={ZEUS_IMAGES.avatar} alt="Profile" className="w-full h-full object-cover object-top" onError={withImageFallback} />
            </Link>
          </div>
        </header>

        <main className="flex-1 px-4 lg:px-8 py-6 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Bottom nav (mobile) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card/90 backdrop-blur-xl border-t border-border/60" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-center justify-around px-2 h-16">
        {navItems.filter((n) => BOTTOM.includes(n.key)).map((item) => {
          const active = loc.pathname === item.to || (item.to === "/schedule" && loc.pathname === "/roadmap");
          const Icon = item.icon;
          return (
            <Link key={item.key} to={item.to} className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap transition ${active ? "text-zeus-brightgold" : "text-muted-foreground"}`}>
              <Icon style={{ width: 20, height: 20 }} className={active ? "text-zeus-gold" : ""} />
              <span>{item.labelAr ? (isAr ? item.labelAr : item.labelEn) : t(item.key)}</span>
            </Link>
          );
        })}
        <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-0.5 px-2 py-1 text-muted-foreground">
          <Menu style={{ width: 20, height: 20 }} />
          <span className="text-[10px]">{isAr ? "المزيد" : "More"}</span>
        </button>
        </div>
      </nav>

      {/* More menu */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-center items-end" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
          <div className="relative w-full bg-card border-t border-border/60 rounded-t-3xl p-5 animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <Logo size={28} />
              <button onClick={() => setMoreOpen(false)} className="p-2 rounded-full hover:bg-secondary/60"><X style={{ width: 18, height: 18 }} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {navItems.filter((n) => !BOTTOM.includes(n.key)).map((item) => {
                const Icon = item.icon;
                const active = loc.pathname === item.to;
                return (
                  <Link key={item.key} to={item.to} onClick={() => setMoreOpen(false)} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs ${active ? "bg-zeus-gold/15 text-zeus-brightgold" : "bg-secondary/40 text-muted-foreground"}`}>
                    <Icon style={{ width: 20, height: 20 }} />
                    <span>{item.labelAr ? (isAr ? item.labelAr : item.labelEn) : t(item.key)}</span>
                  </Link>
                );
              })}
              <button onClick={handleLogout} className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs bg-secondary/40 text-destructive">
                <LogOut style={{ width: 20, height: 20 }} />
                <span>{t("nav.logout")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <FloatingCompanion />
    </div>
  );
}