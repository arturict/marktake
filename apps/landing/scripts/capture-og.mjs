import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(`
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: 1200px;
      height: 630px;
      overflow: hidden;
      background:
        radial-gradient(circle at 85% 20%, rgba(255,107,53,.18), transparent 340px),
        #0b0d11;
      color: #f4f0e7;
      font-family: "Segoe UI", Arial, sans-serif;
    }
    body::after {
      content: "";
      position: absolute;
      inset: 0;
      opacity: .12;
      background-image: radial-gradient(rgba(255,255,255,.32) .7px, transparent .7px);
      background-size: 8px 8px;
      mask-image: linear-gradient(90deg, transparent, black 70%, transparent);
    }
    .top { position: absolute; top: 58px; left: 68px; display: flex; align-items: center; gap: 15px; }
    .mark { display: grid; width: 52px; height: 52px; place-items: center; border: 1px solid #ff6b35; border-radius: 10px; color: #ff6b35; font-family: Consolas, monospace; font-size: 21px; }
    .brand { font-size: 22px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .copy { position: absolute; top: 175px; left: 68px; z-index: 2; }
    h1 { max-width: 720px; margin: 0; font-size: 82px; line-height: .95; letter-spacing: -.065em; }
    em { color: #ff6b35; font-family: Georgia, serif; font-weight: 400; }
    p { margin: 30px 0 0; color: #b5b7bd; font-size: 23px; }
    .chip { position: absolute; right: 72px; bottom: 66px; padding: 13px 18px; border: 1px solid #3b4049; border-radius: 6px; background: #12151b; color: #79d49d; font-family: Consolas, monospace; font-size: 15px; }
    svg { position: absolute; z-index: 1; right: 5px; bottom: 10px; width: 500px; height: 390px; opacity: .72; }
    path { fill: none; stroke: #ff6b35; stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
  </style>
  <div class="top"><div class="mark">M</div><div class="brand">Marktake</div></div>
  <div class="copy">
    <h1>Review the cut.<br><em>Mark the moment.</em></h1>
    <p>Focused, open-source video review on your storage.</p>
  </div>
  <svg viewBox="0 0 500 390" aria-hidden="true">
    <path d="M50 320 C150 110 275 345 430 80" />
    <path d="M395 80 L434 78 L420 116" />
  </svg>
  <div class="chip">ONE CONTAINER · ONE VOLUME</div>
`);
await page.screenshot({ path: "apps/landing/public/og.png" });
await browser.close();
