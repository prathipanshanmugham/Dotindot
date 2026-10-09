# dotindot. brand kit

Vector versions of the logo used across the platform (rebuilt from the supplied PNGs in `source/`).

| File | Use |
|---|---|
| `wordmark-color.svg` / `wordmark-white.svg` | "dotindot." — sidebar, headers, PDFs (white on orange/dark) |
| `mark-color.svg` / `mark-white.svg` | the "D" — favicon, small spaces, PDF footer |
| `stacked-color.svg` / `stacked-white.svg` | mark above wordmark — portal sign-in, covers |
| `app-icon.svg`, `icon-512.png` | home-screen / app icon |

Colours: mark `#FF831F` · wordmark gradient `#FE7A18 → #FFAD42` · dot `#FE7B1B`.

Where they live in the app: `frontend/src/components/brandPaths.js` (inline SVG paths used by `DotindotLogo.jsx`),
`frontend/public/` (favicon, apple-touch-icon, manifest icons) and `backend/assets/brand/` (PNGs for PDF and Excel exports).
If you have the original vector logo file, re-run `build_brand.py` with it, or drop the new paths into `brandPaths.js`.
