type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

const base = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function HomeIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <path d="M3 8.5L10 3l7 5.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V8.5z" />
      <path d="M7 18v-6h6v6" />
    </svg>
  );
}

export function FileTextIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <path d="M12 2H5a1 1 0 00-1 1v14a1 1 0 001 1h10a1 1 0 001-1V7l-4-5z" />
      <path d="M12 2v5h5M7 10h6M7 13h4" />
    </svg>
  );
}

export function InboxIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <path d="M2 12l2.5-7h11L18 12v5H2v-5z" />
      <path d="M2 12h4.5l1.5 2h4l1.5-2H18" />
    </svg>
  );
}

export function SettingsIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} {...base} {...p}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function BellIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <path d="M10 2a6 6 0 00-6 6v4l-1 2h14l-1-2V8a6 6 0 00-6-6z" />
      <path d="M8 16a2 2 0 004 0" />
    </svg>
  );
}

export function SearchIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13.5 13.5l3.5 3.5" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 16, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <path d="M10 4L6 8l4 4" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 16, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 16, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export function PlusIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

export function XIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

export function MaximizeIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" />
    </svg>
  );
}

export function CheckIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <path d="M4 10l4.5 5 7.5-9" />
    </svg>
  );
}

export function EnvelopeIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <rect x="2" y="4" width="16" height="12" rx="1" />
      <path d="M2 7l8 5 8-5" />
    </svg>
  );
}

export function ArrowUpIcon({ size = 16, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <path d="M8 12V4M4 8l4-4 4 4" />
    </svg>
  );
}

export function ArrowDownIcon({ size = 16, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <path d="M8 4v8M4 8l4 4 4-4" />
    </svg>
  );
}

export function MoreHorizontalIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <circle cx="4.5" cy="10" r="1" fill="currentColor" />
      <circle cx="10" cy="10" r="1" fill="currentColor" />
      <circle cx="15.5" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

export function PaperclipIcon({ size = 16, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <path d="M11 6.5L7 10.5a1.5 1.5 0 002.12 2.12l5-5a3 3 0 00-4.24-4.24l-5.5 5.5a4.5 4.5 0 006.36 6.36L13 13" />
    </svg>
  );
}

export function GripIcon({ size = 16, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <circle cx="6" cy="4" r="0.6" fill="currentColor" />
      <circle cx="10" cy="4" r="0.6" fill="currentColor" />
      <circle cx="6" cy="8" r="0.6" fill="currentColor" />
      <circle cx="10" cy="8" r="0.6" fill="currentColor" />
      <circle cx="6" cy="12" r="0.6" fill="currentColor" />
      <circle cx="10" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function SunIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M14.36 5.64l1.42-1.42M4.22 15.78l1.42-1.42" />
    </svg>
  );
}

export function MoonIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <path d="M17.5 11.05A7.5 7.5 0 117.95 2.5a5.85 5.85 0 009.55 8.55z" />
    </svg>
  );
}

export function ComposeIcon({ size = 16, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <path d="M11 2l3 3-8 8H3v-3l8-8z" />
      <path d="M9.5 3.5l3 3" />
    </svg>
  );
}

export function InfoIcon({ size = 16, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} {...base} {...p}>
      <circle cx="10" cy="10" r="8" />
      <path d="M10 9v4.5" />
      <path d="M10 6.5h.01" />
    </svg>
  );
}
