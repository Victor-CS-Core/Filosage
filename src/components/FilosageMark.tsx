import Image from "next/image";

interface FilosageMarkProps {
  className?: string;
  title?: string;
}

export default function FilosageMark({ className, title }: FilosageMarkProps) {
  return (
    <span
      className={`filosage-mark ${className ?? ""}`.trim()}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <Image className="filosage-mark-light" src="/brand/logo/filosage-theme-light.png" alt="" width={600} height={600} />
      <Image className="filosage-mark-dark" src="/brand/logo/filosage-theme-dark.png" alt="" width={600} height={600} />
    </span>
  );
}
