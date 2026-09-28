// 교과 지원판단 보드(전문가 과정 3강) 기록 구조. 학생 성적은 상담 진단실 기록(courses·mocks)을 참조한다.
export const GYOGWA_SCHEMA_VERSION = 1;
export const MAX_CANDIDATES = 10;
export const PICKS = 6;

export const M1_CHECK = ['요강 확인 완료', '재확인 필요'];
export const LEVELS = ['높음', '경계', '낮음', '해당 없음'];
export const ELIG = ['충족', '미충족', '확인 필요'];
export const JUDGE = ['도전', '적정', '안정'];
export const RUBRIC = [
  ['conv', '교과환산', '대학별 반영 방식을 확인하고 학교 내신과의 차이를 해석했는가'],
  ['minimum', '수능최저', '모의고사 추이로 충족 가능성을 근거 있게 분류했는가'],
  ['eligibility', '지원자격', '졸업연도·추천·이수 요건 등 지원 가능성을 빠짐없이 확인했는가'],
  ['result', '입결 해석', '입결 기준·인원·추세를 고려해 도전·적정·안정을 판단했는가'],
  ['design', '조합 설계', '6장의 역할·리스크 분산·대체대학이 설계되었는가']
];
export const RUBRIC_SCORES = ['5', '4', '3', '2', '1'];

export const SNAP_KEYS = ['univ', 'series', 'dept', 'admName', 'eligibility', 'suneung27', 'method27', 'banyeong', 'exam27', 'quota27', 'quota26', 'deltaChange'];
export const recKey = r => [r.univ, r.admName, r.series, String(r.dept).replace(/\s+/g, ' ')].join('|');
export const snapshot = r => Object.fromEntries(SNAP_KEYS.map(k => [k, r[k] == null ? '' : String(r[k])]));

export const blankCandidate = (key = '', snap = {}) => ({
  key, snap: { ...Object.fromEntries(SNAP_KEYS.map(k => [k, ''])), ...snap },
  m1: { check: '', note: '' }, m2: { n: '', sum: '', level: '', reason: '' }, m3: { status: '', note: '' }, m4: { judge: '', reason: '' }
});
export const blankPick = () => ({ key: '', reason: '', risk: '', alt: '' });
export const blankGyogwa = () => ({
  version: GYOGWA_SCHEMA_VERSION, kind: 'gyogwa',
  student: { number: '', name: '' },
  candidates: [], picks: Array.from({ length: PICKS }, blankPick),
  feedback: { self: '', coach: '' }, rubric: Object.fromEntries(RUBRIC.map(([id]) => [id, '']))
});

const MAX = 30000;
const s = v => { if (v === undefined || v === null) return ''; if (typeof v !== 'string' || v.length > MAX) throw Error('입력값 형식이 올바르지 않습니다.'); return v; };
const pick = (src, tmpl) => { if (src != null && (typeof src !== 'object' || Array.isArray(src))) throw Error('파일 구조를 확인하세요.'); const o = {}; for (const k of Object.keys(tmpl)) o[k] = s(src?.[k]); return o; };
export function validateGyogwa(o) {
  if (!o || o.kind !== 'gyogwa' || o.version !== GYOGWA_SCHEMA_VERSION) throw Error('교과 지원판단 파일이 아닙니다.');
  const b = blankGyogwa(), c0 = blankCandidate(), out = blankGyogwa();
  out.student = pick(o.student, b.student);
  if (!Array.isArray(o.candidates) || o.candidates.length > MAX_CANDIDATES) throw Error('후보 목록이 올바르지 않습니다.');
  out.candidates = o.candidates.map(c => ({ key: s(c?.key), snap: pick(c?.snap, c0.snap), m1: pick(c?.m1, c0.m1), m2: pick(c?.m2, c0.m2), m3: pick(c?.m3, c0.m3), m4: pick(c?.m4, c0.m4) }));
  if (!Array.isArray(o.picks) || o.picks.length !== PICKS) throw Error('추천 목록이 올바르지 않습니다.');
  out.picks = o.picks.map(p => pick(p, blankPick()));
  out.feedback = pick(o.feedback, b.feedback); out.rubric = pick(o.rubric, b.rubric);
  return out;
}
