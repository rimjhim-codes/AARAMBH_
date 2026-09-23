import "dotenv/config";

const required = [
  "MONGO_URI",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET"
] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

function parseList(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const defaultAiProvider = process.env.AI_PROVIDER
  || (process.env.MISTRAL_API_KEY ? "mistral" : process.env.GEMINI_API_KEY ? "gemini" : "openai");

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 8080),
  mongoUri: process.env.MONGO_URI!,
  mongoServerSelectionTimeoutMs: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
  mongoConnectTimeoutMs: Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 10000),
  mongoMaxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20),
  mongoMinPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 0),
  mongoMaxIdleTimeMs: Number(process.env.MONGO_MAX_IDLE_TIME_MS || 60000),
  mongoWaitQueueTimeoutMs: Number(process.env.MONGO_WAIT_QUEUE_TIMEOUT_MS || 30000),
  clientUrl: process.env.CLIENT_URL || "http://localhost:3000",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET!,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET!,
  redisUrl: process.env.REDIS_URL || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  mistralApiKey: process.env.MISTRAL_API_KEY || "",
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
  openAiEmbeddingDimensions: process.env.OPENAI_EMBEDDING_DIMENSIONS
    ? Number(process.env.OPENAI_EMBEDDING_DIMENSIONS)
    : undefined,
  mistralEmbeddingModel: process.env.MISTRAL_EMBEDDING_MODEL || "mistral-embed",
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
  geminiEmbeddingDimensions: process.env.GEMINI_EMBEDDING_DIMENSIONS
    ? Number(process.env.GEMINI_EMBEDDING_DIMENSIONS)
    : 768,
  pineconeApiKey: process.env.PINECONE_API_KEY || "",
  pineconeIndex: process.env.PINECONE_INDEX || "",
  pineconeNamespace: process.env.PINECONE_NAMESPACE || "neurolearn", // keep until vectors reindexed into aarambh
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
  cloudinaryFolder: process.env.CLOUDINARY_FOLDER || "aarambh",
  resendApiKey: process.env.RESEND_API_KEY || "",
  resendFrom: process.env.RESEND_FROM || "Aarambh <onboarding@resend.dev>",
  devOtpConsole:
    process.env.NODE_ENV !== "production" && process.env.DEV_OTP_CONSOLE === "true",
  allowOtpPreview:
    process.env.NODE_ENV !== "production" && process.env.ALLOW_OTP_PREVIEW === "true",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:3000",
  aiProvider: defaultAiProvider,
  aiFallbackProviders: parseList(process.env.AI_FALLBACK_PROVIDERS || "gemini,openai,mistral"),
  aiRequestTimeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS || 45000),
  igotEnabled: process.env.IGOT_ENABLED === "true",
  igotApiBaseUrl: process.env.IGOT_API_BASE_URL || process.env.IGOT_API_BASE || "",
  igotApiKey: process.env.IGOT_API_KEY || "",
  igotClientId: process.env.IGOT_CLIENT_ID || "",
  igotClientSecret: process.env.IGOT_CLIENT_SECRET || "",
  igotSimulationMode: process.env.IGOT_SIMULATION_MODE === "true",
  igotCourseSearchPath: process.env.IGOT_COURSE_SEARCH_PATH || "/courses/search",
  igotEnrollmentPath: process.env.IGOT_ENROLLMENT_PATH || "/courses/{courseId}/enrollments",
  igotSyncPath: process.env.IGOT_SYNC_PATH || "/enrollments/{enrollmentId}",
  nsstaEnabled: process.env.NSSTA_ENABLED === "true",
  nsstaApiBaseUrl: process.env.NSSTA_API_BASE_URL || process.env.NSSTA_API_BASE || "",
  nsstaApiKey: process.env.NSSTA_API_KEY || "",
  nsstaSimulationMode: process.env.NSSTA_SIMULATION_MODE === "true",
  nsstaProgrammeSearchPath: process.env.NSSTA_PROGRAMME_SEARCH_PATH || "/tpac/programmes",
  nsstaEnrollmentPath: process.env.NSSTA_ENROLLMENT_PATH || "/tpac/programmes/{programmeId}/enrollments",
  nsstaSyncPath: process.env.NSSTA_SYNC_PATH || "/enrollments/{enrollmentId}",
  embeddingsEnabled: process.env.EMBEDDINGS_ENABLED !== "false",
  embeddingsProvider: process.env.EMBEDDINGS_PROVIDER || "openai",
  demoMode: process.env.DEMO_MODE === "true",
  adminBootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL || "",
  ssoIssuer: process.env.SSO_ISSUER || "",
  ssoClientId: process.env.SSO_CLIENT_ID || "",
  ssoClientSecret: process.env.SSO_CLIENT_SECRET || "",
  ssoCallbackUrl: process.env.SSO_CALLBACK_URL || "",
  mfaEncryptionKey: process.env.MFA_ENCRYPTION_KEY || "",
  sarvamApiKey: process.env.SARVAM_API_KEY || ""
};
