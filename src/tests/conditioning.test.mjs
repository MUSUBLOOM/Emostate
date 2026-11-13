import test from 'node:test'
import assert from 'node:assert/strict'
import { learn, react, age } from '../lib/conditioning.mjs'
import { parse } from '../lib/appraise.mjs'

test('learn and react use the same punctuation normalization', () => {
  const cues = {}; learn(cues, 'identity', '测试，线索！', 1000)
  assert.equal(react(cues, '测试，线索！', 2000)[0].kind, 'identity')
})

test('short cue only matches the whole normalized text', () => {
  const cues = {}; learn(cues, 'identity', '好吧', 1000)
  assert.equal(react(cues, '那好吧', 2000).length, 0)
  const hit = react(cues, '好吧', 3000)
  assert.equal(hit.length, 1)
  assert.equal(hit[0].cue, '好吧')
})

test('cue aging is elapsed-time based and retains the existing grace and floor', () => {
  const at = 1_000_000, day = 86400_000
  const once = { cue: { k: 'identity', s: 1, at } }, many = structuredClone(once)
  age(once, at + 3 * day)
  for (let i = 0; i <= 72; i++) age(many, at + i * 3600_000)
  assert.ok(Math.abs(once.cue.s - many.cue.s) < 1e-12)
  const before = many.cue.s; age(many, at + 3 * day); assert.equal(many.cue.s, before)
  age(many, at + 1000 * day); assert.equal(many.cue.s, 0.03)
})

test('only trusted learned metadata allows its own safety dimension, with unchanged budget', () => {
  const raw = '{"d":{"identity":-8,"existence":-8,"bond":-8},"t":""}'
  const text = '【内部】他说了一句你先前记住的话：「测试线索」。'
  assert.equal(parse(raw, text).d.identity, undefined)
  const result = parse(raw, text, { learnedSafety: ['identity'] })
  assert.ok(result.d.identity < 0)
  assert.equal(result.d.existence, undefined)
  assert.ok(Object.values(result.d).reduce((n, v) => n + Math.abs(v), 0) <= 12)
  assert.equal(parse('{"d":{},"t":""}', text, { learnedSafety: ['identity'] }).d.identity, undefined)
})
