import { env } from "../../config/env";
import { PlatformCourseModel } from "../../models/sih/SihModels";
import { ExternalCourse, TrainingProvider } from "./types";
import { normalizeEnrollment, replacePath, requestJson } from "./http";

/**
 * Live iGOT adapter. Endpoint paths are configurable because no public partner
 * REST contract is published on the public iGOT portal.
 */
export class LiveIgotProvider implements TrainingProvider {
  name = "igot_live";

  async getStatus() {
    if (!env.igotEnabled || !env.igotApiBaseUrl || !(env.igotApiKey || env.igotClientId)) {
      return {
        status: "not_configured" as const,
        mode: "not_configured" as const,
        message:
          "iGOT Karmayogi integration is not configured. Set IGOT_ENABLED=true and IGOT_API_BASE_URL plus credentials."
      };
    }

    try {
      const res = await fetch(`${env.igotApiBaseUrl.replace(/\/$/, "")}/health`, {
        headers: buildIgotHeaders(),
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) {
        return {
          status: "down" as const,
          mode: "down" as const,
          message: `iGOT health check failed (${res.status}). Credentials may be invalid or endpoint unavailable.`
        };
      }
      return {
        status: "live" as const,
        mode: "live" as const,
        message: "iGOT Karmayogi API reachable."
      };
    } catch (e) {
      return {
        status: "down" as const,
        mode: "down" as const,
        message: `iGOT connection error: ${(e as Error).message}`
      };
    }
  }

  async searchCourses(query: {
    keywords?: string[];
    competencyNames?: string[];
    limit?: number;
  }): Promise<ExternalCourse[]> {
    const status = await this.getStatus();
    if (status.status !== "live") return [];

    const params = new URLSearchParams();
    const q = [...(query.keywords || []), ...(query.competencyNames || [])].join(" ");
    if (q) params.set("q", q);
    params.set("limit", String(query.limit || 20));

    const data = await requestJson(
      `${env.igotApiBaseUrl.replace(/\/$/, "")}${env.igotCourseSearchPath}?${params.toString()}`,
      { headers: buildIgotHeaders(), signal: AbortSignal.timeout(15000) }, 3, "igot"
    ) as { courses?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> };
    const courses = data.courses || data.data || [];
    return courses.map((c) => ({
      id: String(c.id || c.courseId || ""),
      title: String(c.title || c.name || "Untitled"),
      description: String(c.description || ""),
      provider: String(c.provider || "iGOT Karmayogi"),
      difficulty: c.difficulty ? String(c.difficulty) : undefined,
      durationHours: Number(c.durationHours || c.duration || 0) || undefined,
      competencies: Array.isArray(c.competencies)
        ? c.competencies.map(String)
        : Array.isArray(c.skills)
          ? c.skills.map(String)
          : [],
      keywords: Array.isArray(c.keywords) ? c.keywords.map(String) : [],
      url: c.url ? String(c.url) : c.link ? String(c.link) : undefined,
      source: "igot_live" as const
    }));
  }

  async enrollCourse(input: { courseId: string; userId: string; title?: string }) {
    const path = replacePath(env.igotEnrollmentPath, { courseId: input.courseId });
    const data = await requestJson(`${env.igotApiBaseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST", headers: { ...buildIgotHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: input.courseId, learnerId: input.userId, title: input.title }),
      signal: AbortSignal.timeout(15000)
    }, 3, "igot");
    return normalizeEnrollment(data, { id: input.courseId, courseId: input.courseId }, "iGOT Karmayogi");
  }

  async syncEnrollment(input: { enrollmentId: string; courseId: string; userId: string; progressPercent: number; status: "enrolled" | "in_progress" | "completed" }) {
    const path = replacePath(env.igotSyncPath, { enrollmentId: input.enrollmentId });
    const data = await requestJson(`${env.igotApiBaseUrl.replace(/\/$/, "")}${path}`, {
      method: "PATCH", headers: { ...buildIgotHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(input), signal: AbortSignal.timeout(15000)
    }, 3, "igot");
    return normalizeEnrollment(data, { id: input.enrollmentId, courseId: input.courseId }, "iGOT Karmayogi");
  }
}

export class SimulatedIgotProvider implements TrainingProvider {
  name = "igot_simulated";
  private catalog = new PlatformCatalogProvider();

  async getStatus() {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return {
      status: "simulated" as const,
      mode: "simulated" as const,
      message: "Simulation Mode: demo iGOT-shaped catalogue and enrollment flow; live iGOT sync pending credentials."
    };
  }

  async searchCourses(query: { keywords?: string[]; competencyNames?: string[]; limit?: number }) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const courses = await this.catalog.searchCourses(query);
    return courses.map((course) => ({ ...course, id: `SIM-IGOT-${course.id}`, provider: "iGOT Karmayogi (Simulation)", source: "igot_simulated" as const }));
  }

  async enrollCourse(input: { courseId: string; userId: string; title?: string }) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { id: `SIM-ENR-${input.courseId}-${input.userId}`, courseId: input.courseId, status: "enrolled" as const, progressPercent: 0 };
  }

  async syncEnrollment(input: { enrollmentId: string; courseId: string; userId: string; progressPercent: number; status: "enrolled" | "in_progress" | "completed" }) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { id: input.enrollmentId, courseId: input.courseId, status: input.status, progressPercent: input.progressPercent, ...(input.status === "completed" ? { completedAt: new Date().toISOString() } : {}) };
  }
}

function buildIgotHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (env.igotApiKey) headers.Authorization = `Bearer ${env.igotApiKey}`;
  if (env.igotClientId) headers["X-Client-Id"] = env.igotClientId;
  if (env.igotClientSecret) headers["X-Client-Secret"] = env.igotClientSecret;
  return headers;
}

/**
 * Platform catalog used when live iGOT is not configured.
 * Courses are explicitly labeled platform_catalog — NEVER presented as live iGOT.
 */
export class PlatformCatalogProvider implements TrainingProvider {
  name = "platform_catalog";

  async getStatus() {
    return {
      status: "not_configured" as const,
      mode: "not_configured" as const,
      message:
        "Live iGOT API not configured. Platform catalog recommendations are available and labeled as non-iGOT content."
    };
  }

  async searchCourses(query: {
    keywords?: string[];
    competencyNames?: string[];
    limit?: number;
  }): Promise<ExternalCourse[]> {
    const terms = [...(query.keywords || []), ...(query.competencyNames || [])]
      .map((t) => t.toLowerCase())
      .filter(Boolean);

    const courses = await PlatformCourseModel.find({ isActive: true }).lean();
    const scored = courses
      .map((c) => {
        const hay = [
          c.title,
          c.description,
          ...(c.competencyCodes || []),
          ...(c.keywords || [])
        ]
          .join(" ")
          .toLowerCase();
        const hits = terms.length
          ? terms.filter((t) => hay.includes(t)).length
          : 1;
        return { c, hits };
      })
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, query.limit || 20);

    return scored.map(({ c, hits }) => ({
      id: c.code,
      title: c.title,
      description: c.description,
      provider: c.provider,
      difficulty: c.difficulty,
      durationHours: c.durationHours,
      competencies: c.competencyCodes,
      keywords: c.keywords,
      url: c.courseUrl || undefined,
      source: "platform_catalog" as const,
      // relevance hint for callers
      _score: hits
    })) as ExternalCourse[];
  }

  async enrollCourse(input: { courseId: string; userId: string; title?: string }): Promise<never> {
    throw new Error(`Live iGOT is not configured; cannot enroll ${input.courseId}.`);
  }

  async syncEnrollment(input: { enrollmentId: string; courseId: string; userId: string; progressPercent: number; status: "enrolled" | "in_progress" | "completed" }): Promise<never> {
    throw new Error(`Live iGOT is not configured; cannot sync ${input.enrollmentId}.`);
  }
}

export function getIgotProvider(): TrainingProvider {
  if (env.igotEnabled && env.igotApiBaseUrl && (env.igotApiKey || env.igotClientId)) {
    return new LiveIgotProvider();
  }
  if (env.igotSimulationMode) return new SimulatedIgotProvider();
  return new PlatformCatalogProvider();
}
