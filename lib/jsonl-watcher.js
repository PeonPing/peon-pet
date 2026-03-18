'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const SCAN_INTERVAL_MS = 1000;
const FILE_POLL_INTERVAL_MS = 500;
const SESSION_PRUNE_MS = 10 * 60 * 1000; // skip files older than 10min on startup
const PERMISSION_TIMEOUT_MS = 7000;
const SUBAGENT_IDLE_MS = 5000;           // subagent window closes after 5s of no new content
const PERMISSION_EXEMPT_TOOLS = new Set(['Task', 'Agent', 'AskUserQuestion']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sessionIdFromPath(filePath) {
  const base = path.basename(filePath, '.jsonl');
  return UUID_RE.test(base) ? base : null;
}

/**
 * Watches ~/.claude/projects/ for JSONL transcript files and emits events:
 *
 *   'session-event'  { sessionId, event, cwd, timestamp }
 *     events: SessionStart | SessionSeen | SessionCwd | Stop |
 *             UserPromptSubmit | PermissionRequest | PostToolUseFailure
 *
 *   'subagent-event' { sessionId, parentToolId, event }
 *     events: SubagentStart | SubagentStop
 *
 * Two subagent mechanisms are detected:
 *   - Foreground (sync) agents: agent_progress records in the main session JSONL
 *   - Background agents: separate files at <session-id>/subagents/agent-<agentId>.jsonl
 */
class JsonlWatcher extends EventEmitter {
  constructor() {
    super();
    this._fileStates = new Map();  // filePath → FileState
    this._knownFiles = new Set();
    this._scanInterval = null;
    this._startupScanDone = false;
  }

  start() {
    this._scan();
    this._startupScanDone = true;
    this._scanInterval = setInterval(() => this._scan(), SCAN_INTERVAL_MS);
  }

  // Returns session IDs that currently have unresolved tool_use calls
  getActiveSessionIds() {
    const active = new Set();
    for (const state of this._fileStates.values()) {
      if (!state.isSubagentFile && state.pendingTools.size > 0) {
        active.add(state.sessionId);
      }
    }
    return active;
  }

  stop() {
    if (this._scanInterval) clearInterval(this._scanInterval);
    for (const state of this._fileStates.values()) this._teardownFile(state);
    this._fileStates.clear();
    this._knownFiles.clear();
  }

  _scan() {
    if (!fs.existsSync(PROJECTS_DIR)) return;
    try {
      const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(PROJECTS_DIR, d.name));

      for (const dir of projectDirs) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }

        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.jsonl')) {
            this._registerFile(path.join(dir, entry.name));
          } else if (entry.isDirectory() && UUID_RE.test(entry.name)) {
            // Session subdirectory — scan for background subagent files
            this._scanSubagentsDir(path.join(dir, entry.name, 'subagents'), entry.name);
          }
        }
      }
    } catch {}
  }

  _scanSubagentsDir(subagentsDir, parentSessionId) {
    let files;
    try { files = fs.readdirSync(subagentsDir); } catch { return; }
    for (const f of files) {
      if (!f.startsWith('agent-') || !f.endsWith('.jsonl')) continue;
      const filePath = path.join(subagentsDir, f);
      if (this._knownFiles.has(filePath)) continue;
      this._knownFiles.add(filePath);
      const agentId = f.slice('agent-'.length, -'.jsonl'.length);
      this._watchSubagentFile(filePath, parentSessionId, agentId);
    }
  }

  _registerFile(filePath) {
    if (this._knownFiles.has(filePath)) return;
    this._knownFiles.add(filePath);
    this._watchFile(filePath);
  }

  _watchFile(filePath) {
    const sessionId = sessionIdFromPath(filePath);
    if (!sessionId) return;

    const isStartup = !this._startupScanDone;
    let fileMtime;
    try { fileMtime = fs.statSync(filePath).mtimeMs; } catch { return; }

    // Skip stale files during startup
    if (isStartup && (Date.now() - fileMtime) > SESSION_PRUNE_MS) return;

    const state = {
      sessionId,
      filePath,
      lineBuffer: '',
      offset: 0,
      fsWatcher: null,
      pollInterval: null,
      staleTimer: null,
      cwd: null,
      pendingTools: new Set(),
      permissionTimer: null,
      activeSubagentToolIds: new Set(),
    };

    this.emit('session-event', {
      sessionId,
      event: isStartup ? 'SessionSeen' : 'SessionStart',
      cwd: null,
      timestamp: isStartup ? fileMtime : Date.now(),
    });

    const readNew = () => this._readNewLines(state);
    try { state.fsWatcher = fs.watch(filePath, readNew); } catch {}
    state.pollInterval = setInterval(readNew, FILE_POLL_INTERVAL_MS);
    this._fileStates.set(filePath, state);
    readNew();
  }

  _watchSubagentFile(filePath, parentSessionId, agentId) {
    const isStartup = !this._startupScanDone;
    let fileMtime;
    try { fileMtime = fs.statSync(filePath).mtimeMs; } catch { return; }

    // Skip stale subagent files on startup
    if (isStartup && (Date.now() - fileMtime) > SESSION_PRUNE_MS) return;

    const parentToolId = `bg_${agentId}`;

    const state = {
      sessionId: parentSessionId,
      filePath,
      lineBuffer: '',
      offset: 0,
      fsWatcher: null,
      pollInterval: null,
      staleTimer: null,
      parentToolId,
      isSubagentFile: true,
    };

    this.emit('subagent-event', { sessionId: parentSessionId, parentToolId, event: 'SubagentStart' });

    const resetStaleTimer = () => {
      if (state.staleTimer) clearTimeout(state.staleTimer);
      state.staleTimer = setTimeout(() => {
        this.emit('subagent-event', { sessionId: parentSessionId, parentToolId, event: 'SubagentStop' });
        this._teardownFile(state);
        this._fileStates.delete(filePath);
      }, SUBAGENT_IDLE_MS);
    };

    const readNew = () => {
      const hadNew = this._readNewLines(state);
      if (hadNew) resetStaleTimer();
    };

    try { state.fsWatcher = fs.watch(filePath, readNew); } catch {}
    state.pollInterval = setInterval(readNew, FILE_POLL_INTERVAL_MS);
    this._fileStates.set(filePath, state);
    readNew();
    resetStaleTimer();
  }

  _teardownFile(state) {
    try { state.fsWatcher?.close(); } catch {}
    if (state.pollInterval) clearInterval(state.pollInterval);
    if (state.permissionTimer) clearTimeout(state.permissionTimer);
    if (state.staleTimer) clearTimeout(state.staleTimer);
  }

  // Returns true if new bytes were read
  _readNewLines(state) {
    let buf;
    try {
      const fd = fs.openSync(state.filePath, 'r');
      const size = fs.fstatSync(fd).size;
      if (size <= state.offset) { fs.closeSync(fd); return false; }
      buf = Buffer.alloc(size - state.offset);
      fs.readSync(fd, buf, 0, buf.length, state.offset);
      state.offset = size;
      fs.closeSync(fd);
    } catch { return false; }

    const text = state.lineBuffer + buf.toString('utf8');
    const lines = text.split('\n');
    state.lineBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) this._processLine(line, state);
    }
    return true;
  }

  _processLine(line, state) {
    let record;
    try { record = JSON.parse(line); } catch { return; }

    // Subagent files: only extract cwd, nothing else to track
    if (state.isSubagentFile) {
      if (!state.cwd && record.cwd) state.cwd = record.cwd;
      return;
    }

    // Extract cwd from the first record that has it
    if (!state.cwd && record.cwd) {
      state.cwd = record.cwd;
      this.emit('session-event', {
        sessionId: state.sessionId,
        event: 'SessionCwd',
        cwd: record.cwd,
        timestamp: Date.now(),
      });
    }

    const now = Date.now();

    switch (record.type) {
      case 'system':
        this._handleSystem(record, state, now);
        break;
      case 'assistant':
        this._handleAssistant(record, state, now);
        break;
      case 'user':
        this._handleUser(record, state, now);
        break;
      case 'progress':
        this._handleProgress(record, state);
        break;
    }
  }

  _handleSystem(record, state, now) {
    if (record.subtype === 'turn_duration') {
      state.pendingTools.clear();
      if (state.permissionTimer) {
        clearTimeout(state.permissionTimer);
        state.permissionTimer = null;
      }

      for (const parentToolId of state.activeSubagentToolIds) {
        this.emit('subagent-event', { sessionId: state.sessionId, parentToolId, event: 'SubagentStop' });
      }
      state.activeSubagentToolIds.clear();

      this.emit('session-event', { sessionId: state.sessionId, event: 'Stop', timestamp: now });
    }
  }

  _handleAssistant(record, state, now) {
    const content = record.message?.content;
    if (!Array.isArray(content)) return;

    const toolUses = content.filter(c => c.type === 'tool_use');
    const hasActivity = toolUses.length > 0 || content.some(c => c.type === 'text' && c.text?.trim());

    if (hasActivity) {
      this.emit('session-event', { sessionId: state.sessionId, event: 'UserPromptSubmit', timestamp: now });
    }

    for (const tool of toolUses) {
      if (!PERMISSION_EXEMPT_TOOLS.has(tool.name)) {
        state.pendingTools.add(tool.id);
      }
    }

    this._resetPermissionTimer(state);
  }

  _handleUser(record, state, now) {
    const content = record.message?.content;
    if (!Array.isArray(content)) return;

    let hadFailure = false;
    for (const item of content) {
      if (item.type === 'tool_result') {
        state.pendingTools.delete(item.tool_use_id);
        if (item.is_error) hadFailure = true;
      }
    }

    if (hadFailure) {
      this.emit('session-event', { sessionId: state.sessionId, event: 'PostToolUseFailure', timestamp: now });
    }

    if (state.pendingTools.size === 0 && state.permissionTimer) {
      clearTimeout(state.permissionTimer);
      state.permissionTimer = null;
    }
  }

  _handleProgress(record, state) {
    const data = record.data || {};

    // Foreground subagents: agent_progress records in the main session JSONL
    if (data.type === 'agent_progress') {
      const parentToolId = record.parentToolUseID || record.toolUseID;
      if (parentToolId && !state.activeSubagentToolIds.has(parentToolId)) {
        state.activeSubagentToolIds.add(parentToolId);
        this.emit('subagent-event', { sessionId: state.sessionId, parentToolId, event: 'SubagentStart' });
      }
    }
  }

  _resetPermissionTimer(state) {
    if (state.pendingTools.size === 0) return;
    if (state.permissionTimer) return;

    state.permissionTimer = setTimeout(() => {
      state.permissionTimer = null;
      if (state.pendingTools.size > 0) {
        this.emit('session-event', { sessionId: state.sessionId, event: 'PermissionRequest', timestamp: Date.now() });
      }
    }, PERMISSION_TIMEOUT_MS);
  }
}

module.exports = { JsonlWatcher };
