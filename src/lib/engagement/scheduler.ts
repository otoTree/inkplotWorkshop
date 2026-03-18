import type { EngagementConfig, Episode, PlannedPayoff, HookContract } from '@/types';

export interface ScheduleParams {
  config: EngagementConfig;
  previousEpisodes: Episode[];
  currentEpisodeNumber: number;
}

export interface ScheduleResult {
  suppressionIndex: number;
  plannedPayoff: PlannedPayoff | null;
  hookContract: HookContract;
  constraints: string[];
  warnings: string[];
}

/**
 * 内流控制调度器
 * 综合 Payoff Ledger、Suppression Index、Hook Contract 三模块
 * 为每一集输出标准化的调度指令集
 */
export async function engagementScheduler(params: ScheduleParams): Promise<ScheduleResult> {
  const { config, previousEpisodes, currentEpisodeNumber } = params;

  // 1. 计算当前 SI 值
  const currentSI = calculateSuppressionIndex(previousEpisodes, config.suppressionWeights);

  // 2. 检查钩子到期情况
  const overdueHooks = checkOverdueHooks(previousEpisodes, currentEpisodeNumber);

  // 3. 匹配可释放爽点
  const availablePayoffs = matchAvailablePayoffs(
    config.payoffBudget,
    currentSI,
    currentEpisodeNumber,
    config.totalEpisodes
  );

  // 4. 生成钩子契约
  const hookContract = generateHookContract(
    config.template,
    currentEpisodeNumber,
    config.totalEpisodes
  );

  // 5. 生成约束条件
  const constraints = generateConstraints(currentSI, availablePayoffs);

  // 6. 生成警告
  const warnings = [];
  if (overdueHooks.length > 0) {
    warnings.push(`存在 ${overdueHooks.length} 个超期钩子`);
  }
  if (currentSI > 0.85) {
    warnings.push('压抑指数过高,必须释放爽点');
  }
  if (currentSI < 0.3 && !availablePayoffs.length) {
    warnings.push('压抑不足,需要增加对主角的打压或悬念');
  }

  return {
    suppressionIndex: currentSI,
    plannedPayoff: availablePayoffs[0] || null,
    hookContract,
    constraints,
    warnings
  };
}

/**
 * 计算压抑指数 (Suppression Index)
 * 基于上一集的 SI 和是否释放了爽点
 */
function calculateSuppressionIndex(
  episodes: Episode[],
  weights: Record<string, number>
): number {
  if (episodes.length === 0) return 0.1;

  const lastEpisode = episodes[episodes.length - 1];
  const lastSI = lastEpisode.engagementState?.suppressionIndex || 0;

  // 检查是否释放了爽点
  const payoffReleased = lastEpisode.engagementState?.plannedPayoff?.released;

  if (payoffReleased) {
    // 释放了爽点,SI 下降
    const payoffLevel = lastEpisode.engagementState?.plannedPayoff?.level;
    const reduction = payoffLevel === 'S' ? 0.6 : payoffLevel === 'A' ? 0.3 : payoffLevel === 'B' ? 0.15 : 0.05;
    return Math.max(0, lastSI - reduction);
  } else {
    // 未释放爽点,SI 累加
    return Math.min(1, lastSI + 0.15);
  }
}

/**
 * 检查超期钩子
 */
function checkOverdueHooks(episodes: Episode[], currentEpisode: number): HookContract[] {
  const overdue: HookContract[] = [];

  for (const ep of episodes) {
    const hook = ep.engagementState?.hookContract;
    if (hook && hook.status === 'active' && hook.fulfillByEpisode < currentEpisode) {
      overdue.push(hook);
    }
  }

  return overdue;
}

/**
 * 匹配可释放爽点
 * 根据当前 SI 值和规则,返回可释放的爽点列表
 */
function matchAvailablePayoffs(
  budget: { S: number; A: number; B: number },
  currentSI: number,
  currentEpisode: number,
  totalEpisodes: number
): PlannedPayoff[] {
  const available: PlannedPayoff[] = [];

  // 规则 PL-01: 前 30% 禁止 S 级
  const canReleaseS = currentEpisode > totalEpisodes * 0.3;

  // 规则 PL-03: S 级需 SI >= 0.75
  if (canReleaseS && currentSI >= 0.75 && budget.S > 0) {
    available.push({
      id: `payoff-s-${currentEpisode}`,
      level: 'S',
      description: '史诗级爽点 - 身份揭晓/终极反杀',
      suppressionRequired: 0.75,
      released: false
    });
  }

  // A 级需 SI >= 0.6
  if (currentSI >= 0.6 && budget.A > 0) {
    available.push({
      id: `payoff-a-${currentEpisode}`,
      level: 'A',
      description: '阶段性爽点 - 公开打脸/资源夺回',
      suppressionRequired: 0.6,
      released: false
    });
  }

  // B 级需 SI >= 0.4
  if (currentSI >= 0.4 && budget.B > 0) {
    available.push({
      id: `payoff-b-${currentEpisode}`,
      level: 'B',
      description: '小爽点 - 暗爽/私下反击',
      suppressionRequired: 0.4,
      released: false
    });
  }

  return available;
}

/**
 * 生成钩子契约
 * 根据模板和集数选择合适的钩子类型
 */
function generateHookContract(
  template: string,
  currentEpisode: number,
  totalEpisodes: number
): HookContract {
  // 根据模板选择钩子类型
  const hookTypes = {
    counterattack: ['reward_delay', 'power_shift', 'threat_upgrade'],
    romance: ['emotional_cliff', 'information_gap'],
    mystery: ['information_gap', 'power_shift', 'identity_reveal_tease'],
    custom: ['reward_delay', 'information_gap', 'power_shift']
  };

  const types = hookTypes[template as keyof typeof hookTypes] || hookTypes.custom;
  const randomType = types[Math.floor(Math.random() * types.length)];

  // 根据进度选择钩子强度
  const progress = currentEpisode / totalEpisodes;
  let strength: '强钩' | '中钩' | '弱钩';
  if (progress < 0.3 || progress > 0.8) {
    strength = '强钩'; // 开头和结尾用强钩
  } else if (progress < 0.7) {
    strength = '强钩'; // 中段也用强钩维持追更
  } else {
    strength = '中钩';
  }

  return {
    id: `hook-${currentEpisode}`,
    type: randomType as any,
    strength,
    description: `第 ${currentEpisode} 集钩子`,
    fulfillByEpisode: currentEpisode + 2,
    status: 'active'
  };
}

/**
 * 生成约束条件
 */
function generateConstraints(currentSI: number, payoffs: PlannedPayoff[]): string[] {
  const constraints: string[] = [];

  if (currentSI > 0.85) {
    constraints.push('本集必须释放至少 B 级爽点');
  }

  if (payoffs.length > 0 && (payoffs[0].level === 'A' || payoffs[0].level === 'S')) {
    constraints.push('本集不得释放第二个 A 级或以上爽点');
  }

  constraints.push('结尾必须包含有效钩子');

  if (currentSI > 0.3) {
    constraints.push('SI 不得低于 0.3 (保留追剧动力)');
  }

  return constraints;
}
