"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  ChevronDown,
  ChevronRight,
  Compass,
  Crown,
  Home,
  LifeBuoy,
  LogOut,
  Moon,
  Plus,
  Search,
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
import MarketingFooter from "@/components/marketing/MarketingFooter";
import MarketingNavigation from "@/components/marketing/MarketingNavigation";
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
  const { user, account, isOwner, isPro, signOut, loading: authLoading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [courseQuery, setCourseQuery] = useState("");
  const [mobileShell, setMobileShell] = useState(false);
  const coursesDrawer = useAppDrawer("course-switcher");
  const accountDrawer = useAppDrawer("account-menu");
  const coursesTriggerRef = useRef<HTMLButtonElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const syncShell = () => setMobileShell(media.matches);
    syncShell();
    media.addEventListener("change", syncShell);
    return () => media.removeEventListener("change", syncShell);
  }, []);

  const refreshCourses = useCallback(async () => {
    if (!user || !isPro) {
      setCourses([]);
      setCoursesLoading(false);
      return;
    }
    setCoursesLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/courses?scope=mine", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Courses could not be loaded.");
      const data = await response.json() as { courses: Course[] };
      setCourses(data.courses);
    } finally {
      window.clearTimeout(timeout);
      setCoursesLoading(false);
    }
  }, [isPro, user]);

  useEffect(() => {
    const load = async () => {
      try {
        await refreshCourses();
      } catch { /* Preserve the last known course list during transient failures. */ }
    };
    void load();
    const onCoursesChanged = () => { void load(); };
    window.addEventListener("erudoza:courses-changed", onCoursesChanged);
    return () => {
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
  const visibleCourses = useMemo(() => {
    const normalized = courseQuery.trim().toLowerCase();
    if (!normalized) return courses;
    return courses.filter((course) => [course.topic, course.category, course.outcome, course.mission]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalized)));
  }, [courseQuery, courses]);

  const navigate = (href: string) => router.push(href);
  const isLegalPage = ["/terms", "/privacy", "/acceptable-use"].includes(pathname);

  if (authLoading) {
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
        <MarketingNavigation theme={theme} onToggleTheme={toggle} onSignIn={() => setShowAuth(true)} />
        <main className="public-main" id="main-content" tabIndex={-1}>{children}</main>
        <MarketingFooter />
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </div>
    );
  }

  return (
    <div className="app-shell learner-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="learning-header">
        <Link className="brand learning-header-brand" href="/" aria-label="Erudoza home">
          <span className="brand-mark" aria-hidden="true"><ErudozaMark /></span>
          <span><strong className="brand-wordmark">Erudoza</strong><small>Learning workspace</small></span>
        </Link>

        <nav className="learning-header-nav" aria-label="Primary navigation">
          {primaryNav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={pathname === href ? "is-active" : ""} aria-current={pathname === href ? "page" : undefined}>
              <Icon size={17} aria-hidden="true" /><span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="learning-header-actions">
          <div className="learning-menu-anchor learning-courses-anchor">
            <button
              ref={coursesTriggerRef}
              className={`learning-courses-trigger ${coursesDrawer.open || pathname.startsWith("/course/") ? "is-active" : ""}`}
              type="button"
              onClick={coursesDrawer.toggleDrawer}
              aria-expanded={coursesDrawer.open && !mobileShell}
              aria-controls="course-switcher-menu"
              aria-haspopup="dialog"
              aria-current={pathname.startsWith("/course/") ? "page" : undefined}
            >
              <BookOpen size={17} aria-hidden="true" />
              <span>My courses</span>
              {courses.length > 0 && <small>{courses.length > 9 ? "9+" : courses.length}</small>}
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            <HeaderPopover id="course-switcher-menu" open={coursesDrawer.open && !mobileShell} onClose={coursesDrawer.closeDrawer} labelledBy="course-switcher-menu-title" triggerRef={coursesTriggerRef} className="learning-courses-menu">
              <CourseSwitcherPanel
                headingId="course-switcher-menu-title"
                currentCourse={currentCourse}
                visibleCourses={visibleCourses}
                totalCourses={courses.length}
                coursesLoading={coursesLoading}
                courseQuery={courseQuery}
                setCourseQuery={setCourseQuery}
                isPro={isPro}
                onClose={coursesDrawer.closeDrawer}
              />
            </HeaderPopover>
          </div>
          {isPro && (
            <Link href="/create" className={`learning-create-link ${pathname === "/create" ? "is-active" : ""}`} aria-current={pathname === "/create" ? "page" : undefined}>
              <Plus size={17} aria-hidden="true" /><span>Create</span>
            </Link>
          )}
          <div className="learning-menu-anchor learning-account-anchor">
          <button
            ref={accountTriggerRef}
            className={`learning-account-trigger ${accountDrawer.open || pathname === "/profile" || pathname.startsWith("/admin") ? "is-active" : ""}`}
            type="button"
            onClick={accountDrawer.toggleDrawer}
            aria-expanded={accountDrawer.open && !mobileShell}
            aria-controls="account-menu-popover"
            aria-haspopup="dialog"
            aria-label={`Open account menu for ${firstName}`}
          >
            {user?.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : <span className="avatar-fallback"><UserRound size={16} /></span>}
            <span className="learning-account-copy"><strong>{firstName}</strong><small>{isPro ? "Pro account" : "Account"}</small></span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
            <HeaderPopover id="account-menu-popover" open={accountDrawer.open && !mobileShell} onClose={accountDrawer.closeDrawer} labelledBy="account-popover-title" triggerRef={accountTriggerRef} className="learning-account-menu">
              <AccountPanel
                headingId="account-popover-title"
                firstName={firstName}
                photoURL={user.photoURL}
                isPro={isPro}
                isOwner={isOwner}
                outlineQuota={outlineQuota}
                theme={theme}
                onClose={accountDrawer.closeDrawer}
                onOpenCourses={coursesDrawer.openDrawer}
                onNavigate={navigate}
                onToggleTheme={toggle}
                onSignOut={() => { accountDrawer.closeDrawer(); void signOut(); }}
              />
            </HeaderPopover>
          </div>
        </div>
      </header>

      <header className="learner-mobile-header">
        <button className="brand brand-mobile" onClick={() => navigate("/")} aria-label="Erudoza home">
          <span className="brand-mark" aria-hidden="true"><ErudozaMark /></span><strong className="brand-wordmark">Erudoza</strong>
        </button>
        <button className="mobile-account-trigger" type="button" onClick={accountDrawer.openDrawer} aria-expanded={accountDrawer.open} aria-controls="account-menu-drawer" aria-haspopup="dialog" aria-label={`Open account menu for ${firstName}, ${isPro ? "Erudoza Pro" : "free plan"}`}>
          {user.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
          ) : <span className="avatar-fallback"><UserRound size={15} /></span>}
          <span>{isPro ? "Pro" : "Free"}</span>
          <ChevronDown size={15} />
        </button>
      </header>

      {mobileShell && (
        <>
          <AppDrawer id="course-switcher-drawer" open={coursesDrawer.open} onClose={coursesDrawer.closeDrawer} labelledBy="course-switcher-title" size="wide" mobilePlacement="bottom" className="course-switcher-app-drawer">
            <CourseSwitcherPanel
              headingId="course-switcher-title"
              currentCourse={currentCourse}
              visibleCourses={visibleCourses}
              totalCourses={courses.length}
              coursesLoading={coursesLoading}
              courseQuery={courseQuery}
              setCourseQuery={setCourseQuery}
              isPro={isPro}
              onClose={coursesDrawer.closeDrawer}
            />
          </AppDrawer>
          <AppDrawer id="account-menu-drawer" open={accountDrawer.open} onClose={accountDrawer.closeDrawer} labelledBy="account-drawer-title" size="compact" mobilePlacement="bottom" className="account-app-drawer">
            <AccountPanel
              headingId="account-drawer-title"
              firstName={firstName}
              photoURL={user.photoURL}
              isPro={isPro}
              isOwner={isOwner}
              outlineQuota={outlineQuota}
              theme={theme}
              onClose={accountDrawer.closeDrawer}
              onOpenCourses={coursesDrawer.openDrawer}
              onNavigate={navigate}
              onToggleTheme={toggle}
              onSignOut={() => { accountDrawer.closeDrawer(); void signOut(); }}
            />
          </AppDrawer>
        </>
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
          <button key={href} className={pathname === href ? "is-active" : ""} onClick={() => navigate(href)} aria-current={pathname === href ? "page" : undefined}><Icon size={20} /><span>{label}</span></button>
        ))}
        <button className={`mobile-create ${pathname === (isPro ? "/create" : "/pricing") ? "is-active" : ""}`} onClick={() => navigate(isPro ? "/create" : "/pricing")} aria-label={isPro ? "Create course" : "Explore Pro"} aria-current={pathname === (isPro ? "/create" : "/pricing") ? "page" : undefined}><Plus size={22} /></button>
        {primaryNav.slice(2).map(({ href, label, icon: Icon }) => (
          <button key={href} className={pathname === href ? "is-active" : ""} onClick={() => navigate(href)} aria-current={pathname === href ? "page" : undefined}><Icon size={20} /><span>{label}</span></button>
        ))}
      </nav>
      {account?.legalAcceptanceRequired && !isLegalPage && <LegalConsentModal />}
    </div>
  );
}

function HeaderPopover({ id, open, onClose, labelledBy, triggerRef, className, children }: {
  id: string;
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  className: string;
  children: React.ReactNode;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) onClose();
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeFromOutside, true);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [onClose, open, triggerRef]);

  if (!open) return null;
  return <div ref={popoverRef} id={id} className={`learning-header-popover ${className}`} role="dialog" aria-labelledby={labelledBy}>{children}</div>;
}

function CourseSwitcherPanel({ headingId, currentCourse, visibleCourses, totalCourses, coursesLoading, courseQuery, setCourseQuery, isPro, onClose }: {
  headingId: string;
  currentCourse?: Course;
  visibleCourses: Course[];
  totalCourses: number;
  coursesLoading: boolean;
  courseQuery: string;
  setCourseQuery: (query: string) => void;
  isPro: boolean;
  onClose: () => void;
}) {
  return (
    <section className="course-switcher-drawer">
      <header className="app-drawer-header">
        <div><small>Your learning space</small><h2 id={headingId}>My courses</h2><p>Switch courses without losing your place.</p></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close course menu"><X size={18} /></button>
      </header>
      <div className="course-switcher-toolbar">
        <label className="course-switcher-search"><Search size={17} /><span className="sr-only">Search my courses</span><input value={courseQuery} onChange={(event) => setCourseQuery(event.target.value)} placeholder="Search your courses" /></label>
        {isPro && <Link className="button button-primary button-small" href="/create" onClick={onClose}><Plus size={15} /> Create</Link>}
      </div>
      <div className="app-drawer-body course-switcher-body">
        {currentCourse && visibleCourses.includes(currentCourse) && (
          <section className="course-switcher-group" aria-label="Current course">
            <div className="drawer-section-heading"><span>Current course</span><small>In progress</small></div>
            <CourseSwitcherLink course={currentCourse} current onNavigate={onClose} />
          </section>
        )}
        <section className="course-switcher-group" aria-label={currentCourse ? "More courses" : "All courses"}>
          <div className="drawer-section-heading"><span>{currentCourse ? "More courses" : "All courses"}</span><small>{visibleCourses.length} shown</small></div>
          <div className="course-switcher-list">
            {coursesLoading && totalCourses === 0 && Array.from({ length: 4 }, (_, index) => <span className="course-switcher-skeleton" key={index} aria-hidden="true"><i /><b /></span>)}
            {visibleCourses.filter((course) => course !== currentCourse).map((course) => <CourseSwitcherLink key={course.id ?? course.courseId ?? course.topic} course={course} onNavigate={onClose} />)}
            {!coursesLoading && isPro && totalCourses > 0 && visibleCourses.length === 0 && <div className="course-switcher-empty"><Search size={20} /><strong>No matching courses</strong><p>Try a shorter title or clear your search.</p><button className="button button-quiet button-small" type="button" onClick={() => setCourseQuery("")}>Clear search</button></div>}
            {!coursesLoading && isPro && totalCourses === 0 && <div className="course-switcher-empty"><BookOpen size={20} /><strong>Your course shelf is ready</strong><p>Create a focused course and it will appear here.</p><Link className="button button-primary button-small" href="/create" onClick={onClose}>Create a course</Link></div>}
            {!isPro && <div className="course-switcher-empty"><Sparkles size={20} /><strong>Create courses around your goals</strong><p>Erudoza Pro lets you build private, adaptive learning paths.</p><Link className="button button-primary button-small" href="/pricing" onClick={onClose}>Explore Pro</Link></div>}
          </div>
        </section>
      </div>
      <footer className="app-drawer-footer course-switcher-footer"><Link className="button button-secondary" href="/library" onClick={onClose}>Explore the library <ArrowRight size={15} /></Link></footer>
    </section>
  );
}

function AccountPanel({ headingId, firstName, photoURL, isPro, isOwner, outlineQuota, theme, onClose, onOpenCourses, onNavigate, onToggleTheme, onSignOut }: {
  headingId: string;
  firstName: string;
  photoURL: string | null;
  isPro: boolean;
  isOwner: boolean;
  outlineQuota: { remaining: number | null } | undefined;
  theme: "light" | "dark";
  onClose: () => void;
  onOpenCourses: () => void;
  onNavigate: (href: string) => void;
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  const goTo = (href: string) => { onClose(); onNavigate(href); };
  return (
    <section className="account-drawer">
      <header className="app-drawer-header">
        <div className="account-drawer-identity">
          {photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoURL} alt="" referrerPolicy="no-referrer" />
          ) : <span className="avatar-fallback"><UserRound size={18} /></span>}
          <span><small>Learning account</small><h2 id={headingId}>{firstName}</h2><p>{isPro ? "Erudoza Pro" : "Free learning account"}</p></span>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close account menu"><X size={18} /></button>
      </header>
      {isPro && outlineQuota && <button className="account-plan-summary" type="button" onClick={() => goTo("/pricing")}><span><Crown size={16} />Erudoza Pro</span><strong>{outlineQuota.remaining == null ? "Owner course access" : `${outlineQuota.remaining} course credit${outlineQuota.remaining === 1 ? "" : "s"} remaining`}</strong><ChevronRight size={17} /></button>}
      <div className="account-drawer-actions">
        <button type="button" onClick={onOpenCourses}><BookOpen size={18} /><span><strong>My courses</strong><small>Open private and published courses</small></span><ChevronRight size={17} /></button>
        <button type="button" onClick={() => goTo("/profile")}><UserRound size={18} /><span><strong>View profile</strong><small>Badges, preferences, and privacy</small></span><ChevronRight size={17} /></button>
        {isOwner && <button type="button" onClick={() => goTo("/admin")}><ShieldCheck size={18} /><span><strong>Control room</strong><small>Usage, safety, and accounts</small></span><ChevronRight size={17} /></button>}
        <button type="button" onClick={() => goTo("/support")}><LifeBuoy size={18} /><span><strong>Support</strong><small>Help, privacy, and account questions</small></span><ChevronRight size={17} /></button>
        <button type="button" onClick={onToggleTheme}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}<span><strong>{theme === "dark" ? "Light mode" : "Dark mode"}</strong><small>Change the interface theme</small></span></button>
        <button type="button" onClick={onSignOut}><LogOut size={18} /><span><strong>Sign out</strong><small>End this session</small></span></button>
      </div>
    </section>
  );
}

function CourseSwitcherLink({ course, current = false, onNavigate }: { course: Course; current?: boolean; onNavigate: () => void }) {
  const id = course.id ?? course.courseId;
  const lessons = course.modules.reduce((total, courseModule) => total + courseModule.lessons.length, 0);
  const href = `/course/${encodeURIComponent(course.topic)}${id ? `?id=${id}` : ""}`;
  return (
    <Link className={`course-switcher-course ${current ? "is-current" : ""}`} href={href} onClick={onNavigate} aria-current={current ? "page" : undefined}>
      <span className="course-switcher-icon"><BookOpen size={17} /></span>
      <span className="course-switcher-copy"><strong>{course.topic}</strong><small>{lessons} {lessons === 1 ? "lesson" : "lessons"} &middot; {course.isPublic ? "Published" : "Private"}</small></span>
      {current ? <span className="course-current-label">Current</span> : <ChevronRight size={17} />}
    </Link>
  );
}
