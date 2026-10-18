import React, { useState, useEffect } from "react";
import { Bell, Loader2, CheckCheck, Sparkles, Clock, Flame, Users, Rocket } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";

const ICONS = { ai: Sparkles, deadline: Clock, encouragement: Flame, community: Users, project: Rocket };

export default function Notifications() {
  const { t, lang, dir } = useI18n();
  const isAr = lang === "ar";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const n = await api.entities.Notification.filter({}, "-created_date", 50);
    setItems(n);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const markAll = async () => {
    const unread = items.filter((x) => !x.read);
    if (!unread.length) return;
    await api.entities.Notification.bulkUpdate(unread.map((x) => ({ id: x.id, read: true })));
    load();
  };

  const open = async (n) => {
    if (!n.read) { await api.entities.Notification.update(n.id, { read: true }); load(); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;

  return (
    <div dir={dir} className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-heading font-extrabold text-2xl sm:text-3xl flex items-center gap-2"><Bell className="text-zeus-gold" style={{ width: 28, height: 28 }} /> {t("notif.title")}</h1>
        {items.some((x) => !x.read) && <button onClick={markAll} className="inline-flex items-center gap-1.5 text-sm text-zeus-brightgold hover:underline"><CheckCheck style={{ width: 16, height: 16 }} /> {isAr ? "تعليم الكل كمقروء" : "Mark all read"}</button>}
      </div>
      {!items.length ? (
        <div className="zeus-glass p-12 text-center text-muted-foreground">{t("notif.empty")}</div>
      ) : (
        <div className="space-y-2.5">
          {items.map((n) => {
            const Icon = ICONS[n.type] || Bell;
            return (
              <button key={n.id} onClick={() => open(n)} className={`w-full text-start zeus-glass p-4 flex items-start gap-3 transition hover:zeus-gold-border ${n.read ? "opacity-60" : ""}`}>
                <div className="w-10 h-10 shrink-0 rounded-xl bg-zeus-gold/15 flex items-center justify-center"><Icon className="text-zeus-gold" style={{ width: 20, height: 20 }} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{n.title}</span>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-zeus-gold shrink-0" />}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}