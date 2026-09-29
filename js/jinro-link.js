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
    subjects.set(o.subject, { subject: o.subject, area: o.area, category: o.category, grades: [...new Set([...(prev?.grades || []), g].filter(x => x !== ''))] });
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
  return { at: d.at, axes: (d.axes || []).map(a => ({ key: a.key, level: a.level, ev: (a.ev || []).map(x => x.text), gap: (a.gap || []).map(x => x.text) })), gaps: (d.gaps || []).map(g => [g.label, g.why].filter(Boolean).join(' — ')).filter(Boolean) };
}
