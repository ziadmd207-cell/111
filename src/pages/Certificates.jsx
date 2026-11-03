import { useEffect, useState } from "react";
import { Award, Download, ExternalLink, Loader2, Share2, X } from "lucide-react";
import { jsPDF } from "jspdf";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";

function blobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read certificate image"));
    reader.readAsDataURL(blob);
  });
}

function imageBlobToPdf(blob, filename) {
  return blobAsDataUrl(blob).then((dataUrl) => {
    const pdf = new jsPDF("p", "pt", "a4");
    const image = pdf.getImageProperties(dataUrl);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 28;
    const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    pdf.addImage(dataUrl, image.fileType, (pageWidth - width) / 2, (pageHeight - height) / 2, width, height);
    pdf.save(filename);
  });
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Certificates() {
  const { lang, dir } = useI18n();
  const isAr = lang === "ar";
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let active = true;
    api.certificates.mine()
      .then((result) => { if (active) setCertificates(result.certificates || []); })
      .catch((loadError) => { if (active) setError(loadError.message || (isAr ? "تعذر تحميل الشهادات." : "Could not load certificates.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isAr]);

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const downloadCertificate = async (certificate) => {
    setBusy(certificate.id);
    setError("");
    try {
      const blob = await api.certificates.file(certificate.id);
      const filename = `${(certificate.title || "certificate").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")}.pdf`;
      if (certificate.media_type === "application/pdf") saveBlob(blob, filename);
      else await imageBlobToPdf(blob, filename);
    } catch (downloadError) {
      setError(downloadError.message || (isAr ? "تعذر تنزيل الشهادة." : "Could not download the certificate."));
    } finally {
      setBusy("");
    }
  };

  const showPreview = async (certificate) => {
    setBusy(certificate.id);
    setError("");
    try {
      const blob = await api.certificates.file(certificate.id);
      setPreview({ certificate, url: URL.createObjectURL(blob) });
    } catch (previewError) {
      setError(previewError.message || (isAr ? "تعذر فتح الشهادة." : "Could not open the certificate."));
    } finally {
      setBusy("");
    }
  };

  const shareCertificate = async (certificate) => {
    setError("");
    setNotice("");
    try {
      const url = new URL(certificate.share_url, window.location.origin).href;
      await navigator.clipboard.writeText(url);
      setNotice(isAr ? "تم نسخ رابط مشاركة الشهادة." : "Certificate sharing link copied.");
    } catch (shareError) {
      setError(shareError.message || (isAr ? "تعذر نسخ الرابط." : "Could not copy the link."));
    }
  };

  return (
    <div dir={dir} className="space-y-5">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zeus-gold/15">
          <Award className="h-6 w-6 text-zeus-gold" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{isAr ? "شهاداتي" : "My certificates"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{isAr ? "الشهادات التي أرسلها لك فريق ZEUS." : "Certificates sent to you by the ZEUS team."}</p>
        </div>
      </header>
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-400">{notice}</p>}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-zeus-gold" /></div>
      ) : certificates.length === 0 ? (
        <div className="zeus-glass p-10 text-center text-sm text-muted-foreground">{isAr ? "لسه مفيش شهادات مضافة لحسابك." : "There are no certificates on your account yet."}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {certificates.map((certificate) => (
            <article key={certificate.id} className="zeus-glass space-y-4 p-5">
              <div className="flex items-start gap-3">
                <Award className="mt-0.5 h-5 w-5 shrink-0 text-zeus-gold" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-heading font-bold">{certificate.title}</h2>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{certificate.file_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(certificate.created_date).toLocaleDateString(isAr ? "ar-EG" : "en-US")}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => showPreview(certificate)} disabled={Boolean(busy)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold disabled:opacity-50">
                  {busy === certificate.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  {isAr ? "عرض" : "View"}
                </button>
                <button type="button" onClick={() => downloadCertificate(certificate)} disabled={Boolean(busy)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zeus-gold px-3 py-2 text-xs font-bold text-zeus-midnight disabled:opacity-50">
                  <Download className="h-3.5 w-3.5" />{isAr ? "تنزيل PDF" : "Download PDF"}
                </button>
                <button type="button" onClick={() => shareCertificate(certificate)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold">
                  <Share2 className="h-3.5 w-3.5" />{isAr ? "نسخ رابط المشاركة" : "Copy share link"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 sm:p-6" onClick={() => setPreview(null)}>
          <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-border/60 p-3">
              <h2 className="truncate text-sm font-bold">{preview.certificate.title}</h2>
              <button type="button" onClick={() => setPreview(null)} aria-label={isAr ? "إغلاق" : "Close"} className="rounded-lg p-2 hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-black/20 p-3">
              {preview.certificate.media_type === "application/pdf"
                ? <iframe title={preview.certificate.title} src={preview.url} className="h-[75vh] w-full rounded-lg bg-white" />
                : <img src={preview.url} alt={preview.certificate.title} className="mx-auto max-h-[75vh] max-w-full object-contain" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
