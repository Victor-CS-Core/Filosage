"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  ChevronRight,
  Compass,
  Crown,
  Home,
  LogOut,
  Moon,
  Plus,
  Sparkles,
  Sun,
  TrendingUp,
  UserRound,
} from "lucide-react";
import ErudozaMark from "@/components/ErudozaMark";
import AuthModal from "@/components/AuthModal";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import type { Course } from "@/lib/course-types";

interface AppShellProps {
  children: React.ReactNode;
  activeTopic?: string;
  activeLessonId?: string;
  activeCourseId?: string | null;
}

const primaryNav = [
  { href: "/", label: "Today", icon: Home },
  { href: "/library", label: "Explore", icon: Compass },
  { href: "/review", label: "Review", icon: CalendarCheck2 },
  { href: "/progress", label: "Progress", icon: TrendingUp },
];

export default function AppShell({ children, activeTopic, activeCourseId }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { user, account, isPro, signOut } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    if (!user || !isPro) {
      queueMicrotask(() => setCourses([]));
      return;
    }
    let cancelled = false;
    void user.getIdToken().then((token) => fetch("/api/courses?scope=mine", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { courses: Course[] };
      if (!cancelled) setCourses(data.courses);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [isPro, pathname, user]);

  const displayName = account?.displayName ?? user?.displayName ?? "Learner";
  const firstName = displayName.split(" ")[0] || "Learner";
  const outlineQuota = account?.quotas.find((quota) => quota.feature === "course_outline");
  const currentCourse = useMemo(
    () => courses.find((course) => (course.id ?? course.courseId) === activeCourseId || course.topic === activeTopic),
    [activeCourseId, activeTopic, courses],
  );

  const navigate = (href: string) => router.push(href);

  if (!user) {
    return (
      <div className="public-shell">
        <header className="public-header">
          <button className="brand public-brand" onClick={() => navigate("/")} aria-label="Erudoza home">
            <span className="brand-mark" aria-hidden="true"><ErudozaMark /></span>
            <span><strong className="brand-wordmark">Erudoza</strong><small>Your daily dose of understanding.</small></span>
          </button>
          <nav aria-label="Public navigation">
            <button onClick={() => navigate("/library")}>Library</button>
            <button onClick={() => navigate("/#method")}>How it works</button>
            <button onClick={() => navigate("/pricing")}>Plans</button>
          </nav>
          <div className="public-header-actions">
            <button className="button button-quiet" onClick={() => setShowAuth(true)}>Sign in</button>
            <button className="button button-primary" onClick={() => navigate("/pricing")}>Try Erudoza free <ArrowRight size={15} /></button>
          </div>
        </header>
        <main className="public-main">{children}</main>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </div>
    );
  }

  return (
    <div className="app-shell learner-shell">
      <aside className="learner-sidebar" aria-label="Primary navigation">
        <button className="brand learner-brand" onClick={() => navigate("/")} aria-label="Erudoza home">
          <span className="brand-mark" aria-hidden="true"><ErudozaMark /></span>
          <span><strong className="brand-wordmark">Erudoza</strong><small>Your daily dose of understanding.</small></span>
        </button>

        <nav className="learner-primary-nav">
          {primaryNav.map(({ href, label, icon: Icon }) => (
            <button key={href} className={`nav-link ${pathname === href ? "is-active" : ""}`} onClick={() => navigate(href)}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
          {isPro && (
            <button className={`nav-link ${pathname === "/create" ? "is-active" : ""}`} onClick={() => navigate("/create")}>
              <Plus size={18} /><span>Create course</span>
            </button>
          )}
        </nav>

        {isPro ? (
          <section className="sidebar-courses" aria-labelledby="sidebar-courses-title">
            <div className="sidebar-heading-row"><span id="sidebar-courses-title">My learning paths</span><span>{courses.length}</span></div>
            <div className="sidebar-course-list">
              {courses.slice(0, 6).map((course) => {
                const id = course.id ?? course.courseId;
                const active = currentCourse === course;
                return (
                  <button key={id ?? course.topic} className={`sidebar-course ${active ? "is-active" : ""}`} onClick={() => navigate(`/course/${encodeURIComponent(course.topic)}${id ? `?id=${id}` : ""}`)}>
                    <span className="sidebar-course-icon"><BookOpen size={15} /></span>
                    <span><strong>{course.topic}</strong><small>{course.isPublic ? "Published" : "Private"}</small></span>
                    <ChevronRight size={15} />
                  </button>
                );
              })}
              {!courses.length && <p className="sidebar-empty-copy">Create a focused course and it will stay within reach here.</p>}
            </div>
          </section>
        ) : (
          <section className="sidebar-upgrade">
            <Sparkles size={18} />
            <strong>Craft your own course</strong>
            <p>Build a private learning path around a goal that matters to you.</p>
            <button className="button button-primary button-small" onClick={() => navigate("/pricing")}>Explore Pro</button>
          </section>
        )}

        <div className="learner-sidebar-footer">
          {isPro && outlineQuota && (
            <button className="quota-row" onClick={() => navigate("/pricing")}>
              <Crown size={15} /><span><strong>Erudoza Pro</strong><small>{outlineQuota.remaining ?? "Unlimited"} course credits</small></span>
            </button>
          )}
          <div className="account-row">
            {user?.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : <span className="avatar-fallback"><UserRound size={16} /></span>}
            <span><strong>{firstName}</strong><small>{isPro ? "Pro learning account" : "Free learning account"}</small></span>
            <button className="icon-button" onClick={toggle} aria-label={`Use ${theme === "dark" ? "light" : "dark"} mode`}>
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="icon-button" onClick={signOut} aria-label="Sign out"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <header className="learner-mobile-header">
        <button className="brand brand-mobile" onClick={() => navigate("/")} aria-label="Erudoza home">
          <span className="brand-mark" aria-hidden="true"><ErudozaMark /></span><strong className="brand-wordmark">Erudoza</strong>
        </button>
        <span>{isPro ? "Pro" : "Free"}</span>
        <button className="icon-button" onClick={toggle} aria-label="Toggle color theme">{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
      </header>

      <main className="app-main">{children}</main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {primaryNav.slice(0, 2).map(({ href, label, icon: Icon }) => (
          <button key={href} className={pathname === href ? "is-active" : ""} onClick={() => navigate(href)}><Icon size={20} /><span>{label}</span></button>
        ))}
        <button className="mobile-create" onClick={() => navigate(isPro ? "/create" : "/pricing")} aria-label={isPro ? "Create course" : "Explore Pro"}><Plus size={22} /></button>
        {primaryNav.slice(2).map(({ href, label, icon: Icon }) => (
          <button key={href} className={pathname === href ? "is-active" : ""} onClick={() => navigate(href)}><Icon size={20} /><span>{label}</span></button>
        ))}
      </nav>
    </div>
  );
}
