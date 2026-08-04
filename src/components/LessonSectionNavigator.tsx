"use client";

import { useEffect, useMemo, useState } from "react";
import { ListTree } from "lucide-react";

function plainHeading(value: string) {
  return value.replace(/[*_`~[\]]/g, "").replace(/\s+/g, " ").trim();
}

export default function LessonSectionNavigator({ markdown, containerId }: { markdown: string; containerId: string }) {
  const headings = useMemo(() => markdown.split("\n").flatMap((line) => {
    const match = line.match(/^#{2,3}\s+(.+)$/);
    return match ? [plainHeading(match[1])] : [];
  }).slice(0, 8), [markdown]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container || headings.length < 2) return;
    const nodes = Array.from(container.querySelectorAll<HTMLElement>("h2, h3")).slice(0, headings.length);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
      if (!visible) return;
      const index = nodes.indexOf(visible.target as HTMLElement);
      if (index >= 0) setActive(index);
    }, { rootMargin: "-22% 0px -62% 0px", threshold: 0 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [containerId, headings.length]);

  if (headings.length < 2) return null;
  const goTo = (index: number) => {
    const container = document.getElementById(containerId);
    const target = container?.querySelectorAll<HTMLElement>("h2, h3")[index];
    if (!target) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
    setActive(index);
  };

  return <nav className="lesson-section-navigator" aria-label="Lesson sections">
    <span className="lesson-section-label"><ListTree size={16} /> In this lesson</span>
    <div>
      {headings.map((heading, index) => <button type="button" className={active === index ? "is-active" : ""} aria-current={active === index ? "location" : undefined} key={`${heading}-${index}`} onClick={() => goTo(index)}><span>{index + 1}</span>{heading}</button>)}
    </div>
    <small>{active + 1} of {headings.length}</small>
  </nav>;
}
