import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);
/** ⓘ: abre a dica de uma métrica ou tela (ver InfoHint). */
export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.25" />
    <circle cx="12" cy="7.75" r="0.6" fill="currentColor" />
  </Icon>
);
/** Cronômetro: ícone da aplicação. */
export const StopwatchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M10 2.75h4M12 2.75V6M17.6 7.9l1.4-1.4M12 13.5V10M12 13.5l2.5 1.5" />
  </Icon>
);
/** Chamado. */
export const TicketIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 7.5A1.5 1.5 0 015 6h14a1.5 1.5 0 011.5 1.5V10a2 2 0 000 4v2.5A1.5 1.5 0 0119 18H5a1.5 1.5 0 01-1.5-1.5V14a2 2 0 000-4V7.5z" />
    <path d="M14.5 6.5v1.5M14.5 11.25v1.5M14.5 16v1.5" />
  </Icon>
);
/** Reunião. */
export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.5 19.5a6.5 6.5 0 0113 0M16 5.2a3.5 3.5 0 010 6.6M18 14.3a6.5 6.5 0 013.5 5.2" />
  </Icon>
);
/** Treinamento. */
export const CapIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 9L12 4.5 21.5 9 12 13.5 2.5 9z" />
    <path d="M6.5 11v4.5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3V11M21.5 9v5" />
  </Icon>
);
export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 8v5M12 16.5v.01" />
    <circle cx="12" cy="12" r="9" />
  </Icon>
);
export const TrendUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 16l5-5 4 4 7-7M15 8h5v5" />
  </Icon>
);
export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
  </Icon>
);
export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />
  </Icon>
);
export const XIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 7l10 10M17 7L7 17" />
  </Icon>
);
export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
export const DashIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" strokeDasharray="3 3.2" />
  </Icon>
);
export const HourglassIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9" />
  </Icon>
);
export const ChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
);
export const ChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);
export const ChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
  </Icon>
);
export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);
export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);
export const ArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
export const ArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);
export const SendIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 12l16-8-6 16-2.5-6.5L4 12z" />
  </Icon>
);
export const GridIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="7" height="7" rx="2" />
    <rect x="13" y="4" width="7" height="7" rx="2" />
    <rect x="4" y="13" width="7" height="7" rx="2" />
    <rect x="13" y="13" width="7" height="7" rx="2" />
  </Icon>
);
export const ListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </Icon>
);
export const TableIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" />
  </Icon>
);
export const TargetIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </Icon>
);
export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16zM10 20.5a2 2 0 004 0" />
  </Icon>
);
export const UndoIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11" />
  </Icon>
);
export const LayersIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4l8.5 4.5L12 13 3.5 8.5 12 4zM3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5" />
  </Icon>
);
export const BarChartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h16M7 16v-5M12 16V6M17 16v-8" />
  </Icon>
);
export const PieIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5a8.5 8.5 0 108.5 8.5H12V3.5z" />
    <path d="M15 3.8A8.5 8.5 0 0120.2 9H15V3.8z" />
  </Icon>
);

/** Bandeira: marca uma entrada da linha do tempo para chamar atenção. */
export const FlagIcon = ({ filled = false, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </Icon>
);
