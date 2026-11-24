// jinro-dash(고교 진로·선택과목 설계 대시보드) 연결 모듈.
// 두 사이트가 같은 주소(etooseci.github.io) 아래 있어 브라우저 저장소와 데이터 파일을 함께 쓸 수 있다.
//   - 저장소: localStorage 'jinro.profiles.v4' (jinro-dash assets/js/store.js)
//   - 데이터: ../jinro-dash/data/ (regions.json, schools/…, programs/…)
export const JINRO_URL = '../jinro-dash/';
const DATA = JINRO_URL + 'data/';
const cache = new Map();

async function getJSON(path) {
  if (!cache.has(path)) cache.set(path, fetch(DATA + path).then(r => { if (!r.ok) throw Error(`jinro-dash 데이터를 불러오지 못했습니다 (${path})`); return r.json(); }));
  try { return await cache.get(path); } catch (e) { cache.delete(path); throw e; }
}

export function jinroProfiles() {
  try { const all = JSON.parse(localStorage.getItem('jinro.profiles.v4') || '{}'); return Object.values(all).filter(p => p && p.studentKey).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))); }
  catch { return []; }
}
export const jinroProfile = key => jinroProfiles().find(p => p.studentKey === key) || null;

export async function jinroAvailable() { try { await getJSON('regions.json'); return true; } catch { return false; } }

export async function schoolList() {
  const r = await getJSON('regions.json'), out = [];
  for (const sd of r.sido || []) for (const sg of sd.sigungu || []) for (const sc of sg.schools || []) out.push({ path: sc.path, name: sc.name, type: sc.type, region: `${sd.name} ${sg.name}` });
  return out;
}
export async function programList() { return (await getJSON('programs/index.json')).programs || []; }

// 학교 편제에서 개설 과목 목록(과정·학년 포함)
export async function schoolSubjects(path, trackId = '') {
  const sc = await getJSON(path), tracks = (sc.tracks || []).filter(t => !trackId || t.trackId === trackId);
  const subjects = new Map();
  for (const t of (tracks.length ? tracks : sc.tracks || [])) for (const ph of t.phases || []) for (const o of ph.options || []) {
    const prev = subjects.get(o.subject); const g = ph.grade ?? '';
    subjects.set(o.subject, { subject: o.subject, area: o.area, category: o.category, credits: o.credits ?? prev?.credits ?? null, grades: [...new Set([...(prev?.grades || []), g].filter(x => x !== ''))] });
  }
  for (const p of sc.professionalSubjects || []) if (!subjects.has(p.name)) subjects.set(p.name, { subject: p.name, area: p.track, category: '전문교과', grades: [p.grade].filter(Boolean) });
  return { name: sc.name, schoolType: sc.schoolType, tracks: (sc.tracks || []).map(t => ({ id: t.trackId, label: t.label })), subjects: [...subjects.values()] };
}
export async function programSubjects(programId) {
  const p = await getJSON(`programs/${programId}.json`);
  return { name: p.name, core: p.coreSubjects || [], recommended: p.recommendedSubjects || [] };
}

// jinro-dash 자동 진단(키워드 기반) 요약 — 사람의 판단과 비교하는 참고 자료
export function jinroDiagnosis(profile) {
  const d = profile?.record?.diagnosis; if (!d) return null;
  const ev = d.evidence || null;
  return {
    at: d.at,
    axes: (d.axes || []).map(a => ({ key: a.key, level: a.level, ev: (a.ev || []).map(x => x.text), gap: (a.gap || []).map(x => x.text) })),
    gaps: (d.gaps || []).map(g => [g.label, g.why].filter(Boolean).join(' — ')).filter(Boolean),
    subjects: Object.keys(d.subjectNotes || {}),
    /* 근거 모음 — 기록에 있는 문장 그대로. 독서활동상황·수상경력은 보드에서 이미 뺐다 */
    evidence: ev ? {
      books: (ev.books || []).map(b => ({ title: b.title, author: b.author || null, where: b.where, subject: b.subject || null })),
      fit: (ev.fit || []).map(f => ({ text: f.text, where: f.where, subject: f.subject || null, hits: f.hits || [] })),
      fitKeywords: ev.fitKeywords || [],
      community: (ev.community || []).map(c => ({ text: c.text, where: c.where, subject: c.subject || null, hits: c.hits || [] })),
      excluded: ev.excluded || null,
      sources: ev.sources || [],
    } : null,
  };
}

/* ──────────────────────────────────────────────────────────────
   상담 진단실 연결용 변환기
   진로설계 보드의 "사실"만 옮긴다 — 이름·학교·편제·선택 과목·교과 성적.
   역량 판단은 옮기지 않는다. 그 칸은 상담자가 쓰는 자리다.
   ────────────────────────────────────────────────────────────── */

export function mapSchoolType(t) {
  const s = String(t || '');
  if (/자율/.test(s)) return '자율고';
  if (/특목|외국어|국제|과학고|영재|예술고|체육고/.test(s)) return '특목고';
  if (/특성화|마이스터/.test(s)) return '특성화고';
  if (/일반/.test(s)) return '일반고';
  return '';
}

const AREA_MAP = { 국어: '국어', 수학: '수학', 영어: '영어', 사회: '사회', 과학: '과학',
  한국사: '한국사', 한문: '한문', 제2외국어: '제2외국어', 예술: '예술', 체육: '체육',
  기술: '기술가정', '기술·가정': '기술가정', 정보: '기타', 교양: '기타' };
const KIND_MAP = { 공통과목: '공통', 일반선택: '일반선택', 진로선택: '진로선택' };

/* 진로설계 보드가 생기부에서 읽어 둔 교과 성적 */
export const jinroGrades = profile => (profile?.grades?.rows || []).filter(r => r && r.subject);

/* 성적 → 진단실 courses (교과 지원판단 보드가 그대로 쓴다) */
export function gradeCourses(rows) {
  return (rows || []).map(r => ({
    year: [1, 2, 3].includes(Number(r.grade)) ? Number(r.grade) : 1,
    semester: Number(r.semester) === 2 ? 2 : 1,
    area: AREA_MAP[r.area] || (['국어','수학','영어','사회','과학','한국사','한문','제2외국어','예술','체육'].includes(r.area) ? r.area : '기타'),
    name: String(r.subject).slice(0, 60),
    units: Number(r.credits) || 0,
    kind: null,
    rank: Number(r.rank) || null,
    rawScore: r.rawScore ?? null, mean: r.mean ?? null, stdev: r.stdev ?? null,
    achievement: /^[A-E]$/.test(String(r.achievement || '').toUpperCase()) ? String(r.achievement).toUpperCase() : null,
    distA: null, distB: null, distC: null,
    studentCount: Number(r.takers) || null,
  }));
}

/* 설계에서 고른 과목 → courses (성적이 없을 때의 대체) */
export function jinroCourses(profile, school) {
  if (!profile || !school) return [];
  const meta = new Map((school.subjects || []).map(s => [s.subject, s]));
  const names = [...new Set([...(profile.takenSubjects || []), ...(profile.chosenSubjects || []), ...(profile.manualSubjects || [])])];
  return names.filter(Boolean).map(name => {
    const m = meta.get(name) || {};
    const g = (m.grades || []).filter(x => x === 2 || x === 3);
    return { year: g.length ? Math.min(...g) : 1, semester: 1, area: AREA_MAP[m.area] || '기타',
      name, units: Number(m.credits) || 0, kind: KIND_MAP[m.category] || null,
      rank: null, rawScore: null, mean: null, stdev: null, achievement: null,
      distA: null, distB: null, distC: null, studentCount: null };
  });
}

/* 국·수·영·사·과 5교과 집계 — 학기별 평균 등급·평균 원점수·이수단위 합, 교과 간 격차 */
const CORE5 = ['국어', '수학', '영어', '사회', '과학'];
export function gradeSummary(rows) {
  const list = (rows || []).filter(r => r && r.subject);
  if (!list.length) return null;
  const key = r => `${r.grade}-${r.semester}`;
  const terms = [...new Set(list.map(key))].sort();
  const area = r => (r.area === '한국사' ? '사회' : r.area);
  const w = (arr, f) => {                       // 이수단위 가중평균
    let s = 0, c = 0;
    arr.forEach(r => { const v = f(r); if (v == null || isNaN(v)) return; const u = Number(r.credits) || 1; s += v * u; c += u; });
    return c ? Math.round((s / c) * 100) / 100 : null;
  };
  const byArea = {};
  CORE5.forEach(a => {
    const mine = list.filter(r => area(r) === a);
    byArea[a] = {
      subjects: mine.length,
      credits: mine.reduce((n, r) => n + (Number(r.credits) || 0), 0),
      rank: w(mine, r => Number(r.rank)), raw: w(mine, r => Number(r.rawScore)),
      terms: terms.map(t => {
        const m2 = mine.filter(r => key(r) === t);
        return { term: t, rank: w(m2, r => Number(r.rank)), raw: w(m2, r => Number(r.rawScore)),
          credits: m2.reduce((n, r) => n + (Number(r.credits) || 0), 0) };
      }),
    };
  });
  const ranked = CORE5.filter(a => byArea[a].rank != null).sort((a, b) => byArea[a].rank - byArea[b].rank);
  const coreCredits = CORE5.reduce((n, a) => n + byArea[a].credits, 0);
  return {
    terms, byArea, ranked,
    overallRank: w(list, r => Number(r.rank)),
    overallRaw: w(list, r => Number(r.rawScore)),
    coreRank: w(list.filter(r => CORE5.includes(area(r))), r => Number(r.rank)),
    totalCredits: list.reduce((n, r) => n + (Number(r.credits) || 0), 0),
    coreCredits,
    spread: ranked.length > 1 ? Math.round((byArea[ranked[ranked.length - 1]].rank - byArea[ranked[0]].rank) * 100) / 100 : null,
    strong: ranked.slice(0, 2), weak: ranked.slice(-2).reverse(),
    subjectCount: list.length,
  };
}
