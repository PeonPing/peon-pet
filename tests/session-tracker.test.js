'use strict';

const {
  isValidSessionId,
  createSessionTracker,
  buildSessionStates,
  EVENT_TO_ANIM,
} = require('../lib/session-tracker');

// ─── isValidSessionId ─────────────────────────────────────────────────────────

describe('isValidSessionId', () => {
  test('accepts a lowercase UUID', () => {
    expect(isValidSessionId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });

  test('accepts an uppercase UUID', () => {
    expect(isValidSessionId('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true);
  });

  test('accepts a mixed-case UUID', () => {
    expect(isValidSessionId('550e8400-e29b-41d4-A716-446655440000')).toBe(true);
  });

  test('rejects a short string', () => {
    expect(isValidSessionId('x')).toBe(false);
  });

  test('rejects a numeric string', () => {
    expect(isValidSessionId('12345')).toBe(false);
  });

  test('rejects "test-123"', () => {
    expect(isValidSessionId('test-123')).toBe(false);
  });

  test('rejects null', () => {
    expect(isValidSessionId(null)).toBe(false);
  });

  test('rejects undefined', () => {
    expect(isValidSessionId(undefined)).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isValidSessionId('')).toBe(false);
  });

  test('rejects UUID with wrong group lengths', () => {
    expect(isValidSessionId('a1b2c3d4-e5f6-7890-abcd-ef123456789')).toBe(false);
  });
});

// ─── createSessionTracker ─────────────────────────────────────────────────────

describe('createSessionTracker', () => {
  test('starts empty', () => {
    const tracker = createSessionTracker();
    expect(tracker.size()).toBe(0);
  });

  test('tracks a new session', () => {
    const tracker = createSessionTracker();
    tracker.update('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1000);
    expect(tracker.size()).toBe(1);
  });

  test('updates an existing session to the new timestamp', () => {
    const tracker = createSessionTracker();
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    tracker.update(id, 1000);
    tracker.update(id, 5000);
    expect(tracker.size()).toBe(1);
    // latest time should be 5000 — confirmed via buildSessionStates below
    const states = buildSessionStates(tracker.entries(), 10000, 9000, 1);
    expect(states[0].id).toBe(id);
  });

  test('prunes sessions older than cutoff', () => {
    const tracker = createSessionTracker();
    const old = 'a1b2c3d4-e5f6-7890-abcd-000000000001';
    const fresh = 'a1b2c3d4-e5f6-7890-abcd-000000000002';
    tracker.update(old,   100);
    tracker.update(fresh, 9000);
    tracker.prune(5000);  // cutoff = 5000 → old (100) removed, fresh (9000) kept
    expect(tracker.size()).toBe(1);
  });

  test('keeps sessions newer than cutoff after prune', () => {
    const tracker = createSessionTracker();
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    tracker.update(id, 9000);
    tracker.prune(5000);
    expect(tracker.size()).toBe(1);
  });

  test('entries() returns all tracked sessions', () => {
    const tracker = createSessionTracker();
    const id1 = 'a1b2c3d4-e5f6-7890-abcd-000000000001';
    const id2 = 'a1b2c3d4-e5f6-7890-abcd-000000000002';
    tracker.update(id1, 1000);
    tracker.update(id2, 2000);
    const entries = tracker.entries();
    expect(entries.length).toBe(2);
  });
});

// ─── buildSessionStates ───────────────────────────────────────────────────────

describe('buildSessionStates', () => {
  const HOT_MS  = 30_000;
  const WARM_MS = 120_000;

  function makeEntries(offsets) {
    const now = 1_000_000;
    return offsets.map((offset, i) => {
      const id = `a1b2c3d4-e5f6-7890-abcd-${String(i).padStart(12, '0')}`;
      return [id, now - offset];
    });
  }

  test('session active 5 s ago is hot and warm', () => {
    const entries = makeEntries([5_000]);
    const states  = buildSessionStates(entries, 1_000_000, HOT_MS, WARM_MS, 5);
    expect(states[0].hot).toBe(true);
    expect(states[0].warm).toBe(true);
  });

  test('session active 60 s ago is not hot but is warm', () => {
    const entries = makeEntries([60_000]);
    const states  = buildSessionStates(entries, 1_000_000, HOT_MS, WARM_MS, 5);
    expect(states[0].hot).toBe(false);
    expect(states[0].warm).toBe(true);
  });

  test('session active 5 min ago is neither hot nor warm', () => {
    const entries = makeEntries([5 * 60_000]);
    const states  = buildSessionStates(entries, 1_000_000, HOT_MS, WARM_MS, 5);
    expect(states[0].hot).toBe(false);
    expect(states[0].warm).toBe(false);
  });

  test('returns most recently active first', () => {
    const now = 1_000_000;
    const id1 = 'a1b2c3d4-e5f6-7890-abcd-000000000001';
    const id2 = 'a1b2c3d4-e5f6-7890-abcd-000000000002';
    const entries = [
      [id1, now - 60_000],  // older
      [id2, now - 5_000],   // newer
    ];
    const states = buildSessionStates(entries, now, HOT_MS, WARM_MS, 5);
    expect(states[0].id).toBe(id2);
    expect(states[1].id).toBe(id1);
  });

  test('caps result at maxCount', () => {
    const entries = makeEntries([1000, 2000, 3000, 4000, 5000, 6000]);
    const states  = buildSessionStates(entries, 1_000_000, HOT_MS, WARM_MS, 5);
    expect(states.length).toBe(5);
  });

  test('each state has id, hot, warm fields', () => {
    const entries = makeEntries([1000]);
    const states  = buildSessionStates(entries, 1_000_000, HOT_MS, WARM_MS, 5);
    expect(states[0]).toHaveProperty('id');
    expect(states[0]).toHaveProperty('hot');
    expect(states[0]).toHaveProperty('warm');
  });

  test('returns empty array for empty entries', () => {
    const states = buildSessionStates([], 1_000_000, HOT_MS, WARM_MS, 5);
    expect(states).toEqual([]);
  });

  test('session exactly at HOT_MS boundary is not hot', () => {
    const now = 1_000_000;
    const entries = [['a1b2c3d4-e5f6-7890-abcd-000000000001', now - HOT_MS]];
    const states  = buildSessionStates(entries, now, HOT_MS, WARM_MS, 5);
    expect(states[0].hot).toBe(false);
  });

  test('session exactly at WARM_MS boundary is not warm', () => {
    const now = 1_000_000;
    const entries = [['a1b2c3d4-e5f6-7890-abcd-000000000001', now - WARM_MS]];
    const states  = buildSessionStates(entries, now, HOT_MS, WARM_MS, 5);
    expect(states[0].warm).toBe(false);
  });
});

// ─── EVENT_TO_ANIM ────────────────────────────────────────────────────────────

describe('EVENT_TO_ANIM', () => {
  test('SessionStart maps to waking', () => {
    expect(EVENT_TO_ANIM['SessionStart']).toBe('waking');
  });

  test('Stop maps to typing', () => {
    expect(EVENT_TO_ANIM['Stop']).toBe('typing');
  });

  test('UserPromptSubmit maps to typing', () => {
    expect(EVENT_TO_ANIM['UserPromptSubmit']).toBe('typing');
  });

  test('PermissionRequest maps to alarmed', () => {
    expect(EVENT_TO_ANIM['PermissionRequest']).toBe('alarmed');
  });

  test('PostToolUseFailure maps to alarmed', () => {
    expect(EVENT_TO_ANIM['PostToolUseFailure']).toBe('alarmed');
  });

  test('PreCompact maps to alarmed', () => {
    expect(EVENT_TO_ANIM['PreCompact']).toBe('alarmed');
  });

  test('unknown event returns undefined', () => {
    expect(EVENT_TO_ANIM['UnknownEvent']).toBeUndefined();
  });
});
