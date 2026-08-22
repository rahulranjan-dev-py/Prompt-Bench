// Wraps the NSIS installer in a .zip, so the published asset is an archive
// rather than a bare .exe - browsers and Windows treat a downloaded executable
// far more suspiciously than an archive.
//
// Runs as the last step of `npm run dist`, rather than living in the release
// workflow, so the CI packaging job exercises it on every PR. A step that only
// ever executes during a real release is a step nobody finds out is broken
// until a release is in flight.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// 7zip-bin ships the platform-appropriate 7za binary. electron-builder already
// depends on it, so this adds nothing to the install - but it is declared in
// devDependencies rather than reached for transitively, so the dependency is
// honest and `npm ci` cannot silently stop providing it.
const { path7za } = createRequire(import.meta.url)('7zip-bin');

const RELEASE = 'release';
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

const installer = readdirSync(RELEASE).find((f) => f.endsWith('.exe'));
if (!installer) {
  console.error(`No .exe found in ${RELEASE}/ - did electron-builder run?`);
  process.exit(1);
}

const zipName = `Prompt-Bench-${version}-Setup.zip`;
const zipPath = path.join(RELEASE, zipName);
if (existsSync(zipPath)) rmSync(zipPath);

// cwd is the release dir so the installer is stored at the zip root rather than
// under a release/ folder. -mx=1 because an NSIS installer is already
// compressed; anything heavier costs time and saves nothing.
execFileSync(path7za, ['a', '-tzip', '-mx=1', zipName, installer], {
  cwd: RELEASE,
  stdio: 'inherit',
});

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
console.log(`\nPASS  ${zipName} (${mb(statSync(zipPath).size)}) wraps ${installer}`);
