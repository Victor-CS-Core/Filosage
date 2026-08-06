import type { ReactNode } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SupportEmailLink from "@/components/support/SupportEmailLink";

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
          p: ({ node, children }) => node?.children.length === 1
            && node.children[0].type === "element"
            && node.children[0].tagName === "img"
            ? <>{children}</>
            : <p>{children}</p>,
          h2: ({ children }) => <h2 id={supportHeadingId(children)} tabIndex={-1}>{children}</h2>,
          h3: ({ children }) => <h3 id={supportHeadingId(children)} tabIndex={-1}>{children}</h3>,
          a: ({ href, children }) => href?.startsWith("/")
            ? <Link href={href}>{children}</Link>
            : href?.startsWith("mailto:")
              ? <SupportEmailLink href={href}>{children}</SupportEmailLink>
              : <a href={href}>{children}</a>,
          img: ({ src, alt }) => (
            <figure className="support-article-visual">
              {/* Support screenshots are local, source-controlled documentation evidence. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={alt ?? ""} loading="lazy" />
              {alt ? <figcaption>{alt}</figcaption> : null}
            </figure>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
