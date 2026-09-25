import Image from "next/image";
import CourseArtwork, { hashCourseIdentity } from "@/components/CourseArtwork";
import TierSeal from "@/components/TierSeal";
import type { Course } from "@/lib/course-types";

interface CourseBannerProps {
  course: Pick<Course, "id" | "courseId" | "topic" | "category" | "banner" | "creatorTier">;
  variant: "card" | "hero" | "compact" | "deck";
  eager?: boolean;
}

export default function CourseBanner({ course, variant, eager = false }: CourseBannerProps) {
  const seed = `${course.topic}|${course.category ?? ""}`;
  const hash = hashCourseIdentity(seed);
  const assetId = course.banner?.assetId;
  const seal = course.creatorTier === "plus" || course.creatorTier === "pro" ? course.creatorTier : null;
  return (
    <div
      className={`course-banner course-banner-${variant} course-banner-tone-${hash % 4}`}
      data-generated={assetId ? "true" : "false"}
    >
      <div className="course-banner-art" aria-hidden="true">
        <CourseArtwork seed={seed} />
        {assetId && (
          <Image
            src={`/api/course-banners/${assetId}?v=${course.banner?.version ?? 1}`}
            alt=""
            fill
            unoptimized
            sizes={variant === "hero" ? "(max-width: 760px) 100vw, 1240px" : variant === "deck" ? "(max-width: 760px) 100vw, 760px" : "(max-width: 620px) 100vw, 320px"}
            decoding="async"
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
          />
        )}
      </div>
      {seal && variant !== "compact" && <TierSeal tier={seal} />}
    </div>
  );
}
