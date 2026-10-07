import { strict as assert } from 'node:assert';
import { upgradeCourse, createBlankCourse, type Course } from '../src/lib/course';
import { buildMergePlan, applyMergePlan } from '../src/lib/merge';
import { DerivedCache } from '../src/lib/derived';
import { assessMergeCapacity, safeSetItem } from '../src/lib/quota';

// ---------- 1. 旧数据升级：缺字段先补齐再参与合并 ----------
{
  const legacy = { id: 'c1', title: '旧课程', activities: [{ id: 'a-1', type: '音素', content: '/m/' }] };
  const { course, notes } = upgradeCourse(legacy);
  assert.equal(course.schemaVersion, 2);
  assert.deepEqual(course.activities[0].phonemes, []);
  assert.equal(course.activities[0].feedback, '');
  assert.equal(course.activities[0].duration, 8);
  assert.ok(notes.length >= 1, '应记录升级说明');

  const broken = upgradeCourse({ activities: 'not-array' });
  assert.ok(broken.course.activities);
  console.log('✔ 旧结构升级补齐');
}

// ---------- 2. 按活动编号合并 ----------
{
  // 共同版本 v0：a-1 / a-2 初始内容
  const sharedVersion = {
    id: 'v0', label: '共同版本', savedAt: '2026-09-01T10:00:00+08:00', note: '',
    activities: [
      { id: 'a-1', type: '音素' as const, title: 'm', content: '/m/', phonemes: ['/m/'], dependencies: [], difficulty: 1, prompt: '', accessibility: '', duration: 5, feedback: '' },
      { id: 'a-2', type: '练习' as const, title: '练习', content: 'old', phonemes: [], dependencies: [], difficulty: 1, prompt: '', accessibility: '', duration: 5, feedback: '旧反馈' }
    ]
  };
  const makeCourse = (activities: typeof sharedVersion.activities): Course => ({
    ...createBlankCourse(), id: 'c', title: 't', activities, versions: [sharedVersion]
  });

  // 本地：a-2 未动；导入：a-2 的反馈被同事修改；另外各自有独有活动 a-3、a-4；a-1 两边都改
  const local = makeCourse([
    { ...sharedVersion.activities[0], title: '本地改的音素标题' },
    sharedVersion.activities[1],
    { id: 'a-3', type: '单词', title: '仅本地', content: 'map', phonemes: ['/m/'], dependencies: ['a-1'], difficulty: 1, prompt: '', accessibility: '', duration: 6, feedback: '' }
  ]);
  const incomingRaw = {
    id: 'c', title: 't', schemaVersion: 2, updatedAt: '',
    activities: [
      { ...sharedVersion.activities[0], title: '同事改的音素标题' },
      { ...sharedVersion.activities[1], feedback: '同事补的新反馈' },
      { id: 'a-4', type: '句子', title: '仅导入', content: 'A mat.', phonemes: ['/m/'], dependencies: [], difficulty: 1, prompt: '', accessibility: '', duration: 6, feedback: '有反馈' }
    ],
    versions: [sharedVersion]
  };

  const { plan, error } = buildMergePlan(local, incomingRaw);
  assert.ok(!error && plan);
  assert.equal(plan!.counts['added-incoming'], 1, 'a-4 应判为仅导入');
  assert.equal(plan!.counts['added-local'], 1, 'a-3 应判为仅本地');
  assert.equal(plan!.counts.divergent, 1, 'a-1 两边都改');
  assert.equal(plan!.counts['one-sided'], 1, 'a-2 只有一边改');
  assert.equal(plan!.baseVersionLabel, '共同版本');

  const divergent = plan!.entries.find((e) => e.id === 'a-1')!;
  assert.equal(divergent.resolution, 'keep-both', '两边都改默认并列');
  assert.ok(divergent.incomingCloneId.includes('导入版'));
  const oneSided = plan!.entries.find((e) => e.id === 'a-2')!;
  assert.equal(oneSided.resolution, 'use-incoming', '同事改过的反馈应采用导入版');

  const { course: merged, stats } = applyMergePlan(local, plan!);
  const ids = merged.activities.map((a) => a.id);
  assert.ok(ids.includes('a-4'), '仅导入的直接补上');
  assert.ok(ids.includes('a-3'), '本地独有的保留');
  assert.ok(ids.some((id) => id.includes('导入版')), '并列的导入版有派生编号');
  assert.equal(stats.duplicated, 1);
  assert.equal(stats.added, 2, 'a-4 + a-1 导入副本');
  assert.equal(stats.updated, 1, 'a-2 更新');

  const a1Local = merged.activities.find((a) => a.id === 'a-1')!;
  const a1Import = merged.activities.find((a) => a.id === a1Local ? false : a.title.includes('同事改'));
  assert.ok(a1Import && a1Import.mergeTag === '导入版');
  assert.equal(a1Local.mergeTag, '本地版');
  // 导入副本不承接原依赖：a-3 依赖仍指向本地 a-1，编号未变
  assert.deepEqual(merged.activities.find((a) => a.id === 'a-3')!.dependencies, ['a-1']);
  assert.equal(merged.activities.find((a) => a.id === 'a-2')!.feedback, '同事补的新反馈');

  // 选定“只用本地版”则不产生副本
  plan!.entries.find((e) => e.id === 'a-1')!.resolution = 'use-local';
  const picked = applyMergePlan(local, plan!).course;
  assert.equal(picked.activities.filter((a) => a.id === 'a-1' || a.id.includes('导入版')).length, 1);

  console.log('✔ 按编号三路合并：独有的补上、一边改的采用、两边都改的并列两版');
}

// ---------- 3. 无共同版本时保守按两边都改处理 ----------
{
  const local = { ...createBlankCourse(), activities: [{ id: 'x-1', type: '音素' as const, title: '本地', content: 'a', phonemes: [], dependencies: [], difficulty: 1, prompt: '', accessibility: '', duration: 5, feedback: '' }] };
  const incoming = { id: 'c2', title: '同事', activities: [{ id: 'x-1', type: '音素', title: '同事', content: 'b', phonemes: [], dependencies: [], difficulty: 1, prompt: '', accessibility: '', duration: 5, feedback: '' }] };
  const { plan } = buildMergePlan(local, incoming);
  assert.equal(plan!.counts.divergent, 1);
  assert.equal(plan!.baseVersionLabel, null);
  console.log('✔ 无共同版本时保守并列');
}

// ---------- 4. 依赖/音素变化使派生结果失效重算 ----------
{
  const cache = new DerivedCache();
  const course = createBlankCourse();
  course.activities = [
    { id: 'p1', type: '音素', title: 'm', content: '/m/', phonemes: ['/m/'], dependencies: [], difficulty: 1, prompt: '', accessibility: '', duration: 5, feedback: '' },
    { id: 'w1', type: '单词', title: 'map', content: 'map', phonemes: ['/m/', '/æ/'], dependencies: [], difficulty: 1, prompt: '', accessibility: '', duration: 5, feedback: '' }
  ];
  const first = cache.resolve(course);
  assert.equal(first.recomputed, true);
  assert.equal(cache.resolve(course).recomputed, false, '签名不变应命中缓存');
  // 手机每课 2 个 → 两个活动同课；平板 3、桌面 4 同样一课
  assert.deepEqual(first.snapshot.paths.phone.map((l) => l.activityIds), [['p1', 'w1']]);
  assert.deepEqual(first.snapshot.paths.desktop.map((l) => l.activityIds), [['p1', 'w1']]);

  // 依赖变化：w1 前置 p1 → 前置音素应包含 /m/，且旧结果作废
  course.activities[1].dependencies = ['p1'];
  const afterDep = cache.resolve(course);
  assert.equal(afterDep.recomputed, true);
  assert.deepEqual(afterDep.snapshot.prerequisitePhonemes['w1'], ['/m/']);
  assert.ok(cache.invalidations.some((i) => i.reason === '依赖变化'));

  // 循环依赖：p1 依赖 w1，w1 依赖 p1 → 检测出环
  course.activities[0].dependencies = ['w1'];
  const cyclic = cache.resolve(course);
  assert.ok(cyclic.snapshot.cycle && cyclic.snapshot.cycle.length >= 3);
  console.log('✔ 依赖/音素变化：前置音素、循环依赖、三宽度路径失效重算');
}

// ---------- 5. 容量不足拒绝合并并列出可回收旧版本 ----------
{
  const store = new Map<string, string>();
  const localStorageMock = {
    get length() { return store.size; },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.has(k) ? store.get(k)! : null,
    setItem: (k: string, v: string) => {
      // 20KB 的模拟上限
      const other = [...store.entries()].filter(([key]) => key !== k).reduce((s, [, val]) => s + val.length, 0);
      if (other + k.length + v.length > 20 * 1024) throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      store.set(k, v);
    },
    removeItem: (k: string) => { store.delete(k); }
  };
  (globalThis as unknown as { localStorage: Storage }).localStorage = localStorageMock as unknown as Storage;

  const current = createBlankCourse();
  current.activities = [{ id: 'a1', type: '练习', title: 'x', content: 'x', phonemes: [], dependencies: [], difficulty: 1, prompt: '', accessibility: '', duration: 5, feedback: '' }];
  // 放大当前课程的版本快照占用，制造容量紧张
  current.versions = [{ id: 'v-old', label: '旧快照', savedAt: '2026-01-01', note: '', activities: Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, type: '练习' as const, title: 'x'.repeat(80), content: 'x'.repeat(80), phonemes: [], dependencies: [], difficulty: 1, prompt: '', accessibility: '', duration: 5, feedback: '' })) }];

  const incoming = {
    id: current.id, title: current.title, activities: [
      ...current.activities,
      { id: 'a2', type: '句子', title: '新增'.repeat(40), content: 'y'.repeat(2000), phonemes: [], dependencies: [], difficulty: 1, prompt: '', accessibility: '', duration: 5, feedback: 'f' }
    ],
    versions: []
  };

  const { plan } = buildMergePlan(current, incoming);
  const { course: merged } = applyMergePlan(current, plan!);
  const report = assessMergeCapacity(current, merged);
  assert.equal(report.fits, false, '20KB 上限下应判定容量不足');
  assert.ok(report.reclaimable.some((v) => v.versionId === 'v-old'));
  assert.ok(report.reclaimableBytes > 0);

  // 安全写入：空间不足时返回失败且不破坏在用键
  store.set('key-current', JSON.stringify(current));
  const result = safeSetItem('key-current', JSON.stringify(merged));
  assert.equal(result.ok, false);
  assert.equal(store.get('key-current'), JSON.stringify(current), '失败后在用课程必须原样保留');
  console.log('✔ 容量不足拒绝合并、列出可回收旧版本、失败不写坏在用课程');
}

console.log('\n全部合并/迁移/派生/容量场景通过');
