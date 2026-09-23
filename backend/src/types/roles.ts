export const USER_ROLES = ["employee", "faculty", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/** Map obsolete RBAC labels to the current 3-role model without inventing new roles. */
export function coerceUserRole(value: unknown): UserRole | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "student" || normalized === "learner" || normalized === "officer") return "employee";
  if (normalized === "trainer") return "faculty";
  if (normalized === "administrator") return "admin";
  return isUserRole(normalized) ? normalized : null;
}
