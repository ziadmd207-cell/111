import { useEffect, useState } from "react";
import { ArrowLeft, Facebook, ImagePlus, Instagram, Linkedin, Loader2, MessageCircleQuestion, Music2, Send } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import WhatsAppIcon from "@/components/zeus/WhatsAppIcon";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const SOCIALS = [
  { key: "whatsapp_url", label: "WhatsApp", Icon: WhatsAppIcon },
  { key: "facebook_url", label: "Facebook", Icon: Facebook },
  { key: "linkedin_url", label: "LinkedIn", Icon: Linkedin },
  { key: "instagram_url", label: "Instagram", Icon: Instagram },
  { key: "tiktok_url", label: "TikTok", Icon: Music2 },
];
const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export function SocialFooter() {
  const { lang, dir } = useI18n();
  const isAr = lang === "ar";
  const [links, setLinks] = useState({});

  useEffect(() => {
    let active = true;
    const loadLinks = () => {
      api.support.socialLinks()
        .then((result) => { if (active) setLinks(result || {}); })
        .catch((error) => console.error("Could not load social links:", error));
    };
    loadLinks();
    window.addEventListener("zeus-social-links-updated", loadLinks);
    return () => {
      active = false;
      window.removeEventListener("zeus-social-links-updated", loadLinks);
    };
  }, []);

  return (
    <footer dir={dir} className="border-t border-border/40 bg-background/80 py-6 pb-24 sm:pb-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-3 px-5">
        <div className="flex items-center justify-center gap-2">
          {SOCIALS.map(({ key, label, Icon }) => links[key] ? (
            <a
              key={key}
              href={links[key]}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              title={label}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:border-zeus-gold/60 hover:text-zeus-brightgold"
            >
              <Icon className="h-4 w-4" />
            </a>
          ) : (
            <span
              key={key}
              aria-label={label}
              title={label}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/40 text-muted-foreground/35"
            >
              <Icon className="h-4 w-4" />
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {isAr ? "الحقوق محفوظة © 2026 ZEUS" : "© 2026 ZEUS. All rights reserved."}
        </p>
      </div>
    </footer>
  );
}

export function GlobalSupport() {
  const { lang, dir } = useI18n();
  const isAr = lang === "ar";
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [choice, setChoice] = useState("menu");
  const [socialLinks, setSocialLinks] = useState({});
  const [form, setForm] = useState({ email: "", phone: "", problem: "", images: [] });

  useEffect(() => {
    let active = true;
    const loadLinks = () => {
      api.support.socialLinks()
        .then((result) => { if (active) setSocialLinks(result || {}); })
        .catch((loadError) => console.error("Could not load support contact links:", loadError));
    };
    loadLinks();
    window.addEventListener("zeus-social-links-updated", loadLinks);
    return () => {
      active = false;
      window.removeEventListener("zeus-social-links-updated", loadLinks);
    };
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.support.submit(form);
      setSubmitted(true);
      setForm({ email: "", phone: "", problem: "", images: [] });
    } catch (err) {
      setError(err.message || (isAr ? "تعذر إرسال طلب الدعم. حاول مرة أخرى." : "Could not submit your request. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const onOpenChange = (nextOpen) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setSubmitted(false);
      setError("");
      setChoice("menu");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-label={isAr ? "تواصل مع الدعم" : "Contact support"}
        title={isAr ? "الدعم" : "Support"}
        className="fixed bottom-24 end-4 z-40 inline-flex h-12 items-center gap-2 rounded-full border border-zeus-gold/40 bg-card px-4 text-sm font-semibold text-zeus-brightgold shadow-lg transition hover:-translate-y-0.5 hover:bg-zeus-gold/10 md:bottom-6 md:end-6"
      >
        <MessageCircleQuestion className="h-5 w-5" />
        <span>{isAr ? "الدعم" : "Support"}</span>
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent dir={dir} className="max-h-[90vh] overflow-y-auto rounded-2xl border-border/70 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-start text-xl">
              {isAr ? "الدعم" : "Support"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {isAr ? "اختار طريقة التواصل مع الدعم" : "Choose a way to contact support"}
            </DialogDescription>
          </DialogHeader>

          {submitted ? (
            <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
              <div className="mb-1 font-semibold text-emerald-400">{isAr ? "وصلنا طلبك بنجاح ✓" : "Your request was sent ✓"}</div>
              <p className="text-sm text-muted-foreground">{isAr ? "فريق الدعم هيراجعه ويتواصل معاك." : "Our support team will review it and get back to you."}</p>
              <button type="button" onClick={() => setOpen(false)} className="mt-4 rounded-full bg-zeus-gold px-5 py-2 text-sm font-semibold text-zeus-midnight">
                {isAr ? "تمام" : "Done"}
              </button>
            </div>
          ) : choice === "menu" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  const waUrl = socialLinks.whatsapp_url;
                  if (!waUrl) {
                    setError(isAr ? "رابط واتساب غير متاح حالياً. اختار إرسال طلب." : "WhatsApp is not configured yet. Please send a support request.");
                    return;
                  }
                  window.open(waUrl, "_blank", "noopener,noreferrer");
                  setOpen(false);
                }}
                className="group flex min-h-20 items-center justify-center gap-2.5 rounded-2xl border border-border/70 bg-card p-4 text-center transition hover:border-zeus-gold/60"
              >
                <WhatsAppIcon className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold">{isAr ? "واتساب" : "WhatsApp"}</span>
              </button>
              <button
                type="button"
                onClick={() => { setChoice("form"); setError(""); }}
                className="group flex min-h-20 items-center justify-center gap-2.5 rounded-2xl border border-border/70 bg-card p-4 text-center transition hover:border-zeus-gold/60"
              >
                <Send className="h-4 w-4 text-zeus-gold" />
                <span className="font-semibold">{isAr ? "إرسال طلبك" : "Send a request"}</span>
              </button>
              {error && <p role="alert" className="sm:col-span-2 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-400">{error}</p>}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <button type="button" onClick={() => { setChoice("menu"); setError(""); }} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" />{isAr ? "رجوع لخيارات الدعم" : "Back to support options"}
              </button>
              <label className="block space-y-1.5 text-sm font-medium">
                <span>{isAr ? "البريد الإلكتروني" : "Email address"}</span>
                <input
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  className="w-full rounded-xl border border-border/70 bg-background px-3.5 py-3 text-sm outline-none transition focus:border-zeus-gold"
                  placeholder="name@example.com"
                />
              </label>
              <label className="block space-y-1.5 text-sm font-medium">
                <span>{isAr ? "رقم التليفون" : "Phone number"}</span>
                <input
                  type="tel"
                  autoComplete="tel"
                  maxLength={32}
                  required
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  className="w-full rounded-xl border border-border/70 bg-background px-3.5 py-3 text-sm outline-none transition focus:border-zeus-gold"
                  placeholder="+20 1xx xxx xxxx"
                />
              </label>
              <label className="block space-y-1.5 text-sm font-medium">
                <span>{isAr ? "تفاصيل الطلب" : "Request details"}</span>
                <textarea
                  required
                  minLength={5}
                  maxLength={3000}
                  rows={5}
                  value={form.problem}
                  onChange={(event) => setForm({ ...form, problem: event.target.value })}
                  className="w-full resize-y rounded-xl border border-border/70 bg-background px-3.5 py-3 text-sm outline-none transition focus:border-zeus-gold"
                  placeholder={isAr ? "اكتب تفاصيل طلبك وأي معلومات تساعدنا..." : "Describe what you need and include any helpful details..."}
                />
                <span className="block text-end text-[11px] text-muted-foreground">{form.problem.length}/3000</span>
              </label>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 px-4 py-3 text-sm text-muted-foreground transition hover:border-zeus-gold/60 hover:text-foreground">
                  <ImagePlus className="h-4 w-4 text-zeus-gold" />
                  <span>{isAr ? "إرفاق صور (حتى 4 صور، 5MB للصورة)" : "Attach images (up to 4, 5MB each)"}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      const selected = Array.from(event.target.files || []);
                      const combined = [...form.images, ...selected];
                      if (combined.length > MAX_IMAGES) {
                        setError(isAr ? "مسموح إرفاق 4 صور كحد أقصى." : "You can attach up to 4 images.");
                        event.target.value = "";
                        return;
                      }
                      const tooLarge = combined.find((image) => image.size > MAX_IMAGE_SIZE);
                      if (tooLarge) {
                        setError(isAr ? "حجم كل صورة لازم يكون 5 ميجابايت أو أقل." : "Each image must be 5MB or smaller.");
                        event.target.value = "";
                        return;
                      }
                      setError("");
                      setForm({ ...form, images: combined });
                      event.target.value = "";
                    }}
                  />
                </label>
                {form.images.length > 0 && (
                  <ul className="space-y-1">
                    {form.images.map((image, index) => (
                      <li key={`${image.name}-${image.lastModified}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-xs">
                        <span className="truncate">{image.name}</span>
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, images: form.images.filter((_, imageIndex) => imageIndex !== index) })}
                          aria-label={isAr ? `حذف ${image.name}` : `Remove ${image.name}`}
                          className="shrink-0 rounded-full px-1.5 text-base text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >×</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {error && <p role="alert" className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-400">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zeus-gold px-4 py-3 font-semibold text-zeus-midnight transition hover:bg-zeus-brightgold disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isAr ? "إرسال الطلب" : "Send request"}
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
