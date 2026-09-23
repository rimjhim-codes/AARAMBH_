"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { useAuth } from "@/lib/useAuth";
import { isLearningExperience, isSihExperience } from "@/lib/routing";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useI18n } from "@/i18n";
import { NotificationCenter } from "@/components/NotificationCenter";
import { ThemeToggle } from "@/components/ThemeToggle";

const employeeNav = [
  { href: "/sih/dashboard", key: "nav.dashboard" }, { href: "/competencies", key: "nav.competencies" },
  { href: "/skill-gaps", key: "nav.gaps" },
  { href: "/learning-path", key: "nav.learningPath" }, { href: "/igot", key: "nav.igot" },
  { href: "/nssta-training", key: "nav.nssta" }, { href: "/assessments", key: "nav.assessments" },
  { href: "/labs", label: "Virtual Labs" },
  { href: "/quizzes", key: "nav.quizzes" }, { href: "/learning-history", key: "nav.history" },
  { href: "/performance", key: "nav.analytics" }, { href: "/ai-assistant", key: "nav.assistant" },
  { href: "/profile", key: "nav.profile" }, { href: "/help", label: "Getting Started" }
];

const facultyNav = [
  { href: "/faculty/dashboard", key: "nav.dashboard" },
  { href: "/faculty/quiz-generator", key: "nav.quizzes" },
  { href: "/faculty/assessments", label: "Assessment Review" },
  { href: "/faculty/question-bank", label: "Question Bank" },
  { href: "/faculty/learners", label: "Learners" },
  { href: "/faculty/materials", label: "Materials" },
  { href: "/faculty/analytics", label: "Analytics" },
  { href: "/igot", key: "nav.igot" },
  { href: "/nssta-training", key: "nav.nssta" },
  { href: "/labs", label: "Virtual Labs" },
  { href: "/ai-assistant", key: "nav.assistant" },
  { href: "/profile", key: "nav.profile" },
  { href: "/help", label: "Getting Started" }
];

const adminNav = [
  { href: "/admin/dashboard", label: "Admin Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/competencies", label: "Competencies" },
  { href: "/admin/departments", label: "Departments" },
  { href: "/admin/framework", label: "Framework" },
  { href: "/admin/skill-gaps", label: "Org Skill Gaps" },
  { href: "/admin/training", label: "Training" },
  { href: "/admin/integrations", label: "Integrations" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/igot", key: "nav.igot" },
  { href: "/nssta-training", key: "nav.nssta" },
  { href: "/labs", label: "Virtual Labs" },
  { href: "/ai-assistant", key: "nav.assistant" },
  { href: "/profile", key: "nav.profile" },
  { href: "/help", label: "Getting Started" }
];

const navGroups = [
  { label: "WORKSPACE", items: employeeNav.slice(0, 4) },
  { label: "LEARNING", items: employeeNav.slice(4, 9) },
  { label: "INSIGHTS", items: employeeNav.slice(9, 11) },
  { label: "ASSIST", items: employeeNav.slice(11, 12) },
  { label: "ACCOUNT", items: employeeNav.slice(12) }
];

function navForRole(role?: string) {
  if (role === "admin") return adminNav;
  if (role === "faculty") return facultyNav;
  return employeeNav;
}

export function SihShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const links = navForRole(user?.role);
  const { t } = useI18n();

  return (
    <div className="sih-shell min-h-screen">
      <header className="sih-topbar border-b">
        <div className="sih-topbar-inner">
          <div className="sih-topbar-context"><span className="topbar-mark">A</span><div><p className="eyebrow">OFFICIAL STATISTICS</p><h2>ARAMBH</h2></div></div>
          <div className="sih-topbar-tools">
            <span className="topbar-context-label">Workforce intelligence</span>
            <ThemeToggle />
            <LanguageSelector />
            <NotificationCenter />
            <RoleSwitcher compact />
            <Link href="/profile" className="user-chip"><span>{(user?.name || "U").slice(0, 1).toUpperCase()}</span><b>{user?.name || "Account"}</b></Link>
            <button onClick={logout} className="header-logout">Logout</button>
          </div>
        </div>
      </header>
      <div className="sih-layout mx-auto max-w-[1520px] gap-6 px-4 py-4 sm:px-6 lg:grid lg:grid-cols-[248px_1fr]">
        <details className="mobile-nav lg:hidden">
          <summary>Open ARAMBH menu</summary>
          <nav className="mobile-nav-list">{links.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const label = "key" in item ? t(item.key as string) : item.label;
            return <Link key={item.href} href={item.href as never} className={active ? "mobile-nav-link active" : "mobile-nav-link"}>{label}</Link>;
          })}</nav>
        </details>
        <aside className="sih-sidebar hidden h-fit rounded-lg p-3 lg:block">
          <div className="sidebar-brand"><span className="sidebar-brand-mark">A</span><div><strong>ARAMBH</strong><small>Assess · Adapt · Advance</small></div></div>
          <nav className="sidebar-nav">
            {(user?.role === "employee" ? navGroups : [{ label: "NAVIGATION", items: links }]).map((group) => <div className="sidebar-group" key={group.label}><p className="sidebar-group-label">{group.label}</p>{group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const label = "key" in item ? t(item.key as string) : item.label;
              return (
                <Link
                  key={item.href}
                  href={item.href as never}
                  className={`sidebar-link ${active ? "active" : ""}`}
                >
                  <span className="sidebar-icon" aria-hidden="true">{label?.slice(0, 1)}</span><span>{label}</span>
                </Link>
              );
            })}</div>)}
          </nav>
          <div className="sidebar-footer">Secure learning workspace<br /><span>© ARAMBH platform</span></div>
        </aside>
        <div className="sih-content min-w-0">{children}</div>
      </div>
    </div>
  );
}

export function PlatformChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const learningRoute = isLearningExperience(pathname);
  const useSihChrome = isSihExperience(pathname)
    || pathname === "/profile"
    || (learningRoute && !!user);

  if (useSihChrome) {
    return <SihShell>{children}</SihShell>;
  }
  return <>{children}</>;
}
