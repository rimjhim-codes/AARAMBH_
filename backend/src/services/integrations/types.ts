export type IntegrationConnectionStatus = "live" | "simulated" | "down" | "not_configured";

export type IntegrationErrorCode =
  | "http_error"
  | "rate_limited"
  | "timeout"
  | "network_error"
  | "provider_unavailable";

export class IntegrationProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly code: IntegrationErrorCode,
    public readonly status?: number,
    public readonly retryable = false,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "IntegrationProviderError";
  }
}

export interface ExternalCourse {
  id: string;
  title: string;
  description: string;
  provider: string;
  difficulty?: string;
  durationHours?: number;
  competencies?: string[];
  keywords?: string[];
  url?: string;
  source:
    | "igot_live"
    | "igot_simulated"
    | "igot_unavailable"
    | "platform_catalog"
    | "nssta_live"
    | "nssta_simulated"
    | "nssta_unavailable";
}

export interface ExternalEnrollment {
  id: string;
  courseId: string;
  status: "enrolled" | "in_progress" | "completed";
  progressPercent: number;
  completedAt?: string;
}

export interface TrainingProvider {
  name: string;
  getStatus(): Promise<{
    status: IntegrationConnectionStatus;
    message: string;
    mode: "live" | "simulated" | "down" | "not_configured";
  }>;
  searchCourses(query: {
    keywords?: string[];
    competencyNames?: string[];
    limit?: number;
  }): Promise<ExternalCourse[]>;
  enrollCourse(input: { courseId: string; userId: string; title?: string }): Promise<ExternalEnrollment>;
  syncEnrollment(input: {
    enrollmentId: string;
    courseId: string;
    userId: string;
    progressPercent: number;
    status: "enrolled" | "in_progress" | "completed";
  }): Promise<ExternalEnrollment>;
}
