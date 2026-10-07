// 本地容量保护
// localStorage 有容量上限（多数浏览器约 5MB）。离线合并会带来更多活动和版本快照，
// 写入前必须确认“当前课程 + 合并后课程”能同时放下（写入是替换式的，验证期间两份数据会短暂共存），
// 放不下就拒绝这次合并、保持在用课程不动，并列出可回收的旧版本快照供老师清理。

import type { Course, CourseVersion } from './course';

export interface ReclaimableVersion {
  versionId: string;
  label: string;
  savedAt: string;
  note: string;
  activityCount: number;
  bytes: number;
}

export interface CapacityReport {
  /** 当前课程占用（UTF-16 代码单元，localStorage 的实际计量单位） */
  currentBytes: number;
  /** 合并后课程预计占用 */
  mergedBytes: number;
  /** 合并写入时需要的峰值：当前课程与合并结果短暂共存 */
  requiredBytes: number;
  /** 探测到的剩余可用空间；探测失败时给保守下限 */
  availableBytes: number;
  fits: boolean;
  /** 全部 localStorage 已占用量 */
  storageUsedBytes: number;
  reclaimable: ReclaimableVersion[];
  /** 清理所列版本后预计可腾出的空间 */
  reclaimableBytes: number;
}

const PROBE_CHUNK = 'sologsb-capacity-probe';
// 探测上限，避免极端环境里长时间写入
const MAX_PROBE_STEPS = 64;
const PROBE_STEP_BYTES = 64 * 1024;

// 剩余空间只在写入后才会变，探测结果在两次写入之间缓存，避免每次勾选都试写几十次
let cachedAvailableBytes: number | null = null;

export function invalidateCapacityCache(): void {
  cachedAvailableBytes = null;
}

export function courseBytes(course: Course): number {
  return JSON.stringify(course).length;
}

export function versionBytes(version: CourseVersion): number {
  return JSON.stringify(version).length;
}

/** 通过临时键递增试写探测剩余容量，探测完立即清理，绝不影响在用数据 */
export function probeAvailableBytes(headroom = 0): number {
  if (cachedAvailableBytes !== null && headroom === 0) return cachedAvailableBytes;
  let available = headroom;
  const probes: string[] = [];
  try {
    for (let step = 0; step < MAX_PROBE_STEPS; step += 1) {
      const key = `${PROBE_CHUNK}-${step}`;
      const chunk = 'x'.repeat(PROBE_STEP_BYTES);
      localStorage.setItem(key, chunk);
      probes.push(key);
      available += PROBE_STEP_BYTES;
    }
  } catch {
    // 到达容量上限即停止
  } finally {
    probes.forEach((key) => localStorage.removeItem(key));
  }
  if (headroom === 0) cachedAvailableBytes = available;
  return available;
}

function storageUsedBytes(): number {
  let total = 0;
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      total += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
  } catch {
    // 隐私模式等场景无法枚举时返回 0，后续靠试写兜底
  }
  return total;
}

/**
 * 容量预检：模拟合并写入时“旧值仍在、新值写入”的共存峰值。
 * 返回不足信息与可回收版本清单，但不改动任何数据。
 */
export function assessMergeCapacity(current: Course, merged: Course): CapacityReport {
  const currentBytes = courseBytes(current);
  const mergedBytes = courseBytes(merged);
  const requiredBytes = currentBytes + mergedBytes;
  const availableBytes = probeAvailableBytes();
  const reclaimable = listReclaimableVersions(merged);
  const reclaimableBytes = reclaimable.reduce((sum, item) => sum + item.bytes, 0);
  return {
    currentBytes,
    mergedBytes,
    requiredBytes,
    availableBytes,
    fits: availableBytes >= requiredBytes,
    storageUsedBytes: storageUsedBytes(),
    reclaimable,
    reclaimableBytes
  };
}

/**
 * 旧版本快照是主要可回收对象（正在使用的活动课程本体不计入）。
 * 按占用从大到小排列，方便老师优先回收最占地方的快照。
 */
export function listReclaimableVersions(course: Course): ReclaimableVersion[] {
  return course.versions
    .map((version) => ({
      versionId: version.id,
      label: version.label,
      savedAt: version.savedAt,
      note: version.note,
      activityCount: version.activities.length,
      bytes: versionBytes(version)
    }))
    .sort((left, right) => right.bytes - left.bytes);
}

/**
 * 原子式安全写入：先用临时键试写新课程，成功后才替换正式键。
 * 任一步失败都保证原来的在用课程还在，不会写坏。
 */
export function safeSetItem(key: string, value: string): { ok: true } | { ok: false; error: string } {
  const tempKey = `${key}-writing-${Date.now()}`;
  try {
    localStorage.setItem(tempKey, value);
  } catch (error) {
    try { localStorage.removeItem(tempKey); } catch { /* ignore */ }
    return { ok: false, error: error instanceof Error ? error.message : '本地存储空间不足' };
  }
  try {
    localStorage.setItem(key, value);
    localStorage.removeItem(tempKey);
    cachedAvailableBytes = null;
    return { ok: true };
  } catch (error) {
    try { localStorage.removeItem(tempKey); } catch { /* ignore */ }
    return { ok: false, error: error instanceof Error ? error.message : '写入正式数据失败' };
  }
}

export function formatKb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
