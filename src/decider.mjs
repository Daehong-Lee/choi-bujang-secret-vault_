// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required', 'starter.deny']);

function hasValidSignalProvenance(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return false;

  const signals = request.signals;
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)
      || Object.keys(signals).sort().join(',') !== 'hour,network,region,source') {
    return false;
  }

  // The engine contract requires an explicit event array; absence is not a normal/no-event default.
  if (!Array.isArray(request.recentEvents) || request.recentEvents.length > 12) return false;
  const validEvents = request.recentEvents.every(event =>
    event && typeof event === 'object' && !Array.isArray(event)
      && Object.keys(event).sort().join(',') === 'ageSeconds,count,kind'
      && typeof event.kind === 'string' && event.kind.trim().length > 0
      && Number.isInteger(event.ageSeconds) && event.ageSeconds >= 0
      && Number.isInteger(event.count) && event.count > 0
  );
  if (!validEvents) return false;

  // "none" means no region/network/time evidence; do not infer ordinary values.
  if (signals.source === 'none') {
    return signals.region === 'unknown'
      && signals.network === 'unknown'
      && (signals.hour === 'unknown' || signals.hour === null);
  }

  // Fixture values are explicitly virtual, never proof of a real connection.
  if (signals.source === 'judge_fixture') {
    return typeof signals.region === 'string' && signals.region.trim().length > 0
      && typeof signals.network === 'string' && signals.network.trim().length > 0
      && Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour <= 23;
  }

  // Missing or unrecognized provenance fails closed.
  return false;
}

function needsStepUp(request) {
  const signals = request.signals;

  // Only the judge's explicit virtual fixture may supply these scenario labels.
  // Region alone is deliberately not a blocking or step-up condition.
  const unusualTime = Number.isInteger(signals.hour)
    && (signals.hour < 6 || signals.hour >= 22);
  const unseenNetwork = signals.source === 'judge_fixture'
    && signals.network === 'unusual';
  const suddenVolume = request.recentEvents.some(event =>
    event.kind === 'risk_signal'
      && event.count >= 20
      && event.ageSeconds <= 300
  );

  return signals.source === 'judge_fixture'
    && unusualTime
    && unseenNetwork
    && suddenVolume;
}

export async function decide(request) {
  if (!hasValidSignalProvenance(request)) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request?.requestId,
      decision: 'deny',
      reasonCode: 'starter_not_ready',
      ruleIds: ['starter.deny'],
    };
  }

  const isNotesRead = request.service === 'notes'
    && request.method === 'GET'
    && (
      request.route === 'GET /notes'
      || request.route === 'GET /notes/:id'
    );

  if (isNotesRead) {
    // Preserve the existing registered-device requirement before risk evaluation.
    if (request.deviceRegistered !== true) {
      return {
        schema: 'aleph.decision.v1',
        requestId: request.requestId,
        decision: 'deny',
        reasonCode: 'device_not_registered',
        ruleIds: ['device_registered'],
      };
    }

    if (needsStepUp(request)) {
      const stepUp = request.stepUp;
      const recentlyVerified = stepUp?.verified === true
        && Number.isInteger(stepUp.authAgeSeconds)
        && stepUp.authAgeSeconds >= 0
        && stepUp.authAgeSeconds <= 900;

      if (!recentlyVerified) {
        return {
          schema: 'aleph.decision.v1',
          requestId: request.requestId,
          decision: 'step_up',
          reasonCode: 'step_up_required',
          ruleIds: ['step_up_required'],
        };
      }

      return {
        schema: 'aleph.decision.v1',
        requestId: request.requestId,
        decision: 'allow',
        reasonCode: 'approved',
        ruleIds: ['device_registered', 'step_up_required'],
      };
    }

    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'allow',
      reasonCode: 'approved',
      ruleIds: ['device_registered'],
    };
  }

  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: 'deny',
    reasonCode: 'starter_not_ready',
    ruleIds: ['starter.deny'],
  };
}
