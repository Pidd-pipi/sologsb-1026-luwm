<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Button,
    Checkbox,
    InlineNotification,
    Select,
    SelectItem,
    Tag,
    TextArea,
    TextInput,
    Tile
  } from 'carbon-components-svelte';

  type ActivityType = '音素' | '单词' | '句子' | '练习';
  type ViewMode = 'compose' | 'path' | 'issues' | 'versions' | 'merge';
  type PreviewWidth = 'phone' | 'tablet' | 'desktop';
  type IssueLevel = 'error' | 'warning' | 'info';

  interface Activity {
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
  }

  interface CourseVersion {
    id: string;
    label: string;
    savedAt: string;
    note: string;
    activities: Activity[];
  }

  interface Course {
    id: string;
    title: string;
    level: string;
    ageRange: string;
    objective: string;
    activities: Activity[];
    versions: CourseVersion[];
    updatedAt: string;
  }

  interface Diagnostic {
    id: string;
    activityId: string;
    level: IssueLevel;
    category: string;
    title: string;
    detail: string;
  }

  interface VersionDiff {
    id: string;
    title: string;
    kind: 'added' | 'removed' | 'changed';
    detail: string;
  }

  interface PathStage {
    items: Activity[];
    startIndex: number;
    minutes: number;
  }

  interface LearningPath {
    width: PreviewWidth;
    stages: PathStage[];
    blocked: Activity[];
    totalMinutes: number;
  }

  interface DerivedSnapshot {
    fingerprint: string;
    computedAt: string;
    diagnostics: Diagnostic[];
    cycle: string[] | null;
    paths: Record<PreviewWidth, LearningPath>;
  }

  type MergeResolution = 'local' | 'incoming' | 'both';

  interface MergeConflict {
    id: string;
    local: Activity;
    incoming: Activity;
    changedFields: string[];
    resolution: MergeResolution | null;
  }

  interface MergePlan {
    sourceTitle: string;
    sourceUpdatedAt: string;
    added: Activity[];
    identical: number;
    localOnly: number;
    conflicts: MergeConflict[];
    upgradedFields: number;
  }

  interface RecyclableVersion {
    id: string;
    label: string;
    savedAt: string;
    bytes: number;
  }

  interface MergeRejection {
    neededBytes: number;
    usageBytes: number | null;
    quotaBytes: number | null;
    recyclable: RecyclableVersion[];
  }

  const STORAGE_KEY = 'sologsb-1026-phonics-course-v1';
  const EXPORT_SCHEMA = 'sologsb-1026-course-package@1';
  const ACTIVITY_TYPES: ActivityType[] = ['音素', '单词', '句子', '练习'];
  const WIDTH_STAGE_SIZE: Record<PreviewWidth, number> = { phone: 2, tablet: 3, desktop: 4 };
  const confusablePairs = [
    ['/b/', '/p/'], ['/d/', '/t/'], ['/f/', '/v/'], ['/m/', '/n/'], ['/ɪ/', '/iː/'], ['/æ/', '/e/']
  ];

  const initialCourse = (): Course => ({
    id: 'course-phonics-1',
    title: 'Starter Phonics · 声音侦探',
    level: '启蒙一级',
    ageRange: '5–6 岁',
    objective: '建立音素意识，能听辨、拼读并书写短元音单词。',
    updatedAt: '2026-09-24T16:20:00+08:00',
    activities: [
      {
        id: 'a-1', type: '音素', title: '听音游戏：认识 /m/', content: '/m/',
        phonemes: ['/m/'], dependencies: [], difficulty: 1,
        prompt: '闭上嘴唇，轻轻发出 /m/，感受鼻子的震动。',
        accessibility: '提供口型示范图和可重复播放的低频音频。', duration: 6, feedback: ''
      },
      {
        id: 'a-2', type: '音素', title: '首音识别：/s/ 与 /m/', content: '/s/ /m/',
        phonemes: ['/s/', '/m/'], dependencies: ['a-1'], difficulty: 1,
        prompt: '听到单词时拍手，听到 /m/ 时把手放在鼻子上。',
        accessibility: '视觉提示使用不同形状，不只依赖颜色。', duration: 8, feedback: ''
      },
      {
        id: 'a-3', type: '单词', title: '拼读短词：sat', content: 's – a – t → sat',
        phonemes: ['/s/', '/æ/', '/t/'], dependencies: ['a-2'], difficulty: 2,
        prompt: '用手指依次点每个字母，再连起来读。',
        accessibility: '字母块支持键盘逐字聚焦和屏幕阅读器朗读。', duration: 10, feedback: '三条电缆拼在一起形成完整电路。'
      },
      {
        id: 'a-4', type: '练习', title: '听音选图：m / s 开头', content: 'moon, sun, mat, sock',
        phonemes: ['/m/', '/s/'], dependencies: ['a-2'], difficulty: 2,
        prompt: '先听单词，再从两张图片中选出正确首音。',
        accessibility: '所有图片均配替代文本，可只用键盘选择。', duration: 8, feedback: ''
      },
      {
        id: 'a-5', type: '音素', title: '短元音 /æ/ 的口型', content: '/æ/',
        phonemes: ['/æ/'], dependencies: ['a-1'], difficulty: 2,
        prompt: '嘴巴张大，舌尖放低，声音短而有力。',
        accessibility: '提供正面口型、侧面舌位和慢速音频。', duration: 6, feedback: ''
      },
      {
        id: 'a-6', type: '句子', title: '拼读句子：Mat sat.', content: 'Mat sat on the mat.',
        phonemes: ['/m/', '/æ/', '/s/', '/t/'], dependencies: ['a-3'], difficulty: 3,
        prompt: '先读每个单词，再按意群连读句子。',
        accessibility: '句子可按词高亮，并提供更大字号选项。', duration: 10, feedback: '读对了，再试试让声音更连贯。'
      },
      {
        id: 'a-7', type: '练习', title: '把单词和图片配对', content: 'mat · map · sun · sock',
        phonemes: ['/m/', '/æ/', '/s/'], dependencies: ['a-3', 'a-4'], difficulty: 3,
        prompt: '读出单词，然后把单词卡拖到对应图片。',
        accessibility: '支持键盘选择起点和终点，不使用拖拽也能完成。', duration: 12, feedback: '答对后播放该单词的分解音。'
      },
      {
        id: 'a-8', type: '句子', title: '迁移朗读：A man sat.', content: 'A man sat and had a nap.',
        phonemes: ['/m/', '/æ/', '/n/'], dependencies: ['a-6'], difficulty: 4,
        prompt: '观察 a 和 man 之间的联系，再完整朗读。',
        accessibility: '提供分句导航、朗读速度控制和高对比模式。', duration: 12, feedback: ''
      }
    ],
    versions: [
      {
        id: 'v-1', label: '初稿', savedAt: '2026-09-21T10:00:00+08:00', note: '完成音素和基础拼读活动。',
        activities: []
      },
      {
        id: 'v-2', label: '增加句子迁移', savedAt: '2026-09-24T15:30:00+08:00', note: '补充 A man sat and had a nap.',
        activities: [
          {
            id: 'a-1', type: '音素', title: '听音游戏：认识 /m/', content: '/m/', phonemes: ['/m/'], dependencies: [], difficulty: 1,
            prompt: '闭上嘴唇，轻轻发出 /m/。', accessibility: '口型示范和重复音频。', duration: 6, feedback: ''
          },
          {
            id: 'a-2', type: '音素', title: '首音识别：/s/ 与 /m/', content: '/s/ /m/', phonemes: ['/s/', '/m/'], dependencies: ['a-1'], difficulty: 1,
            prompt: '听到单词时拍手。', accessibility: '不同形状的视觉提示。', duration: 8, feedback: ''
          },
          {
            id: 'a-3', type: '单词', title: '拼读短词：sat', content: 's – a – t → sat', phonemes: ['/s/', '/æ/', '/t/'], dependencies: ['a-2'], difficulty: 2,
            prompt: '用手指依次点每个字母。', accessibility: '键盘逐字聚焦。', duration: 10, feedback: '形成完整电路。'
          },
          {
            id: 'a-6', type: '句子', title: '拼读句子：Mat sat.', content: 'Mat sat on the mat.', phonemes: ['/m/', '/æ/', '/s/', '/t/'], dependencies: ['a-3'], difficulty: 3,
            prompt: '先读每个单词，再按意群连读。', accessibility: '按词高亮。', duration: 10, feedback: '再试试更连贯。'
          }
        ]
      }
    ]
  });

  let course: Course = initialCourse();
  let selectedActivityId = course.activities[0]?.id ?? '';
  let activeView: ViewMode = 'compose';
  let previewWidth: PreviewWidth = 'desktop';
  let compareBaseId = course.versions[0]?.id ?? '';
  let compareTargetId = course.versions.at(-1)?.id ?? '';
  let hydrated = false;
  let online = true;
  let savedLabel = '等待载入';
  let showOfflineNotice = false;
  let history: Course[] = [];
  let future: Course[] = [];
  let selectedActivity: Activity | null = null;
  let diagnostics: Diagnostic[] = [];
  let versionDiff: VersionDiff[] = [];
  let derivedCache: DerivedSnapshot | null = null;
  let derived: DerivedSnapshot = getDerived(course);
  let learningPath: LearningPath = derived.paths[previewWidth];
  let importText = '';
  let importError = '';
  let mergePlan: MergePlan | null = null;
  let mergeRejection: MergeRejection | null = null;
  let mergeMessage = '';
  let mergeReady = false;
  let capacityLabel = '正在估算本地容量…';
  let storageWarning = '';

  $: selectedActivity = course.activities.find((activity) => activity.id === selectedActivityId) ?? course.activities[0] ?? null;
  $: derived = getDerived(course);
  $: diagnostics = derived.diagnostics;
  $: learningPath = derived.paths[previewWidth];
  $: versionDiff = compareCourseVersions(course, compareBaseId, compareTargetId);
  $: mergeReady = mergePlan !== null && mergePlan.conflicts.every((conflict) => conflict.resolution !== null);
  $: errorCount = diagnostics.filter((issue) => issue.level === 'error').length;
  $: warningCount = diagnostics.filter((issue) => issue.level === 'warning').length;
  $: totalMinutes = course.activities.reduce((sum, activity) => sum + activity.duration, 0);

  onMount(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        course = migrateCourse(JSON.parse(stored));
        selectedActivityId = course.activities[0]?.id ?? '';
        compareBaseId = course.versions[0]?.id ?? '';
        compareTargetId = course.versions.at(-1)?.id ?? '';
        savedLabel = `已恢复 · ${formatTime(course.updatedAt)}`;
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    hydrated = true;
    void refreshCapacity();
    const updateNetwork = () => {
      online = navigator.onLine;
      showOfflineNotice = !online;
    };
    updateNetwork();
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
    };
  });

  function upgradedText(record: Record<string, unknown>, key: string, fallback: string, onUpgrade: () => void): string {
    const value = record[key];
    if (typeof value === 'string') return value;
    onUpgrade();
    return fallback;
  }

  function normalizeActivity(raw: unknown, index: number, onUpgrade: () => void): Activity {
    const isRecord = Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw);
    if (!isRecord) onUpgrade();
    const record = (isRecord ? raw : {}) as Record<string, unknown>;

    const numberField = (key: string, fallback: number, min: number, max: number): number => {
      const value = record[key];
      if (value === undefined || value === null) {
        onUpgrade();
        return fallback;
      }
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.min(max, Math.max(min, Math.round(parsed)));
      onUpgrade();
      return fallback;
    };
    const listField = (key: string): string[] => {
      const value = record[key];
      if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      if (typeof value === 'string') {
        onUpgrade();
        return value.split(/[\s,，、]+/).map((item) => item.trim()).filter(Boolean);
      }
      onUpgrade();
      return [];
    };

    let type: ActivityType = '练习';
    if (ACTIVITY_TYPES.includes(record.type as ActivityType)) type = record.type as ActivityType;
    else onUpgrade();

    return {
      id: upgradedText(record, 'id', `a-legacy-${index + 1}`, onUpgrade),
      type,
      title: upgradedText(record, 'title', `未命名活动 ${index + 1}`, onUpgrade),
      content: upgradedText(record, 'content', '', onUpgrade),
      phonemes: listField('phonemes'),
      dependencies: listField('dependencies'),
      difficulty: numberField('difficulty', 1, 1, 5),
      prompt: upgradedText(record, 'prompt', '', onUpgrade),
      accessibility: upgradedText(record, 'accessibility', '', onUpgrade),
      duration: numberField('duration', 8, 1, 600),
      feedback: upgradedText(record, 'feedback', '', onUpgrade)
    };
  }

  function normalizeCourse(raw: unknown): { course: Course; upgraded: number } | null {
    let source: unknown = raw;
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      const wrapped = (source as Record<string, unknown>).course;
      if (wrapped && typeof wrapped === 'object') source = wrapped;
    }
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const record = source as Record<string, unknown>;
    if (!Array.isArray(record.activities)) return null;

    let upgraded = 0;
    const onUpgrade = () => { upgraded += 1; };
    const activities = record.activities.map((item, index) => normalizeActivity(item, index, onUpgrade));
    const versions: CourseVersion[] = Array.isArray(record.versions)
      ? record.versions
          .filter((version): version is Record<string, unknown> => Boolean(version) && typeof version === 'object' && !Array.isArray(version))
          .map((version, index) => ({
            id: upgradedText(version, 'id', `v-legacy-${index + 1}`, onUpgrade),
            label: upgradedText(version, 'label', `旧版本 ${index + 1}`, onUpgrade),
            savedAt: upgradedText(version, 'savedAt', new Date().toISOString(), onUpgrade),
            note: upgradedText(version, 'note', '', onUpgrade),
            activities: Array.isArray(version.activities)
              ? version.activities.map((item, itemIndex) => normalizeActivity(item, itemIndex, onUpgrade))
              : []
          }))
      : [];

    return {
      course: {
        id: upgradedText(record, 'id', `course-${Date.now()}`, onUpgrade),
        title: upgradedText(record, 'title', '未命名课程', onUpgrade),
        level: upgradedText(record, 'level', '未设置等级', onUpgrade),
        ageRange: upgradedText(record, 'ageRange', '', onUpgrade),
        objective: upgradedText(record, 'objective', '', onUpgrade),
        activities,
        versions,
        updatedAt: upgradedText(record, 'updatedAt', new Date().toISOString(), onUpgrade)
      },
      upgraded
    };
  }

  function migrateCourse(value: unknown): Course {
    return normalizeCourse(value)?.course ?? initialCourse();
  }

  function commit(recipe: (draft: Course) => void): void {
    history = [...history.slice(-49), structuredClone(course)];
    const next = structuredClone(course);
    recipe(next);
    next.updatedAt = new Date().toISOString();
    course = next;
    future = [];
    persist();
  }

  function persist(): void {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(course));
      storageWarning = '';
      savedLabel = `已保存 · ${formatTime(new Date().toISOString())}`;
    } catch {
      storageWarning = '本地容量不足，本次修改未能写入。当前课程内容未受影响，可在“合并导入”页删除可回收的旧版本后重试。';
      savedLabel = '写入失败 · 本地容量不足';
    }
  }

  function undo(): void {
    const previous = history.at(-1);
    if (!previous) return;
    future = [structuredClone(course), ...future].slice(0, 50);
    history = history.slice(0, -1);
    course = previous;
    selectedActivityId = course.activities[0]?.id ?? '';
    persist();
  }

  function redo(): void {
    const next = future[0];
    if (!next) return;
    history = [...history, structuredClone(course)].slice(-50);
    future = future.slice(1);
    course = next;
    selectedActivityId = course.activities[0]?.id ?? '';
    persist();
  }

  function saveNow(): void {
    persist();
  }

  function updateCourse(field: 'title' | 'level' | 'ageRange' | 'objective', value: string): void {
    commit((draft) => { draft[field] = value; });
  }

  function updateActivity(field: keyof Activity, value: unknown): void {
    if (!selectedActivity) return;
    const id = selectedActivity.id;
    commit((draft) => {
      const target = draft.activities.find((activity) => activity.id === id);
      if (target) (target as unknown as Record<string, unknown>)[field] = value;
    });
  }

  function readText(event: Event): string {
    const custom = event as CustomEvent<{ value?: string; text?: string } | string>;
    if (typeof custom.detail === 'string') return custom.detail;
    if (typeof custom.detail === 'number') return String(custom.detail);
    if (custom.detail?.value) return custom.detail.value;
    if (custom.detail?.text) return custom.detail.text;
    const target = (event.currentTarget ?? event.target) as HTMLInputElement | HTMLTextAreaElement | null;
    return target?.value ?? '';
  }

  function readNumber(event: Event): number {
    return Number(readText(event));
  }

  function readChecked(event: Event): boolean {
    const custom = event as CustomEvent<{ checked?: boolean } | boolean>;
    if (typeof custom.detail === 'boolean') return custom.detail;
    if (typeof custom.detail?.checked === 'boolean') return custom.detail.checked;
    const target = (event.currentTarget ?? event.target) as HTMLInputElement | null;
    return Boolean(target?.checked);
  }

  function addActivity(type: ActivityType = '练习'): void {
    const id = `a-${Date.now()}`;
    commit((draft) => {
      draft.activities.push({
        id, type, title: `新的${type}活动`, content: '', phonemes: [], dependencies: [],
        difficulty: 1, prompt: '请输入教师提示语。', accessibility: '请描述视觉、听觉或键盘无障碍支持。',
        duration: type === '练习' ? 10 : 8, feedback: type === '练习' ? '' : ''
      });
    });
    selectedActivityId = id;
    activeView = 'compose';
  }

  function deleteActivity(): void {
    if (!selectedActivity || course.activities.length <= 1) return;
    const id = selectedActivity.id;
    commit((draft) => {
      draft.activities = draft.activities.filter((activity) => activity.id !== id);
      draft.activities.forEach((activity) => {
        activity.dependencies = activity.dependencies.filter((dependency) => dependency !== id);
      });
    });
    selectedActivityId = course.activities[0]?.id ?? '';
  }

  function duplicateActivity(): void {
    if (!selectedActivity) return;
    const source = structuredClone(selectedActivity);
    source.id = `a-${Date.now()}`;
    source.title = `${source.title}（副本）`;
    source.dependencies = [...source.dependencies];
    commit((draft) => {
      const index = draft.activities.findIndex((activity) => activity.id === selectedActivity?.id);
      draft.activities.splice(index + 1, 0, source);
    });
    selectedActivityId = source.id;
  }

  function moveActivity(direction: -1 | 1): void {
    if (!selectedActivity) return;
    const id = selectedActivity.id;
    commit((draft) => {
      const index = draft.activities.findIndex((activity) => activity.id === id);
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= draft.activities.length) return;
      const [item] = draft.activities.splice(index, 1);
      draft.activities.splice(nextIndex, 0, item);
    });
  }

  function toggleDependency(dependencyId: string, checked: boolean): void {
    if (!selectedActivity || dependencyId === selectedActivity.id) return;
    const next = checked
      ? [...new Set([...selectedActivity.dependencies, dependencyId])]
      : selectedActivity.dependencies.filter((id) => id !== dependencyId);
    updateActivity('dependencies', next);
  }

  function updatePhonemes(value: string): void {
    updateActivity('phonemes', value.split(/[\s,，、]+/).map((item) => item.trim()).filter(Boolean));
  }

  function saveVersion(): void {
    const versionNumber = course.versions.length + 1;
    commit((draft) => {
      draft.versions.push({
        id: `v-${Date.now()}`, label: `版本 ${versionNumber}`, savedAt: new Date().toISOString(),
        note: `保存 ${draft.activities.length} 个活动，总计 ${draft.activities.reduce((sum, item) => sum + item.duration, 0)} 分钟。`,
        activities: structuredClone(draft.activities)
      });
    });
    const latest = course.versions.at(-1);
    compareTargetId = latest?.id ?? '';
    if (!compareBaseId) compareBaseId = course.versions.at(-2)?.id ?? '';
    savedLabel = `版本 ${versionNumber} 已存档`;
  }

  function copyCourse(): void {
    commit((draft) => {
      const copy = structuredClone(draft);
      copy.id = `course-${Date.now()}`;
      copy.title = `${copy.title} · 副本`;
      copy.versions = [];
      copy.activities.forEach((activity) => {
        activity.title = activity.title.replace('（副本）', '') + '（复制）';
      });
      draft.id = copy.id;
      draft.title = copy.title;
      draft.versions = copy.versions;
      draft.activities = copy.activities;
    });
    savedLabel = '课程已复制为新草稿';
  }

  function focusIssue(issue: Diagnostic): void {
    selectedActivityId = issue.activityId;
    activeView = 'compose';
  }

  function analyzeCourse(current: Course): Diagnostic[] {
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

    const cycle = findDependencyCycle(current.activities);
    if (cycle) issues.push({
      id: 'cycle', activityId: cycle[0], level: 'error', category: '依赖关系',
      title: '活动依赖形成循环', detail: cycle.join(' → ')
    });
    return issues;
  }

  function findDependencyCycle(activities: Activity[]): string[] | null {
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

  function compareCourseVersions(current: Course, baseId: string, targetId: string): VersionDiff[] {
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
      if (before.prompt !== activity.prompt || before.accessibility !== activity.accessibility) fields.push('提示或无障碍');
      if (before.feedback !== activity.feedback) fields.push('练习反馈');
      if (fields.length) rows.push({ id: activity.id, title: activity.title, kind: 'changed', detail: `变化字段：${fields.join('、')}` });
    }
    return rows;
  }

  function fingerprintActivities(activities: Activity[]): string {
    return JSON.stringify(activities.map((activity) => [
      activity.id, activity.type, activity.title, activity.content, activity.phonemes,
      activity.dependencies, activity.difficulty, activity.prompt, activity.accessibility,
      activity.duration, activity.feedback
    ]));
  }

  function getDerived(current: Course): DerivedSnapshot {
    const fingerprint = fingerprintActivities(current.activities);
    if (derivedCache && derivedCache.fingerprint === fingerprint) return derivedCache;
    const activities = current.activities;
    derivedCache = {
      fingerprint,
      computedAt: new Date().toISOString(),
      diagnostics: analyzeCourse(current),
      cycle: findDependencyCycle(activities),
      paths: {
        phone: computeLearningPath(activities, 'phone'),
        tablet: computeLearningPath(activities, 'tablet'),
        desktop: computeLearningPath(activities, 'desktop')
      }
    };
    return derivedCache;
  }

  function computeLearningPath(activities: Activity[], width: PreviewWidth): LearningPath {
    const byId = new Map(activities.map((activity) => [activity.id, activity]));
    const placed = new Set<string>();
    const ordered: Activity[] = [];
    let remaining = [...activities];
    let progressed = true;
    while (remaining.length > 0 && progressed) {
      progressed = false;
      const stuck: Activity[] = [];
      for (const activity of remaining) {
        const knownDependencies = activity.dependencies.filter((dependency) => byId.has(dependency));
        if (knownDependencies.every((dependency) => placed.has(dependency))) {
          placed.add(activity.id);
          ordered.push(activity);
          progressed = true;
        } else {
          stuck.push(activity);
        }
      }
      remaining = stuck;
    }
    const stageSize = WIDTH_STAGE_SIZE[width];
    const stages: PathStage[] = [];
    for (let start = 0; start < ordered.length; start += stageSize) {
      const items = ordered.slice(start, start + stageSize);
      stages.push({ items, startIndex: start, minutes: items.reduce((sum, activity) => sum + activity.duration, 0) });
    }
    return {
      width,
      stages,
      blocked: remaining,
      totalMinutes: ordered.reduce((sum, activity) => sum + activity.duration, 0)
    };
  }

  function activitySignature(activity: Activity): string {
    return JSON.stringify([
      activity.type, activity.title, activity.content, activity.phonemes, activity.dependencies,
      activity.difficulty, activity.prompt, activity.accessibility, activity.duration, activity.feedback
    ]);
  }

  function diffActivityFields(local: Activity, incoming: Activity): string[] {
    const fields: string[] = [];
    if (local.type !== incoming.type) fields.push('类型');
    if (local.title !== incoming.title) fields.push('标题');
    if (local.content !== incoming.content) fields.push('内容');
    if (JSON.stringify(local.phonemes) !== JSON.stringify(incoming.phonemes)) fields.push('音素');
    if (JSON.stringify(local.dependencies) !== JSON.stringify(incoming.dependencies)) fields.push('依赖');
    if (local.difficulty !== incoming.difficulty) fields.push('难度');
    if (local.duration !== incoming.duration) fields.push('时长');
    if (local.prompt !== incoming.prompt) fields.push('提示语');
    if (local.accessibility !== incoming.accessibility) fields.push('无障碍说明');
    if (local.feedback !== incoming.feedback) fields.push('练习反馈');
    return fields;
  }

  function buildMergePlan(raw: unknown): MergePlan | null {
    const normalized = normalizeCourse(raw);
    if (!normalized) return null;
    const incoming = normalized.course;
    const localById = new Map(course.activities.map((activity) => [activity.id, activity]));
    const incomingIds = new Set<string>();
    const added: Activity[] = [];
    const conflicts: MergeConflict[] = [];
    let identical = 0;
    for (const activity of incoming.activities) {
      if (incomingIds.has(activity.id)) continue;
      incomingIds.add(activity.id);
      const local = localById.get(activity.id);
      if (!local) {
        added.push(activity);
        continue;
      }
      if (activitySignature(local) === activitySignature(activity)) {
        identical += 1;
        continue;
      }
      conflicts.push({ id: activity.id, local, incoming: activity, changedFields: diffActivityFields(local, activity), resolution: null });
    }
    return {
      sourceTitle: incoming.title,
      sourceUpdatedAt: incoming.updatedAt,
      added,
      identical,
      localOnly: course.activities.filter((activity) => !incomingIds.has(activity.id)).length,
      conflicts,
      upgradedFields: normalized.upgraded
    };
  }

  async function storageEstimate(): Promise<{ usage: number | null; quota: number | null }> {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        const { usage, quota } = await navigator.storage.estimate();
        return { usage: usage ?? null, quota: quota ?? null };
      }
    } catch { /* 估算不可用时改用试写校验 */ }
    return { usage: null, quota: null };
  }

  function probePersist(payload: string): boolean {
    const probeKey = `${STORAGE_KEY}:probe`;
    try {
      localStorage.setItem(probeKey, payload);
      localStorage.removeItem(probeKey);
      return true;
    } catch {
      try { localStorage.removeItem(probeKey); } catch { /* 忽略清理失败 */ }
      return false;
    }
  }

  function recyclableVersions(): RecyclableVersion[] {
    return course.versions
      .map((version) => ({ id: version.id, label: version.label, savedAt: version.savedAt, bytes: new Blob([JSON.stringify(version)]).size }))
      .sort((left, right) => left.savedAt.localeCompare(right.savedAt));
  }

  async function refreshCapacity(): Promise<void> {
    const { usage, quota } = await storageEstimate();
    capacityLabel = quota !== null
      ? `本地存储已用 ${formatBytes(usage ?? 0)} · 配额约 ${formatBytes(quota)}`
      : '浏览器未提供容量估算，合并前会自动试写校验，不会写坏当前课程';
  }

  function exportCourse(): void {
    const payload = JSON.stringify({ schema: EXPORT_SCHEMA, exportedAt: new Date().toISOString(), course }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${course.title.replace(/\s+/g, '-')}.course.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    savedLabel = '课程包已导出';
  }

  function handleImportFile(event: Event): void {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      importText = String(reader.result ?? '');
      parseImport();
    };
    reader.readAsText(file);
  }

  function parseImport(): void {
    importError = '';
    mergeMessage = '';
    mergeRejection = null;
    mergePlan = null;
    if (!importText.trim()) return;
    try {
      const plan = buildMergePlan(JSON.parse(importText));
      if (!plan) {
        importError = '无法识别的课程包：缺少活动列表。';
        return;
      }
      mergePlan = plan;
      void refreshCapacity();
    } catch {
      importError = 'JSON 解析失败，请检查课程包内容是否完整。';
    }
  }

  function setResolution(conflict: MergeConflict, resolution: MergeResolution): void {
    conflict.resolution = resolution;
    mergePlan = mergePlan;
  }

  function discardMerge(): void {
    mergePlan = null;
    mergeRejection = null;
    mergeMessage = '';
    importError = '';
  }

  function nextMergeId(merged: Course, base: string): string {
    let suffix = 1;
    let candidate = `${base}-imp-${suffix}`;
    while (merged.activities.some((activity) => activity.id === candidate)) {
      suffix += 1;
      candidate = `${base}-imp-${suffix}`;
    }
    return candidate;
  }

  async function applyMerge(): Promise<void> {
    if (!mergePlan || !mergeReady) return;
    const plan = mergePlan;
    const merged = structuredClone(course);
    for (const conflict of plan.conflicts) {
      const index = merged.activities.findIndex((activity) => activity.id === conflict.id);
      if (index < 0) continue;
      if (conflict.resolution === 'incoming') {
        merged.activities[index] = structuredClone(conflict.incoming);
      } else if (conflict.resolution === 'both') {
        const copy = structuredClone(conflict.incoming);
        copy.id = nextMergeId(merged, conflict.id);
        copy.title = `${copy.title}（导入版）`;
        merged.activities.splice(index + 1, 0, copy);
      }
    }
    merged.activities.push(...plan.added.map((activity) => structuredClone(activity)));

    const payload = JSON.stringify(merged);
    const neededBytes = new Blob([payload]).size;
    const estimate = await storageEstimate();
    const estimateFails = estimate.quota !== null && estimate.usage !== null && estimate.usage + neededBytes > estimate.quota;
    if (estimateFails || !probePersist(payload)) {
      mergeRejection = {
        neededBytes,
        usageBytes: estimate.usage,
        quotaBytes: estimate.quota,
        recyclable: recyclableVersions()
      };
      mergeMessage = '';
      return;
    }

    commit((draft) => { draft.activities = merged.activities; });
    mergePlan = null;
    mergeRejection = null;
    importText = '';
    mergeMessage = `已并入 ${plan.added.length} 个新活动，处理 ${plan.conflicts.length} 个冲突；前置音素、循环依赖与三种宽度的学习路径已失效重算。`;
    savedLabel = '合并完成 · 学习路径已重算';
    void refreshCapacity();
  }

  function recycleVersion(id: string): void {
    commit((draft) => { draft.versions = draft.versions.filter((version) => version.id !== id); });
    if (mergeRejection) mergeRejection = { ...mergeRejection, recyclable: recyclableVersions() };
    void refreshCapacity();
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  function formatTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  function activityIcon(type: ActivityType): string {
    return type === '音素' ? 'ear' : type === '单词' ? 'text-font' : type === '句子' ? 'text-align-left' : 'game-console';
  }

  function handleKeyboard(event: KeyboardEvent): void {
    const modifier = event.ctrlKey || event.metaKey;
    const tag = (event.target as HTMLElement)?.tagName;
    const editing = tag === 'INPUT' || tag === 'TEXTAREA' || (event.target as HTMLElement)?.isContentEditable;
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
      return;
    }
    if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if (modifier && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveNow();
      return;
    }
    if (event.altKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      addActivity('练习');
      return;
    }
    if (!editing && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      moveActivity(event.key === 'ArrowUp' ? -1 : 1);
    }
  }
</script>

<svelte:window on:keydown={handleKeyboard} />

<div class="app-frame">
  <header class="app-header">
    <div class="brand">
      <div class="brand-symbol" aria-hidden="true"><span>a</span><i>+</i><span>m</span></div>
      <div>
        <h1>Phonics Studio</h1>
        <p>儿童自然拼读课程编排台</p>
      </div>
    </div>
    <div class="header-center">
      <span class:connected={online} class="network-dot"></span>
      <span>{online ? '本地离线编辑可用' : '当前离线，修改仍会保存'}</span>
      <strong>{savedLabel}</strong>
    </div>
    <div class="header-actions">
      <Button size="small" kind="ghost" disabled={history.length === 0} on:click={undo}>撤销</Button>
      <Button size="small" kind="ghost" disabled={future.length === 0} on:click={redo}>重做</Button>
      <Button size="small" kind="tertiary" on:click={saveNow}>保存</Button>
      <Button size="small" kind="primary" on:click={saveVersion}>存档版本</Button>
    </div>
  </header>

  {#if showOfflineNotice}
    <div class="offline-notice">
      <InlineNotification lowContrast kind="info" title="已切换到离线模式" subtitle="所有修改会先保存在本机浏览器，恢复网络后仍可继续编辑。" />
    </div>
  {/if}

  {#if storageWarning}
    <div class="offline-notice">
      <InlineNotification lowContrast kind="error" title="本地写入失败" subtitle={storageWarning} on:close={() => storageWarning = ''} />
    </div>
  {/if}

  <section class="course-hero">
    <div class="hero-copy">
      <span class="kicker">COURSE BUILDER / {course.level}</span>
      <h2>{course.title}</h2>
      <p>{course.objective}</p>
    </div>
    <div class="hero-stats">
      <div><strong>{course.activities.length}</strong><span>活动</span></div>
      <div><strong>{totalMinutes}</strong><span>分钟</span></div>
      <div><strong class="critical">{errorCount}</strong><span>必修问题</span></div>
      <div><strong class="caution">{warningCount}</strong><span>建议调整</span></div>
    </div>
  </section>

  <nav class="workspace-tabs" aria-label="工作区">
    <button class:active={activeView === 'compose'} on:click={() => activeView = 'compose'}><span>01</span><b>课程编排</b><small>活动、依赖与教学说明</small></button>
    <button class:active={activeView === 'path'} on:click={() => activeView = 'path'}><span>02</span><b>学习路径</b><small>多屏幕顺序预览</small></button>
    <button class:active={activeView === 'issues'} on:click={() => activeView = 'issues'}><span>03</span><b>质量检查</b><small>音素、句子与反馈</small></button>
    <button class:active={activeView === 'versions'} on:click={() => activeView = 'versions'}><span>04</span><b>版本与复用</b><small>复制、存档与比较</small></button>
    <button class:active={activeView === 'merge'} on:click={() => activeView = 'merge'}><span>05</span><b>合并导入</b><small>离线课程包逐条合并</small></button>
  </nav>

  {#if activeView === 'compose'}
    <main class="compose-layout">
      <aside class="activity-sidebar">
        <div class="sidebar-heading">
          <div><span class="kicker">LESSON MAP</span><h3>学习活动</h3></div>
          <Button size="small" kind="ghost" on:click={() => addActivity('练习')}>添加</Button>
        </div>
        <div class="type-legend">
          {#each ['音素', '单词', '句子', '练习'] as type}
            <span><i class:practice={type === '练习'} class:phoneme={type === '音素'}></i>{type}</span>
          {/each}
        </div>
        <div class="activity-list">
          {#each course.activities as activity, index (activity.id)}
            <button class:selected={activity.id === selectedActivityId} class="activity-row" on:click={() => selectedActivityId = activity.id}>
              <span class="sequence">{String(index + 1).padStart(2, '0')}</span>
              <span class="activity-type {activity.type}">{activity.type}</span>
              <span class="activity-copy"><b>{activity.title}</b><small>{activity.duration} 分钟 · 难度 {activity.difficulty}/5</small></span>
              {#if activity.dependencies.length}<i title="有前置依赖">↳</i>{/if}
            </button>
          {/each}
        </div>
        <div class="sidebar-help">快捷键：Alt + N 新建 · Alt + ↑/↓ 调整顺序</div>
      </aside>

      <section class="editor-column">
        {#if selectedActivity}
          <div class="editor-toolbar">
            <div>
              <span class="kicker">ACTIVITY EDITOR</span>
              <h3>{selectedActivity.type}活动</h3>
            </div>
            <div>
              <Button size="small" kind="ghost" disabled={course.activities[0]?.id === selectedActivity.id} on:click={() => moveActivity(-1)}>上移</Button>
              <Button size="small" kind="ghost" disabled={course.activities.at(-1)?.id === selectedActivity.id} on:click={() => moveActivity(1)}>下移</Button>
              <Button size="small" kind="ghost" on:click={duplicateActivity}>复制</Button>
              <Button size="small" kind="danger-ghost" on:click={deleteActivity}>删除</Button>
            </div>
          </div>

          <Tile class="editor-card">
            <div class="form-grid">
              <TextInput labelText="活动标题" value={selectedActivity.title} on:input={(event) => updateActivity('title', readText(event))} />
              <Select labelText="活动类型" selected={selectedActivity.type} on:change={(event) => updateActivity('type', readText(event))}>
                <SelectItem value="音素" text="音素" />
                <SelectItem value="单词" text="单词" />
                <SelectItem value="句子" text="句子" />
                <SelectItem value="练习" text="练习活动" />
              </Select>
              <TextInput labelText="预计时长（分钟）" type="number" min="1" max="60" value={String(selectedActivity.duration)} on:input={(event) => updateActivity('duration', readNumber(event))} />
              <div class="difficulty-field">
                <label for="difficulty">难度：{selectedActivity.difficulty}/5</label>
                <input id="difficulty" type="range" min="1" max="5" value={selectedActivity.difficulty} on:input={(event) => updateActivity('difficulty', readNumber(event))} />
              </div>
            </div>
            <TextArea labelText={selectedActivity.type === '音素' ? '音素内容' : selectedActivity.type === '句子' ? '目标句子' : '教学内容'} rows={3} value={selectedActivity.content} on:input={(event) => updateActivity('content', readText(event))} />
            <TextInput labelText="涉及音素（用逗号或空格分隔）" value={selectedActivity.phonemes.join(', ')} on:input={(event) => updatePhonemes(readText(event))} />
            <TextArea labelText="教师提示语" rows={2} value={selectedActivity.prompt} on:input={(event) => updateActivity('prompt', readText(event))} />
            <TextArea labelText="无障碍说明" rows={2} value={selectedActivity.accessibility} on:input={(event) => updateActivity('accessibility', readText(event))} />
            <TextArea labelText={selectedActivity.type === '练习' ? '练习反馈（必填）' : '学习反馈'} rows={2} value={selectedActivity.feedback} on:input={(event) => updateActivity('feedback', readText(event))} />
          </Tile>

          <Tile class="dependency-card">
            <div class="section-title">
              <div><span class="kicker">PREREQUISITES</span><h3>前置活动与依赖关系</h3><p>只有完成选中的活动后，系统才会按当前顺序推荐本活动。</p></div>
              <Tag type="cool-gray">{selectedActivity.dependencies.length} 个依赖</Tag>
            </div>
            <div class="dependency-grid">
              {#each course.activities.filter((activity) => activity.id !== selectedActivity?.id) as activity (activity.id)}
                <Checkbox
                  labelText={`${activity.title} · ${activity.type}`}
                  checked={selectedActivity.dependencies.includes(activity.id)}
                  on:change={(event) => toggleDependency(activity.id, readChecked(event))}
                />
              {/each}
            </div>
          </Tile>
        {/if}
      </section>

      <aside class="inspector">
        <Tile class="compact-card">
          <span class="kicker">COURSE META</span><h3>课程信息</h3>
          <TextInput labelText="课程名称" value={course.title} on:input={(event) => updateCourse('title', readText(event))} />
          <TextInput labelText="课程等级" value={course.level} on:input={(event) => updateCourse('level', readText(event))} />
          <TextInput labelText="适用年龄" value={course.ageRange} on:input={(event) => updateCourse('ageRange', readText(event))} />
          <TextArea labelText="学习目标" rows={3} value={course.objective} on:input={(event) => updateCourse('objective', readText(event))} />
        </Tile>
        <Tile class="compact-card issue-peek">
          <div class="section-title"><div><span class="kicker">LIVE CHECK</span><h3>实时提示</h3></div><Tag type={errorCount ? 'red' : 'green'}>{errorCount ? `${errorCount} 项` : '通过'}</Tag></div>
          {#each diagnostics.slice(0, 4) as issue}
            <button on:click={() => focusIssue(issue)} class="peek-row">
              <i class:error={issue.level === 'error'} class:warning={issue.level === 'warning'}></i>
              <span><b>{issue.title}</b><small>{issue.category}</small></span>
            </button>
          {/each}
          {#if diagnostics.length === 0}<p class="empty-state">课程结构完整，没有发现提示。</p>{/if}
          <Button size="small" kind="ghost" on:click={() => activeView = 'issues'}>查看全部检查</Button>
        </Tile>
      </aside>
    </main>
  {/if}

  {#if activeView === 'path'}
    <main class="path-view">
      <div class="path-toolbar">
        <div><span class="kicker">RESPONSIVE SEQUENCE</span><h2>学习顺序预览</h2><p>按活动依赖和课程顺序生成，可切换设备宽度检查信息密度。</p></div>
        <div class="width-switcher">
          <button class:active={previewWidth === 'phone'} on:click={() => previewWidth = 'phone'}>手机</button>
          <button class:active={previewWidth === 'tablet'} on:click={() => previewWidth = 'tablet'}>平板</button>
          <button class:active={previewWidth === 'desktop'} on:click={() => previewWidth = 'desktop'}>桌面</button>
        </div>
      </div>
      <div class="preview-stage">
        <div class="device-preview {previewWidth}">
          <div class="device-bar"><span></span><b>{previewWidth === 'phone' ? '390 px' : previewWidth === 'tablet' ? '768 px' : '1200 px'}</b></div>
          <div class="lesson-preview">
            <header><span>今日学习</span><h3>{course.title}</h3><p>{course.objective}</p></header>
            {#each learningPath.stages as stage, stageIndex}
              <div class="stage-label"><span>第 {stageIndex + 1} 阶段</span><em>{stage.items.length} 个活动 · {stage.minutes} 分钟</em></div>
              {#each stage.items as activity, itemIndex (activity.id)}
                <article>
                  <div class="lesson-number">{stage.startIndex + itemIndex + 1}</div>
                  <div class="lesson-type {activity.type}">{activity.type}</div>
                  <div class="lesson-content">
                    <h4>{activity.title}</h4>
                    <p>{activity.content}</p>
                    {#if activity.prompt}<blockquote>{activity.prompt}</blockquote>{/if}
                    <div class="lesson-tags">
                      {#each activity.phonemes as phoneme}<span>{phoneme}</span>{/each}
                      <em>{activity.duration} 分钟</em>
                    </div>
                    {#if activity.dependencies.length}<small>前置：{activity.dependencies.map((id) => course.activities.find((item) => item.id === id)?.title).filter(Boolean).join('、')}</small>{/if}
                  </div>
                </article>
              {/each}
            {/each}
            {#if learningPath.blocked.length}
              <div class="blocked-note">
                <b>暂无法排入学习路径</b>
                <p>{learningPath.blocked.map((activity) => activity.title).join('、')} 存在循环依赖或失效依赖，修复后会自动失效重算。</p>
              </div>
            {/if}
            <footer>课程结束 · 预计 {learningPath.totalMinutes} 分钟 · 已按最新依赖与音素重算 · {formatTime(derived.computedAt)}</footer>
          </div>
        </div>
      </div>
    </main>
  {/if}

  {#if activeView === 'issues'}
    <main class="issues-view">
      <div class="view-heading">
        <div><span class="kicker">CURRICULUM QA</span><h2>课程质量检查</h2><p>检查前置知识、相似音、例句长度、练习反馈、无障碍说明和依赖完整性。</p></div>
        <div class="issue-summary"><span><b>{errorCount}</b> 必须处理</span><span><b>{warningCount}</b> 建议调整</span><span><b>{diagnostics.length}</b> 全部提示</span><span><b>{formatTime(derived.computedAt)}</b> 最近重算</span></div>
      </div>
      <div class="issue-board">
        {#each diagnostics as issue, index}
          <article class:critical={issue.level === 'error'} class:caution={issue.level === 'warning'} class:info={issue.level === 'info'}>
            <span class="issue-index">{String(index + 1).padStart(2, '0')}</span>
            <div><div class="issue-meta"><Tag type={issue.level === 'error' ? 'red' : issue.level === 'warning' ? 'magenta' : 'blue'}>{issue.category}</Tag><small>{issue.level === 'error' ? '必须处理' : issue.level === 'warning' ? '建议调整' : '教学提示'}</small></div><h3>{issue.title}</h3><p>{issue.detail}</p></div>
            <Button size="small" kind="ghost" on:click={() => focusIssue(issue)}>定位活动</Button>
          </article>
        {:else}
          <Tile class="all-clear"><h3>课程检查通过</h3><p>教学顺序、反馈与无障碍说明均已完成。</p></Tile>
        {/each}
        {#if diagnostics.length}
          <div class="rule-grid">
            <Tile><span>前置知识</span><strong>先教后用</strong><p>非音素活动使用未单独教学的音素时阻断。</p></Tile>
            <Tile><span>相似音</span><strong>对比教学</strong><p>发现 /b/-/p/、/f/-/v/ 等音对时建议增加辨音。</p></Tile>
            <Tile><span>例句</span><strong>≤ 12 词</strong><p>超过建议长度时提示拆分意群。</p></Tile>
            <Tile><span>练习</span><strong>必须有反馈</strong><p>每个练习活动都要提供可行动反馈。</p></Tile>
          </div>
        {/if}
      </div>
    </main>
  {/if}

  {#if activeView === 'versions'}
    <main class="versions-view">
      <div class="view-heading">
        <div><span class="kicker">REUSE & HISTORY</span><h2>版本与课程复用</h2><p>复制课程不会覆盖原课程；存档版本包含完整活动、依赖和教学说明。</p></div>
        <div class="version-actions"><Button kind="tertiary" on:click={copyCourse}>复制课程</Button><Button kind="primary" on:click={saveVersion}>保存新版本</Button></div>
      </div>
      <div class="version-layout-svelte">
        <Tile class="version-timeline">
          <div class="section-title"><div><span class="kicker">TIMELINE</span><h3>课程版本</h3></div><Tag type="cool-gray">{course.versions.length} 个快照</Tag></div>
          {#each course.versions as version, index (version.id)}
            <article class:latest={index === course.versions.length - 1}>
              <span class="timeline-dot"></span>
              <div><b>{version.label}</b><h4>{version.note}</h4><p>{formatTime(version.savedAt)} · {version.activities.length} 个活动</p></div>
            </article>
          {/each}
        </Tile>
        <Tile class="diff-card">
          <div class="section-title"><div><span class="kicker">COMPARE</span><h3>比较两个版本</h3></div></div>
          <div class="compare-pickers">
            <Select labelText="基准版本" selected={compareBaseId} on:change={(event) => compareBaseId = readText(event)}>
              {#each course.versions as version}<SelectItem value={version.id} text={`${version.label} · ${formatTime(version.savedAt)}`} />{/each}
            </Select>
            <Select labelText="目标版本" selected={compareTargetId} on:change={(event) => compareTargetId = readText(event)}>
              {#each course.versions as version}<SelectItem value={version.id} text={`${version.label} · ${formatTime(version.savedAt)}`} />{/each}
            </Select>
          </div>
          <div class="diff-list">
            {#each versionDiff as diff}
              <article class={diff.kind}><span>{diff.kind === 'added' ? '新增' : diff.kind === 'removed' ? '删除' : '修改'}</span><div><b>{diff.title}</b><p>{diff.detail}</p></div></article>
            {:else}
              <p class="empty-state">两个版本之间没有活动差异，或尚未选择版本。</p>
            {/each}
          </div>
        </Tile>
      </div>
    </main>
  {/if}

  {#if activeView === 'merge'}
    <main class="merge-view">
      <div class="view-heading">
        <div><span class="kicker">OFFLINE MERGE</span><h2>课程包合并导入</h2><p>按活动编号逐条合并：只有一边有的直接补上，两边都改过的活动并列两版，选定前不改动当前课程。</p></div>
        <div class="version-actions"><Button kind="tertiary" on:click={exportCourse}>导出当前课程包</Button></div>
      </div>

      {#if mergeMessage}
        <div class="merge-notice"><InlineNotification lowContrast kind="success" title="合并完成" subtitle={mergeMessage} on:close={() => mergeMessage = ''} /></div>
      {/if}

      <div class="merge-layout">
        <Tile class="merge-card">
          <div class="section-title">
            <div><span class="kicker">PACKAGE</span><h3>导入课程包</h3><p>粘贴同事导出的 JSON 或选择文件；旧版结构会先按新结构补齐字段，再参与合并。</p></div>
          </div>
          <TextArea rows={8} labelText="课程包 JSON" placeholder={'{"schema":"sologsb-1026-course-package@1", …}'} value={importText} on:input={(event) => importText = readText(event)} />
          <div class="merge-actions">
            <input type="file" accept="application/json,.json" on:change={handleImportFile} aria-label="选择课程包文件" />
            <Button size="small" kind="primary" disabled={!importText.trim()} on:click={parseImport}>解析并生成合并方案</Button>
            {#if mergePlan}<Button size="small" kind="ghost" on:click={discardMerge}>放弃合并</Button>{/if}
          </div>
          {#if importError}
            <InlineNotification lowContrast kind="error" title="无法导入" subtitle={importError} on:close={() => importError = ''} />
          {/if}
          <p class="capacity-line">{capacityLabel}</p>
        </Tile>

        {#if mergeRejection}
          <Tile class="merge-card rejection">
            <InlineNotification lowContrast kind="error" title="本地容量不足，已拒绝本次合并" subtitle="当前课程未被修改。删除可回收的旧版本后可重试合并。" />
            <div class="rejection-facts">
              <span>合并后需要 <b>{formatBytes(mergeRejection.neededBytes)}</b></span>
              {#if mergeRejection.quotaBytes !== null}
                <span>已用 <b>{formatBytes(mergeRejection.usageBytes ?? 0)}</b> / 配额约 <b>{formatBytes(mergeRejection.quotaBytes)}</b></span>
              {/if}
            </div>
            <h4>可回收的旧版本</h4>
            <ul class="recycle-list">
              {#each mergeRejection.recyclable as item (item.id)}
                <li>
                  <span>{item.label} · {formatTime(item.savedAt)}</span>
                  <em>{formatBytes(item.bytes)}</em>
                  <Button size="small" kind="danger-ghost" on:click={() => recycleVersion(item.id)}>删除</Button>
                </li>
              {:else}
                <li><span>没有可回收的旧版本，请清理浏览器存储后重试。</span></li>
              {/each}
            </ul>
            <div class="merge-actions">
              <Button size="small" kind="primary" on:click={applyMerge}>重试合并</Button>
              <Button size="small" kind="ghost" on:click={discardMerge}>放弃合并</Button>
            </div>
          </Tile>
        {/if}

        {#if mergePlan}
          <Tile class="merge-card">
            <div class="section-title">
              <div><span class="kicker">PLAN</span><h3>合并方案 · {mergePlan.sourceTitle}</h3><p>方案仅基于副本计算，应用之前当前课程保持不变。</p></div>
              <Tag type="cool-gray">{formatTime(mergePlan.sourceUpdatedAt)}</Tag>
            </div>
            <div class="merge-summary">
              <div><strong>{mergePlan.added.length}</strong><span>新增直接补上</span></div>
              <div><strong>{mergePlan.identical}</strong><span>两边一致</span></div>
              <div><strong>{mergePlan.localOnly}</strong><span>仅本地保留</span></div>
              <div><strong>{mergePlan.conflicts.length}</strong><span>待选定冲突</span></div>
              <div><strong>{mergePlan.upgradedFields}</strong><span>旧结构补齐字段</span></div>
            </div>
            {#if mergePlan.added.length}
              <h4 class="merge-subtitle">将补上的新活动</h4>
              <div class="added-chips">{#each mergePlan.added as activity (activity.id)}<span>{activity.type} · {activity.title}</span>{/each}</div>
            {/if}
            {#each mergePlan.conflicts as conflict (conflict.id)}
              <article class="conflict-card">
                <header><b>{conflict.id}</b><span>变化字段：{conflict.changedFields.join('、')}</span></header>
                <div class="conflict-grid">
                  <div class="conflict-panel">
                    <h4>本地版本</h4>
                    <p>{conflict.local.title}</p>
                    <small>{conflict.local.type} · {conflict.local.duration} 分钟 · 难度 {conflict.local.difficulty}/5</small>
                    <small>音素：{conflict.local.phonemes.join('、') || '—'}</small>
                    <small>依赖：{conflict.local.dependencies.join('、') || '—'}</small>
                    <small>反馈：{conflict.local.feedback || '—'}</small>
                  </div>
                  <div class="conflict-panel incoming">
                    <h4>导入版本</h4>
                    <p>{conflict.incoming.title}</p>
                    <small>{conflict.incoming.type} · {conflict.incoming.duration} 分钟 · 难度 {conflict.incoming.difficulty}/5</small>
                    <small>音素：{conflict.incoming.phonemes.join('、') || '—'}</small>
                    <small>依赖：{conflict.incoming.dependencies.join('、') || '—'}</small>
                    <small>反馈：{conflict.incoming.feedback || '—'}</small>
                  </div>
                </div>
                <div class="resolution-row">
                  <label><input type="radio" name={`resolution-${conflict.id}`} checked={conflict.resolution === 'local'} on:change={() => setResolution(conflict, 'local')} /> 保留本地版</label>
                  <label><input type="radio" name={`resolution-${conflict.id}`} checked={conflict.resolution === 'incoming'} on:change={() => setResolution(conflict, 'incoming')} /> 采用导入版</label>
                  <label><input type="radio" name={`resolution-${conflict.id}`} checked={conflict.resolution === 'both'} on:change={() => setResolution(conflict, 'both')} /> 两版并列保留</label>
                </div>
              </article>
            {/each}
            <div class="merge-actions">
              <Button kind="primary" disabled={!mergeReady} on:click={applyMerge}>应用合并</Button>
              <Button kind="ghost" on:click={discardMerge}>放弃合并</Button>
              {#if !mergeReady}<span class="merge-hint">请先为每个冲突选定保留方式</span>{/if}
            </div>
          </Tile>
        {/if}
      </div>
    </main>
  {/if}

  <footer class="app-footer">
    <span>所有数据保存在当前浏览器 localStorage</span>
    <span>Ctrl/Cmd + Z 撤销 · Ctrl/Cmd + Y 重做 · Alt + N 新建活动 · Ctrl/Cmd + S 保存</span>
  </footer>
</div>
