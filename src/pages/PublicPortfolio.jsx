import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown, ArrowUpRight, Award, Briefcase, Code2, Download, ExternalLink,
  FolderKanban, Github, GraduationCap, Linkedin, Mail, MapPin, Phone, Sparkles,
  ChevronLeft, ChevronRight, Globe, X, Loader2,
} from "lucide-react";
import { api } from "@/api/client";
import CVPreview from "@/components/zeus/cv/CVPreview";

export default function PublicPortfolio() {
  const { userId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [isAr, setIsAr] = useState(false);
  const [translatedData, setTranslatedData] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const cvRef = useRef(null);
  const mediaUrl = (url) => /^https?:\/\//i.test(url || "") ? url : `${import.meta.env.VITE_API_URL || ""}${url || ""}`;
  const safeExternalUrl = (url) => /^https?:\/\//i.test(url || "") ? url : "";

  useEffect(() => {
    (async () => {
      try {
        const res = await api.functions.invoke("getPublicPortfolio", { userId });
        setData(res.data || res);
        setTranslatedData(null);
        setIsAr(false);
      } catch (e) {
        setData(null);
        setLoadError(e.message || "Portfolio could not be loaded.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const downloadCv = useCallback(async () => {
    if (!cvRef.current) return;
    setDownloadError("");
    try {
      const { default: html2canvas } = await import("html2canvas");
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(cvRef.current, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
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
      pdf.save(`${(data?.cv?.full_name || "CV").replace(/\s+/g, "_")}.pdf`);
    } catch (error) {
      setDownloadError(error.message || "Couldn't download the CV.");
    }
  }, [data]);
  const closeProject = useCallback(() => setSelectedProject(null), []);

  const toggleLanguage = async () => {
    if (isAr) {
      setIsAr(false);
      setTranslationError("");
      return;
    }
    if (translating) return;
    setTranslating(true);
    setTranslationError("");
    try {
      const response = await api.functions.invoke("translatePublicPortfolio", { userId });
      const translated = response.data || response;
      if (!translated.cv && !translated.projects?.length) {
        throw new Error("No translatable portfolio content was returned.");
      }
      setTranslatedData(translated);
      setIsAr(true);
    } catch (error) {
      setTranslationError(error.message || "Portfolio translation failed.");
    } finally {
      setTranslating(false);
    }
  };

  if (loading) return <PortfolioSkeleton />;

  if (!data || (!data.cv && !data.projects?.length)) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-5">
      <p role={loadError ? "alert" : undefined} className="text-muted-foreground">{loadError || "Portfolio not found"}</p>
    </div>
  );

  const sourceCv = data.cv || {};
  const cv = (isAr && translatedData?.cv) || sourceCv;
  const projects = (isAr && translatedData?.projects) || data.projects || [];
  const portfolioConfig = cv.portfolio_config || {};
  const accent = portfolioConfig.primary_color || cv.accent_color || "#FFC107";
  const secondary = portfolioConfig.secondary_color || "#0D1426";
  const template = ["midnight", "editorial", "minimal"].includes(portfolioConfig.template) ? portfolioConfig.template : "midnight";
  const certList = (cv.certifications || []).map((c) => typeof c === "string" ? { name: c } : c);
  const hasExp = (cv.experiences || []).length > 0;
  const skills = (cv.skills || []).map((skill) => typeof skill === "string" ? skill : skill?.name).filter(Boolean);
  const portfolioProjects = projects.length ? projects : cv.projects || [];
  const portfolioName = cv.full_name || data.user?.full_name || "Creator";
  const socialLinks = [
    { href: safeExternalUrl(cv.github), icon: Github, label: "GitHub" },
    { href: safeExternalUrl(cv.linkedin), icon: Linkedin, label: "LinkedIn" },
  ].filter((item) => item.href);
  const labels = isAr ? {
    nav: "التنقل", projects: "المشاريع", experience: "الخبرات", skills: "المهارات",
    download: "تحميل السيرة", openWork: "متاح لفرص عمل مناسبة", contact: "تواصل",
    explore: "استكشف المشاريع", featured: "مشاريع مميزة", experienceCount: "خبرات عملية",
    credentials: "شهادات", whatIBring: "ما أقدمه", expertise: "المهارات والخبرات",
    journey: "رحلتي المهنية", certificationEyebrow: "التعلم المستمر", certifications: "الشهادات",
    more: "معلومات إضافية", languages: "اللغات", built: "صُنع بعناية", sayHello: "راسلني",
    selected: "مشروع مميز", open: "عرض المشروع", close: "إغلاق", previous: "السابق",
    next: "التالي", education: "التعليم", details: "تفاصيل المشروع",
  } : {
    nav: "Portfolio navigation", projects: "Projects", experience: "Experience", skills: "Skills",
    download: "Download CV", openWork: "Open to meaningful work", contact: "Contact",
    explore: "Explore projects", featured: "Featured projects", experienceCount: "Experience entries",
    credentials: "Credentials", whatIBring: "WHAT I BRING", expertise: "Skills & expertise",
    journey: "THE JOURNEY SO FAR", certificationEyebrow: "CONTINUOUS LEARNING", certifications: "Certifications",
    more: "MORE ABOUT ME", languages: "Languages", built: "Built with care", sayHello: "Say hello",
    selected: "SELECTED PROJECT", open: "View project", close: "Close", previous: "Previous",
    next: "Next", education: "Education", details: "Project details",
  };
  const portfolioMediaUrl = (url) => /^https?:\/\//i.test(url || "") ? url : `${import.meta.env.VITE_API_URL || ""}${url || ""}`;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className={`min-h-screen text-foreground portfolio-${template}`} style={{ "--accent": accent, "--accent-glow": `${accent}33`, "--accent-light": `${accent}1a`, "--portfolio-secondary": secondary, backgroundColor: template === "editorial" ? "#FAFAF8" : secondary, color: template === "editorial" ? "#172033" : undefined, fontFamily: template === "editorial" ? "Georgia, 'Times New Roman', serif" : undefined }}>
      {/* Hidden CV for download */}
      {data.cv && <div aria-hidden="true" className="pointer-events-none fixed -left-[10000px] top-0 w-[794px]">
        <CVPreview cv={sourceCv} isAr={false} previewRef={cvRef} />
      </div>}

      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/85 backdrop-blur-xl" style={template === "editorial" ? undefined : { backgroundColor: `${secondary}e8` }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <a href="#top" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black" style={{ background: accent, color: "#0D1426" }}>Z</span>
            <span><span className="block text-xs font-extrabold tracking-[0.16em]">ZEUS</span><span className="block text-[10px] text-muted-foreground">CREATOR PORTFOLIO</span></span>
          </a>
          <nav className="hidden items-center gap-5 text-xs font-medium text-muted-foreground md:flex" aria-label={labels.nav}>
            {portfolioProjects.length > 0 && <a className="transition hover:text-foreground" href="#projects">{labels.projects}</a>}
            {hasExp && <a className="transition hover:text-foreground" href="#experience">{labels.experience}</a>}
            {skills.length > 0 && <a className="transition hover:text-foreground" href="#skills">{labels.skills}</a>}
          </nav>
          <div className="flex items-center gap-2">
            <button type="button" onClick={toggleLanguage} disabled={translating} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/70 px-2.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-50" aria-label={isAr ? "Switch to English" : "التبديل إلى العربية"}>
              {translating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}{isAr ? "EN" : "عربي"}
            </button>
            {socialLinks.map(({ href, icon: Icon, label }) => <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"><Icon className="h-4 w-4" /></a>)}
            {data.cv && <button type="button" onClick={downloadCv} className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition hover:opacity-90 sm:px-4 sm:text-sm" style={{ background: accent, color: "#0D1426" }}><Download className="h-4 w-4" /><span className="hidden sm:inline">{labels.download}</span></button>}
          </div>
        </div>
      </header>
      {translationError && <p role="alert" className="mx-auto max-w-6xl px-5 pt-3 text-xs text-rose-400">{translationError}</p>}

      {/* Hero */}
      <motion.div id="top" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 zeus-grid-bg opacity-20" />
        <div className="absolute inset-0" style={{ background: `radial-gradient(40rem 40rem at 70% 0%, ${accent}28, transparent 65%)` }} />
        <div className="relative mx-auto max-w-6xl px-5 py-14 sm:py-20">
          <div className="flex flex-col sm:flex-row items-center gap-7 sm:gap-12">
            {cv.photo_url ? (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }}
                className="w-40 h-40 sm:w-56 sm:h-64 shrink-0 rounded-[2rem] overflow-hidden border-4 shadow-2xl" style={{ borderColor: `${accent}66` }}>
                <img src={mediaUrl(cv.photo_url)} alt={portfolioName} className="w-full h-full object-cover" />
              </motion.div>
            ) : (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }}
                className="w-40 h-40 sm:w-56 sm:h-64 shrink-0 rounded-[2rem] flex items-center justify-center text-7xl font-bold shadow-2xl"
                style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}55` }}>
                {portfolioName.charAt(0).toUpperCase()}
              </motion.div>
            )}
            <div className="text-center sm:text-left flex-1">
              <motion.p initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
                className="text-xs font-semibold uppercase tracking-[0.17em] mb-2" style={{ color: accent }}>{labels.openWork}</motion.p>
              <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                className="font-heading font-extrabold text-4xl leading-tight sm:text-6xl">{portfolioName}<span style={{ color: accent }}>.</span></motion.h1>
              {cv.title_role && (
                <motion.p initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
                  className="text-lg mt-1 font-medium" style={{ color: accent }}>{cv.title_role}</motion.p>
              )}
              {cv.location && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                  className="text-muted-foreground text-sm mt-2 flex items-center justify-center sm:justify-start gap-1">
                  <MapPin style={{ width: 13, height: 13 }} /> {cv.location}
                </motion.p>
              )}
              {cv.summary && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                  className="text-muted-foreground mt-3 max-w-xl leading-relaxed text-sm">{cv.summary}</motion.p>
              )}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                className="flex items-center justify-center sm:justify-start gap-3 mt-5 flex-wrap">
                {data.cv && <button onClick={downloadCv} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition hover:opacity-90 shadow-lg" style={{ background: accent }}>
                  <Download style={{ width: 16, height: 16 }} /> Download CV
                </button>}
                {cv.phone && (
                  <a href={`https://wa.me/${String(cv.phone).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-semibold transition hover:bg-secondary/40" style={{ borderColor: `${accent}66`, color: accent }}>
                    <Phone style={{ width: 16, height: 16 }} /> {labels.contact}
                  </a>
                )}
                {cv.email && (
                  <a href={`mailto:${cv.email}`} className="w-10 h-10 rounded-full bg-card border border-border/60 flex items-center justify-center hover:scale-110 transition"><Mail style={{ width: 18, height: 18 }} /></a>
                )}
                {safeExternalUrl(cv.github) && <a href={safeExternalUrl(cv.github)} target="_blank" rel="noreferrer" aria-label="GitHub" className="w-10 h-10 rounded-xl bg-card border border-border/60 flex items-center justify-center hover:scale-110 transition"><Github style={{ width: 18, height: 18 }} /></a>}
                {safeExternalUrl(cv.linkedin) && <a href={safeExternalUrl(cv.linkedin)} target="_blank" rel="noreferrer" aria-label="LinkedIn" className="w-10 h-10 rounded-xl bg-card border border-border/60 flex items-center justify-center hover:scale-110 transition"><Linkedin style={{ width: 18, height: 18 }} /></a>}
                {portfolioProjects.length > 0 && <a href="#projects" className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-4 py-2 text-sm font-semibold transition hover:border-[var(--accent)]/50"><ArrowDown className="h-4 w-4" /> {labels.explore}</a>}
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>

      {downloadError && <p role="alert" className="mx-auto mt-4 max-w-6xl px-5 text-sm text-destructive">{downloadError}</p>}
      <div className="mx-auto max-w-6xl space-y-14 px-5 py-12 sm:py-16">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PortfolioStat value={portfolioProjects.length} label={labels.featured} accent={accent} />
          <PortfolioStat value={skills.length} label="Skills" accent={accent} />
          <PortfolioStat value={cv.experiences?.length || 0} label={labels.experienceCount} accent={accent} />
          <PortfolioStat value={certList.length} label={labels.credentials} accent={accent} />
        </div>

        {/* Skills */}
        {skills.length > 0 && (
          <Section id="skills" eyebrow={labels.whatIBring} icon={Sparkles} title={labels.expertise} accent={accent}>
            <div className="flex flex-wrap gap-2.5">
              {skills.map((skill, i) => (
                <motion.span key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }}
                  className="rounded-xl border px-4 py-2.5 text-sm font-medium transition"
                  style={{ borderColor: `${accent}35`, background: `${accent}0d` }}>
                  <span className="me-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: accent }} />{skill}
                </motion.span>
              ))}
            </div>
          </Section>
        )}

        {/* Experience Timeline */}
        {hasExp && (
          <Section id="experience" eyebrow={labels.journey} icon={Briefcase} title={labels.experience} accent={accent}>
            <div className="grid gap-4 md:grid-cols-2">
              {cv.experiences.map((e, i) => (
                <motion.article key={i} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07 }}
                  className="rounded-2xl border border-border/60 bg-card/45 p-5 sm:p-6">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${accent}16`, color: accent }}><Briefcase className="h-5 w-5" /></span>
                    <span className="rounded-full border border-border/70 px-2.5 py-1 text-[10px] text-muted-foreground">{[e.start, e.end].filter(Boolean).join(" — ") || "Experience"}</span>
                  </div>
                  <h3 className="font-heading text-lg font-bold">{e.role}</h3>
                  <p className="mt-1 text-sm font-semibold" style={{ color: accent }}>{e.company}</p>
                  {e.description && <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{e.description}</p>}
                </motion.article>
              ))}
            </div>
          </Section>
        )}

        {/* Projects */}
        {portfolioProjects.length > 0 && (
          <Section id="projects" eyebrow={isAr ? "أعمال أنجزتها" : "SELECTED WORK"} icon={FolderKanban} title={isAr ? "مشاريع مختارة" : "Projects built with purpose"} accent={accent}>
            <div className="grid gap-5 lg:grid-cols-2">
              {portfolioProjects.map((project, index) => <ProjectCard key={project.id || index} project={project} accent={accent} mediaUrl={mediaUrl} labels={labels} isAr={isAr} onSelect={() => { setSelectedProject(project); setSelectedImage(0); }} />)}
            </div>
          </Section>
        )}

        {/* Education */}
        {cv.education?.length > 0 && (
          <Section eyebrow={isAr ? "الأساس الأكاديمي" : "FOUNDATIONS"} icon={GraduationCap} title={labels.education} accent={accent}>
            <div className="space-y-4">
              {cv.education.map((e, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
                  className="zeus-glass p-4 border-s-2" style={{ borderColor: accent }}>
                  <h3 className="font-heading font-bold">{e.degree}</h3>
                  <p className="text-sm" style={{ color: accent }}>{e.institution}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{[e.start, e.end].filter(Boolean).join(" — ")}</p>
                </motion.div>
              ))}
            </div>
          </Section>
        )}

        {/* Certifications */}
        {certList.length > 0 && (
          <Section eyebrow={labels.certificationEyebrow} icon={Award} title={labels.certifications} accent={accent}>
            <div className="grid sm:grid-cols-2 gap-3">
              {certList.map((c, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
                  className="zeus-glass p-4">
                  <h3 className="font-heading font-bold text-sm">{c.name}</h3>
                  {c.issuer && <p className="text-xs" style={{ color: accent }}>{c.issuer}</p>}
                  {c.date && <p className="text-xs text-muted-foreground mt-0.5">{c.date}</p>}
                  {safeExternalUrl(c.link) && <a href={safeExternalUrl(c.link)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs underline" style={{ color: accent }}>View certificate <ArrowUpRight className="h-3 w-3" /></a>}
                </motion.div>
              ))}
            </div>
          </Section>
        )}
        {(cv.languages || []).length > 0 && (
          <Section eyebrow={labels.more} icon={Code2} title={labels.languages} accent={accent}>
            <div className="flex flex-wrap gap-3">
              {cv.languages.map((language, index) => <span key={index} className="rounded-xl border border-border/70 bg-card/50 px-4 py-3 text-sm"><strong>{language.name}</strong>{language.level && <span className="ms-2 text-xs text-muted-foreground">{language.level}</span>}</span>)}
            </div>
          </Section>
        )}
      </div>

      <footer className="border-t border-border/50 bg-card/30" style={{ backgroundColor: `${secondary}33` }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} {portfolioName}. {labels.built}</span>
          {cv.email && <a href={`mailto:${cv.email}`} className="inline-flex items-center gap-1.5 font-semibold transition hover:text-[var(--accent)]"><Mail className="h-3.5 w-3.5" /> {labels.sayHello} <ArrowUpRight className="h-3 w-3" /></a>}
        </div>
      </footer>

      {selectedProject && <ProjectDetails project={selectedProject} imageIndex={selectedImage} onImageChange={setSelectedImage} onClose={closeProject} labels={labels} mediaUrl={portfolioMediaUrl} accent={accent} isAr={isAr} />}
    </div>
  );
}

function ProjectCard({ project, accent, mediaUrl, labels, isAr, onSelect }) {
  const images = (project.images || []).filter(Boolean).slice(0, 5);
  const [imageIndex, setImageIndex] = useState(0);
  const link = /^https?:\/\//i.test(project.link || "") ? project.link : "";
  const technologies = project.technologies || project.skills || [];
  useEffect(() => {
    if (images.length < 2) return undefined;
    const timer = window.setInterval(() => setImageIndex((index) => (index + 1) % images.length), 4000);
    return () => window.clearInterval(timer);
  }, [images.length]);
  return (
    <motion.article initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      role="button" tabIndex={0} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }}
      className="cursor-pointer overflow-hidden rounded-[1.5rem] border border-border/60 bg-card/45 transition hover:border-[var(--accent)]/35 hover:shadow-xl hover:shadow-black/10">
      {images.length > 0 ? (
        <div className="relative h-56 overflow-hidden bg-background/50 p-1.5">
          <AnimatePresence mode="wait">
            <motion.img key={images[imageIndex]} src={mediaUrl(images[imageIndex])} alt={`${project.title || "Project"} preview ${imageIndex + 1}`}
              initial={{ opacity: 0.3, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0.2, scale: 0.99 }} transition={{ duration: 0.35 }}
              className="h-full w-full rounded-xl object-cover" />
          </AnimatePresence>
          {images.length > 1 && <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {images.map((image, index) => <button key={image} type="button" onClick={(event) => { event.stopPropagation(); setImageIndex(index); }} aria-label={`${isAr ? "الصورة" : "Image"} ${index + 1}`}
              className={`h-1.5 rounded-full transition-all ${index === imageIndex ? "w-5 bg-white" : "w-1.5 bg-white/60"}`} />)}
          </div>}
        </div>
      ) : (
        <div className="flex h-44 items-center justify-center" style={{ background: `linear-gradient(135deg, ${accent}22, transparent)` }}>
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--accent)]/20 bg-background/50" style={{ color: accent }}><Code2 className="h-8 w-8" /></span>
        </div>
      )}
      <div className="p-5 sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: accent }}>{labels.selected}</p><h3 className="font-heading text-lg font-bold">{project.title}</h3></div>
          <FolderKanban className="mt-1 h-5 w-5 shrink-0" style={{ color: accent }} />
        </div>
        {project.description && <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{project.description}</p>}
        {technologies.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{technologies.map((technology, index) => <span key={index} className="rounded-full border border-border/70 px-2.5 py-1 text-[10px] text-muted-foreground">{typeof technology === "string" ? technology : technology.name}</span>)}</div>}
        <p className="mt-4 text-xs font-semibold" style={{ color: accent }}>{labels.open} <ArrowUpRight className="inline h-3.5 w-3.5" /></p>
        {link && <a href={link} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="sr-only">{isAr ? "فتح الرابط الخارجي" : "Open external project link"}</a>}
      </div>
    </motion.article>
  );
}

function ProjectDetails({ project, imageIndex, onImageChange, onClose, labels, mediaUrl, accent, isAr }) {
  const images = (project.images || []).filter(Boolean).slice(0, 5);
  const link = /^https?:\/\//i.test(project.link || "") ? project.link : "";
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const moveImage = (direction) => onImageChange((imageIndex + direction + images.length) % images.length);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={`${labels.details}: ${project.title || ""}`} className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-border/70 bg-background shadow-2xl">
        <button type="button" onClick={onClose} aria-label={labels.close} className="absolute end-3 top-3 z-10 rounded-full border border-white/30 bg-black/50 p-2 text-white"><X className="h-4 w-4" /></button>
        {images.length > 0 && <div className="relative flex h-64 items-center justify-center bg-black sm:h-[26rem]">
          <img src={mediaUrl(images[imageIndex])} alt={`${project.title || "Project"} ${imageIndex + 1}`} className="h-full w-full object-contain" />
          {images.length > 1 && <>
            <button type="button" onClick={() => moveImage(-1)} aria-label={labels.previous} className="absolute start-3 rounded-full bg-black/60 p-2 text-white"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={() => moveImage(1)} aria-label={labels.next} className="absolute end-3 rounded-full bg-black/60 p-2 text-white"><ChevronRight className="h-5 w-5" /></button>
            <span className="absolute bottom-3 rounded-full bg-black/65 px-3 py-1 text-xs text-white">{imageIndex + 1} / {images.length}</span>
          </>}
        </div>}
        <div className="space-y-4 p-5 sm:p-7">
          <div><p className="text-xs font-semibold uppercase tracking-widest" style={{ color: accent }}>{labels.details}</p><h2 className="mt-1 font-heading text-2xl font-extrabold">{project.title}</h2></div>
          {project.description && <p className="whitespace-pre-line text-sm leading-7 text-muted-foreground">{project.description}</p>}
          {(project.technologies || project.skills || []).length > 0 && <div className="flex flex-wrap gap-2">{(project.technologies || project.skills).map((item, index) => <span key={index} className="rounded-full border border-border/70 px-3 py-1 text-xs">{typeof item === "string" ? item : item.name}</span>)}</div>}
          {link && <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: accent, color: "#0D1426" }}>{isAr ? "زيارة المشروع" : "Visit project"}<ExternalLink className="h-4 w-4" /></a>}
        </div>
      </section>
    </div>
  );
}

function PortfolioStat({ value, label, accent }) {
  return <div className="rounded-2xl border border-border/60 bg-card/40 p-4 sm:p-5"><p className="font-heading text-2xl font-extrabold sm:text-3xl" style={{ color: accent }}>{value}</p><p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">{label}</p></div>;
}

function Section({ id, eyebrow, icon: Icon, title, children, accent }) {
  return (
    <motion.section id={id} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.45 }}>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.17em]" style={{ color: accent }}>{eyebrow || "THE DETAILS"}</p><h2 className="font-heading text-xl font-bold sm:text-2xl">{title}</h2></div>
        <Icon className="mb-1 h-5 w-5 shrink-0" style={{ color: accent }} />
      </div>
      {children}
    </motion.section>
  );
}

function PortfolioSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-5 py-16 animate-pulse">
        <div className="flex flex-col sm:flex-row items-center gap-6 mb-12">
          <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-2xl bg-secondary/40" />
          <div className="flex-1 space-y-3 text-center sm:text-left">
            <div className="h-4 w-16 bg-secondary/40 rounded mx-auto sm:mx-0" />
            <div className="h-8 w-64 bg-secondary/40 rounded mx-auto sm:mx-0" />
            <div className="h-5 w-48 bg-secondary/40 rounded mx-auto sm:mx-0" />
            <div className="h-4 w-full max-w-md bg-secondary/40 rounded mx-auto sm:mx-0" />
            <div className="flex gap-3 justify-center sm:justify-start mt-4">
              <div className="h-10 w-28 bg-secondary/40 rounded-full" />
              <div className="h-10 w-28 bg-secondary/40 rounded-full" />
            </div>
          </div>
        </div>
        <div className="space-y-8">
          {[1, 2, 3].map((s) => (
            <div key={s}>
              <div className="h-6 w-32 bg-secondary/40 rounded mb-4" />
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="h-24 bg-secondary/30 rounded-xl" />
                <div className="h-24 bg-secondary/30 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}