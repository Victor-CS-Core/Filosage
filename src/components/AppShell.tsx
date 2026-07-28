"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  ChevronDown,
  ChevronRight,
  Compass,
  Crown,
  Home,
  LogOut,
  Moon,
  Plus,
  Sparkles,
  ShieldCheck,
  Sun,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import { SUPPORT_CONTACT } from "@/lib/legal";
import ErudozaMark from "@/components/ErudozaMark";
import AuthModal from "@/components/AuthModal";
import AppDrawer, { useAppDrawer } from "@/components/AppDrawer";
import LegalConsentModal from "@/components/LegalConsentModal";
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

const sidebarNav = [...primaryNav, { href: "/profile", label: "Profile", icon: UserRound }];

export default function AppShell({ children, activeTopic, activeCourseId }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { user, account, isOwner, isPro, signOut, loading: authLoading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const accountDrawer = useAppDrawer("mobile-account");

  const refreshCourses = useCallback(async () => {
    if (!user || !isPro) {
      setCourses([]);
      return;
    }
    const token = await user.getIdToken();
    const response = await fetch("/api/courses?scope=mine", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = await response.json() as { courses: Course[] };
    setCourses(data.courses);
  }, [isPro, user]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await refreshCourses();
      } catch {
        if (active) setCourses([]);
      }
    };
    void load();
    const onCoursesChanged = () => { void load(); };
    window.addEventListener("erudoza:courses-changed", onCoursesChanged);
    return () => {
      active = false;
      window.removeEventListener("erudoza:courses-changed", onCoursesChanged);
    };
  }, [refreshCourses]);

  const displayName = account?.displayName ?? user?.displayName ?? "Learner";
  const firstName = displayName.split(" ")[0] || "Learner";
  const outlineQuota = account?.quotas.find((quota) => quota.feature === "course_outline");
  const currentCourse = useMemo(
    () => courses.find((course) => (course.id ?? course.courseId) === activeCourseId || course.topic === activeTopic),
    [activeCourseId, activeTopic, courses],
  );

  const navigate = (href: string) => router.push(href);
  const isLegalPage = ["/terms", "/privacy", "/acceptable-use"].includes(pathname);
  const isPublicRoute = pathname === "/"
    || pathname === "/library"
    || pathname === "/pricing"
    || pathname === "/privacy-center"
    || pathname === "/copyright"
    || pathname.startsWith("/course/")
    || isLegalPage;

  if (authLoading && !isPublicRoute) {
    return (
      <div className="auth-boot-shell" aria-busy="true" aria-label="Restoring your Erudoza session">
        <span className="brand-mark" aria-hidden="true"><ErudozaMark /></span>
        <strong>Erudoza</strong>
        <span className="auth-boot-line" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="public-shell">
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <header className="public-header">
          <button className="brand public-brand" onClick={() => navigate("/")} aria-label="Erudoza home">
            <span className="brand-mark" aria-hidden="true"><ErudozaMark /></span>
            <span><strong className="brand-wordmark">Erudoza</strong><small>Your daily dose of understanding.</small></span>
          </button>
          <nav aria-label="Public navigation">
            <button onClick={() => navigate("/library")}>Library</button>
            <button onClick={() => navigate("/standard")}>Teaching standard</button>
            <button onClick={() => navigate("/pricing")}>Plans</button>
          </nav>
          <div className="public-header-actions">
            <button className="icon-button public-theme-toggle" onClick={toggle} aria-label={`Use ${theme === "dark" ? "light" : "dark"} mode`} title={`Use ${theme === "dark" ? "light" : "dark"} mode`}>
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="button button-quiet" onClick={() => setShowAuth(true)}>Sign in</button>
            <button className="button button-primary" onClick={() => navigate("/pricing")}>Try Erudoza free <ArrowRight size={15} /></button>
          </div>
        </header>
        <main className="public-main" id="main-content" tabIndex={-1}>{children}</main>
        <footer className="public-footer">
          <span>© {new Date().getFullYear()} Erudoza</span>
          <nav aria-label="Support and legal"><button onClick={() => navigate("/standard")}>Teaching standard</button><a href={`mailto:${SUPPORT_CONTACT}`}>Support</a><button onClick={() => navigate("/privacy-center")}>Privacy choices</button><button onClick={() => navigate("/terms")}>Terms</button><button onClick={() => navigate("/privacy")}>Privacy</button><button onClick={() => navigate("/acceptable-use")}>Acceptable use</button><button onClick={() => navigate("/copyright")}>Copyright</button></nav>
        </footer>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </div>
    );
  }

  return (
    <div className="app-shell learner-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="learner-sidebar" aria-label="Primary navigation">
        <button className="brand learner-brand" onClick={() => navigate("/")} aria-label="Erudoza home">
          <span className="brand-mark" aria-hidden="true"><ErudozaMark /></span>
          <span><strong className="brand-wordmark">Erudoza</strong><small>Your daily dose of understanding.</small></span>
        </button>

        <nav className="learner-primary-nav">
          {sidebarNav.map(({ href, label, icon: Icon }) => (
            <button key={href} className={`nav-link ${pathname === href ? "is-active" : ""}`} onClick={() => navigate(href)}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
          {isPro && (
            <button className={`nav-link ${pathname === "/create" ? "is-active" : ""}`} onClick={() => navigate("/create")}>
              <Plus size={18} /><span>Create course</span>
            </button>
          )}
          {isOwner && (
            <button className={`nav-link owner-nav-link ${pathname.startsWith("/admin") ? "is-active" : ""}`} onClick={() => navigate("/admin")}>
              <ShieldCheck size={18} /><span>Control room</span>
            </button>
          )}
        </nav>

        {isPro ? (
          <section className="sidebar-courses" aria-labelledby="sidebar-courses-title">
            <div className="sidebar-heading-row"><span id="sidebar-courses-title">My courses</span><span>{courses.length}</span></div>
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
              {!courses.length && <p className="sidebar-empty-copy">Courses you create will appear here.</p>}
            </div>
          </section>
        ) : (
          <section className="sidebar-upgrade">
            <Sparkles size={18} />
            <strong>Create your own course</strong>
            <p>Create a private course for a specific learning goal.</p>
            <button className="button button-primary button-small" onClick={() => navigate("/pricing")}>Explore Pro</button>
          </section>
        )}

        <div className="learner-sidebar-footer">
          {isPro && outlineQuota && (
            <button className="quota-row" onClick={() => navigate("/pricing")}>
              <Crown size={15} /><span><strong>Erudoza Pro</strong><small>{outlineQuota.remaining == null ? "Owner course access" : `${outlineQuota.remaining} course credit${outlineQuota.remaining === 1 ? "" : "s"} remaining`}</small></span>
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
        <button className="mobile-account-trigger" type="button" onClick={accountDrawer.openDrawer} aria-expanded={accountDrawer.open} aria-haspopup="dialog">
          {user.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
          ) : <span className="avatar-fallback"><UserRound size={15} /></span>}
          <span>{isPro ? "Pro" : "Free"}</span>
          <ChevronDown size={15} />
        </button>
      </header>

      {accountDrawer.open && (
        <AppDrawer open={accountDrawer.open} onClose={accountDrawer.closeDrawer} labelledBy="account-drawer-title" size="compact" mobilePlacement="bottom" className="account-app-drawer">
          <section className="account-drawer">
            <header className="app-drawer-header">
              <div>
                <small>Learning account</small>
                <h2 id="account-drawer-title">{firstName}</h2>
                <p>{isPro ? "Erudoza Pro" : "Free learning account"}</p>
              </div>
              <button className="icon-button" type="button" onClick={accountDrawer.closeDrawer} aria-label="Close account menu"><X size={18} /></button>
            </header>
            <div className="account-drawer-actions">
              <button type="button" onClick={() => { accountDrawer.closeDrawer(); navigate("/profile"); }}><UserRound size={18} /><span><strong>View profile</strong><small>Badges, preferences, and privacy</small></span><ChevronRight size={17} /></button>
              {isOwner && <button type="button" onClick={() => { accountDrawer.closeDrawer(); navigate("/admin"); }}><ShieldCheck size={18} /><span><strong>Control room</strong><small>Usage, safety, and accounts</small></span><ChevronRight size={17} /></button>}
              <button type="button" onClick={toggle}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}<span><strong>{theme === "dark" ? "Light mode" : "Dark mode"}</strong><small>Change the interface theme</small></span></button>
              <button type="button" onClick={() => { accountDrawer.closeDrawer(); void signOut(); }}><LogOut size={18} /><span><strong>Sign out</strong><small>End this session</small></span></button>
            </div>
          </section>
        </AppDrawer>
      )}

      <main className="app-main" id="main-content" tabIndex={-1}>
        {account?.accountStatus === "suspended" && (
          <div className="account-suspended-banner" role="status">
            <ShieldCheck size={17} />
            <span><strong>Protected account features are paused.</strong> Contact <a href={`mailto:${SUPPORT_CONTACT}`}>{SUPPORT_CONTACT}</a> if you believe this is an error.</span>
          </div>
        )}
        {children}
      </main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {primaryNav.slice(0, 2).map(({ href, label, icon: Icon }) => (
          <button key={href} className={pathname === href ? "is-active" : ""} onClick={() => navigate(href)}><Icon size={20} /><span>{label}</span></button>
        ))}
        <button className="mobile-create" onClick={() => navigate(isPro ? "/create" : "/pricing")} aria-label={isPro ? "Create course" : "Explore Pro"}><Plus size={22} /></button>
        {primaryNav.slice(2).map(({ href, label, icon: Icon }) => (
          <button key={href} className={pathname === href ? "is-active" : ""} onClick={() => navigate(href)}><Icon size={20} /><span>{label}</span></button>
        ))}
      </nav>
      {account?.legalAcceptanceRequired && !isLegalPage && <LegalConsentModal />}
    </div>
  );
}
