import React from 'react';

const paths = {
  search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
  assistant: <><path d="M12 3 14 9l6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" /><path d="m18 3 .7 2.3L21 6l-2.3.7L18 9l-.7-2.3L15 6l2.3-.7L18 3Z" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  dense: <><rect x="3" y="5" width="5" height="5" rx="1" /><rect x="10" y="5" width="5" height="5" rx="1" /><rect x="17" y="5" width="4" height="5" rx="1" /><rect x="3" y="14" width="5" height="5" rx="1" /><rect x="10" y="14" width="5" height="5" rx="1" /><rect x="17" y="14" width="4" height="5" rx="1" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 3.5-6 8-6s7.2 2 8 6" /></>,
  building: <><path d="M4 21V5l8-3 8 3v16" /><path d="M9 21v-4h6v4M8 8h1m6 0h1M8 12h1m6 0h1" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7-.8-1.8.9-2-2.1-2.1-2 .9-1.8-.8L10.5 2h-3l-.7 2-1.8.8-2-.9L.9 6l.9 2-.8 1.8-2 .7v3l2 .7.8 1.8-.9 2L3 20.1l2-.9 1.8.8.7 2h3l.7-2 1.8-.8 2 .9 2.1-2.1-.9-2 .8-1.8 2-.7Z" transform="translate(2 0) scale(.83)" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></>,
  refresh: <><path d="M20 7v5h-5" /><path d="M18.5 16a8 8 0 1 1 .8-7" /></>,
  folder: <path d="M3 6h7l2 2h9v11H3z" />,
  code: <><path d="m8 9-3 3 3 3m8-6 3 3-3 3m-3-8-2 10" /></>,
  docs: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></>,
  tools: <><path d="m14 6 4-3 3 3-3 4" /><path d="m16 8-9 9-3 4 4-1 9-9" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  link: <><path d="m9 15 6-6" /><path d="M7 17H5a4 4 0 0 1 0-8h4M15 7h4a4 4 0 0 1 0 8h-4" /></>,
  shield: <path d="M12 2 20 5v6c0 5-3.2 8.2-8 11-4.8-2.8-8-6-8-11V5z" />,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  moon: <path d="M20 15.2A8 8 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />,
  undo: <><path d="M9 7 4 12l5 5"/><path d="M5 12h8a7 7 0 0 1 7 7"/></>,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  minus: <path d="M5 12h14" />,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
};
export default function Icon({ name, size = 20, className = '' }) { return <svg className={`ui-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z" opacity=".08" fill="currentColor" stroke="none" />{paths[name] || paths.link}</svg>; }
export function ContentIcon({ value, size = 22 }) { if (String(value || '').startsWith('icon:')) return <Icon name={String(value).slice(5)} size={size} />; return <span className="legacy-icon" aria-hidden="true">{value || '🔗'}</span>; }
