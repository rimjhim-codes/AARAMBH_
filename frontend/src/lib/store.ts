import { create } from "zustand";

export const USER_ROLES = ["employee", "faculty", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  plan: "free" | "pro" | "institution";
  role: UserRole;
  roles?: UserRole[];
  activeRole?: UserRole;
  emailVerified?: boolean;
  studyStreak?: number;
  xp?: number;
};

type AppState = {
  user: UserProfile | null;
  authReady: boolean;
  setUser: (user: UserProfile | null) => void;
  setAuthReady: (ready: boolean) => void;
};

export const useAppStore = create<AppState>((set) => ({
  user: null,
  authReady: false,
  setUser: (user) => set({ user }),
  setAuthReady: (ready) => set({ authReady: ready })
}));
