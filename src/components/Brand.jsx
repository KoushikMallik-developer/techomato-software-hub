// The Techomato mark: a ripe tomato with a leafy cap.
export function TomatoMark({ size = 28, className = '' }) {
  return (
    <svg className={className} viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" style={{ flex: 'none' }}>
      <defs>
        <radialGradient id="tm-body" cx="38%" cy="32%" r="75%"><stop offset="0" stopColor="#ff6b4f" /><stop offset=".55" stopColor="#e5412d" /><stop offset="1" stopColor="#b32d1c" /></radialGradient>
      </defs>
      <ellipse cx="32" cy="37" rx="25" ry="22.5" fill="url(#tm-body)" />
      <ellipse cx="22" cy="28" rx="6.5" ry="4" fill="#fff" opacity=".28" transform="rotate(-28 22 28)" />
      <path d="M32 17c-2.4 3.6-7 5.2-12.5 4.2 3.2 3.4 7 4.6 12.5 4.6s9.3-1.2 12.5-4.6C39 22.2 34.4 20.6 32 17z" fill="#4c9a2a" />
      <path d="M32 17c1.2 2.4 3.2 4 6 4.7M32 17c-1.2 2.4-3.2 4-6 4.7" stroke="#2f6e1a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M32 18.5V9.5" stroke="#3b7d22" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}
