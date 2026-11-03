import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, ArrowLeft, Loader2, X, Mail, Facebook, Instagram, Linkedin, Music2,
  Upload, CreditCard
} from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { validatePhone, validateEmail, validateFullName } from "@/lib/validators";
import Logo from "@/components/zeus/Logo";
import LanguageToggle from "@/components/zeus/LanguageToggle";
import ThemeToggle from "@/components/zeus/ThemeToggle";
import WhatsAppIcon from "@/components/zeus/WhatsAppIcon";

export default function Subscriptions() {
  const { lang, dir } = useI18n();
  const isAr = lang === "ar";
  const { user } = useAuth();
  const nav = useNavigate();
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const [plans, setPlans] = useState([]);
  const [currency, setCurrency] = useState("EGP");
  const [contactEmail, setContactEmail] = useState("zeus.eduai@gmail.com");
  const [socialLinks, setSocialLinks] = useState({});
  const [loading, setLoading] = useState(true);
  const [plansError, setPlansError] = useState("");

  // Modal payment state
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentImage, setPaymentImage] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [enlarged, setEnlarged] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.subscriptions.getPlans();
        if (res && res.plans) {
          setPlans(res.plans);
          if (res.currency) setCurrency(res.currency);
          setContactEmail(res.contact_email || "");
          setSocialLinks(res.social_links || {});
        }
      } catch (err) {
        console.error("Failed to load plans:", err);
        setPlans([]);
        setPlansError(isAr
          ? "تعذر تحميل الباقات من الخادم. لم نعرض أسعارًا قديمة؛ حاول تحديث الصفحة."
          : "Plans could not be loaded from the server. No cached prices are shown; please refresh and try again.");
      } finally {
        try {
          const links = await api.support.socialLinks();
          setSocialLinks((current) => ({ ...current, ...links }));
        } catch (socialError) {
          console.error("Failed to load social links:", socialError);
        }
        setLoading(false);
      }
    })();
  }, []);

  const contactLinks = (compact = false, primaryOnly = false) => {
    const size = compact ? 14 : 16;
    const social = [
      ["whatsapp_url", "WhatsApp", WhatsAppIcon],
      ["facebook_url", "Facebook", Facebook],
      ["tiktok_url", "TikTok", Music2],
      ["instagram_url", "Instagram", Instagram],
      ["linkedin_url", "LinkedIn", Linkedin],
    ].filter(([key]) => !primaryOnly || key === "whatsapp_url");
    return (
      <>
        {contactEmail && (
          <a href={`mailto:${contactEmail}`} className={`inline-flex items-center gap-1.5 rounded-full bg-zeus-gold text-zeus-midnight font-bold hover:bg-zeus-brightgold transition ${compact ? "px-2.5 py-1.5 text-[11px]" : "px-3.5 py-2 text-xs"}`}>
            <Mail style={{ width: size, height: size }} /> {contactEmail}
          </a>
        )}
        {social.map(([key, label, Icon]) => {
          const className = `${compact ? "w-8 h-8" : "w-9 h-9"} rounded-full bg-secondary/60 border border-border/60 flex items-center justify-center transition ${socialLinks[key] ? "hover:border-zeus-gold hover:text-zeus-gold" : "text-muted-foreground/40"}`;
          if (socialLinks[key]) {
            return (
              <a key={key} href={socialLinks[key]} target="_blank" rel="noreferrer" title={label} aria-label={label} className={className}>
                <Icon style={{ width: size, height: size }} />
              </a>
            );
          }
          if (key === "whatsapp_url") {
            return (
              <span key={key} title={label} aria-label={label} className={className}>
                <Icon style={{ width: size, height: size }} />
              </span>
            );
          }
          return null;
        })}
      </>
    );
  };

  const [fieldErrors, setFieldErrors] = useState({ fullName: "", email: "", phone: "" });
  const openSubscribeModal = (plan) => {
    setSelectedPlan(plan);
    setFormError("");
    setSubmitSuccess(false);
    // Start empty by design (no pre-fill). User must type everything.
    setFullName("");
    setEmail("");
    setPhone("");
    setNotes("");
    setPaymentImage(null);
    setImagePreview("");
    setEnlarged(false);
    setFieldErrors({ fullName: "", email: "", phone: "" });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Instant client checks before hitting the server (server re-validates).
    const okType = /^(image\/(png|jpe?g|webp))$/.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name || "");
    if (!okType) {
      setFormError(isAr ? "مسموح صور الإيصال فقط (PNG أو JPG)" : "Receipt images only (PNG or JPG)");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError(isAr ? "الصورة كبيرة — الحد الأقصى 5MB" : "Image too large — max 5MB");
      e.target.value = "";
      return;
    }
    setUploadingImage(true);
    setFormError("");
    try {
      // Public endpoint: works for pending users with no login session.
      const res = await api.subscriptions.uploadReceipt({ file });
      const url = res.file_url || res.url;
      if (!url) throw new Error("no url");
      setPaymentImage(url);
      setImagePreview(URL.createObjectURL(file));
    } catch (err) {
      // Never redirect on upload failure — stay on the form and explain.
      setFormError(err.message || (isAr ? "فشل رفع الصورة، يرجى المحاولة مرة أخرى" : "Image upload failed, try again"));
      e.target.value = "";
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    setFormError("");
    const fe = { fullName: "", email: "", phone: "" };
    const nRes = validateFullName(fullName);
    if (!nRes.ok) fe.fullName = isAr ? nRes.errorAr : nRes.errorEn;
    const eRes = validateEmail(email);
    if (!eRes.ok) fe.email = isAr ? eRes.errorAr : eRes.errorEn;
    const pRes = validatePhone(phone);
    if (!pRes.ok) fe.phone = isAr ? pRes.errorAr : pRes.errorEn;
    setFieldErrors(fe);
    const firstErr = fe.fullName || fe.email || fe.phone;
    if (firstErr) {
      setFormError(firstErr);
      return;
    }
    if (!paymentImage) {
      setFormError(isAr ? "يرجى رفع صورة إيصال أو تأكيد التحويل" : "Please upload payment transfer confirmation image");
      return;
    }

    setSubmitting(true);
    try {
      await api.subscriptions.submitPayment({
        full_name: nRes.value,
        email: eRes.value,
        phone: pRes.value,
        plan: selectedPlan.id,
        payment_image_url: paymentImage,
        notes: notes,
      });
      setSubmitSuccess(true);
    } catch (err) {
      setFormError(err.message || (isAr ? "حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى" : "Submission failed, try again"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="subscriptions-page min-h-screen bg-background" dir={dir}>
      {/* Top Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/40">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="subscription-logo flex h-11 items-center rounded-xl px-3">
              <Logo size={28} />
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <ThemeToggle />
            {user ? (
              <Link
                to="/app"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-zeus-gold/40 text-zeus-brightgold text-xs font-semibold hover:bg-zeus-gold/10 transition"
              >
                {isAr ? "لوحة التحكم" : "Dashboard"} <Arrow style={{ width: 14, height: 14 }} />
              </Link>
            ) : plansError ? (
              <div role="alert" className="mx-auto max-w-2xl rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive">
                {plansError}
              </div>
            ) : plans.length === 0 ? (
              <div role="status" className="mx-auto max-w-2xl rounded-2xl border border-border/70 bg-card/70 p-6 text-center text-sm text-muted-foreground">
                {isAr ? "لا توجد باقات متاحة حاليًا." : "No plans are available right now."}
              </div>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-zeus-gold text-zeus-midnight text-xs font-semibold hover:bg-zeus-brightgold transition shadow-gold-sm"
              >
                {isAr ? "تسجيل الدخول" : "Log in"}
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-5 py-12 lg:py-20">
        <section className="mx-auto mb-12 max-w-3xl rounded-3xl border border-border/60 zeus-glass px-6 py-8 text-center shadow-sm sm:px-10">
          <h1 className="font-heading text-2xl font-extrabold sm:text-4xl">
            {isAr ? "للتواصل معنا" : "Contact us"}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {isAr
              ? "لمعرفة كيفية الاشتراك في زيوس، تواصل معنا عبر البريد الإلكتروني أو صفحات التواصل الاجتماعي. وللحصول على معلومات الدفع، تواصل معنا عبر واتساب."
              : "To learn how to subscribe to ZEUS, contact us by email or through our social media pages. For payment information, contact us on WhatsApp."}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {contactLinks()}
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="text-zeus-gold animate-spin" style={{ width: 36, height: 36 }} />
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-8 items-stretch max-w-6xl mx-auto">
            {plans.map((plan) => {
              const isPrime = plan.id === "PRIME";
              const isPro = plan.id === "PRO";
              const badge = String(plan.badge || "").trim();
              const badgeKey = badge.toLowerCase();
              const badgeLabel = isAr && isPrime
                ? "الخطة الشاملة"
                : badgeKey === "popular"
                  ? (isAr ? "أفضل قيمة" : "Best Value")
                  : badgeKey === "best value"
                    ? (isAr ? "الأكثر انتشارًا" : "Popular")
                    : badgeKey === "complete"
                      ? (isAr ? "الخطة الشاملة" : "Complete")
                      : badge;

              return (
                <div
                  key={plan.id}
                  className={`subscription-plan-card relative flex flex-col justify-between rounded-3xl p-7 transition-all duration-300 ${
                    isPrime
                      ? "subscription-plan-featured bg-gradient-to-b from-zeus-gold/15 via-card to-card border-2 border-zeus-gold shadow-gold"
                      : plan.id === "PRO"
                        ? "zeus-glass border-zeus-gold/50 shadow-md"
                        : "zeus-glass border-border/70"
                  }`}
                >
                  {plan.badge && (
                    <div className="subscription-plan-badge absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-zeus-gold to-zeus-brightgold text-zeus-midnight text-[11px] font-extrabold shadow-sm tracking-wide uppercase">
                      {badgeLabel}
                    </div>
                  )}

                  <div>
                    <div className="mb-4">
                      <span className="font-heading font-black text-xl tracking-wider text-foreground">
                        {plan.name}
                      </span>
                    </div>

                    <div className="mb-6 flex items-baseline gap-1">
                      <span className="font-heading font-extrabold text-4xl sm:text-5xl text-zeus-brightgold">
                        {plan.price}
                      </span>
                      <span className="text-muted-foreground text-sm font-medium">
                        {currency} / {isAr ? "شهر" : "Month"}
                      </span>
                    </div>

                    <div className="w-full border-t border-border/50 mb-6" />

                    {plan.description && (
                      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                        {typeof plan.description === "object" ? (isAr ? plan.description.ar : plan.description.en) : plan.description}
                      </p>
                    )}
                    <ul className="space-y-3.5 text-xs sm:text-sm">
                      {plan.features.map((feat, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-2.5">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zeus-gold">
                          </span>
                          <span className="text-foreground/90 font-medium">
                            {typeof feat === "object" ? (isAr ? feat.ar : feat.en) : feat}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-8 pt-4">
                    <button
                      type="button"
                      onClick={() => openSubscribeModal(plan)}
                      className={`subscription-plan-button w-full py-3.5 px-5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition shadow-sm ${
                        isPrime
                          ? "bg-gradient-to-r from-zeus-gold to-zeus-brightgold text-zeus-midnight hover:opacity-95 shadow-gold"
                          : isPro
                          ? "bg-zeus-gold text-zeus-midnight hover:bg-zeus-brightgold"
                          : "bg-secondary text-foreground hover:bg-secondary/80 border border-border"
                      }`}
                    >
                      <span>{isAr ? "اشترك الآن" : "Subscribe Now"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Subscription Payment Submission Modal */}
      <AnimatePresence>
        {selectedPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="subscription-form-modal relative w-full max-w-lg rounded-3xl zeus-glass border border-zeus-gold/40 p-6 sm:p-8 overflow-y-auto max-h-[90vh] bg-card text-foreground"
            >
              <button
                onClick={() => setSelectedPlan(null)}
                className="absolute top-5 end-5 w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center hover:bg-secondary transition"
              >
                <X style={{ width: 16, height: 16 }} />
              </button>

              {/* Receipt lightbox */}
              {enlarged && paymentImage && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={() => setEnlarged(false)}>
                  <img src={paymentImage} alt={isAr ? "صورة إيصال التحويل" : "Transfer receipt"}
                    className="max-h-[90vh] max-w-full rounded-2xl shadow-2xl border border-zeus-gold/40" onClick={(e) => e.stopPropagation()} />
                  <button onClick={() => setEnlarged(false)}
                    className="absolute top-5 end-5 w-10 h-10 rounded-full bg-secondary/80 text-foreground flex items-center justify-center hover:bg-secondary transition text-lg">
                    ×
                  </button>
                </div>
              )}

              <div className="mb-6">
                <span className="text-xs font-bold uppercase tracking-wider text-zeus-brightgold">
                  {isAr ? "طلب الاشتراك في باقة" : "Subscribe to Plan"} {selectedPlan.name}
                </span>
                <h3 className="font-heading font-extrabold text-2xl mt-1">
                  {selectedPlan.price} {currency} / {isAr ? "شهر" : "Month"}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {isAr ? "أدخل بياناتك وأرفق إيصال التحويل لإرسال الطلب." : "Enter your details and attach the payment receipt to submit."}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {contactEmail && (
                    <a href={`mailto:${contactEmail}`} className="text-xs text-zeus-brightgold underline-offset-2 hover:underline">
                      {isAr ? "تواصل معنا عبر البريد" : "Contact us by email"}
                    </a>
                  )}
                  {contactLinks(true, true)}
                </div>
              </div>

              {submitSuccess ? (
                <div className="py-8 text-center space-y-4">
                  <h4 className="font-heading font-bold text-xl">
                    {isAr ? "تم إرسال طلب الاشتراك بنجاح" : "Request submitted successfully"}
                  </h4>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                    {isAr
                      ? "استلمنا طلبك وسيراجعه فريق الإدارة قريبًا."
                      : "Our team received your request and will review it shortly."}
                  </p>
                  <button
                    onClick={() => {
                      setSelectedPlan(null);
                      nav(user ? "/app" : "/login");
                    }}
                    className="px-6 py-3 rounded-full bg-zeus-gold text-zeus-midnight font-bold text-sm mt-3"
                  >
                    {isAr ? "متابعة" : "Continue"}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitPayment} className="space-y-4 text-start">
                  {formError && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/15 p-3 text-xs text-destructive">{formError}</div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold mb-1.5">
                      {isAr ? "الاسم بالكامل" : "Full name"}
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={isAr ? "اكتب اسمك الثلاثي أو الرباعي" : "Enter your full name"}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm focus:outline-none focus:border-zeus-gold"
                      required
                      maxLength={100}
                    />
                    {fieldErrors.fullName && <p className="text-destructive text-xs mt-1">{fieldErrors.fullName}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5">
                      {isAr ? "البريد الإلكتروني المستخدم في التسجيل" : "Registration email"}
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your.email@example.com"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm focus:outline-none focus:border-zeus-gold"
                      required
                      maxLength={254}
                    />
                    {fieldErrors.email && <p className="text-destructive text-xs mt-1">{fieldErrors.email}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5">
                      {isAr ? "رقم الهاتف المستخدم في تحويل المبلغ" : "Payment phone number"}
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      dir="ltr"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[^0-9]/g, "").slice(0, 11))}
                      placeholder="01XXXXXXXXX"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm focus:outline-none focus:border-zeus-gold"
                      required
                      maxLength={11}
                    />
                    {fieldErrors.phone && <p className="text-destructive text-xs mt-1">{fieldErrors.phone}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5">
                      {isAr ? "صورة إيصال التحويل" : "Payment receipt"}
                    </label>
                    <div className="border-2 border-dashed border-border/80 rounded-2xl p-4 text-center hover:border-zeus-gold/60 transition bg-secondary/20">
                      {paymentImage ? (
                        <div className="relative inline-block">
                          <button type="button" onClick={() => setEnlarged(true)} title={isAr ? "اضغط للتكبير" : "Click to enlarge"}
                            className="block cursor-zoom-in">
                            <img
                              src={paymentImage}
                              onError={(e) => { if (imagePreview && e.currentTarget.src !== imagePreview) e.currentTarget.src = imagePreview; }}
                              alt={isAr ? "صورة إيصال التحويل" : "Transfer receipt"}
                              className="max-h-64 rounded-xl mx-auto shadow-md border border-border/40"
                            />
                          </button>
                          <span className="block text-[11px] text-muted-foreground mt-1.5">{isAr ? "اضغط على الصورة للتكبير" : "Click image to enlarge"}</span>
                          <button
                            type="button"
                            onClick={() => { setPaymentImage(null); setImagePreview(""); setEnlarged(false); }}
                            className="absolute -top-2 -end-2 w-6 h-6 rounded-full bg-destructive text-white flex items-center justify-center text-xs"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer flex flex-col items-center gap-2">
                          {uploadingImage ? (
                            <Loader2 className="animate-spin text-zeus-gold" style={{ width: 24, height: 24 }} />
                          ) : (
                            <Upload className="text-muted-foreground" style={{ width: 24, height: 24 }} />
                          )}
                          <span className="text-xs text-muted-foreground font-medium">
                            {uploadingImage
                              ? (isAr ? "جاري الرفع..." : "Uploading...")
                              : (isAr ? "انقر لاختيار صورة إيصال التحويل" : "Click to select confirmation image")}
                          </span>
                          <input
                            type="file"
                            accept=".png,.jpg,.jpeg,.webp"
                            onChange={handleImageUpload}
                            className="hidden"
                            disabled={uploadingImage}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5">
                      {isAr ? "ملاحظات إضافية (اختياري)" : "Additional notes (optional)"}
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={isAr ? "أي معلومات إضافية عن التحويل..." : "Any additional notes..."}
                      className="w-full px-3.5 py-2 rounded-xl bg-secondary/50 border border-border text-sm focus:outline-none focus:border-zeus-gold"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || uploadingImage}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-zeus-gold to-zeus-brightgold text-zeus-midnight font-bold text-sm hover:opacity-95 transition disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
                  >
                    {submitting ? (
                      <Loader2 className="animate-spin" style={{ width: 18, height: 18 }} />
                    ) : (
                      <>
                        <CreditCard style={{ width: 18, height: 18 }} />
                        <span>{isAr ? "تأكيد وإرسال طلب الاشتراك" : "Submit Payment Confirmation"}</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
