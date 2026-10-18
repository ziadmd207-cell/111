import React from "react";
import { Outlet, useLocation, Link, Navigate } from "react-router-dom";
import {
  ShieldCheck, Users, MessageSquare, Ban, Megaphone, LogOut, LayoutDashboard, CreditCard, Settings, LifeBuoy
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
  { key: "subscribers", to: "/admin/subscribers", icon: CreditCard, labelAr: "المشتركون والمدفوعات", labelEn: "Subscribers" },
  { key: "communities", to: "/admin/communities", icon: MessageSquare, labelAr: "المجتمعات", labelEn: "Communities" },
  { key: "moderation", to: "/admin/moderation", icon: Ban, labelAr: "الإشراف", labelEn: "Moderation" },
  { key: "broadcast", to: "/admin/broadcast", icon: Megaphone, labelAr: "إعلان عام", labelEn: "Broadcast" },
  { key: "support", to: "/admin/support", icon: LifeBuoy, labelAr: "الدعم", labelEn: "Support" },
  { key: "settings", to: "/admin/settings", icon: Settings, labelAr: "إعدادات المنصة", labelEn: "Settings" },
];

export default function AdminShell() {
  const { dir, lang } = useI18n();
  const isAr = lang === "ar";
  const { user } = useAuth();
  const loc = useLocation();

  // Hard separation: admins live here, never in user pages.
  if (user && user.role !== "admin") {
    return <Navigate to="/app" replace />;
  }

  const handleLogout = async () => {
    await api.auth.logout();
  };

  return (
    <div className="min-h-screen flex overflow-x-hidden" dir={dir}>
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-e border-border/60 bg-card/40 backdrop-blur-xl">
        <div className="px-5 py-6 flex items-center gap-2.5">
          <Link to="/admin"><Logo size={32} /></Link>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zeus-gold/15 text-zeus-brightgold text-[10px] font-bold">
            <ShieldCheck style={{ width: 11, height: 11 }} /> {isAr ? "أدمن" : "ADMIN"}
          </span>
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {ADMIN_NAV.map((item) => {
            const active = loc.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link key={item.key} to={item.to}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active ? "bg-zeus-gold/15 text-zeus-brightgold zeus-gold-border" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}>
                <Icon className={active ? "text-zeus-gold" : ""} style={{ width: 18, height: 18 }} />
                <span>{isAr ? item.labelAr : item.labelEn}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border/60">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition">
            <LogOut style={{ width: 18, height: 18 }} />
            <span>{isAr ? "تسجيل الخروج" : "Log out"}</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 pb-24 lg:pb-0">
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 lg:px-8 h-16 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <div className="lg:hidden"><Logo size={28} /></div>
          <div className="hidden lg:block text-sm text-muted-foreground">
            {isAr ? "لوحة تحكم الإدارة" : "Admin console"}
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 px-4 lg:px-8 py-6 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card/90 backdrop-blur-xl border-t border-border/60" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-center justify-around px-2 h-16 overflow-x-auto">
          {ADMIN_NAV.map((item) => {
            const active = loc.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link key={item.key} to={item.to} className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap transition ${active ? "text-zeus-brightgold" : "text-muted-foreground"}`}>
                <Icon style={{ width: 20, height: 20 }} className={active ? "text-zeus-gold" : ""} />
                <span>{isAr ? item.labelAr : item.labelEn}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
