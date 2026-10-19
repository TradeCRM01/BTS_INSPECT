/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface Window {
  grafterTheme?: {
    key: string;
    get: () => string;
    resolved: () => string | null;
    set: (next: 'light' | 'dark' | 'system') => string | void;
    reapply: () => string;
  };
}

declare module '*.md?raw' {
  const content: string;
  export default content;
}
