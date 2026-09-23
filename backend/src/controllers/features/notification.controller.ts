import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth";
import { NotificationModel } from "../../models/Notification";

export async function listNotifications(req: AuthenticatedRequest, res: Response) {
  const items = await NotificationModel.find({ userId: req.user!.id }).sort({ createdAt: -1 }).limit(50);
  return res.json(items);
}

export async function markNotificationRead(req: AuthenticatedRequest, res: Response) {
  const id = String(req.params.id || "");
  const updated = await NotificationModel.findOneAndUpdate(
    { _id: id, userId: req.user!.id },
    { readAt: new Date() },
    { new: true }
  );
  if (!updated) return res.status(404).json({ message: "Notification not found" });
  return res.json(updated);
}
