"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { GripHorizontal } from "lucide-react";

type DrawerPlacement = "end" | "bottom";
type MobileDrawerPlacement = "end" | "bottom" | "full";
type DrawerSize = "compact" | "medium" | "wide";
type DesktopDrawerPresentation = "modal" | "floating";

interface DrawerController {
  activeDrawer: string | null;
  closeDrawer: (id?: string) => void;
  openDrawer: (id: string) => void;
}

const DrawerContext = createContext<DrawerController | null>(null);

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null);
  const openDrawer = useCallback((id: string) => setActiveDrawer(id), []);
  const closeDrawer = useCallback((id?: string) => {
    setActiveDrawer((current) => (!id || current === id ? null : current));
  }, []);
  const value = useMemo(
    () => ({ activeDrawer, closeDrawer, openDrawer }),
    [activeDrawer, closeDrawer, openDrawer],
  );

  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export function useAppDrawer(id: string) {
  const context = useContext(DrawerContext);
  if (!context) throw new Error("useAppDrawer must be used within DrawerProvider.");
  const { activeDrawer, closeDrawer: closeActiveDrawer, openDrawer: openActiveDrawer } = context;
  const openDrawer = useCallback(() => openActiveDrawer(id), [id, openActiveDrawer]);
  const closeDrawer = useCallback(() => closeActiveDrawer(id), [closeActiveDrawer, id]);
  const toggleDrawer = useCallback(() => {
    if (activeDrawer === id) closeActiveDrawer(id);
    else openActiveDrawer(id);
  }, [activeDrawer, closeActiveDrawer, id, openActiveDrawer]);

  return {
    open: activeDrawer === id,
    openDrawer,
    closeDrawer,
    toggleDrawer,
  };
}

interface AppDrawerProps {
  id?: string;
  open: boolean;
  onClose: () => void;
  ariaLabel?: string;
  labelledBy?: string;
  placement?: DrawerPlacement;
  mobilePlacement?: MobileDrawerPlacement;
  size?: DrawerSize;
  desktopPresentation?: DesktopDrawerPresentation;
  draggable?: boolean;
  dragLabel?: string;
  className?: string;
  children: ReactNode;
}

const DRAWER_EXIT_MS = 160;
const DRAWER_ENTER_MS = 220;
let drawerScrollLocks = 0;
let restoreDrawerScroll: (() => void) | null = null;

function lockDrawerScroll() {
  if (drawerScrollLocks === 0) {
    const root = document.documentElement;
    const body = document.body;
    const previous = {
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
    };
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    restoreDrawerScroll = () => {
      root.style.overflow = previous.rootOverflow;
      body.style.overflow = previous.bodyOverflow;
    };
  }
  drawerScrollLocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    drawerScrollLocks = Math.max(0, drawerScrollLocks - 1);
    if (drawerScrollLocks === 0) {
      restoreDrawerScroll?.();
      restoreDrawerScroll = null;
    }
  };
}

export default function AppDrawer({
  id,
  open,
  onClose,
  ariaLabel,
  labelledBy,
  placement = "end",
  mobilePlacement = "bottom",
  size = "medium",
  desktopPresentation = "modal",
  draggable = false,
  dragLabel = "floating window",
  className = "",
  children,
}: AppDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleCleanupRef = useRef<(() => void) | null>(null);
  const settleFrameRef = useRef<number | null>(null);
  const openFrameRef = useRef<number | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const unlockScrollRef = useRef<(() => void) | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const dragSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    minDeltaX: number;
    maxDeltaX: number;
    minDeltaY: number;
    maxDeltaY: number;
    nextX: number;
    nextY: number;
  } | null>(null);
  const [desktopViewport, setDesktopViewport] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(min-width: 901px)").matches
  ));
  const floatingDraggable = draggable && desktopPresentation === "floating" && desktopViewport;

  const applyDragOffset = useCallback((x: number, y: number) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dragOffsetRef.current = { x, y };
    dialog.style.setProperty("--drawer-drag-x", `${x}px`);
    dialog.style.setProperty("--drawer-drag-y", `${y}px`);
  }, []);

  const resetDragOffset = useCallback(() => {
    dragSessionRef.current = null;
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    const dialog = dialogRef.current;
    if (dialog) delete dialog.dataset.dragging;
    applyDragOffset(0, 0);
  }, [applyDragOffset]);

  const nudgeFloatingWindow = useCallback((deltaX: number, deltaY: number) => {
    const dialog = dialogRef.current;
    if (!dialog || !floatingDraggable || dialog.dataset.presentation !== "floating") return;
    const margin = 12;
    const rect = dialog.getBoundingClientRect();
    const boundedDeltaX = Math.min(
      window.innerWidth - margin - rect.right,
      Math.max(margin - rect.left, deltaX),
    );
    const boundedDeltaY = Math.min(
      window.innerHeight - margin - rect.bottom,
      Math.max(margin - rect.top, deltaY),
    );
    applyDragOffset(
      dragOffsetRef.current.x + boundedDeltaX,
      dragOffsetRef.current.y + boundedDeltaY,
    );
  }, [applyDragOffset, floatingDraggable]);

  const clampFloatingWindow = useCallback(() => {
    const dialog = dialogRef.current;
    if (
      !dialog
      || !floatingDraggable
      || dialog.dataset.presentation !== "floating"
      || dialog.dataset.motionSettled !== "true"
    ) return;
    const margin = 12;
    const rect = dialog.getBoundingClientRect();
    let deltaX = 0;
    let deltaY = 0;
    if (rect.left < margin) deltaX = margin - rect.left;
    else if (rect.right > window.innerWidth - margin) deltaX = window.innerWidth - margin - rect.right;
    if (rect.top < margin) deltaY = margin - rect.top;
    else if (rect.bottom > window.innerHeight - margin) deltaY = window.innerHeight - margin - rect.bottom;
    if (deltaX || deltaY) {
      applyDragOffset(
        dragOffsetRef.current.x + deltaX,
        dragOffsetRef.current.y + deltaY,
      );
    }
  }, [applyDragOffset, floatingDraggable]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 901px)");
    const syncViewport = () => setDesktopViewport(query.matches);
    syncViewport();
    query.addEventListener("change", syncViewport);
    return () => query.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (settleFallbackTimerRef.current) {
      clearTimeout(settleFallbackTimerRef.current);
      settleFallbackTimerRef.current = null;
    }
    settleCleanupRef.current?.();
    settleCleanupRef.current = null;
    if (openFrameRef.current !== null) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
    if (settleFrameRef.current !== null) {
      cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = null;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const releaseScrollLock = () => {
      unlockScrollRef.current?.();
      unlockScrollRef.current = null;
    };
    const finishClose = () => {
      if (dialog.open) dialog.close();
      dialog.dataset.state = "closed";
      delete dialog.dataset.motionSettled;
      delete dialog.dataset.motionStarted;
      dialog.inert = false;
      resetDragOffset();
      releaseScrollLock();
    };

    if (open) {
      const floatingDesktop = desktopPresentation === "floating" && desktopViewport;
      dialog.dataset.presentation = floatingDesktop ? "floating" : "modal";
      if (!floatingDesktop) resetDragOffset();
      if (!floatingDesktop && !unlockScrollRef.current) {
        unlockScrollRef.current = lockDrawerScroll();
      } else if (floatingDesktop) {
        releaseScrollLock();
      }
      if (dialog.open && dialog.matches(":modal") === floatingDesktop) dialog.close();
      dialog.inert = false;
      dialog.dataset.state = reduceMotion ? "open" : "opening";
      if (reduceMotion) {
        dialog.dataset.motionStarted = "true";
        dialog.dataset.motionSettled = "true";
      } else {
        delete dialog.dataset.motionStarted;
        delete dialog.dataset.motionSettled;
      }
      if (!dialog.open) {
        if (floatingDesktop) dialog.show();
        else dialog.showModal();
      }
      if (!reduceMotion) {
        // Commit the crumpled start frame before transitioning to the open sheet.
        void dialog.offsetWidth;
        openFrameRef.current = requestAnimationFrame(() => {
          if (dialog.open) {
            dialog.dataset.motionStarted = "true";
            const surface = dialog.querySelector<HTMLElement>(".app-drawer-surface");
            const markSettled = () => {
              surface?.removeEventListener("transitionend", handleTransitionEnd);
              settleCleanupRef.current = null;
              if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
              settleTimerRef.current = null;
              const commitSettledState = () => {
                if (settleFallbackTimerRef.current) clearTimeout(settleFallbackTimerRef.current);
                settleFallbackTimerRef.current = null;
                if (dialog.open && dialog.dataset.state === "opening") {
                  dialog.dataset.state = "open";
                  dialog.dataset.motionSettled = "true";
                  clampFloatingWindow();
                }
              };
              settleFrameRef.current = requestAnimationFrame(() => {
                settleFrameRef.current = requestAnimationFrame(() => {
                  settleFrameRef.current = null;
                  commitSettledState();
                });
              });
              // WebKit can defer animation frames for a large clipped dialog
              // even while its CSS transition has completed. Never leave the
              // drawer inert in the opening state if those frames are delayed.
              settleFallbackTimerRef.current = setTimeout(() => {
                if (settleFrameRef.current !== null) cancelAnimationFrame(settleFrameRef.current);
                settleFrameRef.current = null;
                commitSettledState();
              }, 100);
            };
            const handleTransitionEnd = (event: TransitionEvent) => {
              if (event.target === surface && event.propertyName === "transform") markSettled();
            };
            surface?.addEventListener("transitionend", handleTransitionEnd);
            settleCleanupRef.current = () => surface?.removeEventListener("transitionend", handleTransitionEnd);
            settleTimerRef.current = setTimeout(markSettled, DRAWER_ENTER_MS + 100);
          }
          openFrameRef.current = null;
        });
      }
      return;
    }

    if (!dialog.open) {
      dialog.dataset.state = "closed";
      delete dialog.dataset.motionSettled;
      delete dialog.dataset.motionStarted;
      releaseScrollLock();
      return;
    }

    if (reduceMotion) {
      finishClose();
      return;
    }

    // Release the modal focus trap immediately so another control can be used
    // while the surface finishes its visual exit as a non-modal dialog.
    dialog.close();
    dialog.show();
    dialog.inert = true;
    openFrameRef.current = requestAnimationFrame(() => {
      delete dialog.dataset.motionStarted;
      delete dialog.dataset.motionSettled;
      dialog.dataset.state = "closing";
      closeTimerRef.current = setTimeout(finishClose, DRAWER_EXIT_MS);
      openFrameRef.current = null;
    });
  }, [clampFloatingWindow, desktopPresentation, desktopViewport, open, resetDragOffset]);

  useEffect(() => {
    if (!open || !floatingDraggable) return;
    const handleResize = () => {
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = requestAnimationFrame(() => {
        clampFloatingWindow();
        resizeFrameRef.current = null;
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [clampFloatingWindow, floatingDraggable, open]);

  useEffect(() => {
    if (!open || desktopPresentation !== "floating" || !desktopViewport) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) onCloseRef.current();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [desktopPresentation, desktopViewport, open]);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    if (settleFallbackTimerRef.current) clearTimeout(settleFallbackTimerRef.current);
    settleCleanupRef.current?.();
    if (openFrameRef.current !== null) cancelAnimationFrame(openFrameRef.current);
    if (settleFrameRef.current !== null) cancelAnimationFrame(settleFrameRef.current);
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
    if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    unlockScrollRef.current?.();
    unlockScrollRef.current = null;
  }, []);

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dialog = dialogRef.current;
    if (!dialog || !floatingDraggable || dialog.dataset.presentation !== "floating") return;
    if (!event.isPrimary || event.button !== 0) return;
    const margin = 12;
    const rect = dialog.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dialog.dataset.dragging = "true";
    dragSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: dragOffsetRef.current.x,
      originY: dragOffsetRef.current.y,
      minDeltaX: margin - rect.left,
      maxDeltaX: window.innerWidth - margin - rect.right,
      minDeltaY: margin - rect.top,
      maxDeltaY: window.innerHeight - margin - rect.bottom,
      nextX: dragOffsetRef.current.x,
      nextY: dragOffsetRef.current.y,
    };
    event.preventDefault();
  };

  const updateDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const deltaX = Math.min(session.maxDeltaX, Math.max(session.minDeltaX, event.clientX - session.startX));
    const deltaY = Math.min(session.maxDeltaY, Math.max(session.minDeltaY, event.clientY - session.startY));
    session.nextX = session.originX + deltaX;
    session.nextY = session.originY + deltaY;
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      const active = dragSessionRef.current;
      if (active) applyDragOffset(active.nextX, active.nextY);
      dragFrameRef.current = null;
    });
  };

  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    applyDragOffset(session.nextX, session.nextY);
    dragSessionRef.current = null;
    delete dialogRef.current?.dataset.dragging;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const moveWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!floatingDraggable) return;
    const step = event.shiftKey ? 48 : 16;
    const movement = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (movement) {
      event.preventDefault();
      nudgeFloatingWindow(movement[0], movement[1]);
    } else if (event.key === "Home") {
      event.preventDefault();
      resetDragOffset();
    }
  };

  return (
    <dialog
      id={id}
      ref={dialogRef}
      className={`app-drawer app-drawer-${placement} app-drawer-mobile-${mobilePlacement} app-drawer-${size} ${className}`.trim()}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onCloseRef.current();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div className="app-drawer-surface" onMouseDown={(event) => event.stopPropagation()}>
        {draggable && (
          <button
            className="app-drawer-drag-handle"
            type="button"
            aria-label={`Move ${dragLabel}`}
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home"
            title="Drag to move. Use arrow keys to move or Home to reset."
            onPointerDown={startDrag}
            onPointerMove={updateDrag}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onKeyDown={moveWithKeyboard}
          >
            <GripHorizontal size={18} aria-hidden="true" />
          </button>
        )}
        {children}
      </div>
    </dialog>
  );
}
