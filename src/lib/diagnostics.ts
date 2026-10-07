// 课程质量检查
// 循环依赖与前置音素直接使用 DerivedCache 的派生结果（依赖或音素变化时已被作废重算），
// 其余检查（提前使用、相似音、例句过长、练习反馈、无障碍、失效引用）在此按课程顺序实时计算。

import { findDependencyCycle, type DerivedSnapshot } from './derived';
import type { Activity, Course, IssueLevel } from './course';

export interface Diagnostic {
  id: string;
  activityId: string;
  level: IssueLevel;
  category: string;
  title: string;
  detail: string;
}

const confusablePairs: Array<[string, string]> = [
  ['/b/', '/p/'], ['/d/', '/t/'], ['/f/', '/v/'], ['/m/', '/n/'], ['/ɪ/', '/iː/'], ['/æ/', '/e/']
];

export function analyzeCourse(current: Course, derived?: DerivedSnapshot): Diagnostic[] {
  const issues: Diagnostic[] = [];
  const learned = new Set<string>();
  const seenPhonemes: Array<{ activity: Activity; phoneme: string }> = [];

  current.activities.forEach((activity, index) => {
    activity.phonemes.forEach((phoneme) => {
      if (!learned.has(phoneme) && activity.type !== '音素') {
        issues.push({
          id: `early-${activity.id}-${phoneme}`, activityId: activity.id, level: 'error', category: '前置知识',
          title: `${activity.title} 提前使用 ${phoneme}`,
          detail: `第 ${index + 1} 个活动中使用了尚未单独教学的音素。请增加前置音素活动或调整顺序。`
        });
      }
      if (activity.type === '音素') learned.add(phoneme);
      seenPhonemes.push({ activity, phoneme });
    });

    if (activity.type === '句子') {
      const words = activity.content.trim().split(/\s+/).filter(Boolean);
      if (words.length > 12) issues.push({
        id: `long-${activity.id}`, activityId: activity.id, level: 'warning', category: '例句长度',
        title: `${activity.title} 包含 ${words.length} 个单词`,
        detail: '启蒙阶段建议控制在 12 个单词以内，或拆成两个意群。'
      });
    }

    if (activity.type === '练习' && !activity.feedback.trim()) issues.push({
      id: `feedback-${activity.id}`, activityId: activity.id, level: 'error', category: '练习反馈',
      title: `${activity.title} 缺少反馈`,
      detail: '答对或答错后需要给出可理解、可行动的学习反馈。'
    });

    if (!activity.accessibility.trim()) issues.push({
      id: `a11y-${activity.id}`, activityId: activity.id, level: 'error', category: '无障碍说明',
      title: `${activity.title} 缺少无障碍说明`,
      detail: '请说明视觉、听觉、运动或认知支持方式。'
    });

    activity.dependencies.forEach((dependency) => {
      if (!current.activities.some((item) => item.id === dependency)) issues.push({
        id: `missing-dep-${activity.id}-${dependency}`, activityId: activity.id, level: 'error', category: '依赖缺失',
        title: `${activity.title} 的依赖已不存在`, detail: '请移除失效依赖或重新选择前置活动。'
      });
    });
  });

  confusablePairs.forEach(([left, right]) => {
    const leftActivity = seenPhonemes.find((item) => item.phoneme === left)?.activity;
    const rightActivity = seenPhonemes.find((item) => item.phoneme === right)?.activity;
    if (leftActivity && rightActivity) issues.push({
      id: `confusable-${left}-${right}`, activityId: rightActivity.id, level: 'info', category: '相似音',
      title: `${left} 与 ${right} 可能混淆`,
      detail: `建议在“${leftActivity.title}”和“${rightActivity.title}”之间加入口型对比或辨音练习。`
    });
  });

  const cycle = derived?.cycle ?? findDependencyCycle(current.activities);
  if (cycle) issues.push({
    id: 'cycle', activityId: cycle[0], level: 'error', category: '依赖关系',
    title: '活动依赖形成循环', detail: cycle.join(' → ')
  });
  return issues;
}

export function compareCourseVersions(current: Course, baseId: string, targetId: string): VersionDiff[] {
  const base = current.versions.find((version) => version.id === baseId);
  const target = current.versions.find((version) => version.id === targetId);
  if (!base || !target) return [];
  const rows: VersionDiff[] = [];
  const baseMap = new Map(base.activities.map((activity) => [activity.id, activity]));
  const targetMap = new Map(target.activities.map((activity) => [activity.id, activity]));
  for (const activity of base.activities) {
    if (!targetMap.has(activity.id)) rows.push({ id: activity.id, title: activity.title, kind: 'removed', detail: '目标版本已删除该活动' });
  }
  for (const activity of target.activities) {
    const before = baseMap.get(activity.id);
    if (!before) {
      rows.push({ id: activity.id, title: activity.title, kind: 'added', detail: `${activity.type} · ${activity.duration} 分钟` });
      continue;
    }
    const fields: string[] = [];
    if (before.title !== activity.title) fields.push('标题');
    if (before.content !== activity.content) fields.push('内容');
    if (before.difficulty !== activity.difficulty) fields.push('难度');
    if (before.duration !== activity.duration) fields.push('时长');
    if (JSON.stringify(before.dependencies) !== JSON.stringify(activity.dependencies)) fields.push('依赖');
    if (before.phonemes?.join() !== activity.phonemes?.join()) fields.push('音素');
    if (before.prompt !== activity.prompt || before.accessibility !== activity.accessibility) fields.push('提示或无障碍');
    if (before.feedback !== activity.feedback) fields.push('练习反馈');
    if (fields.length) rows.push({ id: activity.id, title: activity.title, kind: 'changed', detail: `变化字段：${fields.join('、')}` });
  }
  return rows;
}

export interface VersionDiff {
  id: string;
  title: string;
  kind: 'added' | 'removed' | 'changed';
  detail: string;
}
