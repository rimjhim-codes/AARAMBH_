import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../../middleware/auth";
import { NotificationModel } from "../../models/Notification";
import { RoleRequestModel } from "../../models/RoleRequest";
import { UserModel } from "../../models/User";
import { authorizedRoles } from "../../services/role.service";
import { assignRolesToUser } from "./admin.controller";
import { EmployeeProfileModel } from "../../models/sih/SihModels";
import { uploadToCloudinary } from "../../services/cloudinary.service";

export const facultyAccessRequestSchema = z.object({
  designation: z.string().trim().min(2).max(160),
  justification: z.string().trim().min(20).max(1200),
  experienceNotes: z.string().trim().max(1200).optional().default("")
});

export const reviewRoleRequestSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  rejectionReason: z.string().trim().max(600).optional().default("")
}).superRefine((value, context) => {
  if (value.status === "rejected" && value.rejectionReason.length < 5) {
    context.addIssue({ code: z.ZodIssueCode.too_small, minimum: 5, type: "string", inclusive: true, path: ["rejectionReason"], message: "A rejection reason is required." });
  }
});

export const interviewTrackingSchema = z.object({
  interviewConducted: z.boolean(),
  interviewNotes: z.string().trim().max(600).optional().default("")
});

export async function requestFacultyAccess(req: AuthenticatedRequest, res: Response) {
  const payload = facultyAccessRequestSchema.parse(req.body);
  const existing = await RoleRequestModel.findOne({
    userId: req.user!.id,
    requestedRole: "faculty",
    status: "pending"
  });
  if (existing) return res.status(409).json({ message: "A faculty access request is already pending." });

  try {
    const profile = await EmployeeProfileModel.findOne({ userId: req.user!.id }).select("designation").lean();
    const file = req.file;
    const supportingDocument = file
      ? {
          url: await uploadToCloudinary(`data:${file.mimetype};base64,${file.buffer.toString("base64")}`, "raw"),
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        }
      : undefined;
    const request = await RoleRequestModel.create({
      userId: req.user!.id,
      requestedRole: "faculty",
      designationSnapshot: payload.designation || profile?.designation || "",
      justification: payload.justification,
      experienceNotes: payload.experienceNotes || undefined,
      supportingDocument
    });

    const adminUsers = await UserModel.find({ roles: "admin" }).select("_id").lean();
    if (adminUsers.length > 0) {
      const notifications = adminUsers.map(admin => ({
        userId: admin._id,
        title: "New Role Request Pending",
        body: `A new faculty access request has been submitted and requires administrator review.`,
        type: "admin_alert"
      }));
      await NotificationModel.insertMany(notifications);
    }

    return res.status(201).json({ request });
  } catch (error: any) {
    if (error?.code === 11000) return res.status(409).json({ message: "A faculty access request is already pending." });
    throw error;
  }
}

export async function updateInterviewTracking(req: AuthenticatedRequest, res: Response) {
  const payload = interviewTrackingSchema.parse(req.body);
  const request = await RoleRequestModel.findOne({ _id: req.params.id, status: "pending" });
  if (!request) return res.status(404).json({ message: "Pending role request not found." });
  request.interviewConducted = payload.interviewConducted;
  request.interviewNotes = payload.interviewNotes || undefined;
  await request.save();
  return res.json({ request });
}

export async function listRoleRequests(_req: AuthenticatedRequest, res: Response) {
  const requests = await RoleRequestModel.find({ status: "pending" })
    .populate("userId", "name email role roles activeRole")
    .sort({ requestedAt: 1 });
  return res.json({ requests });
}

export async function reviewRoleRequest(req: AuthenticatedRequest, res: Response) {
  const { status, rejectionReason } = reviewRoleRequestSchema.parse(req.body);
  const request = await RoleRequestModel.findOne({ _id: req.params.id, status: "pending" });
  if (!request) return res.status(404).json({ message: "Pending role request not found." });

  const target = await UserModel.findById(request.userId);
  if (!target) return res.status(404).json({ message: "Requesting user not found." });

  if (status === "approved") {
    await assignRolesToUser({
      actorId: req.user!.id,
      targetUserId: String(target._id),
      requestedRoles: [...authorizedRoles(target).filter((role) => role === "employee" || role === "faculty"), "faculty"],
      roleRequestId: String(request._id)
    });
  }

  request.status = status;
  request.reviewedBy = req.user!.id as any;
  request.reviewedAt = new Date();
  request.rejectionReason = status === "rejected" ? rejectionReason : undefined;
  await request.save();

  await NotificationModel.create({
    userId: target._id,
    title: status === "approved" ? "Faculty access approved" : "Faculty access request rejected",
    body: status === "approved"
      ? "You can now switch to the Faculty workspace."
      : `Your faculty access request was not approved. Reason: ${rejectionReason}`,
    type: "system"
  });
  const io = req.app.get("io") as import("socket.io").Server | undefined;
  if (io) {
    io.to(`user:${target._id}`).emit("notification:new", { type: "system" });
  }

  return res.json({ request });
}
