interface ErudozaMarkProps {
  className?: string;
  title?: string;
}

export default function ErudozaMark({ className, title }: ErudozaMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 72 72"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title && <title>{title}</title>}
      <path className="erudoza-star" d="M36 1.8c1.5 6 4.2 8.7 10.2 10.2-6 1.5-8.7 4.2-10.2 10.2-1.5-6-4.2-8.7-10.2-10.2C31.8 10.5 34.5 7.8 36 1.8Z" />
      <circle className="erudoza-dot erudoza-dot-teal" cx="36" cy="27" r="2.7" />
      <circle className="erudoza-dot erudoza-dot-blue" cx="36" cy="34" r="2.15" />
      <circle className="erudoza-dot erudoza-dot-coral" cx="36" cy="40" r="1.65" />
      <path className="erudoza-leaf erudoza-leaf-teal" d="M33.7 59.2C28.6 49.5 19.3 43 5.3 41.4V25.1c14.2 1.5 24.3 8.7 28.4 20.2v13.9Z" />
      <path className="erudoza-leaf erudoza-leaf-blue" d="M38.3 59.2c5.1-9.7 14.4-16.2 28.4-17.8V25.1c-14.2 1.5-24.3 8.7-28.4 20.2v13.9Z" />
      <path className="erudoza-leaf erudoza-leaf-base" d="M33.8 69.5C26.6 60.8 16.9 56.1 4.1 55.3V44.7c13.5.9 23.5 6 29.7 15.1v9.7Z" />
      <path className="erudoza-leaf erudoza-leaf-base" d="M38.2 69.5c7.2-8.7 16.9-13.4 29.7-14.2V44.7c-13.5.9-23.5 6-29.7 15.1v9.7Z" />
    </svg>
  );
}
