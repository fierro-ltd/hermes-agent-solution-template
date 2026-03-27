/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  // No custom env vars needed — auth is proxied through the same origin
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
