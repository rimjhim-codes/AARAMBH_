"use client";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-lockup">
      <svg className={compact ? "brand-mark brand-mark-sm" : "brand-mark"} viewBox="0 0 40 40" aria-hidden="true">
        <defs>
          <linearGradient id="aarambh-mark" x1="5" x2="35" y1="5" y2="35" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1d4f91" />
            <stop offset="1" stopColor="#1769c2" />
          </linearGradient>
        </defs>
        <path d="M20 4 35 33H27l-3-6h-8l-3 6H5L20 4Zm0 10-2.5 7h5L20 14Z" fill="url(#aarambh-mark)" />
          <circle cx="31" cy="10" r="3" fill="#e46d38" />
      </svg>
      {!compact ? <span className="brand-wordmark">Aarambh</span> : null}
    </span>
  );
}
