import { UserRole } from "./store";

export function normalizeRole(role?: UserRole | string | null): UserRole | null {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "administrator") return "admin";
  if (normalized === "employee" || normalized === "officer") {
    return "employee";
  }
  if (normalized === "faculty" || normalized === "trainer") return "faculty";
  return null;
}

export function getHomeForRole(role?: UserRole | string | null) {
  switch (normalizeRole(role)) {
    case "admin":
      return "/admin/dashboard";
    case "faculty":
      return "/faculty/dashboard";
    case "employee":
      return "/sih/dashboard";
    default:
      return "/login?error=invalid_role";
  }
}

const SIH_PREFIXES = [
  "/sih",
  "/competencies",
  "/skill-gaps",
  "/learning-path",
  "/assessments",
  "/quizzes",
  "/learning-history",
  "/igot",
  "/nssta-training",
  "/ai-assistant",
  "/labs",
  "/performance",
  "/admin",
  "/faculty",
  "/professional",
  "/help",
  "/platform-courses"
];

export function isSihExperience(pathname: string) {
  return SIH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Shared learning tools (not a role). Accessible to employee, faculty, and admin. */
export function isLearningExperience(pathname: string) {
  if (isSihExperience(pathname)) return false;
  const learningPrefixes = [
    "/player",
    "/quiz",
    "/settings"
  ];
  return learningPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
