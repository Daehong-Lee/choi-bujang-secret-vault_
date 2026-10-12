import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(moduleDir, '..', 'fixtures', 'brute-force.json');
const REDACTED = '[REDACTED]';

// Keep the output to the requested five fields; never print the raw alert.
function redactSecretLike(value) {
  if (typeof value !== 'string') return value ?? null;

  let safe = value;
  // Remove common credential assignments and bearer/token-shaped values.
  safe = safe.replace(/\b(password|passwd|pwd|token|secret|api[_-]?key|authorization)\s*[:=]\s*([^\s,;]+)/gi, `$1=${REDACTED}`);
  safe = safe.replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${REDACTED}`);
  safe = safe.replace(/\b(?:eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]{8,}|sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,})\b/g, REDACTED);
  // Redact long opaque strings that resemble secrets, while preserving ordinary prose.
  safe = safe.replace(/\b(?=[A-Za-z0-9_+/=-]{32,}\b)(?=[A-Za-z0-9_+/=-]*[A-Z])(?=[A-Za-z0-9_+/=-]*[a-z])(?=[A-Za-z0-9_+/=-]*\d)[A-Za-z0-9_+/=-]+\b/g, REDACTED);
  return safe;
}

export async function readAlerts() {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1'
      || fixture.moduleKey !== 'brute-force'
      || !Array.isArray(fixture.alerts)) {
    throw new Error('brute-force 경보 묶음 형식이 올바르지 않습니다.');
  }

  return fixture.alerts.map((alert) => ({
    timestamp: redactSecretLike(alert?.timestamp),
    sourceAddress: redactSecretLike(alert?.data?.srcip),
    account: redactSecretLike(alert?.data?.srcuser),
    ruleLevel: Number.isFinite(alert?.rule?.level) ? alert.rule.level : null,
    description: redactSecretLike(alert?.rule?.description),
  }));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  try {
    const rows = await readAlerts();
    // Exactly one JSON line per alert; no header or summary line is emitted.
    for (const row of rows) console.log(JSON.stringify(row));
  } catch (error) {
    console.error(error instanceof Error ? error.message : '경보 읽기 오류');
    process.exitCode = 1;
  }
}
