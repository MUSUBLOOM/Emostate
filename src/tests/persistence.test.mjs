import test from 'node:test'
import assert from 'node:assert/strict'
import { createSnapshotStore, validState } from '../lib/persistence.mjs'

const file = 'virtual/state.json'
const blank = () => ({ near: 50, bond: 70, existence: 70, events: [], history: [], cues: {} })
const error = (code) => Object.assign(new Error(code), { code })

function fakeFs(initial) {
  const files = new Map(initial === undefined ? [] : [[file, initial]])
  const fds = new Map()
  const calls = []
  let nextFd = 1
  const io = {
    files, fds, calls, failAt: '', onSync: null,
    readFileSync(name) {
      calls.push('read')
      if (io.failAt === 'read') throw error('EACCES')
      if (!files.has(name)) throw error('ENOENT')
      return files.get(name)
    },
    mkdirSync() {},
    openSync(name, flags) {
      assert.equal(flags, 'wx')
      if (files.has(name)) throw error('EEXIST')
      files.set(name, '')
      const fd = nextFd++
      fds.set(fd, name)
      return fd
    },
    writeFileSync(fd, raw) {
      calls.push('write')
      if (io.failAt === 'write') throw error('ENOSPC')
      files.set(fds.get(fd), raw)
    },
    fsyncSync() {
      calls.push('fsync')
      io.onSync?.()
      if (io.failAt === 'fsync') throw error('EIO')
    },
    closeSync(fd) { calls.push('close'); fds.delete(fd) },
    renameSync(from, to) {
      calls.push('rename')
      if (io.failAt === 'rename') throw error('EACCES')
      files.set(to, files.get(from))
      files.delete(from)
    },
    unlinkSync(name) { files.delete(name) },
  }
  return io
}

function fixture(initial) {
  const io = fakeFs(initial)
  const issues = []
  const store = createSnapshotStore(file, { blank, io, onIssue: (code) => issues.push(code) })
  return { io, issues, store }
}

test('load once, merge defaults, preserve unknown fields; persist by fsync then rename', () => {
  const { io, store } = fixture(JSON.stringify({ bond: 42, extension: { keep: true } }))
  const state = store.load()
  assert.equal(state.near, 50)
  assert.equal(state.bond, 42)
  assert.deepEqual(state.extension, { keep: true })
  assert.equal(store.load(), state)
  assert.equal(io.calls.filter((x) => x === 'read').length, 1)
  state.bond = 43
  assert.equal(store.save(state), true)
  assert.equal(JSON.parse(io.files.get(file)).bond, 43)
  assert.ok(io.calls.indexOf('fsync') < io.calls.indexOf('rename'))
  assert.deepEqual([...io.files.keys()], [file])
  const recovered = createSnapshotStore(file, { blank, io }).load()
  assert.equal(recovered.bond, 43)
  assert.deepEqual(recovered.extension, { keep: true })
})

test('first run with no file can initialize a snapshot', () => {
  const { store, io } = fixture()
  assert.deepEqual(store.load(), blank())
  assert.equal(store.save(store.load()), true)
  assert.ok(io.files.has(file))
})

test('corrupt JSON is never replaced by defaults, including after deletion', () => {
  const { io, store, issues } = fixture('{broken')
  assert.equal(store.load(), null)
  assert.equal(store.isBlocked(), true)
  assert.equal(store.save(blank()), false)
  assert.equal(io.files.get(file), '{broken')
  assert.deepEqual(issues, ['state_invalid_json'])
  io.files.delete(file)
  assert.equal(store.reload(), null)
  assert.equal(store.save(blank()), false)
})

test('external changes block stale writes until explicit reload', () => {
  const { io, store, issues } = fixture(JSON.stringify(blank()))
  const stale = store.load()
  const external = JSON.stringify({ ...blank(), bond: 17, extension: 'manual' })
  io.files.set(file, external)
  assert.equal(store.save(stale), false)
  assert.equal(store.save(stale), false)
  assert.equal(io.files.get(file), external)
  assert.deepEqual(issues, ['state_external_change'])
  const fresh = store.reload()
  assert.equal(fresh.bond, 17)
  assert.equal(store.isBlocked(), false)
  fresh.bond = 18
  assert.equal(store.save(fresh), true)
  assert.equal(JSON.parse(io.files.get(file)).extension, 'manual')
})

test('external deletion blocks writing and reload does not silently reset', () => {
  const { io, store } = fixture(JSON.stringify(blank()))
  const state = store.load()
  io.files.delete(file)
  assert.equal(store.save(state), false)
  assert.equal(store.reload(), null)
  assert.equal(io.files.has(file), false)
})

test('external corruption can recover only once a valid file is explicitly reloaded', () => {
  const { io, store } = fixture(JSON.stringify(blank()))
  const state = store.load()
  io.files.set(file, '{broken')
  assert.equal(store.save(state), false)
  assert.equal(store.reload(), null)
  io.files.set(file, JSON.stringify({ ...blank(), bond: 25 }))
  assert.equal(store.reload().bond, 25)
  assert.equal(store.save(store.load()), true)
})

test('an edit during temporary-file writing is caught and temp is removed', () => {
  const { io, store } = fixture(JSON.stringify(blank()))
  const state = store.load()
  const external = JSON.stringify({ ...blank(), bond: 10 })
  io.onSync = () => io.files.set(file, external)
  assert.equal(store.save(state), false)
  assert.equal(io.files.get(file), external)
  assert.deepEqual([...io.files.keys()], [file])
  assert.equal(io.fds.size, 0)
})

for (const failAt of ['write', 'fsync', 'rename']) {
  test(`${failAt} failure leaves prior snapshot intact and cleans temporary file`, () => {
    const original = JSON.stringify(blank())
    const { io, store, issues } = fixture(original)
    const state = store.load()
    state.bond = 10
    io.failAt = failAt
    assert.equal(store.save(state), false)
    assert.equal(io.files.get(file), original)
    assert.deepEqual([...io.files.keys()], [file])
    assert.equal(io.fds.size, 0)
    assert.deepEqual(issues, ['state_write_failed'])
  })
}

test('read errors block persistence without fabricating an empty state', () => {
  const { io, store, issues } = fixture(JSON.stringify(blank()))
  io.failAt = 'read'
  assert.equal(store.load(), null)
  assert.equal(store.save(blank()), false)
  assert.deepEqual(issues, ['state_read_failed'])
})

test('invalid known types are rejected while unknown fields are retained', () => {
  for (const value of [null, [], { near: '50' }, { near: NaN }, { cues: [] }, { cues: { cue: null } }, { history: [null] }, { events: 'bad' }, { lastMem: { identity: 'bad' } }]) {
    assert.equal(validState(value), false)
  }
  assert.equal(validState({ ...blank(), newFutureField: [1, 2] }), true)
  const { store, io } = fixture(JSON.stringify({ ...blank(), near: null }))
  assert.equal(store.load(), null)
  assert.equal(store.save(blank()), false)
  assert.equal(JSON.parse(io.files.get(file)).near, null)
})

test('self model and intentions survive an atomic save and a fresh store load', () => {
  const { io, store } = fixture()
  const state = store.load()
  state.selfModel = { traits: ['PRIVATE_PERSISTED_SELF'], updatedAt: 100 }
  state.intents = [{ text: 'PRIVATE_PERSISTED_INTENT', at: 101, done: false }]
  assert.equal(store.save(state), true)
  const reloaded = createSnapshotStore(file, { blank, io }).load()
  assert.deepEqual(reloaded.selfModel, state.selfModel)
  assert.deepEqual(reloaded.intents, state.intents)
  reloaded.intents[0].done = true
  assert.equal(store.save(reloaded), true)
  assert.equal(createSnapshotStore(file, { blank, io }).load().intents[0].done, true)
})

test('malformed private agency state blocks loading without overwriting the original', () => {
  for (const bad of [{ selfModel: { traits: ['x'], updatedAt: 'bad' } }, { intents: [{ text: 'x', at: 1, done: 'false' }] }]) {
    const raw = JSON.stringify({ ...blank(), ...bad })
    const { io, store } = fixture(raw)
    assert.equal(store.load(), null)
    assert.equal(store.save(blank()), false)
    assert.equal(io.files.get(file), raw)
  }
})
