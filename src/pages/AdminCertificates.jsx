import { useEffect, useState } from "react";
import { Award, ChevronDown, ChevronUp, Loader2, Search, Upload, Users } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg"];

export default function AdminCertificates() {
  const { dir, lang } = useI18n();
  const isAr = lang === "ar";
  const [recipients, setRecipients] = useState([]);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async (term = search) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.certificates.adminList(term);
      const grouped = new Map();
      for (const certificate of result.certificates || []) {
        const recipient = grouped.get(certificate.user_id) || {
          id: certificate.user_id,
          name: certificate.full_name || certificate.email,
          email: certificate.email,
          certificates: [],
        };
        recipient.certificates.push(certificate);
        grouped.set(certificate.user_id, recipient);
      }
      setRecipients([...grouped.values()]);
    } catch (loadError) {
      setError(loadError.message || (isAr ? "تعذر تحميل سجل الشهادات." : "Could not load certificate history."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(""); }, []);

  const handleSend = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!file) {
      setError(isAr ? "اختر صورة أو ملف PDF للشهادة." : "Choose a certificate image or PDF.");
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(isAr ? "الصيغ المدعومة PDF أو PNG أو JPG." : "Supported formats are PDF, PNG, and JPG.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(isAr ? "حجم الملف لازم يكون 10 ميجابايت أو أقل." : "The file must be 10 MB or smaller.");
      return;
    }
    setSending(true);
    try {
      await api.certificates.send({ recipient_email: email, title, file });
      setNotice(isAr
        ? "تم إرسال الشهادة إلى حساب المستخدم، وستظهر في صفحة شهاداتي مع إشعار داخل التطبيق. لم يُرسل بريد إلكتروني."
        : "Certificate delivered to the user's account and in-app notification. No email was sent.");
      setEmail("");
      setTitle("");
      setFile(null);
      event.currentTarget.reset();
      await load(search);
    } catch (sendError) {
      setError(sendError.message || (isAr ? "تعذر إرسال الشهادة." : "Could not send the certificate."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div dir={dir} className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zeus-gold/15">
          <Award className="h-6 w-6 text-zeus-gold" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{isAr ? "الشهادات" : "Certificates"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAr ? "أرسل شهادة لحساب مستخدم وتابع سجل الشهادات المرسلة." : "Send certificates to user accounts and review delivery history."}
          </p>
        </div>
      </header>

      <form onSubmit={handleSend} className="zeus-glass space-y-4 p-5">
        <h2 className="font-heading text-base font-bold">{isAr ? "إرسال شهادة" : "Send a certificate"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium">
            {isAr ? "بريد حساب المستخدم" : "User account email"}
            <input type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com" className="rounded-xl border border-border/60 bg-card px-3 py-2.5 text-sm" />
          </label>
          <label className="grid gap-1.5 text-xs font-medium">
            {isAr ? "اسم الشهادة (اختياري)" : "Certificate title (optional)"}
            <input maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)}
              placeholder={isAr ? "مثال: إتمام دورة React" : "e.g. React course completion"} className="rounded-xl border border-border/60 bg-card px-3 py-2.5 text-sm" />
          </label>
        </div>
        <label className="grid gap-1.5 text-xs font-medium">
          {isAr ? "صورة الشهادة أو ملف PDF (حد أقصى 10 ميجابايت)" : "Certificate image or PDF (10 MB max)"}
          <input type="file" required accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="rounded-xl border border-border/60 bg-card px-3 py-2.5 text-sm file:me-3 file:rounded-lg file:border-0 file:bg-zeus-gold/15 file:px-3 file:py-1.5" />
        </label>
        {file && <p className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-xs text-muted-foreground">
            {isAr ? "سيتم ربط الشهادة بالحساب المطابق للبريد، وستظهر داخل صفحة الشهادات والإشعارات. الإرسال بالبريد الإلكتروني غير مفعّل في إعدادات الموقع الحالية." : "The certificate is attached to the account matching this email and appears in its certificate page and notifications. Outbound email is not configured."}
          </p>
          <button type="submit" disabled={sending}
            className="inline-flex items-center gap-2 rounded-xl bg-zeus-gold px-4 py-2.5 text-sm font-bold text-zeus-midnight disabled:opacity-50">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isAr ? "إرسال الشهادة" : "Deliver certificate"}
          </button>
        </div>
      </form>

      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">{notice}</p>}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold">{isAr ? "سجل الشهادات المرسلة" : "Sent certificate history"}</h2>
            <p className="text-xs text-muted-foreground">{isAr ? "ابحث بالاسم أو البريد، واضغط على المستخدم لعرض كل شهاداته." : "Search by name or email, then expand a recipient to view all certificates."}</p>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); load(searchInput.trim()); }}
            className="flex w-full gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-72">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)}
                placeholder={isAr ? "ابحث عن اسم أو بريد..." : "Search name or email..."}
                className="w-full rounded-xl border border-border/60 bg-card py-2.5 ps-9 pe-3 text-sm" />
            </div>
            <button type="submit" disabled={loading} className="rounded-xl border border-border/60 px-3 py-2 text-xs font-semibold disabled:opacity-50">
              {isAr ? "بحث" : "Search"}
            </button>
          </form>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-zeus-gold" /></div>
        ) : recipients.length === 0 ? (
          <div className="zeus-glass p-8 text-center text-sm text-muted-foreground">
            {isAr ? "لا توجد شهادات مطابقة." : "No matching certificates."}
          </div>
        ) : (
          <div className="space-y-3">
            {recipients.map((recipient) => {
              const isOpen = Boolean(expanded[recipient.id]);
              return (
                <article key={recipient.id} className="zeus-glass overflow-hidden">
                  <button type="button" onClick={() => setExpanded((current) => ({ ...current, [recipient.id]: !isOpen }))}
                    className="flex w-full items-center gap-3 p-4 text-start hover:bg-secondary/20">
                    <Users className="h-5 w-5 shrink-0 text-zeus-gold" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{recipient.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{recipient.email}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{recipient.certificates.length} {isAr ? "شهادة" : "certificates"}</span>
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {isOpen && (
                    <div className="space-y-2 border-t border-border/40 p-4">
                      {recipient.certificates.map((certificate) => (
                        <div key={certificate.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/20 p-3">
                          <div>
                            <p className="text-sm font-medium">{certificate.title}</p>
                            <p className="text-xs text-muted-foreground">{certificate.file_name} · {new Date(certificate.created_date).toLocaleDateString(isAr ? "ar-EG" : "en-US")}</p>
                          </div>
                          {certificate.share_url && (
                            <a href={certificate.share_url} target="_blank" rel="noreferrer"
                              className="rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold text-zeus-brightgold hover:border-zeus-gold/50">
                              {isAr ? "عرض الشهادة" : "View certificate"}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
