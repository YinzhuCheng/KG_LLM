export type MathJaxGlobal = {
  typesetPromise?: (elements?: any[]) => Promise<any>;
};

declare global {
  interface Window {
    MathJax?: MathJaxGlobal;
  }
}

export async function typesetMathJax(el: HTMLElement) {
  const mj = await waitForMathJax(3500);
  if (!mj?.typesetPromise) return;
  await mj.typesetPromise([el]);
}

async function waitForMathJax(timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const mj = window.MathJax;
    if (mj?.typesetPromise) return mj;
    await new Promise((r) => setTimeout(r, 80));
  }
  return window.MathJax;
}

