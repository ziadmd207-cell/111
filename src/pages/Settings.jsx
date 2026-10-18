import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Settings as SettingsIcon, LogOut, Check, Loader2, User, Palette, Camera, Upload } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";

export default function Settings() {
  const { t, lang, dir } = useI18n();
  const { profile, updateProfile } = useProfile();
  const isAr = lang === "ar";
  const nav = useNavigate();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [savingName, setSavingName] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [cv, setCv] = useState(null);
  const [uploading, setUploading] = useState(null);

  useEffect(() => {
    (async () => {
      // Photo/accent/voice controls edit the CV: guarantee one exists so
      // they never silently do nothing for new users.
      const c = await api.entities.CV.filter({}, "-created_date", 1);
      if (c.length) { setCv(c[0]); return; }
      try {
        const me = await api.auth.me().catch(() => null);
        const created = await api.entities.CV.create({
          full_name: profile?.full_name || me?.full_name || "",
          email: me?.email || "",
          title_role: profile?.goal || "",
        });
        setCv(created);
      } catch {}
    })();
  }, []);

  const updateAccent = async (color) => {
    try {
      if (cv) {
        const updated = await api.entities.CV.update(cv.id, { accent_color: color });
        setCv(updated);
      }
    } catch (e) {}
  };

  const uploadFile = async (file, field) => {
    setUploading(field);
    try {
      const { file_url } = await api.integrations.Core.UploadPublicFile({ file });
      if (cv) {
        const updated = await api.entities.CV.update(cv.id, { [field]: file_url });
        setCv(updated);
      }
    } catch (e) {}
    setUploading(null);
  };

  const saveFullName = async () => {
    const v = fullName.trim().replace(/\s+/g, " ");
    if (v.length < 3) { setSaveMsg(isAr ? "الاسم قصير جدًا" : "Name is too short"); return; }
    setSavingName(true);
    setSaveMsg("");
    try {
      await updateProfile({ full_name: v });
      setSaveMsg(isAr ? "تم الحفظ بنجاح" : "Saved successfully");
    } catch {
      setSaveMsg(isAr ? "فشل الحفظ — حاول تاني" : "Save failed — try again");
    }
    setSavingName(false);
  };

  const logout = async () => { await api.auth.logout(); nav("/"); };

  return (
    <div dir={dir} className="space-y-5 max-w-2xl">
      <h1 className="font-heading font-extrabold text-2xl sm:text-3xl flex items-center gap-2"><SettingsIcon className="text-zeus-gold" style={{ width: 28, height: 28 }} /> {t("nav.settings")}</h1>

      {/* Language + theme live in the Header — removed here to avoid duplication. */}

      <div className="zeus-glass p-5">
        <div className="flex items-center gap-2 mb-3"><User className="text-zeus-gold" style={{ width: 18, height: 18 }} /><h2 className="font-heading font-bold text-sm">{isAr ? "الاسم الكامل" : "Full Name"}</h2></div>
        <div className="flex gap-2">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={isAr ? "اكتب اسمك الكامل" : "Enter your full name"}
            className="flex-1 px-4 py-3 rounded-xl bg-card border border-border/60 focus:zeus-gold-border outline-none text-sm" />
          <button onClick={saveFullName} disabled={savingName} className="px-5 rounded-xl bg-zeus-gold text-zeus-midnight font-medium text-sm hover:bg-zeus-brightgold transition disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0">
            {savingName ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : <Check style={{ width: 16, height: 16 }} />} {t("common.save")}
          </button>
        </div>
        {saveMsg && <p className="text-xs text-muted-foreground mt-2">{saveMsg}</p>}
      </div>

      <Link to="/profile" className="zeus-glass p-5 flex items-center gap-3 hover:zeus-gold-border transition">
        <User className="text-zeus-gold" style={{ width: 18, height: 18 }} />
        <span className="text-sm font-medium flex-1">{isAr ? "ملفك الشخصي وبيانات التعلّم" : "Profile & Learning DNA"}</span>
        <span className="text-xs text-muted-foreground">{isAr ? "تعديل" : "Edit"}</span>
      </Link>

      <div className="zeus-glass p-5">
        <div className="flex items-center gap-2 mb-3"><Camera className="text-zeus-gold" style={{ width: 18, height: 18 }} /><h2 className="font-heading font-bold text-sm">{isAr ? "صورتك الشخصية" : "Profile Photo"}</h2></div>
        <div className="flex items-center gap-3">
          {cv?.photo_url ? (
            <img src={cv.photo_url} alt="Profile" className="w-16 h-16 rounded-full object-cover border-2 border-zeus-gold/40" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-secondary/40 flex items-center justify-center"><User className="text-muted-foreground" style={{ width: 24, height: 24 }} /></div>
          )}
          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary/40 border border-border/60 text-sm font-medium cursor-pointer hover:bg-secondary/60 transition">
            {uploading === "photo_url" ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : <Upload style={{ width: 16, height: 16 }} />}
            {isAr ? "رفع صورة" : "Upload photo"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadFile(e.target.files[0], "photo_url")} />
          </label>
        </div>
      </div>

      <div className="zeus-glass p-5">
        <div className="flex items-center gap-2 mb-3"><Palette className="text-zeus-gold" style={{ width: 18, height: 18 }} /><h2 className="font-heading font-bold text-sm">{isAr ? "لون البورتفوليو" : "Portfolio Accent Color"}</h2></div>
        <p className="text-xs text-muted-foreground mb-3">{isAr ? "اختار لون بورتفوليوك العام" : "Choose your portfolio's accent color"}</p>
        <div className="flex items-center gap-3">
          <input type="color" value={cv?.accent_color || "#FFC107"} onChange={(e) => updateAccent(e.target.value)}
            className="w-14 h-14 rounded-xl cursor-pointer border border-border/60 bg-transparent" />
          <div className="flex flex-wrap gap-2">
            {["#FFC107", "#3B82F6", "#8B5CF6", "#10B981", "#EF4444", "#EC4899", "#F97316", "#06B6D4"].map((c) => (
              <button key={c} onClick={() => updateAccent(c)} className={`w-8 h-8 rounded-full border-2 transition ${(cv?.accent_color || "#FFC107") === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"}`} style={{ background: c }} />
            ))}
          </div>
        </div>
      </div>

      <button onClick={logout} className="w-full zeus-glass p-5 flex items-center gap-3 text-destructive hover:bg-destructive/10 transition">
        <LogOut style={{ width: 20, height: 20 }} />
        <span className="font-medium">{t("nav.logout")}</span>
      </button>
    </div>
  );
}