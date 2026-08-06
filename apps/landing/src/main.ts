import { isProductionLandingLocation, startLandingAnalytics } from "./analytics.js";

const analyticsEnabled = isProductionLandingLocation(window.location);
startLandingAnalytics({
  websiteId: analyticsEnabled
    ? (import.meta.env.VITE_UMAMI_WEBSITE_ID ?? "02b557b8-d6b9-40e2-bf7c-7d78285a0395")
    : "",
  scriptUrl:
    import.meta.env.VITE_UMAMI_SCRIPT_URL ?? "https://umami.arturf.ch/script.js",
});

const menu = document.querySelector<HTMLButtonElement>(".menu-button");
const navigation = document.querySelector<HTMLElement>("#nav");

menu?.addEventListener("click", () => {
  const expanded = menu.getAttribute("aria-expanded") === "true";
  menu.setAttribute("aria-expanded", String(!expanded));
  navigation?.classList.toggle("open", !expanded);
});

navigation?.addEventListener("click", () => {
  menu?.setAttribute("aria-expanded", "false");
  navigation.classList.remove("open");
});

const copyButton = document.querySelector<HTMLButtonElement>("[data-copy]");
copyButton?.addEventListener("click", () => {
  void copyCommand();
});

async function copyCommand(): Promise<void> {
  if (!copyButton) return;
  const value = copyButton.dataset.copy;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    copyButton.textContent = "Copied";
    window.setTimeout(() => {
      copyButton.textContent = "Copy";
    }, 1500);
  } catch {
    copyButton.textContent = "Select command";
  }
}
