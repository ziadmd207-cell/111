const TIER_RANK = { NONE: 0, STARTER: 1, PRO: 2, PRIME: 3 };

const ROUTE_TIERS = [
  ['/settings', 'NONE'],
  ['/subscriptions', 'NONE'],
  ['/lesson', 'PRO'],
  ['/projects', 'PRO'],
  ['/progress', 'PRO'],
  ['/statistics', 'PRO'],
  ['/community', 'PRIME'],
  ['/career', 'PRIME'],
  ['/cv-builder', 'PRIME'],
  ['/profile', 'PRIME'],
  ['/certificates', 'PRIME'],
];

export function tierRank(tier) {
  return TIER_RANK[String(tier || 'NONE').toUpperCase()] ?? 0;
}

export function getUserTier(user) {
  if (!user || user.role !== 'admin' && user.is_subscription_active === false) return 'NONE';
  return String(user.tier || user.subscription_plan || 'NONE').toUpperCase();
}

export function canAccessPath(pathname, tier) {
  const minimumTier = ROUTE_TIERS.find(([path]) => pathname.startsWith(path))?.[1] || 'STARTER';
  return tierRank(tier) >= tierRank(minimumTier);
}
