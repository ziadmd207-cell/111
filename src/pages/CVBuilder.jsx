import React, { useState, useEffect, useRef } from "react";
import { FileText, Download, Loader2, Save } from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";
import CVForm from "@/components/zeus/cv/CVForm";
import CVPreview from "@/components/zeus/cv/CVPreview";

export default function CVBuilder() {
  const { lang, dir } = useI18n();
  const { profile } = useProfile();
  const isAr = lang === "ar";
  const [cv, setCv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const previewRef = useRef(null);

  useEffect(() => {
    (async () => {
      const me = await api.auth.me().catch(() => null);
      const existing = await api.entities.CV.filter({}, "-created_date", 1);
      if (existing.length) {
        setCv(existing[0]);
      } else {
        // Auto-fill from platform data
        const skills = (profile?.skill_graph || []).map((s) => ({ name: s.skill }));
        const userProjects = await api.entities.Project.filter({ status: "completed" }, "-created_date", 10);
        const projects = userProjects.map((p) => ({
          title: p.title,
          description: p.description || "",
          link: p.link || ""
        }));
        const created = await api.entities.CV.create({
          full_name: profile?.full_name || me?.full_name || "",
          email: me?.email || "",
          title_role: profile?.goal || "",
          summary: profile?.background || profile?.motivation || "",
          experiences: [],
          education: profile?.education ? [{ degree: profile.education, institution: "", start: "", end: "" }] : [],
          skills,
          languages: [],
          certifications: [],
          projects
        });
        setCv(created);
      }
      setLoading(false);
    })();
  }, []);

  const [saveMsg, setSaveMsg] = useState("");
  const hasArabic = (v) => /[\u0600-\u06FF]/.test(String(v || ""));
  const collectArabicFields = (c) => {
    const bad = [];
    if (hasArabic(c?.full_name)) bad.push(isAr ? "الاسم" : "Full name");
    if (hasArabic(c?.title_role)) bad.push(isAr ? "المسمى الوظيفي" : "Professional title");
    if (hasArabic(c?.summary)) bad.push(isAr ? "الملخص" : "Summary");
    if (hasArabic(c?.location)) bad.push(isAr ? "الموقع" : "Location");
    (c?.experiences || []).forEach((e, i) => {
      if (hasArabic(e?.role) || hasArabic(e?.company) || hasArabic(e?.description)) bad.push(`${isAr ? "خبرة" : "Experience"} ${i + 1}`);
    });
    (c?.projects || []).forEach((p, i) => {
      if (hasArabic(p?.title) || hasArabic(p?.description)) bad.push(`${isAr ? "مشروع" : "Project"} ${i + 1}`);
    });
    (c?.education || []).forEach((e, i) => {
      if (hasArabic(e?.degree) || hasArabic(e?.school) || hasArabic(e?.details)) bad.push(`${isAr ? "تعليم" : "Education"} ${i + 1}`);
    });
    (c?.skills || []).forEach((s) => { if (hasArabic(s?.name)) bad.push(isAr ? "المهارات" : "Skills"); });
    return [...new Set(bad)];
  };

  const save = async () => {
    if (!cv) return;
    setSaving(true);
    setSaveMsg("");
    try {
      let working = { ...cv };
      // CV must be 100% English: auto-translate long free text via AI, block the rest.
      try {
        if (hasArabic(working.summary)) {
          const r = await api.functions.invoke("rewriteSummary", { summary: working.summary, isAr: false });
          const d = r.data || r;
          if (d.rewritten && !hasArabic(d.rewritten)) working = { ...working, summary: d.rewritten };
        }
        if (Array.isArray(working.projects)) {
          const next = [...working.projects];
          for (let i = 0; i < next.length; i++) {
            if (hasArabic(next[i]?.description)) {
              const r = await api.functions.invoke("rewriteProjectDescription", { description: next[i].description, isAr: false });
              const d = r.data || r;
              if (d.rewritten && !hasArabic(d.rewritten)) next[i] = { ...next[i], description: d.rewritten };
            }
          }
          working = { ...working, projects: next };
        }
      } catch {}
      const bad = collectArabicFields(working);
      if (bad.length) {
        setSaveMsg(isAr ? `السيرة لازم تكون إنجليزي بالكامل — عدّل الحقول دي: ${bad.join("، ")}` : `CV must be fully in English — fix: ${bad.join(", ")}`);
        setCv(working);
        setSaving(false);
        return;
      }
      const updated = await api.entities.CV.update(working.id, working);
      setCv(updated);
      setSaveMsg(isAr ? "تم الحفظ — السيرة إنجليزي بالكامل ✓" : "Saved — CV is fully in English ✓");
    } catch (e) {
      setSaveMsg(isAr ? "فشل الحفظ — حاول تاني" : "Save failed — try again");
    }
    setSaving(false);
  };

  const exportPdf = async () => {
    if (!previewRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(previewRef.current, { backgroundColor: "#ffffff", scale: 2 });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height * w) / canvas.width;
      pdf.addImage(img, "PNG", 0, 0, w, h);
      pdf.save(`${(cv.full_name || "CV").replace(/\s+/g, "_")}.pdf`);
    } catch (e) {}
    setExporting(false);
  };

  if (loading || !cv) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;

  return (
    <div dir={dir} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl flex items-center gap-2"><FileText className="text-zeus-gold" style={{ width: 28, height: 28 }} /> {isAr ? "بنّاء السيرة الذاتية" : "CV Builder"}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{isAr ? "سيرتك جاهزة للتقديم — ATS compliant، بالإنجليزي بالكامل" : "Submission-ready CV — ATS compliant, fully in English"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary/40 border border-border/60 text-sm font-medium hover:bg-secondary/60 transition disabled:opacity-60">
            {saving ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : <Save style={{ width: 16, height: 16 }} />}
            {isAr ? "حفظ" : "Save"}
          </button>
          <button onClick={exportPdf} disabled={exporting} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-zeus-gold to-zeus-brightgold text-white text-sm font-bold hover:shadow-gold transition disabled:opacity-60">
            {exporting ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : <Download style={{ width: 16, height: 16 }} />}
            {isAr ? "تصدير PDF" : "Export PDF"}
          </button>
        </div>
      </div>
      {saveMsg && <p className="text-xs text-muted-foreground">{saveMsg}</p>}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <CVForm cv={cv} setCv={setCv} isAr={isAr} />
        <div className="lg:sticky lg:top-20">
          {/* CV content is English-only by requirement — preview forced to English */}
          <CVPreview cv={cv} isAr={false} previewRef={previewRef} />
        </div>
      </div>
    </div>
  );
}