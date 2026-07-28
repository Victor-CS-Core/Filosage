import Image from "next/image";
import type { Course } from "@/lib/course-types";

interface CourseBannerProps {
  course: Pick<Course, "id" | "courseId" | "topic" | "category" | "banner">;
  variant: "card" | "hero" | "compact";
  eager?: boolean;
}

function hashTopic(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function BannerPattern({ pattern }: { pattern: number }) {
  if (pattern === 1) {
    return (
      <svg className="course-banner-fallback" viewBox="0 0 900 450" aria-hidden="true">
        <path d="M88 336L260 214L418 290L598 128L798 222" />
        <path className="is-soft" d="M260 214L330 90M418 290L340 380M598 128L730 86" />
        <g>
          <circle cx="88" cy="336" r="18" />
          <circle cx="260" cy="214" r="27" />
          <circle cx="418" cy="290" r="21" />
          <circle cx="598" cy="128" r="31" />
          <circle cx="798" cy="222" r="17" />
          <circle cx="330" cy="90" r="14" />
          <circle cx="340" cy="380" r="14" />
          <circle cx="730" cy="86" r="14" />
        </g>
      </svg>
    );
  }

  if (pattern === 2) {
    return (
      <svg className="course-banner-fallback" viewBox="0 0 900 450" aria-hidden="true">
        <path d="M96 352H802M140 352V266H244V352M292 352V194H396V352M444 352V118H548V352M596 352V230H700V352" />
        <path className="is-emphasis" d="M116 250C250 216 342 276 456 174C548 92 650 120 784 70" />
        <circle cx="784" cy="70" r="15" />
      </svg>
    );
  }

  return (
    <svg className="course-banner-fallback" viewBox="0 0 900 450" aria-hidden="true">
      <circle className="is-soft" cx="668" cy="210" r="150" />
      <circle cx="668" cy="210" r="94" />
      <circle className="is-filled" cx="668" cy="210" r="28" />
      <circle className="is-filled is-soft" cx="528" cy="154" r="17" />
      <path className="is-emphasis" d="M76 346C226 134 374 366 554 156" />
      <path className="is-soft" d="M76 378H574" />
    </svg>
  );
}

export default function CourseBanner({ course, variant, eager = false }: CourseBannerProps) {
  const hash = hashTopic(`${course.topic}|${course.category ?? ""}`);
  const assetId = course.banner?.assetId;
  return (
    <div
      className={`course-banner course-banner-${variant} course-banner-tone-${hash % 4}`}
      data-generated={assetId ? "true" : "false"}
      aria-hidden="true"
    >
      <BannerPattern pattern={hash % 3} />
      {assetId && (
        <Image
          src={`/api/course-banners/${assetId}?v=${course.banner?.version ?? 1}`}
          alt=""
          fill
          unoptimized
          sizes={variant === "hero" ? "(max-width: 760px) 100vw, 1240px" : "(max-width: 620px) 100vw, 320px"}
          decoding="async"
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
        />
      )}
      <span className="course-banner-sheen" />
    </div>
  );
}
