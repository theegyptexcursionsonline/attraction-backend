import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import path from 'node:path';

// Scan from the repository root, so running from a subdirectory cannot narrow the check.
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const trackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0')
  .filter(Boolean);

// Operational scripts must read credentials from the environment, never from literals.
const operationalFiles = trackedFiles.filter((file) => file.startsWith('src/scripts/'));

const literalCredential = /\b(?:const|let|var)\s+\w*(?:PASSWORD|PASS|SECRET|TOKEN|API_KEY)\w*\s*=\s*(['"`])[^'"`\n]+\1/i;
const literalPasswordField = /\bpassword\s*:\s*(['"`])[^'"`\n]+\1/i;
const passwordLogging = /console\.(?:log|info|warn|error)\([^\n]*(?:\$\{[^}]*password|,\s*\w*password|\+\s*\w*password)[^\n]*\)/i;

const secretFindings = [];
for (const file of operationalFiles) {
  const lines = readFileSync(path.join(root, file), 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (literalCredential.test(line) || literalPasswordField.test(line) || passwordLogging.test(line)) {
      secretFindings.push(`${file}:${index + 1}`);
    }
  });
}

// No tracked file, file name or link may carry a personal or company identifier that
// does not belong to this project, or a workstation's home-directory path. The
// identifiers are stored base64-encoded so this script does not flag its own source.
const identityMarkers = ['cmRtaQ==', 'cmFuaml0'].map((encoded) => Buffer.from(encoded, 'base64').toString('utf8'));
// An absolute macOS home-directory path: the top-level Users folder, then an account name.
// A relative path into a project folder named Users, or a lower-case API route such as
// `/api/users/:id`, is not one.
const homeDirectoryPath = /(?:^|[^\w.-])\/Users\/[^/\s]/;
// Lockfile integrity values are random base64, which can spell a short identifier by chance.
const integrityValue = /\bsha(?:1|256|384|512)-[A-Za-z0-9+/]+={0,2}/g;

const identityReasons = (text, { checkPaths = true } = {}) => {
  const reasons = [];
  const lowerCase = text.toLowerCase();
  if (identityMarkers.some((marker) => lowerCase.includes(marker))) reasons.push('identity marker');
  if (checkPaths && homeDirectoryPath.test(text)) reasons.push('home-directory path');
  return reasons;
};

const identityFindings = [];
const recordIdentity = (location, text, options) => {
  const reasons = identityReasons(text, options);
  // Report where, never what: CI logs of a public repository are public too.
  if (reasons.length > 0) identityFindings.push(`${location} (${reasons.join(', ')})`);
};

for (const file of trackedFiles) {
  recordIdentity(`${file} [file name]`, file, { checkPaths: false });

  const absolutePath = path.join(root, file);
  let stats;
  try {
    stats = lstatSync(absolutePath);
  } catch (error) {
    // Deleted in the working tree: the next commit removes it, and CI checks that commit.
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  if (stats.isSymbolicLink()) {
    recordIdentity(`${file} [link target]`, readlinkSync(absolutePath));
    continue;
  }
  // Submodule checkouts are directories, and are checked in their own repositories.
  if (!stats.isFile()) continue;

  const content = readFileSync(absolutePath);
  if (content.subarray(0, 8000).includes(0)) {
    // Binary, judged the way git judges it. Raw bytes also cover embedded metadata such as
    // image text chunks; text drawn into pixels cannot be found this way.
    recordIdentity(`${file} [binary content]`, content.toString('latin1'));
    continue;
  }
  content.toString('utf8').split('\n').forEach((line, index) => {
    recordIdentity(`${file}:${index + 1}`, line.replace(integrityValue, ''));
  });
}

if (secretFindings.length > 0) {
  console.error('Secret hygiene check failed. Review these tracked operational lines:');
  secretFindings.forEach((finding) => console.error(`- ${finding}`));
} else {
  console.log(`Secret hygiene check passed (${operationalFiles.length} operational files scanned).`);
}

if (identityFindings.length > 0) {
  console.error('Identity hygiene check failed. Remove these identifiers and home-directory paths from tracked files:');
  identityFindings.forEach((finding) => console.error(`- ${finding}`));
} else {
  console.log(`Identity hygiene check passed (${trackedFiles.length} tracked files scanned).`);
}

if (secretFindings.length > 0 || identityFindings.length > 0) process.exit(1);
