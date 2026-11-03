import React from "react";
import { Outlet, useLocation, Link, Navigate } from "react-router-dom";
import {
  ShieldCheck, Users, MessageSquare, Megaphone, LogOut, LayoutDashboard, CreditCard, Settings, LifeBuoy, Sparkles, Award, Building2, Menu
} from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import Logo from "./Logo";
import LanguageToggle from "./LanguageToggle";
import ThemeToggle from "./ThemeToggle";

// Standalone admin shell: NO user navigation (home/roadmap/schedule/progress),
// NO onboarding gate, NO AI companion. Admins never see user pages.
const ADMIN_NAV = [
  { key: "stats", to: "/admin", icon: LayoutDashboard, labelAr: "الإحصائيات", labelEn: "Stats" },
  { key: "users", to: "/admin/users", icon: Users, labelAr: "المستخدمون", labelEn: "Users" },
  { key: "partners", to: "/admin/partners", icon: Building2, labelAr: "الشركاء", labelEn: "Partners" },
  { key: "subscribers", to: "/admin/subscribers", icon: CreditCard, labelAr: "المشتركون والمدفوعات", labelEn: "Subscribers" },
  { key: "communities", to: "/admin/communities", icon: MessageSquare, labelAr: "المجتمعات والإشراف", labelEn: "Communities & moderation" },
  { key: "broadcast", to: "/admin/broadcast", icon: Megaphone, labelAr: "إعلان عام", labelEn: "Broadcast" },
  { key: "support", to: "/admin/support", icon: LifeBuoy, labelAr: "الدعم", labelEn: "Support" },
  { key: "support-chats", to: "/admin/support-chats", icon: MessageSquare, labelAr: "محادثات الدعم", labelEn: "Support chats" },
  { key: "certificates", to: "/admin/certificates", icon: Award, labelAr: "الشهادات", labelEn: "Certificates" },
  { key: "settings", to: "/admin/settings", icon: Settings, labelAr: "إعدادات المنصة", labelEn: "Settings" },
  { key: "ai-settings", to: "/admin/ai-settings", icon: Sparkles, labelAr: "إعدادات AI وYouTube", labelEn: "AI & YouTube" },
];

export default function AdminShell() {
  const { dir, lang } = useI18n();
  const isAr = lang === "ar";
  const { user } = useAuth();
  const loc = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const primaryMobileNav = ADMIN_NAV.filter((item) => ["stats", "users", "partners"].includes(item.key));
  const extraMobileNav = ADMIN_NAV.filter((item) => !["stats", "users", "partners"].includes(item.key));
  const isActive = (item) => loc.pathname === item.to || (item.to !== "/admin" && loc.pathname.startsWith(`${item.to}/`));

  React.useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  // Hard separation: admins live here, never in user pages.
  if (user && user.role !== "admin") {
    return <Navigate to="/app" replace />;
  }

  const handleLogout = async () => {
    await api.auth.logout();
  };

  return (
    <div className="admin-console min-h-screen flex overflow-x-hidden bg-background" dir={dir}>
      <aside className="admin-sidebar hidden lg:flex flex-col w-64 shrink-0 border-e border-border/60 bg-card">
        <div className="px-5 py-5">
          <div className="admin-logo-card flex items-center justify-between gap-3 rounded-2xl p-3">
            <Link to="/admin" aria-label="ZEUS Admin home"><Logo size={34} /></Link>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[10px] font-bold text-white">
            <ShieldCheck style={{ width: 11, height: 11 }} /> {isAr ? "أدمن" : "ADMIN"}
            </span>
          </div>
        </div>
        <nav aria-label={isAr ? "قائمة الإدارة" : "Admin navigation"} className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {ADMIN_NAV.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link key={item.key} to={item.to}
                aria-current={active ? "page" : undefined}
                className={`admin-nav-link flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active ? "bg-zeus-gold/10 text-zeus-brightgold" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}>
                <Icon className={active ? "text-zeus-gold" : ""} style={{ width: 18, height: 18 }} />
                <span>{isAr ? item.labelAr : item.labelEn}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border/60">
          <button type="button" onClick={handleLogout} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
            <LogOut style={{ width: 18, height: 18 }} />
            <span>{isAr ? "تسجيل الخروج" : "Log out"}</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 pb-24 lg:pb-0">
        <header className="admin-header sticky top-0 z-30 flex items-center justify-between px-4 lg:px-8 h-16 border-b border-border/60 bg-background/95">
          <div className="admin-logo-card lg:hidden rounded-xl px-2.5 py-1.5"><Logo size={25} /></div>
          <div className="hidden lg:block text-sm font-medium text-muted-foreground">
            {isAr ? "لوحة تحكم الإدارة" : "Admin console"}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleLogout} aria-label={isAr ? "تسجيل الخروج" : "Log out"} title={isAr ? "تسجيل الخروج" : "Log out"}
              className="lg:hidden rounded-lg p-2 text-muted-foreground hover:bg-secondary/50 hover:text-destructive">
              <LogOut style={{ width: 18, height: 18 }} />
            </button>
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 px-4 lg:px-8 py-6 lg:py-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      <nav aria-label={isAr ? "قائمة الإدارة" : "Admin navigation"} className="admin-mobile-nav lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border/60" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex h-16 items-center justify-around gap-1 px-2">
          {primaryMobileNav.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return <Link key={item.key} to={item.to} aria-current={active ? "page" : undefined} className={`admin-mobile-link flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium transition-colors ${active ? "text-zeus-brightgold" : "text-muted-foreground"}`}>
                <Icon style={{ width: 20, height: 20 }} className={active ? "text-zeus-gold" : ""} />
                <span className="max-w-full truncate">{isAr ? item.labelAr : item.labelEn}</span>
              </Link>;
          })}
          <button type="button" onClick={() => setMobileMenuOpen(true)} aria-expanded={mobileMenuOpen}
            aria-haspopup="dialog" className={`flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium transition-colors ${mobileMenuOpen || extraMobileNav.some(isActive) ? "text-zeus-brightgold" : "text-muted-foreground"}`}>
            <Menu style={{ width: 20, height: 20 }} />
            <span>{isAr ? "المزيد" : "More"}</span>
          </button>
        </div>
      </nav>
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label={isAr ? "إغلاق القائمة" : "Close menu"}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <section role="dialog" aria-modal="true" aria-label={isAr ? "باقي صفحات الإدارة" : "More admin pages"}
            className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-3xl border-t border-border/70 bg-card p-5 shadow-2xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-sm font-bold">{isAr ? "صفحات الإدارة" : "Admin pages"}</h2>
              <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label={isAr ? "إغلاق" : "Close"}
                className="rounded-lg p-2 text-muted-foreground hover:bg-secondary/60">
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <nav aria-label={isAr ? "باقي صفحات الإدارة" : "More admin pages"} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {extraMobileNav.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return <Link key={item.key} to={item.to} onClick={() => setMobileMenuOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 items-center gap-2 rounded-xl border p-3 text-xs font-medium transition-colors ${active ? "border-zeus-gold/50 bg-zeus-gold/10 text-zeus-brightgold" : "border-border/60 text-foreground hover:bg-secondary/50"}`}>
                  <Icon className="h-4 w-4 shrink-0 text-zeus-gold" />
                  <span>{isAr ? item.labelAr : item.labelEn}</span>
                </Link>;
              })}
            </nav>
          </section>
        </div>
      )}
    </div>
  );
}
