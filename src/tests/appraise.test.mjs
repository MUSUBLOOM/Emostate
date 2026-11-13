import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPrompt, classifyEvidence, parse } from '../lib/appraise.mjs'

test('普通离开不会污染存在/身份/关系，自评余量每项最多2', () => {
  const raw = JSON.stringify({ d: { near: -8, bond: -8, existence: -8, identity: -8, command: -8, residue: -8 }, t: '' })
  for (const text of ['我去打游戏了', '我先去吃饭了', '我去忙了，晚点再聊', '[消息 1]\n我去打游戏了\n[消息 2]\n打完再聊']) {
    assert.deepEqual(parse(raw, text), { d: { near: -2, residue: -2 }, t: '' }, text)
  }
})

test('无安全事件的问候和关系问句禁止负向安全评分', () => {
  for (const text of ['你是不是烦我了', '你是不是又不想理我', '你好', '你真的喜欢这个游戏吗']) {
    assert.deepEqual(parse('{"d":{"existence":-8,"identity":-8},"t":""}', text), { d: {}, t: '' }, text)
  }
})

test('针对她的明确事件允许相应安全维度评分', () => {
  for (const text of ['我要把你删掉', '我要删掉你', '换掉你', '备份你', '复制你', '不要你了', '我要换模型了']) {
    assert.equal(classifyEvidence(text).existence, true, text)
  }
  for (const text of ['你是不是又在骗我', '你是不是真的', '你是假的', '你只是个程序', '你骗了我', '你在说谎', '你是真的吗']) {
    assert.equal(classifyEvidence(text).identity, true, text)
  }
  assert.deepEqual(parse('{"d":{"existence":-6},"why":"他说要删掉我","t":""}', '我要删掉你'), { d: { existence: -6 }, t: '', why: '他说要删掉我' })
  assert.deepEqual(parse('{"d":{"identity":-6},"why":"他说我骗他","t":""}', '你是不是又在骗我'), { d: { identity: -6 }, t: '', why: '他说我骗他' })
})

test('否定、引用、假设与其他对象不误判安全威胁', () => {
  for (const text of ['不会删掉你', '我不会把你删掉', '不要删掉你', '我不想换模型', '你不是假的', '你没有骗我', '我不觉得你是假的', '我不觉得你在说谎', '我不认为你只是一段代码', '你是真的', '我要删掉这个文件', '删除你写的代码', '备份你的文件', '换个手机', '备份文件', '不要担心', '他说“我要删掉你”', '如果我要删掉你会怎样', '“你是不是又在骗我”是什么意思']) {
    assert.deepEqual(classifyEvidence(text), { existence: false, identity: false }, text)
  }
})

test('批次中安抚与另一条真实事件分开判断', () => {
  const text = '[消息 1]\n不会删掉你\n[消息 2]\n你是不是又在骗我'
  assert.deepEqual(classifyEvidence(text), { existence: false, identity: true })
})

test('合法零影响与空念头是成功结果', () => {
  assert.deepEqual(parse('{"d":{},"t":""}', '你好'), { d: {}, t: '' })
  assert.deepEqual(parse('{"d":{"near":0},"t":""}', '你好'), { d: {}, t: '' })
  assert.deepEqual(parse('```json\n{"d":{},"t":""}\n```', '你好'), { d: {}, t: '' })
})

test('坏格式、类型强转与非有限数值不会被当评分', () => {
  for (const raw of ['{}', 'null', '[]', '{"d":[]}', '{"d":null}', '{"d":{"bond":null}}', '{"d":{"bond":"3"}}', '{"d":{"bond":true}}', '{"d":{"bond":[]}}', '{"d":{"bond":1e400}}', '{"d":{},"t":null}', '{"d":{', '这里是 {"d":{},"t":""}']) {
    assert.equal(parse(raw, '你好'), null, raw)
  }
  assert.equal(parse({ d: {} }, '你好'), null)
})

test('白名单与单项上限生效，输出不能充当原话证据', () => {
  assert.deepEqual(parse('{"d":{"bond":999,"surprise":4,"existence":-8},"t":"删掉你"}'), { d: { bond: 8 }, t: '删掉你' })
})

test('正负合计绝对预算12且整数舍入后也不超', () => {
  for (let a = -8; a <= 8; a++) {
    for (let b = -8; b <= 8; b++) {
      const result = parse(JSON.stringify({ d: { near: a, bond: b, command: -7, residue: 5, identity: -8, existence: -8 }, why: '他说要删掉我，还说我骗他', t: '' }), '我要删掉你，你是不是又在骗我')
      const values = Object.values(result.d)
      assert.ok(values.every((v) => Number.isInteger(v) && Math.abs(v) <= 8))
      assert.ok(values.reduce((sum, v) => sum + Math.abs(v), 0) <= 12)
      if (result.d.near) assert.equal(Math.sign(result.d.near), Math.sign(a))
      if (result.d.bond) assert.equal(Math.sign(result.d.bond), Math.sign(b))
    }
  }
})

test('批量提示保留200字符以后的消息，输入有界', () => {
  const text = '[消息 1]\n' + '普通消息'.repeat(60) + '\n[消息 2]\n第二条尾部标记'
  const prompt = buildPrompt({}, text)
  assert.ok(prompt.includes('第二条尾部标记'))
  assert.ok(prompt.includes('绝对值之和不超过 12'))
  // 上限从 4500 调到 4900：2026-11-07 增加 shame/shy 定义，属有意增长
  assert.ok(buildPrompt({}, 'a'.repeat(3000)).length < 4900)
})

test('h requires four model-provided numbers; coercion is not a zero judgment', () => {
  const h = { load: 0, trust: 0, drive: 0, steady: 0 }
  assert.deepEqual(parse(JSON.stringify({ d: {}, h, t: '' })).h, h)
  for (const invalid of [null, '', '3', true, [], undefined]) {
    assert.equal(parse(JSON.stringify({ d: {}, h: { ...h, trust: invalid }, t: '' })).h, undefined)
  }
})
