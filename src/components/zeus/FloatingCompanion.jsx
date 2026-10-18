import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ZEUS_IMAGES, withImageFallback } from "@/lib/zeus-images";

const ROBOT_URL = ZEUS_IMAGES.avatar;

export default function FloatingCompanion() {
  const nav = useNavigate();
  const loc = useLocation();
  if (loc.pathname.startsWith("/lesson/")) return null;

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.8, type: "spring", stiffness: 200 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={() => nav("/companion")}
      className="fixed bottom-24 lg:bottom-6 start-4 z-30 group"
    >
      <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-zeus-gold/40 shadow-gold-sm group-hover:border-zeus-gold transition">
        <img src={ROBOT_URL} alt="Zeus" className="w-full h-full object-cover object-top" onError={withImageFallback} />
      </div>
      <span className="absolute -top-0.5 -end-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-background animate-pulse-soft" />
    </motion.button>
  );
}