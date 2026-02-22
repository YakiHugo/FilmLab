#!/usr/bin/env node

/**
 * fetch-images.mjs
 *
 * 从 Unsplash 或 Pexels 拉取测试图片到 test-assets/images/ 目录。
 *
 * 用法:
 *   node test-assets/fetch-images.mjs --source unsplash --count 10 --query landscape
 *   node test-assets/fetch-images.mjs --source pexels   --count 5  --query portrait
 *
 * 环境变量 (在项目根目录的 .env 或 test-assets/.env 中设置):
 *   UNSPLASH_ACCESS_KEY  - Unsplash API Access Key (https://unsplash.com/developers)
 *   PEXELS_API_KEY       - Pexels API Key          (https://www.pexels.com/api/)
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const IMAGES_DIR = join(__dirname, "images");

/** 简单的 .env 文件加载器 */
async function loadEnv(...paths) {
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const text = await readFile(p, "utf-8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      // 移除引号
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function parseArgs(argv) {
  const args = { source: "unsplash", count: 10, query: "film photography" };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) {
      args.source = argv[++i].toLowerCase();
    } else if (argv[i] === "--count" && argv[i + 1]) {
      args.count = Math.max(1, Math.min(30, Number(argv[++i])));
    } else if (argv[i] === "--query" && argv[i + 1]) {
      args.query = argv[++i];
    } else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log(`
用法: node test-assets/fetch-images.mjs [选项]

选项:
  --source <unsplash|pexels>   图片来源 (默认: unsplash)
  --count  <number>            下载数量, 1-30 (默认: 10)
  --query  <string>            搜索关键词 (默认: "film photography")
  --help, -h                   显示帮助
      `);
      process.exit(0);
    }
  }
  return args;
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${url}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buffer);
}

// ---------------------------------------------------------------------------
// Unsplash
// ---------------------------------------------------------------------------

async function fetchUnsplash(query, count) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    console.error("❌ 缺少环境变量 UNSPLASH_ACCESS_KEY");
    console.error(
      "   请在 .env 或 test-assets/.env 中设置，或导出到环境变量。"
    );
    console.error("   申请地址: https://unsplash.com/developers");
    process.exit(1);
  }

  const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(
    query
  )}&count=${count}&orientation=landscape`;
  console.log(`📡 正在从 Unsplash 搜索 "${query}"，请求 ${count} 张图片...`);

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${key}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Unsplash API 错误 (${res.status}): ${body}`);
  }

  const photos = await res.json();
  return photos.map((p) => ({
    id: p.id,
    description: p.alt_description || p.description || "untitled",
    downloadUrl: p.urls.regular, // 1080px 宽
    author: p.user.name,
    link: p.links.html,
  }));
}

// ---------------------------------------------------------------------------
// Pexels
// ---------------------------------------------------------------------------

async function fetchPexels(query, count) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    console.error("❌ 缺少环境变量 PEXELS_API_KEY");
    console.error(
      "   请在 .env 或 test-assets/.env 中设置，或导出到环境变量。"
    );
    console.error("   申请地址: https://www.pexels.com/api/");
    process.exit(1);
  }

  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
    query
  )}&per_page=${count}&orientation=landscape`;
  console.log(`📡 正在从 Pexels 搜索 "${query}"，请求 ${count} 张图片...`);

  const res = await fetch(url, {
    headers: { Authorization: key },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pexels API 错误 (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.photos.map((p) => ({
    id: String(p.id),
    description: p.alt || "untitled",
    downloadUrl: p.src.large, // ~940px
    author: p.photographer,
    link: p.url,
  }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);

  // 加载 .env
  const projectRoot = join(__dirname, "..");
  await loadEnv(join(projectRoot, ".env"), join(__dirname, ".env"));

  // 确保目录存在
  await mkdir(IMAGES_DIR, { recursive: true });

  // 拉取图片列表
  let photos;
  if (args.source === "pexels") {
    photos = await fetchPexels(args.query, args.count);
  } else if (args.source === "unsplash") {
    photos = await fetchUnsplash(args.query, args.count);
  } else {
    console.error(
      `❌ 不支持的图片来源: ${args.source}，请使用 unsplash 或 pexels`
    );
    process.exit(1);
  }

  console.log(`✅ 获取到 ${photos.length} 张图片元信息，开始下载...\n`);

  // 逐张下载
  const results = [];
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const ext = "jpg";
    const filename = `${args.source}_${p.id}.${ext}`;
    const dest = join(IMAGES_DIR, filename);

    process.stdout.write(`  [${i + 1}/${photos.length}] ${filename} ...`);
    try {
      await downloadFile(p.downloadUrl, dest);
      results.push({ filename, author: p.author, link: p.link });
      process.stdout.write(" ✅\n");
    } catch (err) {
      process.stdout.write(` ❌ ${err.message}\n`);
    }
  }

  // 写入 credits 文件 (尊重作者版权)
  if (results.length > 0) {
    const credits = results
      .map((r) => `${r.filename}\n  作者: ${r.author}\n  来源: ${r.link}`)
      .join("\n\n");
    await writeFile(join(IMAGES_DIR, "CREDITS.txt"), credits, "utf-8");
  }

  console.log(`\n🎉 完成! 已下载 ${results.length} 张图片到 ${IMAGES_DIR}`);
}

main().catch((err) => {
  console.error("❌ 运行出错:", err);
  process.exit(1);
});
