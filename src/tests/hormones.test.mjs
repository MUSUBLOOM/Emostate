import test from 'node:test'
import assert from 'node:assert/strict'
import { applyHormone } from '../lib/hormones.mjs'

test('hormone increments taper at either signed bound while zero keeps the model scale', () => {
  assert.equal(applyHormone(0, 6), 6)
  assert.equal(applyHormone(0, -6), -6)
  assert.ok(Math.abs(applyHormone(82, 6) - 83.08) < 1e-10)
  assert.ok(Math.abs(applyHormone(-56, -6) + 58.64) < 1e-10)
  assert.equal(applyHormone(100, 6), 100)
  assert.equal(applyHormone(-100, -6), -100)
})

test('hormones can recover from a saturated bound without attenuation or amplification', () => {
  assert.equal(applyHormone(100, -6), 94)
  assert.equal(applyHormone(-100, 6), -94)
  assert.equal(applyHormone(-2, 6), 4)
  assert.equal(applyHormone(2, -6), -4)
})

test('signed hormone conversion is symmetric, bounded and never invents a larger delta', () => {
  for (let current = -100; current <= 100; current++) {
    for (let delta = -10; delta <= 10; delta++) {
      const next = applyHormone(current, delta)
      assert.ok(next >= -100 && next <= 100)
      assert.ok(Math.abs(next - current) <= Math.abs(delta) + 1e-10)
      assert.ok(Math.abs(next + applyHormone(-current, -delta)) < 1e-10)
      assert.ok(delta >= 0 ? next >= current : next <= current)
    }
  }
})

test('invalid hormone input cannot become a fabricated numeric influence', () => {
  for (const value of [NaN, Infinity, '2', null]) {
    assert.throws(() => applyHormone(value, 1))
    assert.throws(() => applyHormone(0, value))
  }
})
