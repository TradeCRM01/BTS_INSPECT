interface BtsMarkProps {
  size?: number;
  className?: string;
}

/**
 * Product mark for BTS Inspect. A blue tile with a folded field document
 * and a check — readable at 24–32px in the navy header and at login size.
 */
export function BtsMark({ size = 32, className }: BtsMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect width="32" height="32" rx="6" fill="#2E75B6" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="5.5" stroke="white" strokeOpacity="0.22" />
      <path
        d="M10 8.25h8.6L22 11.7V23.75H10V8.25Z"
        stroke="white"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M18.6 8.25V11.7H22"
        stroke="white"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M13.1 17.15 15.35 19.4 19.7 14.2"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
