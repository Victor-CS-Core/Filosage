export function UnsafeProps(props: { html: string }) {
  // ruleid: filosage-react-unsafe-html
  return <div dangerouslySetInnerHTML={{ __html: props.html }} />;
}

export function UnsafeDestructured({ html }: { html: string }) {
  // ruleid: filosage-react-unsafe-html
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export function UnsafeDestructuredAlias({ html: markup }: { html: string }) {
  // ruleid: filosage-react-unsafe-html
  return <div dangerouslySetInnerHTML={{ __html: markup }} />;
}

export function SafeDestructuredText({ html }: { html: string }) {
  // ok: filosage-react-unsafe-html
  return <div>{html}</div>;
}

export function SafeText(props: { html: string }) {
  // ok: filosage-react-unsafe-html
  return <div>{props.html}</div>;
}

export function SafeConstant() {
  // ok: filosage-react-unsafe-html
  return <div dangerouslySetInnerHTML={{ __html: "<strong>Fixed text</strong>" }} />;
}
