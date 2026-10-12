// XDR-to-ZTNA adapter for the local training fixtures.
// decide.mjs remains a pure decision function; this file owns I/O and rule-feed creation.
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decide } from './decide.mjs';

const MIN_BLOCK_CONFIDENCE = 0.85;
const RULE_TTL_MS = 15 * 60 * 1000;
const SUCCESS_RE = /로그인(?:이)? 성공|로그인에 성공|로그아웃한 뒤 다시 로그인이 성공|successful login|login succeeded|authentication success/i;
const IP_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function validIpv4(value) {
  if (typeof value !== 'string' || !IP_RE.test(value)) return false;
  return value.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
}

function hasSuccessSignal(alert) {
  const text = [alert?.rule?.description, alert?.full_log, alert?.message]
    .filter((value) => value !== undefined && value !== null)
    .map(String).join(' ');
  return SUCCESS_RE.test(text);
}

function isDecision(value) {
  return value && typeof value === 'object'
    && ['block', 'alert', 'record'].includes(value.action)
    && typeof value.confidence === 'number'
    && Number.isFinite(value.confidence)
    && value.confidence >= 0 && value.confidence <= 1
    && typeof value.reason === 'string';
}

/**
 * Evaluate fixture alerts, write a separate ZTNA deny-rule feed, and append one
 * JSON-lines alert record per input alert. Existing src/decider.mjs rules are untouched.
 */
export async function respond({ root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), now = new Date() } = {}) {
  const fixturePath = join(root, 'xdr', 'fixtures', 'brute-force.json');
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== 'brute-force' || !Array.isArray(fixture.alerts)) {
    throw new Error('무차별 로그인 경보 묶음 형식이 아닙니다.');
  }

  // If the same source also has a successful-login event in this fixture, do not
  // create a source-IP rule: this is a conservative false-positive safeguard.
  const successfulSourceIps = new Set(fixture.alerts
    .filter(hasSuccessSignal)
    .map((alert) => alert?.data?.srcip)
    .filter(validIpv4));

  const decisions = [];
  const candidates = new Map();
  for (const alert of fixture.alerts) {
    let output;
    try {
      output = await decide(alert);
    } catch {
      output = null;
    }
    const valid = isDecision(output);
    const action = valid ? output.action : 'record';
    const confidence = valid ? output.confidence : 0;
    const reason = valid ? output.reason : '판정 결과 형식 오류';
    const srcip = alert?.data?.srcip;
    const successOnSameAlert = hasSuccessSignal(alert);
    const eligible = valid && action === 'block' && confidence >= MIN_BLOCK_CONFIDENCE
      && validIpv4(srcip) && !successOnSameAlert && !successfulSourceIps.has(srcip);

    decisions.push({ alert, action, confidence, reason, eligible });
    if (eligible) {
      const current = candidates.get(srcip) ?? [];
      current.push({ alertId: String(alert.id ?? 'unknown'), confidence, reason });
      candidates.set(srcip, current);
    }
  }

  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(new Date(now).getTime() + RULE_TTL_MS).toISOString();
  const rules = [...candidates.entries()].map(([sourceIp, evidence]) => ({
    id: `xdr.brute_force.${sourceIp.replaceAll('.', '_')}`,
    effect: 'deny',
    match: { type: 'source_ip', value: sourceIp },
    createdAt,
    expiresAt,
    evidenceAlertIds: evidence.map((item) => item.alertId),
    confidence: Math.min(...evidence.map((item) => item.confidence)),
    reason: [...new Set(evidence.map((item) => item.reason))].join('; '),
    source: 'xdr/brute-force/respond.mjs',
  }));

  const feedPath = join(root, 'xdr', 'ztna-deny-rules.json');
  const logPath = join(root, 'xdr', 'alerts.log');
  await mkdir(dirname(feedPath), { recursive: true });
  await writeFile(feedPath, `${JSON.stringify({ schema: 'aleph.ztna.deny-rules.v1', generatedAt: createdAt, rules }, null, 2)}\n`, 'utf8');

  const lines = decisions.map(({ alert, action, confidence, reason, eligible }) => JSON.stringify({
    at: createdAt,
    alertId: String(alert?.id ?? 'unknown'),
    moduleKey: 'brute-force',
    action,
    confidence,
    outcome: eligible ? 'deny_rule_candidate' : 'observe',
    reason,
  }));
  await appendFile(logPath, `${lines.join('\n')}\n`, 'utf8');

  return { feedPath, logPath, alertCount: decisions.length, denyRuleCount: rules.length, rules };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const result = await respond();
    process.stdout.write(`경보 ${result.alertCount}건 처리, 거부 규칙 후보 ${result.denyRuleCount}건 기록\n`);
    process.stdout.write('주의: 규칙은 별도 피드 파일에 기록됩니다. 운영 ZTNA 판정기에 자동 적용되는 것은 아니며, 기존 판정기 규칙은 변경하지 않았습니다.\n');
  } catch (error) {
    process.stderr.write(`XDR 응답 처리 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}\n`);
    process.exitCode = 1;
  }
}
