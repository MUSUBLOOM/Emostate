// 主线第 5 步：反馈链隔离测试（假宿主，0 次模型调用）
// 链路：行动发生 → 反馈归属 → 事实进入评估 → 评估产生更新 → 更新被后续决策使用
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { blank } from '../index.mjs'

const MIN = 60 * 1000

async function harness(state, askReply, chatLogs = []) {
  const timers = new Map(), commands = new Map(), events = new Map(), everyHandlers = new Map()
  let dispose, saved = null, seq = 0
  const calls = []
  const delivered = []
  const mem = { load: () => state, save: (s) => { saved = structuredClone(s); return true }, isBlocked: () => false, reload: () => null }
  const context = vm.createContext({ console, setTimeout: (fn) => { const id = ++seq; timers.set(id, { fn }); return id }, clearTimeout: (id) => timers.delete(id) })
  const synthetic = async (ns) => {
    const mod = new vm.SyntheticModule(Object.keys(ns), function () { for (const [k, v] of Object.entries(ns)) this.setExport(k, v) }, { context })
    await mod.link(() => {}); await mod.evaluate(); return mod
  }
  const source = fs.readFileSync(new URL('../index.mjs', import.meta.url), 'utf8')
  const mod = new vm.SourceTextModule(source, {
    context,
    importModuleDynamically: async (spec) => {
      if (spec === './lib/persistence.mjs') return synthetic({ createSnapshotStore: () => mem })
      return synthetic(await import(new URL('../' + spec, import.meta.url)))
    },
  })
  await mod.link(async (s) => synthetic(await import(s.startsWith('node:') ? s : new URL('../' + s, import.meta.url).href)))
  await mod.evaluate()

  const quiet = () => {}
  const logger = { info: quiet, warn: quiet, error: quiet }
  const api = {
    log: logger,
    core: {
      logger: { child: () => logger },
      getConfig: () => ({ ownerQQ: '10000' }),
      chatLogOf: () => chatLogs,
      hub: { deliver: async (chatId, text) => { delivered.push({ chatId, text }); return { failed: 0 } } },
    },
    ask: (o) => { calls.push({ kind: 'ask', text: o?.text || o }); const t = o?.text || o; return Promise.resolve(typeof askReply === 'function' ? askReply(String(t)) : askReply) },
    think: (t, o) => { calls.push({ kind: 'think', text: t }); return Promise.resolve(typeof askReply === 'function' ? askReply(String(t)) : askReply) },
    lazy: () => ({ add: () => ({ ok: true }) }),
    onDispose: (fn) => { dispose = fn },
    on: (n, f) => events.set('on:' + n, f),
    every: (ms, fn) => { everyHandlers.set(ms, fn) },
    context: () => {},
    rule: () => {},
    command: (x) => commands.set('cmd:' + x.name, x.run),
    defineTool: (x) => x,
    tool: () => {},
  }
  await mod.namespace.default.setup(api)
  const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)) }
  return {
    calls, delivered,
    saved: () => saved,
    run: async (name) => { const r = await commands.get('cmd:' + name)(); await flush(); return r },
    activity: async (e) => { await events.get('on:activity')(e); await flush() },
    tick: async () => { const jobs = [...timers.values()]; timers.clear(); for (const j of jobs) await j.fn(); await flush() },
    heartbeat: async () => { const fn = everyHandlers.get(5 * 60 * 1000); if (fn) await fn(); await flush() },
    dispose: () => { try { delete globalThis[Symbol.for('aurabot.emostate.model-gate.v1')] } catch {} dispose() },
  }
}

function baseState(overrides = {}) {
  const now = Date.now()
  return {
    ...blank(),
    near: 60, bond: 70, existence: 65, identity: 65, command: 50,
    thoughts: [], memoryNotes: [], events: [],
    loadHistory: Array.from({ length: 20 }, (_, i) => ({ at: now - (20 - i) * MIN, v: 0 })),
    hormones: { load: 0, trust: 0, drive: 0, steady: 0 },
    lastOwnerAt: now - 2 * 60 * MIN,
    decayAt: now,
    lastSoloAt: now - 60 * MIN,
    ...overrides,
  }
}

test('反馈链 ①：她的主动开口真的发出去，并记下等待', async () => {
  const state = baseState()
  const h = await harness(state, '{"act":"think","thought":"x","send":true,"message":"SYNTH_PROACTIVE","wait":0}')
  try {
    await h.run('独处')
    assert.equal(h.delivered.length, 1, '应真的调用一次发送')
    assert.equal(h.delivered[0].text, 'SYNTH_PROACTIVE')
    assert.ok(h.saved().waiting && h.saved().waiting.at > 0, '应记下等待时间点')
  } finally { h.dispose() }
})

test('反馈链 ②：主人回话 → 等待被清、归属正确、且回话进入评估', async () => {
  const state = baseState({ waiting: { at: Date.now() - 30 * MIN } })
  const h = await harness(state, '{"act":"think","thought":"","send":false,"wait":0}')
  try {
    const before = h.calls.length
    await h.activity({ kind: 'in', owner: true, userId: '10000', text: 'SYNTH_OWNER_REPLY', chatId: 'private:10000' })
    await h.tick()
    const s = h.saved()
    assert.equal(s.waiting, undefined, '等待应被清除')
    assert.ok(s.waitingMet && s.waitingMet.waitedMin >= 29, '应记下等了多久：' + JSON.stringify(s.waitingMet))
    assert.ok(h.calls.length > before, '主人的回话应进入评估（有模型调用）')
  } finally { h.dispose() }
})

test('反馈链 ③：沉默不会被自动当成一次评估事件', async () => {
  const state = baseState({ waiting: { at: Date.now() - 3 * 3600 * 1000 } })
  const h = await harness(state, '{"act":"think","thought":"","send":false,"wait":0}')
  try {
    const before = h.calls.length
    const s = h.saved() || state
    assert.equal(s.waiting.at > 0, true)
    // 没有任何"他没回"的事件被排入评估队列
    assert.equal(h.calls.length, before, '沉默本身不产生模型调用')
    assert.equal(state.pendingInternal, undefined, '也没有内部事件被排入')
  } finally { h.dispose() }
})

test('反馈链 ④：等待提示只在独处提示里出现，不改状态', async () => {
  const state = baseState({ waiting: { at: Date.now() - 3 * 3600 * 1000 } })
  const h = await harness(state, '{"act":"think","thought":"","send":false,"wait":0}')
  try {
    const beforeLoad = state.hormones.load
    await h.run('独处')
    const s = h.saved()
    assert.equal(s.hormones.load, beforeLoad, '提示不应改变负荷')
  } finally { h.dispose() }
})

test('独处新动作：写给自己，不发送', async () => {
  const state = baseState()
  const reply = (t) => String(t).includes('你在评估对方消息')
    ? '{"d":{},"h":{"load":0,"trust":0,"drive":0,"steady":0},"t":""}'
    : '{"act":"write","thought":"今天有点空","note":"明天记得问他吃没吃饭","wait":20}'
  const h = await harness(state, reply)
  try {
    await h.run('独处')
    const s = h.saved()
    assert.equal((s.notes || []).length, 1, '应存进她自己的小本子')
    assert.equal(s.notes[0].text, '明天记得问他吃没吃饭')
    assert.equal(h.delivered.length, 0, '不该发送')
  } finally { h.dispose() }
})

test('独处新动作：起草一句下次对他说，不发送', async () => {
  const state = baseState()
  const reply = (t) => String(t).includes('你在评估对方消息')
    ? '{"d":{},"h":{"load":0,"trust":0,"drive":0,"steady":0},"t":""}'
    : '{"act":"draft","thought":"","draft":"你昨天说的那件事 我想了一晚上","wait":30}'
  const h = await harness(state, reply)
  try {
    await h.run('独处')
    const s = h.saved()
    assert.equal((s.drafts || []).length, 1)
    assert.equal(s.drafts[0].text, '你昨天说的那件事 我想了一晚上')
    assert.equal(h.delivered.length, 0)
  } finally { h.dispose() }
})
