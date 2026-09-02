// Mirrors the freshly built ads bundle (dist/ads/assets) into public/ads/assets - including
// lazy-loaded chunks (e.g. firebase/auth, firebase/firestore) - and rewrites the entry
// script/style references in every static page that loads it. Never touches the rest of
// public/ads (blog, suburbs, calculators, etc.).
import { readdirSync, mkdirSync, copyFileSync, unlinkSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const builtDir = join(root, 'dist', 'ads');
const builtAssetsDir = join(builtDir, 'assets');
const publicAssetsDir = join(root, 'public', 'ads', 'assets');

const consumerHtmlFiles = [
  join(root, 'public', 'ads', 'index.html'),
  join(root, 'public', 'refinance.html'),
  join(root, 'public', 'first-home.html'),
  join(root, 'public', 'investment.html')
];

if (!existsSync(builtAssetsDir)) {
  console.error(`sync-ads-build: build output not found at ${builtAssetsDir}`);
  process.exit(1);
}

// The built dist/ads/index.html tells us the true entry chunk names (lazy chunks aren't
// referenced there directly, only imported at runtime by the entry chunk itself).
const builtHtml = readFileSync(join(builtDir, 'index.html'), 'utf8');
const newJs = builtHtml.match(/assets\/(index-[\w-]+\.js)/)?.[1];
const newCss = builtHtml.match(/assets\/(index-[\w-]+\.css)/)?.[1];

if (!newJs || !newCss) {
  console.error('sync-ads-build: could not find the entry index-*.js / index-*.css bundle in dist/ads/index.html');
  process.exit(1);
}

mkdirSync(publicAssetsDir, { recursive: true });

const builtFiles = readdirSync(builtAssetsDir);
const existingFiles = existsSync(publicAssetsDir) ? readdirSync(publicAssetsDir) : [];

for (const file of builtFiles) {
  copyFileSync(join(builtAssetsDir, file), join(publicAssetsDir, file));
}

for (const file of existingFiles) {
  if (!builtFiles.includes(file)) {
    unlinkSync(join(publicAssetsDir, file));
  }
}

const jsPattern = /\/ads\/assets\/index-[\w-]+\.js/g;
const cssPattern = /\/ads\/assets\/index-[\w-]+\.css/g;

for (const htmlPath of consumerHtmlFiles) {
  if (!existsSync(htmlPath)) continue;
  const original = readFileSync(htmlPath, 'utf8');
  const updated = original
    .replace(jsPattern, `/ads/assets/${newJs}`)
    .replace(cssPattern, `/ads/assets/${newCss}`);
  if (updated !== original) {
    writeFileSync(htmlPath, updated);
  }
}

console.log(`sync-ads-build: mirrored ${builtFiles.length} files into public/ads/assets (entry ${newJs}, ${newCss}) and updated ${consumerHtmlFiles.length} pages`);

