import { Router } from "express";
import { authMiddleware, requireRole } from "../middleware/auth";
import { getPlanEntitlements } from "../controllers/plan.controller";
import {
  adminDashboard,
  adminIntegrations,
  adminListCompetencies,
  adminOrgSkillGaps,
  adminPredictive,
  assignLearner,
  createUser,
  facultyDashboard,
  facultyLearners,
  getSettings,
  listAuditLogs,
  listDepartments,
  listUsers,
  updateSetting,
  updateUserRole,
  upsertCompetency,
  upsertDepartment,
  upsertRoleRequirement
} from "../controllers/sih/admin.controller";
import {
  completeCompetencyAssessment,
  finalizeCompetencyAssessmentController,
  getMyCompetencyProfile,
  getMyCareerRequirements,
  getMySkillGaps,
  listCompetencies,
  listJobRoles,
  listRoleRequirements,
  refreshSkillGaps,
  startCompetencyAssessment,
  getActiveAssessment
} from "../controllers/sih/competency.controller";
import {
  aiAssistant,
  getEmployeeAnalytics,
  getEmployeeDashboard,
  getMyPerformance,
  predictiveAnalytics
} from "../controllers/sih/performance.controller";
import { getMyProfile, upsertMyProfile } from "../controllers/sih/profile.controller";
import { getMyLanguagePreference, updateMyLanguagePreference } from "../controllers/sih/language-preference.controller";
import { generateTtsAudio } from "../controllers/sih/tts.controller";
import {
  createFrameworkVersion,
  createSource,
  getFrameworkOverview,
  getFrameworkVersion,
  getProficiencyScale,
  listFrameworkVersions,
  listSources,
  transitionFrameworkVersion,
  transitionSource
} from "../controllers/sih/framework.controller";
import { listRoleRequests, requestFacultyAccess, reviewRoleRequest } from "../controllers/sih/role-request.controller";
import { updateInterviewTracking } from "../controllers/sih/role-request.controller";
import { upload, validateOptionalUploadedFile } from "../middleware/upload";
import { getVirtualLab, listVirtualLabs, startVirtualLab, submitVirtualLab } from "../controllers/sih/lab.controller";
import {
  createFormalQuiz,
  generateMcqsFromLecture,
  getQuestionAnalytics,
  getAdaptiveDifficulty,
  getQuizForAttempt,
  listMyQuizAttempts,
  listQuestionBank,
  listQuizzes,
  reviewQuestion,
  submitFormalQuiz
} from "../controllers/sih/quiz.controller";
import {
  enrollIgotLocal,
  enrollNsstaLocal,
  explainRecommendation,
  getIntegrationStatus,
  getLearningPath,
  listIgotEnrollments,
  listNsstaEnrollments,
  refreshLearningPath,
  searchIgotCourses,
  searchNsstaProgrammes,
  updateIgotProgress
  ,updateNsstaProgress,
  getPlatformCourse,
  enrollPlatformCourse,
  attachPlatformCourseLectures,
  listPlatformCourses,
  updatePlatformCourseProgress
} from "../controllers/sih/recommendation.controller";

const employeeRoles = ["employee"] as const;
const facultyRoles = ["faculty", "admin"] as const;
const allRoles = ["employee", "faculty", "admin"] as const;

export const sihRouter = Router();

sihRouter.use(authMiddleware);

// Profile
sihRouter.get("/profile/me", requireRole(...allRoles), getMyProfile);
sihRouter.put("/profile/me", requireRole(...allRoles), upsertMyProfile);
sihRouter.patch("/profile/me", requireRole(...allRoles), upsertMyProfile);

sihRouter.get("/profile/language-preference", requireRole(...allRoles), getMyLanguagePreference);
sihRouter.patch("/profile/language-preference", requireRole(...allRoles), updateMyLanguagePreference);
sihRouter.post("/role-requests/faculty", requireRole("employee"), upload.single("supportingDocument"), validateOptionalUploadedFile, requestFacultyAccess);

// Competencies & skill gaps
sihRouter.get("/competencies", requireRole(...employeeRoles), listCompetencies);
sihRouter.get("/competencies/me", requireRole(...employeeRoles), getMyCompetencyProfile);
sihRouter.get("/skill-gaps/me", requireRole(...employeeRoles), getMySkillGaps);
sihRouter.post("/skill-gaps/refresh", requireRole(...employeeRoles), refreshSkillGaps);
sihRouter.get("/role-requirements", requireRole(...employeeRoles), listRoleRequirements);
sihRouter.get("/role-requirements/jobs", requireRole(...employeeRoles), listJobRoles);
// Framework governance and version metadata.
sihRouter.get("/framework/proficiency-scale", requireRole(...employeeRoles), getProficiencyScale);
sihRouter.get("/framework/career-requirements", requireRole(...employeeRoles), getMyCareerRequirements);

// Browser-based, competency-linked virtual labs.
sihRouter.get("/labs", requireRole(...allRoles), listVirtualLabs);
sihRouter.get("/labs/:id", requireRole(...allRoles), getVirtualLab);
sihRouter.post("/labs/:id/start", requireRole(...allRoles), startVirtualLab);
sihRouter.post("/labs/:id/submit", requireRole(...allRoles), submitVirtualLab);

// Assessments
sihRouter.get("/assessments/active", requireRole(...employeeRoles), getActiveAssessment);
sihRouter.post("/assessments/competency/start", requireRole(...employeeRoles), startCompetencyAssessment);
sihRouter.post("/assessments/competency/finalize", requireRole(...facultyRoles), finalizeCompetencyAssessmentController);
sihRouter.post("/assessments/competency/:id/complete", requireRole(...employeeRoles), completeCompetencyAssessment);

// Performance & analytics
sihRouter.get("/performance/me", requireRole(...employeeRoles), getMyPerformance);
sihRouter.get("/employee/dashboard", requireRole(...employeeRoles), getEmployeeDashboard);
sihRouter.get("/employee/analytics", requireRole(...employeeRoles), getEmployeeAnalytics);
sihRouter.get("/admin/analytics/predictive", requireRole("admin"), adminPredictive);
sihRouter.get("/analytics/predictive", requireRole(...employeeRoles), predictiveAnalytics);
sihRouter.post("/ai/assistant", requireRole(...allRoles), aiAssistant);
sihRouter.post("/tts/generate", requireRole(...allRoles), generateTtsAudio);

// Learning path & recommendations
sihRouter.get("/learning-path/me", requireRole(...employeeRoles), getLearningPath);
sihRouter.post("/learning-path/refresh", requireRole(...employeeRoles), refreshLearningPath);
sihRouter.get("/learning-path/:id/explain", requireRole(...employeeRoles), explainRecommendation);

// Third-party catalogue integration adapters
sihRouter.get("/integrations/status", requireRole(...allRoles), getIntegrationStatus);

// iGOT Karmayogi (Local Catalogue Fallback)
sihRouter.get("/igot/courses", requireRole(...allRoles), searchIgotCourses);
sihRouter.get("/igot/enrollments", requireRole(...allRoles), listIgotEnrollments);
sihRouter.post("/igot/enrollments", requireRole(...allRoles), enrollIgotLocal);
sihRouter.patch("/igot/enrollments/:courseId", requireRole(...allRoles), updateIgotProgress);

// NSSTA Training (Local Catalogue Fallback)
sihRouter.get("/nssta/programmes", requireRole(...allRoles), searchNsstaProgrammes);
sihRouter.get("/nssta/enrollments", requireRole(...allRoles), listNsstaEnrollments);
sihRouter.post("/nssta/enrollments", requireRole(...allRoles), enrollNsstaLocal);
sihRouter.patch("/nssta/enrollments/:programmeId", requireRole(...allRoles), updateNsstaProgress);

// Aarambh-owned platform courses use faculty-uploaded lectures as their content.
sihRouter.get("/platform/courses", requireRole(...facultyRoles), listPlatformCourses);
sihRouter.get("/platform/courses/:code", requireRole(...allRoles), getPlatformCourse);
sihRouter.post("/platform/courses/:code/enroll", requireRole(...allRoles), enrollPlatformCourse);
sihRouter.patch("/platform/courses/:code/progress", requireRole(...allRoles), updatePlatformCourseProgress);
sihRouter.patch("/platform/courses/:code/content", requireRole(...facultyRoles), attachPlatformCourseLectures);

// SIH quiz system
sihRouter.post("/sih/quiz/generate-from-lecture", requireRole(...facultyRoles, "employee"), generateMcqsFromLecture);
sihRouter.post("/sih/quizzes", requireRole(...facultyRoles, "employee"), createFormalQuiz);
sihRouter.get("/sih/quizzes", requireRole(...employeeRoles), listQuizzes);
sihRouter.get("/sih/quizzes/:id/attempt", requireRole(...employeeRoles), getQuizForAttempt);
sihRouter.post("/sih/quizzes/:id/submit", requireRole(...employeeRoles), submitFormalQuiz);
sihRouter.get("/sih/quiz-attempts/me", requireRole(...employeeRoles), listMyQuizAttempts);
sihRouter.get("/sih/adaptive-difficulty", requireRole(...employeeRoles), getAdaptiveDifficulty);
sihRouter.get("/sih/questions", requireRole(...facultyRoles), listQuestionBank);
sihRouter.get("/sih/questions/:id/analytics", requireRole(...facultyRoles), getQuestionAnalytics);
sihRouter.patch("/sih/questions/:id/review", requireRole(...facultyRoles), reviewQuestion);

// Faculty
sihRouter.get("/faculty/dashboard", requireRole(...facultyRoles), facultyDashboard);
sihRouter.get("/faculty/learners", requireRole(...facultyRoles), facultyLearners);
sihRouter.post("/faculty/assign", requireRole(...facultyRoles), assignLearner);

// Admin
sihRouter.get("/admin/dashboard", requireRole("admin"), adminDashboard);
sihRouter.get("/admin/users", requireRole("admin"), listUsers);
sihRouter.post("/admin/users", requireRole("admin"), createUser);
sihRouter.patch("/admin/users/:id/role", requireRole("admin"), updateUserRole);
sihRouter.patch("/admin/users/:id/roles", requireRole("admin"), updateUserRole);
sihRouter.get("/admin/role-requests", requireRole("admin"), listRoleRequests);
sihRouter.patch("/admin/role-requests/:id", requireRole("admin"), reviewRoleRequest);
sihRouter.patch("/admin/role-requests/:id/interview", requireRole("admin"), updateInterviewTracking);
sihRouter.get("/admin/departments", requireRole("admin"), listDepartments);
sihRouter.post("/admin/departments", requireRole("admin"), upsertDepartment);
sihRouter.patch("/admin/departments/:code", requireRole("admin"), upsertDepartment);
sihRouter.get("/admin/competencies", requireRole("admin"), adminListCompetencies);
sihRouter.post("/admin/competencies", requireRole("admin"), upsertCompetency);
sihRouter.post("/admin/role-requirements", requireRole("admin"), upsertRoleRequirement);
sihRouter.get("/admin/framework/overview", requireRole("admin"), getFrameworkOverview);
sihRouter.get("/admin/frameworks", requireRole("admin"), listFrameworkVersions);
sihRouter.get("/admin/frameworks/:frameworkId/:version", requireRole("admin"), getFrameworkVersion);
sihRouter.post("/admin/frameworks", requireRole("admin"), createFrameworkVersion);
sihRouter.patch("/admin/frameworks/:id/lifecycle", requireRole("admin"), transitionFrameworkVersion);
sihRouter.get("/admin/framework-sources", requireRole("admin"), listSources);
sihRouter.post("/admin/framework-sources", requireRole("admin"), createSource);
sihRouter.patch("/admin/framework-sources/:sourceId/lifecycle", requireRole("admin"), transitionSource);
sihRouter.get("/admin/settings", requireRole("admin"), getSettings);
sihRouter.put("/admin/settings", requireRole("admin"), updateSetting);
sihRouter.get("/admin/integrations", requireRole("admin"), adminIntegrations);
sihRouter.get("/admin/skill-gaps", requireRole("admin"), adminOrgSkillGaps);
sihRouter.get("/admin/audit", requireRole("admin"), listAuditLogs);

// Plans
sihRouter.get("/account/plan", getPlanEntitlements);
