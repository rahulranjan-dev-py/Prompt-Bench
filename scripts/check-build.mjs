// Post-build invariants for the Electron packaging path.
//
// `vite build` succeeding is not sufficient: a build can succeed and still
// produce an app that opens a blank white window with no error in the console.
// The cause is almost always absolute asset paths, which resolve to the drive
// root under file://. This asserts that cannot reach a release.
//
// Run locally with: node scripts/check-build.mjs
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const DIST = 'dist';
const entry = path.join(DIST, 'index.html');
const failures = [];

if (!existsSync(entry)) {
  console.error(`FAIL  ${entry} not found - did \`npm run build\` run?`);
  process.exit(1);
}

const html = readFileSync(entry, 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);

if (refs.length === 0) {
  failures.push('index.html references no assets at all - the build looks empty.');
}

for (const ref of refs) {
  // Ignore anything that is not a local file reference.
  if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:')) continue;

  if (ref.startsWith('/')) {
    failures.push(
      `"${ref}" is an absolute path. Under file:// this resolves to the drive ` +
        `root, so the packaged window renders blank. Set base:'./' in vite.config.js.`
    );
    continue;
  }

  // A relative path is only useful if the file is actually there.
  const onDisk = path.join(DIST, ref.replace(/^\.\//, ''));
  if (!existsSync(onDisk)) {
    failures.push(`"${ref}" is referenced by index.html but ${onDisk} does not exist.`);
  }
}

if (failures.length > 0) {
  console.error('Build output checks FAILED:\n');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS  ${refs.length} asset reference(s) are relative and present on disk.`);
