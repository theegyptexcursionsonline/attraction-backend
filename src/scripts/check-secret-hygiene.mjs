import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((file) => file.startsWith('src/scripts/'));

const literalCredential = /\b(?:const|let|var)\s+\w*(?:PASSWORD|PASS|SECRET|TOKEN|API_KEY)\w*\s*=\s*(['"`])[^'"`\n]+\1/i;
const literalPasswordField = /\bpassword\s*:\s*(['"`])[^'"`\n]+\1/i;
const passwordLogging = /console\.(?:log|info|warn|error)\([^\n]*(?:\$\{[^}]*password|,\s*\w*password|\+\s*\w*password)[^\n]*\)/i;

const findings = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (literalCredential.test(line) || literalPasswordField.test(line) || passwordLogging.test(line)) {
      findings.push(`${file}:${index + 1}`);
    }
  });
}

if (findings.length > 0) {
  console.error('Secret hygiene check failed. Review these tracked operational lines:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log(`Secret hygiene check passed (${files.length} operational files scanned).`);
