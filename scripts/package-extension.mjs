// Packages the built dist-extension directory into a versioned .zip ready to
// upload to the Chrome Web Store / Edge Add-ons dashboard.
//
// Run `npm run build:extension` first (or use `npm run package:extension`,
// which builds then packages). The zip is written to release/.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist-extension');
const releaseDir = path.join(root, 'release');

const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8'));
const version = manifest.version;
const zipName = `linkedin-post-formatter-v${version}.zip`;
const zipPath = path.join(releaseDir, zipName);

if (!fs.existsSync(distDir)) {
  console.error('dist-extension not found. Run "npm run build:extension" first.');
  process.exit(1);
}

fs.mkdirSync(releaseDir, { recursive: true });
fs.rmSync(zipPath, { force: true });

// Top-level entries packed relative to dist-extension, so manifest.json sits at
// the archive root (required by the Web Store).
const entries = fs.readdirSync(distDir);

if (process.platform === 'win32') {
  // Windows ships bsdtar (System32\tar.exe), which writes spec-compliant
  // forward-slash zip entries — unlike Compress-Archive's backslashes.
  const tarExe = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  execFileSync(tarExe, ['-a', '-c', '-f', zipPath, '-C', distDir, ...entries], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-r', '-q', zipPath, ...entries], { cwd: distDir, stdio: 'inherit' });
}

const sizeKb = (fs.statSync(zipPath).size / 1024).toFixed(1);
console.log(`Packaged ${zipName} (${sizeKb} KB) -> release/${zipName}`);
console.log('Upload this file in the Chrome Web Store Developer Dashboard.');
