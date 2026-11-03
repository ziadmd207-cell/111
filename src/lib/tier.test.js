import { describe, expect, it } from "vitest";
import { canAccessPath, getUserTier } from "./tier";

describe("subscription page access", () => {
  it("limits STARTER to the learning map, schedule, and account settings", () => {
    expect(canAccessPath("/roadmap", "STARTER")).toBe(true);
    expect(canAccessPath("/schedule", "STARTER")).toBe(true);
    expect(canAccessPath("/app", "STARTER")).toBe(true);
    expect(canAccessPath("/settings", "STARTER")).toBe(true);
    expect(canAccessPath("/lesson/lesson-1", "STARTER")).toBe(false);
    expect(canAccessPath("/profile", "STARTER")).toBe(false);
    expect(canAccessPath("/community", "STARTER")).toBe(false);
  });

  it("unlocks lessons and progress with PRO, and career pages with PRIME", () => {
    expect(canAccessPath("/lesson/lesson-1", "PRO")).toBe(true);
    expect(canAccessPath("/progress", "PRO")).toBe(true);
    expect(canAccessPath("/profile", "PRO")).toBe(false);
    expect(canAccessPath("/profile", "PRIME")).toBe(true);
    expect(canAccessPath("/community", "PRIME")).toBe(true);
  });

  it("treats inactive subscriptions as NONE", () => {
    expect(getUserTier({ tier: "PRIME", is_subscription_active: false })).toBe("NONE");
    expect(canAccessPath("/schedule", getUserTier({ is_subscription_active: false }))).toBe(false);
  });
});
