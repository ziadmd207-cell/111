import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Workflow, Loader2, Target, CheckCircle2 } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/use-toast";
import RoadmapTree from "@/components/zeus/RoadmapTree";
import NodeDetail from "@/components/zeus/NodeDetail";

const isReady = (n) => Array.isArray(n?.resources) && n.resources.length > 0;

const ytId = (url) => {
  const m = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
};

export default function Roadmap() {
  const { t, lang, dir } = useI18n();
  const { toast } = useToast();
  const isAr = lang === "ar";
  const [roadmap, setRoadmap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openTreeId, setOpenTreeId] = useState(null);
  const [fetchingId, setFetchingId] = useState(null);
  const [failedIds, setFailedIds] = useState([]);
  const [prefetching, setPrefetching] = useState(false);

  const roadmapRef = useRef(null);
  roadmapRef.current = roadmap;
  const chainRef = useRef(Promise.resolve());
  const inFlightRef = useRef(new Set());
  const failedRef = useRef(new Set());

  useEffect(() => {
    (async () => {
      const r = await api.entities.Roadmap.filter({ status: "active" }, "-created_date", 1);
      if (r.length) setRoadmap(r[0]);
      setLoading(false);
    })();
  }, []);

  // Serialized fetch — one node at a time so results never overwrite each other.
  // Consumes the real backend contract {resources: [...]} (NOT {success,nodes}),
  // merges into the node AND persists to the roadmap so videos survive reloads.
  const doFetch = useCallback((nodeId, { manual = false } = {}) => {
    if (inFlightRef.current.has(nodeId)) return chainRef.current;
    inFlightRef.current.add(nodeId);
    const run = chainRef.current.then(async () => {
      const cur = roadmapRef.current;
      const node = (cur?.nodes || []).find((n) => n.id === nodeId);
      if (!node || (isReady(node) && !manual)) return { ok: true, cached: true };
      setFetchingId(nodeId);
      setFailedIds((p) => p.filter((x) => x !== nodeId));
      try {
        const seen = manual ? (node.resources || []).map((r) => ytId(r.url)).filter(Boolean) : [];
        const res = await api.functions.invoke("nodeResources", { roadmapId: cur.id, nodeId, lang, exclude: seen, force: manual });
        const data = res?.data || {};
        const resources = Array.isArray(data.resources) ? data.resources : [];
        if (!resources.length) throw new Error("empty");
        const nodes = (cur.nodes || []).map((n) => (n.id === nodeId ? { ...n, resources } : n));
        setRoadmap((prev) => ({ ...prev, nodes }));
        // Persist so reopening the node (or reloading) shows the same videos
        try { await api.entities.Roadmap.update(cur.id, { nodes }); } catch {}
        failedRef.current.delete(nodeId);
        if (manual) {
          const firstVideo = resources.find((r) => r.type === "video");
          toast({
            title: isAr ? "تم تحديث المصادر ✓" : "Resources refreshed ✓",
            description: firstVideo ? `${isAr ? "فيديو جديد" : "New video"}: ${firstVideo.title}` : undefined,
          });
        }
        setFetchingId(null);
        return { ok: true };
      } catch (e) {
        failedRef.current.add(nodeId);
        setFailedIds((p) => [...p, nodeId]);
        if (manual) {
          toast({
            title: isAr ? "مفيش بديل متاح دلوقتي" : "No alternative available",
            description: isAr ? "جرّب تاني كمان شوية" : "Try again later",
            variant: "destructive",
          });
        }
        setFetchingId(null);
        return { ok: false };
      }
    });
    chainRef.current = run.catch(() => {});
    run.finally(() => inFlightRef.current.delete(nodeId));
    return run;
  }, [lang, isAr, toast]);

  const fetchResources = useCallback((nodeId) => {
    failedRef.current.delete(nodeId);
    setFailedIds((p) => p.filter((x) => x !== nodeId));
    return doFetch(nodeId, { manual: true });
  }, [doFetch]);

  // Background prefetch: collect resources for every node ahead of time.
  // YouTube quota allows ~100 nodes/day, so prefetch the whole roadmap —
  // an unfetched roadmap looks like "shallow search with no videos".
  useEffect(() => {
    if (!roadmap?.id) return;
    let cancelled = false;
    (async () => {
      setPrefetching(true);
      for (;;) {
        if (cancelled) break;
        const cur = roadmapRef.current;
        const next = (cur?.nodes || []).find((n) => !isReady(n) && !failedRef.current.has(n.id) && !inFlightRef.current.has(n.id));
        if (!next) break;
        await doFetch(next.id);
      }
      if (!cancelled) setPrefetching(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadmap?.id, doFetch]);

  const ensureResources = (nodeId) => {
    const node = (roadmap?.nodes || []).find((n) => n.id === nodeId);
    if (node && !isReady(node) && !failedRef.current.has(nodeId)) doFetch(nodeId);
  };

  const toggleTree = (nodeId) => {
    if (openTreeId === nodeId) { setOpenTreeId(null); return; }
    setOpenTreeId(nodeId);
    ensureResources(nodeId);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;

  const nodes = roadmap?.nodes || [];
  const openTreeNode = nodes.find((n) => n.id === openTreeId);
  const ready = nodes.filter(isReady).length;

  return (
    <div dir={dir} className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="font-heading font-extrabold text-2xl sm:text-3xl flex items-center gap-2">
          <Workflow className="text-zeus-gold" style={{ width: 26, height: 26 }} /> {t("roadmap.title")}
        </h1>
        {roadmap?.goal && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zeus-gold/10 border border-zeus-gold/30 text-zeus-brightgold text-sm max-w-full">
            <Target style={{ width: 13, height: 13 }} className="shrink-0" /> <span className="truncate">{roadmap.goal}</span>
          </div>
        )}
      </motion.div>

      {!nodes.length ? (
        <div className="zeus-glass p-10 text-center text-muted-foreground">{isAr ? "مفيش خريطة لسه" : "No roadmap yet"}</div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-card/70 border border-border/60 text-xs font-semibold text-muted-foreground">
              {isAr ? "عرض القائمة" : "List view"}
            </div>
            {prefetching && ready < nodes.length ? (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="text-zeus-gold animate-spin" style={{ width: 12, height: 12 }} />
                {isAr ? `بجهّز المصادر في الخلفية… ${ready}/${nodes.length}` : `Preparing resources in background… ${ready}/${nodes.length}`}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                {ready === nodes.length && <CheckCircle2 className="text-zeus-gold" style={{ width: 12, height: 12 }} />}
                {isAr ? `${nodes.length} محطة · ${ready} مصادرها جاهزة` : `${nodes.length} nodes · ${ready} resourced`}
              </span>
            )}
          </div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <RoadmapTree nodes={nodes} isAr={isAr} openId={openTreeId} onToggle={toggleTree}>
              {openTreeNode && (
                <NodeDetail
                  node={openTreeNode}
                  isAr={isAr}
                  loading={fetchingId === openTreeNode.id || (!isReady(openTreeNode) && !failedIds.includes(openTreeNode.id) && prefetching)}
                  failed={failedIds.includes(openTreeNode.id)}
                  onRefresh={() => fetchResources(openTreeNode.id)}
                />
              )}
            </RoadmapTree>
          </motion.div>
        </>
      )}
    </div>
  );
}