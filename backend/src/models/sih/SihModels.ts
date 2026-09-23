import mongoose, { Schema, Types } from "mongoose";

/** Official Statistics competency categories */
export const COMPETENCY_CATEGORIES = [
  "statistical",
  "technical",
  "digital_governance",
  "behavioural_managerial"
] as const;
export type CompetencyCategory = (typeof COMPETENCY_CATEGORIES)[number];

export const GAP_PRIORITIES = ["none", "low", "medium", "high", "critical"] as const;
export type GapPriority = (typeof GAP_PRIORITIES)[number];

export const QUESTION_STATUSES = ["draft", "pending_review", "approved", "published", "rejected"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/** Application-owned proficiency scale; not an externally validated government standard. */
export const PROFICIENCY_LEVEL_LABELS = {
  0: "No demonstrated competency",
  1: "Awareness / Beginner",
  2: "Basic working knowledge",
  3: "Independent working proficiency",
  4: "Advanced proficiency",
  5: "Expert / Can mentor others"
} as const;
export const CONFIDENCE_TIERS = ["low", "medium", "high"] as const;
export type ConfidenceTier = (typeof CONFIDENCE_TIERS)[number];
export const FRAMEWORK_STATUSES = ["draft", "review", "approved", "published", "retired"] as const;
export type FrameworkStatus = (typeof FRAMEWORK_STATUSES)[number];
export const SOURCE_STATUSES = ["draft", "pending_review", "approved", "retired"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];
export const ROLE_CONTEXTS = ["current", "career"] as const;

export const INTERNAL_PROFICIENCY_LEVELS = [
  { level: 0, label: "No demonstrated competency", descriptor: "No demonstrated knowledge or skill evidence is recorded.", evidenceExpectation: "No validated evidence yet." },
  { level: 1, label: "Awareness / Beginner", descriptor: "Recognizes basic concepts and terminology with substantial guidance.", evidenceExpectation: "Profile evidence or introductory learning evidence." },
  { level: 2, label: "Basic working knowledge", descriptor: "Can complete familiar basic tasks with occasional guidance.", evidenceExpectation: "Basic assessment, training, or guided practical evidence." },
  { level: 3, label: "Independent working proficiency", descriptor: "Can perform routine role-relevant work independently.", evidenceExpectation: "Assessment or practical evidence demonstrating independent work." },
  { level: 4, label: "Advanced proficiency", descriptor: "Can handle complex work, troubleshoot, and guide others in the competency.", evidenceExpectation: "Strong assessment and practical or faculty-verified evidence." },
  { level: 5, label: "Expert / Can mentor others", descriptor: "Can lead, design, evaluate, and mentor others in the competency.", evidenceExpectation: "Sustained advanced performance and verified mentoring or faculty evidence." }
] as const;

const ProficiencyLevelSchema = new Schema(
  {
    level: { type: Number, min: 0, max: 5, required: true },
    label: { type: String, required: true },
    descriptor: { type: String, required: true },
    evidenceExpectation: { type: String, required: true }
  },
  { _id: false }
);

const FrameworkVersionSchema = new Schema(
  {
    frameworkId: { type: String, required: true, index: true },
    frameworkName: { type: String, required: true },
    version: { type: String, required: true },
    status: { type: String, enum: FRAMEWORK_STATUSES, default: "draft", index: true },
    effectiveFrom: Date,
    effectiveTo: Date,
    supersedesVersion: { type: String, default: "" },
    sourceId: { type: String, default: "" },
    sourceReference: { type: String, default: "" },
    description: { type: String, default: "" },
    notes: { type: String, default: "" },
    proficiencyScale: { type: String, default: "internal_0_5" },
    proficiencyMinimum: { type: Number, min: 0, max: 5, default: 0 },
    proficiencyMaximum: { type: Number, min: 0, max: 5, default: 5 },
    proficiencyLevels: { type: [ProficiencyLevelSchema], default: () => INTERNAL_PROFICIENCY_LEVELS },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);
FrameworkVersionSchema.index({ frameworkId: 1, version: 1 }, { unique: true });

const SourceRegistrySchema = new Schema(
  {
    sourceId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    sourceType: { type: String, required: true },
    reference: { type: String, required: true },
    authority: { type: String, default: "" },
    status: { type: String, enum: SOURCE_STATUSES, default: "draft", index: true },
    frameworkId: { type: String, default: "" },
    frameworkVersion: { type: String, default: "" },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

const DepartmentSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    organization: { type: String, default: "Government of India" }
  },
  { timestamps: true }
);

const CompetencySchema = new Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    category: {
      type: String,
      enum: COMPETENCY_CATEGORIES,
      required: true,
      index: true
    },
    description: { type: String, default: "" },
    keywords: [{ type: String }],
    isActive: { type: Boolean, default: true },
    frameworkId: { type: String, default: "" },
    frameworkVersionId: { type: Schema.Types.ObjectId, ref: "FrameworkVersion" },
    frameworkVersion: { type: String, default: "1.0" },
    sourceId: { type: String, default: "" },
    sourceReference: { type: String, default: "application-configured" },
    proficiencyScale: { type: String, default: "internal_0_5" },
    proficiencyMinimum: { type: Number, min: 0, max: 5, default: 0 },
    proficiencyMaximum: { type: Number, min: 0, max: 5, default: 5 },
    proficiencyLevels: { type: [ProficiencyLevelSchema], default: undefined }
  },
  { timestamps: true }
);

const RoleRequirementSchema = new Schema(
  {
    jobRole: { type: String, required: true, index: true },
    departmentCode: { type: String, default: "" },
    competencyId: { type: Schema.Types.ObjectId, ref: "Competency", required: true },
    requiredLevel: { type: Number, min: 1, max: 5, required: true },
    priorityWeight: { type: Number, default: 1 },
    assignment: { type: String, default: "" },
    roleContext: { type: String, enum: ROLE_CONTEXTS, default: "current" },
    targetRole: { type: String, default: "" },
    frameworkId: { type: String, default: "" },
    frameworkVersionId: { type: Schema.Types.ObjectId, ref: "FrameworkVersion" },
    frameworkVersion: { type: String, default: "" },
    effectiveFrom: Date,
    effectiveTo: Date,
    sourceId: { type: String, default: "" },
    sourceReference: { type: String, default: "application-configured" }
  },
  { timestamps: true }
);
RoleRequirementSchema.index({ jobRole: 1, departmentCode: 1, assignment: 1, competencyId: 1 });
RoleRequirementSchema.index(
  { jobRole: 1, departmentCode: 1, assignment: 1, competencyId: 1, roleContext: 1, targetRole: 1, frameworkVersionId: 1 },
  { unique: true, partialFilterExpression: { frameworkVersionId: { $exists: true } } }
);

const EmployeeProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    employeeId: { type: String, default: "" },
    department: { type: String, default: "" },
    organization: { type: String, default: "" },
    designation: { type: String, default: "" },
    jobRole: { type: String, default: "" },
    currentAssignment: { type: String, default: "" },
    educationalQualification: { type: String, default: "" },
    degree: { type: String, default: "" },
    specialization: { type: String, default: "" },
    yearsOfExperience: { type: Number, default: 0 },
    previousTrainings: [{ type: String }],
    certifications: [{ type: String }],
    currentSkills: [{ type: String }],
    desiredCareerRole: { type: String, default: "" },
    futureSkillInterests: [{ type: String }],
    // Phase 6.1 stores the canonical code; legacy display-name values remain readable.
    languagePreference: { type: String, default: "en" },
    profileCompleteness: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const CompetencyScoreSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    competencyId: { type: Schema.Types.ObjectId, ref: "Competency", required: true, index: true },
    currentLevel: { type: Number, min: 0, max: 5, default: 0 },
    confidenceTier: { type: String, enum: ["self_reported", "assessed", "practical"], default: "self_reported" },
    confidence: { type: String, enum: CONFIDENCE_TIERS, default: "low" },
    targetLevel: { type: Number, min: 1, max: 5, default: 3 },
    targetLevelSource: { type: String, enum: ["role_requirement", "career_requirement", "legacy_default", "unmapped"], default: "unmapped" },
    frameworkId: { type: String, default: "" },
    frameworkVersionId: { type: Schema.Types.ObjectId, ref: "FrameworkVersion" },
    frameworkVersion: { type: String, default: "" },
    proficiencyScale: { type: String, default: "internal_0_5" },
    evidence: [
      {
        type: {
          type: String,
          enum: [
            "profile",
            "assessment",
            "quiz",
            "course",
            "training",
            "faculty",
            "activity",
            "lab"
          ]
        },
        detail: String,
        scoreImpact: Number,
        key: String,
        at: { type: Date, default: Date.now }
      }
    ],
    lastAssessedAt: Date,
    history: [{ date: Date, level: Number, source: String }]
  },
  { timestamps: true }
);
CompetencyScoreSchema.index({ userId: 1, competencyId: 1 }, { unique: true });

const SkillGapSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    competencyId: { type: Schema.Types.ObjectId, ref: "Competency", required: true },
    currentLevel: { type: Number, required: true },
    confidenceTier: { type: String, enum: ["self_reported", "assessed", "practical"], default: "self_reported" },
    confidence: { type: String, enum: CONFIDENCE_TIERS, default: "low" },
    requiredLevel: { type: Number, required: true },
    requirementId: { type: Schema.Types.ObjectId, ref: "RoleRequirement" },
    requirementVersion: { type: String, default: "" },
    frameworkId: { type: String, default: "" },
    frameworkVersionId: { type: Schema.Types.ObjectId, ref: "FrameworkVersion" },
    frameworkVersion: { type: String, default: "" },
    proficiencyScale: { type: String, default: "internal_0_5" },
    gap: { type: Number, required: true },
    priority: { type: String, enum: GAP_PRIORITIES, required: true },
    recommendedAction: { type: String, default: "" },
    rationale: { type: String, default: "" },
    evidenceSummary: { type: String, default: "" },
    domain: { type: String, default: "" }
  },
  { timestamps: true }
);
SkillGapSchema.index({ userId: 1, competencyId: 1 }, { unique: true });
SkillGapSchema.index({ userId: 1, gap: -1 });

const QuestionSchema = new Schema(
  {
    lectureId: { type: Schema.Types.ObjectId, ref: "Lecture", index: true },
    competencyId: { type: Schema.Types.ObjectId, ref: "Competency", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    question: { type: String, required: true },
    options: {
      A: { type: String, required: true },
      B: { type: String, required: true },
      C: { type: String, required: true },
      D: { type: String, required: true }
    },
    correctAnswer: { type: String, enum: ["A", "B", "C", "D"], required: true },
    explanation: { type: String, default: "" },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
    topic: { type: String, default: "" },
    sourceReference: { type: String, default: "" },
    sourcePageOrTimestamp: { type: String, default: "" },
    status: { type: String, enum: QUESTION_STATUSES, default: "draft", index: true },
    contentHash: { type: String, index: true },
    normalizedContentHash: { type: String, index: true },
    validationStatus: { type: String, enum: ["pending", "passed", "failed"], default: "pending", index: true },
    validationReasons: [{ type: String }],
    qualityFlags: [{ type: String }],
    semanticValidationStatus: { type: String, enum: ["not_run", "passed", "flagged", "unavailable"], default: "not_run", index: true },
    semanticValidationReasons: [{ type: String }],
    semanticValidationProvider: { type: String, default: "" },
    semanticValidatedAt: Date,
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    reviewFeedback: { type: String, default: "" },
    language: { type: String, default: "English" }
  },
  { timestamps: true }
);

const AssessmentBlueprintCoverageSchema = new Schema(
  {
    competencyId: { type: Schema.Types.ObjectId, ref: "Competency", required: true },
    domain: { type: String, default: "" },
    questionCount: { type: Number, min: 1, required: true }
  },
  { _id: false }
);

const AssessmentBlueprintSchema = new Schema(
  {
    blueprintId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    version: { type: String, required: true },
    purpose: { type: String, required: true },
    coverage: { type: [AssessmentBlueprintCoverageSchema], required: true },
    questionCount: { type: Number, min: 1, required: true },
    difficultyDistribution: {
      easy: { type: Number, min: 0, default: 0 },
      medium: { type: Number, min: 0, default: 0 },
      hard: { type: Number, min: 0, default: 0 }
    },
    questionType: { type: String, enum: ["mcq"], default: "mcq" },
    roleRelevance: {
      jobRoles: [{ type: String }],
      departmentCodes: [{ type: String }],
      assignments: [{ type: String }]
    },
      experienceRelevance: {
        minYears: { type: Number, min: 0 },
        maxYears: { type: Number, min: 0 }
      },
      timeLimitMinutes: { type: Number, min: 5, max: 180 },
    active: { type: Boolean, default: true, index: true },
    frameworkId: { type: String, default: "" },
    frameworkVersionId: { type: Schema.Types.ObjectId, ref: "FrameworkVersion" },
    frameworkVersion: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);
AssessmentBlueprintSchema.index({ blueprintId: 1, version: 1 }, { unique: true });
AssessmentBlueprintSchema.index({ active: 1, "roleRelevance.jobRoles": 1 });

const FormalQuizSchema = new Schema(
  {
    title: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    lectureId: { type: Schema.Types.ObjectId, ref: "Lecture", index: true },
    competencyIds: [{ type: Schema.Types.ObjectId, ref: "Competency" }],
    questionIds: [{ type: Schema.Types.ObjectId, ref: "SihQuestion" }],
    topic: { type: String, default: "" },
    difficulty: { type: String, enum: ["easy", "medium", "hard", "mixed"], default: "mixed" },
    passingPercentage: { type: Number, default: 60 },
    timeLimitMinutes: { type: Number, default: 30 },
    negativeMarking: { type: Boolean, default: false },
    randomize: { type: Boolean, default: true },
    adaptive: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true
    },
    assignedTo: [{ type: Schema.Types.ObjectId, ref: "User" }],
    // Present only on competency-assessment quizzes finalized from a reviewed set.
    // A sparse unique index makes concurrent finalization requests converge on one quiz
    // without affecting historical quizzes that have no finalization key.
    finalizationKey: { type: String },
    timeLimitEnabled: { type: Boolean, default: false },
    blueprintId: { type: String, default: "" },
    blueprintVersion: { type: String, default: "" },
    questionMetadata: [
      {
        questionId: { type: Schema.Types.ObjectId, ref: "SihQuestion" },
        competencyId: { type: Schema.Types.ObjectId, ref: "Competency" },
        domain: { type: String, default: "" }
      }
    ]
  },
  { timestamps: true }
);
FormalQuizSchema.index({ finalizationKey: 1 }, { unique: true, sparse: true });

const FormalQuizAttemptSchema = new Schema(
  {
    quizId: { type: Schema.Types.ObjectId, ref: "FormalQuiz", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Deterministic source identity for retried formal-quiz submissions.
    outcomeDedupeKey: { type: String, default: undefined },
    answers: [
      {
        questionId: { type: Schema.Types.ObjectId, ref: "SihQuestion" },
        selected: { type: String, enum: ["A", "B", "C", "D", ""] },
        correct: Boolean,
        responseTimeMs: Number
      }
    ],
    score: { type: Number, required: true },
    total: { type: Number, required: true },
    percentage: { type: Number, required: true },
    correctCount: { type: Number, required: true },
    incorrectCount: { type: Number, required: true },
    skippedCount: { type: Number, required: true },
    passed: { type: Boolean, required: true },
    averageResponseTimeMs: { type: Number, default: 0 },
    suspiciousActivityCount: { type: Number, default: 0, min: 0 },
    suspiciousActivityReasons: [{ type: String }],
    weakTopics: [{ type: String }],
    competencyImpacts: [
      {
        competencyId: { type: Schema.Types.ObjectId, ref: "Competency" },
        delta: Number
      }
    ]
  },
  { timestamps: true }
);
FormalQuizAttemptSchema.index({ userId: 1, createdAt: -1 });
FormalQuizAttemptSchema.index({ outcomeDedupeKey: 1 }, { unique: true, sparse: true });

const CompetencyAssessmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    competencyIds: [{ type: Schema.Types.ObjectId, ref: "Competency" }],
    quizId: { type: Schema.Types.ObjectId, ref: "FormalQuiz" },
    questionIds: [{ type: Schema.Types.ObjectId, ref: "SihQuestion" }],
    blueprintId: { type: String, default: "" },
    blueprintVersion: { type: String, default: "" },
      blueprintSource: { type: String, enum: ["configured", "fallback", "legacy"], default: "legacy" },
      timeLimitMinutes: { type: Number, min: 5, max: 180 },
    finalizationKey: { type: String, index: true, unique: true, sparse: true },
    blueprintCoverage: [
      {
        competencyId: { type: Schema.Types.ObjectId, ref: "Competency" },
        domain: { type: String, default: "" },
        questionCount: { type: Number, min: 1 }
      }
    ],
    difficultyDistribution: {
      easy: { type: Number, min: 0, default: 0 },
      medium: { type: Number, min: 0, default: 0 },
      hard: { type: Number, min: 0, default: 0 }
    },
      status: { type: String, enum: ["pending_review", "in_progress", "completed", "expired"], default: "in_progress" },
      startedAt: Date,
      expiredAt: Date,
    results: [
      {
        competencyId: { type: Schema.Types.ObjectId, ref: "Competency" },
        assessedLevel: Number,
        accuracy: Number,
        rationale: String
      }
    ],
    completedAt: Date
  },
  { timestamps: true }
);

const LearningRecommendationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    competencyId: { type: Schema.Types.ObjectId, ref: "Competency" },
    source: {
      type: String,
      enum: ["platform", "igot", "nssta", "internal_lecture"],
      required: true
    },
    externalId: { type: String, default: "" },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    provider: { type: String, default: "" },
    difficulty: { type: String, default: "" },
    durationHours: { type: Number, default: 0 },
    relevanceScore: { type: Number, default: 0 },
    confidence: { type: String, enum: CONFIDENCE_TIERS, default: "low" },
    reasonCodes: [{ type: String }],
    reasonSummary: { type: String, default: "" },
    matchedCompetencies: [{ type: String }],
    solvedGaps: [{ type: String }],
    personalizationFactors: [{ type: String }],
    evidence: [{ type: String }],
    scoreBreakdown: { type: Schema.Types.Mixed, default: {} },
    whyRecommended: { type: String, default: "" },
    gapSolved: { type: String, default: "" },
    expectedImprovement: { type: String, default: "" },
    priority: { type: Number, default: 0 },
    courseUrl: { type: String, default: "" },
    pathStep: { type: Number, default: 0 },
    mlScore: { type: Number, default: null },
    rankingMethod: { type: String, default: "deterministic-fallback" },
    modelVersion: { type: String, default: "" },
    status: {
      type: String,
      enum: ["recommended", "enrolled", "in_progress", "completed", "dismissed"],
      default: "recommended"
    }
  },
  { timestamps: true }
);
LearningRecommendationSchema.index({ userId: 1, status: 1, priority: -1, pathStep: 1 });

const PlatformCourseSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    provider: { type: String, default: "AARAMBH Platform Catalog" },
    difficulty: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "beginner" },
    durationHours: { type: Number, default: 4 },
    competencyCodes: [{ type: String }],
    keywords: [{ type: String }],
    targetAudience: { type: String, default: "" },
      courseUrl: { type: String, default: "" },
      lectureIds: [{ type: Schema.Types.ObjectId, ref: "Lecture" }],
      isActive: { type: Boolean, default: true },
    /** Explicitly NOT live iGOT — local curated catalog for recommendations when external APIs are offline */
    catalogType: {
      type: String,
      enum: ["platform", "igot_mirror", "nssta_mirror"],
      default: "platform"
    }
  },
  { timestamps: true }
);

const IGOTEnrollmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    courseId: { type: String, required: true },
    title: { type: String, default: "" },
    status: {
      type: String,
      enum: ["enrolled", "in_progress", "completed"],
      default: "enrolled"
    },
    progressPercent: { type: Number, default: 0 },
    source: { type: String, enum: ["igot_live", "igot_simulated", "local_record"], default: "local_record" },
    externalEnrollmentId: { type: String, default: "" },
    lastSyncedAt: Date,
    syncError: { type: String, default: "" },
    completedAt: Date
  },
  { timestamps: true }
);
IGOTEnrollmentSchema.index({ userId: 1, courseId: 1 }, { unique: true });

const NSSTAEnrollmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    programmeId: { type: String, required: true },
    title: { type: String, default: "" },
    status: {
      type: String,
      enum: ["recommended", "enrolled", "in_progress", "completed"],
      default: "recommended"
    },
    progressPercent: { type: Number, default: 0 },
    source: { type: String, enum: ["nssta_live", "nssta_simulated", "local_record"], default: "local_record" },
    externalEnrollmentId: { type: String, default: "" },
    lastSyncedAt: Date,
    syncError: { type: String, default: "" },
    completedAt: Date
  },
  { timestamps: true }
);
NSSTAEnrollmentSchema.index({ userId: 1, programmeId: 1 }, { unique: true });

const LearningActivitySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: [
        "lecture_watch",
        "lab",
        "quiz",
        "assessment",
        "course",
        "training",
        "tutor",
        "flashcard",
        "revision"
      ],
      required: true
    },
    minutes: { type: Number, default: 0 },
    meta: { type: Schema.Types.Mixed },
    occurredAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);
LearningActivitySchema.index({ userId: 1, occurredAt: -1 });

const PerformanceSnapshotSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    quizAttempts: { type: Number, default: 0 },
    quizAveragePercentage: { type: Number, default: 0 },
    assessmentAverage: { type: Number, default: 0 },
    coursesCompleted: { type: Number, default: 0 },
    coursesInProgress: { type: Number, default: 0 },
    trainingCompleted: { type: Number, default: 0 },
    learningHours: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    competencyAchievementPercent: { type: Number, default: 0 },
    overallLearningPercent: { type: Number, default: 0 },
    breakdown: {
      courseCompletion: { type: Number, default: 0 },
      assessmentPerformance: { type: Number, default: 0 },
      competencyAchievement: { type: Number, default: 0 },
      trainingCompletion: { type: Number, default: 0 },
      quizPerformance: { type: Number, default: 0 },
      learningHoursScore: { type: Number, default: 0 }
    },
    history: [
      {
        capturedAt: { type: Date, default: Date.now },
        overallLearningPercent: { type: Number, default: 0 },
        competencyAchievementPercent: { type: Number, default: 0 },
        quizAveragePercentage: { type: Number, default: 0 },
        learningHours: { type: Number, default: 0 }
      }
    ],
    lastCalculatedAt: Date
  },
  { timestamps: true }
);

const SystemSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: true }
);

const AuditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true },
    resource: { type: String, default: "" },
    meta: { type: Schema.Types.Mixed },
    ip: { type: String, default: "" }
  },
  { timestamps: true }
);

const AIUsageSchema = new Schema(
  {
    provider: { type: String, required: true },
    task: { type: String, required: true },
    success: { type: Boolean, required: true },
    latencyMs: { type: Number, default: 0 },
    errorCode: { type: String, default: "" },
    userId: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

const IntegrationStatusSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["live", "simulated", "not_configured", "down"],
      required: true
    },
    message: { type: String, default: "" },
    lastCheckedAt: Date,
    lastSuccessAt: Date
  },
  { timestamps: true }
);

const FacultyAssignmentSchema = new Schema(
  {
    facultyId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    learnerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);
FacultyAssignmentSchema.index({ facultyId: 1, learnerId: 1 }, { unique: true });

export const DepartmentModel = mongoose.model("Department", DepartmentSchema);
export const FrameworkVersionModel = mongoose.model("FrameworkVersion", FrameworkVersionSchema);
export const SourceRegistryModel = mongoose.model("SourceRegistry", SourceRegistrySchema);
export const CompetencyModel = mongoose.model("Competency", CompetencySchema);
export const RoleRequirementModel = mongoose.model("RoleRequirement", RoleRequirementSchema);
export const EmployeeProfileModel = mongoose.model("EmployeeProfile", EmployeeProfileSchema);
export const CompetencyScoreModel = mongoose.model("CompetencyScore", CompetencyScoreSchema);
export const SkillGapModel = mongoose.model("SkillGap", SkillGapSchema);
export const SihQuestionModel = mongoose.model("SihQuestion", QuestionSchema);
export const AssessmentBlueprintModel = mongoose.model("AssessmentBlueprint", AssessmentBlueprintSchema);
export const FormalQuizModel = mongoose.model("FormalQuiz", FormalQuizSchema);
export const FormalQuizAttemptModel = mongoose.model("FormalQuizAttempt", FormalQuizAttemptSchema);
export const CompetencyAssessmentModel = mongoose.model(
  "CompetencyAssessment",
  CompetencyAssessmentSchema
);
export const LearningRecommendationModel = mongoose.model(
  "LearningRecommendation",
  LearningRecommendationSchema
);
export const PlatformCourseModel = mongoose.model("PlatformCourse", PlatformCourseSchema);
export const IGOTEnrollmentModel = mongoose.model("IGOTEnrollment", IGOTEnrollmentSchema);
export const NSSTAEnrollmentModel = mongoose.model("NSSTAEnrollment", NSSTAEnrollmentSchema);
export const LearningActivityModel = mongoose.model("LearningActivity", LearningActivitySchema);
export const PerformanceSnapshotModel = mongoose.model(
  "PerformanceSnapshot",
  PerformanceSnapshotSchema
);
export const SystemSettingsModel = mongoose.model("SystemSettings", SystemSettingsSchema);
export const AuditLogModel = mongoose.model("AuditLog", AuditLogSchema);
export const AIUsageModel = mongoose.model("AIUsage", AIUsageSchema);
export const IntegrationStatusModel = mongoose.model("IntegrationStatus", IntegrationStatusSchema);
export const FacultyAssignmentModel = mongoose.model("FacultyAssignment", FacultyAssignmentSchema);

export type { Types };
