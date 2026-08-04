"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface CourseDisclosureProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  description?: string;
  eyebrow: string;
  headingId: string;
  leading?: ReactNode;
  title: string;
}

export default function CourseDisclosure({
  children,
  className = "",
  contentClassName = "",
  description,
  eyebrow,
  headingId,
  leading,
  title,
}: CourseDisclosureProps) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className={`course-disclosure ${className}`.trim()}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="course-disclosure-summary">
        {leading && <span className="course-disclosure-leading">{leading}</span>}
        <span className="course-disclosure-copy">
          <span className="overline">{eyebrow}</span>
          <span className="course-disclosure-title" id={headingId} role="heading" aria-level={2}>{title}</span>
          {description && <span className="course-disclosure-description">{description}</span>}
        </span>
        <span className="course-disclosure-action" aria-hidden="true">
          {open ? "Hide" : "Show"} details <ChevronDown size={17} />
        </span>
      </summary>
      <div className={`course-disclosure-content ${contentClassName}`.trim()}>{children}</div>
    </details>
  );
}
