"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  ChevronRight,
  CirclePlay,
  Command,
  Compass,
  Crown,
  Home,
  LifeBuoy,
  LogOut,
  Plus,
  Search,
  Sparkles,
  ShieldCheck,
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
import CommandPalette, { type CommandPaletteItem } from "@/components/CommandPalette";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import type { Course } from "@/lib/course-types";
import { matchesSearchQuery } from "@/lib/search";

interface AppShellProps {
  children: React.ReactNode;
  activeTopic?: string;
  activeLessonId?: string;
  activeCourseId?: string | null;
  activeCourse?: Course;
}

const primaryNav = [
  { href: "/", label: "Today", icon: Home },
  { href: "/library", label: "Explore", icon: Compass },
  { href: "/review", label: "Review", icon: CalendarCheck2 },
  { href: "/progress", label: "Progress", icon: TrendingUp },
];

export default function AppShell({ children, activeTopic, activeLessonId, activeCourseId, activeCourse }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { user, account, isOwner, isPro, signOut, loading: authLoading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [courseQuery, setCourseQuery] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const coursesDrawer = useAppDrawer("course-switcher");
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const commandTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileAccountTriggerRef = useRef<HTMLButtonElement>(null);
  const commandReturnFocusRef = useRef<HTMLElement | null>(null);

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
    () => activeCourse ?? courses.find((course) => (course.id ?? course.courseId) === activeCourseId || course.topic === activeTopic),
    [activeCourse, activeCourseId, activeTopic, courses],
  );
  const visibleCourses = useMemo(() => {
    return courses.filter((course) => matchesSearchQuery(courseQuery, [
      course.topic,
      course.category,
      course.outcome,
      course.mission,
      course.level,
      course.isPublic ? "published public" : "private draft",
      ...course.modules.flatMap((courseModule) => [
        courseModule.title,
        courseModule.description,
        courseModule.objective,
        ...courseModule.lessons.flatMap((lesson) => [lesson.title, lesson.concept, lesson.objective]),
      ]),
    ]));
  }, [courseQuery, courses]);
  const currentSection = pathname.startsWith("/course/")
    ? activeTopic ?? "Course"
    : primaryNav.find((item) => item.href === pathname)?.label
      ?? (pathname.startsWith("/admin") ? "Control room" : pathname === "/profile" ? "Profile" : pathname === "/create" ? "Create" : "Learning workspace");

  const commandItems = useMemo<CommandPaletteItem[]>(() => [
    ...primaryNav.map((item) => ({
      id: `navigate-${item.href}`,
      section: "Navigate" as const,
      label: item.label,
      description: item.href === "/" ? "Continue today’s learning" : item.href === "/library" ? "Discover published courses" : item.href === "/review" ? "Reinforce knowledge when it is due" : "See momentum and evidence",
      href: item.href,
      keywords: "page destination navigation",
      icon: item.icon,
    })),
    {
      id: "navigate-create",
      section: "Navigate" as const,
      label: isPro ? "Create a course" : "Explore Erudoza Pro",
      description: isPro ? "Build a private course around an outcome" : "See private course creation and plan details",
      href: isPro ? "/create" : "/pricing",
      keywords: "new add build course pricing pro",
      icon: isPro ? Plus : Sparkles,
    },
    ...(currentCourse ? (() => {
      const id = currentCourse.id ?? currentCourse.courseId ?? activeCourseId;
      const courseHref = `/course/${encodeURIComponent(currentCourse.topic)}${id ? `?id=${id}` : ""}`;
      const generatedLessonIds = currentCourse.generatedLessonIds;
      return [{
        id: `current-course-${id ?? currentCourse.topic}`,
        section: "Current course" as const,
        label: currentCourse.topic,
        description: "Open the course overview",
        href: courseHref,
        keywords: `overview outline ${currentCourse.category ?? ""}`,
        icon: BookOpen,
      }, ...currentCourse.modules.flatMap((courseModule, moduleIndex) => courseModule.lessons
        .map((lesson, lessonIndex) => ({ lesson, lessonId: `${moduleIndex}-${lessonIndex}` }))
        .filter(({ lessonId }) => !generatedLessonIds || generatedLessonIds.includes(lessonId))
        .map(({ lesson, lessonId }, lessonIndex) => ({
          id: `current-lesson-${id ?? currentCourse.topic}-${lessonId}`,
          section: "Current course" as const,
          label: lesson.title,
          description: lessonId === activeLessonId ? `${courseModule.title} · Current lesson` : `${courseModule.title} · Lesson ${lessonIndex + 1}`,
          href: `/course/${encodeURIComponent(currentCourse.topic)}/lesson/${lessonId}${id ? `?id=${id}` : ""}`,
          keywords: `${lesson.concept} ${lesson.objective ?? ""} lesson module`,
          icon: CirclePlay,
        })))];
    })() : []),
    ...courses.filter((course) => {
      const id = course.id ?? course.courseId;
      const currentId = currentCourse?.id ?? currentCourse?.courseId ?? activeCourseId;
      return currentId ? id !== currentId : course.topic !== currentCourse?.topic;
    }).map((course) => {
      const id = course.id ?? course.courseId;
      return {
        id: `course-${id ?? course.topic}`,
        section: "Courses" as const,
        label: course.topic,
        description: course.outcome || course.mission || `${course.modules.length} course module${course.modules.length === 1 ? "" : "s"}`,
        href: `/course/${encodeURIComponent(course.topic)}${id ? `?id=${id}` : ""}`,
        keywords: `${course.category ?? ""} ${course.isPublic ? "published" : "private"}`,
        icon: BookOpen,
      };
    }),
    ...(isPro && outlineQuota ? [{
      id: "account-plan",
      section: "Account" as const,
      label: "Erudoza Pro",
      description: outlineQuota.remaining == null ? "Owner course access" : `${outlineQuota.remaining} course credit${outlineQuota.remaining === 1 ? "" : "s"} remaining`,
      href: "/pricing",
      keywords: "plan subscription quota pricing credits",
      icon: Crown,
    }] : []),
    {
      id: "account-courses",
      section: "Account" as const,
      label: "My courses",
      description: "Open private and published courses",
      action: "open-courses" as const,
      keywords: "owned learning shelf switch",
      icon: BookOpen,
    },
    {
      id: "account-profile",
      section: "Account" as const,
      label: "Learning profile",
      description: "Badges, preferences, and privacy",
      href: "/profile",
      keywords: "account settings badges privacy",
      icon: UserRound,
    },
    {
      id: "account-support",
      section: "Account" as const,
      label: "Support",
      description: "Help, policies, and account questions",
      href: "/support",
      keywords: "help contact documentation",
      icon: LifeBuoy,
    },
    ...(isOwner ? [{
      id: "account-admin",
      section: "Account" as const,
      label: "Control room",
      description: "Usage, safety, publishing, and accounts",
      href: "/admin",
      keywords: "owner admin operations",
      icon: ShieldCheck,
    }, {
      id: "account-command-center",
      section: "Account" as const,
      label: "Agent command center",
      description: "Tickets, approvals, audit, and operational controls",
      href: "/admin/command-center",
      keywords: "owner admin support reports approvals audit operations",
      icon: Command,
    }] : []),
    {
      id: "account-sign-out",
      section: "Account" as const,
      label: "Sign out",
      description: "End this session",
      action: "sign-out" as const,
      keywords: "log out logout exit account",
      icon: LogOut,
    },
  ], [activeCourseId, activeLessonId, courses, currentCourse, isOwner, isPro, outlineQuota]);

  const navigate = (href: string) => router.push(href);
  const isLegalPage = ["/terms", "/privacy", "/acceptable-use"].includes(pathname);

  const openCommand = useCallback((trigger?: HTMLElement | null) => {
    commandReturnFocusRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : commandTriggerRef.current);
    coursesDrawer.closeDrawer();
    setCommandOpen(true);
  }, [coursesDrawer]);

  const closeCommand = useCallback(() => {
    setCommandOpen(false);
    requestAnimationFrame(() => commandReturnFocusRef.current?.focus());
  }, []);

  const selectCommand = (item: CommandPaletteItem) => {
    setCommandOpen(false);
    if (item.href) {
      navigate(item.href);
      return;
    }
    if (item.action === "open-courses") {
      requestAnimationFrame(coursesDrawer.openDrawer);
    } else if (item.action === "sign-out") {
      void signOut();
    }
  };

  useEffect(() => {
    if (!user) return;
    const openFromKeyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      if (commandOpen) closeCommand();
      else openCommand(commandTriggerRef.current);
    };
    document.addEventListener("keydown", openFromKeyboard);
    return () => document.removeEventListener("keydown", openFromKeyboard);
  }, [closeCommand, commandOpen, openCommand, user]);

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

        <div className="learning-command-launch">
          <button ref={commandTriggerRef} className="learning-command-trigger" type="button" onClick={() => openCommand(commandTriggerRef.current)} aria-haspopup="dialog" aria-expanded={commandOpen} aria-controls="command-palette">
            <span className="learning-command-icon"><Search size={18} aria-hidden="true" /></span>
            <span className="learning-command-copy"><strong>Search or jump anywhere</strong><small>{currentSection} · Pages, courses, and account actions</small></span>
            <kbd>Ctrl K</kbd>
          </button>
        </div>

        <div className="learning-header-actions">
          <button
            ref={accountTriggerRef}
            className={`learning-account-trigger ${commandOpen || pathname === "/profile" || pathname.startsWith("/admin") ? "is-active" : ""}`}
            type="button"
            onClick={() => openCommand(accountTriggerRef.current)}
            aria-expanded={commandOpen}
            aria-controls="command-palette"
            aria-haspopup="dialog"
            aria-label={`Open Command Center for ${firstName}`}
          >
            {user?.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : <span className="avatar-fallback"><UserRound size={16} /></span>}
            <span className="learning-account-copy"><strong>{firstName}</strong><small>{isPro ? "Pro account" : "Account"}</small></span>
            <Command className="command-indicator" size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      <header className="learner-mobile-header">
        <button className="brand brand-mobile" onClick={() => navigate("/")} aria-label="Erudoza home">
          <span className="brand-mark" aria-hidden="true"><ErudozaMark /></span><strong className="brand-wordmark">Erudoza</strong>
        </button>
        <div className="learner-mobile-actions">
          <button ref={mobileAccountTriggerRef} className="mobile-account-trigger" type="button" onClick={() => openCommand(mobileAccountTriggerRef.current)} aria-expanded={commandOpen} aria-controls="command-palette" aria-haspopup="dialog" aria-label={`Open Command Center for ${firstName}, ${isPro ? "Erudoza Pro" : "free plan"}`}>
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : <span className="avatar-fallback"><UserRound size={15} /></span>}
            <span>{isPro ? "Pro" : "Free"}</span>
            <Command className="command-indicator" size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      <AppDrawer id="course-switcher-drawer" open={coursesDrawer.open} onClose={coursesDrawer.closeDrawer} labelledBy="course-switcher-title" size="wide" placement="end" mobilePlacement="bottom" className="course-switcher-app-drawer">
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

      {commandOpen && <CommandPalette open items={commandItems} theme={theme} onClose={closeCommand} onSelect={selectCommand} onToggleTheme={toggle} />}

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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const clearSearch = () => {
    setCourseQuery("");
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  return (
    <section className="course-switcher-drawer">
      <header className="app-drawer-header">
        <div><small>Your learning space</small><h2 id={headingId}>My courses</h2><p>Switch courses without losing your place.</p></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close course menu"><X size={18} /></button>
      </header>
      <div className="course-switcher-toolbar">
        <label className="course-switcher-search"><Search size={17} /><span className="sr-only">Search my courses</span><input ref={searchInputRef} type="search" value={courseQuery} onChange={(event) => setCourseQuery(event.target.value)} placeholder="Search titles, lessons, or skills" autoComplete="off" /></label>
        {isPro && <Link className="button button-primary button-small" href="/create" onClick={onClose}><Plus size={15} /> Create</Link>}
      </div>
      <div className="app-drawer-body course-switcher-body">
        <p className="sr-only" role="status">{visibleCourses.length} {visibleCourses.length === 1 ? "course" : "courses"} found</p>
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
            {!coursesLoading && isPro && totalCourses > 0 && visibleCourses.length === 0 && <div className="course-switcher-empty"><Search size={20} /><strong>No matching courses</strong><p>Try a shorter title, lesson, or skill.</p><button className="button button-quiet button-small" type="button" onClick={clearSearch}>Clear search</button></div>}
            {!coursesLoading && isPro && totalCourses === 0 && <div className="course-switcher-empty"><BookOpen size={20} /><strong>Your course shelf is ready</strong><p>Create a focused course and it will appear here.</p><Link className="button button-primary button-small" href="/create" onClick={onClose}>Create a course</Link></div>}
            {!isPro && <div className="course-switcher-empty"><Sparkles size={20} /><strong>Create courses around your goals</strong><p>Erudoza Pro lets you build private, adaptive learning paths.</p><Link className="button button-primary button-small" href="/pricing" onClick={onClose}>Explore Pro</Link></div>}
          </div>
        </section>
      </div>
      <footer className="app-drawer-footer course-switcher-footer"><Link className="button button-secondary" href="/library" onClick={onClose}>Explore the library <ArrowRight size={15} /></Link></footer>
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
