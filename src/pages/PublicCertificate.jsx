import { useEffect, useState } from "react";
import { Award, Download, Loader2, Share2 } from "lucide-react";
import { jsPDF } from "jspdf";
import { useParams } from "react-router-dom";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";

function imageBlobToPdf(blob, filename) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataUrl = reader.result;
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
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("Could not read certificate image"));
    reader.readAsDataURL(blob);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PublicCertificate() {
  const { shareToken } = useParams();
  const { dir, lang } = useI18n();
  const isAr = lang === "ar";
  const [certificate, setCertificate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.certificates.public(shareToken)
      .then((result) => { if (active) setCertificate(result); })
      .catch((loadError) => { if (active) setError(loadError.message || (isAr ? "الشهادة غير موجودة أو أن الرابط غير صالح." : "Certificate not found or the link is invalid.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [shareToken, isAr]);

  const downloadPdf = async () => {
    if (!certificate) return;
    setBusy(true);
    setError("");
    try {
      const filename = `${(certificate.title || "certificate").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")}.pdf`;
      if (certificate.media_type === "application/pdf") {
        const link = document.createElement("a");
        link.href = api.certificates.publicFileUrl(shareToken, true);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        const response = await fetch(api.certificates.publicFileUrl(shareToken));
        if (!response.ok) throw new Error(isAr ? "تعذر تنزيل ملف الشهادة." : "Could not download the certificate file.");
        await imageBlobToPdf(await response.blob(), filename);
      }
    } catch (downloadError) {
      setError(downloadError.message || (isAr ? "تعذر تنزيل الشهادة." : "Could not download the certificate."));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch (shareError) {
      setError(shareError.message || (isAr ? "تعذر نسخ الرابط." : "Could not copy the link."));
    }
  };

  if (loading) {
    return <main dir={dir} className="flex min-h-screen items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-zeus-gold" /></main>;
  }
  if (!certificate) {
    return <main dir={dir} className="flex min-h-screen items-center justify-center p-5"><p role="alert" className="text-center text-sm text-rose-400">{error}</p></main>;
  }

  const fileUrl = api.certificates.publicFileUrl(shareToken);
  return (
    <main dir={dir} className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="zeus-glass flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <Award className="h-7 w-7 text-zeus-gold" />
            <div>
              <h1 className="text-xl font-bold">{certificate.title}</h1>
              <p className="text-xs text-muted-foreground">{isAr ? "شهادة صادرة من ZEUS" : "Certificate issued by ZEUS"}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={downloadPdf} disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-zeus-gold px-4 py-2.5 text-xs font-bold text-zeus-midnight disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isAr ? "تنزيل PDF" : "Download PDF"}
            </button>
            <button type="button" onClick={share} className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-4 py-2.5 text-xs font-semibold">
              <Share2 className="h-4 w-4" />{isAr ? "نسخ الرابط" : "Copy link"}
            </button>
          </div>
        </header>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        <section className="zeus-glass flex min-h-[65vh] items-center justify-center overflow-hidden p-3 sm:p-6">
          {certificate.media_type === "application/pdf"
            ? <iframe title={certificate.title} src={fileUrl} className="h-[75vh] w-full rounded-lg bg-white" />
            : <img src={fileUrl} alt={certificate.title} className="max-h-[75vh] max-w-full object-contain" />}
        </section>
      </div>
    </main>
  );
}
