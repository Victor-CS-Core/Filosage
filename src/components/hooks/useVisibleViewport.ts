"use client";

import { useEffect, type RefObject } from "react";

/** Keep mobile overlays inside the visible area when the keyboard pans/shrinks it. */
export function useVisibleViewport(ref: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    const element = ref.current;
    const viewport = window.visualViewport;
    if (!open || !element || !viewport) return;
    const media = window.matchMedia("(max-width: 900px)");
    let frame = 0;
    const clear = () => {
      element.style.removeProperty("--overlay-height");
      element.style.removeProperty("--overlay-top");
      element.style.removeProperty("--overlay-bottom");
    };
    const sync = () => {
      frame = 0;
      // Preserve the browser's normal panning and magnification during pinch zoom.
      if (!media.matches || viewport.scale !== 1) {
        clear();
        return;
      }
      element.style.setProperty("--overlay-height", `${viewport.height}px`);
      element.style.setProperty("--overlay-top", `${viewport.offsetTop}px`);
      element.style.setProperty("--overlay-bottom", `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };
    sync();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    media.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      media.removeEventListener("change", schedule);
      clear();
    };
  }, [open, ref]);
}
