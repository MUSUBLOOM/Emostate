import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { validSelfModel, validIntents } from './agency.mjs'

const record = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const numeric = (obj, keys) => keys.every((key) => !(key in obj) || (typeof obj[key] === 'number' && Number.isFinite(obj[key])))
const numbers = ['at', 'lastOwnerAt', 'ownerMsgsToday', 'near', 'density', 'exclusive', 'command', 'corrected', 'initiative', 'existence', 'identity', 'bond', 'residue', 'residueAt', 'gaps', 'gapMin', 'echoStrength', 'lastSoloAt', 'soloCount', 'lastWeekAt', 'decayAt']

// Validate the fields we consume; retain unknown fields for forward compatibility.
export function validState(value) {
  if (!record(value) || !numeric(value, numbers)) return false
  if ('selfModel' in value && !validSelfModel(value.selfModel)) return false
  if ('intents' in value && !validIntents(value.intents)) return false
  if ('people' in value && (!record(value.people) || !Object.entries(value.people).every(([id, p]) =>
    /^\d+$/.test(id) && record(p) && ['bond', 'trust', 'disgust', 'lastAt'].every((k) => typeof p[k] === 'number' && Number.isFinite(p[k]))))) return false
  for (const key of ['day', 'digestDay', 'soloDay', 'lastText', 'weekText']) {
    if (key in value && typeof value[key] !== 'string') return false
  }
  for (const key of ['events', 'history', 'thoughts', 'weeks']) {
    if (!(key in value)) continue
    if (!Array.isArray(value[key]) || !value[key].every((x) => record(x) && numeric(x, ['at', 'n', 'b', 'e', 'i', 'r', 'w']) &&
      (!('text' in x) || typeof x.text === 'string') && (!('k' in x) || typeof x.k === 'string'))) return false
  }
  if ('cues' in value && (!record(value.cues) || !Object.values(value.cues).every((x) =>
    record(x) && numeric(x, ['n', 's', 'at']) && (!('k' in x) || typeof x.k === 'string')))) return false
  if ('lastMem' in value && (!record(value.lastMem) || !Object.values(value.lastMem).every((x) => typeof x === 'number' && Number.isFinite(x)))) return false
  for (const key of ['echo', 'mt', 'soloLine']) {
    if (!(key in value) || value[key] === null) continue
    const x = value[key]
    if (!record(x) || !numeric(x, ['at', 'w']) || ('text' in x && typeof x.text !== 'string') || ('k' in x && typeof x.k !== 'string')) return false
  }
  return true
}

// One process owns the in-memory state. Disk is a recoverable snapshot, never
// silently reloaded between callbacks. External edits require explicit reload.
export function createSnapshotStore(file, { blank, onIssue = () => {}, io = fs }) {
  let loaded = false
  let blocked = false
  let cached = null
  let snapshot = null
  let hadFile = false
  let lastIssue = ''

  function fail(code) {
    blocked = true
    if (code !== lastIssue) {
      lastIssue = code
      try { onIssue(code) } catch {}
    }
    return null
  }

  function read() {
    try { return io.readFileSync(file, 'utf8') }
    catch (error) { if (error.code === 'ENOENT') return null; throw error }
  }

  function reload() {
    loaded = true
    let raw
    try { raw = read() } catch { return fail('state_read_failed') }
    if (raw === null && hadFile) return fail('state_missing')
    if (raw !== null) hadFile = true
    let data
    try { data = raw === null ? {} : JSON.parse(raw) } catch { return fail('state_invalid_json') }
    if (!validState(data)) return fail('state_invalid_shape')
    const merged = { ...blank(), ...data }
    if (!validState(merged)) return fail('state_invalid_shape')
    cached = merged
    snapshot = raw
    hadFile = raw !== null
    blocked = false
    lastIssue = ''
    return cached
  }

  function load() { return loaded ? (blocked ? null : cached) : reload() }

  function unchanged() {
    try {
      if (read() !== snapshot) { fail('state_external_change'); return false }
      return true
    } catch { fail('state_read_failed'); return false }
  }

  function save(state) {
    if (!loaded) load()
    if (blocked) return false
    if (!validState(state)) { fail('state_invalid_shape'); return false }
    if (!unchanged()) return false
    let temp = ''
    let fd
    try {
      const raw = JSON.stringify(state)
      io.mkdirSync(path.dirname(file), { recursive: true })
      temp = file + '.tmp-' + randomUUID()
      fd = io.openSync(temp, 'wx', 0o600)
      io.writeFileSync(fd, raw, 'utf8')
      io.fsyncSync(fd)
      io.closeSync(fd)
      fd = undefined
      // Catch an edit made while the temporary snapshot was being written.
      if (!unchanged()) return false
      io.renameSync(temp, file)
      temp = ''
      snapshot = raw
      cached = state
      hadFile = true
      return true
    } catch { fail('state_write_failed'); return false }
    finally {
      if (fd !== undefined) { try { io.closeSync(fd) } catch {} }
      if (temp) { try { io.unlinkSync(temp) } catch {} }
    }
  }

  return { load, reload, save, isBlocked: () => blocked }
}
