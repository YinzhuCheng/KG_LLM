export type LlmTestResult = { ok: true; message: string } | { ok: false; message: string; detail?: string };

export type LlmExtractResult = {
  nodes: any[];
  edges: any[];
  rawText?: string;
};

