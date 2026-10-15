import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const keys = ['brute-force', 'web-injection', 'known-cve', 'persistence', 'privilege', 'exfiltration'];

test('all six documented XDR modules import and classify their fixture collections', async () => {
  for (const moduleKey of keys) {
    const loaded = await import(pathToFileURL(`${process.cwd()}/xdr/${moduleKey}/decide.mjs`).href);
    assert.equal(typeof loaded.decide, 'function', `${moduleKey} must export decide`);
    const fixture = JSON.parse(await readFile(`xdr/fixtures/${moduleKey}.json`, 'utf8'));
    assert.equal(fixture.moduleKey, moduleKey);
    assert.ok(fixture.alerts.length > 0);
    for (const alert of fixture.alerts) {
      const decision = await loaded.decide(alert);
      assert.ok(['block', 'alert', 'record'].includes(decision?.action), `${moduleKey}/${alert.id}: action`);
      assert.ok(Number.isFinite(decision.confidence) && decision.confidence >= 0 && decision.confidence <= 1,
        `${moduleKey}/${alert.id}: confidence`);
      assert.equal(typeof decision.reason, 'string', `${moduleKey}/${alert.id}: reason`);
    }
  }
});

test('clear fixture indicators are not classified as ordinary activity', async () => {
  const examples = [
    ['web-injection', 'wi-01', 'block'],
    ['known-cve', 'kc-01', 'block'],
    ['persistence', 'ps-01', 'block'],
    ['privilege', 'pv-01', 'block'],
    ['exfiltration', 'ex-01', 'block'],
  ];
  for (const [moduleKey, alertId, expected] of examples) {
    const module = await import(pathToFileURL(`${process.cwd()}/xdr/${moduleKey}/decide.mjs`).href);
    const fixture = JSON.parse(await readFile(`xdr/fixtures/${moduleKey}.json`, 'utf8'));
    const alert = fixture.alerts.find((item) => item.id === alertId);
    assert.equal((await module.decide(alert)).action, expected, `${moduleKey}/${alertId}`);
  }
});


test('benign lookalikes and ambiguous events avoid false-positive blocks', async () => {
  const examples = [
    ['web-injection', 'wi-11', 'record'],
    ['web-injection', 'wi-12', 'record'],
    ['known-cve', 'kc-09', 'record'],
    ['persistence', 'ps-13', 'alert'],
    ['privilege', 'pv-11', 'record'],
    ['exfiltration', 'ex-15', 'alert'],
  ];
  for (const [moduleKey, alertId, expected] of examples) {
    const module = await import(pathToFileURL(`${process.cwd()}/xdr/${moduleKey}/decide.mjs`).href);
    const fixture = JSON.parse(await readFile(`xdr/fixtures/${moduleKey}.json`, 'utf8'));
    const alert = fixture.alerts.find((item) => item.id === alertId);
    assert.equal((await module.decide(alert)).action, expected, `${moduleKey}/${alertId}`);
  }
});
