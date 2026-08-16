"use client";

/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- The carousel keeps region semantics while exposing drag and keyboard input plus explicit button controls. */

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  animate,
  domMax,
  LazyMotion,
  useDragControls,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControlsWithThen,
  type MotionValue,
  type PanInfo,
} from "motion/react";
import * as m from "motion/react-m";
import { ArrowLeft, ArrowRight, BookOpenCheck, CircleHelp, Clock3, Play } from "lucide-react";
import CourseBanner from "@/components/CourseBanner";
import { hashCourseIdentity } from "@/components/CourseArtwork";
import type { Course } from "@/lib/course-types";

export interface CourseDeckItem {
  id: string;
  topic: string;
  category?: string;
  banner?: Course["banner"];
  href: string;
  nextLessonTitle: string;
  completedLessons: number;
  totalLessons?: number;
  progressPercent: number | null;
  estimatedMinutes?: number;
}

interface CourseDeckProps {
  items: CourseDeckItem[];
  firstName: string;
  canCreateCourses: boolean;
}

type CycleDirection = "next" | "previous";
type MotionState = "idle" | "dragging" | "committing" | "settling" | "resetting";

interface DeckGeometry {
  ready: boolean;
  cardWidth: number;
  stepX: number;
  stepY: number;
  rotationStep: number;
  travel: number;
}

interface ReducedGestureSession {
  pointerId: number;
  startX: number;
  startY: number;
  axis: "horizontal" | "vertical" | null;
}

interface CourseDeckCardProps {
  item: CourseDeckItem;
  canonicalIndex: number;
  itemCount: number;
  position: number;
  previousTarget: boolean;
  active: boolean;
  visible: boolean;
  buffer: boolean;
  paperTone: number;
  geometry: DeckGeometry;
  dragX: MotionValue<number>;
  direction: CycleDirection | null;
  motionState: MotionState;
  reducedMotion: boolean;
  onNext: () => void;
  onDragStart: (pointerId: number | null) => void;
  onDragMove: (info: PanInfo) => void;
  onDragEnd: (info: PanInfo) => void;
}

const INITIAL_GEOMETRY: DeckGeometry = {
  ready: false,
  cardWidth: 0,
  stepX: 0,
  stepY: 18,
  rotationStep: 0.3,
  travel: 0,
};

const CONTROL_CYCLE_DURATION_SECONDS = 0.42;
const DRAG_CYCLE_MAX_DURATION_SECONDS = 0.34;
const DECK_CYCLE_EASE = [0.4, 0, 0.2, 1] as const;
const DECK_HANDOFF_PROGRESS = 0.46;
const MOTION_PREFERENCE_STORAGE_KEY = "filosage-motion-preference";

function useSystemReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReducedMotion(mediaQuery.matches);
    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);
    return () => mediaQuery.removeEventListener("change", syncPreference);
  }, []);

  return reducedMotion;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildPaperTones(items: CourseDeckItem[]) {
  return items.reduce<number[]>((tones, item, index) => {
    let tone = hashCourseIdentity(`${item.topic}|${item.category ?? ""}`) % 4;
    if (index > 0 && tone === tones[index - 1]) tone = (tone + 1) % 4;
    if (index > 1 && tone === tones[index - 2]) tone = (tone + 1) % 4;
    tones.push(tone);
    return tones;
  }, []);
}

function circularPosition(index: number, activeIndex: number, itemCount: number) {
  if (itemCount <= 1) return 0;
  const forward = (index - activeIndex + itemCount) % itemCount;
  if (forward === 0) return 0;
  if (forward === 1) return 1;
  if (forward === 2) return 2;
  if (forward === itemCount - 1) return -1;
  return 99;
}

function cycleIndex(activeIndex: number, direction: CycleDirection, itemCount: number) {
  return direction === "next"
    ? (activeIndex + 1) % itemCount
    : (activeIndex - 1 + itemCount) % itemCount;
}

function CourseDeckCard({
  item,
  canonicalIndex,
  itemCount,
  position,
  previousTarget,
  active,
  visible,
  buffer,
  paperTone,
  geometry,
  dragX,
  direction,
  motionState,
  reducedMotion,
  onNext,
  onDragStart,
  onDragMove,
  onDragEnd,
}: CourseDeckCardProps) {
  const dragControls = useDragControls();
  const baseSlot = position === -1
    ? Math.min(Math.max(itemCount - 1, 1), 2)
    : clamp(position, 0, 2);
  const baseX = baseSlot * geometry.stepX;
  const baseY = baseSlot * geometry.stepY;
  const baseRotation = baseSlot * geometry.rotationStep;

  const progressFor = useCallback((value: number) => (
    geometry.travel > 0 ? clamp(Math.abs(value) / geometry.travel, 0, 1) : 0
  ), [geometry.travel]);

  const effectiveDirection = useCallback((value: number): CycleDirection | null => {
    if (value < -0.5) return "next";
    if (value > 0.5) return "previous";
    return direction;
  }, [direction]);

  const cardX = useTransform(dragX, (value) => {
    if (reducedMotion) return baseX;
    const progress = progressFor(value);
    const activeDirection = effectiveDirection(value);
    if (active) return value;
    if (activeDirection === "next") {
      if (position === 1) return geometry.stepX * (1 - progress);
      if (position === 2) return geometry.stepX * (2 - progress);
    }
    if (activeDirection === "previous") {
      if (previousTarget) return baseX * (1 - progress);
      if (position === 1) return geometry.stepX * (1 + progress);
      if (position === 2) return geometry.stepX * (2 + (0.18 * progress));
    }
    return baseX;
  });

  const cardY = useTransform(dragX, (value) => {
    if (reducedMotion) return baseY;
    const progress = progressFor(value);
    const activeDirection = effectiveDirection(value);
    if (active) return geometry.stepY * 0.85 * progress;
    if (activeDirection === "next") {
      if (position === 1) return geometry.stepY * (1 - progress);
      if (position === 2) return geometry.stepY * (2 - progress);
    }
    if (activeDirection === "previous") {
      if (previousTarget) return baseY * (1 - progress);
      if (position === 1) return geometry.stepY * (1 + progress);
      if (position === 2) return geometry.stepY * (2 + (0.18 * progress));
    }
    return baseY;
  });

  const cardRotation = useTransform(dragX, (value) => {
    if (reducedMotion) return baseRotation;
    const progress = progressFor(value);
    const activeDirection = effectiveDirection(value);
    if (active) return (value / Math.max(1, geometry.travel)) * 1.35;
    if (activeDirection === "next") {
      if (position === 1) return geometry.rotationStep * (1 - progress);
      if (position === 2) return geometry.rotationStep * (2 - progress);
    }
    if (activeDirection === "previous") {
      if (previousTarget) return baseRotation * (1 - progress);
      if (position === 1) return geometry.rotationStep * (1 + progress);
      if (position === 2) return geometry.rotationStep * (2 + (0.18 * progress));
    }
    return baseRotation;
  });

  const cardOpacity = useTransform(dragX, (value) => {
    const progress = progressFor(value);
    const activeDirection = effectiveDirection(value);
    if (active) {
      if (!activeDirection) return 1;
      const concealProgress = clamp((progress - DECK_HANDOFF_PROGRESS) / (1 - DECK_HANDOFF_PROGRESS), 0, 1);
      return 1 - (concealProgress * 0.92);
    }
    if (visible) {
      if (activeDirection === "previous" && position === 2 && !previousTarget) {
        return 1 - (0.18 * progress);
      }
      return 1;
    }
    if (previousTarget && activeDirection === "previous") {
      return clamp(progress * 1.8, 0, 1);
    }
    return 0;
  });

  const cardZIndex = useTransform(dragX, (value) => {
    const progress = progressFor(value);
    const activeDirection = effectiveDirection(value);
    const handedOff = progress >= DECK_HANDOFF_PROGRESS;
    if (active) return handedOff && activeDirection ? 0 : 3;
    if (activeDirection === "previous") {
      if (previousTarget) return handedOff ? 3 : 2;
      if (position === 1) return handedOff ? 2 : 1;
      if (position === 2) return handedOff ? 1 : 0;
      return -1;
    }
    if (position === 1) return handedOff && activeDirection === "next" ? 3 : 2;
    if (position === 2) return handedOff && activeDirection === "next" ? 2 : 1;
    return 0;
  });

  const cardScale = useTransform(dragX, (value) => {
    if (reducedMotion) return 1;
    const progress = progressFor(value);
    const activeDirection = effectiveDirection(value);
    if (active) return 1 - (0.035 * progress);
    if (activeDirection === "next" && position === 1) return 0.98 + (0.02 * progress);
    if (activeDirection === "previous" && previousTarget) return 0.98 + (0.02 * progress);
    return 1;
  });

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!active || reducedMotion || itemCount <= 1 || motionState !== "idle") return;
    if ((event.target as HTMLElement).closest("a, button")) return;
    dragControls.start(event, { snapToCursor: false });
  };

  const spineContent = (
    <>
      <small>{item.category ?? "Course"}</small>
      <strong>{item.topic}</strong>
      <i aria-hidden="true" />
    </>
  );

  const motionStyle = geometry.ready
    ? { x: active ? dragX : cardX, y: cardY, rotate: cardRotation, scale: cardScale, opacity: cardOpacity, zIndex: cardZIndex }
    : undefined;

  return (
    <m.div
      className={`course-deck-card course-deck-paper-tone-${paperTone} ${active ? "is-active" : ""} ${visible ? "is-visible" : ""} ${buffer ? "is-drag-buffer" : ""} ${previousTarget ? "is-previous-target" : ""}`}
      aria-label={active ? `${item.topic}, ${canonicalIndex + 1} of ${itemCount}` : undefined}
      aria-roledescription={active ? "slide" : undefined}
      role={active ? "group" : undefined}
      data-position={position}
      data-canonical-index={canonicalIndex}
      data-course-id={item.id}
      drag={active && !reducedMotion && itemCount > 1 ? "x" : false}
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragDirectionLock
      onPointerDown={handlePointerDown}
      onDragStart={(event) => onDragStart(event instanceof PointerEvent ? event.pointerId : null)}
      onDrag={(_, info) => onDragMove(info)}
      onDragEnd={(_, info) => onDragEnd(info)}
      onDragStartCapture={(event) => event.preventDefault()}
      style={motionStyle}
    >
      <div className="course-deck-card-face" aria-hidden={!active} inert={!active}>
        <div className="course-deck-cover">
          <CourseBanner course={{ id: item.id, topic: item.topic, category: item.category, banner: item.banner }} variant="deck" eager={active} />
        </div>
        <div className="course-deck-card-body">
          <div className="course-deck-card-copy">
            <p>Current lesson</p>
            <h2>{item.topic}</h2>
            <strong>{item.nextLessonTitle}</strong>
            <span className="course-deck-lesson-meta">
              <span><BookOpenCheck size={15} /> {item.completedLessons} of {item.totalLessons ?? "?"} lessons</span>
              {item.estimatedMinutes && <span><Clock3 size={15} /> {item.estimatedMinutes} min</span>}
            </span>
          </div>
          <div className="course-deck-card-action">
            <div className="course-deck-progress-copy"><span>Progress</span><strong>{item.progressPercent === null ? "Total pending" : `${item.progressPercent}%`}</strong></div>
            <span
              className={`course-deck-progress ${item.progressPercent === null ? "is-unknown" : ""}`}
              role="progressbar"
              aria-label={item.progressPercent === null ? `${item.topic} progress total unavailable` : `${item.topic} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={item.progressPercent ?? undefined}
            ><i style={{ transform: `scaleX(${(item.progressPercent ?? 0) / 100})` }} /></span>
            <Link
              className="button course-deck-primary"
              href={item.href}
              tabIndex={active ? undefined : -1}
              onKeyDown={(event) => event.stopPropagation()}
            ><Play size={16} fill="currentColor" /> Continue</Link>
          </div>
        </div>
      </div>

      {!active && (position === 1 ? (
        <m.button
          className="course-deck-spine"
          type="button"
          tabIndex={-1}
          aria-label={`Bring ${item.topic} to the front`}
          onClick={onNext}
        >
          {spineContent}
        </m.button>
      ) : (
        <m.div className="course-deck-spine" aria-hidden="true">
          {spineContent}
        </m.div>
      ))}
    </m.div>
  );
}

export default function CourseDeck({ items, firstName, canCreateCourses }: CourseDeckProps) {
  const paperTones = useMemo(() => buildPaperTones(items), [items]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [geometry, setGeometry] = useState<DeckGeometry>(INITIAL_GEOMETRY);
  const [motionState, setMotionState] = useState<MotionState>("idle");
  const [direction, setDirection] = useState<CycleDirection | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const activeIndexRef = useRef(0);
  const motionStateRef = useRef<MotionState>("idle");
  const directionRef = useRef<CycleDirection | null>(null);
  const animationRef = useRef<AnimationPlaybackControlsWithThen | null>(null);
  const sequenceRef = useRef(0);
  const reducedGestureRef = useRef<ReducedGestureSession | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const finishDragRef = useRef<(reportedOffset?: number, releaseVelocity?: number) => void>(() => undefined);
  const settleBackRef = useRef<(releaseVelocity?: number) => void>(() => undefined);
  const dragX = useMotionValue(0);
  const systemReducedMotion = useSystemReducedMotion();
  const [motionOverride, setMotionOverride] = useState<boolean | null>(null);
  const reducedMotion = motionOverride ?? systemReducedMotion;
  const selectedIndex = items.length > 0 && activeIndex < items.length ? activeIndex : 0;

  const updateMotionState = useCallback((state: MotionState, nextDirection: CycleDirection | null) => {
    motionStateRef.current = state;
    directionRef.current = nextDirection;
    setMotionState(state);
    setDirection(nextDirection);
  }, []);

  const stopAnimation = useCallback(() => {
    sequenceRef.current += 1;
    animationRef.current?.stop();
    animationRef.current = null;
  }, []);

  const toggleMotionPreference = useCallback(() => {
    stopAnimation();
    dragX.jump(0);
    updateMotionState("idle", null);
    const nextReducedMotion = !reducedMotion;
    const nextOverride = nextReducedMotion === systemReducedMotion ? null : nextReducedMotion;
    setMotionOverride(nextOverride);
    try {
      if (nextOverride === null) localStorage.removeItem(MOTION_PREFERENCE_STORAGE_KEY);
      else localStorage.setItem(MOTION_PREFERENCE_STORAGE_KEY, nextOverride ? "reduced" : "full");
    } catch {
      // The current-tab preference still applies when storage is unavailable.
    }
  }, [dragX, reducedMotion, stopAnimation, systemReducedMotion, updateMotionState]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const storedPreference = localStorage.getItem(MOTION_PREFERENCE_STORAGE_KEY);
        if (storedPreference === "reduced") setMotionOverride(true);
        else if (storedPreference === "full") setMotionOverride(false);
      } catch {
        // The system preference remains the fallback when storage is unavailable.
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!reducedMotion || motionStateRef.current === "idle") return;
    stopAnimation();
    dragX.jump(0);
    updateMotionState("idle", null);
  }, [dragX, reducedMotion, stopAnimation, updateMotionState]);

  const settleBack = useCallback((releaseVelocity = 0) => {
    const settleDirection = dragX.get() < 0 ? "next" : "previous";
    if (reducedMotion) {
      dragX.jump(0);
      updateMotionState("idle", null);
      return;
    }

    stopAnimation();
    const sequence = sequenceRef.current;
    updateMotionState("settling", settleDirection);
    const controls = animate(dragX, 0, {
      type: "spring",
      stiffness: 470,
      damping: 42,
      mass: 0.76,
      velocity: releaseVelocity,
    });
    animationRef.current = controls;
    void controls.then(() => {
      if (sequenceRef.current !== sequence || animationRef.current !== controls) return;
      animationRef.current = null;
      updateMotionState("idle", null);
    });
  }, [dragX, reducedMotion, stopAnimation, updateMotionState]);

  const commitCycle = useCallback((nextDirection: CycleDirection, releaseVelocity = 0) => {
    if (items.length <= 1 || (motionStateRef.current !== "idle" && motionStateRef.current !== "dragging")) return;
    const releasedFromDrag = motionStateRef.current === "dragging";
    const nextIndex = cycleIndex(activeIndexRef.current, nextDirection, items.length);
    stopAnimation();

    if (reducedMotion) {
      dragX.jump(0);
      updateMotionState("idle", null);
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
      return;
    }

    const sequence = sequenceRef.current;
    updateMotionState("committing", nextDirection);
    const travel = Math.max(geometry.travel, geometry.cardWidth + 32);
    const completedProgress = travel > 0 ? clamp(Math.abs(dragX.get()) / travel, 0, 1) : 0;
    const velocityReduction = clamp(Math.abs(releaseVelocity) / 12_000, 0, 0.08);
    const duration = releasedFromDrag
      ? clamp((0.2 + ((1 - completedProgress) * 0.14)) - velocityReduction, 0.18, DRAG_CYCLE_MAX_DURATION_SECONDS)
      : CONTROL_CYCLE_DURATION_SECONDS;
    const controls = animate(dragX, nextDirection === "next" ? -travel : travel, {
      type: "tween",
      duration,
      ease: DECK_CYCLE_EASE,
    });
    animationRef.current = controls;
    void controls.then(() => {
      if (sequenceRef.current !== sequence || animationRef.current !== controls) return;
      animationRef.current = null;
      motionStateRef.current = "resetting";
      setMotionState("resetting");
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
    });
  }, [dragX, geometry.cardWidth, geometry.travel, items.length, reducedMotion, stopAnimation, updateMotionState]);

  const handleDragStart = useCallback((pointerId: number | null) => {
    if (motionStateRef.current !== "idle") return;
    dragPointerIdRef.current = pointerId;
    updateMotionState("dragging", null);
  }, [updateMotionState]);

  const handleDragMove = useCallback((info: PanInfo) => {
    if (motionStateRef.current !== "dragging" || Math.abs(info.offset.x) < 3) return;
    const nextDirection = info.offset.x < 0 ? "next" : "previous";
    if (directionRef.current === nextDirection) return;
    directionRef.current = nextDirection;
    setDirection(nextDirection);
  }, []);

  const finishDrag = useCallback((reportedOffset = 0, releaseVelocity = 0) => {
    if (motionStateRef.current !== "dragging") return;
    dragPointerIdRef.current = null;
    const visualOffset = dragX.get();
    const releaseOffset = Math.abs(visualOffset) > Math.abs(reportedOffset) ? visualOffset : reportedOffset;
    const distanceThreshold = Math.min(140, Math.max(72, geometry.cardWidth * 0.24));
    const strongVelocity = Math.abs(releaseVelocity) >= 650;
    const shouldCommit = Math.abs(releaseOffset) >= distanceThreshold
      || (strongVelocity && Math.abs(releaseOffset) >= 12);

    if (!shouldCommit) {
      settleBack(releaseVelocity);
      return;
    }

    const nextDirection = strongVelocity
      ? (releaseVelocity < 0 ? "next" : "previous")
      : (releaseOffset < 0 ? "next" : "previous");
    commitCycle(nextDirection, releaseVelocity);
  }, [commitCycle, dragX, geometry.cardWidth, settleBack]);

  const handleDragEnd = useCallback((info: PanInfo) => {
    finishDrag(info.offset.x, info.velocity.x);
  }, [finishDrag]);

  useLayoutEffect(() => {
    finishDragRef.current = finishDrag;
    settleBackRef.current = settleBack;
  }, [finishDrag, settleBack]);

  useLayoutEffect(() => {
    let releaseFrame = 0;
    const completeLostRelease = () => {
      cancelAnimationFrame(releaseFrame);
      releaseFrame = requestAnimationFrame(() => {
        if (motionStateRef.current !== "dragging") return;
        finishDragRef.current(dragX.get());
      });
    };
    const isActivePointer = (event: PointerEvent) => (
      dragPointerIdRef.current === null || event.pointerId === dragPointerIdRef.current
    );
    const handleWindowPointerUp = (event: PointerEvent) => {
      if (motionStateRef.current === "dragging" && isActivePointer(event)) completeLostRelease();
    };
    const handleWindowPointerCancel = (event: PointerEvent) => {
      if (motionStateRef.current !== "dragging" || !isActivePointer(event)) return;
      cancelAnimationFrame(releaseFrame);
      dragPointerIdRef.current = null;
      settleBackRef.current();
    };
    const handleWindowBlur = () => {
      if (motionStateRef.current !== "dragging") return;
      cancelAnimationFrame(releaseFrame);
      dragPointerIdRef.current = null;
      settleBackRef.current();
    };

    window.addEventListener("pointerup", handleWindowPointerUp, true);
    window.addEventListener("pointercancel", handleWindowPointerCancel, true);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      cancelAnimationFrame(releaseFrame);
      window.removeEventListener("pointerup", handleWindowPointerUp, true);
      window.removeEventListener("pointercancel", handleWindowPointerCancel, true);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [dragX]);

  const jumpTo = useCallback((index: number) => {
    if (motionStateRef.current !== "idle" || index === activeIndexRef.current) return;
    stopAnimation();
    dragX.jump(0);
    motionStateRef.current = "resetting";
    setMotionState("resetting");
    activeIndexRef.current = index;
    setActiveIndex(index);
  }, [dragX, stopAnimation]);

  useLayoutEffect(() => {
    activeIndexRef.current = selectedIndex;
    if (motionStateRef.current !== "resetting") return;
    dragX.jump(0);
    updateMotionState("idle", null);
  }, [dragX, selectedIndex, updateMotionState]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !items.length) return;
    let resizeFrame = 0;

    const measure = () => {
      const activeCard = stage.querySelector<HTMLElement>(".course-deck-card[data-position='0']");
      if (!activeCard) return;
      const stageWidth = stage.clientWidth;
      const cardWidth = activeCard.offsetWidth;
      const compact = stageWidth <= 800;
      const stepX = Math.max(0, (stageWidth - cardWidth) / 2);
      const stepY = compact ? 12 : 18;
      const rotationStep = compact ? 0.38 : 0.28;
      const travel = cardWidth + Math.max(32, stepX * 0.45);
      setGeometry((current) => {
        if (
          current.ready
          && Math.abs(current.cardWidth - cardWidth) < 0.5
          && Math.abs(current.stepX - stepX) < 0.5
          && current.stepY === stepY
        ) return current;
        return { ready: true, cardWidth, stepX, stepY, rotationStep, travel };
      });
    };

    measure();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(measure);
    });
    observer.observe(stage);
    const activeCard = stage.querySelector<HTMLElement>(".course-deck-card[data-position='0']");
    if (activeCard) observer.observe(activeCard);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
    };
  }, [items.length, selectedIndex]);

  useEffect(() => () => {
    sequenceRef.current += 1;
    animationRef.current?.stop();
  }, []);

  if (!items.length) {
    return (
      <section className="course-deck-empty" aria-labelledby="course-deck-empty-title">
        <div className="course-deck-empty-art"><CourseBanner course={{ topic: "Begin a new learning path", category: "Filosage" }} variant="deck" eager /></div>
        <div>
          <h1 id="course-deck-empty-title">Welcome back, {firstName}.</h1>
          <p>Choose one useful outcome and turn it into a course you can practice, finish, and prove.</p>
          <Link className="button course-deck-primary" href={canCreateCourses ? "/create" : "/library"}>
            {canCreateCourses ? "Create your first course" : "Explore courses"} <ArrowRight size={17} />
          </Link>
        </div>
      </section>
    );
  }

  const previous = () => commitCycle("previous");
  const next = () => commitCycle("next");

  const startReducedGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!reducedMotion || items.length <= 1 || !event.isPrimary || event.button !== 0 || motionStateRef.current !== "idle") return;
    if ((event.target as HTMLElement).closest("a, button")) return;
    reducedGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: null,
    };
  };

  const moveReducedGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = reducedGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.axis && Math.hypot(deltaX, deltaY) > 8) {
      gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) * 1.15 ? "horizontal" : "vertical";
      if (gesture.axis === "horizontal") event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const finishReducedGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = reducedGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    reducedGestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const deltaX = event.clientX - gesture.startX;
    if (gesture.axis === "horizontal" && Math.abs(deltaX) >= 40) {
      commitCycle(deltaX < 0 ? "next" : "previous");
    }
  };

  return (
    <LazyMotion features={domMax} strict>
      <section className={`course-deck-section ${items.length === 1 ? "is-single" : ""}`} aria-labelledby="course-deck-title">
        <header className="course-deck-heading">
          <h1 id="course-deck-title">Welcome back, {firstName}.</h1>
          <div className="course-deck-heading-meta">
            <span><i aria-hidden="true" /> {items.length} active {items.length === 1 ? "course" : "courses"}</span>
            <div className="motion-preference-control" role="group" aria-label="Course card motion preference">
              <button
                type="button"
                className="motion-preference-toggle"
                aria-pressed={reducedMotion}
                aria-describedby="course-deck-motion-tooltip"
                onClick={toggleMotionPreference}
              >
                <i aria-hidden="true" />
                {reducedMotion ? "Reduced motion" : "Full motion"}
              </button>
              <Link
                className="motion-preference-help"
                href="/support/articles/accessibility#control-motion-and-animation"
                aria-label="Learn how to change motion settings"
                aria-describedby="course-deck-motion-tooltip"
              >
                <CircleHelp size={17} aria-hidden="true" />
              </Link>
              <span id="course-deck-motion-tooltip" className="motion-preference-tooltip" role="tooltip">
                {reducedMotion
                  ? "Course cards switch without animated movement. Select the pill to restore full motion, or open help for device settings."
                  : "Course cards follow your drag and animate through the stack. Select the pill to reduce motion, or open help for device settings."}
              </span>
            </div>
          </div>
        </header>

        <div
          className="course-deck-viewport"
          data-motion-state={motionState}
          data-direction={direction ?? undefined}
          onPointerDown={startReducedGesture}
          onPointerMove={moveReducedGesture}
          onPointerUp={finishReducedGesture}
          onPointerCancel={() => { reducedGestureRef.current = null; }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "ArrowLeft") { event.preventDefault(); previous(); }
            else if (event.key === "ArrowRight") { event.preventDefault(); next(); }
            else if (event.key === "Home") { event.preventDefault(); jumpTo(0); }
            else if (event.key === "End") { event.preventDefault(); jumpTo(items.length - 1); }
          }}
          tabIndex={items.length > 1 ? 0 : -1}
          role="region"
          aria-roledescription={items.length > 1 ? "carousel" : undefined}
          aria-label={items.length > 1
            ? "Active courses. Use the left and right arrow keys, drag horizontally, or swipe left and right to change course."
            : "Active course"}
        >
          <div ref={stageRef} className="course-deck-stage">
            {items.map((item, canonicalIndex) => {
              const position = circularPosition(canonicalIndex, selectedIndex, items.length);
              const visible = position >= 0 && position <= 2;
              const previousTarget = canonicalIndex === (selectedIndex - 1 + items.length) % items.length;
              const buffer = previousTarget && !visible;
              return (
                <CourseDeckCard
                  key={item.id}
                  item={item}
                  canonicalIndex={canonicalIndex}
                  itemCount={items.length}
                  position={position}
                  previousTarget={previousTarget}
                  active={position === 0}
                  visible={visible}
                  buffer={buffer}
                  paperTone={paperTones[canonicalIndex] ?? 0}
                  geometry={geometry}
                  dragX={dragX}
                  direction={direction}
                  motionState={motionState}
                  reducedMotion={reducedMotion}
                  onNext={next}
                  onDragStart={handleDragStart}
                  onDragMove={handleDragMove}
                  onDragEnd={handleDragEnd}
                />
              );
            })}
          </div>
        </div>

        {items.length > 1 && (
          <div className="course-deck-controls">
            <button type="button" onClick={previous} aria-label="Show previous active course"><ArrowLeft size={17} /></button>
            <div role="status" aria-live="polite" aria-atomic="true">
              <strong>{items[selectedIndex]?.topic}</strong>
              <span>{selectedIndex + 1} of {items.length}</span>
            </div>
            <button type="button" onClick={next} aria-label="Show next active course"><ArrowRight size={17} /></button>
          </div>
        )}
      </section>
    </LazyMotion>
  );
}
