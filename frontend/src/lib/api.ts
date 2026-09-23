import axios from "axios";
import { useAppStore } from "./store";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api",
  withCredentials: true
});

let authMeInFlight: Promise<unknown> | null = null;
export function getCurrentUser() {
  if (!authMeInFlight) {
    authMeInFlight = api.get("/auth/me").then(({ data }) => data).finally(() => {
      authMeInFlight = null;
    });
  }
  return authMeInFlight;
}

let profileInFlight: Promise<unknown> | null = null;
export function getCurrentProfile() {
  if (!profileInFlight) {
    profileInFlight = api.get("/profile/me").then(({ data }) => data).finally(() => {
      profileInFlight = null;
    });
  }
  return profileInFlight;
}

api.interceptors.request.use((config) => {
  if (config.url?.replace(/^https?:\/\/[^/]+/, "").startsWith("/auth/me")) {
    config.params = { ...(config.params || {}), _auth_me: Date.now() };
    config.headers.set("Cache-Control", "no-cache");
    config.headers.set("Pragma", "no-cache");
  }
  return config;
});

export function clearSession() {
  useAppStore.getState().setUser(null);
}

export type TranscriptChunk = {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
};

export async function translateTranscript(
  chunks: TranscriptChunk[],
  targetLanguage: "Hindi" | "English"
) {
  const { data } = await api.post("/learning/translate", { chunks, targetLanguage });
  return data.translatedChunks as TranscriptChunk[];
}

let isRefreshing = false;
let refreshQueue: Array<{
  resolve: () => void;
  reject: (error: unknown) => void;
}> = [];

function flushRefreshQueue(error: unknown) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve();
  });
  refreshQueue = [];
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (["/", "/login", "/signup", "/verify-email", "/forgot-password", "/reset-password"].some((path) =>
    path === "/" ? window.location.pathname === "/" : window.location.pathname.startsWith(path)
  )) {
    return;
  }
  const currentPath = window.location.pathname + window.location.search;
  window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const original = error.config;

    if (
      status !== 401 ||
      !original ||
      original._retry ||
      original.url?.includes("/auth/refresh") ||
      original.url?.includes("/auth/logout")
    ) {
      throw error;
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({
          resolve: () => resolve(api(original)),
          reject
        });
      });
    }

    isRefreshing = true;
    original._retry = true;

    try {
      const { data } = await api.post("/auth/refresh");
      if (data.user) useAppStore.getState().setUser(data.user);
      flushRefreshQueue(null);
      return api(original);
    } catch (refreshError) {
      flushRefreshQueue(refreshError);
      clearSession();
      redirectToLogin();
      throw refreshError;
    } finally {
      isRefreshing = false;
    }
  }
);
