// 派生结果缓存
// 前置音素、循环依赖、各宽度学习路径都是由活动的“依赖 + 音素 + 顺序”算出来的派生结果。
// 每次活动编辑或离线合并后，用签名判断依赖/音素/顺序是否变化：签名不变直接复用旧结果，
// 签名变了就把对应旧结果作废并重算，同时保留一条失效记录供界面提示老师。

import type { Activity, Course, PreviewWidth } from './course';

export interface PathLesson {
  index: number;
  title: string;
  activityIds: string[];
  phonemes: string[];
  minutes: number;
}

export interface DerivedSnapshot {
  prerequisitePhonemes: Record<string, string[]>;
  cycle: string[] | null;
  paths: Record<PreviewWidth, PathLesson[]>;
}

export interface InvalidationRecord {
  at: string;
  reason: '依赖变化' | '音素变化' | '顺序或内容变化' | '离线合并';
  detail: string;
}

/** 每种宽度一屏/一课承载的活动数：手机更碎、桌面更整 */
export const PATH_PAGE_SIZE: Record<PreviewWidth, number> = { phone: 2, tablet: 3, desktop: 4 };
export const WIDTH_LABEL: Record<PreviewWidth, string> = { phone: '手机', tablet: '平板', desktop: '桌面' };

const CACHE_LIMIT = 8;

export class DerivedCache {
  private cache: Array<{ signature: string; snapshot: DerivedSnapshot }> = [];
  private dependencySignature = '';
  private phonemeSignature = '';
  private orderSignature = '';
  invalidations: InvalidationRecord[] = [];
  /** 由外部（如离线合并）预告下一次失效的原因，resolve 时消费一次 */
  pendingReason: InvalidationRecord['reason'] | null = null;
  pendingDetail: string | null = null;

  /**
   * 取出与当前课程匹配的派生结果；签名过期的旧结果立即作废重算。
   * 返回值带 recomputed 标记，界面可据此显示“旧结果已失效并重算”。
   */
  resolve(course: Course, reason: InvalidationRecord['reason'] | null = null): { snapshot: DerivedSnapshot; recomputed: boolean } {
    const dependencySignature = signDependencies(course.activities);
    const phonemeSignature = signPhonemes(course.activities);
    const orderSignature = signOrder(course.activities);
    const changed: string[] = [];
    if (this.dependencySignature && dependencySignature !== this.dependencySignature) changed.push('前置依赖');
    if (this.phonemeSignature && phonemeSignature !== this.phonemeSignature) changed.push('音素');
    if (this.orderSignature && orderSignature !== this.orderSignature) changed.push('活动顺序或内容');

    const signature = `${dependencySignature}|${phonemeSignature}|${orderSignature}`;
    const hadState = Boolean(this.dependencySignature || this.phonemeSignature || this.orderSignature);
    const hit = this.cache.find((item) => item.signature === signature);

    let recomputed = false;
    let snapshot: DerivedSnapshot;
    if (hit) {
      snapshot = hit.snapshot;
    } else {
      snapshot = computeDerived(course);
      this.cache.unshift({ signature, snapshot });
      this.cache = this.cache.slice(0, CACHE_LIMIT);
      recomputed = true;
    }

    if (changed.length || (recomputed && hadState)) {
      const effectiveReason = reason ?? this.pendingReason ?? (changed.includes('前置依赖') ? '依赖变化' : changed.includes('音素') ? '音素变化' : '顺序或内容变化');
      this.invalidations.unshift({
        at: new Date().toISOString(),
        reason: effectiveReason,
        detail: this.pendingDetail ?? `${changed.join('、') || '课程结构'}发生变化，前置音素、循环依赖与各宽度学习路径的旧结果已作废重算。`
      });
      this.invalidations = this.invalidations.slice(0, 12);
    }
    this.pendingReason = null;
    this.pendingDetail = null;

    this.dependencySignature = dependencySignature;
    this.phonemeSignature = phonemeSignature;
    this.orderSignature = orderSignature;
    return { snapshot, recomputed };
  }
}

function signDependencies(activities: Activity[]): string {
  return activities
    .map((activity) => `${activity.id}:[${[...activity.dependencies].sort().join(',')}]`)
    .join('|');
}

function signPhonemes(activities: Activity[]): string {
  return activities
    .map((activity) => `${activity.id}:${activity.type}:[${[...activity.phonemes].sort().join(',')}]`)
    .join('|');
}

function signOrder(activities: Activity[]): string {
  return activities.map((activity) => activity.id).join('>');
}

/** 沿依赖链求传递前置，再汇总前置活动中“教过”的音素 */
export function computePrerequisitePhonemes(activities: Activity[]): Record<string, string[]> {
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const result: Record<string, string[]> = {};

  const collect = (id: string, stack: Set<string>): Set<string> => {
    const phonemes = new Set<string>();
    if (stack.has(id)) return phonemes; // 环上不再递归，交给循环依赖检查提示
    stack.add(id);
    const activity = byId.get(id);
    for (const dependencyId of activity?.dependencies ?? []) {
      const dependency = byId.get(dependencyId);
      if (dependency?.type === '音素') dependency.phonemes.forEach((phoneme) => phonemes.add(phoneme));
      collect(dependencyId, stack).forEach((phoneme) => phonemes.add(phoneme));
    }
    stack.delete(id);
    return phonemes;
  };

  for (const activity of activities) {
    result[activity.id] = [...collect(activity.id, new Set())];
  }
  return result;
}

export function findDependencyCycle(activities: Activity[]): string[] | null {
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  let cycle: string[] = [];
  const visit = (id: string, path: string[]): boolean => {
    if (visiting.has(id)) {
      cycle = [...path.slice(path.indexOf(id)), id];
      return true;
    }
    if (visited.has(id)) return false;
    visiting.add(id);
    const activity = byId.get(id);
    for (const dependency of activity?.dependencies ?? []) {
      if (visit(dependency, [...path, dependency])) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const activity of activities) {
    if (visit(activity.id, [activity.id])) break;
  }
  return cycle.length ? cycle : null;
}

function buildPath(activities: Activity[], width: PreviewWidth): PathLesson[] {
  const pageSize = PATH_PAGE_SIZE[width];
  const lessons: PathLesson[] = [];
  for (let start = 0; start < activities.length; start += pageSize) {
    const slice = activities.slice(start, start + pageSize);
    lessons.push({
      index: lessons.length + 1,
      title: `第 ${lessons.length + 1} 课`,
      activityIds: slice.map((activity) => activity.id),
      phonemes: [...new Set(slice.flatMap((activity) => activity.phonemes))],
      minutes: slice.reduce((sum, activity) => sum + activity.duration, 0)
    });
  }
  return lessons;
}

export function computeDerived(course: Course): DerivedSnapshot {
  return {
    prerequisitePhonemes: computePrerequisitePhonemes(course.activities),
    cycle: findDependencyCycle(course.activities),
    paths: {
      phone: buildPath(course.activities, 'phone'),
      tablet: buildPath(course.activities, 'tablet'),
      desktop: buildPath(course.activities, 'desktop')
    }
  };
}
