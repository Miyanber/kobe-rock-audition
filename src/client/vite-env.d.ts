/// <reference types="vite/client" />

declare module 'virtual:manual-docs' {
  export interface ManualTocItem {
    id: string;
    level: 2 | 3;
    text: string;
  }

  export interface CompiledManualDoc {
    title: string;
    html: string;
    toc: ManualTocItem[];
  }

  export const operationsManual: CompiledManualDoc;
  export const userGuideManual: CompiledManualDoc;
}
