/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the MetaDex data API. Defaults to http://localhost:8000. */
  readonly VITE_METADEX_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
