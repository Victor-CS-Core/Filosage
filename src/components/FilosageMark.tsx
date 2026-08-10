"use client";

import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";

interface FilosageMarkProps {
  className?: string;
  title?: string;
}

export default function FilosageMark({ className, title }: FilosageMarkProps) {
  const { theme, restored } = useTheme();
  const inverse = className?.split(/\s+/).includes("is-inverse") === true;
  const activeTheme = inverse ? "dark" : theme;
  return (
    <span
      className={`filosage-mark ${className ?? ""}`.trim()}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {restored && (
        <Image
          src={`/brand/logo/filosage-theme-${activeTheme}.png`}
          alt=""
          width={600}
          height={600}
          loading="eager"
          fetchPriority="high"
          sizes="96px"
        />
      )}
    </span>
  );
}
