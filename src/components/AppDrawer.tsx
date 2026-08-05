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

type DrawerPlacement = "end" | "bottom";
type MobileDrawerPlacement = "end" | "bottom" | "full";
type DrawerSize = "compact" | "medium" | "wide";

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
  className?: string;
  children: ReactNode;
}

const DRAWER_EXIT_MS = 160;
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
  className = "",
  children,
}: AppDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openFrameRef = useRef<number | null>(null);
  const unlockScrollRef = useRef<(() => void) | null>(null);

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
    if (openFrameRef.current !== null) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const releaseScrollLock = () => {
      unlockScrollRef.current?.();
      unlockScrollRef.current = null;
    };
    const finishClose = () => {
      if (dialog.open) dialog.close();
      dialog.dataset.state = "closed";
      dialog.inert = false;
      releaseScrollLock();
    };

    if (open) {
      if (!unlockScrollRef.current) {
        unlockScrollRef.current = lockDrawerScroll();
      }
      if (dialog.open && !dialog.matches(":modal")) dialog.close();
      dialog.inert = false;
      dialog.dataset.state = reduceMotion ? "open" : "opening";
      if (!dialog.open) dialog.showModal();
      if (!reduceMotion) {
        openFrameRef.current = requestAnimationFrame(() => {
          if (dialog.open) dialog.dataset.state = "open";
          openFrameRef.current = null;
        });
      }
      return;
    }

    if (!dialog.open) {
      dialog.dataset.state = "closed";
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
      dialog.dataset.state = "closing";
      closeTimerRef.current = setTimeout(finishClose, DRAWER_EXIT_MS);
      openFrameRef.current = null;
    });
  }, [open]);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (openFrameRef.current !== null) cancelAnimationFrame(openFrameRef.current);
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    unlockScrollRef.current?.();
    unlockScrollRef.current = null;
  }, []);

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
        {children}
      </div>
    </dialog>
  );
}
