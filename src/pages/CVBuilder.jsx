import React, { useState, useEffect, useRef } from "react";
import {
  Award, Briefcase, Check, ChevronLeft, ChevronRight, Download, FileText,
  GraduationCap, Loader2, MessageCircle, Save, Send, Sparkles, UserRound, WandSparkles,
} from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";
import CVForm from "@/components/zeus/cv/CVForm";
import CVPreview from "@/components/zeus/cv/CVPreview";

export default function CVBuilder() {
  const { lang, dir } = useI18n();
  const { profile, loading: profileLoading } = useProfile();
  const isAr = lang === "ar";
  const [cv, setCv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [activeSection, setActiveSection] = useState("contact");
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantReply, setAssistantReply] = useState("");
  const [assistantError, setAssistantError] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [userId, setUserId] = useState("");
  const previewRef = useRef(null);
  const hasArabic = (value) => /[\u0600-\u06FF]/.test(String(value || ""));
  const prepareLearnedSkills = async (skills) => {
    const uniqueSkills = [...new Set(skills.map((skill) => skill.trim()).filter(Boolean))];
    const arabicSkills = uniqueSkills.filter(hasArabic);
    const translatedByOriginal = new Map();
    for (let index = 0; index < arabicSkills.length; index += 40) {
      const batch = arabicSkills.slice(index, index + 40);
      const response = await api.functions.invoke("translateCvSkills", { skills: batch });
      const result = response.data || response;
      if (!Array.isArray(result.skills) || result.skills.length !== batch.length) {
        throw new Error(result.error || (isAr ? "تعذر ترجمة المهارات المكتسبة إلى الإنجليزية." : "Couldn't translate learned skills into English."));
      }
      result.skills.forEach((item, itemIndex) => {
        if (item.original !== batch[itemIndex] || !item.name || hasArabic(item.name)) {
          throw new Error(isAr ? "نتيجة ترجمة المهارات غير مكتملة." : "The skill translation was incomplete.");
        }
        translatedByOriginal.set(item.original, item.name.trim());
      });
    }
    return uniqueSkills.map((skill) => ({
      name: translatedByOriginal.get(skill) || skill,
      category: "Technical",
    }));
  };
  const prepareLearnedProjects = async (projects) => Promise.all(projects.map(async (project) => {
    const rewrite = async (text, kind) => {
      if (!hasArabic(text)) return text;
      const response = await api.functions.invoke("rewriteCvContent", { text, kind });
      const result = response.data || response;
      if (!result.rewritten || hasArabic(result.rewritten)) {
        throw new Error(result.error || (isAr ? "تعذر تحويل وصف المشروع إلى الإنجليزية." : "Couldn't rewrite a project in English."));
      }
      return result.rewritten.trim();
    };
    return {
      ...project,
      title: await rewrite(project.title, "project"),
      description: await rewrite(project.description, "project"),
    };
  }));

  useEffect(() => {
    if (profileLoading) return undefined;
    (async () => {
      try {
        const [me, existing] = await Promise.all([
          api.auth.me(),
          api.entities.CV.filter({}, "-created_date", 1),
        ]);
        setUserId(me?.id || "");
        const profiles = await api.entities.LearningProfile.filter({}, "-created_date", 1);
        const userProjects = await api.entities.Project.filter({ status: "completed" }, "-created_date", 50);
        const learnedProjects = userProjects.map((project) => ({
          source_project_id: project.id,
          title: project.title || "",
          description: project.description || "",
          link: project.link || "",
        })).filter((project) => project.title);
        const skillGraph = profiles[0]?.skill_graph || profile?.skill_graph || [];
        const learnedSkills = (Array.isArray(skillGraph) ? skillGraph : [])
          .filter((skill) => skill && typeof skill.skill === "string" && skill.skill.trim())
          .map((skill) => skill.skill.trim());
        if (existing.length) {
          const currentCv = existing[0];
          const currentSkills = Array.isArray(currentCv.skills) ? currentCv.skills : [];
          const existingNames = new Set(currentSkills.map((skill) =>
            String(typeof skill === "string" ? skill : skill?.name || "").trim().toLocaleLowerCase()
          ).filter(Boolean));
          const additions = [...new Set(learnedSkills)].filter((skill) => !existingNames.has(skill.toLocaleLowerCase()));
          const currentProjects = Array.isArray(currentCv.projects) ? currentCv.projects : [];
          const translatedProjects = await prepareLearnedProjects(learnedProjects);
          const syncedProjects = [...currentProjects];
          let projectsChanged = false;
          for (const project of translatedProjects) {
            const existingIndex = syncedProjects.findIndex((existing) =>
              existing?.source_project_id === project.source_project_id
              || (!existing?.source_project_id && (
                (project.link && existing?.link === project.link)
                || (!project.link && !existing?.link
                  && String(existing?.title || "").trim().toLocaleLowerCase() === project.title.trim().toLocaleLowerCase()
                  && String(existing?.description || "").trim().toLocaleLowerCase() === project.description.trim().toLocaleLowerCase())
              ))
            );
            if (existingIndex < 0) {
              syncedProjects.push(project);
              projectsChanged = true;
            } else {
              const current = syncedProjects[existingIndex];
              const updatedProject = { ...current, ...project };
              if (JSON.stringify(current) !== JSON.stringify(updatedProject)) projectsChanged = true;
              syncedProjects[existingIndex] = updatedProject;
            }
          }
          if (additions.length || projectsChanged) {
            const syncedSkills = await prepareLearnedSkills(additions);
            const updated = await api.entities.CV.update(currentCv.id, {
              ...(additions.length ? { skills: [...currentSkills, ...syncedSkills] } : {}),
              projects: syncedProjects,
            });
            setCv(updated);
          } else {
            setCv(currentCv);
          }
        } else {
          const skills = await prepareLearnedSkills(learnedSkills);
          const projects = await prepareLearnedProjects(learnedProjects);
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
      } catch (error) {
        setLoadError(error.message || (isAr ? "تعذر تحميل بيانات السيرة الذاتية." : "Couldn't load your CV."));
      } finally {
        setLoading(false);
      }
    })();
  }, [isAr, profile, profileLoading]);

  const [saveMsg, setSaveMsg] = useState("");
  const collectArabicFields = (c) => {
    const bad = [];
    if (hasArabic(c?.full_name)) bad.push(isAr ? "الاسم" : "Full name");
    if (hasArabic(c?.title_role)) bad.push(isAr ? "المسمى الوظيفي" : "Professional title");
    if (hasArabic(c?.summary)) bad.push(isAr ? "الملخص" : "Summary");
    if (hasArabic(c?.location)) bad.push(isAr ? "الموقع" : "Location");
    if (hasArabic(c?.email) || hasArabic(c?.phone) || hasArabic(c?.linkedin) || hasArabic(c?.github)) bad.push(isAr ? "بيانات التواصل" : "Contact details");
    (c?.experiences || []).forEach((e, i) => {
      if (hasArabic(e?.role) || hasArabic(e?.company) || hasArabic(e?.description)) bad.push(`${isAr ? "خبرة" : "Experience"} ${i + 1}`);
    });
    (c?.projects || []).forEach((p, i) => {
      if (hasArabic(p?.title) || hasArabic(p?.description)) bad.push(`${isAr ? "مشروع" : "Project"} ${i + 1}`);
    });
    (c?.education || []).forEach((e, i) => {
      if (hasArabic(e?.degree) || hasArabic(e?.school) || hasArabic(e?.institution) || hasArabic(e?.details)) bad.push(`${isAr ? "تعليم" : "Education"} ${i + 1}`);
    });
    (c?.skills || []).forEach((skill) => {
      if (typeof skill === "string" ? hasArabic(skill) : hasArabic(skill?.name) || hasArabic(skill?.category)) {
        bad.push(isAr ? "المهارات" : "Skills");
      }
    });
    (c?.languages || []).forEach((item) => { if (hasArabic(item?.name) || hasArabic(item?.level)) bad.push(isAr ? "اللغات" : "Languages"); });
    (c?.certifications || []).forEach((item) => {
      if (typeof item === "string" ? hasArabic(item) : ["name", "issuer", "date"].some((key) => hasArabic(item?.[key]))) {
        bad.push(isAr ? "الشهادات" : "Certifications");
      }
    });
    return [...new Set(bad)];
  };

  const save = async () => {
    if (!cv) return false;
    setSaving(true);
    setSaveMsg("");
    try {
      let working = { ...cv };
      const rewriteField = async (value, kind = "cv") => {
        if (!hasArabic(value)) return value;
        const response = await api.functions.invoke("rewriteCvContent", { text: String(value), kind });
        const result = response.data || response;
        if (!result.rewritten || hasArabic(result.rewritten)) {
          throw new Error(result.error || (isAr ? "تعذر تحويل أحد الحقول إلى الإنجليزية." : "One CV field could not be rewritten in English."));
        }
        return result.rewritten.trim();
      };
      working.full_name = await rewriteField(working.full_name);
      working.title_role = await rewriteField(working.title_role);
      working.location = await rewriteField(working.location);
      working.summary = await rewriteField(working.summary, "summary");
      for (const field of ["experiences", "education", "projects", "skills", "languages", "certifications"]) {
        const entries = Array.isArray(working[field]) ? [...working[field]] : [];
        for (let index = 0; index < entries.length; index++) {
          if (typeof entries[index] === "string") {
            entries[index] = await rewriteField(entries[index], field === "projects" ? "project" : "cv");
            continue;
          }
          if (!entries[index] || typeof entries[index] !== "object") continue;
          const next = { ...entries[index] };
          for (const key of ["name", "category", "role", "company", "description", "degree", "institution", "school", "level", "issuer", "date", "title"]) {
            if (typeof next[key] === "string") {
              next[key] = await rewriteField(next[key], field === "experiences" ? "experience" : field === "projects" && key === "description" ? "project" : "cv");
            }
          }
          entries[index] = next;
        }
        working[field] = entries;
      }
      working.soft_skills = await Promise.all((working.soft_skills || []).map((skill) => rewriteField(skill)));
      const bad = collectArabicFields(working);
      if (bad.length) {
        setSaveMsg(isAr ? `السيرة لازم تكون إنجليزي بالكامل — عدّل الحقول دي: ${bad.join("، ")}` : `CV must be fully in English — fix: ${bad.join(", ")}`);
        setCv(working);
        return false;
      }
      const updated = await api.entities.CV.update(working.id, working);
      setCv(updated);
      setSaveMsg(isAr ? "تم الحفظ — السيرة إنجليزي بالكامل ✓" : "Saved — CV is fully in English ✓");
      return true;
    } catch (e) {
      setSaveMsg(e.message || (isAr ? "فشل الحفظ أو الترجمة — حاول تاني" : "Saving or translation failed — please retry"));
      setCv(cv);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const reviseWithAssistant = async (event) => {
    event.preventDefault();
    const instruction = assistantPrompt.trim();
    if (!instruction || assistantBusy) return;
    setAssistantBusy(true);
    setAssistantError("");
    setAssistantReply("");
    try {
      const response = await api.functions.invoke("reviseCv", { instruction, cv });
      const result = response.data || response;
      if (!result.cv || typeof result.cv !== "object") {
        throw new Error(isAr ? "المساعد لم يرجع تعديلات صالحة." : "The assistant returned no valid CV changes.");
      }
      setCv((current) => ({ ...current, ...result.cv }));
      setAssistantPrompt("");
      setAssistantReply(result.reply || (isAr ? "تم تجهيز التعديلات؛ راجعها ثم احفظ سيرتك." : "Changes are ready. Review them, then save your CV."));
    } catch (error) {
      setAssistantError(error.message || (isAr ? "تعذر تعديل السيرة الآن." : "Couldn't revise your CV right now."));
    } finally {
      setAssistantBusy(false);
    }
  };

  const exportPdf = async () => {
    if (!previewRef.current) return;
    setExporting(true);
    setSaveMsg("");
    try {
      const canvas = await html2canvas(previewRef.current, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
      const pdf = new jsPDF("p", "mm", "a4");
      const w = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const pagePixelHeight = Math.floor((canvas.width * pageHeight) / w);
      for (let page = 0, y = 0; y < canvas.height; page++, y += pagePixelHeight) {
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = Math.min(pagePixelHeight, canvas.height - y);
        const context = slice.getContext("2d");
        if (!context) throw new Error("Couldn't prepare the PDF page.");
        context.drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, slice.width, slice.height);
        if (page > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/png"), "PNG", 0, 0, w, (slice.height * w) / slice.width);
      }
      pdf.save(`${(cv.full_name || "CV").replace(/\s+/g, "_")}.pdf`);
    } catch (error) {
      setSaveMsg(error.message || (isAr ? "تعذر تصدير ملف PDF." : "Couldn't export the PDF."));
    } finally {
      setExporting(false);
    }
  };

  const shareCv = async () => {
    if (!userId) {
      setShareNotice(isAr ? "تعذر إنشاء رابط السيرة الآن." : "Couldn't create the CV link right now.");
      return;
    }
    setShareNotice("");
    try {
      if (!await save()) {
        setShareNotice(isAr ? "احفظ السيرة بنجاح قبل مشاركة الرابط." : "Save the CV successfully before sharing its link.");
        return;
      }
      await navigator.clipboard.writeText(`${window.location.origin}/portfolio/${encodeURIComponent(userId)}`);
      setShareNotice(isAr ? "تم نسخ رابط السيرة والبورتفوليو العام." : "Public CV and portfolio link copied.");
    } catch (error) {
      setShareNotice(error.message || (isAr ? "تعذر نسخ الرابط." : "Couldn't copy the link."));
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;
  if (loadError || !cv) return <div role="alert" className="zeus-glass p-6 text-sm text-destructive">{loadError || (isAr ? "بيانات السيرة الذاتية غير متاحة." : "CV data is unavailable.")}</div>;

  const sections = [
    { id: "contact", icon: UserRound, label: isAr ? "التواصل" : "Contact", hint: isAr ? "اسمك وروابطك" : "Name and links" },
    { id: "summary", icon: WandSparkles, label: isAr ? "الملخص" : "Summary", hint: isAr ? "عرّف بنفسك" : "Your introduction" },
    { id: "experience", icon: Briefcase, label: isAr ? "الخبرات" : "Experience", hint: isAr ? "الأدوار والإنجازات" : "Roles and impact" },
    { id: "education", icon: GraduationCap, label: isAr ? "التعليم" : "Education", hint: isAr ? "الدراسة والتدريب" : "Study and training" },
    { id: "skills", icon: Sparkles, label: isAr ? "المهارات" : "Skills", hint: isAr ? "تقنية وشخصية" : "Technical and soft" },
    { id: "projects", icon: FileText, label: isAr ? "المشاريع" : "Projects", hint: isAr ? "أعمال تثبت خبرتك" : "Proof of your work" },
    { id: "credentials", icon: Award, label: isAr ? "الشهادات واللغات" : "Credentials", hint: isAr ? "شهاداتك ولغاتك" : "Certificates and languages" },
  ];
  const hasSectionData = (sectionId) => ({
    contact: !!(cv.full_name && cv.email && cv.title_role),
    summary: !!cv.summary,
    experience: !!cv.experiences?.some((item) => item.role || item.company || item.description),
    education: !!cv.education?.some((item) => item.degree || item.institution),
    skills: !!(cv.skills?.some((item) => item.name) || cv.soft_skills?.some(Boolean)),
    projects: !!cv.projects?.some((item) => item.title || item.description),
    credentials: !!(cv.certifications?.length || cv.languages?.length),
  }[sectionId]);
  const completedSections = sections.filter((section) => hasSectionData(section.id)).length;
  const currentSectionIndex = sections.findIndex((section) => section.id === activeSection);
  const nextSection = sections[currentSectionIndex + 1];
  const previousSection = sections[currentSectionIndex - 1];

  return (
    <div dir={dir} className="space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-zeus-gold/20 bg-gradient-to-br from-zeus-gold/10 via-card/80 to-card p-6 sm:p-8">
        <div className="pointer-events-none absolute -end-10 -top-20 h-56 w-56 rounded-full bg-zeus-gold/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zeus-brightgold">{isAr ? "جهّز خطوتك المهنية" : "PREPARE YOUR NEXT MOVE"}</p>
            <h1 className="flex items-center gap-3 font-heading text-2xl font-extrabold sm:text-4xl"><FileText className="h-7 w-7 shrink-0 text-zeus-gold sm:h-9 sm:w-9" />{isAr ? "ابنِ سيرتك الذاتية" : "Build your CV"}</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{isAr ? "نظّم خبراتك ومشاريعك في سيرة واضحة، متوافقة مع ATS، وجاهزة للتقديم. محتوى السيرة باللغة الإنجليزية." : "Turn your experience and projects into a clear, ATS-friendly CV, ready to share. CV content is in English."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/40 px-4 py-2.5 text-sm font-semibold transition hover:border-zeus-gold/50 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isAr ? "حفظ التعديلات" : "Save changes"}
            </button>
            <button type="button" onClick={exportPdf} disabled={exporting} className="inline-flex items-center gap-2 rounded-xl bg-zeus-gold px-4 py-2.5 text-sm font-bold text-zeus-midnight transition hover:bg-zeus-brightgold disabled:opacity-60">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isAr ? "تنزيل PDF" : "Download PDF"}
            </button>
            <button type="button" onClick={shareCv} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/40 px-4 py-2.5 text-sm font-semibold transition hover:border-zeus-gold/50 disabled:opacity-60">
              {isAr ? "مشاركة السيرة" : "Share CV"}
            </button>
          </div>
        </div>
        <div className="relative mt-6 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-background/70">
            <div className="h-full rounded-full bg-gradient-to-r from-zeus-gold to-amber-300 transition-all" style={{ width: `${(completedSections / sections.length) * 100}%` }} />
          </div>
          <span className="shrink-0 text-xs font-semibold text-muted-foreground">{isAr ? `${completedSections} من ${sections.length} أقسام` : `${completedSections} of ${sections.length} sections`}</span>
        </div>
      </section>

      {saveMsg && <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${saveMsg.includes("✓") ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>{saveMsg}</p>}
      {shareNotice && <p role="status" className="rounded-xl border border-border/70 px-4 py-3 text-sm text-muted-foreground">{shareNotice}</p>}

      <nav aria-label={isAr ? "أقسام السيرة الذاتية" : "CV sections"} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {sections.map((section, index) => {
          const Icon = section.icon;
          const active = section.id === activeSection;
          const complete = hasSectionData(section.id);
          return (
            <button key={section.id} type="button" onClick={() => setActiveSection(section.id)} aria-current={active ? "step" : undefined}
              className={`flex min-w-[9rem] items-center gap-3 rounded-2xl border px-3.5 py-3 text-start transition sm:min-w-[10rem] ${active ? "border-zeus-gold/50 bg-zeus-gold/10 shadow-gold-sm" : "border-border/60 bg-card/40 hover:border-zeus-gold/25"}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${complete ? "bg-emerald-500/10 text-emerald-400" : active ? "bg-zeus-gold/15 text-zeus-gold" : "bg-secondary/60 text-muted-foreground"}`}>
                {complete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold">{section.label}</span>
                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{isAr ? `قسم ${index + 1}` : `Step ${index + 1}`}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(24rem,.95fr)]">
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zeus-gold/10 text-zeus-gold">
              {React.createElement(sections[currentSectionIndex].icon, { className: "h-5 w-5" })}
            </span>
            <div>
              <h2 className="font-heading text-lg font-bold">{sections[currentSectionIndex].label}</h2>
              <p className="text-xs text-muted-foreground">{sections[currentSectionIndex].hint}</p>
            </div>
          </div>
          <CVForm cv={cv} setCv={setCv} isAr={isAr} activeSection={activeSection} />
          <div className="flex justify-between gap-3">
            <button type="button" onClick={() => previousSection && setActiveSection(previousSection.id)} disabled={!previousSection} className="inline-flex items-center gap-2 rounded-xl border border-border/70 px-4 py-2.5 text-sm font-semibold transition hover:border-zeus-gold/40 disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronLeft className={`h-4 w-4 ${isAr ? "rotate-180" : ""}`} /> {isAr ? "السابق" : "Previous"}
            </button>
            {nextSection ? (
              <button type="button" onClick={() => setActiveSection(nextSection.id)} className="inline-flex items-center gap-2 rounded-xl bg-zeus-gold px-4 py-2.5 text-sm font-bold text-zeus-midnight transition hover:bg-zeus-brightgold">
                {isAr ? "التالي" : "Next"} <ChevronRight className={`h-4 w-4 ${isAr ? "rotate-180" : ""}`} />
              </button>
            ) : (
              <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-zeus-gold px-4 py-2.5 text-sm font-bold text-zeus-midnight transition hover:bg-zeus-brightgold disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {isAr ? "حفظ السيرة" : "Save CV"}
              </button>
            )}
          </div>
        </div>
        <div className="xl:sticky xl:top-20">
          <section className="mb-5 rounded-2xl border border-zeus-gold/20 bg-card/70 p-4">
            <div className="mb-3 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-zeus-gold" />
              <h2 className="text-sm font-bold">{isAr ? "مساعد السيرة الذاتية" : "CV assistant"}</h2>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
              {isAr ? "اطلب تعديلًا محددًا. المساعد لا يضيف خبرات أو معلومات غير موجودة، والتغييرات لن تُحفظ إلا بعد مراجعتها والضغط على حفظ." : "Ask for a specific edit. The assistant won't invent experience or facts; review changes and save them when ready."}
            </p>
            {assistantReply && <p role="status" className="mb-2 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">{assistantReply}</p>}
            {assistantError && <p role="alert" className="mb-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">{assistantError}</p>}
            <form onSubmit={reviseWithAssistant} className="flex items-center gap-2">
              <input value={assistantPrompt} onChange={(event) => setAssistantPrompt(event.target.value)} maxLength={1200}
                placeholder={isAr ? "مثال: حسّن ملخصي بدون إضافة معلومات" : "e.g. Improve my summary without adding facts"}
                className="min-w-0 flex-1 rounded-xl border border-border/70 bg-background px-3 py-2.5 text-xs outline-none focus:zeus-gold-border" />
              <button type="submit" disabled={assistantBusy || !assistantPrompt.trim()} aria-label={isAr ? "إرسال طلب التعديل" : "Send edit request"}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zeus-gold text-zeus-midnight transition hover:bg-zeus-brightgold disabled:opacity-50">
                {assistantBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </section>
          <div className="mb-3 flex items-center justify-between px-1">
            <div><h2 className="font-heading text-sm font-bold">{isAr ? "معاينة مباشرة" : "Live preview"}</h2><p className="text-[11px] text-muted-foreground">{isAr ? "تتحدث مع كل تعديل" : "Updates as you edit"}</p></div>
            <span className="rounded-full border border-zeus-gold/20 bg-zeus-gold/5 px-2.5 py-1 text-[10px] font-semibold text-zeus-brightgold">ATS</span>
          </div>
          <div className="max-h-[78vh] overflow-auto rounded-2xl border border-border/70 bg-white shadow-xl shadow-black/10">
            <CVPreview cv={cv} isAr={false} previewRef={previewRef} />
          </div>
        </div>
      </div>
    </div>
  );
}