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

export default function AppDrawer({
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

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const body = document.body;
    const appMain = document.querySelector<HTMLElement>(".app-main");
    const previous = {
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
      appMainOverflow: appMain?.style.overflow,
    };
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (appMain) appMain.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous.rootOverflow;
      body.style.overflow = previous.bodyOverflow;
      if (appMain) appMain.style.overflow = previous.appMainOverflow ?? "";
    };
  }, [open]);

  useEffect(() => () => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`app-drawer app-drawer-${placement} app-drawer-mobile-${mobilePlacement} app-drawer-${size} ${className}`.trim()}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onCloseRef.current();
      }}
      onClose={() => {
        if (open) onCloseRef.current();
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
