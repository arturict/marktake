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
      border: 18px solid #151716;
      background: #f3f0e6;
      color: #151716;
      font-family: Arial, Helvetica, sans-serif;
    }
    .top {
      position: absolute;
      top: 44px;
      right: 54px;
      left: 54px;
      display: flex;
      justify-content: space-between;
      font-family: Consolas, monospace;
      font-size: 16px;
      font-weight: 800;
    }
    h1 {
      position: absolute;
      top: 105px;
      left: 42px;
      margin: 0;
      font-size: 190px;
      font-weight: 950;
      letter-spacing: -.105em;
      line-height: .72;
    }
    h1 span { display: block; }
    h1 span:last-child { color: #3d52f6; }
    h1 em { color: #ff5138; font-style: normal; }
    .deck {
      position: absolute;
      right: 54px;
      bottom: 70px;
      width: 500px;
      margin: 0;
      font-size: 35px;
      font-weight: 900;
      letter-spacing: -.04em;
      line-height: 1.04;
    }
    .chip {
      position: absolute;
      bottom: 58px;
      left: 54px;
      padding: 16px 20px;
      border: 4px solid #151716;
      background: #d8ff52;
      font-family: Consolas, monospace;
      font-size: 15px;
      font-weight: 900;
    }
    .bar {
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      height: 22px;
      background: #3d52f6;
    }
  </style>
  <div class="top"><span>MARK/TAKE</span><span>MIT · SELF-HOSTED · V0.1</span></div>
  <h1><span>MARK</span><span>TAKE<em>.</em></span></h1>
  <div class="chip">ONE CONTAINER · YOUR STORAGE</div>
  <p class="deck">Frame-precise feedback without another media platform.</p>
  <div class="bar"></div>
`);
await page.screenshot({ path: "apps/landing/public/og.png" });
await browser.close();
