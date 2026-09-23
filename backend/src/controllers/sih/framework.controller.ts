import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../../middleware/auth";
import {
  CompetencyModel,
  FrameworkVersionModel,
  FRAMEWORK_STATUSES,
  INTERNAL_PROFICIENCY_LEVELS,
  RoleRequirementModel,
  SOURCE_STATUSES,
  SourceRegistryModel
} from "../../models/sih/SihModels";
import { writeAuditLog } from "../../services/audit-log.service";
import {
  canTransitionFrameworkStatus,
  canTransitionSourceStatus,
  getLegacyFrameworkVersion,
  isFrameworkEditable,
  LEGACY_FRAMEWORK_ID,
  LEGACY_FRAMEWORK_VERSION
} from "../../services/framework.service";

const frameworkStatusSchema = z.enum(FRAMEWORK_STATUSES);
const sourceStatusSchema = z.enum(SOURCE_STATUSES);

export async function listFrameworkVersions(_req: AuthenticatedRequest, res: Response) {
  const frameworks = await FrameworkVersionModel.find().sort({ frameworkId: 1, version: -1 }).lean();
  const data = await Promise.all(frameworks.map(async (framework) => ({
    ...framework,
    competencyCount: await CompetencyModel.countDocuments({ frameworkVersionId: framework._id }),
    roleRequirementCount: await RoleRequirementModel.countDocuments({ frameworkVersionId: framework._id })
  })));
  return res.json({ frameworks: data });
}

export async function getFrameworkVersion(req: AuthenticatedRequest, res: Response) {
  const framework = await FrameworkVersionModel.findOne({
    frameworkId: req.params.frameworkId,
    version: req.params.version
  }).lean();
  if (!framework) return res.status(404).json({ message: "Framework version not found." });
  const [competencyCount, roleRequirementCount] = await Promise.all([
    CompetencyModel.countDocuments({ frameworkVersionId: framework._id }),
    RoleRequirementModel.countDocuments({ frameworkVersionId: framework._id })
  ]);
  return res.json({ framework: { ...framework, competencyCount, roleRequirementCount } });
}

export async function createFrameworkVersion(req: AuthenticatedRequest, res: Response) {
  const payload = z.object({
    frameworkId: z.string().min(2),
    frameworkName: z.string().min(2),
    version: z.string().min(1),
    status: frameworkStatusSchema.optional(),
    effectiveFrom: z.coerce.date().optional(),
    effectiveTo: z.coerce.date().optional(),
    supersedesVersion: z.string().optional(),
    sourceId: z.string().optional(),
    sourceReference: z.string().optional(),
    description: z.string().optional(),
    notes: z.string().optional(),
    proficiencyScale: z.string().optional(),
    proficiencyMinimum: z.number().int().min(0).max(5).optional(),
    proficiencyMaximum: z.number().int().min(0).max(5).optional(),
    proficiencyLevels: z.array(z.object({
      level: z.number().int().min(0).max(5),
      label: z.string().min(1),
      descriptor: z.string().min(1),
      evidenceExpectation: z.string().min(1)
    })).optional()
  }).parse(req.body);

  if (payload.status && payload.status !== "draft") {
    return res.status(400).json({ message: "New framework versions must start in draft status and use lifecycle transitions." });
  }

  if (payload.effectiveFrom && payload.effectiveTo && payload.effectiveTo < payload.effectiveFrom) {
    return res.status(400).json({ message: "effectiveTo must be on or after effectiveFrom." });
  }
  const framework = await FrameworkVersionModel.create({
    ...payload,
    status: "draft",
    createdBy: req.user!.id,
    updatedBy: req.user!.id
  });
  await writeAuditLog({ actorId: req.user!.id, action: "framework.create", resource: String(framework._id), meta: { frameworkId: framework.frameworkId, version: framework.version }, req });
  return res.status(201).json({ framework });
}

export async function transitionFrameworkVersion(req: AuthenticatedRequest, res: Response) {
  const payload = z.object({ status: frameworkStatusSchema }).parse(req.body);
  const framework = await FrameworkVersionModel.findById(req.params.id);
  if (!framework) return res.status(404).json({ message: "Framework version not found." });
  if (!canTransitionFrameworkStatus(framework.status, payload.status)) {
    return res.status(409).json({ message: `Invalid framework lifecycle transition: ${framework.status} → ${payload.status}.` });
  }
  if (payload.status === "published") {
    const existing = await FrameworkVersionModel.findOne({ frameworkId: framework.frameworkId, status: "published", _id: { $ne: framework._id } }).select("_id version").lean();
    if (existing) return res.status(409).json({ message: `Framework ${framework.frameworkId} already has published version ${existing.version}. Retire it before publishing another.` });
  }
  const previousStatus = framework.status;
  framework.status = payload.status;
  framework.updatedBy = req.user!.id as any;
  await framework.save();
  await writeAuditLog({ actorId: req.user!.id, action: "framework.lifecycle", resource: String(framework._id), meta: { from: previousStatus, to: payload.status, frameworkId: framework.frameworkId, version: framework.version }, req });
  return res.json({ framework });
}

export async function listSources(_req: AuthenticatedRequest, res: Response) {
  return res.json({ sources: await SourceRegistryModel.find().sort({ updatedAt: -1 }).lean() });
}

export async function createSource(req: AuthenticatedRequest, res: Response) {
  const payload = z.object({
    sourceId: z.string().min(2),
    title: z.string().min(2),
    sourceType: z.string().min(2),
    reference: z.string().min(2),
    authority: z.string().optional(),
    status: sourceStatusSchema.optional(),
    frameworkId: z.string().optional(),
    frameworkVersion: z.string().optional(),
    notes: z.string().optional()
  }).parse(req.body);
  if (payload.status && payload.status !== "draft") {
    return res.status(400).json({ message: "New source records must start in draft status and use lifecycle transitions." });
  }
  const source = await SourceRegistryModel.create(payload);
  await writeAuditLog({ actorId: req.user!.id, action: "framework.source.create", resource: source.sourceId, meta: { sourceType: source.sourceType }, req });
  return res.status(201).json({ source });
}

export async function transitionSource(req: AuthenticatedRequest, res: Response) {
  const payload = z.object({ status: sourceStatusSchema }).parse(req.body);
  const source = await SourceRegistryModel.findOne({ sourceId: req.params.sourceId });
  if (!source) return res.status(404).json({ message: "Source not found." });
  if (!canTransitionSourceStatus(source.status, payload.status)) return res.status(409).json({ message: `Invalid source lifecycle transition: ${source.status} → ${payload.status}.` });
  source.status = payload.status;
  if (payload.status === "approved") {
    source.approvedBy = req.user!.id as any;
    source.approvedAt = new Date();
  }
  await source.save();
  await writeAuditLog({ actorId: req.user!.id, action: "framework.source.lifecycle", resource: source.sourceId, meta: { status: payload.status }, req });
  return res.json({ source });
}

export async function getProficiencyScale(_req: AuthenticatedRequest, res: Response) {
  return res.json({
    scale: "internal_0_5",
    minimum: 0,
    maximum: 5,
    levels: INTERNAL_PROFICIENCY_LEVELS,
    note: "Application-defined scale. It is not an officially validated Government of India framework."
  });
}

export async function getFrameworkOverview(_req: AuthenticatedRequest, res: Response) {
  const legacy = await getLegacyFrameworkVersion();
  const framework = legacy || await FrameworkVersionModel.findOne({ status: "published" }).sort({ updatedAt: -1 });
  if (!framework) return res.json({ framework: null, competencyCount: 0, roleRequirementCount: 0 });
  const [competencyCount, roleRequirementCount] = await Promise.all([
    CompetencyModel.countDocuments({ frameworkVersionId: framework._id }),
    RoleRequirementModel.countDocuments({ frameworkVersionId: framework._id })
  ]);
  return res.json({ framework, competencyCount, roleRequirementCount, legacy: framework.frameworkId === LEGACY_FRAMEWORK_ID });
}

export { isFrameworkEditable, LEGACY_FRAMEWORK_ID, LEGACY_FRAMEWORK_VERSION };
