import JSZip from "jszip";

export type UploadResult = {
  latexFiles: { path: string; content: string }[];
  assets: Record<string, string>; // filename -> objectURL
  warnings: string[];
};

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

export async function readUploads(args: { files: File[] }): Promise<UploadResult> {
  const warnings: string[] = [];
  const latexFiles: { path: string; content: string }[] = [];
  const assets: Record<string, string> = {};

  for (const f of args.files) {
    const name = f.name;
    const relPath = (f as any).webkitRelativePath ? (f as any).webkitRelativePath : name;
    const lower = name.toLowerCase();
    const ext = lower.includes(".") ? lower.split(".").pop()! : "";

    if (ext === "zip") {
      const zip = await JSZip.loadAsync(await f.arrayBuffer());
      const entries = Object.values(zip.files);
      for (const entry of entries) {
        if (entry.dir) continue;
        const p = entry.name;
        const entryLower = p.toLowerCase();
        const entryExt = entryLower.includes(".") ? entryLower.split(".").pop()! : "";
        if (entryExt === "tex") {
          const content = await entry.async("string");
          latexFiles.push({ path: p, content });
        } else if (IMAGE_EXT.has(entryExt)) {
          const blob = await entry.async("blob");
          assets[p] = URL.createObjectURL(blob);
        }
      }
      continue;
    }

    // For a cleaner UX, only accept zip upload.
    warnings.push(`已忽略文件（仅支持上传 zip）：${relPath}`);
  }

  if (latexFiles.length === 0) warnings.push("未检测到任何 .tex 文件。");
  return { latexFiles, assets, warnings };
}

