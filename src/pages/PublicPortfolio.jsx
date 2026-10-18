import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Github, Linkedin, Mail, Download, Sparkles, FolderKanban, Briefcase, GraduationCap, Award, ExternalLink, MapPin, Phone } from "lucide-react";
import { api } from "@/api/client";
import CVPreview from "@/components/zeus/cv/CVPreview";

export default function PublicPortfolio() {
  const { userId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flippedCard, setFlippedCard] = useState(null);
  const cvRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.functions.invoke("getPublicPortfolio", { userId });
        setData(res.data || res);
      } catch (e) {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const downloadCv = useCallback(async () => {
    if (!cvRef.current) return;
    try {
      const { default: html2canvas } = await import("html2canvas");
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(cvRef.current, { backgroundColor: "#ffffff", scale: 2 });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height * w) / canvas.width;
      pdf.addImage(img, "PNG", 0, 0, w, h);
      pdf.save(`${(data?.cv?.full_name || "CV").replace(/\s+/g, "_")}.pdf`);
    } catch (e) {}
  }, [data]);

  if (loading) return <PortfolioSkeleton />;

  if (!data || (!data.cv && !data.projects?.length)) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-5">
      <p className="text-muted-foreground">Portfolio not found</p>
    </div>
  );

  const cv = data.cv || {};
  const projects = data.projects || [];
  const accent = cv.accent_color || "#FFC107";
  const certList = (cv.certifications || []).map((c) => typeof c === "string" ? { name: c } : c);
  const hasExp = (cv.experiences || []).length > 0;

  return (
    <div className="min-h-screen bg-background" style={{ "--accent": accent, "--accent-glow": `${accent}33`, "--accent-light": `${accent}1a` }}>
      {/* Hidden CV for download */}
      <div className="fixed -left-[9999px] top-0 w-[794px]">
        <CVPreview cv={cv} isAr={false} previewRef={cvRef} />
      </div>

      {/* Hero */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 zeus-grid-bg opacity-20" />
        <div className="absolute inset-0" style={{ background: `radial-gradient(40rem 40rem at 50% 0%, ${accent}33, transparent 60%)` }} />
        <div className="relative max-w-4xl mx-auto px-5 py-16">
          <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
            {cv.photo_url ? (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }}
                className="w-32 h-32 sm:w-36 sm:h-36 shrink-0 rounded-2xl overflow-hidden border-4 shadow-2xl" style={{ borderColor: accent }}>
                <img src={cv.photo_url} alt={cv.full_name} className="w-full h-full object-cover" />
              </motion.div>
            ) : (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }}
                className="w-32 h-32 sm:w-36 sm:h-36 shrink-0 rounded-2xl flex items-center justify-center text-5xl font-bold shadow-2xl"
                style={{ background: accent, color: "#0D1426" }}>
                {(cv.full_name || "Z").charAt(0)}
              </motion.div>
            )}
            <div className="text-center sm:text-left flex-1">
              <motion.p initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
                className="text-muted-foreground text-sm mb-1">I'm</motion.p>
              <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                className="font-heading font-extrabold text-3xl sm:text-5xl">{cv.full_name || "Portfolio"}</motion.h1>
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
                <button onClick={downloadCv} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition hover:opacity-90 shadow-lg" style={{ background: accent }}>
                  <Download style={{ width: 16, height: 16 }} /> Download CV
                </button>
                {cv.phone && (
                  <a href={`https://wa.me/${cv.phone}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border-2 text-sm font-semibold transition hover:bg-secondary/40" style={{ borderColor: accent, color: accent }}>
                    <Phone style={{ width: 16, height: 16 }} /> Contact
                  </a>
                )}
                {cv.email && (
                  <a href={`mailto:${cv.email}`} className="w-10 h-10 rounded-full bg-card border border-border/60 flex items-center justify-center hover:scale-110 transition"><Mail style={{ width: 18, height: 18 }} /></a>
                )}
                {cv.github && <a href={cv.github} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-card border border-border/60 flex items-center justify-center hover:scale-110 transition"><Github style={{ width: 18, height: 18 }} /></a>}
                {cv.linkedin && <a href={cv.linkedin} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-card border border-border/60 flex items-center justify-center hover:scale-110 transition"><Linkedin style={{ width: 18, height: 18 }} /></a>}
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="max-w-4xl mx-auto px-5 py-12 space-y-12">
        {/* Skills */}
        {cv.skills?.length > 0 && (
          <Section icon={Sparkles} title="Skills" accent={accent}>
            <div className="flex flex-wrap gap-2.5">
              {cv.skills.map((s, i) => (
                <motion.span key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }}
                  whileHover={{ y: -4, scale: 1.05 }}
                  className="px-4 py-2 rounded-full text-sm font-medium border transition cursor-default"
                  style={{ borderColor: `${accent}55`, background: `${accent}1a`, color: accent }}>
                  {s.name}
                </motion.span>
              ))}
            </div>
          </Section>
        )}

        {/* Experience Timeline */}
        {hasExp && (
          <Section icon={Briefcase} title="Experience" accent={accent}>
            <div className="relative ps-6">
              <div className="absolute start-0 top-0 bottom-0 w-0.5" style={{ background: `linear-gradient(to bottom, ${accent}, transparent)` }} />
              {cv.experiences.map((e, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                  className="relative mb-6">
                  <div className="absolute -start-6 top-1 w-3 h-3 rounded-full" style={{ background: accent }} />
                  <h3 className="font-heading font-bold">{e.role}</h3>
                  <p className="text-sm font-medium" style={{ color: accent }}>{e.company}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{[e.start, e.end].filter(Boolean).join(" — ")}</p>
                  {e.description && <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{e.description}</p>}
                </motion.div>
              ))}
            </div>
          </Section>
        )}

        {/* Projects as Flip Cards */}
        {projects.length > 0 && (
          <Section icon={FolderKanban} title="Projects" accent={accent}>
            <div className="grid sm:grid-cols-2 gap-5">
              {projects.map((p, i) => (
                <FlipCard key={p.id || i} project={p} accent={accent} isFlipped={flippedCard === (p.id || i)} onFlip={() => setFlippedCard(flippedCard === (p.id || i) ? null : (p.id || i))} />
              ))}
            </div>
          </Section>
        )}

        {/* Education */}
        {cv.education?.length > 0 && (
          <Section icon={GraduationCap} title="Education" accent={accent}>
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
          <Section icon={Award} title="Certifications" accent={accent}>
            <div className="grid sm:grid-cols-2 gap-3">
              {certList.map((c, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
                  className="zeus-glass p-4">
                  <h3 className="font-heading font-bold text-sm">{c.name}</h3>
                  {c.issuer && <p className="text-xs" style={{ color: accent }}>{c.issuer}</p>}
                  {c.date && <p className="text-xs text-muted-foreground mt-0.5">{c.date}</p>}
                  {c.link && <a href={c.link} target="_blank" rel="noreferrer" className="text-xs underline mt-1 inline-block" style={{ color: accent }}>View certificate</a>}
                </motion.div>
              ))}
            </div>
          </Section>
        )}
      </div>

    </div>
  );
}

function FlipCard({ project, accent, isFlipped, onFlip }) {
  return (
    <div className="aspect-[4/3] cursor-pointer" style={{ perspective: "1000px" }} onClick={onFlip}>
      <motion.div className="relative w-full h-full transition-transform duration-500" style={{ transformStyle: "preserve-3d", transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)" }}>
        {/* Front: Image */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden border border-border/60" style={{ backfaceVisibility: "hidden" }}>
          {project.images?.[0] ? (
            <img src={project.images[0]} alt={project.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-card" style={{ background: `${accent}1a` }}>
              <FolderKanban style={{ width: 40, height: 40, color: accent }} />
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
            <h3 className="font-heading font-bold text-white text-sm">{project.title}</h3>
          </div>
        </div>
        {/* Back: Description + Link */}
        <div className="absolute inset-0 rounded-2xl p-5 flex flex-col justify-center" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: `${accent}1a`, border: `1px solid ${accent}55` }}>
          <h3 className="font-heading font-bold text-sm mb-2" style={{ color: accent }}>{project.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{project.description}</p>
          {project.link && (
            <a href={project.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs font-medium mt-3" style={{ color: accent }}>
              Open project <ExternalLink style={{ width: 12, height: 12 }} />
            </a>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function Section({ icon: Icon, title, children, accent }) {
  return (
    <motion.section initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.5 }}>
      <h2 className="font-heading font-bold text-xl mb-5 flex items-center gap-2">
        <Icon style={{ width: 20, height: 20, color: accent }} /> {title}
      </h2>
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