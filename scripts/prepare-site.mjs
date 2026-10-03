import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, 'dist');
const rootFiles = [
  'about.html',
  'apply.html',
  'college.html',
  'contact.html',
  'gallery.html',
  'index.html',
  'leadership.html',
  'news.html',
  'newsletter-action.html',
  'programs.html',
  'robots.txt',
  'sitemap.xml'
];
const publicDirectories = ['admin', 'assets', 'css', 'js', 'vendor'];
const publicExtensions = new Set([
  '.css', '.html', '.ico', '.jpeg', '.jpg', '.js', '.png', '.svg',
  '.ttf', '.webp', '.woff', '.woff2'
]);

if (output !== path.join(root, 'dist')) {
  throw new Error('Refusing to write outside the configured dist directory.');
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
let copiedFiles = 0;

function copyPublicTree(sourceDirectory, outputDirectory) {
  mkdirSync(outputDirectory, { recursive: true });
  for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const sourcePath = path.join(sourceDirectory, entry.name);
    const outputPath = path.join(outputDirectory, entry.name);
    if (entry.isDirectory()) {
      copyPublicTree(sourcePath, outputPath);
    } else if (entry.isFile() && publicExtensions.has(path.extname(entry.name).toLowerCase())) {
      cpSync(sourcePath, outputPath);
      copiedFiles += 1;
    }
  }
}

for (const file of rootFiles) {
  const source = path.join(root, file);
  if (!existsSync(source) || !statSync(source).isFile()) {
    throw new Error(`Required public site file is missing: ${file}`);
  }
  cpSync(source, path.join(output, file));
  copiedFiles += 1;
}

for (const directory of publicDirectories) {
  const source = path.join(root, directory);
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    throw new Error(`Required public site directory is missing: ${directory}`);
  }
  copyPublicTree(source, path.join(output, directory));
}

console.log(`Prepared ${copiedFiles} public site files in dist.`);
