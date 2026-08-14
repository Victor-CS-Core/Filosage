"use client";

/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- The carousel keeps region semantics while exposing drag and keyboard input plus explicit button controls. */

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenCheck, Clock3, Play } from "lucide-react";
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

interface GestureSession {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  cardWidth: number;
  axis: "horizontal" | "vertical" | null;
  direction: CycleDirection | null;
  progress: number;
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

export default function CourseDeck({ items, firstName, canCreateCourses }: CourseDeckProps) {
  const paperTones = useMemo(() => buildPaperTones(items), [items]);
  const [activeIndex, setActiveIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<GestureSession | null>(null);
  const motionStateRef = useRef<MotionState>("idle");
  const motionCleanupRef = useRef<(() => void) | null>(null);
  const frameRef = useRef<number | null>(null);

  const setMotionState = useCallback((state: MotionState, direction?: CycleDirection) => {
    motionStateRef.current = state;
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.dataset.motionState = state;
    if (direction) viewport.dataset.direction = direction;
    else delete viewport.dataset.direction;
  }, []);

  const applyCardLayout = useCallback((direction?: CycleDirection, progress = 0, activeDragX = 0) => {
    const stage = stageRef.current;
    if (!stage) return;
    const cards = [...stage.querySelectorAll<HTMLElement>(".course-deck-card")];
    const activeCard = cards.find((card) => card.dataset.position === "0");
    if (!activeCard) return;

    const cardWidth = activeCard.offsetWidth;
    const stepX = Math.max(0, (stage.clientWidth - cardWidth) / 2);
    const compact = stage.clientWidth <= 800;
    const stepY = compact ? 12 : 18;
    const stepRotation = compact ? 0.45 : 0.35;
    const forward = direction === "next" ? progress : 0;
    const backward = direction === "previous" ? progress : 0;
    const previousIndex = items.length > 1 ? (activeIndex - 1 + items.length) % items.length : activeIndex;

    cards.forEach((card) => {
      const position = Number(card.dataset.position);
      const canonicalIndex = Number(card.dataset.canonicalIndex);
      const previousTarget = canonicalIndex === previousIndex;
      let x = position * stepX;
      let y = Math.max(0, position) * stepY;
      let rotation = Math.max(0, position) * stepRotation;
      let opacity = position >= 0 && position <= 2 ? 1 : 0;

      if (position === 0 && direction) {
        const travel = cardWidth + Math.max(28, stepX * 0.35);
        x = progress >= 1 ? (direction === "next" ? -travel : travel) : activeDragX;
        y = -18 * Math.sin(progress * Math.PI);
        rotation = (direction === "next" ? -6.5 : 6.5) * progress;
        opacity = progress < 0.58 ? 1 : Math.max(0, 1 - ((progress - 0.58) / 0.42));
      } else if (direction === "next") {
        if (position === 1 || position === 2) {
          x = (position - forward) * stepX;
          y = (position - forward) * stepY;
          rotation = (position - forward) * stepRotation;
        }
      } else if (direction === "previous") {
        if (previousTarget) {
          const startPosition = position === 1 ? 1 : 2;
          x = startPosition * (1 - backward) * stepX;
          y = startPosition * (1 - backward) * stepY;
          rotation = -stepRotation * (1 - backward);
          opacity = position >= 0 && position <= 2 ? 1 : Math.min(1, backward * 3);
        } else if (position === 1) {
          x = (1 + backward) * stepX;
          y = (1 + backward) * stepY;
          rotation = (1 + backward) * stepRotation;
        } else if (position === 2) {
          x = (2 + backward * 0.3) * stepX;
          y = (2 + backward * 0.3) * stepY;
          rotation = (2 + backward * 0.3) * stepRotation;
          opacity = 1 - backward;
        }
      }

      card.style.setProperty("--deck-x", `${x}px`);
      card.style.setProperty("--deck-y", `${y}px`);
      card.style.setProperty("--deck-rotation", `${rotation}deg`);
      card.style.setProperty("--deck-opacity", `${opacity}`);
    });
  }, [activeIndex, items.length]);

  const clearMotionWait = useCallback(() => {
    motionCleanupRef.current?.();
    motionCleanupRef.current = null;
  }, []);

  const waitForCardMotion = useCallback((onComplete: () => void) => {
    clearMotionWait();
    const activeCard = stageRef.current?.querySelector<HTMLElement>(".course-deck-card[data-position='0']");
    if (!activeCard || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onComplete();
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      activeCard.removeEventListener("transitionend", handleTransitionEnd);
      window.clearTimeout(timeoutId);
      motionCleanupRef.current = null;
      onComplete();
    };
    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.propertyName === "transform") finish();
    };
    const timeoutId = window.setTimeout(finish, 280);
    activeCard.addEventListener("transitionend", handleTransitionEnd);
    motionCleanupRef.current = () => {
      if (finished) return;
      finished = true;
      activeCard.removeEventListener("transitionend", handleTransitionEnd);
      window.clearTimeout(timeoutId);
    };
  }, [clearMotionWait]);

  const commitCycle = useCallback((direction: CycleDirection, progress = 0, activeDragX = 0) => {
    if (items.length <= 1 || (motionStateRef.current !== "idle" && motionStateRef.current !== "dragging")) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nextIndex = cycleIndex(activeIndex, direction, items.length);
    if (reducedMotion) {
      setMotionState("idle");
      setActiveIndex(nextIndex);
      return;
    }

    setMotionState("committing", direction);
    applyCardLayout(direction, progress, activeDragX);
    waitForCardMotion(() => {
      setMotionState("resetting", direction);
      setActiveIndex(nextIndex);
    });
    frameRef.current = requestAnimationFrame(() => applyCardLayout(direction, 1));
  }, [activeIndex, applyCardLayout, items.length, setMotionState, waitForCardMotion]);

  const settleBack = useCallback((direction: CycleDirection, progress: number, activeDragX: number) => {
    setMotionState("settling", direction);
    applyCardLayout(direction, progress, activeDragX);
    waitForCardMotion(() => {
      applyCardLayout();
      setMotionState("idle");
    });
    frameRef.current = requestAnimationFrame(() => applyCardLayout());
  }, [applyCardLayout, setMotionState, waitForCardMotion]);

  useLayoutEffect(() => {
    if (activeIndex >= items.length && items.length) {
      frameRef.current = requestAnimationFrame(() => setActiveIndex(0));
    }
    applyCardLayout();
    if (motionStateRef.current === "resetting") {
      frameRef.current = requestAnimationFrame(() => {
        applyCardLayout();
        setMotionState("idle");
      });
    } else setMotionState("idle");
  }, [activeIndex, applyCardLayout, items.length, setMotionState]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      if (motionStateRef.current === "idle") applyCardLayout();
    });
    const handleViewportResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = requestAnimationFrame(() => {
          if (motionStateRef.current === "idle") applyCardLayout();
        });
      });
    };
    observer.observe(stage);
    stage.querySelectorAll<HTMLElement>(".course-deck-card").forEach((card) => observer.observe(card));
    window.addEventListener("resize", handleViewportResize);
    window.visualViewport?.addEventListener("resize", handleViewportResize);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", handleViewportResize);
      window.visualViewport?.removeEventListener("resize", handleViewportResize);
    };
  }, [applyCardLayout]);

  useEffect(() => () => {
    clearMotionWait();
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, [clearMotionWait]);

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
  const jumpTo = (index: number) => {
    if (motionStateRef.current !== "idle") return;
    if (index === activeIndex) {
      setMotionState("idle");
      return;
    }
    setMotionState("resetting");
    setActiveIndex(index);
  };

  return (
    <section className={`course-deck-section ${items.length === 1 ? "is-single" : ""}`} aria-labelledby="course-deck-title">
      <header className="course-deck-heading">
        <h1 id="course-deck-title">Welcome back, {firstName}.</h1>
        <span><i aria-hidden="true" /> {items.length} active {items.length === 1 ? "course" : "courses"}</span>
      </header>

      <div
        ref={viewportRef}
        className="course-deck-viewport"
        onPointerDown={(event) => {
          if (items.length <= 1 || !event.isPrimary || event.button !== 0 || motionStateRef.current !== "idle") return;
          if ((event.target as HTMLElement).closest("a, button")) return;
          const activeCard = stageRef.current?.querySelector<HTMLElement>(".course-deck-card[data-position='0']");
          if (!activeCard) return;
          event.preventDefault();
          gestureRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            lastX: event.clientX,
            cardWidth: activeCard.offsetWidth,
            axis: null,
            direction: null,
            progress: 0,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const gesture = gestureRef.current;
          if (!gesture || gesture.pointerId !== event.pointerId) return;
          const deltaX = event.clientX - gesture.startX;
          const deltaY = event.clientY - gesture.startY;
          if (!gesture.axis && Math.hypot(deltaX, deltaY) > 6) {
            gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) * 1.15 ? "horizontal" : "vertical";
          }
          if (gesture.axis !== "horizontal") return;

          event.preventDefault();
          gesture.lastX = event.clientX;
          gesture.direction = deltaX < 0 ? "next" : "previous";
          gesture.progress = Math.min(1, Math.abs(deltaX) / Math.max(1, gesture.cardWidth * 0.72));
          setMotionState("dragging", gesture.direction);
          applyCardLayout(gesture.direction, gesture.progress, deltaX);
        }}
        onPointerUp={(event) => {
          const gesture = gestureRef.current;
          if (!gesture || gesture.pointerId !== event.pointerId) return;
          gestureRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          if (gesture.axis !== "horizontal" || !gesture.direction) {
            setMotionState("idle");
            return;
          }
          const shouldCommit = gesture.progress >= 0.5;
          if (shouldCommit) commitCycle(gesture.direction, gesture.progress, event.clientX - gesture.startX);
          else settleBack(gesture.direction, gesture.progress, event.clientX - gesture.startX);
        }}
        onPointerCancel={(event) => {
          const gesture = gestureRef.current;
          if (!gesture || gesture.pointerId !== event.pointerId) return;
          gestureRef.current = null;
          if (gesture.axis === "horizontal" && gesture.direction) {
            settleBack(gesture.direction, gesture.progress, gesture.lastX - gesture.startX);
          } else setMotionState("idle");
        }}
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
            const position = circularPosition(canonicalIndex, activeIndex, items.length);
            const visible = position >= 0 && position <= 2;
            const previousTarget = canonicalIndex === (activeIndex - 1 + items.length) % items.length;
            const buffer = previousTarget && !visible;
            const active = position === 0;
            const paperTone = paperTones[canonicalIndex] ?? 0;
            return (
              <div
                className={`course-deck-card course-deck-paper-tone-${paperTone} ${active ? "is-active" : ""} ${visible ? "is-visible" : ""} ${buffer ? "is-drag-buffer" : ""} ${previousTarget ? "is-previous-target" : ""}`}
                key={item.id}
                aria-hidden={!active}
                aria-label={active ? `${item.topic}, ${canonicalIndex + 1} of ${items.length}` : undefined}
                aria-roledescription={active ? "slide" : undefined}
                role={active ? "group" : undefined}
                data-position={position}
                data-canonical-index={canonicalIndex}
              >
                <div className="course-deck-cover">
                  <CourseBanner course={{ id: item.id, topic: item.topic, category: item.category, banner: item.banner }} variant="deck" eager={active} />
                </div>
                <div className="course-deck-card-body">
                  <div className="course-deck-card-copy">
                    <p>{active ? "Current lesson" : item.category ?? "Course"}</p>
                    <h2>{item.topic}</h2>
                    {active && <strong>{item.nextLessonTitle}</strong>}
                    {active && (
                      <span className="course-deck-lesson-meta">
                        <span><BookOpenCheck size={15} /> {item.completedLessons} of {item.totalLessons ?? "?"} lessons</span>
                        {item.estimatedMinutes && <span><Clock3 size={15} /> {item.estimatedMinutes} min</span>}
                      </span>
                    )}
                  </div>
                  {active && (
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
                      <Link className="button course-deck-primary" href={item.href} onKeyDown={(event) => event.stopPropagation()}><Play size={16} fill="currentColor" /> Continue</Link>
                    </div>
                  )}
                </div>
                {!active && position === 1 && <button className="course-deck-select" type="button" tabIndex={-1} onClick={next} aria-label={`Bring ${item.topic} to the front`} />}
              </div>
            );
          })}
        </div>
      </div>

      {items.length > 1 && (
        <div className="course-deck-controls">
          <button type="button" onClick={previous} aria-label="Show previous active course"><ArrowLeft size={17} /></button>
          <div role="status" aria-live="polite" aria-atomic="true">
            <strong>{items[activeIndex]?.topic}</strong>
            <span>{activeIndex + 1} of {items.length}</span>
          </div>
          <button type="button" onClick={next} aria-label="Show next active course"><ArrowRight size={17} /></button>
        </div>
      )}
    </section>
  );
}
