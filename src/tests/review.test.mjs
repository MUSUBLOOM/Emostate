import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { blank, decay } from '../index.mjs'
import { recallCapOf } from '../lib/emotion.mjs'

// 复用 module.test.mjs 的最小 harness（只加载本文件需要的部分）
async function harness(ask = async () => '{"d":{},"t":""}', options = {}) {
  const logs = [], calls = [], timers = new Map(), commands = new Map(), events = new Map()
  let dispose, contextHook, saved = null, seq = 0
  const mem = { load: () => options.state || blank(), save: (s) => { saved = structuredClone(s); return true }, isBlocked: () => false, reload: () => null }
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
  const logger = Object.fromEntries(['info', 'warn', 'error'].map((l) => [l, (x) => logs.push(x)]))
  const api = {
    log: logger, core: { logger: { child: () => logger }, getConfig: () => ({ ownerQQ: '10000' }), hub: { deliver: async () => ({ failed: 0 }), chatLogOf: () => [] } },
    ask: (o) => { calls.push(o); return ask(o) }, think: (t, o) => { const r = { text: t, title: o?.title }; calls.push(r); return ask(r) },
    lazy: () => ({ add: () => ({ ok: true }) }), onDispose: (fn) => { dispose = fn }, on: (n, f) => events.set(n, f),
    every: () => {}, context: (f) => { contextHook = f }, rule: () => {}, command: (x) => commands.set(x.name, x.run),
    defineTool: (x) => x, tool: () => {},
  }
  await mod.namespace.default.setup(api)
  const flush = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)) }
  return {
    saved: () => saved, calls, commands,
    message: (text, owner = true, userId = '10000') => events.get('activity')({ kind: 'in', owner, text, userId, chatId: owner ? 'private:10000' : 'group:90000' }),
    tick: async () => { const jobs = [...timers.values()]; timers.clear(); for (const j of jobs) j.fn(); await flush() },
    dispose: () => { try { delete globalThis[Symbol.for('aurabot.emostate.model-gate.v1')] } catch {} dispose() },
  }
}

test('review §1: shy increment is applied exactly once', async () => {
  const h = await harness(async () => '{"d":{"shy":3},"h":{"load":0,"trust":0,"drive":0,"steady":0},"t":""}')
  try {
    h.message('一句话')
    await h.tick()
    const shy = Number(h.saved().shy || 0)
    assert.ok(shy > 2.9 && shy <= 3, '应约为 3，不应被加两次：' + shy)
  } finally { h.dispose() }
})

test('review §3: small hormone residue does not stall at one', () => {
  const now = Date.now()
  const s = { ...blank(), hormones: { load: 0, trust: 1, drive: 0, steady: 0 }, decayAt: now - 5 * 60 * 1000 }
  decay(s, now)
  assert.ok(s.hormones.trust < 1 && s.hormones.trust > 0.999, '5 分钟后应略小于 1：' + s.hormones.trust)
  const s2 = { ...blank(), shy: 0.3, decayAt: now - 5 * 60 * 1000 }
  decay(s2, now)
  assert.ok(s2.shy < 0.3 && s2.shy > 0.2, '害羞应继续下降而不是被舍入卡住：' + s2.shy)
})

test('review §3b: timed decay matches splitting across the hold boundary', () => {
  const HOUR = 3600 * 1000
  const t0 = Date.parse('2026-11-07T10:00:00Z')
  const make = () => ({
    ...blank(),
    bond: 80,
    anger: 60,
    holds: { bond: { hold: '很久', recover: '慢', at: t0, ttl: 2 * HOUR }, anger: { hold: '长', recover: '正常', at: t0, ttl: HOUR } },
    decayAt: t0,
  })
  const oneShot = make()
  decay(oneShot, t0 + 3 * HOUR)

  const split = make()
  for (let i = 1; i <= 36; i++) decay(split, t0 + i * 5 * 60 * 1000)

  assert.ok(Math.abs(oneShot.bond - split.bond) < 1e-6, 'bond 一次算与分段算应一致：' + oneShot.bond + ' vs ' + split.bond)
  assert.ok(Math.abs(oneShot.anger - split.anger) < 1e-6, 'anger 一次算与分段算应一致：' + oneShot.anger + ' vs ' + split.anger)
})

test('mechanism: high load reduces how many past items she can recall', async () => {
  const { describe } = await import('../lib/emotion.mjs')
  const now = Date.now()
  const make = (load) => ({
    ...blank(),
    hormones: { load, trust: 0, drive: 0, steady: 0 },
    // 她自己的历史：中位数为 0；现在的负荷高于中位数才算“高”
    loadHistory: Array.from({ length: 20 }, (_, i) => ({ at: now - (20 - i) * 60000, v: 0 })),
    memoryNotes: [{ text: '记得一', at: now }, { text: '记得二', at: now }],
    thoughts: [{ text: '想过一', at: now, solo: true }, { text: '想过二', at: now, solo: true }],
  })
  const low = describe(make(0), now)
  const high = describe(make(80), now)
  assert.ok(low.includes('记得一') && low.includes('记得二'), '低负荷应能想起两条')
  assert.ok(!high.includes('记得一'), '高负荷应只保留最近一条：' + high)
})

test('receptor layer: owner presence and higher load both accelerate recovery', () => {
  const now = Date.now()
  const base = (owner) => ({
    ...blank(),
    hormones: { load: 80, trust: 0, drive: 0, steady: 0 },
    lastOwnerAt: owner ? now - 10 * 60 * 1000 : now - 5 * 3600 * 1000,
    decayAt: now - 2 * 3600 * 1000,
  })
  const withOwner = base(true)
  const without = base(false)
  decay(withOwner, now)
  decay(without, now)
  assert.ok(withOwner.hormones.load < without.hormones.load, '主人在时恢复应更快：' + withOwner.hormones.load + ' vs ' + without.hormones.load)

  const small = { ...blank(), hormones: { load: 10, trust: 0, drive: 0, steady: 0 }, lastOwnerAt: now - 5 * 3600 * 1000, decayAt: now - 2 * 3600 * 1000 }
  const big = { ...blank(), hormones: { load: 80, trust: 0, drive: 0, steady: 0 }, lastOwnerAt: now - 5 * 3600 * 1000, decayAt: now - 2 * 3600 * 1000 }
  decay(small, now)
  decay(big, now)
  assert.ok(big.hormones.load / 80 < small.hormones.load / 10, '负荷越大，恢复比例越快（稳态负反馈）')
})

test('near decays toward an absence baseline and never rises from being ignored', () => {
  const H = 3600 * 1000
  const t0 = Date.now()
  const mk = (near) => ({ ...blank(), near, lastOwnerAt: t0, decayAt: t0 })
  const high = mk(83); decay(high, t0 + 11 * H)
  assert.ok(high.near > 30 && high.near < 45, '隔 11 小时应落在 30~45：' + high.near)
  const low = mk(6); decay(low, t0 + 11 * H)
  assert.equal(low.near, 6, '没人说话不该把连接养回来')
  const longAway = mk(83); decay(longAway, t0 + 100 * H)
  assert.ok(longAway.near >= 30 && longAway.near < 31, '久不在应收敛到基线 30，而不是 0：' + longAway.near)
})

test('decay 不因同一时刻重复调用而重复写负荷历史', () => {
  const now = Date.parse('2026-11-08T10:00:00+08:00')
  const s = {
    ...blank(),
    loadHistory: Array.from({ length: 8 }, (_, i) => ({ at: now - (8 - i) * 60000, v: 0 })),
    hormones: { load: 1, trust: 0, drive: 0, steady: 0 },
    decayAt: now,
  }
  const before = s.loadHistory.length
  const capBefore = recallCapOf(s)
  decay(s, now)
  const afterOne = s.loadHistory.length
  for (let i = 0; i < 10; i++) decay(s, now)
  assert.equal(s.loadHistory.length, afterOne, '同一时刻重复衰减不应再写点')
  assert.equal(recallCapOf(s), capBefore, '同一时刻重复衰减不应翻转配额')

  // 时间推进 2 分钟才允许再记一个点
  decay(s, now + 2 * 60000)
  assert.equal(s.loadHistory.length, afterOne + 1, '时间推进后应记一个新点')
})
