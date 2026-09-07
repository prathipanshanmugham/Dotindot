export const DotindotMark = ({ size = 36, light = false }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="dotGrad" x1="0" y1="48" x2="48" y2="0" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F26B21" />
        <stop offset="1" stopColor="#FBA834" />
      </linearGradient>
    </defs>
    <path
      d="M12 3H23C35.15 3 45 12.4 45 24C45 35.6 35.15 45 23 45H12C8.7 45 6 42.3 6 39V9C6 5.7 8.7 3 12 3Z"
      fill={light ? "#FFFFFF" : "url(#dotGrad)"}
    />
    <circle cx="25" cy="24" r="6.5" fill={light ? "#F26B21" : "white"} />
  </svg>
);

export const DotindotLogo = ({ size = 32, textClass = "text-xl" }) => (
  <div className="flex items-center gap-2.5 select-none" data-testid="dotindot-logo">
    <DotindotMark size={size} />
    <span
      className={`${textClass} font-extrabold tracking-tight bg-gradient-to-r from-[#F26B21] to-[#FBA834] bg-clip-text text-transparent`}
    >
      dotindot.
    </span>
  </div>
);
