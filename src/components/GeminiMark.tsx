import { useId } from 'react';

export default function GeminiMark({ size = 24 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="2" y1="6" x2="26" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#957bf1" />
          <stop offset="0.5" stopColor="#7a55ea" />
          <stop offset="1" stopColor="#6538de" />
        </linearGradient>
      </defs>
      <path
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="3.6"
        strokeLinecap="round"
        d="M3 10c3-4.5 7-4.5 11 0s8 4.5 11 0"
      />
      <path
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="3.6"
        strokeLinecap="round"
        d="M3 19c3-4.5 7-4.5 11 0s8 4.5 11 0"
        opacity="0.55"
      />
    </svg>
  );
}
