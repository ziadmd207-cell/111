import React, { useState, useEffect } from "react";
import { Plus, Loader2, Wand2, X, ExternalLink, Trash2, Image as ImageIcon, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";


function normalizeUrl(u) {
  const v = (u || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}


export default function Projects() {
  const { t, lang, dir } = useI18n();
  const isAr = lang === "ar";
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState(null);
  const [form, setForm] = useState({ title: "", description: "", link: "", images: [] });
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedImage, setSelectedImage] = useState(0);

  const load = async () => {
    setActionError("");
    try {
      const p = await api.entities.Project.filter({}, "-created_date", 50);
      setProjects(p);
    } catch (error) {
      setActionError(error.message || (isAr ? "تعذر تحميل المشاريع." : "Couldn't load projects."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ title: "", description: "", link: "", images: [] });
    setShowForm(false);
  };

  const rewrite = async () => {
    if (!form.description.trim()) return;
    setRewriting(true);
    setSaveError("");
    try {
      const res = await api.functions.invoke("rewriteProjectDescription", { description: form.description, lang });
      const data = res.data || res;
      if (!data.rewritten) throw new Error(isAr ? "تعذرت إعادة الصياغة. حاول مرة أخرى." : "The rewrite returned no result. Please retry.");
      setForm({ ...form, description: data.rewritten });
    } catch (error) {
      setSaveError(error.message || (isAr ? "تعذرت إعادة صياغة الوصف." : "Couldn't rewrite the description."));
    } finally {
      setRewriting(false);
    }
  };

  const uploadImage = async (file, slot) => {
    setUploadingIdx(slot);
    setSaveError("");
    try {
      const { file_url } = await api.integrations.Core.UploadPublicFile({ file });
      if (!file_url) throw new Error(isAr ? "رفع الصورة لم يرجع رابطًا صالحًا." : "Image upload returned no file URL.");
      const imgs = [...form.images];
      imgs[slot] = file_url;
      setForm({ ...form, images: imgs });
    } catch (error) {
      setSaveError(error.message || (isAr ? "تعذر رفع الصورة." : "Couldn't upload the image."));
    } finally {
      setUploadingIdx(null);
    }
  };

  const save = async () => {
    if (!form.title.trim() || !form.description.trim()) return;
    setSaving(true);
    setSaveError("");
    setSaveNotice("");
    try {
      const link = normalizeUrl(form.link);
      if (link) {
        const parsed = new URL(link);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(isAr ? "رابط المشروع يجب أن يبدأ بـ http أو https." : "Project links must use http or https.");
      }
      const response = await api.functions.invoke("saveCareerProject", {
        title: form.title.trim().slice(0, 120),
        description: form.description.trim(),
        link,
        images: form.images.filter(Boolean),
      });
      const result = response.data || response;
      if (!result.project?.id) throw new Error(isAr ? "لم يتم حفظ المشروع." : "The project was not saved.");
      setProjects((current) => [result.project, ...current.filter((project) => project.id !== result.project.id)]);
      resetForm();
      setSaveNotice(isAr
        ? `تم حفظ المشروع وإعادة صياغته بالإنجليزية${result.cv_synced ? " وتحديثه في السيرة والبورتفوليو" : " وإضافته للبورتفوليو"}.`
        : `Project saved and rewritten in English${result.cv_synced ? " and synced to your CV and portfolio" : " and added to your portfolio"}.`);
    } catch (e) {
      setSaveError(e.message || (isAr ? "تعذر حفظ المشروع — حاول تاني" : "Couldn't save the project — try again"));
    }
    setSaving(false);
  };

  const remove = async (id) => {
    setActionError("");
    try {
      await api.entities.Project.delete(id);
      await load();
    } catch (error) {
      setActionError(error.message || (isAr ? "تعذر حذف المشروع." : "Couldn't delete the project."));
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;

  return (
    <div dir={dir} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl">{t("projects.title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{isAr ? "شارك مشاريعك الحقيقية" : "Share your real projects"}</p>
        </div>
        {actionError && <p role="alert" className="zeus-glass border border-destructive/40 p-3 text-sm text-destructive">{actionError}</p>}
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-zeus-gold text-zeus-midnight font-semibold text-sm hover:bg-zeus-brightgold transition shadow-gold-sm">
            <Plus style={{ width: 18, height: 18 }} /> {isAr ? "إضافة مشروع" : "Add Project"}
          </button>
        )}
      </div>

      {saveNotice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-400">{saveNotice}</p>}

      {showForm && (
        <div className="zeus-glass p-5 space-y-4 animate-fade-up">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-sm">{isAr ? "مشروع جديد" : "New Project"}</h3>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground"><X style={{ width: 18, height: 18 }} /></button>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">{isAr ? "اسم المشروع" : "Project title"}</label>
            <input value={form.title} maxLength={120} onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder={isAr ? "مثال: لوحة تحليل المبيعات" : "e.g. Sales Analytics Dashboard"}
              className="w-full rounded-xl border border-border/60 bg-secondary/30 px-3.5 py-3 text-sm focus:outline-none focus:zeus-gold-border" />
          </div>

          {/* Description with AI rewrite */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-muted-foreground">{isAr ? "وصف مشروعك" : "Describe your project"}</label>
              <button onClick={rewrite} disabled={rewriting || !form.description.trim()}
                className="inline-flex items-center gap-1 text-xs text-zeus-brightgold hover:text-zeus-gold disabled:opacity-50">
                {rewriting ? <Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> : <Wand2 style={{ width: 13, height: 13 }} />}
                {isAr ? "إعادة صياغة بالـ AI" : "Rewrite with AI"}
              </button>
            </div>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4}
              placeholder={isAr ? "اكتب وصف مشروعك... إيه بيعمل، التقنيات المستخدمة، والمميزات..." : "Describe your project... what it does, technologies used, features..."}
              className="w-full rounded-xl bg-secondary/30 border border-border/60 px-3.5 py-3 text-sm focus:outline-none focus:zeus-gold-border resize-none" />
          </div>

          {/* Link */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">{isAr ? "رابط المشروع" : "Project Link"}</label>
            <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })}
              placeholder={isAr ? "https://..." : "https://..."}
              className="w-full rounded-xl bg-secondary/30 border border-border/60 px-3.5 py-3 text-sm focus:outline-none focus:zeus-gold-border" />
          </div>

          {/* Up to five project images */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">{isAr ? "صور المشروع (حتى 5 صور)" : "Project images (up to 5)"}</label>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {[0, 1, 2, 3, 4].map((slot) => (
                <label key={slot} className="aspect-square rounded-xl border-2 border-dashed border-border/60 bg-secondary/20 flex items-center justify-center cursor-pointer hover:border-zeus-gold/40 transition overflow-hidden relative">
                  {form.images[slot] ? (
                    <>
                      <img src={form.images[slot]} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={(e) => { e.preventDefault(); const imgs = [...form.images]; imgs[slot] = null; setForm({ ...form, images: imgs }); }}
                        className="absolute top-1 end-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80">
                        <X style={{ width: 12, height: 12 }} />
                      </button>
                    </>
                  ) : uploadingIdx === slot ? (
                    <Loader2 className="text-zeus-gold animate-spin" style={{ width: 20, height: 20 }} />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <ImageIcon style={{ width: 20, height: 20 }} className="mx-auto mb-1 opacity-50" />
                      <span className="text-[10px]">{isAr ? "رفع" : "Upload"}</span>
                    </div>
                  )}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={uploadingIdx !== null} onChange={(e) => e.target.files[0] && uploadImage(e.target.files[0], slot)} />
                </label>
              ))}
            </div>
          </div>

          <button onClick={save} disabled={saving || uploadingIdx !== null || !form.title.trim() || !form.description.trim()}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold text-sm hover:bg-zeus-brightgold transition shadow-gold disabled:opacity-50">
            {saving ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : <Plus style={{ width: 16, height: 16 }} />}
            {isAr ? "حفظ المشروع" : "Save Project"}
          </button>
          {saveError && (
            <p className="flex items-center gap-1.5 text-xs text-red-400"><AlertCircle style={{ width: 13, height: 13 }} /> {saveError}</p>
          )}
        </div>
      )}

      {/* Projects grid */}
      {projects.length > 0 ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {projects.map((p) => (
            <div key={p.id} className="zeus-glass overflow-hidden group">
              {p.images?.[0] && (
                <div className="aspect-video overflow-hidden">
                  <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-heading font-bold text-sm line-clamp-1">{p.title}</h3>
                  <button onClick={() => remove(p.id)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 style={{ width: 14, height: 14 }} /></button>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{p.description}</p>
                <button type="button" onClick={() => { setSelectedProject(p); setSelectedImage(0); }}
                  className="mt-3 text-xs font-semibold text-zeus-brightgold hover:underline">
                  {isAr ? "عرض التفاصيل والصور" : "View details and images"}
                </button>
                {p.link && (
                  <a href={normalizeUrl(p.link)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-zeus-gold hover:underline mt-2">
                    <ExternalLink style={{ width: 12, height: 12 }} /> {isAr ? "فتح المشروع" : "Open project"}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : !showForm && (
        <div className="zeus-glass p-12 text-center">
          <ImageIcon className="text-muted-foreground/30 mx-auto mb-4" style={{ width: 40, height: 40 }} />
          <p className="text-muted-foreground text-sm mb-4">{isAr ? "لسه مفيش مشاريع. أضف أول مشروع ليك!" : "No projects yet. Add your first project!"}</p>
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-zeus-gold text-zeus-midnight font-semibold text-sm hover:bg-zeus-brightgold transition shadow-gold">
            <Plus style={{ width: 16, height: 16 }} /> {isAr ? "إضافة مشروع" : "Add Project"}
          </button>
        </div>
      )}
      {selectedProject && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedProject(null); }}>
          <section role="dialog" aria-modal="true" aria-label={selectedProject.title}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border/70 bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border/50 p-4">
              <div>
                <h2 className="font-heading font-bold">{selectedProject.title}</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">{isAr ? "تفاصيل المشروع" : "Project details"}</p>
              </div>
              <button type="button" onClick={() => setSelectedProject(null)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary/60" aria-label={isAr ? "إغلاق" : "Close"}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {!!selectedProject.images?.filter(Boolean).length && (
              <div className="relative flex h-64 items-center justify-center bg-black sm:h-[26rem]">
                <img src={selectedProject.images.filter(Boolean)[selectedImage] || selectedProject.images.filter(Boolean)[0]}
                  alt={`${selectedProject.title} ${selectedImage + 1}`} className="h-full w-full object-contain" />
                {selectedProject.images.filter(Boolean).length > 1 && <>
                  <button type="button" onClick={() => setSelectedImage((index) => (index - 1 + selectedProject.images.filter(Boolean).length) % selectedProject.images.filter(Boolean).length)}
                    className="absolute start-3 rounded-full bg-black/65 p-2 text-white" aria-label={isAr ? "الصورة السابقة" : "Previous image"}><ChevronLeft className="h-5 w-5" /></button>
                  <button type="button" onClick={() => setSelectedImage((index) => (index + 1) % selectedProject.images.filter(Boolean).length)}
                    className="absolute end-3 rounded-full bg-black/65 p-2 text-white" aria-label={isAr ? "الصورة التالية" : "Next image"}><ChevronRight className="h-5 w-5" /></button>
                  <span className="absolute bottom-3 rounded-full bg-black/65 px-3 py-1 text-xs text-white">
                    {selectedImage + 1} / {selectedProject.images.filter(Boolean).length}
                  </span>
                </>}
              </div>
            )}
            <div className="space-y-4 p-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{selectedProject.description}</p>
              {selectedProject.link && (
                <a href={normalizeUrl(selectedProject.link)} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-zeus-gold px-4 py-2 text-xs font-bold text-zeus-midnight">
                  {isAr ? "فتح المشروع" : "Open project"} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}