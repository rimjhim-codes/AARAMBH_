import { env } from "../config/env";
import { UserModel } from "../models/User";
import { USER_ROLES, UserRole, coerceUserRole } from "../types/roles";

export function authorizedRoles(user: { roles?: unknown[]; role?: unknown; activeRole?: unknown }): UserRole[] {
  const raw = Array.isArray(user.roles) && user.roles.length
    ? user.roles
    : [user.role || "employee"];
  const coerced = Array.from(
    new Set(
      raw
        .map((value) => coerceUserRole(value))
        .filter((value): value is UserRole => Boolean(value))
    )
  );
  return USER_ROLES.filter((role) => coerced.includes(role));
}

export function activeRoleFor(user: { roles?: unknown[]; role?: unknown; activeRole?: unknown }): UserRole {
  const roles = authorizedRoles(user);
  const preferred = coerceUserRole(user.activeRole) || coerceUserRole(user.role);
  return preferred && roles.includes(preferred)
    ? preferred
    : roles[0] || "employee";
}

export async function migrateLegacyRoles() {
  const legacyUsers = await UserModel.find({
    $or: [
      { roles: { $exists: false } },
      { roles: { $size: 0 } },
      { activeRole: { $exists: false } },
      { role: "student" },
      { roles: "student" },
      { activeRole: "student" }
    ]
  }).select("role roles activeRole roleVersion");
  let migrated = 0;
  for (const user of legacyUsers) {
    const roles = authorizedRoles(user);
    const nextRoles = roles.length ? roles : (["employee"] as UserRole[]);
    const activeRole = activeRoleFor({ ...user.toObject(), roles: nextRoles });
    const before = JSON.stringify({
      role: user.role,
      roles: user.roles,
      activeRole: user.activeRole
    });
    user.roles = nextRoles;
    user.activeRole = activeRole;
    user.role = activeRole;
    if (!Number.isFinite(user.roleVersion)) user.roleVersion = 0;
    const after = JSON.stringify({
      role: user.role,
      roles: user.roles,
      activeRole: user.activeRole
    });
    if (before !== after) {
      user.roleVersion = (user.roleVersion || 0) + 1;
    }
    await user.save();
    migrated += 1;
  }
  if (migrated) console.log(`Migrated ${migrated} legacy user role record(s).`);
}

export async function bootstrapAdminRole() {
  const email = env.adminBootstrapEmail.trim().toLowerCase();
  if (!email) {
    console.log("ADMIN_BOOTSTRAP_EMAIL is not configured; admin role bootstrap skipped.");
    return;
  }
  const user = await UserModel.findOne({ email });
  if (!user) {
    console.warn("Configured admin bootstrap account was not found; sign up and verify it before bootstrapping admin access.");
    return;
  }
  const roles: UserRole[] = ["admin", "employee", "faculty"];
  const activeRole = activeRoleFor({ ...user.toObject(), roles });
  const changed = JSON.stringify(user.roles || []) !== JSON.stringify(roles)
    || user.activeRole !== activeRole || user.role !== activeRole;
  if (changed) {
    user.roles = roles;
    user.activeRole = activeRole;
    user.role = activeRole;
    user.roleVersion = (user.roleVersion || 0) + 1;
    await user.save();
    console.log("Configured admin bootstrap account roles synchronized.");
  }
}
