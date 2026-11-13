import test from 'node:test'
import assert from 'node:assert/strict'
import { blank, lastBotWaitNote, waitingNote } from '../index.mjs'

const at = (h, m = 0) => new Date(2026, 10, 8, h, m, 0).getTime()

const logsOf = (last) => [last]

test('聊天日志：最后一句是我说的，超过两小时 → 提', () => {
  const line = lastBotWaitNote(logsOf({ t: at(10), chatId: 'private:1', who: 'bot' }), at(13), '1')
  assert.match(line, /3 小时前/)
  assert.match(line, /还没回/)
})

test('聊天日志：最后一句是他说的 → 不提', () => {
  assert.equal(lastBotWaitNote(logsOf({ t: at(10), chatId: 'private:1', who: 'owner' }), at(13), '1'), '')
})

test('聊天日志：不到两小时 → 不提', () => {
  assert.equal(lastBotWaitNote(logsOf({ t: at(12), chatId: 'private:1', who: 'bot' }), at(13), '1'), '')
})

test('聊天日志：夜里 → 不提', () => {
  assert.equal(lastBotWaitNote(logsOf({ t: at(20), chatId: 'private:1', who: 'bot' }), at(23, 30), '1'), '')
})

test('聊天日志：成群聊不算，只看私聊', () => {
  const logs = [
    { t: at(10), chatId: 'group:1', who: 'bot' },
    { t: at(11), chatId: 'private:1', who: 'owner' },
  ]
  assert.equal(lastBotWaitNote(logs, at(14), '1'), '')
})

test('两条路都不触发时，独处提示为空', () => {
  assert.equal(waitingNote({ ...blank() }, at(14)), '')
  assert.equal(lastBotWaitNote([], at(14), '1'), '')
})


test('聊天日志：临时消息/别人私聊不算', () => {
  const logs = [
    { t: at(10), chatId: 'private:999', who: 'bot' },
    { t: at(11), chatId: 'private:1', who: 'owner' },
  ]
  assert.equal(lastBotWaitNote(logs, at(14), '1'), '')
})
