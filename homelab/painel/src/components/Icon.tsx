// Ícones 16×16, traço 1,5 px, currentColor. Se faltar algum, desenhe no mesmo grid.
const CAMINHOS: Record<string, JSX.Element> = {
  waiting: <><circle cx="8" cy="8" r="6.25" /><circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" /></>,
  running: <path d="M8 1.75a6.25 6.25 0 1 1-6.25 6.25" />,
  done: <><circle cx="8" cy="8" r="6.25" /><path d="m5.25 8.25 1.9 1.9 3.6-4" /></>,
  failed: <><circle cx="8" cy="8" r="6.25" /><path d="M8 4.75v3.75M8 10.9v.35" /></>,
  scheduled: <><circle cx="8" cy="8" r="6.25" /><path d="M8 4.75V8l2.25 1.5" /></>,
  paused: <><circle cx="8" cy="8" r="6.25" /><path d="M6.5 5.75v4.5M9.5 5.75v4.5" /></>,
  chevron: <path d="m6 3.75 4.25 4.25L6 12.25" />,
  'chevron-left': <path d="M10 3.75 5.75 8 10 12.25" />,
  retry: <><path d="M2.75 8a5.25 5.25 0 1 0 1.6-3.77" /><path d="M2.75 2.75v2.5h2.5" /></>,
  search: <><circle cx="7" cy="7" r="4.25" /><path d="m10.25 10.25 3 3" /></>,
  command: <path d="M6 6V4.5A1.5 1.5 0 1 0 4.5 6H6Zm0 0h4m-4 0v4m4-4V4.5A1.5 1.5 0 1 1 11.5 6H10Zm0 0v4m0 0h1.5a1.5 1.5 0 1 1-1.5 1.5V10Zm0 0H6m0 0v1.5A1.5 1.5 0 1 1 4.5 10H6Z" />,
  plus: <path d="M8 3.25v9.5M3.25 8h9.5" />,
  close: <path d="m4.25 4.25 7.5 7.5m0-7.5-7.5 7.5" />,
  menu: <path d="M2.75 4.5h10.5M2.75 8h10.5M2.75 11.5h10.5" />,
  panel: <><rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.5" /><path d="M10 2.75v10.5" /></>,
  doc: <><path d="M4 1.75h5l3 3v9.5H4z" /><path d="M9 1.75v3h3" /></>,
  upload: <><path d="M8 10.25V2.75M5 5.5l3-2.75 3 2.75" /><path d="M2.75 10v3.25h10.5V10" /></>,
  download: <><path d="M8 2.75v7.5M5 7.5l3 2.75 3-2.75" /><path d="M2.75 10v3.25h10.5V10" /></>,
};

export type IconName = keyof typeof CAMINHOS;

export function Icon({ name, size = 16, title, className }: { name: IconName; size?: number; title?: string; className?: string }) {
  return (
    <svg
      className={`hm-icon hm-icon-${name}${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {CAMINHOS[name]}
    </svg>
  );
}
