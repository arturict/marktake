/// <reference types="vite/client" />
/* eslint-disable @typescript-eslint/consistent-type-definitions -- Vite augments these interfaces. */

interface ImportMetaEnv {
  readonly VITE_UMAMI_SCRIPT_URL?: string;
  readonly VITE_UMAMI_WEBSITE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
