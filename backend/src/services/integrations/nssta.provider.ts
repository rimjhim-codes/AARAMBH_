import { env } from "../../config/env";
import { PlatformCourseModel } from "../../models/sih/SihModels";
import { ExternalCourse, TrainingProvider } from "./types";
import { normalizeEnrollment, replacePath, requestJson } from "./http";

export class LiveNsstaProvider implements TrainingProvider {
  name = "nssta_live";

  async getStatus() {
    if (!env.nsstaEnabled || !env.nsstaApiBaseUrl || !env.nsstaApiKey) {
      return {
          status: "not_configured" as const,
          mode: "not_configured" as const,
        message:
          "NSSTA TPAC integration is not configured. Set NSSTA_ENABLED=true, NSSTA_API_BASE_URL, and NSSTA_API_KEY."
      };
    }
    try {
      const res = await fetch(`${env.nsstaApiBaseUrl.replace(/\/$/, "")}/health`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${env.nsstaApiKey}`
        },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) {
        return {
          status: "down" as const,
          mode: "down" as const,
          message: `NSSTA health check failed (${res.status}).`
        };
      }
      return { status: "live" as const, mode: "live" as const, message: "NSSTA TPAC API reachable." };
    } catch (e) {
      return {
        status: "down" as const,
        mode: "down" as const,
        message: `NSSTA connection error: ${(e as Error).message}`
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
      `${env.nsstaApiBaseUrl.replace(/\/$/, "")}${env.nsstaProgrammeSearchPath}?${params.toString()}`,
      { headers: { Accept: "application/json", Authorization: `Bearer ${env.nsstaApiKey}` }, signal: AbortSignal.timeout(15000) }, 3, "nssta"
    ) as { programmes?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> };
    return (data.programmes || data.data || []).map((p) => ({
      id: String(p.id || p.programmeId || ""),
      title: String(p.title || p.name || "Untitled"),
      description: String(p.description || ""),
      provider: "NSSTA TPAC",
      durationHours: Number(p.durationHours || p.duration || 0) || undefined,
      competencies: Array.isArray(p.competencies) ? p.competencies.map(String) : [],
      keywords: Array.isArray(p.keywords) ? p.keywords.map(String) : [],
      url: p.url ? String(p.url) : undefined,
      source: "nssta_live" as const
    }));
  }

  async enrollCourse(input: { courseId: string; userId: string; title?: string }) {
    const path = replacePath(env.nsstaEnrollmentPath, { programmeId: input.courseId });
    const data = await requestJson(`${env.nsstaApiBaseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST", headers: { Accept: "application/json", ...buildNsstaHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ programmeId: input.courseId, learnerId: input.userId, title: input.title }), signal: AbortSignal.timeout(15000)
    }, 3, "nssta");
    return normalizeEnrollment(data, { id: input.courseId, courseId: input.courseId }, "NSSTA TPAC");
  }

  async syncEnrollment(input: { enrollmentId: string; courseId: string; userId: string; progressPercent: number; status: "enrolled" | "in_progress" | "completed" }) {
    const path = replacePath(env.nsstaSyncPath, { enrollmentId: input.enrollmentId });
    const data = await requestJson(`${env.nsstaApiBaseUrl.replace(/\/$/, "")}${path}`, {
      method: "PATCH", headers: { Accept: "application/json", ...buildNsstaHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(input), signal: AbortSignal.timeout(15000)
    }, 3, "nssta");
    return normalizeEnrollment(data, { id: input.enrollmentId, courseId: input.courseId }, "NSSTA TPAC");
  }
}

function buildNsstaHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${env.nsstaApiKey}` };
}

export class SimulatedNsstaProvider implements TrainingProvider {
  name = "nssta_simulated";
  private catalog = new LocalNsstaCatalogProvider();

  async getStatus() {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return {
      status: "simulated" as const,
      mode: "simulated" as const,
      message: "Simulation Mode: demo NSSTA TPAC catalogue and enrollment flow; live NSSTA sync pending credentials."
    };
  }

  async searchCourses(query: { keywords?: string[]; competencyNames?: string[]; limit?: number }) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const courses = await this.catalog.searchCourses(query);
    return courses.map((course) => ({ ...course, id: `SIM-NSSTA-${course.id}`, provider: "NSSTA TPAC (Simulation)", source: "nssta_simulated" as const }));
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

/** Local NSSTA-oriented catalogue entries (catalogType nssta_mirror) — never labeled as live NSSTA. */
export class LocalNsstaCatalogProvider implements TrainingProvider {
  name = "nssta_local_catalog";

  async getStatus() {
    return {
      status: "not_configured" as const,
      mode: "not_configured" as const,
      message:
        "Live NSSTA TPAC API not configured. Local TPAC-oriented catalogue entries are labeled as platform content."
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

    const courses = await PlatformCourseModel.find({
      isActive: true,
      catalogType: "nssta_mirror"
    }).lean();

    const scored = courses
      .map((c) => {
        const hay = [c.title, c.description, ...(c.competencyCodes || []), ...(c.keywords || [])]
          .join(" ")
          .toLowerCase();
        const hits = terms.length ? terms.filter((t) => hay.includes(t)).length : 1;
        return { c, hits };
      })
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, query.limit || 20);

    return scored.map(({ c }) => ({
      id: c.code,
      title: c.title,
      description: `${c.description} [Platform TPAC-oriented catalogue — not a live NSSTA feed]`,
      provider: c.provider,
      difficulty: c.difficulty,
      durationHours: c.durationHours,
      competencies: c.competencyCodes,
      keywords: c.keywords,
      url: c.courseUrl || undefined,
      source: "platform_catalog" as const
    }));
  }

  async enrollCourse(input: { courseId: string; userId: string; title?: string }): Promise<never> {
    throw new Error(`Live NSSTA is not configured; cannot enroll ${input.courseId}.`);
  }

  async syncEnrollment(input: { enrollmentId: string; courseId: string; userId: string; progressPercent: number; status: "enrolled" | "in_progress" | "completed" }): Promise<never> {
    throw new Error(`Live NSSTA is not configured; cannot sync ${input.enrollmentId}.`);
  }
}

export function getNsstaProvider(): TrainingProvider {
  if (env.nsstaEnabled && env.nsstaApiBaseUrl && env.nsstaApiKey) {
    return new LiveNsstaProvider();
  }
  if (env.nsstaSimulationMode) return new SimulatedNsstaProvider();
  return new LocalNsstaCatalogProvider();
}
