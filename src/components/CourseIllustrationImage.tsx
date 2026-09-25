"use client";

import Image from "next/image";
import type { CourseIllustration } from "@/lib/course-types";

interface CourseIllustrationImageProps {
  illustration?: CourseIllustration | null;
  /** Describes the subject, not the pixels: the art is text-free by design. */
  alt: string;
  className?: string;
  eager?: boolean;
}

/**
 * Renders a cached Tier B/C course illustration (module or lesson art).
 * Returns null when there is no art — imagery is enhancement only and the
 * surrounding layout must work without it.
 */
export default function CourseIllustrationImage({ illustration, alt, className, eager = false }: CourseIllustrationImageProps) {
  if (!illustration?.assetId || !/^[a-f0-9]{32}$/.test(illustration.assetId)) return null;
  return (
    <figure className={className ?? "course-illustration"}>
      <Image
        src={`/api/course-illustrations/${illustration.assetId}?v=${illustration.version ?? 1}`}
        alt={alt}
        width={640}
        height={640}
        unoptimized
        decoding="async"
        loading={eager ? "eager" : "lazy"}
      />
    </figure>
  );
}
