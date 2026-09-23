import { Router } from "express";
import {
  forgotPassword,
  login,
  logout,
  me,
  refresh,
  resendVerification,
  resetPassword,
  verifyResetOtp,
  signup,
  switchRole,
  verifyEmail,
  setupMfa,
  enableMfa,
  disableMfa,
  verifyMfa,
  recoverMfa,
  ssoRedirect,
  ssoCallback
} from "../controllers/auth.controller";
import { askFromVoiceTranscript, askTutor, askTutorStream } from "../controllers/chat.controller";
import {
  createLecture,
  getLectureById,
  ingestYoutube,
  listLectures,
  uploadLectureFile
} from "../controllers/lecture.controller";

import {
  adaptiveQuiz,
  generateMindMap,
  imageQuestion,
  interviewQuestions,
  liveAssistant,
  translateContent
} from "../controllers/features/extended-features.controller";
import {
  generateQuiz,
  generateRecommendations,
  generateTimeline,
  submitQuiz
} from "../controllers/features/learning.controller";
import {
  listNotifications,
  markNotificationRead
} from "../controllers/features/notification.controller";

import { reportWatchTime } from "../controllers/study-session.controller";
import { getMyLearningProgress, updateMyLearningProgress } from "../controllers/learning-progress.controller";
import { getMyLearningHistory } from "../controllers/learning-history.controller";
import { getNextAdaptiveLearning } from "../controllers/adaptive-learning.controller";
import {
  getLearnerAnalytics,
  getPlatformCourseEffectivenessController,
  getTrainingEffectivenessController
} from "../controllers/learner-analytics.controller";
import {
  getDepartmentAnalyticsByIdController,
  getDepartmentAnalyticsController,
  getOrganizationAnalyticsController,
  getRoleAnalyticsByIdController,
  getRoleAnalyticsController
} from "../controllers/organization-analytics.controller";
import { authMiddleware, authMiddlewareWithStaleRoleRecovery } from "../middleware/auth";
import { upload, validateUploadedFile } from "../middleware/upload";
import { getVerifiedRagStatus } from "../services/rag.service";
import { transformMultilingualContent } from "../controllers/multilingual-content.controller";
import { sihRouter } from "./sih.routes";

export const appRouter = Router();

appRouter.get("/public/stats", async (_req, res) => {
  try {
    const { UserModel } = await import("../models/User");
    const { LectureModel } = await import("../models/Lecture");
    const { QuizAttemptModel } = await import("../models/LearningModels");
    const { VirtualLabCompletionModel } = await import("../models/VirtualLabCompletion");

    const [usersCount, coursesCount, assessmentsCount, labsCount] = await Promise.all([
      UserModel.countDocuments(),
      LectureModel.countDocuments(),
      QuizAttemptModel.countDocuments(),
      VirtualLabCompletionModel.countDocuments()
    ]);

    res.json({
      users: usersCount,
      courses: coursesCount,
      assessments: assessmentsCount,
      labs: labsCount
    });
  } catch (error) {
    console.error("Error fetching public stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

appRouter.post("/auth/signup", signup);
appRouter.post("/auth/login", login);
appRouter.post("/auth/refresh", refresh);
appRouter.post("/auth/logout", logout);
appRouter.post("/auth/switch-role", authMiddlewareWithStaleRoleRecovery, switchRole);
appRouter.post("/auth/verify-email", verifyEmail);
appRouter.post("/auth/resend-verification", resendVerification);
appRouter.post("/auth/forgot-password", forgotPassword);
appRouter.post("/auth/verify-reset-otp", verifyResetOtp);
appRouter.post("/auth/reset-password", resetPassword);
appRouter.get("/auth/sso", ssoRedirect);
appRouter.get("/auth/sso/callback", ssoCallback);
appRouter.post("/auth/mfa/setup", authMiddleware, setupMfa);
appRouter.post("/auth/mfa/enable", authMiddleware, enableMfa);
appRouter.post("/auth/mfa/disable", authMiddleware, disableMfa);
appRouter.post("/auth/mfa/verify", verifyMfa);
appRouter.post("/auth/mfa/recover", recoverMfa);
appRouter.get("/auth/me", authMiddleware, me);
appRouter.get("/rag/status", authMiddleware, async (_req, res) => {
  return res.json(await getVerifiedRagStatus());
});
appRouter.use(sihRouter);
appRouter.post("/lectures/youtube", authMiddleware, ingestYoutube);
appRouter.get("/lectures", authMiddleware, listLectures);
appRouter.get("/lectures/:id", authMiddleware, getLectureById);
appRouter.post("/lectures", authMiddleware, createLecture);
appRouter.post("/lectures/upload", authMiddleware, upload.single("file"), validateUploadedFile, uploadLectureFile);
appRouter.post("/chat/ask", authMiddleware, askTutor);
appRouter.post("/chat/ask-stream", authMiddleware, askTutorStream);
appRouter.post("/chat/from-voice-transcript", authMiddleware, askFromVoiceTranscript);

appRouter.get("/analytics/learner", authMiddleware, getLearnerAnalytics);
appRouter.get("/analytics/organization", authMiddleware, getOrganizationAnalyticsController);
appRouter.get("/analytics/departments", authMiddleware, getDepartmentAnalyticsController);
appRouter.get("/analytics/departments/:departmentId", authMiddleware, getDepartmentAnalyticsByIdController);
appRouter.get("/analytics/roles", authMiddleware, getRoleAnalyticsController);
appRouter.get("/analytics/roles/:roleId", authMiddleware, getRoleAnalyticsByIdController);
appRouter.get("/analytics/training/:source/:resourceId/effectiveness", authMiddleware, getTrainingEffectivenessController);
appRouter.get("/analytics/platform-courses/:code/effectiveness", authMiddleware, getPlatformCourseEffectivenessController);
appRouter.post("/study/watch-time", authMiddleware, reportWatchTime);
appRouter.get("/learning-progress/:resourceType/:resourceId", authMiddleware, getMyLearningProgress);
appRouter.patch("/learning-progress/:resourceType/:resourceId", authMiddleware, updateMyLearningProgress);
appRouter.get("/learning-history", authMiddleware, getMyLearningHistory);
appRouter.get("/adaptive-learning/next", authMiddleware, getNextAdaptiveLearning);

appRouter.post("/quiz/generate", authMiddleware, generateQuiz);
appRouter.post("/quiz/generate-adaptive", authMiddleware, adaptiveQuiz);
appRouter.post("/learning/recommendations", authMiddleware, generateRecommendations);
appRouter.post("/learning/mindmap", authMiddleware, generateMindMap);
appRouter.post("/learning/translate", authMiddleware, translateContent);
appRouter.post("/content-intelligence/multilingual", authMiddleware, transformMultilingualContent);
appRouter.post("/learning/interview-questions", authMiddleware, interviewQuestions);
appRouter.post("/learning/live-assistant", authMiddleware, liveAssistant);
appRouter.post("/learning/image-qa", authMiddleware, imageQuestion);

appRouter.post("/quiz/submit", authMiddleware, submitQuiz);
appRouter.get("/timeline", authMiddleware, generateTimeline);
appRouter.get("/notifications", authMiddleware, listNotifications);
appRouter.patch("/notifications/:id/read", authMiddleware, markNotificationRead);
