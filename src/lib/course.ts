// 课程数据模型与旧结构升级迁移器
// 导入离线包前，无论数据来自哪台电脑、哪个版本，都先经 upgradeCourse 补齐到当前结构，再参与合并。

export const COURSE_SCHEMA_VERSION = 2;

export type ActivityType = '音素' | '单词' | '句子' | '练习';
export type PreviewWidth = 'phone' | 'tablet' | 'desktop';
export type IssueLevel = 'error' | 'warning' | 'info';

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  content: string;
  phonemes: string[];
  dependencies: string[];
  difficulty: number;
  prompt: string;
  accessibility: string;
  duration: number;
  feedback: string;
  /** 离线合并时并列保留的另一版活动会带有来源标记，供老师选定前辨认 */
  mergeTag?: '本地版' | '导入版';
}

export interface CourseVersion {
  id: string;
  label: string;
  savedAt: string;
  note: string;
  activities: Activity[];
}

export interface Course {
  id: string;
  title: string;
  level: string;
  ageRange: string;
  objective: string;
  activities: Activity[];
  versions: CourseVersion[];
  updatedAt: string;
  schemaVersion: number;
}

export type ActivityField =
  | 'type'
  | 'title'
  | 'content'
  | 'phonemes'
  | 'dependencies'
  | 'difficulty'
  | 'prompt'
  | 'accessibility'
  | 'duration'
  | 'feedback';

const ACTIVITY_TYPES: readonly ActivityType[] = ['音素', '单词', '句子', '练习'] as const;

export interface UpgradeResult {
  course: Course;
  /** 升级过程中补齐或修正的说明，合并预览中展示给老师 */
  notes: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => asString(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return value.split(/[\s,，、]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function asActivityType(value: unknown): ActivityType {
  const text = asString(value);
  return (ACTIVITY_TYPES as readonly string[]).includes(text) ? (text as ActivityType) : '练习';
}

let fallbackIdCounter = 0;
function ensureId(value: unknown, prefix: string): string {
  const id = asString(value).trim();
  if (id) return id;
  return `${prefix}-recovered-${Date.now()}-${(fallbackIdCounter += 1)}`;
}

/**
 * 把任意年代的课程数据升级到当前结构。
 * 缺少的字段按类型给安全默认值；损坏的活动列表不直接丢弃，而是尽量逐条救回。
 */
export function upgradeCourse(raw: unknown, fallback?: () => Course): UpgradeResult {
  const notes: string[] = [];
  const record = asRecord(raw);
  if (!record || !Array.isArray(record.activities)) {
    notes.push('数据包不是有效的课程结构，已使用当前课程作为安全回退。');
    return { course: fallback ? structuredClone(fallback()) : createBlankCourse(), notes };
  }

  const fromVersion = asNumber(record.schemaVersion, 1);
  if (fromVersion < COURSE_SCHEMA_VERSION) {
    notes.push(`结构已从 v${fromVersion} 升级到 v${COURSE_SCHEMA_VERSION}（补齐缺失字段）。`);
  }

  const activities: Activity[] = [];
  record.activities.forEach((item, index) => {
    const row = asRecord(item);
    if (!row) {
      notes.push(`第 ${index + 1} 个活动数据损坏，已跳过。`);
      return;
    }
    const type = asActivityType(row.type);
    if (typeof row.type !== 'string' || row.type !== type) {
      notes.push(`第 ${index + 1} 个活动类型缺失或无法识别，已按“练习”补齐。`);
    }
    const activity: Activity = {
      id: ensureId(row.id, `a-${index + 1}`),
      type,
      title: asString(row.title, `未命名${type}活动`),
      content: asString(row.content),
      phonemes: asStringArray(row.phonemes),
      dependencies: asStringArray(row.dependencies),
      difficulty: Math.min(5, Math.max(1, asNumber(row.difficulty, 1))),
      prompt: asString(row.prompt),
      accessibility: asString(row.accessibility),
      duration: Math.max(1, asNumber(row.duration, type === '练习' ? 10 : 8)),
      feedback: asString(row.feedback)
    };
    if (!asString(row.id).trim()) notes.push(`第 ${index + 1} 个活动缺少编号，已补编号 ${activity.id}。`);
    if (row.title == null) notes.push(`活动 ${activity.id} 缺少标题，已补“${activity.title}”。`);
    if (row.phonemes == null) notes.push(`活动 ${activity.id} 缺少音素字段，已补为空列表。`);
    if (row.dependencies == null) notes.push(`活动 ${activity.id} 缺少依赖字段，已补为空列表。`);
    if (row.prompt == null || row.accessibility == null || row.feedback == null) {
      notes.push(`活动 ${activity.id} 的教学提示、无障碍说明或反馈字段缺失，已补齐。`);
    }
    activities.push(activity);
  });

  // 编号去重：旧数据里手工复制活动可能带重复 id，合并前必须保证每条都能按编号对上
  const seen = new Set<string>();
  activities.forEach((activity) => {
    if (seen.has(activity.id)) {
      const newId = `${activity.id}-dup-${Date.now()}-${(fallbackIdCounter += 1)}`;
      notes.push(`活动编号 ${activity.id} 重复，已把其中一条改为 ${newId}。`);
      activity.id = newId;
    }
    seen.add(activity.id);
  });

  const validIds = new Set(activities.map((activity) => activity.id));
  activities.forEach((activity) => {
    const before = activity.dependencies.length;
    activity.dependencies = [...new Set(activity.dependencies.filter((id) => validIds.has(id) && id !== activity.id))];
    if (activity.dependencies.length !== before) notes.push(`活动 ${activity.id} 存在失效或自指依赖，已清理。`);
  });

  const versions: CourseVersion[] = Array.isArray(record.versions)
    ? record.versions.flatMap((item) => {
        const row = asRecord(item);
        if (!row || !Array.isArray(row.activities)) return [];
        return [{
          id: ensureId(row.id, 'v'),
          label: asString(row.label, '未命名版本'),
          savedAt: asString(row.savedAt, new Date(0).toISOString()),
          note: asString(row.note),
          activities: row.activities.map((activityRow) => upgradeActivityOnly(activityRow, notes))
        }];
      })
    : [];
  if (record.versions != null && !Array.isArray(record.versions)) notes.push('版本快照字段损坏，已清空。');

  const course: Course = {
    id: asString(record.id, `course-${Date.now()}`),
    title: asString(record.title, '未命名课程'),
    level: asString(record.level, '未分级'),
    ageRange: asString(record.ageRange, '未设置'),
    objective: asString(record.objective),
    activities,
    versions,
    updatedAt: asString(record.updatedAt, new Date().toISOString()),
    schemaVersion: COURSE_SCHEMA_VERSION
  };

  return { course, notes };
}

/** 版本快照里的活动同样按新结构补齐，但不参与依赖清理（快照保持原貌即可） */
function upgradeActivityOnly(raw: unknown, notes: string[]): Activity {
  const row = asRecord(raw) ?? {};
  return {
    id: ensureId(row.id, 'a-snapshot'),
    type: asActivityType(row.type),
    title: asString(row.title, '未命名活动'),
    content: asString(row.content),
    phonemes: asStringArray(row.phonemes),
    dependencies: asStringArray(row.dependencies),
    difficulty: Math.min(5, Math.max(1, asNumber(row.difficulty, 1))),
    prompt: asString(row.prompt),
    accessibility: asString(row.accessibility),
    duration: Math.max(1, asNumber(row.duration, 8)),
    feedback: asString(row.feedback)
  };
}

export function createBlankCourse(): Course {
  return {
    id: `course-${Date.now()}`,
    title: '未命名课程',
    level: '未分级',
    ageRange: '未设置',
    objective: '',
    activities: [],
    versions: [],
    updatedAt: new Date().toISOString(),
    schemaVersion: COURSE_SCHEMA_VERSION
  };
}

const COMPARE_FIELDS: readonly ActivityField[] = [
  'type', 'title', 'content', 'phonemes', 'dependencies',
  'difficulty', 'prompt', 'accessibility', 'duration', 'feedback'
];

/** 返回两个活动不一致的字段名（编号不参与比较） */
export function diffActivityFields(left: Activity, right: Activity): ActivityField[] {
  return COMPARE_FIELDS.filter((field) => JSON.stringify(left[field]) !== JSON.stringify(right[field]));
}

export function activitiesEqual(left: Activity, right: Activity): boolean {
  return diffActivityFields(left, right).length === 0;
}
