import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { UserModel } from "../models/User";
import { UserRole } from "../types/roles";
import { activeRoleFor, authorizedRoles } from "../services/role.service";

export interface SocketAuthData {
  id: string;
  email: string;
  activeRole: UserRole;
  roles: UserRole[];
}

export function canJoinUserRoom(authenticatedUserId: string, requestedUserId: string) {
  return Boolean(authenticatedUserId) && authenticatedUserId === requestedUserId;
}

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; role: UserRole; activeRole: UserRole; roles: UserRole[] };
  file?: Express.Multer.File;
}

interface AuthMiddlewareOptions {
  allowStaleRole?: boolean;
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  options: AuthMiddlewareOptions = {}
) {
  const token =
    req.cookies?.aarambh_access_token ||
    req.cookies?.neurolearn_access_token ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const payload = jwt.verify(token, env.jwtAccessSecret) as {
      sub: string;
      email: string;
      activeRole?: UserRole;
      roleVersion?: number;
    };
    const user = await UserModel.findById(payload.sub).select("email role roles activeRole roleVersion isActive").lean();
    if (!user || user.isActive === false) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const roles = authorizedRoles(user);
    const activeRole = activeRoleFor(user);
    if (
      !options.allowStaleRole &&
      (payload.roleVersion !== user.roleVersion || payload.activeRole !== activeRole)
    ) {
      return res.status(401).json({ message: "Session role is stale" });
    }
    req.user = {
      id: String(user._id),
      email: user.email,
      role: activeRole,
      activeRole,
      roles
    };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const activeAllowed = Boolean(req.user?.activeRole && roles.includes(req.user.activeRole));
    const adminPrivilege = roles.includes("admin") && Boolean(req.user?.roles.includes("admin"));
    if (!req.user || (!activeAllowed && !adminPrivilege)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

export async function authenticateSocket(socket: { handshake: { auth?: { token?: unknown }; headers: Record<string, unknown> }; data: Record<string, unknown> }, next: (error?: Error) => void) {
  try {
    const cookieHeader = String(socket.handshake.headers.cookie || "");
    const cookieToken =
      cookieHeader.match(/(?:^|;\s*)aarambh_access_token=([^;]+)/)?.[1] ||
      cookieHeader.match(/(?:^|;\s*)neurolearn_access_token=([^;]+)/)?.[1];
    const authToken = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : undefined;
    const bearer = typeof socket.handshake.headers.authorization === "string"
      ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, "")
      : undefined;
    const token = authToken || bearer || cookieToken;
    if (!token) return next(new Error("Unauthorized"));
    const payload = jwt.verify(token, env.jwtAccessSecret) as { sub: string; email: string; activeRole?: UserRole; roleVersion?: number };
    const user = await UserModel.findById(payload.sub).select("email role roles activeRole roleVersion isActive").lean();
    if (!user || user.isActive === false) return next(new Error("Unauthorized"));
    const roles = authorizedRoles(user);
    const activeRole = activeRoleFor(user);
    if (payload.roleVersion !== user.roleVersion || payload.activeRole !== activeRole) return next(new Error("Session role is stale"));
    socket.data.user = { id: String(user._id), email: user.email, activeRole, roles } satisfies SocketAuthData;
    return next();
  } catch {
    return next(new Error("Invalid token"));
  }
}

export function authMiddlewareWithStaleRoleRecovery(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  return authMiddleware(req, res, next, { allowStaleRole: true });
}
