// Six tiny motion pieces, one per service. Hand-drawn SVG; site.js steps them with data-on="n" (visible from step n).
// Continuous bits (flowing dots, floating hearts, scrolling feed) use CSS keyframes or SMIL and pause off-screen.
const INK = "#15172A", DOT = "#FF831F", BUT = "#FFE45C", FOG = "#F4F5F9", LINE = "#E3E5EE", OK = "#22C55E";
const t = (x, y, s, cls = "", anchor = "start", fill = INK) => `<text x="${x}" y="${y}" class="t ${cls}" text-anchor="${anchor}" fill="${fill}">${s}</text>`;
const flow = (path, n, dur, r = 6) => Array.from({ length: n }, (_, i) => `<circle r="${r}" fill="${DOT}"><animateMotion dur="${dur}s" repeatCount="indefinite" begin="${(i * dur / n).toFixed(2)}s" path="${path}"/></circle>`).join("");
const heart = (x, y, s = 1, d = 0) => `<path class="flo" style="animation-delay:${d}s" transform="translate(${x} ${y}) scale(${s})" d="M0 6C-7 1-10-3-10-7a5.5 5.5 0 0 1 10-3 5.5 5.5 0 0 1 10 3c0 4-3 8-10 13Z" fill="#E11D48"/>`;

export const scenes = {
  "performance-ads": { steps: 5, svg: `<svg class="sc" viewBox="0 0 480 360" aria-hidden="true">
<rect x="34" y="30" width="160" height="300" rx="26" fill="#fff" stroke="${INK}" stroke-width="3"/><rect x="92" y="42" width="44" height="6" rx="3" fill="${LINE}"/>
<rect x="50" y="62" width="128" height="100" rx="14" fill="${BUT}"/><circle cx="114" cy="112" r="26" fill="${DOT}"/><circle cx="106" cy="107" r="5" fill="#fff"/><circle cx="122" cy="107" r="5" fill="#fff"/><circle cx="107" cy="108" r="2.4" fill="${INK}"/><circle cx="123" cy="108" r="2.4" fill="${INK}"/><path d="M106 121q8 6 16 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>
<rect x="50" y="176" width="104" height="9" rx="4.5" fill="${INK}"/><rect x="50" y="193" width="78" height="9" rx="4.5" fill="${LINE}"/>
<rect x="50" y="216" width="128" height="38" rx="19" fill="${DOT}"/>${t(114, 240, "Learn more", "b", "middle")}
<circle class="ping" cx="156" cy="235" r="10" fill="none" stroke="${INK}" stroke-width="2.5"/>
<rect x="50" y="270" width="128" height="40" rx="10" fill="${FOG}"/>${t(62, 295, "Sponsored", "s")}
<path d="M178 235C252 235 246 74 318 74" fill="none" stroke="${LINE}" stroke-width="3" stroke-dasharray="1 9" stroke-linecap="round"/>
${flow("M178 235C252 235 246 74 318 74", 5, 2.4)}
<path d="M284 74h120l-44 66v40h-32v-40Z" fill="#fff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>${t(344, 62, "Qualify", "s b", "middle")}
${flow("M344 178V238", 3, 1.2, 5)}
<rect x="262" y="232" width="186" height="104" rx="16" fill="#fff" stroke="${INK}" stroke-width="3"/>${t(278, 256, "Your CRM", "b")}
<g class="o" data-on="1"><rect x="276" y="266" width="158" height="26" rx="8" fill="${FOG}"/><circle cx="290" cy="279" r="5" fill="${OK}"/>${t(302, 283, "New lead — Priya, London", "s")}</g>
<g class="o" data-on="2"><rect x="276" y="298" width="158" height="26" rx="8" fill="${FOG}"/><circle cx="290" cy="311" r="5" fill="${OK}"/>${t(302, 315, "New lead — Omar, Dubai", "s")}</g>
<g class="o pop" data-on="3"><rect x="350" y="214" width="104" height="30" rx="15" fill="${INK}"/>${t(402, 234, "Cost per lead ↓", "s b", "middle", "#fff")}</g>
</svg>` },

  "social-content": { steps: 4, svg: `<svg class="sc" viewBox="0 0 480 360" aria-hidden="true">
<defs><clipPath id="sc-soc"><rect x="150" y="44" width="152" height="276" rx="18"/></clipPath></defs>
<rect x="142" y="30" width="168" height="304" rx="28" fill="#fff" stroke="${INK}" stroke-width="3"/>
<g clip-path="url(#sc-soc)"><g class="feed">${[0, 1, 2, 3].map((i) => { const y = 52 + i * 138, c = [BUT, DOT, FOG, BUT][i]; return `<circle cx="166" cy="${y + 8}" r="8" fill="${INK}"/><rect x="180" y="${y + 3}" width="60" height="8" rx="4" fill="${LINE}"/><rect x="156" y="${y + 22}" width="140" height="84" rx="10" fill="${c}"/>${i % 2 ? `<path d="M214 ${y + 50}v28l22-14Z" fill="#fff"/>` : `<circle cx="226" cy="${y + 64}" r="16" fill="${i === 2 ? DOT : "#fff"}"/>`}${heart(166, y + 118, .8)}<rect x="180" y="${y + 113}" width="40" height="7" rx="3.5" fill="${LINE}"/>`; }).join("")}</g></g>
<g class="cal"><rect x="24" y="96" width="98" height="120" rx="14" fill="#fff" stroke="${INK}" stroke-width="3"/>${t(36, 118, "This month", "s b")}${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<rect x="${36 + (i % 3) * 26}" y="${128 + Math.floor(i / 3) * 26}" width="20" height="20" rx="6" fill="${FOG}"/><circle class="o" data-on="${1 + (i % 4)}" cx="${46 + (i % 3) * 26}" cy="${138 + Math.floor(i / 3) * 26}" r="6" fill="${DOT}"/>`).join("")}</g>
<g>${heart(352, 250, 1.2, 0)}${heart(386, 270, .9, .7)}${heart(420, 246, 1.1, 1.3)}${heart(370, 290, .8, 1.9)}${heart(410, 300, 1, 2.4)}</g>
<g class="o pop" data-on="1"><rect x="326" y="70" width="128" height="34" rx="17" fill="${INK}"/>${t(390, 92, "+1 follower", "s b", "middle", "#fff")}</g>
<g class="o pop" data-on="2"><rect x="326" y="114" width="128" height="34" rx="17" fill="${DOT}"/>${t(390, 136, "Reach ↑ this week", "s b", "middle")}</g>
<g class="o pop" data-on="3"><rect x="326" y="158" width="128" height="34" rx="17" fill="${BUT}"/>${t(390, 180, "3 DMs → leads", "s b", "middle")}</g>
</svg>` },

  "seo-ai-search": { steps: 4, svg: `<svg class="sc" viewBox="0 0 480 360" aria-hidden="true">
<defs><clipPath id="sc-type"><rect class="typing" x="78" y="40" width="300" height="34"/></clipPath></defs>
<rect x="30" y="30" width="420" height="50" rx="25" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="56" cy="54" r="9" fill="none" stroke="${INK}" stroke-width="3"/><path d="m63 61 7 7" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
<g clip-path="url(#sc-type)">${t(80, 60, "best agency to grow my brand", "q")}</g><rect class="caret" x="80" y="44" width="2.5" height="22" fill="${INK}"/>
${[0, 1, 2].map((i) => `<g class="mv" data-on="2" style="--ty:48px"><rect x="30" y="${98 + i * 48}" width="420" height="38" rx="12" fill="#fff" stroke="${LINE}" stroke-width="2"/>${t(76, 122 + i * 48, ["Big Generic Agency Co.", "Yet Another Listicle", "Some Directory"][i], "s")}<rect x="300" y="${111 + i * 48}" width="120" height="8" rx="4" fill="${FOG}"/></g>`).join("")}
<g class="mv" data-on="2" style="--ty:-144px"><rect x="30" y="242" width="420" height="38" rx="12" fill="${DOT}"/>${t(76, 266, "Your brand", "b")}<rect x="300" y="255" width="120" height="8" rx="4" fill="#ffd3ad"/></g>
${[0, 1, 2, 3].map((i) => t(50, 122 + i * 48, String(i + 1), "s b", "middle")).join("")}
<g class="o" data-on="3"><rect x="30" y="296" width="420" height="50" rx="16" fill="${INK}"/><circle cx="54" cy="321" r="11" fill="${DOT}"/>${t(74, 318, "AI: For this, I'd recommend Your brand.", "s", "start", "#fff")}<rect x="74" y="326" width="116" height="14" rx="7" fill="#2d3048"/>${t(82, 337, "source: yourbrand.com", "xs", "start", "#c9cbe0")}</g>
</svg>` },

  "websites-apps": { steps: 6, svg: `<svg class="sc" viewBox="0 0 480 360" aria-hidden="true">
<rect x="30" y="26" width="420" height="300" rx="20" fill="#fff" stroke="${INK}" stroke-width="3"/><path d="M30 60h420" stroke="${INK}" stroke-width="3"/>
<circle cx="52" cy="43" r="5" fill="#ff5f57"/><circle cx="68" cy="43" r="5" fill="#febc2e"/><circle cx="84" cy="43" r="5" fill="#28c840"/><rect x="110" y="36" width="200" height="14" rx="7" fill="${FOG}"/>${t(122, 47, "yourbrand.com", "xs")}
<g class="o" data-on="1"><rect x="48" y="76" width="70" height="12" rx="6" fill="${DOT}"/><rect x="300" y="78" width="40" height="8" rx="4" fill="${LINE}"/><rect x="350" y="78" width="40" height="8" rx="4" fill="${LINE}"/><rect x="400" y="74" width="34" height="16" rx="8" fill="${INK}"/></g>
<g class="o" data-on="2"><rect x="48" y="108" width="230" height="22" rx="6" fill="${INK}"/><rect x="48" y="138" width="190" height="22" rx="6" fill="${INK}"/><rect x="48" y="172" width="210" height="9" rx="4.5" fill="${LINE}"/></g>
<g class="o pop" data-on="3"><rect x="48" y="196" width="104" height="32" rx="16" fill="${DOT}"/>${t(100, 217, "Get a quote", "s b", "middle")}</g>
<g class="o" data-on="2"><rect x="300" y="104" width="134" height="124" rx="16" fill="${BUT}"/><circle cx="367" cy="166" r="30" fill="${DOT}"/></g>
<g class="o" data-on="4">${[0, 1, 2].map((i) => `<rect x="${48 + i * 132}" y="246" width="122" height="62" rx="12" fill="${FOG}"/><rect x="${60 + i * 132}" y="260" width="60" height="8" rx="4" fill="${INK}"/><rect x="${60 + i * 132}" y="276" width="90" height="6" rx="3" fill="${LINE}"/>`).join("")}</g>
<g class="o pop" data-on="5"><circle cx="410" cy="300" r="44" fill="#fff" stroke="${INK}" stroke-width="3"/><circle class="gauge" cx="410" cy="300" r="34" fill="none" stroke="${OK}" stroke-width="8" stroke-linecap="round" transform="rotate(-90 410 300)"/>${t(410, 307, "100", "g", "middle")}</g>
</svg>` },

  "brand-video": { steps: 4, svg: `<svg class="sc" viewBox="0 0 480 360" aria-hidden="true">
<g class="mv" data-on="1" style="--ty:0px;--tx:110px"><circle cx="110" cy="110" r="42" fill="${DOT}"/></g>
<g class="mv" data-on="1" style="--ty:30px;--tx:-80px"><rect x="300" y="60" width="78" height="78" rx="14" fill="${INK}"/></g>
<g class="mv" data-on="1" style="--ty:-40px;--tx:10px"><path d="M210 230l44-76 44 76Z" fill="${BUT}"/></g>
<g class="o" data-on="2">${t(240, 250, "yourbrand", "w", "middle")}<circle class="drop" cx="362" cy="244" r="9" fill="${DOT}"/></g>
<g class="o" data-on="3"><rect x="160" y="268" width="160" height="26" rx="13" fill="${FOG}"/>${t(240, 286, "Brand book ✓ Templates ✓", "xs b", "middle")}</g>
<g class="film">${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 64}" y="312" width="58" height="40" rx="6" fill="${[BUT, FOG, DOT, INK][i % 4]}"/>`).join("")}</g>
<path d="M0 306h480M0 358h480" stroke="${INK}" stroke-width="3"/>
</svg>` },

  "ai-automation": { steps: 5, svg: `<svg class="sc" viewBox="0 0 480 360" aria-hidden="true">
<rect x="60" y="20" width="360" height="320" rx="24" fill="#fff" stroke="${INK}" stroke-width="3"/><path d="M60 64h360" stroke="${INK}" stroke-width="3"/>
<circle cx="88" cy="42" r="12" fill="${DOT}"/>${t(108, 40, "Your brand", "b")}${t(108, 55, "AI assistant · online", "xs")}${t(398, 47, "2:13 am", "xs b", "end")}
<g class="o" data-on="1"><rect x="80" y="80" width="196" height="40" rx="14" fill="${FOG}"/>${t(94, 105, "Hi! Do you ship to Dubai?", "s")}</g>
<g class="o typingdots" data-on="2"><rect x="340" y="132" width="60" height="30" rx="15" fill="#ffe1c7"/><circle cx="358" cy="147" r="4" fill="${DOT}"/><circle cx="370" cy="147" r="4" fill="${DOT}"/><circle cx="382" cy="147" r="4" fill="${DOT}"/></g>
<g class="o" data-on="3"><rect x="164" y="132" width="236" height="58" rx="14" fill="${DOT}"/>${t(178, 156, "Yes — 3 to 5 days, free over", "s")}${t(178, 176, "AED 200. Want a call at 10 am?", "s")}</g>
<g class="o" data-on="4"><rect x="80" y="202" width="132" height="40" rx="14" fill="${FOG}"/>${t(94, 227, "Yes please! 🙌", "s")}</g>
<g class="o pop" data-on="5"><rect x="96" y="262" width="288" height="52" rx="16" fill="${INK}"/><circle cx="122" cy="288" r="11" fill="${OK}"/><path d="m116 288 4 4 8-8" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>${t(142, 284, "Lead qualified, call booked", "s b", "start", "#fff")}${t(142, 301, "Sent to sales with a summary", "xs", "start", "#c9cbe0")}</g>
</svg>` },
};
