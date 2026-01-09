# LaTeX Document Knowledge Graph (Cloudflare Pages / 全前端)

上传 LaTeX（可包含数学公式与图片文件夹/zip），通过 **切分 + 增量式处理** 抽取数学实体与关系并生成知识图谱，支持交互可视化与导入导出（JSON / RDF / OWL）。

## 本地运行

```bash
npm install
npm run dev
```

## 构建（Cloudflare Pages）

```bash
npm install
npm run build
```

- **构建输出**：`dist/`
- Cloudflare Pages 设置：
  - **Build command**：`npm run build`
  - **Build output directory**：`dist`

## LLM 说明（可选）

本项目默认支持 **纯前端启发式抽取**（无需任何 API）。

如启用 LLM（OpenAI/Anthropic/Gemini），Key 仅存在浏览器内存中；但部分厂商接口可能对浏览器跨域请求（CORS）有限制。遇到 CORS 时可使用自建代理（不在本仓库默认启用），或改用可直连的网关/反向代理 URL。
