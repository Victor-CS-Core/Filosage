import type { Metadata } from "next";

interface CourseLayoutProps {
  children: React.ReactNode;
  params: Promise<{ topic: string }>;
}

function readableTopic(value: string) {
  try {
    return decodeURIComponent(value).replace(/\s+/g, " ").trim();
  } catch {
    return value.replace(/\s+/g, " ").trim();
  }
}

export async function generateMetadata({ params }: CourseLayoutProps): Promise<Metadata> {
  const topic = readableTopic((await params).topic) || "Course";
  const description = `Learn ${topic} through a structured Filosage course with explanations, guided practice, retrieval checks, and applied work.`;
  return {
    title: topic,
    description,
    openGraph: {
      title: topic,
      description,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: topic,
      description,
    },
  };
}

export default function CourseLayout({ children }: CourseLayoutProps) {
  return children;
}
