import Image from "next/image";

export default function ProgressSection() {
  return (
    <section className="marketing-progress" aria-labelledby="progress-title">
      <div className="marketing-progress-copy">
        <h2 id="progress-title">Progress that says what changed.</h2>
        <p>Completion is only the beginning. Erudoza separates what a learner reports from what they recall, practice, transfer, and demonstrate.</p>
        <dl>
          <div><dt>Recall</dt><dd>Can the idea be retrieved without prompts?</dd></div>
          <div><dt>Application</dt><dd>Can it guide a realistic decision or task?</dd></div>
          <div><dt>Evidence</dt><dd>Can the outcome be explained and inspected?</dd></div>
        </dl>
      </div>
      <div className="marketing-progress-visual">
        <Image
          src="/brand/illustrations/progress-tracking.svg"
          alt="Progress ring paired with separate evidence markers"
          width={640}
          height={480}
          sizes="(max-width: 820px) calc(100vw - 40px), 52vw"
          loading="lazy"
        />
      </div>
    </section>
  );
}
