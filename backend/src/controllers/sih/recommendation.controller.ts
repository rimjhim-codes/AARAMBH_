import { Response } from "express";
import { Types } from "mongoose";
import { AuthenticatedRequest } from "../../middleware/auth";
import {
  IGOTEnrollmentModel,
  LearningRecommendationModel,
  NSSTAEnrollmentModel
} from "../../models/sih/SihModels";
import {
  explainRecommendationWithAi,
  getDemoLearningPathFallback,
  generatePersonalizedLearningPath,
  syncTrainingCompletion
} from "../../services/recommendation.service";
import { getIgotProvider } from "../../services/integrations/igot.provider";
import { getNsstaProvider } from "../../services/integrations/nssta.provider";
import { IntegrationResponseValidationError } from "../../services/integrations/http";
import { IntegrationProviderError } from "../../services/integrations/types";
import { IntegrationStatusModel } from "../../models/sih/SihModels";
import { z } from "zod";
import { recalculatePerformance } from "../../services/performance.service";
import { writeAuditLog } from "../../services/audit-log.service";
import { PlatformCourseModel } from "../../models/sih/SihModels";
import { LectureModel } from "../../models/Lecture";
import { LearningProgressModel } from "../../models/LearningProgress";
import {
  getLearningProgress,
  recordExternalProgressOutcome,
  refreshPlatformCourseProgress,
  upsertLearningProgress
} from "../../services/learning-progress.service";

function integrationSourceLabel(name: string, status: "live" | "simulated" | "down" | "not_configured") {
  if (status === "live") return `LIVE ${name} API`;
  if (status === "simulated") return `SIMULATED ${name} — demo data; live sync pending credentials`;
  if (status === "down") return `${name} DOWN — no remote results available`;
  return `LOCAL CATALOGUE — not live ${name}`;
}

function providerErrorResponse(error: unknown, provider: string) {
  if (error instanceof IntegrationProviderError) {
    return {
      message: `${provider} provider request failed.`,
      code: error.code,
      retryable: error.retryable
    };
  }
  if (error instanceof IntegrationResponseValidationError) {
    return {
      message: `${provider} provider returned an invalid response.`,
      code: error.code,
      retryable: false
    };
  }
  return {
    message: `${provider} provider is unavailable.`,
    code: "provider_unavailable",
    retryable: true
  };
}

/**
 * Normalize legacy/persisted platform recommendations to the catalog's
 * canonical navigation identity. PlatformCourse.code is the only value
 * allowed in /platform-courses/[code].
 */
export async function normalizePlatformCourseNavigation(items: any[], userId?: string) {
  const platformItems = items.filter((item) => item?.source === "platform");
  if (!platformItems.length) return items;

  const externalIds = platformItems
    .map((item) => String(item.externalId || "").trim())
    .filter((value) => value.length > 0 && !/^PATH_/i.test(value));
  const urlCodes = platformItems
    .map((item) => String(item.courseUrl || "").match(/^\/platform-courses\/([^/?#]+)$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => decodeURIComponent(value))
    .filter((value) => value.length > 0 && !/^PATH_/i.test(value));
  const objectIds = externalIds.filter((value) => Types.ObjectId.isValid(value));
  const query: any[] = [];
  if (externalIds.length) query.push({ code: { $in: externalIds } });
  if (urlCodes.length) query.push({ code: { $in: urlCodes } });
  if (objectIds.length) query.push({ _id: { $in: objectIds } });
  if (!query.length) {
    return items.map((item) => {
      if (item?.source !== "platform") return item;
      const raw = typeof item.toObject === "function" ? item.toObject() : { ...item };
      return {
        ...raw,
        courseUrl: raw.courseUrl && /^\/platform-courses\//i.test(raw.courseUrl) && !/^\/platform-courses\/PATH_/i.test(raw.courseUrl) ? raw.courseUrl : "",
        externalId: String(raw.externalId || "").trim(),
        firstLectureId: null,
        hasLectures: false,
        learningProgressStatus: null
      };
    });
  }

  const courses = await PlatformCourseModel.find({
    catalogType: "platform",
    isActive: true,
    $or: query
  }).select("_id code courseUrl lectureIds").lean();

  const allLectureIds = courses.flatMap(c => Array.isArray(c.lectureIds) ? c.lectureIds.filter(id => Types.ObjectId.isValid(String(id))) : []);
  const validLectures = allLectureIds.length > 0 ? await LectureModel.find({ _id: { $in: allLectureIds } }).select("_id").lean() : [];
  const validLectureIdSet = new Set(validLectures.map(l => String(l._id)));

  const byIdentity = new Map<string, any>();
  for (const course of courses) {
    const validIdsForCourse = (Array.isArray(course.lectureIds) ? course.lectureIds : [])
      .map(id => String(id))
      .filter(id => validLectureIdSet.has(id));

    byIdentity.set(String(course.code), { ...course, _validLectureIds: validIdsForCourse });
    byIdentity.set(String(course._id), { ...course, _validLectureIds: validIdsForCourse });
  }

  const courseCodesForProgress = Array.from(byIdentity.values()).map(c => c.code);
  const progressMap = new Map<string, string>();
  if (userId && courseCodesForProgress.length > 0) {
    const progresses = await LearningProgressModel.find({
      userId,
      resourceType: "platform_course",
      resourceId: { $in: courseCodesForProgress }
    }).select("resourceId status").lean();
    for (const p of progresses) {
      progressMap.set(p.resourceId, p.status);
    }
  }

  return items.map((item) => {
    if (item?.source !== "platform") return item;
    const raw = typeof item.toObject === "function" ? item.toObject() : { ...item };
    const externalId = String(raw.externalId || "").trim();
    const urlCode = String(raw.courseUrl || "").match(/^\/platform-courses\/([^/?#]+)$/)?.[1];
    const course = byIdentity.get(externalId) || (urlCode ? byIdentity.get(decodeURIComponent(urlCode)) : undefined);
    if (!course) {
      return {
        ...raw,
        courseUrl: "",
        externalId,
        firstLectureId: null,
        hasLectures: false,
        learningProgressStatus: null
      };
    }
    const code = String(course.code);
    const validIds = course._validLectureIds || [];
    return {
      ...raw,
      externalId: code,
      courseUrl: `/platform-courses/${encodeURIComponent(code)}`,
      firstLectureId: validIds.length > 0 ? validIds[0] : null,
      hasLectures: validIds.length > 0,
      learningProgressStatus: progressMap.get(code) || "not_started"
    };
  });
}

export async function getLearningPath(req: AuthenticatedRequest, res: Response) {
  let items = await LearningRecommendationModel.find({ userId: req.user!.id }).sort({
    priority: -1,
    pathStep: 1
  });
  if (!items.length) {
    items = (await generatePersonalizedLearningPath(req.user!.id)) as any;
    items = await LearningRecommendationModel.find({ userId: req.user!.id }).sort({
      priority: -1,
      pathStep: 1
    });
  }
  if (!items.length) items = await getDemoLearningPathFallback() as any;
  items = await normalizePlatformCourseNavigation(items as any[], req.user!.id);
  return res.json({
    recommendations: items,
    empty: items.length === 0,
    message: items.length === 0 ? "No personalized learning recommendations are available yet. Complete or update your competency assessment to generate a personalized learning path." : undefined
  });
}

export async function refreshLearningPath(req: AuthenticatedRequest, res: Response) {
  const items = await generatePersonalizedLearningPath(req.user!.id);
  return res.json({ recommendations: await normalizePlatformCourseNavigation(items as any[], req.user!.id) });
}

export async function explainRecommendation(req: AuthenticatedRequest, res: Response) {
  const result = await explainRecommendationWithAi(req.user!.id, String(req.params.id));
  if (!result) return res.status(404).json({ message: "Recommendation not found" });
  return res.json(result);
}

export async function getIntegrationStatus(req: AuthenticatedRequest, res: Response) {
  const [igot, nssta] = await Promise.all([
    getIgotProvider().getStatus(),
    getNsstaProvider().getStatus()
  ]);

  await IntegrationStatusModel.findOneAndUpdate(
    { name: "igot" },
    {
      name: "igot",
      status: igot.status,
      message: igot.message,
      lastCheckedAt: new Date(),
      ...(igot.status === "live" || igot.status === "simulated" ? { lastSuccessAt: new Date() } : {})
    },
    { upsert: true }
  );
  await IntegrationStatusModel.findOneAndUpdate(
    { name: "nssta" },
    {
      name: "nssta",
      status: nssta.status,
      message: nssta.message,
      lastCheckedAt: new Date(),
      ...(nssta.status === "live" || nssta.status === "simulated" ? { lastSuccessAt: new Date() } : {})
    },
    { upsert: true }
  );

  return res.json({
    igot,
    nssta,
    note: "Live, simulated, and local catalogue modes are reported explicitly. Local catalogue results are not live government API data."
  });
}

export async function searchIgotCourses(req: AuthenticatedRequest, res: Response) {
  const provider = getIgotProvider();
  const status = await provider.getStatus();
  const q = String(req.query.q || "");
  const courses = await provider.searchCourses({
    keywords: q ? q.split(/\s+/) : ["statistics"],
    limit: 20
  });

  return res.json({
    integration: status,
    sourceLabel: integrationSourceLabel("iGOT Karmayogi", status.status),
    courses
  });
}

export async function searchNsstaProgrammes(req: AuthenticatedRequest, res: Response) {
  const provider = getNsstaProvider();
  const status = await provider.getStatus();
  const q = String(req.query.q || "");
  const courses = await provider.searchCourses({
    keywords: q ? q.split(/\s+/) : ["statistics", "tpac"],
    limit: 20
  });

  return res.json({
    integration: status,
    sourceLabel: integrationSourceLabel("NSSTA TPAC", status.status),
    programmes: courses
  });
}

export async function enrollIgotLocal(req: AuthenticatedRequest, res: Response) {
  const schema = z.object({
    courseId: z.string().min(1),
    title: z.string().min(1)
  });
  const payload = schema.parse(req.body);
  const existingEnrollment = await IGOTEnrollmentModel.findOne({
    userId: req.user!.id,
    courseId: payload.courseId
  });
  const provider = getIgotProvider();
  const status = await provider.getStatus();
  let external: Awaited<ReturnType<typeof provider.enrollCourse>> | null = null;
  if (!existingEnrollment && (status.status === "live" || status.status === "simulated")) {
    try {
      external = await provider.enrollCourse({ ...payload, userId: req.user!.id });
    } catch (error) {
      return res.status(502).json(providerErrorResponse(error, "iGOT"));
    }
  }

  const enrollment = (existingEnrollment || await IGOTEnrollmentModel.findOneAndUpdate(
    { userId: req.user!.id, courseId: payload.courseId },
    {
      userId: req.user!.id,
      courseId: payload.courseId,
      title: payload.title,
      status: external?.status || "enrolled",
      progressPercent: external?.progressPercent || 0,
      source: status.status === "live" ? "igot_live" : status.status === "simulated" ? "igot_simulated" : "local_record",
      externalEnrollmentId: external?.id || "",
      lastSyncedAt: external ? new Date() : undefined,
      syncError: ""
    },
    { upsert: true, new: true }
  ))!;

  await LearningRecommendationModel.updateOne(
    {
      userId: req.user!.id,
      source: "igot",
      externalId: payload.courseId,
      status: "recommended"
    },
    { $set: { status: "enrolled" } }
  );

  await recalculatePerformance(req.user!.id);
  await writeAuditLog({ actorId: req.user!.id, action: "enrollment.igot", resource: payload.courseId, meta: { source: status.status, status: enrollment.status }, req });
  return res.status(201).json({
    enrollment,
    integration: status,
    warning: status.status === "not_configured"
      ? "Recorded locally only. Enable iGOT simulation or live credentials for external synchronization."
      : undefined
  });
}

export async function updateIgotProgress(req: AuthenticatedRequest, res: Response) {
  const schema = z.object({
    progressPercent: z.number().min(0).max(100),
    status: z.enum(["enrolled", "in_progress", "completed"]).optional()
  });
  const payload = schema.parse(req.body);
  const enrollment = await IGOTEnrollmentModel.findOne({
    userId: req.user!.id,
    courseId: String(req.params.courseId)
  });
  if (!enrollment) return res.status(404).json({ message: "Enrollment not found" });
  const wasCompleted = enrollment.status === "completed";
  const nextStatus = payload.status || (payload.progressPercent >= 100 ? "completed" : payload.progressPercent > 0 ? "in_progress" : "enrolled");
  enrollment.progressPercent = payload.progressPercent;
  enrollment.status = nextStatus;
  if (payload.progressPercent >= 100) enrollment.completedAt = enrollment.completedAt || new Date();
  if (enrollment.source === "igot_live" || enrollment.source === "igot_simulated") {
    const provider = getIgotProvider();
    try {
      const synced = await provider.syncEnrollment({
        enrollmentId: enrollment.externalEnrollmentId || enrollment.courseId,
        courseId: enrollment.courseId,
        userId: req.user!.id,
        progressPercent: payload.progressPercent,
        status: nextStatus
      });
      enrollment.progressPercent = synced.progressPercent;
      enrollment.status = synced.status;
      enrollment.externalEnrollmentId = synced.id;
      enrollment.completedAt = synced.completedAt ? new Date(synced.completedAt) : enrollment.completedAt;
      enrollment.lastSyncedAt = new Date();
      enrollment.syncError = "";
    } catch (error) {
      enrollment.syncError = (error as Error).message;
      await enrollment.save();
      return res.status(502).json(providerErrorResponse(error, "iGOT"));
    }
  }
  await enrollment.save();
  const completedNow = !wasCompleted && enrollment.status === "completed";
  await syncTrainingCompletion({ userId: req.user!.id, source: "igot", externalId: enrollment.courseId, completed: completedNow, ...(Types.ObjectId.isValid(req.user!.id) ? { refreshSkillGaps: false } : {}) });
  await recordExternalProgressOutcome({
    userId: req.user!.id,
    resourceType: "igot_course",
    resourceId: enrollment.courseId,
    source: "igot",
    progressPercent: enrollment.progressPercent,
    status: enrollment.status === "completed" ? "completed" : enrollment.status === "in_progress" ? "in_progress" : "not_started",
    metadata: { title: enrollment.title, providerSource: enrollment.source }
  });
  await writeAuditLog({ actorId: req.user!.id, action: "enrollment.igot.progress", resource: enrollment.courseId, meta: { status: enrollment.status, progressPercent: enrollment.progressPercent }, req });
  return res.json({ enrollment });
}

export async function listIgotEnrollments(req: AuthenticatedRequest, res: Response) {
  const enrollments = await IGOTEnrollmentModel.find({ userId: req.user!.id }).sort({ updatedAt: -1 });
  return res.json({ enrollments });
}

export async function enrollNsstaLocal(req: AuthenticatedRequest, res: Response) {
  const schema = z.object({
    programmeId: z.string().min(1),
    title: z.string().min(1)
  });
  const payload = schema.parse(req.body);
  const existingEnrollment = await NSSTAEnrollmentModel.findOne({
    userId: req.user!.id,
    programmeId: payload.programmeId
  });
  const provider = getNsstaProvider();
  const status = await provider.getStatus();
  let external: Awaited<ReturnType<typeof provider.enrollCourse>> | null = null;
  if (!existingEnrollment && (status.status === "live" || status.status === "simulated")) {
    try {
      external = await provider.enrollCourse({ courseId: payload.programmeId, userId: req.user!.id, title: payload.title });
    } catch (error) {
      return res.status(502).json(providerErrorResponse(error, "NSSTA"));
    }
  }

  const enrollment = (existingEnrollment || await NSSTAEnrollmentModel.findOneAndUpdate(
    { userId: req.user!.id, programmeId: payload.programmeId },
    {
      userId: req.user!.id,
      programmeId: payload.programmeId,
      title: payload.title,
      status: external?.status || "enrolled",
      progressPercent: external?.progressPercent || 0,
      source: status.status === "live" ? "nssta_live" : status.status === "simulated" ? "nssta_simulated" : "local_record",
      externalEnrollmentId: external?.id || "",
      lastSyncedAt: external ? new Date() : undefined,
      syncError: ""
    },
    { upsert: true, new: true }
  ))!;

  await LearningRecommendationModel.updateOne(
    {
      userId: req.user!.id,
      source: "nssta",
      externalId: payload.programmeId,
      status: "recommended"
    },
    { $set: { status: "enrolled" } }
  );

  await recalculatePerformance(req.user!.id);
  await writeAuditLog({ actorId: req.user!.id, action: "enrollment.nssta", resource: payload.programmeId, meta: { source: status.status, status: enrollment.status }, req });
  return res.status(201).json({
    enrollment,
    integration: status,
    warning: status.status === "not_configured"
      ? "Recorded locally only. Enable NSSTA simulation or live credentials for external synchronization."
      : undefined
  });
}

export async function updateNsstaProgress(req: AuthenticatedRequest, res: Response) {
  const schema = z.object({
    progressPercent: z.number().min(0).max(100),
    status: z.enum(["recommended", "enrolled", "in_progress", "completed"]).optional()
  });
  const payload = schema.parse(req.body);
  const enrollment = await NSSTAEnrollmentModel.findOne({
    userId: req.user!.id,
    programmeId: String(req.params.programmeId)
  });
  if (!enrollment) return res.status(404).json({ message: "Programme enrollment not found" });
  const wasCompleted = enrollment.status === "completed";
  if (payload.status === "recommended") return res.status(400).json({ message: "Progress cannot move an enrollment back to recommended." });
  const nextStatus: "enrolled" | "in_progress" | "completed" = payload.status || (payload.progressPercent >= 100 ? "completed" : payload.progressPercent > 0 ? "in_progress" : "enrolled");
  enrollment.progressPercent = payload.progressPercent;
  enrollment.status = nextStatus;
  if (payload.progressPercent >= 100) enrollment.completedAt = enrollment.completedAt || new Date();
  if (enrollment.source === "nssta_live" || enrollment.source === "nssta_simulated") {
    try {
      const synced = await getNsstaProvider().syncEnrollment({
        enrollmentId: enrollment.externalEnrollmentId || enrollment.programmeId,
        courseId: enrollment.programmeId,
        userId: req.user!.id,
        progressPercent: payload.progressPercent,
        status: nextStatus
      });
      enrollment.progressPercent = synced.progressPercent;
      enrollment.status = synced.status;
      enrollment.externalEnrollmentId = synced.id;
      enrollment.completedAt = synced.completedAt ? new Date(synced.completedAt) : enrollment.completedAt;
      enrollment.lastSyncedAt = new Date();
      enrollment.syncError = "";
    } catch (error) {
      enrollment.syncError = (error as Error).message;
      await enrollment.save();
      return res.status(502).json(providerErrorResponse(error, "NSSTA"));
    }
  }
  await enrollment.save();
  const completedNow = !wasCompleted && enrollment.status === "completed";
  await syncTrainingCompletion({ userId: req.user!.id, source: "nssta", externalId: enrollment.programmeId, completed: completedNow, ...(Types.ObjectId.isValid(req.user!.id) ? { refreshSkillGaps: false } : {}) });
  await recordExternalProgressOutcome({
    userId: req.user!.id,
    resourceType: "nssta_course",
    resourceId: enrollment.programmeId,
    source: "nssta",
    progressPercent: enrollment.progressPercent,
    status: enrollment.status === "completed" ? "completed" : enrollment.status === "in_progress" ? "in_progress" : "not_started",
    metadata: { title: enrollment.title, providerSource: enrollment.source }
  });
  await writeAuditLog({ actorId: req.user!.id, action: "enrollment.nssta.progress", resource: enrollment.programmeId, meta: { status: enrollment.status, progressPercent: enrollment.progressPercent }, req });
  return res.json({ enrollment });
}

export async function listNsstaEnrollments(req: AuthenticatedRequest, res: Response) {
  const enrollments = await NSSTAEnrollmentModel.find({ userId: req.user!.id }).sort({ updatedAt: -1 });
  return res.json({ enrollments });
}

export async function getPlatformCourse(req: AuthenticatedRequest, res: Response) {
  const code = decodeURIComponent(String(req.params.code || "")).trim();
  const course = await PlatformCourseModel.findOne({ code, catalogType: "platform", isActive: true })
    .populate("lectureIds", "title sourceType sourceUrl thumbnailUrl durationSec status")
    .lean();
  if (!course) return res.status(404).json({ message: "Platform course not found" });
  const enrollment = await LearningRecommendationModel.findOne({
    userId: req.user!.id,
    source: "platform",
    externalId: course.code
  }).lean();
  const progress = await getLearningProgress(req.user!.id, "platform_course", course.code);
  const lectures = Array.isArray(course.lectureIds) ? course.lectureIds : [];
  const lectureProgress = await LearningProgressModel.find({
    userId: req.user!.id,
    resourceType: "lecture",
    resourceId: { $in: lectures.map((lecture: any) => String(lecture._id)) }
  }).lean();
  return res.json({
    course,
    lectures,
    enrollment,
    progress,
    lectureProgress,
    contentAvailable: lectures.length > 0,
    message: lectures.length
      ? "Course content is available in Aarambh. Open a lecture to continue."
      : "Content for this course has not been uploaded yet. Faculty must attach learning materials before it can be opened."
  });
}

export async function enrollPlatformCourse(req: AuthenticatedRequest, res: Response) {
  const course = await PlatformCourseModel.findOne({ code: String(req.params.code), catalogType: "platform", isActive: true }).lean();
  if (!course) return res.status(404).json({ message: "Platform course not found" });
  const enrollment = await LearningRecommendationModel.findOneAndUpdate(
    { userId: req.user!.id, source: "platform", externalId: course.code },
    {
      userId: req.user!.id,
      source: "platform",
      externalId: course.code,
      title: course.title,
      description: course.description,
      provider: course.provider,
      difficulty: course.difficulty,
      durationHours: course.durationHours,
      courseUrl: `/platform-courses/${course.code}`,
      status: "enrolled"
    },
    { upsert: true, new: true }
  );
  const progress = await upsertLearningProgress({
    userId: req.user!.id,
    resourceType: "platform_course",
    resourceId: course.code,
    source: "platform",
    progressPercent: 0,
    status: "not_started",
    emitActivity: false,
    emitOutcome: false
  });
  await writeAuditLog({ actorId: req.user!.id, action: "enrollment.platform", resource: course.code, meta: { title: course.title }, req });
  return res.status(201).json({ enrollment, progress: progress.progress, contentAvailable: (course.lectureIds || []).length > 0 });
}

export async function updatePlatformCourseProgress(req: AuthenticatedRequest, res: Response) {
  const result = await refreshPlatformCourseProgress(req.user!.id, String(req.params.code));
  return res.json(result);
}

export async function attachPlatformCourseLectures(req: AuthenticatedRequest, res: Response) {
  const payload = z.object({ lectureIds: z.array(z.string().min(1)).max(20) }).parse(req.body);
  const lectures = await LectureModel.find({ _id: { $in: payload.lectureIds } }).select("_id userId").lean();
  if (lectures.length !== new Set(payload.lectureIds).size) return res.status(400).json({ message: "One or more lectures do not exist" });
  if (req.user!.role !== "admin" && lectures.some((lecture) => String(lecture.userId) !== req.user!.id)) {
    return res.status(403).json({ message: "Faculty can only attach lectures they own" });
  }
  const course = await PlatformCourseModel.findOneAndUpdate(
    { code: String(req.params.code), catalogType: "platform", isActive: true },
    { lectureIds: lectures.map((lecture) => lecture._id) },
    { new: true }
  );
  if (!course) return res.status(404).json({ message: "Platform course not found" });
  await writeAuditLog({ actorId: req.user!.id, action: "platform_course.content_attach", resource: course.code, meta: { lectureIds: payload.lectureIds }, req });
  return res.json({ course });
}

export async function listPlatformCourses(req: AuthenticatedRequest, res: Response) {
  const courses = await PlatformCourseModel.find({ catalogType: "platform", isActive: true })
    .select("code title")
    .lean();
  return res.json({ courses });
}
