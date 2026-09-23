import { Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { AuthenticatedRequest } from "../../middleware/auth";
import { UserModel } from "../../models/User";
import {
  AuditLogModel,
  CompetencyModel,
  CompetencyScoreModel,
  DepartmentModel,
  FacultyAssignmentModel,
  FormalQuizAttemptModel,
  EmployeeProfileModel,
  LearningActivityModel,
  IntegrationStatusModel,
  RoleRequirementModel,
  SkillGapModel,
  SystemSettingsModel,
  AIUsageModel
} from "../../models/sih/SihModels";
import { FrameworkVersionModel } from "../../models/sih/SihModels";
import { getAiProviderStatus } from "../../services/ai/provider";
import { env } from "../../config/env";
import { getIgotProvider } from "../../services/integrations/igot.provider";
import { getNsstaProvider } from "../../services/integrations/nssta.provider";
import { predictiveAnalytics } from "./performance.controller";
import { getVerifiedRagStatus } from "../../services/rag.service";
import { activeRoleFor, authorizedRoles } from "../../services/role.service";
import { writeAuditLog } from "../../services/audit-log.service";
import { getLegacyFrameworkVersion, isFrameworkEditable, LEGACY_FRAMEWORK_ID, LEGACY_FRAMEWORK_VERSION, LEGACY_SOURCE_ID } from "../../services/framework.service";
import { ensureEmployeeProfileForUser } from "../../services/employee-profile.service";

export async function adminDashboard(req: AuthenticatedRequest, res: Response) {
  const [
    totalEmployees,
    totalFaculty,
    activeLearners,
    gapAgg,
    attempts,
    aiUsage,
    flaggedAttempts,
    departmentBreakdown,
    trainingTrend
  ] = await Promise.all([
    UserModel.countDocuments({ $or: [{ roles: "employee" }, { roles: { $exists: false }, role: "employee" }] }),
    UserModel.countDocuments({ $or: [{ roles: "faculty" }, { roles: { $exists: false }, role: "faculty" }] }),
    UserModel.countDocuments({ minutesStudiedTotal: { $gt: 0 } }),
    SkillGapModel.aggregate([
      { $group: { _id: "$priority", count: { $sum: 1 } } }
    ]),
    FormalQuizAttemptModel.aggregate([
      { $group: { _id: null, avg: { $avg: "$percentage" }, n: { $sum: 1 } } }
    ]),
    AIUsageModel.find().sort({ createdAt: -1 }).limit(20),
    FormalQuizAttemptModel.find({ suspiciousActivityCount: { $gt: 0 } })
        .sort({ createdAt: -1 }).limit(20)
        .populate("userId", "name email")
        .populate("quizId", "title")
        .lean(),
    EmployeeProfileModel.aggregate([
      { $match: { department: { $exists: true, $ne: "" } } },
      { $group: { _id: "$department", employees: { $sum: 1 }, averageExperience: { $avg: "$yearsOfExperience" } } },
      { $sort: { employees: -1, _id: 1 } },
      { $limit: 50 }
    ]),
    LearningActivityModel.aggregate([
      { $match: { type: { $in: ["course", "training", "quiz"] } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$occurredAt" } }, activities: { $sum: 1 }, minutes: { $sum: "$minutes" } } },
      { $sort: { "_id": 1 } },
      { $limit: 24 }
    ])
  ]);

  const competencyDistribution = await CompetencyScoreModel.aggregate([
    {
      $group: {
        _id: "$currentLevel",
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return res.json({
    totals: {
      employees: totalEmployees,
      faculty: totalFaculty,
      activeLearners
    },
    skillGapDistribution: gapAgg,
    averageQuizPerformance: attempts[0]?.avg ?? null,
    quizAttemptCount: attempts[0]?.n ?? 0,
    competencyDistribution,
    recentAiUsage: aiUsage,
    flaggedAttempts,
    departmentBreakdown,
    trainingTrend,
    empty:
      totalEmployees === 0 &&
      (attempts[0]?.n || 0) === 0 &&
      gapAgg.length === 0,
    message:
      totalEmployees === 0
        ? "No employee data yet."
        : undefined
  });
}

export async function listUsers(req: AuthenticatedRequest, res: Response) {
  const users = await UserModel.find()
    .select("name email role roles activeRole plan studyStreak xp minutesStudiedTotal isActive createdAt")
    .sort({ createdAt: -1 })
    .limit(200);
  return res.json({ users });
}

export async function assignRolesToUser(input: {
  actorId: string;
  targetUserId: string;
  requestedRoles: unknown[];
  roleRequestId?: string;
}) {
  const requested = input.requestedRoles;
  const allowedRoles = requested.filter((role: unknown) => role === "employee" || role === "faculty") as string[];
  if (allowedRoles.length !== requested.length || requested.includes("admin") || requested.includes("student")) {
    throw Object.assign(new Error("Only employee and faculty roles can be assigned here. Admin is bootstrap-only."), { statusCode: 400 });
  }
  const user = await UserModel.findById(input.targetUserId);
  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });
  const beforeRoles = authorizedRoles(user);
  if (!allowedRoles.length && !beforeRoles.includes("admin")) {
    throw Object.assign(new Error("A non-admin account must retain at least one authorized role."), { statusCode: 400 });
  }
  const nextRoles: string[] = [...new Set(allowedRoles)];
  if (beforeRoles.includes("admin")) nextRoles.push("admin");
  const normalizedRoles = ["employee", "faculty", "admin"].filter((role) => nextRoles.includes(role as any)) as any;
  user.roles = normalizedRoles;
  user.activeRole = activeRoleFor({ ...user.toObject(), roles: normalizedRoles });
  user.role = user.activeRole;
  user.roleVersion = (user.roleVersion || 0) + 1;
  await user.save();
  await AuditLogModel.create({
    actorId: input.actorId,
    action: "user.role_assignment",
    resource: String(user._id),
    meta: { targetUserId: String(user._id), beforeRoles, afterRoles: normalizedRoles, roleRequestId: input.roleRequestId }
  });
  return user;
}

export async function updateUserRole(req: AuthenticatedRequest, res: Response) {
  const payload = z.object({
    role: z.enum(["employee", "faculty"]).optional(),
    roles: z.array(z.enum(["employee", "faculty"])).min(1).optional()
  }).refine((value) => value.role || value.roles, { message: "role or roles is required" }).parse(req.body);
  const requested = payload.roles || [payload.role];
  try {
    const user = await assignRolesToUser({ actorId: req.user!.id, targetUserId: String(req.params.id), requestedRoles: requested });
    return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, roles: user.roles, activeRole: user.activeRole } });
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ message: error?.message || "Role update failed." });
  }
}

export async function createUser(req: AuthenticatedRequest, res: Response) {
  const schema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(["employee", "faculty"])
  });
  const payload = schema.parse(req.body);
  const existing = await UserModel.findOne({ email: payload.email });
  if (existing) return res.status(409).json({ message: "Email already in use" });
  const passwordHash = await bcrypt.hash(payload.password, 12);
  const user = await UserModel.create({
    name: payload.name,
    email: payload.email,
    passwordHash,
    role: payload.role,
    roles: [payload.role],
    activeRole: payload.role,
    emailVerified: true
  });
  await ensureEmployeeProfileForUser(String(user._id));
  await AuditLogModel.create({
    actorId: req.user!.id,
    action: "user.create",
    resource: user.id,
    meta: { role: payload.role }
  });
  return res.status(201).json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, roles: user.roles, activeRole: user.activeRole }
  });
}

export async function listDepartments(_req: AuthenticatedRequest, res: Response) {
  const departments = await DepartmentModel.find().sort({ name: 1 });
  return res.json({ departments });
}

export async function upsertDepartment(req: AuthenticatedRequest, res: Response) {
  const schema = z.object({
    name: z.string().min(2),
    code: z.string().min(2),
    description: z.string().optional(),
    organization: z.string().optional()
  });
  const payload = schema.parse({ ...req.body, code: req.params.code || req.body?.code });
  const department = await DepartmentModel.findOneAndUpdate(
    { code: payload.code },
    payload,
    { upsert: true, new: true }
  );
  return res.json({ department });
}

export async function adminListCompetencies(_req: AuthenticatedRequest, res: Response) {
  const competencies = await CompetencyModel.find().sort({ category: 1, name: 1 });
  return res.json({ competencies });
}

export async function upsertCompetency(req: AuthenticatedRequest, res: Response) {
  const schema = z.object({
    code: z.string().min(2),
    name: z.string().min(2),
    category: z.enum(["statistical", "technical", "digital_governance", "behavioural_managerial"]),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
    frameworkId: z.string().optional(),
    frameworkVersionId: z.string().optional(),
    frameworkVersion: z.string().optional(),
    sourceId: z.string().optional(),
    sourceReference: z.string().optional(),
    proficiencyScale: z.string().optional(),
    proficiencyMinimum: z.number().int().min(0).max(5).optional(),
    proficiencyMaximum: z.number().int().min(0).max(5).optional(),
    proficiencyLevels: z.array(z.object({ level: z.number().int().min(0).max(5), label: z.string().min(1), descriptor: z.string().min(1), evidenceExpectation: z.string().min(1) })).optional()
  });
  const parsed = schema.parse(req.body);
  const legacy = await getLegacyFrameworkVersion();
  const existing = await CompetencyModel.findOne({ code: parsed.code }).select("frameworkVersionId").lean();
  const frameworkVersionId = parsed.frameworkVersionId || existing?.frameworkVersionId || legacy?._id;
  const framework = frameworkVersionId ? await FrameworkVersionModel.findById(frameworkVersionId).select("status frameworkId version sourceId sourceReference").lean() : null;
  if (framework && !isFrameworkEditable(framework.status)) return res.status(409).json({ message: "Competencies in an approved, published, or retired framework version are immutable." });
  const payload = {
    ...parsed,
    frameworkId: parsed.frameworkId || framework?.frameworkId || LEGACY_FRAMEWORK_ID,
    frameworkVersionId,
    frameworkVersion: parsed.frameworkVersion || framework?.version || LEGACY_FRAMEWORK_VERSION,
    sourceId: parsed.sourceId || framework?.sourceId || LEGACY_SOURCE_ID,
    sourceReference: parsed.sourceReference || framework?.sourceReference || "application-defined://legacy-framework"
  };
  const competency = await CompetencyModel.findOneAndUpdate(
    { code: payload.code },
    payload,
    { upsert: true, new: true }
  );
  await writeAuditLog({ actorId: req.user!.id, action: "competency.edit", resource: String(competency._id), meta: { code: payload.code }, req });
  return res.json({ competency });
}

export async function upsertRoleRequirement(req: AuthenticatedRequest, res: Response) {
  const schema = z.object({
    jobRole: z.string().min(2),
    competencyId: z.string().min(1),
    requiredLevel: z.number().min(1).max(5),
    departmentCode: z.string().optional(),
    priorityWeight: z.number().optional(),
    assignment: z.string().optional(),
    sourceReference: z.string().optional(),
    sourceId: z.string().optional(),
    frameworkId: z.string().optional(),
    frameworkVersionId: z.string().optional(),
    frameworkVersion: z.string().optional(),
    effectiveFrom: z.coerce.date().optional(),
    effectiveTo: z.coerce.date().optional(),
    roleContext: z.enum(["current", "career"]).optional(),
    targetRole: z.string().optional()
  });
  const parsed = schema.parse(req.body);
  const legacy = await getLegacyFrameworkVersion();
  const frameworkVersionId = parsed.frameworkVersionId || legacy?._id;
  const framework = frameworkVersionId ? await FrameworkVersionModel.findById(frameworkVersionId).select("status frameworkId version sourceId sourceReference").lean() : null;
  if (framework && !isFrameworkEditable(framework.status)) return res.status(409).json({ message: "Role requirements in an approved, published, or retired framework version are immutable." });
  const payload = {
    ...parsed,
    frameworkId: parsed.frameworkId || framework?.frameworkId || LEGACY_FRAMEWORK_ID,
    frameworkVersionId,
    frameworkVersion: parsed.frameworkVersion || framework?.version || LEGACY_FRAMEWORK_VERSION,
    sourceId: parsed.sourceId || framework?.sourceId || LEGACY_SOURCE_ID,
    sourceReference: parsed.sourceReference || framework?.sourceReference || "application-defined://legacy-framework",
    roleContext: parsed.roleContext || "current"
  };
  const competency = await CompetencyModel.findOne({ _id: payload.competencyId, isActive: true }).select("_id");
  if (!competency) return res.status(400).json({ message: "Active competency not found" });
  const selector = {
      jobRole: payload.jobRole,
      competencyId: payload.competencyId,
      departmentCode: payload.departmentCode || "",
      assignment: payload.assignment || "",
      roleContext: payload.roleContext || "current",
      targetRole: payload.targetRole || "",
      frameworkVersionId: payload.frameworkVersionId
  };
  const before = await RoleRequirementModel.findOne(selector).lean();
  const requirement = await RoleRequirementModel.findOneAndUpdate(
    selector,
    payload,
    { upsert: true, new: true }
  );
  await writeAuditLog({
    actorId: req.user!.id,
    action: "role_requirement.upsert",
    resource: String(requirement._id),
    meta: {
      operation: before ? "update" : "create",
      before: before ? {
        jobRole: before.jobRole,
        competencyId: String(before.competencyId),
        requiredLevel: before.requiredLevel,
        departmentCode: before.departmentCode,
        assignment: before.assignment,
        roleContext: before.roleContext,
        targetRole: before.targetRole
      } : undefined,
      after: {
        jobRole: requirement.jobRole,
        competencyId: String(requirement.competencyId),
        requiredLevel: requirement.requiredLevel,
        departmentCode: requirement.departmentCode,
        assignment: requirement.assignment,
        roleContext: requirement.roleContext,
        targetRole: requirement.targetRole,
        frameworkVersion: requirement.frameworkVersion
      }
    },
    req
  });
  return res.json({ requirement });
}

export async function getSettings(req: AuthenticatedRequest, res: Response) {
  const settings = await SystemSettingsModel.find();
  return res.json({
    settings,
    aiProviders: getAiProviderStatus()
  });
}

export async function updateSetting(req: AuthenticatedRequest, res: Response) {
  const schema = z.object({
    key: z.string().min(1),
    value: z.any()
  });
  const payload = schema.parse(req.body);
  const setting = await SystemSettingsModel.findOneAndUpdate(
    { key: payload.key },
    { key: payload.key, value: payload.value },
    { upsert: true, new: true }
  );
  await AuditLogModel.create({
    actorId: req.user!.id,
    action: "settings.update",
    resource: payload.key
  });
  return res.json({ setting });
}

export async function adminIntegrations(req: AuthenticatedRequest, res: Response) {
  const [igot, nssta] = await Promise.all([
    getIgotProvider().getStatus(),
    getNsstaProvider().getStatus()
  ]);
  const recentAiFailures = await AIUsageModel.find({ success: false }).sort({ createdAt: -1 }).limit(20).lean();
  const rag = await getVerifiedRagStatus();
  await IntegrationStatusModel.findOneAndUpdate(
    { name: "igot" },
    { status: igot.status, message: igot.message, lastCheckedAt: new Date() },
    { upsert: true }
  );
  await IntegrationStatusModel.findOneAndUpdate(
    { name: "nssta" },
    { status: nssta.status, message: nssta.message, lastCheckedAt: new Date() },
    { upsert: true }
  );
  return res.json({
    igot,
    nssta,
    aiProviders: getAiProviderStatus(),
    recentAiFailures,
    embeddings: {
      configured: rag.available,
      provider: rag.provider,
      model: rag.model,
      dimensions: rag.dimensions,
      status: rag.available ? "configured" : "not_configured",
      message: rag.available
        ? `Semantic search uses ${rag.provider} ${rag.model} embeddings (${rag.dimensions} dimensions) and Pinecone.`
        : rag.reason
    },
    envFlags: {
      IGOT_ENABLED: process.env.IGOT_ENABLED === "true",
      NSSTA_ENABLED: process.env.NSSTA_ENABLED === "true",
      IGOT_SIMULATION_MODE: process.env.IGOT_SIMULATION_MODE === "true",
      NSSTA_SIMULATION_MODE: process.env.NSSTA_SIMULATION_MODE === "true",
      AI_PROVIDER: process.env.AI_PROVIDER || (process.env.MISTRAL_API_KEY ? "mistral" : "gemini"),
      DEMO_MODE: process.env.DEMO_MODE === "true"
    }
  });
}

export async function adminOrgSkillGaps(req: AuthenticatedRequest, res: Response) {
  const gaps = await SkillGapModel.aggregate([
    {
      $group: {
        _id: { competencyId: "$competencyId", priority: "$priority" },
        count: { $sum: 1 },
        avgGap: { $avg: "$gap" }
      }
    },
    { $sort: { avgGap: -1 } },
    { $limit: 50 }
  ]);
  const comps = await CompetencyModel.find().lean();
  const nameById = new Map(comps.map((c) => [String(c._id), c.name]));
  return res.json({
    gaps: gaps.map((g) => ({
      competency: nameById.get(String(g._id.competencyId)) || String(g._id.competencyId),
      priority: g._id.priority,
      count: g.count,
      avgGap: Math.round(g.avgGap * 10) / 10
    }))
  });
}

export async function listAuditLogs(req: AuthenticatedRequest, res: Response) {
  const logs = await AuditLogModel.find().sort({ createdAt: -1 }).limit(100);
  return res.json({ logs });
}

export async function adminPredictive(req: AuthenticatedRequest, res: Response) {
  return predictiveAnalytics(req, res);
}

export async function facultyDashboard(req: AuthenticatedRequest, res: Response) {
  const assignments = await FacultyAssignmentModel.find({ facultyId: req.user!.id }).lean();
  const learnerIds = assignments.map((a) => a.learnerId);
  const attempts = await FormalQuizAttemptModel.find({
    userId: learnerIds.length ? { $in: learnerIds } : { $exists: false }
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("userId", "name email")
    .populate("quizId", "title")
    .lean();

  const avg =
    attempts.length === 0
      ? null
      : attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length;

  return res.json({
    assignedLearners: learnerIds.length,
    recentAttempts: attempts,
    flaggedAttempts: attempts.filter((attempt) => (attempt.suspiciousActivityCount || 0) > 0),
    averagePerformance: avg,
    empty: learnerIds.length === 0,
    message:
      learnerIds.length === 0
        ? "No learners assigned yet. Ask an admin to assign learners, or use org-wide quiz analytics."
        : undefined
  });
}

export async function assignLearner(req: AuthenticatedRequest, res: Response) {
  const payload = z.object({ learnerId: z.string().min(1), notes: z.string().max(1000).optional() }).parse(req.body);
  const learnerId = payload.learnerId;
  const learner = await UserModel.findById(learnerId);
  if (!learner || learner.role !== "employee") {
    return res.status(400).json({ message: "learnerId must be an employee user" });
  }
  const assignment = await FacultyAssignmentModel.findOneAndUpdate(
    { facultyId: req.user!.id, learnerId },
    { facultyId: req.user!.id, learnerId, notes: payload.notes || "" },
    { upsert: true, new: true }
  );
  return res.json({ assignment });
}

export async function facultyLearners(req: AuthenticatedRequest, res: Response) {
  const assignments = await FacultyAssignmentModel.find({ facultyId: req.user!.id })
    .populate("learnerId", "name email role xp studyStreak")
    .lean();
  return res.json({ assignments });
}
