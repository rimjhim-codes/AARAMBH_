import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { UserRole } from "../types/roles";

export function signAccessToken(id: string, email: string, activeRole: UserRole = "employee", roleVersion = 0) {
  return jwt.sign({ email, activeRole, roleVersion }, env.jwtAccessSecret, { subject: id, expiresIn: "15m" });
}

export function signRefreshToken(id: string, email: string, tokenId: string, familyId: string) {
  return jwt.sign({ email, fid: familyId }, env.jwtRefreshSecret, {
    subject: id,
    jwtid: tokenId,
    expiresIn: "7d"
  });
}
