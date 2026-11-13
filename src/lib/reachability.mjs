// 原0.7.0已有条件的同义提取；不改变情绪判断阈值。
export const weekDue = (state, now) => !state.lastWeekAt || now - state.lastWeekAt > 7 * 24 * 3600e3
export const wantsValue = (delta) => Number(delta?.anger) >= 4
export const hasValueRoom = (values) => values.length < 12
export const strongSafety = (delta) => Object.entries(delta).filter(([k, v]) => (k === 'identity' || k === 'existence') && v <= -6)

const day = (at) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at))

// 仅观察状态与运行标志，不执行分支，不返回任何原文/念头/线索/界线。
export function inspectReachability(state, { now = Date.now(), active = null, model = null, soloBusy = null, weekBusy = null } = {}) {
  const days = new Set((state.history || []).filter((x) => now - x.at < 7 * 24 * 3600e3).map((x) => day(x.at))).size
  return {
    mode: 'read-only', observedAt: now,
    selfModel: { traits: state.selfModel?.traits?.length || 0, updatedAt: state.selfModel?.updatedAt || null,
      remaining: '已有日结或编年史成功保存；模型返回有效traits（可为空）；实例/revision仍有效；快照保存成功。不按情绪分数生成标签' },
    intents: { open: (state.intents || []).filter((x) => !x.done).length, closed: (state.intents || []).filter((x) => x.done).length,
      remaining: '独处模型自愿返回intent或closeIntents；格式/存储预算通过；实例仍有效并保存；仅主人对话私有上下文带入未收起项；不自动到期或判定完成' },
    runtime: { active, soloBusy, weekBusy, modelActive: model?.active ?? null, cooldownRemainingMs: model?.cooldownRemainingMs ?? null },
    weekly: { existing: (state.weeks || []).length, historyDays: days, enoughDays: days >= 2, due: weekDue(state, now),
      remaining: 'active + !weekBusy + model成功 + 非空输出 + 快照保存成功；周期任务先等待独处结束' },
    values: { existing: (state.values || []).length, room: hasValueRoom(state.values || []), modelDecision: 'unknown',
      remaining: '校验及预算后的本次anger增量>=4；总数<12；think非空；重复则强化，不新增' },
    cues: { existing: Object.keys(state.cues || {}).length, modelDecision: 'unknown',
      remaining: '本次identity或existence增量<=-6；单条批次；上一句非空且不同、无安全事件证据；归一化线索2至12字' },
    disgust: { current: Number(state.disgust) || 0, otherMessagesSeen: Number(state.othersSeen) || 0,
      sampling: 'every-message', personRecords: Object.keys(state.people || {}).length, modelDecision: 'unknown',
      remaining: '非主人消息非空且userId有效时入队，写该人的people[userId]；主人非空消息沿用全局字段；队列/字符预算内才接收，不同发言人拆批；模型给disgust正增量并通过预算及保存' },
    proactive: { sentCount: Number(state.proCount) || 0, nextSoloAt: Number(state.nextSoloAt) || null,
      explicitScheduleDue: state.nextSoloAt ? now >= Number(state.nextSoloAt) : null, modelDecision: 'unknown',
      remaining: '独处到期、active且非soloBusy；模型send=true、非sleep；独立公开message非空且不等于私有thought；内容先保存；ownerQQ存在；deliver返回failed=0后计数（非送达回执）；无nextSoloAt时按既有40分钟工程调度回退' },
    evidenceLimit: '这是当前门槛快照；unknown不等于条件未到。完整代码路径用隔离单元测试验证，不会生成经历或调用模型。',
  }
}
