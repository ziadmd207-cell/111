import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { getUserTier, tierRank } from "@/lib/tier";

// Blocks direct-URL access to tier-gated pages: sends the user to
// /subscriptions when their plan doesn't include the route.
export default function TierRoute({ minTier = "STARTER", children }) {
  const { user, isLoadingAuth } = useAuth();
  const loc = useLocation();
  if (isLoadingAuth) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <>{children}</>;
  const rank = tierRank(getUserTier(user));
  if (rank < tierRank(minTier)) {
    return <Navigate to="/subscriptions" replace state={{ from: loc.pathname }} />;
  }
  return <>{children}</>;
}
