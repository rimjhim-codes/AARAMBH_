import { Request } from "express";
import { AuditLogModel } from "../models/sih/SihModels";

export async function writeAuditLog(input: {
  actorId?: string;
  action: string;
  resource?: string;
  meta?: Record<string, unknown>;
  req?: Request;
}) {
  return AuditLogModel.create({
    actorId: input.actorId,
    action: input.action,
    resource: input.resource || "",
    meta: input.meta,
    ip: input.req?.ip || input.req?.socket.remoteAddress || "unknown"
  });
}
