import React, { useState, useEffect, useRef } from "react";
import { Users, Loader2, Send, ArrowLeft, ArrowRight, Hash, Sparkles } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";

export default function Community() {
  const { t, lang, dir } = useI18n();
  const { profile } = useProfile();
  const isAr = lang === "ar";
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [me, setMe] = useState(null);

  const load = async () => {
    const u = await api.auth.me();
    setMe(u);
    const c = await api.entities.Community.filter({}, "-created_date", 50);
    setCommunities(c);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Communities are admin-managed: users only browse and join.
  // (The old client-side auto-seed was removed.)

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;

  if (active) return <ChatRoom community={active} onBack={() => { setActive(null); load(); }} me={me} isAr={isAr} dir={dir} t={t} />;

  return (
    <div dir={dir} className="space-y-6">
      <div>
        <h1 className="font-heading font-extrabold text-2xl sm:text-3xl flex items-center gap-2"><Users className="text-zeus-gold" style={{ width: 28, height: 28 }} /> {t("nav.community")}</h1>
        <p className="text-muted-foreground mt-1">{isAr ? "مجتمعات متعلّمين متلائمين مع رحلتك" : "Communities matched to your journey"}</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {communities.length === 0 && (
          <div className="zeus-glass p-10 text-center text-muted-foreground sm:col-span-2">
            {isAr ? "الأدمن هيضيفك لمجتمعك قريبًا — هتوصلك إشعار أول ما تنضم." : "The admin will add you to your community soon — you'll get notified."}
          </div>
        )}
        {communities.map((c) => {
          const sameGoal = profile?.goal && c.goal && (c.goal === profile.goal || profile.goal.includes(c.goal) || c.goal.includes(profile.goal));
          return (
            <div key={c.id} className="zeus-glass p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  {sameGoal && <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-zeus-gold/15 text-zeus-brightgold mb-1.5"><Sparkles style={{ width: 10, height: 10 }} /> {isAr ? "نفس هدفك" : "Matches your goal"}</span>}
                  <h3 className="font-heading font-bold">{c.name}</h3>
                  <div className="text-xs text-muted-foreground mt-0.5">{c.stage}</div>
                </div>
                <div className="text-zeus-gold font-bold text-xl">{c.member_count || 0}</div>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{c.description}</p>
              <div className="mt-4 flex items-center gap-2">
                {/* Membership is assigned by the admin only */}
                <button onClick={() => setActive(c)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-zeus-gold text-zeus-midnight text-sm font-medium hover:bg-zeus-brightgold transition"><Hash style={{ width: 14, height: 14 }} /> {isAr ? "افتح الشات" : "Open chat"}</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatRoom({ community, onBack, me, isAr, dir, t }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const endRef = useRef(null);

  const loadMsgs = async () => {
    const m = await api.entities.CommunityMessage.filter({ community_id: community.id }, "created_date", 100);
    setMessages(m);
    setLoading(false);
  };
  useEffect(() => { loadMsgs(); }, [community.id]);

  useEffect(() => {
    const unsub = api.entities.CommunityMessage.subscribe((event) => {
      if (event.data?.community_id !== community.id) return;
      loadMsgs();
    });
    return unsub;
  }, [community.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    setText("");
    await api.entities.CommunityMessage.create({ community_id: community.id, user_id: me.id, user_name: me.full_name || me.email, text: v });
    loadMsgs();
  };

  return (
    <div dir={dir} className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"><ArrowRight style={{ width: 16, height: 16 }} /> {isAr ? "كل المجتمعات" : "All communities"}</button>
      <div className="zeus-glass p-5 h-[65vh] flex flex-col">
        <div className="pb-3 mb-3 border-b border-border/60">
          <h2 className="font-heading font-bold text-lg">{community.name}</h2>
          <div className="text-xs text-muted-foreground">{community.member_count || 0} {isAr ? "عضو" : "members"} · {community.stage}</div>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pe-1">
          {loading ? <div className="flex justify-center py-8"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 22, height: 22 }} /></div> :
            messages.map((m) => {
              const mine = m.user_id === me.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} animate-fade-up`}>
                  {!mine && <div className="w-8 h-8 shrink-0 rounded-full bg-secondary/60 flex items-center justify-center text-xs font-bold me-2 mt-0.5">{(m.user_name || "?").charAt(0).toUpperCase()}</div>}
                  <div className={`max-w-[75%]`}>
                    {!mine && <div className="text-[11px] text-muted-foreground mb-0.5">{m.user_name}</div>}
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm ${mine ? "bg-zeus-gold text-zeus-midnight rounded-ee-sm" : "bg-card border border-border/60 rounded-es-sm"}`}>{m.text}</div>
                  </div>
                </div>
              );
            })}
          <div ref={endRef} />
        </div>
        <form onSubmit={send} className="mt-3 flex items-center gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={isAr ? "اكتب رسالة..." : "Type a message..."} className="flex-1 px-4 py-3 rounded-full bg-card border border-border/60 focus:zeus-gold-border outline-none text-sm" />
          <button type="submit" className="w-11 h-11 shrink-0 rounded-full bg-zeus-gold text-zeus-midnight flex items-center justify-center hover:bg-zeus-brightgold transition shadow-gold-sm"><Send style={{ width: 18, height: 18 }} /></button>
        </form>
      </div>
    </div>
  );
}