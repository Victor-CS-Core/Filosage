import type { ReactNode } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function textFromChildren(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textFromChildren).join("");
  if (children && typeof children === "object" && "props" in children) {
    return textFromChildren((children as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

export function supportHeadingId(children: ReactNode) {
  return textFromChildren(children)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function getSupportHeadings(body: string) {
  return [...body.matchAll(/^##\s+(.+)$/gm)].map((match) => ({
    label: match[1].trim(),
    id: match[1].toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-"),
  }));
}

export default function SupportArticleBody({ body }: { body: string }) {
  return (
    <div className="support-article-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => <h2 id={supportHeadingId(children)} tabIndex={-1}>{children}</h2>,
          h3: ({ children }) => <h3 id={supportHeadingId(children)} tabIndex={-1}>{children}</h3>,
          a: ({ href, children }) => href?.startsWith("/")
            ? <Link href={href}>{children}</Link>
            : <a href={href}>{children}</a>,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
