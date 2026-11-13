import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { blank, decay, dayKey } from '../index.mjs'

test('decay depends on elapsed time, not context/event call count', () => {
  const now = Date.now()
  const original = { ...blank(), near: 73, bond: 17, decayAt: now, lastOwnerAt: now }
  const once = decay(structuredClone(original), now + 300_000)
  const many = structuredClone(original)
  for (let i = 0; i <= 100; i++) decay(many, now + i * 3000)
  assert.ok(Math.abs(once.bond - many.bond) < 1e-10)
  assert.ok(Math.abs(once.near - many.near) < 1e-10)
  const b = many.bond
  for (let i = 0; i < 100; i++) decay(many, now + 300_000)
  assert.equal(many.bond, b)
})

test('hormone history records all four at the same cadence as load history', () => {
  const now = Date.now()
  const s = { ...blank(), decayAt: now - 120_000, hormones: { load: 10, trust: 20, drive: 30, steady: 40 } }
  const d = decay(s, now)
  assert.ok(Array.isArray(d.hormoneHistory))
  assert.equal(d.hormoneHistory.length, 1)
  const point = d.hormoneHistory[0]
  assert.equal(point.at, now)
  assert.equal(point.load, 10)
  assert.equal(point.trust, 20)
  assert.equal(point.drive, 30)
  assert.equal(point.steady, 40)
  assert.equal(d.loadHistory.length, 1)
  assert.equal(d.loadHistory[0].at, now)
})

test('echo uses a three day half-life and retains its floor', () => {
  const at = Date.now()
  const s = { ...blank(), echo: { k: 'identity', at, w: 0.8 } }
  assert.equal(decay(s, at + 3 * 86400_000).echoStrength, 0.4)
  assert.equal(decay(s, at + 100 * 86400_000).echoStrength, 0.04)
})

test('day boundaries use Asia/Shanghai', () => {
  assert.equal(dayKey(Date.parse('2026-11-06T15:59:59Z')), '2026-11-06')
  assert.equal(dayKey(Date.parse('2026-11-06T16:00:00Z')), '2026-11-07')
})

// Load production setup with a synthetic snapshot adapter and fake module
// timers. No real data files, model requests, QQ messages or memory writes.
async function harness(ask = async () => '{"d":{},"t":""}', options = {}) {
  const logs = [], calls = [], deliveries = [], memories = [], timers = new Map(), commands = new Map(), events = new Map(), tools = []
  let dispose, every, contextHook, seq = 0, saved = null, saves = 0
  const mem = { load: () => options.state || blank(), save: (s) => { saves++; if (options.failSaveAfter && saves > options.failSaveAfter) return false; saved = structuredClone(s); return true },
    isBlocked: () => false, reload: () => ({ ...blank(), bond: 82 }) }
  const clockDate = options.now === undefined ? Date : class extends Date {
    constructor(...args) { super(...(args.length ? args : [options.now])) }
    static now() { return options.now }
  }
  const context = vm.createContext({ console, Date: clockDate, setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, ms }); return id },
    clearTimeout: (id) => timers.delete(id) })
  const synthetic = async (ns) => {
    const mod = new vm.SyntheticModule(Object.keys(ns), function () {
      for (const [key, value] of Object.entries(ns)) this.setExport(key, value)
    }, { context })
    await mod.link(() => {}); await mod.evaluate(); return mod
  }
  const originalSource = fs.readFileSync(new URL('../index.mjs', import.meta.url), 'utf8')
  const mod = new vm.SourceTextModule(options.sourceTransform ? options.sourceTransform(originalSource) : originalSource, {
    context, importModuleDynamically: async (specifier) => {
      if (specifier === './lib/persistence.mjs') return synthetic({ createSnapshotStore: () => mem })
      return synthetic(await import(new URL('../' + specifier, import.meta.url)))
    },
  })
  await mod.link(async (specifier) => synthetic(await import(specifier.startsWith('node:') ? specifier : new URL('../' + specifier, import.meta.url).href)))
  await mod.evaluate()
  const logger = Object.fromEntries(['info', 'warn', 'error'].map((level) => [level, (line) => logs.push(line)]))
  const api = {
    log: logger, core: { logger: { child: () => logger }, getConfig: () => ({ ownerQQ: '10000' }), hub: { deliver: async (...args) => { deliveries.push(args); return options.deliveryResult ?? { failed: 0 } }, chatLogOf: () => options.chatLog || [] } },
    ask: (opts) => { calls.push(opts); return ask(opts) },
    think: (text, opts) => { const request = { text, title: opts?.title }; calls.push(request); return ask(request) },
    lazy: () => ({ add: (entry) => { memories.push(entry) } }), onDispose: (fn) => { dispose = fn },
    on: (name, fn) => events.set(name, fn), every: (_, fn) => { every = fn },
    context: (fn) => { contextHook = fn }, rule: () => {},
    command: (x) => commands.set(x.name, x.run), defineTool: (x) => x, tool: (x) => tools.push(x),
  }
  await mod.namespace.default.setup(api)
  return { logs, calls, timers, commands, tools, deliveries, memories, dispose: () => { try { delete globalThis[Symbol.for('aurabot.emostate.model-gate.v1')] } catch {} dispose() }, every: () => every(),
    context: (info) => contextHook(info), saved: () => saved, saves: () => saves,
    prompt: (info, content = []) => events.get('prompt')(content, info),
    message: (text, owner = true, userId = owner ? '10000' : '20000', chatId = 'group:90000') => events.get('activity')({ kind: 'in', owner, text, userId, chatId }),
    tick: async () => { const jobs = [...timers.values()]; timers.clear(); for (const job of jobs) job.fn(); await flush() },
  }
}
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)) }

test('burst appraisal retains six message boundaries in one request', async () => {
  const h = await harness()
  try {
    for (let i = 1; i <= 6; i++) h.message('第' + i + '条普通消息')
    assert.equal(h.timers.size, 1)
    await h.tick()
    assert.equal(h.calls.length, 1)
    for (let i = 1; i <= 6; i++) assert.ok(h.calls[0].text.includes('第' + i + '条普通消息'))
    assert.ok(h.logs.some((x) => x.includes('applied messages=6')))
    assert.equal(h.tools.length, 3)
  } finally { h.dispose() }
})

test('dispose clears debounce and prevents pending appraisal from starting', async () => {
  const h = await harness()
  h.message('普通问候消息')
  h.dispose()
  assert.equal(h.timers.size, 0)
  await h.tick()
  assert.equal(h.calls.length, 0)
})

test('old appraisal cannot commit after dispose', async () => {
  let resolve
  const h = await harness(() => new Promise((r) => { resolve = r }))
  h.message('普通问候消息'); await h.tick()
  const before = h.saves()
  h.dispose()
  resolve('{"d":{"bond":3},"t":"PRIVATE_SENTINEL"}'); await flush()
  assert.equal(h.saves(), before)
  assert.ok(h.logs.every((x) => !x.includes('PRIVATE_SENTINEL')))
})

test('explicit reload invalidates an old appraisal result', async () => {
  let resolve
  const h = await harness(() => new Promise((r) => { resolve = r }))
  try {
    h.message('普通问候消息'); await h.tick()
    h.commands.get('情绪重载')()
    const before = h.saves()
    resolve('{"d":{"bond":3},"t":"PRIVATE_SENTINEL"}'); await flush()
    assert.equal(h.saves(), before)
    assert.ok(h.commands.get('情绪诊断')().includes('关系 82'))
  } finally { h.dispose() }
})

test('solo command stores private text but never returns or logs it', async () => {
  const h = await harness(async () => 'PRIVATE_SENTINEL')
  try {
    const result = await h.commands.get('独处')()
    assert.ok(result.includes('独处已完成'))
    assert.ok(!result.includes('PRIVATE_SENTINEL'))
    assert.equal(h.saved().soloLine.text, 'PRIVATE_SENTINEL')
    assert.ok(h.logs.every((x) => !x.includes('PRIVATE_SENTINEL')))
  } finally { h.dispose() }
})

test('new commands route through the installed plugin parser without prefix capture', async (t) => {
  const hostFile = process.env.AURABOT_COMMANDS_FILE || ''
  if (!hostFile) return t.skip('set AURABOT_COMMANDS_FILE to dsh-aurabot-qq/src/chat/commands.js')
  const h = await harness()
  try {
    const context = vm.createContext({})
    const source = fs.readFileSync(hostFile, 'utf8')
    const mod = new vm.SourceTextModule(source, { context })
    await mod.link(() => new vm.SyntheticModule(['dataDir', 'readJson', 'writeJson'], function () {
      for (const key of ['dataDir', 'readJson', 'writeJson']) this.setExport(key, () => { throw new Error('IO forbidden in routing test') })
    }, { context }))
    await mod.evaluate()
    const extra = [...h.commands].map(([name, run]) => ({ name, run }))
    for (const name of ['情绪', '情绪自检', '情绪诊断', '情绪重载']) {
      assert.equal(mod.namespace.parseCommand('/' + name, extra).name, name)
    }
  } finally { h.dispose() }
})

test('messages received during an in-flight batch remain pending', async () => {
  let resolve
  const h = await harness(() => new Promise((r) => { resolve = r }))
  try {
    h.message('第一条普通消息'); await h.tick()
    h.message('第二条普通消息'); h.message('第三条普通消息')
    assert.equal(h.calls.length, 1)
    resolve('{"d":{},"t":""}'); await flush(); await h.tick()
    assert.equal(h.calls.length, 2)
    assert.ok(h.calls[1].text.includes('第二条普通消息'))
    assert.ok(h.calls[1].text.includes('第三条普通消息'))
    resolve('{"d":{},"t":""}'); await flush()
  } finally { h.dispose() }
})

test('old tool definitions reject execution after unload', async () => {
  const h = await harness()
  h.dispose()
  for (const tool of h.tools) assert.equal((await tool.execute()).ok, false)
})

test('solo never reports success when the snapshot write fails', async () => {
  const h = await harness(async () => 'PRIVATE_SENTINEL', { failSaveAfter: 1 })
  try {
    assert.ok((await h.commands.get('独处')()).includes('未生成'))
    assert.ok(!h.logs.includes('独处已记（内容私有）'))
  } finally { h.dispose() }
})

test('weekly completion persists the generated week and completion marker', async () => {
  const now = Date.now()
  const state = { ...blank(), lastOwnerAt: now, history: [
    { at: now - 86400_000, n: 60, b: 60, e: 70, i: 70, r: 0 },
    { at: now, n: 60, b: 60, e: 70, i: 70, r: 0 },
  ] }
  const h = await harness(async () => 'SYNTHETIC_WEEK', { state })
  try {
    await h.every()
    assert.equal(h.saved().weekText, 'SYNTHETIC_WEEK')
    assert.ok(h.saved().lastWeekAt > 0)
    assert.equal(h.saved().weeks.length, 1)
  } finally { h.dispose() }
})


test('runtime self-check is registered, read-only, and excludes private content', async () => {
  const state = { ...blank(), thoughts: [{ text: 'PRIVATE_DIAGNOSTIC_SENTINEL', at: Date.now() }], mt: { text: 'PRIVATE_DIAGNOSTIC_SENTINEL', at: Date.now() } }
  const h = await harness(undefined, { state })
  try {
    const before = JSON.stringify(state), writes = h.saves(), requests = h.calls.length
    const text = h.commands.get('情绪自检')()
    const report = JSON.parse(text)
    assert.equal(report.revision, 0)
    assert.ok(report.instance)
    assert.ok(Object.values(report.functions).every(Boolean))
    assert.equal(JSON.stringify(state), before)
    assert.equal(h.saves(), writes)
    assert.equal(h.calls.length, requests)
    assert.ok(!text.includes('PRIVATE_DIAGNOSTIC_SENTINEL'))
    assert.ok(h.logs.every((line) => !line.includes('PRIVATE_DIAGNOSTIC_SENTINEL')))
  } finally { h.dispose() }
})

test('pending internal startup does not hit TDZ and its timer is disposed', async () => {
  const h = await harness(undefined, { state: { ...blank(), pendingInternal: ['SYNTHETIC_INTERNAL_EVENT'] } })
  assert.ok(h.commands.has('情绪自检'))
  assert.equal(h.timers.size, 1)
  h.dispose()
  assert.equal(h.timers.size, 0)
  assert.equal(h.calls.length, 0)
})


test('dry-run reads branch conditions without model, writes, or delivery', async () => {
  const state = { ...blank(), values: [{ text: 'PRIVATE_SENTINEL' }], cues: { PRIVATE_SENTINEL: { k: 'identity', s: 1, at: Date.now() } } }
  const h = await harness(undefined, { state })
  try {
    const before = JSON.stringify(state), writes = h.saves()
    const output = h.commands.get('情绪自检')('dry-run')
    const report = JSON.parse(output)
    assert.equal(report.dryRun.mode, 'read-only')
    assert.equal(report.dryRun.values.existing, 1)
    assert.equal(JSON.stringify(state), before)
    assert.equal(h.saves(), writes)
    assert.equal(h.calls.length, 0)
    assert.equal(h.deliveries.length, 0)
    assert.equal(h.memories.length, 0)
    assert.ok(!output.includes('PRIVATE_SENTINEL'))
  } finally { h.dispose() }
})

test('other-speaker sampling appraises every message (behaviour change)', async () => {
  const h = await harness(async () => '{"d":{"disgust":3},"t":""}')
  try {
    h.message('UNIT_FIXTURE_MESSAGE', false); await h.tick()
    assert.equal(h.calls.length, 1)
    // A 是行为变更：群友的评分只写该人，原全局 disgust 断言不再成立。
    assert.equal(h.saved().people['20000'].disgust, 3)
    assert.equal(h.saved().disgust, 0)
    assert.equal(h.deliveries.length, 0)
  } finally { h.dispose() }
})

test('value creation is reachable only with the unchanged appraisal gate', async () => {
  const h = await harness(async (request) => request.title === 'emostate-value' ? 'SYNTHETIC_VALUE' : '{"d":{"anger":4},"t":""}')
  try {
    h.message('UNIT_FIXTURE_MESSAGE'); await h.tick()
    assert.equal(h.saved().values.length, 1)
    assert.equal(h.saved().values[0].text, 'SYNTHETIC_VALUE')
    assert.equal(h.deliveries.length, 0)
  } finally { h.dispose() }
  const below = await harness(async () => '{"d":{"anger":3},"t":""}')
  try {
    below.message('UNIT_FIXTURE_MESSAGE'); await below.tick()
    assert.equal(below.calls.length, 1)
    assert.equal(below.saved().values, undefined)
  } finally { below.dispose() }
})

test('cue learning is reachable in synthetic memory with strong appraisal and neutral predecessor', async () => {
  const h = await harness(async () => '{"d":{"identity":-6},"why":"他说我骗他","t":""}', { state: { ...blank(), lastText: '测试线索' } })
  try {
    // This is an isolated VM fixture; no real activity hook or model is invoked.
    h.message('你是不是又在骗我'); await h.tick()
    assert.equal(h.saved().cues['测试线索'].k, 'identity')
    assert.equal(h.saved().cues['测试线索'].n, 1)
    assert.equal(h.deliveries.length, 0)
  } finally { h.dispose() }
})

test('proactive branch only delivers to the fake adapter when the model chooses send', async () => {
  for (const send of [false, true]) {
    const h = await harness(async () => JSON.stringify({ act: 'think', thought: 'SYNTHETIC_PRIVATE', message: 'SYNTHETIC_PUBLIC', send, wait: 40 }))
    try {
      await h.commands.get('独处')()
      assert.equal(h.deliveries.length, send ? 1 : 0)
      assert.equal(h.saved().proCount || 0, send ? 1 : 0)
      if (send) assert.equal(h.deliveries[0][1], 'SYNTHETIC_PUBLIC')
      assert.ok(h.logs.every((x) => !x.includes('SYNTHETIC_PRIVATE')))
    } finally { h.dispose() }
  }
})

test('look branch reads the documented hub chat log through a fake adapter', async () => {
  let count = 0
  const h = await harness(async () => ++count === 1
    ? '{"act":"look","thought":"","send":false,"wait":40}'
    : '{"thought":"SYNTHETIC_LOOK","wait":40}', { chatLog: [{ who: 'user', chatId: 'group:synthetic', text: 'UNIT_GROUP_FIXTURE' }] })
  try {
    await h.commands.get('独处')()
    assert.equal(h.calls.length, 2)
    assert.equal(h.saved().soloLine.text, 'SYNTHETIC_LOOK')
    assert.equal(h.deliveries.length, 0)
  } finally { h.dispose() }
})

test('value result after reload cannot apply to the new state', async () => {
  let resolve
  const h = await harness((request) => request.title === 'emostate-value'
    ? new Promise((r) => { resolve = r }) : Promise.resolve('{"d":{"anger":4},"t":""}'))
  try {
    h.message('UNIT_FIXTURE_MESSAGE'); await h.tick()
    assert.equal(typeof resolve, 'function')
    h.commands.get('情绪重载')()
    const writes = h.saves()
    resolve('STALE_SYNTHETIC_VALUE'); await flush()
    assert.equal(h.saves(), writes)
    assert.ok(!h.commands.get('界线')().includes('STALE_SYNTHETIC_VALUE'))
  } finally { h.dispose() }
})


test('private thought cannot be used as a missing or identical public message', async () => {
  for (const message of ['', 'SYNTHETIC_PRIVATE']) {
    const h = await harness(async () => JSON.stringify({ act: 'think', thought: 'SYNTHETIC_PRIVATE', message, send: true, wait: 40 }))
    try { await h.commands.get('独处')(); assert.equal(h.deliveries.length, 0) } finally { h.dispose() }
  }
})

test('empty JSON thought is not sent as raw JSON and failed delivery is not counted', async () => {
  const empty = await harness(async () => '{"act":"think","thought":"","send":true,"wait":40}')
  try { await empty.commands.get('独处')(); assert.equal(empty.deliveries.length, 0); assert.equal(empty.saved().soloLine, undefined) } finally { empty.dispose() }
  const failed = await harness(async () => '{"act":"think","thought":"PRIVATE","message":"PUBLIC","send":true,"wait":40}', { deliveryResult: { failed: 1 } })
  try { await failed.commands.get('独处')(); assert.equal(failed.saved().proCount || 0, 0) } finally { failed.dispose() }
})

test('learned cue metadata reaches appraisal without leaking its exemption into the next message', async () => {
  const state = { ...blank(), cues: { 测试线索: { k: 'identity', n: 3, s: 1, at: Date.now() } } }
  const h = await harness(async () => '{"d":{"identity":-6},"t":""}', { state })
  try {
    h.message('测试线索'); await h.tick()
    assert.ok(Math.abs(h.saved().identity - 64) < 0.001)
    assert.equal(h.calls.length, 1) // 已学线索命中时不重复评估同一句
    h.message('另一条普通消息') // 下一条真实队列项不得继承豁免
    await h.tick()
    assert.ok(h.saved().identity > 63 && h.saved().identity <= 64)
    assert.equal(h.calls.length, 2)
  } finally { h.dispose() }
})


test('diary and chronicle commands never export private journal contents', async () => {
  const state = { ...blank(), diaries: [{ at: Date.now(), text: 'PRIVATE_JOURNAL_SENTINEL' }], chronicles: [{ period: '2026-11', text: 'PRIVATE_JOURNAL_SENTINEL' }] }
  const h = await harness(undefined, { state })
  try {
    for (const name of ['日记', '编年史']) assert.ok(!h.commands.get(name)().includes('PRIVATE_JOURNAL_SENTINEL'))
  } finally { h.dispose() }
})


test('self-check reports a missing function without calling it or crashing', async () => {
  const h = await harness(undefined, { sourceTransform: (source) => source.replace('async function selfCheck(text)', 'async function intentionallyMissingSelfCheck(text)') })
  try {
    assert.equal(JSON.parse(h.commands.get('情绪自检')()).functions.selfCheck, false)
    assert.equal(h.calls.length, 0)
  } finally { h.dispose() }
})

test('two different other speakers keep separate records', async () => {
  let n = 0
  const h = await harness(async () => (++n === 1 ? '{"d":{"disgust":5},"t":""}' : '{"d":{"disgust":2},"t":""}'))
  try {
    for (let i = 0; i < 3; i++) h.message('UNIT_A_MESSAGE', false, '20001', 'group:90000')
    await h.tick()
    const s1 = h.saved()
    assert.equal(s1.people['20001'].disgust, 5)
    for (let i = 0; i < 3; i++) h.message('UNIT_B_MESSAGE', false, '20002', 'group:90000')
    await h.tick()
    const s2 = h.saved()
    assert.equal(s2.people['20001'].disgust, 5, 'A 的评分不该被 B 改动')
    assert.equal(s2.people['20002'].disgust, 2)
    assert.equal(s2.disgust, 0, '群友的厌恶不该写进全局')
  } finally { h.dispose() }
})

test('an other speaker crossing a line never moves the owner bond', async () => {
  const base = blank()
  const h = await harness(async () => '{"d":{"bond":-6,"disgust":6},"t":""}')
  try {
    for (let i = 0; i < 3; i++) h.message('UNIT_C_MESSAGE', false, '20003', 'group:90000')
    await h.tick()
    const s = h.saved()
    assert.equal(s.people['20003'].disgust, 6)
    assert.ok(s.people['20003'].bond < base.bond, '对她自己的关系应下降')
    assert.ok(Math.abs(s.bond - base.bond) < 0.5, '主人的 bond 不该被群友带走')
  } finally { h.dispose() }
})

test('mixed pending speakers split before appraisal and retain their own model deltas', async () => {
  const state = { ...blank(), bond: 50 }
  const h = await harness(async ({ text }) => {
    if (text.includes('发言人ID=20001')) return '{"d":{"bond":-2,"disgust":4},"h":{"load":0,"trust":-3,"drive":0,"steady":0},"t":"PRIVATE_PERSON_A"}'
    if (text.includes('发言人ID=20002')) return '{"d":{"bond":1,"disgust":2},"h":{"load":0,"trust":2,"drive":0,"steady":0},"t":"PRIVATE_PERSON_B"}'
    return '{"d":{"bond":4},"h":{"load":0,"trust":1,"drive":0,"steady":0},"t":""}'
  }, { state })
  try {
    h.message('FIXTURE_A_ONE', false, '20001')
    h.message('FIXTURE_A_TWO', false, '20001')
    h.message('FIXTURE_B_ONE', false, '20002')
    h.message('FIXTURE_OWNER')
    await h.tick()
    assert.equal(h.calls.length, 1)
    assert.ok(h.calls[0].text.includes('FIXTURE_A_ONE') && h.calls[0].text.includes('FIXTURE_A_TWO'))
    assert.ok(!h.calls[0].text.includes('FIXTURE_B_ONE') && !h.calls[0].text.includes('FIXTURE_OWNER'))
    assert.equal(h.saved().bond, 50, '群友批次不能改变主人 bond')
    await h.tick()
    assert.equal(h.calls.length, 2)
    assert.ok(h.calls[1].text.includes('FIXTURE_B_ONE') && !h.calls[1].text.includes('FIXTURE_A_ONE'))
    assert.equal(h.saved().bond, 50)
    await h.tick()
    assert.equal(h.calls.length, 3)
    const s = h.saved()
    assert.equal(s.people['20001'].bond, 48)
    assert.equal(s.people['20001'].disgust, 4)
    assert.equal(s.people['20001'].trust, -3)
    // 这是行为变更：bond 正增量乘剩余空间比例，50 + 1×0.5 = 50.5。
    assert.equal(s.people['20002'].bond, 50.5)
    assert.equal(s.people['20002'].disgust, 2)
    assert.equal(s.people['20002'].trust, 2)
    assert.equal(s.bond, 52) // 同一换算用于主人：50 + 4×0.5 = 52。
    assert.equal(s.hormones.trust, 1)
    assert.equal(s.disgust, 0)
    assert.ok(!JSON.stringify(s.thoughts || []).includes('PRIVATE_PERSON'))
    assert.ok(h.logs.every((line) => !line.includes('PRIVATE_PERSON')))
    assert.equal(h.memories.length, 0)
    assert.equal(h.deliveries.length, 0)
  } finally { h.dispose() }
})

test('group injection uses current prompt senders and private injection retains the owner', async () => {
  const state = { ...blank(), bond: 81, people: {
    '20001': { bond: 41, trust: -3, disgust: 7, lastAt: 1 },
    '20002': { bond: 62, trust: 4, disgust: 2, lastAt: 1 },
  } }
  const h = await harness(undefined, { state })
  try {
    // The most recent activity belongs to B; the actual reply is addressed to A.
    h.message('FIXTURE_B_LATEST', false, '20002')
    const before = JSON.stringify(h.saved()), writes = h.saves()
    const content = [{ type: 'text', text: 'FIXTURE_INPUT' }]
    const group = h.prompt({ chat: { kind: 'group' }, senderId: '20001' }, content)
    assert.equal(content.length, 1)
    assert.equal(group[0].text, 'FIXTURE_INPUT')
    assert.match(group[1].text, /20001.*关系 41，信任 -3，厌恶 7/)
    assert.ok(!group[1].text.includes('20002') && !group[1].text.includes('关系 81'))
    const multi = h.prompt({ chat: { kind: 'group' }, senderId: '20001', extraSenders: ['20002', '20001'] })
    assert.equal((multi[0].text.match(/20001/g) || []).length, 1)
    assert.match(multi[0].text, /20002.*关系 62，信任 4，厌恶 2/)
    assert.equal(h.context({ chat: { kind: 'group' } }), '')
    assert.equal(JSON.stringify(h.saved()), before)
    assert.equal(h.saves(), writes)
    const privateText = h.context({ chat: { kind: 'private' } })
    assert.ok(privateText.includes('关系 81') && !privateText.includes('20001'))
    assert.ok(h.prompt({ chat: { kind: 'group' }, senderId: '10000' })[0].text.includes('关系 81'))
    assert.equal(h.prompt({ chat: { kind: 'private' }, senderId: '20001' }, content), content)
    const report = JSON.parse(h.commands.get('情绪自检')('dry-run'))
    assert.equal(report.dryRun.disgust.sampling, 'every-message')
    assert.equal(report.dryRun.disgust.personRecords, 2)
    assert.equal(h.calls.length, 0)
  } finally { h.dispose() }
})

test('missing other-speaker identity cannot fall back to owner state', async () => {
  const h = await harness(async () => '{"d":{"bond":-6},"t":""}', { state: { ...blank(), bond: 50 } })
  try {
    h.message('FIXTURE_MISSING_ID', false, '')
    await h.tick()
    assert.equal(h.calls.length, 0)
    assert.equal(h.saved().bond, 50)
    assert.equal(Object.keys(h.saved().people || {}).length, 0)
  } finally { h.dispose() }
})

test('late person appraisal cannot commit after explicit reload', async () => {
  let resolve
  const h = await harness(() => new Promise((r) => { resolve = r }))
  try {
    h.message('FIXTURE_PERSON_PENDING', false, '20001')
    await h.tick()
    assert.equal(typeof resolve, 'function')
    h.commands.get('情绪重载')()
    const writes = h.saves()
    resolve('{"d":{"bond":-6,"disgust":6},"t":"PRIVATE_STALE_PERSON"}')
    await flush()
    assert.equal(h.saves(), writes)
    assert.equal(Object.keys(h.saved().people || {}).length, 0)
    assert.ok(h.logs.every((line) => !line.includes('PRIVATE_STALE_PERSON')))
  } finally { h.dispose() }
})

test('owner and group member share bond and hormone soft caps while disgust remains unchanged', async () => {
  const now = Date.now()
  const state = { ...blank(), bond: 94, decayAt: now, hormones: { load: 0, trust: 12, drive: 0, steady: 0 },
    people: { '20001': { bond: 94, trust: 12, disgust: 0, lastAt: 1 } } }
  const h = await harness(async () => '{"d":{"bond":6,"disgust":2},"h":{"load":3,"trust":4,"drive":-1,"steady":2},"t":""}', { state, now })
  try {
    h.message('FIXTURE_OWNER_GAIN')
    h.message('FIXTURE_PERSON_GAIN', false, '20001')
    await h.tick()
    assert.equal(h.saved().bond, 94.36)
    assert.equal(h.saved().people['20001'].bond, 94)
    await h.tick()
    const saved = h.saved()
    assert.equal(saved.bond, 94.36)
    assert.equal(saved.people['20001'].bond, 94.36)
    assert.equal(saved.disgust, 2)
    assert.equal(saved.people['20001'].disgust, 2)
    // 这是行为变更：信任同侧增量也按剩余空间缩放，12 + 4×0.88。
    assert.deepEqual(saved.hormones, { load: 3, trust: 15.52, drive: -1, steady: 2 })
    assert.equal(saved.people['20001'].trust, 15.52)
    // 导入的纯函数模块不在 VM 的固定时钟中；时间戳应落在真实调用区间。
    assert.ok(saved.people['20001'].lastAt >= now && saved.people['20001'].lastAt <= Date.now())
    assert.equal(saved.judgeLog.at(-1).d.bond, 6, '判断记录仍保留她给的原始预算后增量')
    assert.equal(h.calls.length, 2)
    assert.equal(h.deliveries.length, 0)
    assert.equal(h.memories.length, 0)
  } finally { h.dispose() }
})

test('negative bond scores remain unamplified and separate for owner and group member', async () => {
  const now = Date.now()
  const state = { ...blank(), bond: 94, decayAt: now,
    people: { '20001': { bond: 94, trust: 0, disgust: 0, lastAt: 1 } } }
  const h = await harness(async () => '{"d":{"bond":-6},"t":""}', { state, now })
  try {
    h.message('FIXTURE_PERSON_LOSS', false, '20001')
    h.message('FIXTURE_OWNER_LOSS')
    await h.tick()
    assert.equal(h.saved().people['20001'].bond, 88)
    assert.equal(h.saved().bond, 94)
    await h.tick()
    assert.equal(h.saved().bond, 88)
    assert.equal(h.saved().people['20001'].bond, 88)
    assert.equal(h.calls.length, 2)
  } finally { h.dispose() }
})

const monthKey = (now) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(now)
function dailyFixture(now = Date.now()) {
  return { ...blank(), digestDay: dayKey(now - 86400_000), chronicleLast: monthKey(now), lastWeekAt: now,
    nextSoloAt: now + 3600_000, lastOwnerAt: now,
    history: [{ at: now - 86400_000, n: 60, b: 70, e: 70, i: 70, r: 0 }],
    thoughts: [{ text: 'PRIVATE_DAY_SOURCE', at: now - 86400_000 }] }
}

test('daily records generate her self model and only private appraisal receives its text', async () => {
  const h = await harness(async ({ text }) => text.includes('根据已有记录回看你自己')
    ? '{"traits":["PRIVATE_SELF_MODEL"]}' : '{"d":{},"t":""}', { state: dailyFixture() })
  try {
    await h.every()
    assert.deepEqual(h.saved().selfModel.traits, ['PRIVATE_SELF_MODEL'])
    assert.ok(h.saved().selfModel.updatedAt > 0)
    assert.ok(h.calls[0].text.includes('PRIVATE_DAY_SOURCE'))
    assert.ok(h.logs.every((line) => !line.includes('PRIVATE_SELF_MODEL')))
    assert.ok(h.memories.every((entry) => !entry.text.includes('PRIVATE_SELF_MODEL')))
    assert.ok(!h.commands.get('情绪自检')('dry-run').includes('PRIVATE_SELF_MODEL'))
    const reflectedCalls = h.calls.length
    await h.every()
    assert.equal(h.calls.length, reflectedCalls, '同一日结不重复增加反思调用')
    h.message('FIXTURE_OWNER_AFTER_REFLECTION'); await h.tick()
    assert.ok(h.calls.at(-1).text.includes('PRIVATE_SELF_MODEL'))
    h.message('FIXTURE_PERSON_AFTER_REFLECTION', false, '20001'); await h.tick()
    assert.ok(h.calls.at(-1).text.includes('PRIVATE_SELF_MODEL'))
    assert.equal(h.deliveries.length, 0)
  } finally { h.dispose() }
})

test('monthly chronicle also reflects self without putting self model in memory entries', async () => {
  const now = Date.now(), state = { ...dailyFixture(now), digestDay: dayKey(now), chronicleLast: '' }
  const h = await harness(async ({ text }) => text.includes('根据已有记录回看你自己')
    ? '{"traits":["PRIVATE_MONTH_SELF"]}' : 'PRIVATE_CHRONICLE', { state })
  try {
    await h.every()
    assert.equal(h.calls.length, 2)
    assert.equal(h.saved().chronicleLast, monthKey(now))
    assert.deepEqual(h.saved().selfModel.traits, ['PRIVATE_MONTH_SELF'])
    assert.ok(h.memories.some((entry) => entry.source === 'emostate-chronicle'))
    assert.ok(h.memories.every((entry) => !entry.text.includes('PRIVATE_MONTH_SELF')))
    assert.ok(!h.commands.get('编年史')().includes('PRIVATE_CHRONICLE'))
  } finally { h.dispose() }
})

test('invalid self model preserves prior beliefs while explicit empty traits withdraws them', async () => {
  for (const raw of ['not JSON', '{"traits":[]}']) {
    const state = { ...dailyFixture(), selfModel: { traits: ['PREVIOUS_PRIVATE_SELF'], updatedAt: 1 } }
    const h = await harness(async () => raw, { state })
    try {
      await h.every()
      assert.deepEqual(h.saved().selfModel.traits, raw === 'not JSON' ? ['PREVIOUS_PRIVATE_SELF'] : [])
      if (raw === 'not JSON') assert.equal(h.saved().selfModel.updatedAt, 1)
    } finally { h.dispose() }
  }
})

test('self reflection after reload or unload cannot commit its stale result', async () => {
  for (const unload of [false, true]) {
    let resolve
    const h = await harness(() => new Promise((r) => { resolve = r }), { state: dailyFixture() })
    const task = h.every(); await flush()
    assert.equal(typeof resolve, 'function')
    if (unload) h.dispose(); else h.commands.get('情绪重载')()
    const writes = h.saves()
    resolve('{"traits":["STALE_PRIVATE_SELF"]}'); await task
    assert.equal(h.saves(), writes)
    assert.equal(h.saved().selfModel, undefined)
    if (!unload) h.dispose()
  }
})

test('late monthly chronicle cannot write memory or launch self reflection after reload', async () => {
  let resolve
  const now = Date.now(), state = { ...dailyFixture(now), digestDay: dayKey(now), chronicleLast: '' }
  const h = await harness(() => new Promise((r) => { resolve = r }), { state })
  try {
    const task = h.every(); await flush()
    h.commands.get('情绪重载')()
    const writes = h.saves()
    resolve('STALE_PRIVATE_CHRONICLE'); await task
    assert.equal(h.saves(), writes)
    assert.equal(h.memories.length, 0)
    assert.equal(h.calls.length, 1)
  } finally { h.dispose() }
})

test('solo may propose an intent without thought, sending, or an automatic completion', async () => {
  const h = await harness(async () => '{"act":"think","thought":"","send":false,"intent":"PRIVATE_NEW_INTENT","wait":40}')
  try {
    assert.ok((await h.commands.get('独处')()).includes('独处已完成'))
    assert.equal(h.saved().intents[0].text, 'PRIVATE_NEW_INTENT')
    assert.equal(h.saved().intents[0].done, false)
    assert.equal(h.deliveries.length, 0)
    assert.equal(h.memories.length, 0)
    assert.equal(JSON.parse(h.commands.get('情绪自检')()).lastSuccess.path, 'intents')
    assert.ok(h.context({ chat: { kind: 'private' } }).startsWith('你此前自己想做'))
    // 行为变更（审查报告 §2）：主人在群里发言也不带入私有意向；私聊才带
    assert.ok(!JSON.stringify(h.prompt({ chat: { kind: 'group' }, senderId: '10000' })).includes('PRIVATE_NEW_INTENT'))
    assert.ok(!JSON.stringify(h.prompt({ chat: { kind: 'group' }, senderId: '20001' })).includes('PRIVATE_NEW_INTENT'))
    assert.equal(h.saved().intents[0].done, false)
    assert.ok(!h.commands.get('情绪自检')('dry-run').includes('PRIVATE_NEW_INTENT'))
  } finally { h.dispose() }
})

test('only explicit solo choice closes an intent, including when she chooses sleep', async () => {
  let call = 0
  const h = await harness(async () => ++call === 1
    ? '{"act":"think","thought":"","send":false,"wait":40}'
    : '{"act":"sleep","thought":"","send":false,"wait":40,"closeIntents":["PRIVATE_EXISTING"]}', {
    state: { ...blank(), intents: [{ text: 'PRIVATE_EXISTING', at: 1, done: false }] },
  })
  try {
    await h.commands.get('独处')()
    assert.equal(h.saved().intents[0].done, false)
    await h.commands.get('独处')()
    assert.equal(h.saved().intents[0].done, true)
    assert.ok(!h.context().includes('PRIVATE_EXISTING'))
    assert.equal(h.deliveries.length, 0)
  } finally { h.dispose() }
})

test('an old solo decision cannot add or close goals after reload', async () => {
  let resolve
  const h = await harness(() => new Promise((r) => { resolve = r }), { state: { ...blank(), intents: [{ text: 'OLD', at: 1, done: false }] } })
  try {
    const task = h.commands.get('独处')(); await flush()
    h.commands.get('情绪重载')()
    const writes = h.saves()
    resolve('{"act":"think","thought":"","intent":"STALE_PRIVATE_INTENT","closeIntents":["OLD"]}'); await task
    assert.equal(h.saves(), writes)
    assert.equal(h.saved().intents[0].done, false)
    assert.ok(!JSON.stringify(h.saved()).includes('STALE_PRIVATE_INTENT'))
  } finally { h.dispose() }
})

test('private records never appear in commands, tool receipts, diagnostics or logs', async () => {
  const now = Date.now(), secret = 'PRIVATE_ALL_SURFACES'
  const state = { ...blank(), thoughts: [{ at: now, text: secret, solo: true }], memoryNotes: [{ at: now, text: secret }],
    weeks: [{ at: now, text: secret }], weekText: secret, judgeLog: [{ at: now, d: {}, why: secret }],
    selfModel: { traits: [secret], updatedAt: now }, intents: [{ text: secret, at: now, done: false }] }
  const h = await harness(undefined, { state })
  try {
    for (const name of ['情绪', '情绪诊断', '周记', '日记', '编年史', '情绪自检']) {
      assert.ok(!h.commands.get(name)().includes(secret), name)
    }
    for (const tool of h.tools) assert.ok(!JSON.stringify(await tool.execute()).includes(secret), tool.name)
    assert.ok(h.logs.every((line) => !line.includes(secret)))
    assert.ok(h.context().includes(secret), '私有正文仍可进入她自己的模型上下文')
    assert.equal(h.calls.length, 0)
  } finally { h.dispose() }
})

test('failed self model persistence never reports a successful reflection', async () => {
  const h = await harness(async () => '{"traits":["UNSAVED_PRIVATE_SELF"]}', { state: dailyFixture(), failSaveAfter: 2 })
  try {
    await h.every()
    assert.equal(h.saved().selfModel, undefined)
    assert.ok(!h.logs.some((line) => line.includes('自我认识已更新')))
    assert.ok(h.logs.every((line) => !line.includes('UNSAVED_PRIVATE_SELF')))
  } finally { h.dispose() }
})

test('failed intent persistence cannot send a public message or claim completion', async () => {
  const h = await harness(async () => '{"act":"think","thought":"PRIVATE","intent":"UNSAVED_PRIVATE_INTENT","send":true,"message":"PUBLIC"}', { failSaveAfter: 1 })
  try {
    const reply = await h.commands.get('独处')()
    assert.ok(reply.includes('未生成'))
    assert.ok(!reply.includes('UNSAVED_PRIVATE_INTENT'))
    assert.equal(h.saved().intents, undefined)
    assert.equal(h.deliveries.length, 0)
  } finally { h.dispose() }
})
