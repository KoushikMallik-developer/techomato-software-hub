// The Techomato mark: a tomato with a leaf stem and code chevrons, with the lowercase wordmark.
export function TomatoMark({ size = 28, className = '' }) {
  return (
    <svg className={className} viewBox="0 0 34 34" width={size} height={size} aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx="17" cy="19" r="14" fill="#C8381F" />
      <path d="M13 5c2 2 6 2 8 0" stroke="#2F5D3A" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M12.5 15.5 9 19l3.5 3.5M21.5 15.5 25 19l-3.5 3.5" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
