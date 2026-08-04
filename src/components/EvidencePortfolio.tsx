"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, FileCheck2 } from "lucide-react";
import type { CourseProgress } from "@/lib/learning-types";

export default function EvidencePortfolio({ progress }: { progress: CourseProgress[] }) {
  const router = useRouter();
  const evidence = progress.flatMap((course) => Object.values(course.lessons).flatMap((lesson) => lesson.experienceEvidence ? [{ course, lesson, evidence: lesson.experienceEvidence }] : []))
    .sort((left, right) => right.lesson.lastStudiedAt.localeCompare(left.lesson.lastStudiedAt));

  return <section className="evidence-portfolio" aria-labelledby="evidence-portfolio-title">
    <header className="panel-heading"><div><BriefcaseBusiness size={19} /><span><p className="overline">Evidence portfolio</p><h2 id="evidence-portfolio-title">What you can now produce</h2></span></div><span>{evidence.length} artifact{evidence.length === 1 ? "" : "s"}</span></header>
    {evidence.length ? <ol>
      {evidence.slice(0, 10).map(({ course, lesson, evidence: item }) => <li key={`${course.courseId}-${lesson.lessonId}`}>
        <span className="evidence-marker"><FileCheck2 size={16} /></span>
        <button type="button" onClick={() => router.push(`/course/${encodeURIComponent(course.topic)}/lesson/${lesson.lessonId}?id=${course.courseId}`)}>
          <span><small>{course.topic} · {item.type.replace("-", " ")}</small><strong>{lesson.lessonTitle}</strong><p>{item.response.length > 240 ? `${item.response.slice(0, 237)}…` : item.response}</p><em>{new Date(lesson.lastStudiedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })} · {lesson.performanceBand ?? "developing"}</em></span>
          <ArrowRight size={16} />
        </button>
      </li>)}
    </ol> : <div className="portfolio-empty"><FileCheck2 size={23} /><div><strong>Your work will collect here.</strong><p>Complete an active lesson to save an explanation, decision, or artifact as evidence of capability.</p></div></div>}
  </section>;
}
