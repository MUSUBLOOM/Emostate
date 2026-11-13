import test from 'node:test'
import assert from 'node:assert/strict'
import { createModelGate } from '../lib/model-gate.mjs'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))
const code = (expected) => (error) => error.code === expected

test('reserves immediately and shares the slot across callers and generations', async () => {
  const work = deferred()
  const shared = {}
  let calls = 0
  const gate = createModelGate({ shared, ask: () => { calls++; return work.promise } })
  const other = createModelGate({ shared, ask: async () => 'next' })
  const running = gate.run('appraise', {})
  await assert.rejects(gate.run('solo', {}), code('MODEL_BUSY'))
  await assert.rejects(other.run('weekly', {}), code('MODEL_BUSY'))
  assert.equal(calls, 1)
  work.resolve('value')
  assert.equal(await running, 'value')
  assert.equal(await other.run('solo', {}), 'next')
  assert.equal(shared.sequence, 2)
})

test('a timeout retains the slot until real settlement and opens the circuit', async () => {
  const work = deferred()
  const logs = []
  let clock = 100
  const gate = createModelGate({ ask: () => work.promise, log: (line) => logs.push(line), timeoutMs: 10, cooldownMs: 500, now: () => clock })
  await assert.rejects(gate.run('appraise', {}), code('MODEL_TIMEOUT'))
  assert.equal(gate.status().active, true)
  assert.equal(gate.status().cooldownRemainingMs, 500)
  await assert.rejects(gate.run('solo', {}), code('MODEL_BUSY'))
  work.resolve('late')
  await flush()
  assert.equal(gate.status().active, false)
  assert.equal(gate.status().failures, 1)
  await assert.rejects(gate.run('solo', {}), code('MODEL_COOLDOWN'))
  assert.ok(logs.some((line) => line.includes('settled') && line.includes('late-success')))
  clock = 601
  assert.equal(await gate.run('solo', {}), 'late')
  assert.equal(gate.status().failures, 0)
})

test('late rejection is observed without double-counting failure', async () => {
  const work = deferred()
  const logs = []
  const gate = createModelGate({ ask: () => work.promise, log: (line) => logs.push(line), timeoutMs: 10 })
  await assert.rejects(gate.run('solo', {}), code('MODEL_TIMEOUT'))
  work.reject(new Error('transport failed'))
  await flush()
  assert.equal(gate.status().failures, 1)
  assert.equal(gate.status().active, false)
  assert.ok(logs.at(-1).includes('late-transport'))
})

test('two transport failures cool down; successful recovery resets failure count', async () => {
  let clock = 100
  let fail = true
  const gate = createModelGate({ ask: () => { if (fail) throw new Error('DeepSeek Messages transport failed'); return 'ok' }, cooldownMs: 500, now: () => clock })
  await assert.rejects(gate.run('appraise', {}), code('MODEL_TRANSPORT'))
  assert.equal(gate.status().cooldownRemainingMs, 0)
  await assert.rejects(gate.run('appraise', {}), code('MODEL_TRANSPORT'))
  await assert.rejects(gate.run('appraise', {}), code('MODEL_COOLDOWN'))
  fail = false
  clock = 601
  assert.equal(await gate.run('appraise', {}), 'ok')
  assert.equal(gate.status().failures, 0)
})

test('dispose rejects promptly but leaves the old underlying request reserved', async () => {
  const work = deferred()
  const shared = {}
  const logs = []
  const gate = createModelGate({ shared, ask: () => work.promise, log: (line) => logs.push(line) })
  const running = gate.run('solo', {})
  await flush()
  gate.dispose()
  const logCount = logs.length
  await assert.rejects(running, code('MODEL_DISPOSED'))
  const next = createModelGate({ shared, ask: async () => 'new' })
  await assert.rejects(next.run('appraise', {}), code('MODEL_BUSY'))
  work.reject(new Error('transport failed private thought'))
  await flush()
  assert.equal(logs.length, logCount)
  assert.equal(shared.failures, 0)
  assert.equal(await next.run('appraise', {}), 'new')
  await assert.rejects(gate.run('appraise', {}), code('MODEL_DISPOSED'))
})

test('dispose before the invocation microtask prevents the actual call', async () => {
  let calls = 0
  const gate = createModelGate({ ask: async () => { calls++; return 'value' } })
  const running = gate.run('solo', {})
  gate.dispose()
  await assert.rejects(running, code('MODEL_DISPOSED'))
  await flush()
  assert.equal(calls, 0)
  assert.equal(gate.status().active, false)
})

test('logs contain metadata only, sanitize kind, and tolerate a throwing logger', async () => {
  const logs = []
  let fail = true
  const gate = createModelGate({
    ask: () => { if (fail) throw new Error('network private-thought'); return 'private-result' },
    log: (line) => { logs.push(line); throw new Error('logger unavailable') },
  })
  await assert.rejects(gate.run('private-kind', { text: 'private-input' }), code('MODEL_TRANSPORT'))
  fail = false
  assert.equal(await gate.run('solo', {}), 'private-result')
  assert.ok(logs.every((line) => !line.includes('private-')))
  assert.ok(logs[0].includes('kind=background'))
})

test('ordinary errors release the slot and use a safe wrapper', async () => {
  const gate = createModelGate({ ask: () => { throw new Error('sensitive details') } })
  await assert.rejects(gate.run('appraise', {}), (error) => error.code === 'MODEL_ERROR' && error.message === 'MODEL_ERROR')
  assert.equal(gate.status().active, false)
  assert.equal(gate.status().cooldownRemainingMs, 0)
})
