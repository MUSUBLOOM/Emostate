import test from 'node:test'
import assert from 'node:assert/strict'
import { createDiagnostics } from '../lib/diagnostics.mjs'

function fixture() {
  let time = 1000, nextTimer = 0, removals = 0
  const callbacks = new Map(), timers = new Map(), disposals = [], logs = []
  function register(key, fn) {
    callbacks.set(key, fn)
    return () => { callbacks.delete(key); removals++ }
  }
  const base = {
    marker: 'original', log: { warn: (...args) => logs.push(args) }, core: { marker: 'same-core' },
    custom() { return this.marker },
    on: (name, fn) => register('on:' + name, fn),
    every: (ms, fn, name) => register('every:' + name, fn),
    context: (fn) => register('context', fn), rule: (fn) => register('rule', fn),
    command: (cmd) => register('command:' + cmd.name, cmd.run),
    tool: (builder) => register('tool', builder), defineTool: (tool) => tool,
    onDispose: (fn) => { disposals.push(fn) },
  }
  const scheduler = {
    setTimeout(fn, ms) { const handle = ++nextTimer; timers.set(handle, { fn, ms }); return handle },
    clearTimeout(handle) { timers.delete(handle) }, now: () => time,
  }
  const diagnostics = createDiagnostics(base, scheduler)
  return {
    base, diagnostics, api: diagnostics.api, callbacks, timers, disposals, logs, scheduler,
    tick() { time += 100 }, removals: () => removals,
    fire(handle) { const timer = timers.get(handle); timers.delete(handle); return timer?.fn() },
  }
}

test('成功注册六类能力并保留原API方法和非函数规则', () => {
  const f = fixture(), { api, diagnostics } = f
  api.on('activity', () => {}); api.every(300000, () => {}, 'decay')
  api.context(() => 'private-context'); api.rule('existing rule')
  api.command({ name: '情绪', run: () => 'private-result' }); api.tool({ name: 'self_state', execute: () => 'private-result' })
  assert.equal(api.custom(), 'original')
  assert.equal(api.core, f.base.core)
  assert.equal(f.callbacks.get('rule'), 'existing rule')
  const before = diagnostics.snapshot()
  assert.equal(before.counts.registrations, 6)
  assert.equal(before.counts.activeRegistrations, 6)
  assert.deepEqual(before.registrations.map((r) => r.kind), ['on', 'every', 'context', 'rule', 'command', 'tool'])
  api.defineTool({ name: 'unregistered', execute() {} })
  assert.deepEqual(diagnostics.snapshot(), before)
})

test('保持同步/异步返回值和this，回调成功不覆盖业务成功', async () => {
  const f = fixture()
  f.diagnostics.success('appraise')
  f.api.on('activity', function (value) { return this.prefix + value })
  assert.equal(f.callbacks.get('on:activity').call({ prefix: 'secret-' }, 'payload'), 'secret-payload')
  f.tick()
  f.api.context(async () => 'secret-context')
  assert.equal(await f.callbacks.get('context')(), 'secret-context')
  const snap = f.diagnostics.snapshot()
  assert.equal(snap.lastSuccess.path, 'appraise')
  assert.equal(snap.lastSuccess.at, 1000)
  assert.equal(snap.lastCallback.path, 'context')
  assert.equal(snap.lastCallback.at, 1100)
  assert.equal(snap.counts.callbacks, 2)
  assert.equal(snap.counts.callbackSuccesses, 2)
  assert.ok(!JSON.stringify(snap).includes('secret'))
})

test('同步异常只记白名单类型与文件行列，不记录错误正文或完整路径', () => {
  const f = fixture(), error = new TypeError('PRIVATE_SECRET')
  error.stack = 'TypeError: PRIVATE_SECRET\n    at privateFunction (file:///C:/PRIVATE_SECRET/worker.mjs:27:9)\n    at other (/PRIVATE_SECRET/other.js:2:4)'
  f.api.on('activity', () => { throw error })
  assert.throws(() => f.callbacks.get('on:activity')(), (caught) => caught === error)
  const snap = f.diagnostics.snapshot()
  assert.deepEqual(snap.lastFailure.error, { name: 'TypeError', location: { file: 'worker.mjs', line: 27, column: 9 } })
  assert.equal(snap.lastFailure.path, 'on:activity')
  assert.equal(snap.counts.callbackFailures, 1)
  assert.equal(snap.lastCallback, null)
  assert.ok(!JSON.stringify([snap, f.logs]).includes('PRIVATE_SECRET'))
  assert.ok(!JSON.stringify([snap, f.logs]).includes('privateFunction'))
})

test('异步异常仍拒绝原错误且不记成功', async () => {
  const f = fixture(), error = new ReferenceError('private thought')
  f.api.command({ name: 'test', run: async () => { throw error } })
  await assert.rejects(f.callbacks.get('command:test')(), (caught) => caught === error)
  const snap = f.diagnostics.snapshot()
  assert.equal(snap.lastFailure.error.name, 'ReferenceError')
  assert.equal(snap.counts.callbackFailures, 1)
  assert.equal(snap.registrations[0].failures, 1)
  assert.equal(snap.lastCallback, null)
  assert.ok(!JSON.stringify([snap, f.logs]).includes('private thought'))
})

test('内部catch显式failure不会因callback返回而覆写为成功', () => {
  const f = fixture()
  f.diagnostics.success('values')
  f.api.on('activity', () => {
    try { throw new Error('sensitive') } catch (error) { f.diagnostics.failure('activity', error) }
    return 'handled'
  })
  assert.equal(f.callbacks.get('on:activity')(), 'handled')
  const snap = f.diagnostics.snapshot()
  assert.equal(snap.lastSuccess.path, 'values')
  assert.equal(snap.lastCallback, null)
  assert.equal(snap.counts.callbackFailures, 1)
  assert.equal(snap.counts.failures, 1)
  assert.equal(snap.registrations[0].failures, 1)
})

test('情绪自检命令读取诊断不改变成功、失败、回调元数据', async () => {
  const f = fixture()
  f.diagnostics.success('appraise')
  f.api.command({ name: '情绪自检', run: async () => f.diagnostics.snapshot() })
  const before = f.diagnostics.snapshot()
  assert.deepEqual(await f.callbacks.get('command:情绪自检')(), before)
  assert.deepEqual(f.diagnostics.snapshot(), before)
})

test('只计模块every与helper timeout，清理与卸载幂等', () => {
  const f = fixture()
  const stopInterval = f.api.every(300000, () => {}, 'decay')
  const expired = f.diagnostics.timeout(() => 'result', 10, 'debounce')
  const cancelled = f.diagnostics.timeout(() => assert.fail('cancelled timer fired'), 20, 'retry')
  const unrelated = f.scheduler.setTimeout(() => {}, 30)
  assert.equal(f.diagnostics.snapshot().timers.total, 3)
  assert.equal(f.fire(expired), 'result')
  assert.equal(f.diagnostics.snapshot().timers.timeouts, 1)
  f.diagnostics.clearTimeout(cancelled); f.diagnostics.clearTimeout(cancelled)
  assert.equal(f.diagnostics.snapshot().timers.total, 1)
  const pending = f.diagnostics.timeout(() => assert.fail('disposed timer fired'), 40, 'pending')
  const heldInterval = f.callbacks.get('every:decay')
  f.diagnostics.dispose(); f.disposals[0](); stopInterval()
  assert.equal(f.removals(), 1)
  assert.equal(f.diagnostics.snapshot().timers.total, 0)
  assert.equal(f.diagnostics.snapshot().counts.activeRegistrations, 0)
  assert.equal(f.timers.has(pending), false)
  assert.equal(f.timers.has(unrelated), true)
  assert.equal(heldInterval(), undefined)
  assert.equal(f.diagnostics.timeout(() => {}, 1, 'late'), null)
})

test('卸载后旧异步回调完成不覆盖元数据', async () => {
  const f = fixture()
  let resolve
  f.api.context(() => new Promise((done) => { resolve = done }))
  const pending = f.callbacks.get('context')()
  f.diagnostics.dispose()
  const before = f.diagnostics.snapshot()
  resolve('private result')
  assert.equal(await pending, 'private result')
  assert.deepEqual(f.diagnostics.snapshot(), before)
})

test('注册失败不计入注册列表，记录失败路径', () => {
  const f = fixture()
  f.base.on = () => { throw new SyntaxError('private') }
  assert.throws(() => f.api.on('activity', () => {}), SyntaxError)
  const snap = f.diagnostics.snapshot()
  assert.equal(snap.counts.registrations, 0)
  assert.deepEqual(snap.registrations, [])
  assert.equal(snap.lastFailure.path, 'register:on:activity')
})

test('工具builder和execute支持数组、动态工具与同步返回', () => {
  const f = fixture()
  f.api.tool(() => [{ name: 'self_state', execute(value) { return 'private-' + value } }, null])
  const tools = f.callbacks.get('tool')()
  assert.equal(tools[1], null)
  assert.equal(tools[0].execute('result'), 'private-result')
  const snap = f.diagnostics.snapshot()
  assert.equal(snap.counts.registrations, 1)
  assert.equal(snap.counts.callbacks, 2)
  assert.equal(snap.lastCallback.path, 'tool:self_state')
  assert.ok(!JSON.stringify(snap).includes('private-result'))
})

test('已生成的旧工具卸载后返回工程失败结果而非undefined', () => {
  const f = fixture()
  f.api.tool(() => ({ name: 'self_state', execute() { assert.fail('disposed tool executed') } }))
  const tool = f.callbacks.get('tool')()
  f.diagnostics.dispose()
  assert.deepEqual(tool.execute(), { ok: false, message: '模块已停止' })
})

test('快照为独立的JSON安全副本，恶意错误getter不泄漏也不抛出', () => {
  const f = fixture(), error = {}
  Object.defineProperties(error, { name: { get() { throw new Error('private') } }, stack: { get() { throw new Error('private') } } })
  f.api.on('activity', () => {})
  f.diagnostics.failure('activity', error)
  const snap = f.diagnostics.snapshot()
  assert.deepEqual(snap.lastFailure.error, { name: 'Error', location: null })
  snap.registrations[0].active = false
  snap.counts.failures = 999
  assert.equal(f.diagnostics.snapshot().registrations[0].active, true)
  assert.equal(f.diagnostics.snapshot().counts.failures, 1)
  assert.ok(!JSON.stringify(f.logs).includes('private'))
})

test('非白名单错误名称和非法路径不会进入诊断', () => {
  const f = fixture()
  f.diagnostics.failure('private message with spaces', { name: 'PRIVATE_SECRET', stack: 'PRIVATE_SECRET: value\n at random function PRIVATE_SECRET' })
  const snap = f.diagnostics.snapshot()
  assert.equal(snap.lastFailure.path, 'unknown')
  assert.deepEqual(snap.lastFailure.error, { name: 'Error', location: null })
  assert.ok(!JSON.stringify([snap, f.logs]).includes('PRIVATE_SECRET'))
})
