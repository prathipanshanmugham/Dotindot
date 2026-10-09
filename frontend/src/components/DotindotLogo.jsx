import { useId } from "react";
import { BRAND, MARK_PATH, MARK_VIEWBOX, WORDMARK_DOT, WORDMARK_LETTERS, WORDMARK_TRANSFORM, WORDMARK_VIEWBOX } from "@/components/brandPaths";

/** The "D" mark. `size` is the height in px; `light` renders it white for orange/dark backgrounds. */
export const DotindotMark = ({ size = 36, light = false, className = "", title = "dotindot" }) => {
  const [w, h] = MARK_VIEWBOX;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} height={size} width={(size * w) / h} className={`shrink-0 ${className}`} role="img" aria-label={title} data-testid="dotindot-mark">
      <path fillRule="evenodd" fill={light ? "#FFFFFF" : BRAND.mark} d={MARK_PATH} />
    </svg>
  );
};

/** The "dotindot." wordmark. `height` in px; `light` renders it white. */
export const DotindotWordmark = ({ height = 24, light = false, className = "", title = "dotindot." }) => {
  const id = useId().replace(/:/g, "");
  const [w, h] = WORDMARK_VIEWBOX;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} height={height} width={(height * w) / h} className={`shrink-0 ${className}`} role="img" aria-label={title} data-testid="dotindot-wordmark">
      {!light && (
        <defs>
          <linearGradient id={`wm-${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={BRAND.wordFrom} />
            <stop offset="1" stopColor={BRAND.wordTo} />
          </linearGradient>
        </defs>
      )}
      <g transform={WORDMARK_TRANSFORM}>
        <path fill={light ? "#FFFFFF" : `url(#wm-${id})`} d={WORDMARK_LETTERS} />
        <path fill={light ? "#FFFFFF" : BRAND.dot} d={WORDMARK_DOT} />
      </g>
    </svg>
  );
};

/** Stacked lockup (mark above wordmark), as supplied. `width` in px. */
export const DotindotStacked = ({ width = 160, light = false, className = "" }) => {
  const [ww, wh] = WORDMARK_VIEWBOX;
  const [mw, mh] = MARK_VIEWBOX;
  const k = width / ww;
  return (
    <div className={`inline-flex flex-col items-center ${className}`} style={{ width, gap: 24 * k }} data-testid="dotindot-logo-stacked">
      <DotindotMark size={mh * k} light={light} />
      <DotindotWordmark height={wh * k} light={light} />
    </div>
  );
};

/** Default logo used across the app — the wordmark. `size` kept for older call sites (≈ wordmark height × 1.3). */
export const DotindotLogo = ({ size, height, light = false, className = "" }) => (
  <div className={`flex items-center select-none ${className}`} data-testid="dotindot-logo">
    <DotindotWordmark height={height || Math.round((size || 32) * 0.72)} light={light} />
  </div>
);
