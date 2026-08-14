"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  ChevronRight,
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
import FilosageMark from "@/components/FilosageMark";
import AuthModal from "@/components/AuthModal";
import AppDrawer, { useAppDrawer } from "@/components/AppDrawer";
import LegalConsentModal from "@/components/LegalConsentModal";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import MarketingNavigation from "@/components/marketing/MarketingNavigation";
import CommandPalette, { type CommandPaletteItem } from "@/components/CommandPalette";
import CourseBanner from "@/components/CourseBanner";
import { hashCourseIdentity } from "@/components/CourseArtwork";
import SupportCenter from "@/components/support/SupportCenter";
import UserAvatar from "@/components/UserAvatar";
import EnvironmentPill from "@/components/EnvironmentPill";
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

export default function AppShell({ children, activeTopic, activeCourseId, activeCourse }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { user, account, isOwner, canCreateCourses, signOut, loading: authLoading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [courseQuery, setCourseQuery] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const coursesDrawer = useAppDrawer("course-switcher");
  const supportDrawer = useAppDrawer("global-support-center");
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const commandTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileAccountTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileCommandTriggerRef = useRef<HTMLButtonElement>(null);
  const commandReturnFocusRef = useRef<HTMLElement | null>(null);

  const refreshCourses = useCallback(async () => {
    if (!user) {
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
  }, [user]);

  useEffect(() => {
    const load = async () => {
      try {
        await refreshCourses();
      } catch { /* Preserve the last known course list during transient failures. */ }
    };
    void load();
    const onCoursesChanged = () => { void load(); };
    window.addEventListener("filosage:courses-changed", onCoursesChanged);
    return () => {
      window.removeEventListener("filosage:courses-changed", onCoursesChanged);
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
      ?? (pathname.startsWith("/admin") ? "Control room" : pathname === "/profile" ? "Profile" : pathname === "/create" ? "Create" : pathname.startsWith("/support") ? "Support" : "Learning workspace");

  const commandItems = useMemo<CommandPaletteItem[]>(() => [
    ...primaryNav.map((item) => ({
      id: `navigate-${item.href}`,
      section: "Navigate" as const,
      label: item.label,
      description: item.href === "/" ? "Continue today’s learning" : item.href === "/library" ? "Discover published courses" : item.href === "/review" ? "Reinforce knowledge when it is due" : "See momentum and evidence",
      href: item.href,
      keywords: "page destination navigation",
      icon: item.icon,
      tone: item.href === "/" ? "teal" as const : item.href === "/library" ? "blue" as const : item.href === "/review" ? "coral" as const : "gold" as const,
    })),
    {
      id: "navigate-create",
      section: "Navigate" as const,
      label: canCreateCourses ? "Create a course" : "Compare memberships",
      description: canCreateCourses ? "Build a private course around an outcome" : "See private course creation and plan details",
      href: canCreateCourses ? "/create" : "/pricing",
      keywords: "new add build course pricing pro",
      icon: canCreateCourses ? Plus : Sparkles,
      tone: "coral" as const,
    },
    ...(account?.plan !== "free" && outlineQuota ? [{
      id: "account-plan",
      section: "Account" as const,
      label: account?.plan === "plus" ? "Filosage Plus" : "Filosage Pro",
      description: outlineQuota.remaining == null ? "Owner course access" : `${outlineQuota.remaining} course credit${outlineQuota.remaining === 1 ? "" : "s"} remaining`,
      href: "/pricing",
      keywords: "plan subscription quota pricing credits",
      icon: Crown,
      tone: "gold" as const,
    }] : []),
    {
      id: "account-courses",
      section: "Account" as const,
      label: "My courses",
      description: "Open private and published courses",
      action: "open-courses" as const,
      keywords: "owned learning shelf switch",
      icon: BookOpen,
      tone: "blue" as const,
    },
    {
      id: "account-profile",
      section: "Account" as const,
      label: "Learning profile",
      description: "Badges, preferences, and privacy",
      href: "/profile",
      keywords: "account settings badges privacy",
      icon: UserRound,
      tone: "teal" as const,
    },
    {
      id: "account-support",
      section: "Account" as const,
      label: "Support",
      description: "Help, policies, and account questions",
      href: "/support",
      keywords: "help contact documentation",
      icon: LifeBuoy,
      tone: "blue" as const,
    },
    ...(isOwner ? [{
      id: "account-admin",
      section: "Account" as const,
      label: "Control room",
      description: "Usage, safety, publishing, and accounts",
      href: "/admin",
      keywords: "owner admin operations",
      icon: ShieldCheck,
      tone: "gold" as const,
    }, {
      id: "account-command-center",
      section: "Account" as const,
      label: "Agent command center",
      description: "Tickets, approvals, audit, and operational controls",
      href: "/admin/command-center",
      keywords: "owner admin support reports approvals audit operations",
      icon: Command,
      tone: "coral" as const,
    }] : []),
    {
      id: "account-sign-out",
      section: "Account" as const,
      label: "Sign out",
      description: "End this session",
      action: "sign-out" as const,
      keywords: "log out logout exit account",
      icon: LogOut,
      tone: "slate" as const,
    },
  ], [account?.plan, canCreateCourses, isOwner, outlineQuota]);

  const navigate = (href: string) => router.push(href);
  const isLegalPage = ["/terms", "/privacy", "/acceptable-use"].includes(pathname);

  const openCommand = useCallback((trigger?: HTMLElement | null) => {
    commandReturnFocusRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : commandTriggerRef.current);
    coursesDrawer.closeDrawer();
    supportDrawer.closeDrawer();
    setCommandOpen(true);
  }, [coursesDrawer, supportDrawer]);

  const closeCommand = useCallback(() => {
    setCommandOpen(false);
    requestAnimationFrame(() => commandReturnFocusRef.current?.focus());
  }, []);

  const signOutToLanding = useCallback(async () => {
    await signOut();
    window.location.replace("/");
  }, [signOut]);

  const selectCommand = (item: CommandPaletteItem) => {
    setCommandOpen(false);
    if (item.href) {
      navigate(item.href);
      return;
    }
    if (item.action === "open-courses") {
      requestAnimationFrame(coursesDrawer.openDrawer);
    } else if (item.action === "sign-out") {
      void signOutToLanding();
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
      <div className="auth-boot-shell" aria-busy="true" aria-label="Restoring your Filosage session">
        <span className="brand-mark" aria-hidden="true"><FilosageMark /></span>
        <strong className="brand-wordmark"><span>Filo</span><span>sage</span></strong>
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
        <SupportCenter onRequestSignIn={() => setShowAuth(true)} />
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </div>
    );
  }

  return (
    <div className="app-shell learner-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="learning-header">
        <Link className="brand learning-header-brand" href="/" aria-label="Filosage home">
          <span className="brand-mark" aria-hidden="true"><FilosageMark className="is-inverse" /></span>
          <span><strong className="brand-wordmark"><span>Filo</span><span>sage</span></strong><small>Learning workspace</small></span>
        </Link>

        <div className="learning-command-launch">
          <button ref={commandTriggerRef} className="learning-command-trigger" type="button" onClick={() => openCommand(commandTriggerRef.current)} aria-haspopup="dialog" aria-expanded={commandOpen} aria-controls="command-palette">
            <span className="learning-command-icon"><Search size={18} aria-hidden="true" /></span>
            <span className="learning-command-copy"><strong>Search or jump anywhere</strong><small>{currentSection} · Pages and account actions</small></span>
            <kbd>Ctrl K</kbd>
          </button>
        </div>

        <div className="learning-header-actions">
          <EnvironmentPill />
          <button
            ref={accountTriggerRef}
            className={`learning-account-trigger ${coursesDrawer.open ? "is-active" : ""}`}
            type="button"
            onClick={coursesDrawer.openDrawer}
            aria-expanded={coursesDrawer.open}
            aria-controls="course-switcher-drawer"
            aria-haspopup="dialog"
            aria-label={`Open My Courses for ${firstName}`}
          >
            <UserAvatar photoURL={user?.photoURL} size={32} fallback={<span className="avatar-fallback"><UserRound size={16} /></span>} />
            <span className="learning-account-copy"><strong>{firstName}</strong><small>{account?.plan === "pro" ? "Pro account" : account?.plan === "plus" ? "Plus account" : "Account"}</small></span>
            <BookOpen className="command-indicator" size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      <header className="learner-mobile-header">
        <Link className="brand brand-mobile" href="/" aria-label="Filosage home">
          <span className="brand-mark" aria-hidden="true"><FilosageMark className="is-inverse" /></span><strong className="brand-wordmark"><span>Filo</span><span>sage</span></strong>
        </Link>
        <div className="learner-mobile-actions">
          <EnvironmentPill />
          <button ref={mobileAccountTriggerRef} className="mobile-account-trigger" type="button" onClick={coursesDrawer.openDrawer} aria-expanded={coursesDrawer.open} aria-controls="course-switcher-drawer" aria-haspopup="dialog" aria-label={`Open My Courses for ${firstName}, ${account?.plan === "pro" ? "Filosage Pro" : account?.plan === "plus" ? "Filosage Plus" : "free plan"}`}>
            <UserAvatar photoURL={user.photoURL} size={30} fallback={<span className="avatar-fallback"><UserRound size={15} /></span>} />
            <span>{account?.plan === "pro" ? "Pro" : account?.plan === "plus" ? "Plus" : "Free"}</span>
            <BookOpen className="command-indicator" size={15} aria-hidden="true" />
          </button>
          <button ref={mobileCommandTriggerRef} className="mobile-command-trigger" type="button" onClick={() => openCommand(mobileCommandTriggerRef.current)} aria-expanded={commandOpen} aria-controls="command-palette" aria-haspopup="dialog" aria-label="Open Command Center"><Command size={17} aria-hidden="true" /></button>
        </div>
      </header>

      <AppDrawer id="course-switcher-drawer" open={coursesDrawer.open} onClose={coursesDrawer.closeDrawer} labelledBy="course-switcher-title" size="wide" placement="end" mobilePlacement="bottom" desktopPresentation="floating" draggable dragLabel="My courses window" className="course-switcher-app-drawer">
            <CourseSwitcherPanel
              headingId="course-switcher-title"
              currentCourse={currentCourse}
              visibleCourses={visibleCourses}
              totalCourses={courses.length}
              coursesLoading={coursesLoading}
              courseQuery={courseQuery}
              setCourseQuery={setCourseQuery}
              canCreateCourses={canCreateCourses}
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
          <Link key={href} className={pathname === href ? "is-active" : ""} href={href} aria-current={pathname === href ? "page" : undefined}><Icon size={20} aria-hidden="true" /><span>{label}</span></Link>
        ))}
        <Link className={`mobile-create ${pathname === (canCreateCourses ? "/create" : "/pricing") ? "is-active" : ""}`} href={canCreateCourses ? "/create" : "/pricing"} aria-label={canCreateCourses ? "Create course" : "Compare memberships"} aria-current={pathname === (canCreateCourses ? "/create" : "/pricing") ? "page" : undefined}><Plus size={22} aria-hidden="true" /></Link>
        {primaryNav.slice(2).map(({ href, label, icon: Icon }) => (
          <Link key={href} className={pathname === href ? "is-active" : ""} href={href} aria-current={pathname === href ? "page" : undefined}><Icon size={20} aria-hidden="true" /><span>{label}</span></Link>
        ))}
      </nav>
      <SupportCenter onBeforeOpen={() => setCommandOpen(false)} />
      {account?.legalAcceptanceRequired && !isLegalPage && <LegalConsentModal />}
    </div>
  );
}

function CourseSwitcherPanel({ headingId, currentCourse, visibleCourses, totalCourses, coursesLoading, courseQuery, setCourseQuery, canCreateCourses, onClose }: {
  headingId: string;
  currentCourse?: Course;
  visibleCourses: Course[];
  totalCourses: number;
  coursesLoading: boolean;
  courseQuery: string;
  setCourseQuery: (query: string) => void;
  canCreateCourses: boolean;
  onClose: () => void;
}) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const courseIdentity = (course: Course) => course.id ?? course.courseId ?? course.topic;
  const currentCourseIdentity = currentCourse ? courseIdentity(currentCourse) : null;
  const currentCourseVisible = currentCourse
    ? visibleCourses.some((course) => courseIdentity(course) === currentCourseIdentity)
    : false;
  const moreCourses = visibleCourses.filter((course) => courseIdentity(course) !== currentCourseIdentity);
  const clearSearch = () => {
    setCourseQuery("");
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  return (
    <section className="course-switcher-drawer">
      <header className="app-drawer-header">
        <div><h2 id={headingId}>My courses</h2><p>Switch courses without losing your place.</p></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close course menu"><X size={18} /></button>
      </header>
      <div className="course-switcher-toolbar">
        <label className="course-switcher-search"><Search size={17} /><span className="sr-only">Search my courses</span><input ref={searchInputRef} type="search" value={courseQuery} onChange={(event) => setCourseQuery(event.target.value)} placeholder="Search titles, lessons, or skills" autoComplete="off" /></label>
        {canCreateCourses && <Link className="button button-primary button-small" href="/create" onClick={onClose}><Plus size={15} /> Create</Link>}
      </div>
      <div className="app-drawer-body course-switcher-body">
        <p className="sr-only" role="status">{visibleCourses.length} {visibleCourses.length === 1 ? "course" : "courses"} found</p>
        {currentCourse && currentCourseVisible && (
          <section className="course-switcher-group" aria-label="Current course">
            <div className="drawer-section-heading"><span>Current course</span><small>In progress</small></div>
            <CourseSwitcherLink course={currentCourse} current onNavigate={onClose} />
          </section>
        )}
        <section className="course-switcher-group" aria-label={currentCourse ? "More courses" : "All courses"}>
          <div className="drawer-section-heading"><span>{currentCourse ? "More courses" : "All courses"}</span><small>{moreCourses.length} shown</small></div>
          <div className="course-switcher-list">
            {coursesLoading && totalCourses === 0 && Array.from({ length: 4 }, (_, index) => <span className="course-switcher-skeleton" key={index} aria-hidden="true"><i /><b /></span>)}
            {moreCourses.map((course) => <CourseSwitcherLink key={courseIdentity(course)} course={course} onNavigate={onClose} />)}
            {!coursesLoading && totalCourses > 0 && visibleCourses.length === 0 && <div className="course-switcher-empty"><Search size={20} /><strong>No matching courses</strong><p>Try a shorter title, lesson, or skill.</p><button className="button button-quiet button-small" type="button" onClick={clearSearch}>Clear search</button></div>}
            {!coursesLoading && canCreateCourses && totalCourses === 0 && <div className="course-switcher-empty"><BookOpen size={20} /><strong>Your course shelf is ready</strong><p>Create a focused course and it will appear here.</p><Link className="button button-primary button-small" href="/create" onClick={onClose}>Create a course</Link></div>}
            {!coursesLoading && !canCreateCourses && totalCourses === 0 && <div className="course-switcher-empty"><Sparkles size={20} /><strong>Create courses around your goals</strong><p>Filosage Plus and Pro include private AI-assisted course creation with stated monthly limits.</p><Link className="button button-primary button-small" href="/pricing" onClick={onClose}>Compare plans</Link></div>}
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
  const paperTone = hashCourseIdentity(`${course.topic}|${course.category ?? ""}`) % 4;
  return (
    <Link className={`course-switcher-course course-switcher-paper-tone-${paperTone} ${current ? "is-current" : ""}`} href={href} onClick={onNavigate} aria-current={current ? "page" : undefined}>
      <CourseBanner course={course} variant="compact" />
      <span className="course-switcher-copy"><strong>{course.topic}</strong><small>{lessons} {lessons === 1 ? "lesson" : "lessons"} &middot; {course.isPublic ? "Published" : "Private"}</small></span>
      {current ? <span className="course-current-label">Current</span> : <ChevronRight size={17} />}
    </Link>
  );
}
