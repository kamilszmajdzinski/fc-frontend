// Line icons from the design (24x24, 1.5px stroke).
const PATHS = {
  bag: 'M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6zm-1 4h14M8.5 10a3.5 3.5 0 007 0',
  book: 'M4 19.5C4 18.1 5.1 17 6.5 17H20V2H6.5A2.5 2.5 0 004 4.5v15zm0 0A2.5 2.5 0 006.5 22H20v-5H6.5',
  chart: 'M18 20V10M12 20V4M6 20v-6',
  plus: 'M12 4v16M4 12h16',
  x: 'M18 6L6 18M6 6l12 12',
  down: 'M6 9l6 6 6-6',
  edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6',
  info: 'M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10zM12 8v4M12 16h.01',
  arrow: 'M5 12h14M12 5l7 7-7 7',
  back: 'M19 12H5M12 19l-7-7 7-7',
  check: 'M20 6L9 17l-5-5',
  cake: 'M12 2a5 5 0 015 5v1H7V7a5 5 0 015-5zM3 13h18v8H3zM3 13c0-2.2 1.8-4 4-4h10c2.2 0 4 1.8 4 4',
  box: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12',
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
