import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, LifeBuoy, Loader2, MessageCircle, RefreshCw, Search } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import SupportChatThread from "@/components/zeus/SupportChatThread";

export default function AdminSupportChats() {
  const { lang, dir } = useI18n();
  const isAr = lang === "ar";
  const [chats, setChats] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadChats = useCallback(async () => {
    try {
      const result = await api.admin.get("/support-chats");
      setChats(result || []);
      setError("");
    } catch (loadError) {
      setError(loadError.message || (isAr ? "تعذر تحميل محادثات الدعم." : "Could not load support chats."));
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  useEffect(() => {
    loadChats();
    const timer = window.setInterval(loadChats, 5000);
    return () => window.clearInterval(timer);
  }, [loadChats]);

  const updateChat = useCallback((updated) => {
    setChats((items) => items.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
  }, []);

  const filteredChats = chats.filter((chat) => {
    const needle = search.trim().toLowerCase();
    return !needle || [chat.name, chat.email, chat.phone].some((value) => (value || "").toLowerCase().includes(needle));
  });
  const selectedChat = chats.find((chat) => chat.id === selectedId);
  const initials = (name) => {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
  };
  const messagePreview = (chat) =>
    chat.last_message?.text ||
    chat.last_message?.attachments?.[0]?.name ||
    (isAr ? "ابدأ المحادثة" : "Start a conversation");
  const formatTime = (value) => value
    ? new Date(value).toLocaleTimeString(isAr ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div dir={dir} className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <LifeBuoy className="h-5 w-5 text-zeus-gold" />
            {isAr ? "محادثات الدعم" : "Support chats"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">{isAr ? "كل المحادثات محفوظة، تابع رسائل العملاء ورد عليهم من مكان واحد." : "Conversations are saved so you can follow up and reply from one place."}</p>
        </div>
        <button type="button" onClick={loadChats} className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-2 text-xs hover:border-zeus-gold/60">
          <RefreshCw className="h-3.5 w-3.5" />{isAr ? "تحديث" : "Refresh"}
        </button>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">{error}</p>}

      <div className="grid h-[76vh] min-h-[420px] max-h-[860px] overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xl md:grid-cols-[minmax(280px,360px)_1fr]">
        <aside className={`min-h-0 flex-col border-e border-border/60 bg-card ${selectedChat ? "hidden md:flex" : "flex"}`}>
          <div className="border-b border-border/60 bg-[#f0f2f5] p-3 dark:bg-[#202c33]">
            <label className="relative block">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isAr ? "ابحث بالاسم أو البريد أو الهاتف" : "Search name, email, or phone"}
                className="w-full rounded-xl border border-border/60 bg-background py-2.5 pe-3 ps-9 text-xs outline-none focus:border-zeus-gold" />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-zeus-gold" /></div>
            ) : filteredChats.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted-foreground">{isAr ? "مفيش محادثات لسه." : "No conversations yet."}</p>
            ) : filteredChats.map((chat) => (
              <button key={chat.id} type="button" onClick={() => setSelectedId(chat.id)}
                className={`flex w-full items-center gap-3 border-b border-border/40 px-3 py-3.5 text-start transition hover:bg-secondary/40 ${selectedId === chat.id ? "bg-secondary/50" : ""}`}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#d9fdd3] text-sm font-bold text-[#075e54] dark:bg-[#005c4b] dark:text-[#d9fdd3]">{initials(chat.email)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold" dir="ltr">{chat.email}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <time className="text-[10px] text-muted-foreground">{formatTime(chat.updated_date)}</time>
                      {!!chat.unread_admin && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[10px] font-bold text-[#075e54]">{chat.unread_admin}</span>}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{messagePreview(chat)}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className={`min-h-0 flex-col bg-[#efeae2] dark:bg-[#0b141a] ${selectedChat ? "flex" : "hidden md:flex"}`}>
          {selectedChat ? (
            <>
              <header className="flex items-center gap-2 border-b border-border/50 bg-[#f0f2f5] px-3 py-2.5 dark:bg-[#202c33] sm:px-4">
                <button type="button" onClick={() => setSelectedId("")} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary md:hidden" aria-label={isAr ? "رجوع" : "Back"}>
                  <ArrowLeft className={`h-4 w-4 ${dir === "rtl" ? "rotate-180" : ""}`} />
                </button>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d9fdd3] text-sm font-bold text-[#075e54] dark:bg-[#005c4b] dark:text-[#d9fdd3]">{initials(selectedChat.email)}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-bold" dir="ltr">{selectedChat.email}</h2>
                  {selectedChat.phone && <p className="truncate text-[11px] text-muted-foreground" dir="ltr">{selectedChat.phone}</p>}
                </div>
                <MessageCircle className="h-5 w-5 shrink-0 text-[#128c7e]" />
              </header>
              <SupportChatThread chatId={selectedChat.id} isAr={isAr} adminMode onChatUpdated={updateChat} />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 border-b-4 border-[#25d366] px-6 text-center text-muted-foreground">
              <MessageCircle className="h-8 w-8 opacity-40" />
              <p className="text-sm">{isAr ? "اختار محادثة عشان تعرض الرسائل وترد." : "Select a conversation to view and reply."}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
