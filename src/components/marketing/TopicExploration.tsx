import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const topics = ["Product strategy", "SQL reasoning", "Experiment design", "Systems thinking", "Data storytelling", "Decision making"];

export default function TopicExploration() {
  return (
    <section className="marketing-topic-section" aria-labelledby="topics-title">
      <div className="marketing-topic-visual">
        <Image
          src="/brand/illustrations/abstract-learning.svg"
          alt="Connected ideas converging into a clear learning path"
          width={960}
          height={720}
          sizes="(max-width: 820px) calc(100vw - 40px), 52vw"
          loading="lazy"
        />
      </div>
      <div className="marketing-topic-copy">
        <h2 id="topics-title">Follow curiosity without losing direction.</h2>
        <p>Explore a subject from the question that brought you there. Inspect the path before you begin and move through related ideas at your own pace.</p>
        <div className="marketing-topic-links" aria-label="Topic exploration examples">
          {topics.map((topic) => <Link key={topic} href={`/library?q=${encodeURIComponent(topic)}`}>{topic} <ArrowRight size={14} /></Link>)}
        </div>
        <Link className="marketing-inline-link" href="/library">Browse the public learning library <ArrowRight size={16} /></Link>
      </div>
    </section>
  );
}
