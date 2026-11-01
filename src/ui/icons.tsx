/** Inline SVG icons (skill style-cartouche §3): never emoji. */

const props = { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true } as const;

export const IconOpen = () => (
  <svg {...props}><path d="M9 3h4v4M13 3 7 9M11 9.5V13H3V5h3.5" /></svg>
);

export const IconSeen = () => (
  <svg {...props}><path d="m3 8.5 3 3 7-7" /></svg>
);

export const IconTopics = () => (
  <svg {...props}><path d="M3 4h10M3 8h10M3 12h6" /></svg>
);

export const IconStop = () => (
  <svg {...props}><rect x="4" y="4" width="8" height="8" /></svg>
);

export const IconRead = () => (
  <svg {...props}><path d="M2 4.5c2-1 4-1 6 0v8c-2-1-4-1-6 0zM8 4.5c2-1 4-1 6 0v8c-2-1-4-1-6 0z" /></svg>
);

export const IconAdd = () => (
  <svg {...props}><path d="M8 3v10M3 8h10" /></svg>
);

export const IconRemove = () => (
  <svg {...props}><path d="m4 4 8 8M12 4l-8 8" /></svg>
);
