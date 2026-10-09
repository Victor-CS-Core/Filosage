"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import type { LearnerStorageUser } from "@/lib/learner-storage";
import { learnerRequest } from "@/lib/learner-storage";

interface PreparationSummary {
  featureEnabled: boolean;
  prepareEnabled: boolean;
  summary: { total: number; generated: number; ready: number; failed: number };
  lessons: Array<{
    id: string;
    title: string;
    state: "not_generated" | "not_prepared" | "ready" | "failed";
    lessonVersion: string | null;
    preparedAt: string | null;
    componentTypes: string[];
  }>;
}

const STATE_LABELS: Record<PreparationSummary["lessons"][number]["state"], string> = {
  not_generated: "Lesson not generated",
  not_prepared: "Not prepared",
  ready: "Spark ready",
  failed: "Preparation failed",
};

export default function CreatorSparkStatus({ user, courseId, topic }: {
  user: LearnerStorageUser;
  courseId: string;
  topic: string;
}) {
  const [revision, setRevision] = useState(0);
  const requestKey = `${user.uid}:${courseId}:${revision}`;
  const [record, setRecord] = useState<{ key: string; data: PreparationSummary | null; error: string | null }>({ key: "", data: null, error: null });
  const [preparingLessonId, setPreparingLessonId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void learnerRequest(user, `/api/spark/courses/${encodeURIComponent(courseId)}/preparation`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as PreparationSummary & { error?: string };
        if (!response.ok) throw new Error(body.error || "Spark preparation status could not be loaded.");
        return body;
      })
      .then((data) => setRecord({ key: requestKey, data, error: null }))
      .catch((error) => {
        if (!controller.signal.aborted) setRecord({ key: requestKey, data: null, error: error instanceof Error ? error.message : "Spark preparation status could not be loaded." });
      });
    return () => controller.abort();
  }, [courseId, requestKey, user]);

  const prepare = async (lessonId: string) => {
    setPreparingLessonId(lessonId);
    try {
      const response = await learnerRequest(user, `/api/spark/lessons/${encodeURIComponent(lessonId)}/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, lessonId, locale: navigator.language || "en" }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Spark preparation could not finish.");
      setRevision((value) => value + 1);
    } catch (error) {
      setRecord({ key: requestKey, data: record.key === requestKey ? record.data : null, error: error instanceof Error ? error.message : "Spark preparation could not finish." });
    } finally {
      setPreparingLessonId(null);
    }
  };

  const current = record.key === requestKey ? record : null;
  if (!current) return <div className="creator-spark-loading" aria-live="polite"><LoaderCircle className="spin" size={16} /> Loading Spark preparation</div>;
  if (!current.data) return <p className="form-error" role="alert"><CircleAlert size={15} /> {current.error}</p>;
  const data = current.data;

  return (
    <section className="creator-spark-status" aria-labelledby="creator-spark-title">
      <header><div><span><Sparkles size={17} /> Spark preparation</span><h3 id="creator-spark-title">{data.summary.ready} of {data.summary.generated} generated lessons ready</h3></div><small>{data.featureEnabled ? data.prepareEnabled ? "Preparation available" : "Preparation paused" : "Spark rollout disabled"}</small></header>
      {current.error && <p className="form-error" role="alert"><CircleAlert size={15} /> {current.error}</p>}
      <ul>{data.lessons.map((lesson) => <li key={lesson.id}>
        <div className="creator-spark-lesson"><span className={lesson.state === "ready" ? "is-ready" : ""}>{lesson.state === "ready" ? <CircleCheck size={15} /> : <CircleAlert size={15} />} {STATE_LABELS[lesson.state]}</span><strong>{lesson.title}</strong>{lesson.componentTypes.length > 0 && <small>{lesson.componentTypes.join(" · ")}</small>}</div>
        <div className="creator-spark-actions">
          {lesson.state === "ready" && <Link className="button button-quiet button-small" href={`/course/${encodeURIComponent(topic)}/lesson/${lesson.id}?id=${encodeURIComponent(courseId)}&spark=1`}>Preview</Link>}
          {lesson.state !== "not_generated" && lesson.state !== "ready" && data.prepareEnabled && <button className="button button-secondary button-small" type="button" disabled={preparingLessonId !== null} onClick={() => void prepare(lesson.id)}>{preparingLessonId === lesson.id ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} Prepare</button>}
        </div>
      </li>)}</ul>
    </section>
  );
}