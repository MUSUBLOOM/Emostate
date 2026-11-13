import test from 'node:test'
import assert from 'node:assert/strict'
import { blank, waitingNote } from '../index.mjs'

const at = (h, m = 0) => new Date(2026, 10, 8, h, m, 0).getTime()

test('waiting：不到两小时不提', () => {
  const s = { ...blank(), waiting: { at: at(12) } }
  assert.equal(waitingNote(s, at(13, 30)), '')
})

test('waiting：白天超过两小时，提一次事实', () => {
  const s = { ...blank(), waiting: { at: at(10) } }
  const line = waitingNote(s, at(14))
  assert.match(line, /4 小时前/)
  assert.match(line, /还没回/)
})

test('waiting：夜里不提（他可能在睡）', () => {
  const s = { ...blank(), waiting: { at: at(20) } }
  assert.equal(waitingNote(s, at(23, 30)), '')
  assert.equal(waitingNote(s, at(3)), '')
})

test('waiting：没有等待记录就不提', () => {
  const s = { ...blank() }
  assert.equal(waitingNote(s, at(14)), '')
})
