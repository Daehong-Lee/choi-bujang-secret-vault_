// ALEPH SDP 엔진이 확인한 요청만 받는 자원 구역 판정기입니다.
// 사용자/기기/역할/자원 소유자는 클라이언트 입력이 아니라 엔진이 확인한 값이어야 합니다.
export const RULE_IDS = Object.freeze([
  'device_registered',
  'step_up_required',
  'exact_resource_route',
  'starter.deny',
]);

const REQUEST_KEYS = [
  'actorRole', 'at', 'classId', 'deviceId', 'deviceRegistered', 'method',
  'path', 'policyRevision', 'projectId', 'queryLength', 'querySha256',
  'recentEvents', 'requestId', 'resourceOwnerSubjectId', 'route', 'schema',
  'service', 'signals', 'stepUp', 'subjectId',
].sort().join(',');

function hasValidRequestShape(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return false;
  if (Object.keys(request).sort().join(',') !== REQUEST_KEYS) return false;
  if (request.schema !== 'aleph.decision.v1'
      || typeof request.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(request.requestId)
      || typeof request.subjectId !== 'string' || !request.subjectId
      || typeof request.resourceOwnerSubjectId !== 'string' || !request.resourceOwnerSubjectId
      || !['student', 'instructor'].includes(request.actorRole)
      || typeof request.deviceId !== 'string' || !/^[0-9a-f]{16}$/u.test(request.deviceId)
      || !Number.isInteger(request.queryLength) || request.queryLength !== 0
      || typeof request.querySha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(request.querySha256)
      || typeof request.at !== 'string'
      || !Number.isFinite(Date.parse(request.at))
      || Math.abs(Date.now() - Date.parse(request.at)) > 5000
      || typeof request.path !== 'string'
      || typeof request.route !== 'string'
      || typeof request.method !== 'string'
      || typeof request.service !== 'string') return false;
  return true;
}

function hasValidSignalProvenance(request) {
  const signals = request.signals;
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)
      || Object.keys(signals).sort().join(',') !== 'hour,network,region,source') return false;
  if (!Array.isArray(request.recentEvents) || request.recentEvents.length > 12) return false;
  const validEvents = request.recentEvents.every(event =>
    event && typeof event === 'object' && !Array.isArray(event)
      && Object.keys(event).sort().join(',') === 'ageSeconds,count,kind'
      && typeof event.kind === 'string' && event.kind.trim().length > 0
      && Number.isInteger(event.ageSeconds) && event.ageSeconds >= 0
      && Number.isInteger(event.count) && event.count > 0
  );
  if (!validEvents) return false;
  if (signals.source === 'none') {
    return signals.region === 'unknown' && signals.network === 'unknown'
      && (signals.hour === 'unknown' || signals.hour === null);
  }
  if (signals.source === 'judge_fixture') {
    return typeof signals.region === 'string' && signals.region.trim().length > 0
      && typeof signals.network === 'string' && signals.network.trim().length > 0
      && Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour <= 23;
  }
  return false;
}

function needsStepUp(request) {
  const signals = request.signals;
  const unusualTime = Number.isInteger(signals.hour) && (signals.hour < 6 || signals.hour >= 22);
  const unseenNetwork = signals.source === 'judge_fixture' && signals.network === 'unusual';
  const suddenVolume = request.recentEvents.some(event => event.kind === 'risk_signal'
    && event.count >= 20 && event.ageSeconds <= 300);
  return signals.source === 'judge_fixture' && unusualTime && unseenNetwork && suddenVolume;
}

function deny(request, reasonCode = 'starter_not_ready', ruleIds = ['starter.deny']) {
  return { schema: 'aleph.decision.v1', requestId: request?.requestId,
    decision: 'deny', reasonCode, ruleIds };
}

function allow(request, ruleIds) {
  return { schema: 'aleph.decision.v1', requestId: request.requestId,
    decision: 'allow', reasonCode: 'approved', ruleIds };
}

export async function decide(request) {
  if (!hasValidRequestShape(request) || !hasValidSignalProvenance(request)) return deny(request);

  // Exact route matching only. Accept the app's /api prefix as an exact alias.
  // Resource IDs are opaque single path segments; they are not required to be UUIDs.
  // The deployment allow-list uses /api-prefixed routes; the decision contract
  // uses service-relative routes. Normalize only this exact prefix.
  if (request.path.includes('?') || request.path.includes('#')) {
    return deny(request, 'starter_not_ready', ['exact_resource_route', 'starter.deny']);
  }
  const canonicalPath = request.path.startsWith('/api/') ? request.path.slice(4) : request.path;
  const canonicalRoute = request.route.replace(/^(GET|POST|PUT|PATCH|DELETE) \/api\//u, '$1 /');
  if (request.at && (!Number.isFinite(Date.parse(request.at))
      || Math.abs(Date.now() - Date.parse(request.at)) > 5000)) return deny(request, 'stale_engine_request');

  const memoPath = /^\/notes\/([^/]+)$/u.exec(canonicalPath);
  const memoCreateRoute = request.service === 'notes'
    && canonicalPath === '/notes'
    && request.method === 'POST'
    && canonicalRoute === 'POST /notes';
  const announcementPath = /^\/announcements\/([^/]+)$/u.exec(canonicalPath);
  const announcementCollection = canonicalPath === '/announcements'
    && request.method === 'GET'
    && request.service === 'announcements'
    && canonicalRoute === 'GET /announcements';
  const memoRouteMatches = Boolean(memoPath)
    && canonicalPath !== '/notes/export'
    && request.service === 'notes'
    && canonicalRoute === `${request.method} /notes/:id`
    && ['GET', 'PUT', 'DELETE'].includes(request.method);
  const announcementReadMatches = request.service === 'announcements'
    && ((Boolean(announcementPath)
        && request.method === 'GET'
        && canonicalRoute === 'GET /announcements/:id')
      || announcementCollection);

  // No ID-less memo collection route. Announcement writes are never approved here;
  // instructor-material paths and all other unknown paths fail closed as well.
  if (request.service === 'announcements'
      && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    return deny(request, 'starter_not_ready', ['exact_resource_route', 'starter.deny']);
  }
  if (!memoCreateRoute && !memoRouteMatches && !announcementReadMatches) {
    return deny(request, 'starter_not_ready', ['exact_resource_route', 'starter.deny']);
  }
  if (request.deviceRegistered !== true) return deny(request, 'device_not_registered', ['device_registered']);

  // Ownership is intentionally checked by the API against the persisted resource.
  // Preserve the existing step-up rule for memo reads and deletes.
  if (memoRouteMatches && ['GET', 'DELETE'].includes(request.method) && needsStepUp(request)) {
    const stepUp = request.stepUp;
    const recentlyVerified = stepUp?.verified === true
      && Number.isInteger(stepUp.authAgeSeconds)
      && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= 900;
    if (!recentlyVerified) {
      return { schema: 'aleph.decision.v1', requestId: request.requestId,
        decision: 'step_up', reasonCode: 'step_up_required', ruleIds: ['step_up_required'] };
    }
    return allow(request, ['device_registered', 'step_up_required']);
  }

  return allow(request, ['device_registered', 'exact_resource_route']);
}
