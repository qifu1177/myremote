/**
 * Kleines, projekt-eigenes Icon-Set als Ersatz für die zuvor direkt in den
 * Buttons verwendeten Unicode-Emoji (🖥️📖⚙️📁💬⛶✏️🗑️✅✖️⭐👁️🙈📋🔄 …).
 *
 * Warum eigene SVGs statt einer Emoji-"Icon-Library":
 * - Emoji-Glyphen ignorieren `color`/`currentColor` (Farbe kommt von der
 *   Systemschriftart, nicht vom Button-Theme) -> aktive/hover-Zustände
 *   (Teal-Akzent) haben keine Wirkung auf das Icon.
 * - Emoji-Metriken (Baseline, Eigenabstand, plattformabhängige Breite)
 *   weichen von echten Vektor-Icons ab -> in zentrierten Icon-Buttons
 *   wirken sie uneinheitlich groß/versetzt.
 * - Manche Zeichen haben je nach OS/Font keine garantierte Darstellung.
 *
 * Alle Icons sind einheitliche 24x24-Outline-SVGs mit `stroke="currentColor"`,
 * damit sie exakt die Button-Textfarbe (inkl. hover/active) übernehmen und
 * sich sauber skalieren lassen.
 */
import type { SVGProps } from "react";

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function Svg({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function MonitorIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Svg>
  );
}

export function BookIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </Svg>
  );
}

export function SettingsIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </Svg>
  );
}

export function FolderIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </Svg>
  );
}

export function ChatIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M21 12a8 8 0 1 1-3.5-6.6" />
      <path d="M21 4l-9 9" />
      <path d="M3 20l1.5-4.5A8 8 0 0 1 21 12" />
    </Svg>
  );
}

export function ExpandIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </Svg>
  );
}

export function PencilIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

export function XIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  );
}

export function StarIcon({ filled, ...props }: IconProps & { filled?: boolean }): JSX.Element {
  return (
    <Svg {...props} fill={filled ? "currentColor" : "none"}>
      <path d="M12 2.5l3.09 6.26 6.91 1-5 4.87 1.18 6.87L12 18.27l-6.18 3.23L7 14.63l-5-4.87 6.91-1L12 2.5Z" />
    </Svg>
  );
}

export function EyeIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function EyeOffIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M9.9 4.24A10.9 10.9 0 0 1 12 5c7 0 10.5 7 10.5 7a13.2 13.2 0 0 1-3.09 4.06M6.6 6.6C3.5 8.4 1.5 12 1.5 12s3.5 7 10.5 7a10.6 10.6 0 0 0 4.24-.86" />
      <path d="M9.9 14.1a3 3 0 0 0 4.2-4.2" />
      <path d="M2 2l20 20" />
    </Svg>
  );
}

export function CopyIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Svg>
  );
}

export function RefreshIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </Svg>
  );
}

export function ArrowRightIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}
