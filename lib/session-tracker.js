'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidSessionId(id) {
  if (!id || typeof id !== 'string') return false;
  return UUID_RE.test(id);
}

function createSessionTracker() {
  const map = new Map();

  return {
    update(sessionId, timestamp = Date.now()) {
      map.set(sessionId, timestamp);
    },
    prune(cutoff) {
      for (const [id, t] of map) {
        if (t < cutoff) map.delete(id);
      }
    },
    size() {
      return map.size;
    },
    entries() {
      return [...map.entries()];
    },
  };
}

function buildSessionStates(entries, now, hotMs, warmMs, maxCount) {
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map(([id, t]) => ({
      id,
      hot:  (now - t) < hotMs,
      warm: (now - t) < warmMs,
    }));
}

const EVENT_TO_ANIM = {
  SessionStart:       'waking',
  Stop:               'celebrate',
  UserPromptSubmit:   'typing',
  PermissionRequest:  'alarmed',
  PostToolUseFailure: 'annoyed',
  PreCompact:         'alarmed',
};

module.exports = { isValidSessionId, createSessionTracker, buildSessionStates, EVENT_TO_ANIM };
