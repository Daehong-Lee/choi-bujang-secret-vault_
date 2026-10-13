// API-layer authorization uses only identities returned by createLoginVerifier
// and resource ownership/type loaded from the database. Request bodies are never
// accepted as a source of roles or ownership.
export function authorizeMemoOwner(identity, resource) {
  if (!identity?.userId) return { allowed: false, status: 401, reason: 'AUTH_REQUIRED' };
  if (!resource || resource.resource_type !== 'memo') {
    return { allowed: false, status: 404, reason: 'RESOURCE_NOT_FOUND' };
  }
  if (resource.owner_id !== identity.userId) {
    return { allowed: false, status: 404, reason: 'RESOURCE_NOT_FOUND_OR_FORBIDDEN' };
  }
  return { allowed: true };
}

export function authorizeAnnouncementWrite(identity, resource) {
  if (!identity?.userId) return { allowed: false, status: 401, reason: 'AUTH_REQUIRED' };
  if (identity.kind !== 'judge') {
    return { allowed: false, status: 403, reason: 'INSTRUCTOR_REQUIRED' };
  }
  if (!resource || resource.resource_type !== 'announcement') {
    return { allowed: false, status: 404, reason: 'RESOURCE_NOT_FOUND' };
  }
  if (resource.owner_id !== identity.userId) {
    return { allowed: false, status: 404, reason: 'RESOURCE_NOT_FOUND_OR_FORBIDDEN' };
  }
  return { allowed: true };
}

export function authorizeAnnouncementCreate(identity) {
  if (!identity?.userId) return { allowed: false, status: 401, reason: 'AUTH_REQUIRED' };
  if (identity.kind !== 'judge') {
    return { allowed: false, status: 403, reason: 'INSTRUCTOR_REQUIRED' };
  }
  return { allowed: true };
}
