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
  import {
    COURSE_SCHEMA_VERSION,
    upgradeCourse,
    type Activity,
    type ActivityType,
    type Course,
    type PreviewWidth
  } from '$lib/course';
  import {
    applyMergePlan,
    buildMergePlan,
    describeChangedFields,
    type MergeEntry,
    type MergePlan,
    type MergeResolution
  } from '$lib/merge';
  import { analyzeCourse, compareCourseVersions } from '$lib/diagnostics';
  import { DerivedCache, WIDTH_LABEL, type PathLesson } from '$lib/derived';
  import { assessMergeCapacity, formatKb, listReclaimableVersions, safeSetItem, type CapacityReport } from '$lib/quota';

  type ViewMode = 'compose' | 'path' | 'issues' | 'versions';

  interface CourseVersion {
    id: string;
    label: string;
    savedAt: string;
    note: string;
    activities: Activity[];
  }

  interface VersionDiff {
    id: string;
    title: string;
    kind: 'added' | 'removed' | 'changed';
    detail: string;
  }

  const STORAGE_KEY = 'sologsb-1026-phonics-course-v1';

  // v1 示例课程缺少 schemaVersion 等新字段，载入后统一走 upgradeCourse 升级补齐
  const sampleCourseV1 = {
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
  };

  let course: Course = upgradeCourse(sampleCourseV1).course;
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
  let diagnostics: ReturnType<typeof analyzeCourse> = [];
  let versionDiff: VersionDiff[] = [];
  const derivedCache = new DerivedCache();
  let derivedSnapshot = derivedCache.resolve(course).snapshot;
  let lastRecomputed = false;

  // 全局提示与离线合并暂存区
  let noticeKind: 'success' | 'error' | 'info' = 'info';
  let noticeTitle = '';
  let noticeDetail = '';
  let showNotice = false;
  let importText = '';
  let importError = '';
  let mergePlan: MergePlan | null = null;
  let capacity: CapacityReport | null = null;
  let excludeIncomingVersions = false;
  let selectedReclaimIds = new Set<string>();

  $: selectedActivity = course.activities.find((activity) => activity.id === selectedActivityId) ?? course.activities[0] ?? null;
  $: if (hydrated) refreshDerived();
  function refreshDerived(): void {
    const resolved = derivedCache.resolve(course);
    derivedSnapshot = resolved.snapshot;
    lastRecomputed = resolved.recomputed;
  }
  $: diagnostics = analyzeCourse(course, derivedSnapshot);
  $: versionDiff = compareCourseVersions(course, compareBaseId, compareTargetId);
  $: errorCount = diagnostics.filter((issue) => issue.level === 'error').length;
  $: warningCount = diagnostics.filter((issue) => issue.level === 'warning').length;
  $: totalMinutes = course.activities.reduce((sum, activity) => sum + activity.duration, 0);
  $: pathLessons = derivedSnapshot.paths[previewWidth];

  // 老师在暂存区调整处理方式或回收旧版本时，实时重新估算容量（仍不写入任何数据）
  $: if (mergePlan) {
    const candidate = planWithOptions(mergePlan, excludeIncomingVersions, selectedReclaimIds);
    capacity = assessMergeCapacity(course, candidate);
  }

  function planWithOptions(plan: MergePlan, skipIncomingVersions: boolean, reclaimIds: Set<string>): Course {
    const applied = applyMergePlan(course, plan).course;
    if (skipIncomingVersions) applied.versions = applied.versions.filter((version) => !plan.versionsToBring.some((item) => item.id === version.id));
    if (reclaimIds.size) applied.versions = applied.versions.filter((version) => !reclaimIds.has(version.id));
    return applied;
  }

  function notify(kind: 'success' | 'error' | 'info', title: string, detail = ''): void {
    noticeKind = kind;
    noticeTitle = title;
    noticeDetail = detail;
    showNotice = true;
  }

  onMount(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const { course: upgraded, notes } = upgradeCourse(JSON.parse(stored));
        course = upgraded;
        selectedActivityId = course.activities[0]?.id ?? '';
        compareBaseId = course.versions[0]?.id ?? '';
        compareTargetId = course.versions.at(-1)?.id ?? '';
        savedLabel = `已恢复 · ${formatTime(course.updatedAt)}`;
        if (notes.length) notify('info', '本地课程已按新结构升级补齐', notes.join('；'));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    hydrated = true;
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

  function commit(recipe: (draft: Course) => void, successLabel: string | undefined = undefined): void {
    history = [...history.slice(-49), structuredClone(course)];
    const next = structuredClone(course);
    recipe(next);
    next.updatedAt = new Date().toISOString();
    const written = safeSetItem(STORAGE_KEY, JSON.stringify(next));
    if (!written.ok) {
      history = history.slice(0, -1);
      notify('error', '本地空间不足，这次修改没有保存', `在用课程保持原样。可到“版本与复用”里清理旧版本快照：${written.error}`);
      activeView = 'versions';
      return;
    }
    course = next;
    future = [];
    savedLabel = successLabel ?? `已保存 · ${formatTime(new Date().toISOString())}`;
  }

  function undo(): void {
    const previous = history.at(-1);
    if (!previous) return;
    future = [structuredClone(course), ...future].slice(0, 50);
    history = history.slice(0, -1);
    course = previous;
    selectedActivityId = course.activities[0]?.id ?? '';
    savedLabel = `已撤销 · ${formatTime(new Date().toISOString())}`;
    persistQuiet();
  }

  function redo(): void {
    const next = future[0];
    if (!next) return;
    history = [...history, structuredClone(course)].slice(-50);
    future = future.slice(1);
    course = next;
    selectedActivityId = course.activities[0]?.id ?? '';
    savedLabel = `已重做 · ${formatTime(new Date().toISOString())}`;
    persistQuiet();
  }

  function persistQuiet(): void {
    if (!hydrated) return;
    safeSetItem(STORAGE_KEY, JSON.stringify(course));
  }

  function saveNow(): void {
    const written = safeSetItem(STORAGE_KEY, JSON.stringify(course));
    savedLabel = written.ok ? `已保存 · ${formatTime(new Date().toISOString())}` : '保存失败：空间不足';
    if (!written.ok) notify('error', '本地空间不足，保存被拒绝', '请先在“版本与复用”里回收旧版本快照。');
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
        duration: type === '练习' ? 10 : 8, feedback: ''
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
    delete source.mergeTag;
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
        activities: structuredClone(draft.activities.map(({ mergeTag: _mergeTag, ...rest }) => rest))
      });
    }, `版本 ${versionNumber} 已存档`);
    const latest = course.versions.at(-1);
    compareTargetId = latest?.id ?? '';
    if (!compareBaseId) compareBaseId = course.versions.at(-2)?.id ?? '';
  }

  function deleteVersion(versionId: string): void {
    const target = course.versions.find((version) => version.id === versionId);
    if (!target) return;
    commit((draft) => {
      draft.versions = draft.versions.filter((version) => version.id !== versionId);
    }, `已回收快照「${target.label}」`);
    if (compareBaseId === versionId) compareBaseId = course.versions[0]?.id ?? '';
    if (compareTargetId === versionId) compareTargetId = course.versions.at(-1)?.id ?? '';
  }

  function copyCourse(): void {
    commit((draft) => {
      const copy = structuredClone(draft);
      copy.id = `course-${Date.now()}`;
      copy.title = `${copy.title} · 副本`;
      copy.versions = [];
      copy.activities.forEach((activity) => {
        activity.title = activity.title.replace('（副本）', '') + '（复制）';
        delete activity.mergeTag;
      });
      draft.id = copy.id;
      draft.title = copy.title;
      draft.versions = copy.versions;
      draft.activities = copy.activities;
    }, '课程已复制为新草稿');
  }

  function focusIssue(issue: { activityId: string }): void {
    selectedActivityId = issue.activityId;
    activeView = 'compose';
  }

  // ---- 离线合并导入 ----

  function parseImport(): void {
    importError = '';
    mergePlan = null;
    capacity = null;
    selectedReclaimIds = new Set();
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch (error) {
      importError = `内容不是有效的 JSON：${error instanceof Error ? error.message : '解析失败'}`;
      return;
    }
    const { plan, error } = buildMergePlan(course, parsed);
    if (error || !plan) {
      importError = error ?? '无法生成合并方案';
      return;
    }
    mergePlan = plan;
    notify('info', '合并方案已生成，当前课程尚未改动', '请逐条确认两边都改过的活动，再执行合并。');
  }

  function handleImportFile(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      importText = String(reader.result ?? '');
      parseImport();
    };
    reader.onerror = () => { importError = '读取文件失败，请换用粘贴文本的方式导入。'; };
    reader.readAsText(file);
  }

  function setResolution(entry: MergeEntry, resolution: MergeResolution): void {
    if (!mergePlan || entry.resolution === resolution) return;
    mergePlan = {
      ...mergePlan,
      entries: mergePlan.entries.map((item) => (item.id === entry.id ? { ...item, resolution } : item))
    };
  }

  function toggleReclaim(versionId: string, checked: boolean): void {
    if (checked) selectedReclaimIds.add(versionId);
    else selectedReclaimIds.delete(versionId);
    selectedReclaimIds = new Set(selectedReclaimIds);
  }

  function toggleExcludeIncomingVersions(event: Event): void {
    excludeIncomingVersions = readChecked(event);
  }

  function mergedCoursePreview(): Course | null {
    if (!mergePlan) return null;
    return planWithOptions(mergePlan, excludeIncomingVersions, selectedReclaimIds);
  }

  function executeMerge(): void {
    if (!mergePlan || !capacity) return;
    const candidate = mergedCoursePreview();
    if (!candidate) return;
    const report = assessMergeCapacity(course, candidate);
    if (!report.fits) {
      capacity = report;
      notify('error', '本地容量不足，合并已被拒绝', '在用课程没有被改动；请回收下方旧版本快照后重试。');
      return;
    }
    const applied = applyMergePlan(course, mergePlan);
    const finalCourse = candidate;
    const stats = applied.stats;

    // 依赖或音素变化：预告派生结果失效；resolve 会把前置音素、循环依赖、各宽度路径重算
    const dependencyChanged = mergePlan.entries.some(
      (entry) => entry.changedFields.includes('dependencies') || entry.changedFields.includes('phonemes')
    ) || mergePlan.counts['added-incoming'] > 0;
    if (dependencyChanged) {
      derivedCache.pendingReason = '离线合并';
      derivedCache.pendingDetail = '离线合并带入了新活动或修改了依赖、音素，前置音素、循环依赖与各宽度学习路径已按合并后课程作废重算。';
    }

    history = [...history.slice(-49), structuredClone(course)];
    future = [];
    const written = safeSetItem(STORAGE_KEY, JSON.stringify(finalCourse));
    if (!written.ok) {
      history = history.slice(0, -1);
      capacity = assessMergeCapacity(course, candidate);
      notify('error', '写入失败，合并未应用', `在用课程完好：${written.error}`);
      return;
    }
    course = finalCourse;
    selectedActivityId = course.activities[0]?.id ?? '';
    compareBaseId = course.versions[0]?.id ?? '';
    compareTargetId = course.versions.at(-1)?.id ?? '';
    savedLabel = `合并已应用 · ${formatTime(new Date().toISOString())}`;
    notify(
      'success',
      '离线合并已完成',
      `补入 ${stats.added} 条、更新 ${stats.updated} 条、并列保留 ${stats.duplicated} 组两版活动，带入 ${stats.versionsBrought} 个版本快照。`
    );
    mergePlan = null;
    capacity = null;
    importText = '';
    selectedReclaimIds = new Set();
  }

  function dismissMerge(): void {
    mergePlan = null;
    capacity = null;
    importError = '';
    selectedReclaimIds = new Set();
  }

  function reclaimSelectedVersions(): void {
    if (!selectedReclaimIds.size) return;
    const ids = new Set(selectedReclaimIds);
    // 在当前课程上回收快照以腾出空间；活动本体不动，已生成的合并方案仍有效
    const next = structuredClone(course);
    next.versions = next.versions.filter((version) => !ids.has(version.id));
    next.updatedAt = new Date().toISOString();
    const written = safeSetItem(STORAGE_KEY, JSON.stringify(next));
    if (!written.ok) {
      notify('error', '回收过程中写入失败', '在用课程未改动。');
      return;
    }
    history = [...history.slice(-49), structuredClone(course)];
    course = next;
    future = [];
    selectedReclaimIds = new Set();
    savedLabel = `已回收 ${ids.size} 个旧版本快照 · ${formatTime(new Date().toISOString())}`;
  }

  function exportPackage(): void {
    const payload = JSON.stringify(course, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${course.title || 'phonics-course'}-离线课程包.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify('success', '离线课程包已导出', '其他老师可在“版本与复用”里导入并按活动编号合并。');
  }

  function statusLabel(status: MergeEntry['status']): string {
    return status === 'added-local' ? '仅本地'
      : status === 'added-incoming' ? '仅导入包'
      : status === 'unchanged' ? '两边一致'
      : status === 'one-sided' ? '一边修改'
      : '两边都改';
  }

  const entryGroups: Array<{ key: 'added-incoming' | 'divergent' | 'one-sided' | 'unchanged' | 'added-local'; heading: string }> = [
    { key: 'added-incoming', heading: '只有导入包有 · 将直接补上' },
    { key: 'divergent', heading: '两边都改过 · 并列两版待选定' },
    { key: 'one-sided', heading: '只有一边相对共同版本改过' },
    { key: 'unchanged', heading: '两边一致' },
    { key: 'added-local', heading: '只有本地有' }
  ];

  const importPlaceholder = '{"id":"course-...","activities":[...]}';

  function selectedReclaimBytes(report: CapacityReport): number {
    return [...selectedReclaimIds].reduce(
      (sum, id) => sum + (report.reclaimable.find((item) => item.versionId === id)?.bytes ?? 0),
      0
    );
  }

  function formatTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
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
  {#if showNotice}
    <div class="offline-notice app-notice">
      <InlineNotification lowContrast kind={noticeKind} title={noticeTitle} subtitle={noticeDetail} on:close={() => (showNotice = false)} />
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
    <button class:active={activeView === 'compose'} on:click={() => (activeView = 'compose')}><span>01</span><b>课程编排</b><small>活动、依赖与教学说明</small></button>
    <button class:active={activeView === 'path'} on:click={() => (activeView = 'path')}><span>02</span><b>学习路径</b><small>多屏幕顺序预览</small></button>
    <button class:active={activeView === 'issues'} on:click={() => (activeView = 'issues')}><span>03</span><b>质量检查</b><small>音素、句子与反馈</small></button>
    <button class:active={activeView === 'versions'} on:click={() => (activeView = 'versions')}><span>04</span><b>版本与合并</b><small>复制、导入合并与比较</small></button>
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
            <button class:selected={activity.id === selectedActivityId} class="activity-row" on:click={() => (selectedActivityId = activity.id)}>
              <span class="sequence">{String(index + 1).padStart(2, '0')}</span>
              <span class="activity-type {activity.type}">{activity.type}</span>
              <span class="activity-copy"><b>{activity.title}</b><small>{activity.duration} 分钟 · 难度 {activity.difficulty}/5{#if activity.mergeTag} · {activity.mergeTag}{/if}</small></span>
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
              <div><span class="kicker">PREREQUISITES</span><h3>前置活动与依赖关系</h3><p>勾选前置活动；下方音素为沿依赖链重算的前置音素，依赖或音素变化后自动作废重算。</p></div>
              <Tag type="cool-gray">{selectedActivity.dependencies.length} 个依赖</Tag>
            </div>
            {#if derivedSnapshot.prerequisitePhonemes[selectedActivity.id]?.length}
              <div class="prereq-phonemes">
                <span class="kicker">前置音素（已重算）</span>
                <div>
                  {#each derivedSnapshot.prerequisitePhonemes[selectedActivity.id] as phoneme}<span class="phoneme-chip">{phoneme}</span>{/each}
                </div>
              </div>
            {/if}
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
          {#each derivedCache.invalidations.slice(0, 1) as invalidation}
            <p class="invalidation-note">↻ {invalidation.reason}：{invalidation.detail}</p>
          {/each}
          {#each diagnostics.slice(0, 4) as issue}
            <button on:click={() => focusIssue(issue)} class="peek-row">
              <i class:error={issue.level === 'error'} class:warning={issue.level === 'warning'}></i>
              <span><b>{issue.title}</b><small>{issue.category}</small></span>
            </button>
          {/each}
          {#if diagnostics.length === 0}<p class="empty-state">课程结构完整，没有发现提示。</p>{/if}
          <Button size="small" kind="ghost" on:click={() => (activeView = 'issues')}>查看全部检查</Button>
        </Tile>
      </aside>
    </main>
  {/if}

  {#if activeView === 'path'}
    <main class="path-view">
      <div class="path-toolbar">
        <div><span class="kicker">RESPONSIVE SEQUENCE</span><h2>学习顺序预览</h2><p>按课程顺序把活动分课，依赖或音素变化后旧分组作废重算；切换宽度查看不同信息密度。</p></div>
        <div class="width-switcher">
          <button class:active={previewWidth === 'phone'} on:click={() => (previewWidth = 'phone')}>手机</button>
          <button class:active={previewWidth === 'tablet'} on:click={() => (previewWidth = 'tablet')}>平板</button>
          <button class:active={previewWidth === 'desktop'} on:click={() => (previewWidth = 'desktop')}>桌面</button>
        </div>
      </div>
      {#if lastRecomputed || derivedCache.invalidations[0]}
        <InlineNotification class="recompute-banner" lowContrast kind="warning" title="学习路径刚按最新依赖与音素重算" subtitle={derivedCache.invalidations[0]?.detail ?? '宽度切换使用各自缓存的分组结果。'} hideCloseButton />
      {/if}
      <div class="preview-stage">
        <div class="device-preview {previewWidth}">
          <div class="device-bar"><span></span><b>{previewWidth === 'phone' ? '390 px · 每课 2 个活动' : previewWidth === 'tablet' ? '768 px · 每课 3 个活动' : '1200 px · 每课 4 个活动'}</b></div>
          <div class="lesson-preview">
            <header><span>TODAY · {WIDTH_LABEL[previewWidth].toUpperCase()}</span><h3>{course.title}</h3><p>{course.objective}</p></header>
            {#each pathLessons as lesson (lesson.index)}
              <section class="lesson-group">
                <div class="lesson-heading">
                  <b>{lesson.title}</b>
                  <span>{lesson.phonemes.length ? lesson.phonemes.join(' · ') : '无新音素'} · {lesson.minutes} 分钟</span>
                </div>
                {#each lesson.activityIds as id (id)}
                  {@const activity = course.activities.find((item) => item.id === id)}
                  {#if activity}
                    <article>
                      <div class="lesson-number">{course.activities.indexOf(activity) + 1}</div>
                      <div class="lesson-type {activity.type}">{activity.type}</div>
                      <div class="lesson-content">
                        <h4>{activity.title}{#if activity.mergeTag}<em class="merge-flag">{activity.mergeTag}</em>{/if}</h4>
                        <p>{activity.content}</p>
                        {#if activity.prompt}<blockquote>{activity.prompt}</blockquote>{/if}
                        <div class="lesson-tags">
                          {#each activity.phonemes as phoneme}<span>{phoneme}</span>{/each}
                          <em>{activity.duration} 分钟</em>
                        </div>
                        {#if activity.dependencies.length}<small>前置：{activity.dependencies.map((depId) => course.activities.find((item) => item.id === depId)?.title).filter(Boolean).join('、')}</small>{/if}
                      </div>
                    </article>
                  {/if}
                {/each}
              </section>
            {/each}
            <footer>课程结束 · 共 {pathLessons.length} 课 · 预计 {totalMinutes} 分钟</footer>
          </div>
        </div>
      </div>
    </main>
  {/if}

  {#if activeView === 'issues'}
    <main class="issues-view">
      <div class="view-heading">
        <div><span class="kicker">CURRICULUM QA</span><h2>课程质量检查</h2><p>检查前置知识、相似音、例句长度、练习反馈、无障碍说明、依赖完整性与循环依赖。</p></div>
        <div class="issue-summary"><span><b>{errorCount}</b> 必须处理</span><span><b>{warningCount}</b> 建议调整</span><span><b>{diagnostics.length}</b> 全部提示</span></div>
      </div>
      <div class="issue-board">
        {#each diagnostics as issue, index (issue.id)}
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
        <div><span class="kicker">OFFLINE MERGE & HISTORY</span><h2>版本与离线合并</h2><p>导入同事的整包课程时按活动编号逐条合并；选定前当前课程不会被改动。结构 v{COURSE_SCHEMA_VERSION}。</p></div>
        <div class="version-actions">
          <Button kind="ghost" on:click={copyCourse}>复制课程</Button>
          <Button kind="tertiary" on:click={exportPackage}>导出离线包</Button>
          <Button kind="primary" on:click={saveVersion}>保存新版本</Button>
        </div>
      </div>

      <Tile class="import-card">
        <div class="section-title">
          <div><span class="kicker">IMPORT PACKAGE</span><h3>导入离线课程包</h3><p>选择其他老师导出的 JSON 文件，或直接粘贴课程包内容。旧数据会先按新结构升级补齐再合并。</p></div>
          <label class="file-button"><input type="file" accept="application/json,.json" on:change={handleImportFile} /><span>选择文件</span></label>
        </div>
        <TextArea rows={4} placeholder={importPlaceholder} value={importText} on:input={(event) => (importText = readText(event))} />
        <div class="import-actions">
          <Button kind="primary" disabled={!importText.trim()} on:click={parseImport}>生成合并方案</Button>
          {#if mergePlan}<Button kind="ghost" on:click={dismissMerge}>放弃方案</Button>{/if}
          {#if importError}<Tag type="red">{importError}</Tag>{/if}
        </div>

        {#if mergePlan}
          <div class="merge-stage">
            <div class="merge-summary">
              <Tag type="cyan">来自：{mergePlan.incomingTitle}</Tag>
              <Tag type="gray">{mergePlan.baseVersionLabel ? `共同版本：${mergePlan.baseVersionLabel}` : '无共同版本，按两边都改保守处理'}</Tag>
              <Tag type="green">直接补入 {mergePlan.counts['added-incoming']}</Tag>
              <Tag type="purple">并列两版 {mergePlan.counts.divergent}</Tag>
              <Tag type="teal">一边修改 {mergePlan.counts['one-sided']}</Tag>
              <Tag type="gray">一致 {mergePlan.counts.unchanged}</Tag>
            </div>
            {#if mergePlan.incomingUpgradeNotes.length}
              <InlineNotification class="merge-note" lowContrast kind="info" title="导入包已按新结构升级" subtitle={mergePlan.incomingUpgradeNotes.join('；')} hideCloseButton />
            {/if}

            {#each entryGroups as group}
              {@const rows = mergePlan.entries.filter((entry) => entry.status === group.key)}
              {#if rows.length}
                <h4 class="merge-group-heading">{group.heading}（{rows.length}）</h4>
                <div class="merge-entries">
                  {#each rows as entry (entry.id)}
                    <article class="merge-entry {entry.status}">
                      <header>
                        <span class="entry-id">{entry.id}</span>
                        <Tag type={entry.status === 'divergent' ? 'purple' : entry.status === 'added-incoming' ? 'green' : 'cool-gray'}>{statusLabel(entry.status)}</Tag>
                        {#if entry.changedFields.length}<small>差异：{describeChangedFields(entry.changedFields)}</small>{/if}
                      </header>
                      <div class="entry-sides">
                        <div class:missing={!entry.local}>
                          <b>本地版</b>
                          {#if entry.local}
                            <p>{entry.local.title}</p>
                            <small>{entry.local.type} · {entry.local.duration} 分钟 · 音素 {entry.local.phonemes.join(' ') || '—'} · 依赖 {entry.local.dependencies.length}</small>
                            <small class="entry-feedback">反馈：{entry.local.feedback || '（空）'}</small>
                          {:else}<small class="entry-missing">本地没有这条活动</small>{/if}
                        </div>
                        <div class:missing={!entry.incoming}>
                          <b>导入版</b>
                          {#if entry.incoming}
                            <p>{entry.incoming.title}</p>
                            <small>{entry.incoming.type} · {entry.incoming.duration} 分钟 · 音素 {entry.incoming.phonemes.join(' ') || '—'} · 依赖 {entry.incoming.dependencies.length}</small>
                            <small class="entry-feedback">反馈：{entry.incoming.feedback || '（空）'}</small>
                          {:else}<small class="entry-missing">导入包没有这条活动</small>{/if}
                        </div>
                      </div>
                      {#if entry.status === 'divergent' || entry.status === 'one-sided'}
                        <div class="resolution-row" role="radiogroup" aria-label="合并处理方式">
                          {#if entry.status === 'divergent'}
                            <label><input type="radio" name={`resolution-${entry.id}`} checked={entry.resolution === 'keep-both'} on:change={() => setResolution(entry, 'keep-both')} />并列留两版（导入版编号 {entry.incomingCloneId}）</label>
                          {/if}
                          <label><input type="radio" name={`resolution-${entry.id}`} checked={entry.resolution === 'use-local'} on:change={() => setResolution(entry, 'use-local')} />只用本地版</label>
                          <label><input type="radio" name={`resolution-${entry.id}`} checked={entry.resolution === 'use-incoming'} on:change={() => setResolution(entry, 'use-incoming')} />只用导入版</label>
                        </div>
                      {/if}
                    </article>
                  {/each}
                </div>
              {/if}
            {/each}

            {#if capacity}
              <div class="capacity-bar" class:short={!capacity.fits}>
                <div>
                  <span class="kicker">LOCAL CAPACITY</span>
                  <b>{capacity.fits ? '容量足够，可以安全合并' : '本地容量不足，合并将被拒绝'}</b>
                  <p>
                    当前课程 {formatKb(capacity.currentBytes)} → 合并后 {formatKb(capacity.mergedBytes)}，
                    写入峰值需 {formatKb(capacity.requiredBytes)}，试写探测可用 {formatKb(capacity.availableBytes)}。
                    {#if !capacity.fits}缺口约 {formatKb(Math.max(0, capacity.requiredBytes - capacity.availableBytes))}。{/if}
                  </p>
                </div>
                <Tag type={capacity.fits ? 'green' : 'red'}>{capacity.fits ? '通过' : '拒绝写入'}</Tag>
              </div>

              {#if !capacity.fits && capacity.reclaimable.length}
                <div class="reclaim-panel">
                  <h4>可回收的旧版本快照（在用的活动课程不会被动）</h4>
                  <p class="empty-state">勾选要回收的快照，可在应用前先清理（预计腾出 {formatKb(capacity.reclaimableBytes)}，当前已选 {formatKb(selectedReclaimBytes(capacity))}）：</p>
                  {#each capacity.reclaimable as item (item.versionId)}
                    <div class="reclaim-row">
                      <Checkbox checked={selectedReclaimIds.has(item.versionId)} on:change={(event) => toggleReclaim(item.versionId, readChecked(event))} labelText={`${item.label} · ${formatTime(item.savedAt)} · ${item.activityCount} 个活动 · ${formatKb(item.bytes)}`} />
                    </div>
                  {/each}
                </div>
              {:else if !capacity.fits}
                <InlineNotification lowContrast kind="error" title="没有可回收的旧版本快照" subtitle="请先在本机其他存储中腾出空间，再重试合并。" hideCloseButton />
              {/if}

              {#if mergePlan.versionsToBring.length}
                <div class="exclude-versions">
                  <Checkbox checked={excludeIncomingVersions} on:change={toggleExcludeIncomingVersions} labelText={`不导入随包附带的 ${mergePlan.versionsToBring.length} 个历史快照（只合并当前活动，可省空间）`} />
                </div>
              {/if}
            {/if}

            <div class="merge-actions">
              <Button kind="danger" disabled={capacity ? !capacity.fits : false} on:click={executeMerge}>{capacity?.fits === false ? '容量不足，拒绝合并' : '应用合并到当前课程'}</Button>
              <Button kind="ghost" on:click={reclaimSelectedVersions} disabled={!selectedReclaimIds.size}>先回收选中的 {selectedReclaimIds.size} 个旧版本</Button>
            </div>
            <p class="merge-disclaimer">在点击“应用合并”前，当前课程保持原样；应用时采用临时键试写，任一环节失败都会保留在用课程。</p>
          </div>
        {/if}
      </Tile>

      <div class="version-layout-svelte">
        <Tile class="version-timeline">
          <div class="section-title"><div><span class="kicker">TIMELINE</span><h3>课程版本</h3></div><Tag type="cool-gray">{course.versions.length} 个快照 · {formatKb(listReclaimableVersions(course).reduce((sum, item) => sum + item.bytes, 0))}</Tag></div>
          {#each course.versions as version, index (version.id)}
            <article class:latest={index === course.versions.length - 1}>
              <span class="timeline-dot"></span>
              <div class="version-row">
                <div><b>{version.label}</b><h4>{version.note}</h4><p>{formatTime(version.savedAt)} · {version.activities.length} 个活动 · {formatKb(JSON.stringify(version).length)}</p></div>
                <Button size="small" kind="danger-ghost" on:click={() => deleteVersion(version.id)}>回收</Button>
              </div>
            </article>
          {:else}
            <p class="empty-state">还没有版本快照。“保存新版本”会冻结一份活动、依赖与反馈快照。</p>
          {/each}
        </Tile>
        <Tile class="diff-card">
          <div class="section-title"><div><span class="kicker">COMPARE</span><h3>比较两个版本</h3></div></div>
          <div class="compare-pickers">
            <Select labelText="基准版本" selected={compareBaseId} on:change={(event) => (compareBaseId = readText(event))}>
              {#each course.versions as version}<SelectItem value={version.id} text={`${version.label} · ${formatTime(version.savedAt)}`} />{/each}
            </Select>
            <Select labelText="目标版本" selected={compareTargetId} on:change={(event) => (compareTargetId = readText(event))}>
              {#each course.versions as version}<SelectItem value={version.id} text={`${version.label} · ${formatTime(version.savedAt)}`} />{/each}
            </Select>
          </div>
          <div class="diff-list">
            {#each versionDiff as diff (diff.id + diff.kind)}
              <article class={diff.kind}><span>{diff.kind === 'added' ? '新增' : diff.kind === 'removed' ? '删除' : '修改'}</span><div><b>{diff.title}</b><p>{diff.detail}</p></div></article>
            {:else}
              <p class="empty-state">两个版本之间没有活动差异，或尚未选择版本。</p>
            {/each}
          </div>
        </Tile>
      </div>
    </main>
  {/if}

  <footer class="app-footer">
    <span>所有数据保存在当前浏览器 localStorage · 结构 v{COURSE_SCHEMA_VERSION}</span>
    <span>Ctrl/Cmd + Z 撤销 · Ctrl/Cmd + Y 重做 · Alt + N 新建活动 · Ctrl/Cmd + S 保存</span>
  </footer>
</div>
