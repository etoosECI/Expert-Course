// 학생부 정밀분석 보드(전문가 과정 4강) 기록 구조.
// 학생 성적은 상담 진단실(students) 기록을, 학교 편제·학과 권장과목은 jinro-dash 데이터를 참조한다.
import { AREAS } from './record-input.js';
export const HAKJONG_SCHEMA_VERSION = 1;

export const TAGS = [['학업', '#2f6fb0'], ['진로', '#b0662f'], ['탐구', '#2f8f6a'], ['공동체', '#8a4fb0']];
export const TAG_NAMES = TAGS.map(t => t[0]);
export const LEVELS = ['단순참여', '조사', '분석', '문제해결', '검증·확장'];
export const DEV = ['심화', '확장', '반복', '단절'];
export const OFFERED = ['개설', '미개설', '공동교육과정·온라인'];
export const TAKEN = ['이수', '미이수', '이수 예정'];
export const RUBRIC = [
  ['mapping', 'Evidence Mapping', '핵심 문장을 빠짐없이, 역량을 정확히 표시했는가'],
  ['level', '활동 수준', '활동 수준을 기록 문장 근거로 일관되게 판단했는가'],
  ['connection', '연결성', '탐구 줄기와 학년 간 발전(또는 단절)을 정확히 읽었는가'],
  ['curriculum', '교육과정', '편제 대비 선택과목의 의미를 해석했는가'],
  ['evaluation', '최종평가', '강점·약점·검증사항·핵심경쟁력이 근거에 기반하고 설득력 있는가']
];
export const RUBRIC_SCORES = ['5', '4', '3', '2', '1'];
export const FINAL = { strengths: 3, weaknesses: 3, checks: 3 };

let seq = 0;
export const uid = p => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
export const blankSection = (year = 1, area = '세특', subject = '') => ({ id: uid('s'), year, area, subject, text: '' });
export const blankFinalItem = () => ({ text: '', how: '', evidence: [] });

export const blankHakjong = () => ({
  version: HAKJONG_SCHEMA_VERSION, kind: 'hakjong',
  student: { number: '', name: '' },
  jinro: { key: '', schoolPath: '', schoolName: '', trackId: '', programId: '', programName: '' },
  targetMajor: '',
  sections: [], evidence: [], threads: [],
  curriculum: { offered: [], rows: [] },
  final: { strengths: [blankFinalItem(), blankFinalItem(), blankFinalItem()], weaknesses: [blankFinalItem(), blankFinalItem(), blankFinalItem()], checks: [blankFinalItem(), blankFinalItem(), blankFinalItem()], core: blankFinalItem() },
  timer: { elapsed: 0 },
  feedback: { self: '', coach: '' }, rubric: Object.fromEntries(RUBRIC.map(([id]) => [id, '']))
});

/* ---------- 검증 ---------- */
const MAX = 60000;
const s = (v, max = MAX) => { if (v === undefined || v === null) return ''; if (typeof v !== 'string' || v.length > max) throw Error('입력값 형식이 올바르지 않습니다.'); return v; };
const obj = o => { if (o != null && (typeof o !== 'object' || Array.isArray(o))) throw Error('파일 구조를 확인하세요.'); return o || {}; };
const arr = (a, max) => { if (a === undefined) return []; if (!Array.isArray(a) || a.length > max) throw Error('목록 형식이 올바르지 않습니다.'); return a; };
const ids = a => arr(a, 200).map(x => s(x, 40));
const int = (v, lo, hi, d) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : d; };
const finalItem = o => { o = obj(o); return { text: s(o.text), how: s(o.how), evidence: ids(o.evidence) }; };

export function validateHakjong(o) {
  if (!o || o.kind !== 'hakjong' || o.version !== HAKJONG_SCHEMA_VERSION) throw Error('학생부 정밀분석 파일이 아닙니다.');
  const out = blankHakjong();
  out.student = { number: s(obj(o.student).number, 10), name: s(obj(o.student).name, 80) };
  const j = obj(o.jinro); for (const k of Object.keys(out.jinro)) out.jinro[k] = s(j[k], 200);
  out.targetMajor = s(o.targetMajor, 200);
  out.sections = arr(o.sections, 400).map(x => { x = obj(x); return { id: s(x.id, 40) || uid('s'), year: int(x.year, 1, 3, 1), area: AREAS.includes(x.area) ? x.area : '기타', subject: s(x.subject, 60), text: s(x.text) }; });
  const secIds = new Set(out.sections.map(x => x.id));
  out.evidence = arr(o.evidence, 600).map(x => { x = obj(x); return { id: s(x.id, 40) || uid('e'), sec: s(x.sec, 40), start: int(x.start, 0, MAX, 0), end: int(x.end, 0, MAX, 0), quote: s(x.quote, 4000), tags: arr(x.tags, 4).filter(t => TAG_NAMES.includes(t)), summary: s(x.summary, 2000), level: LEVELS.includes(x.level) ? x.level : '', levelReason: s(x.levelReason, 4000), thread: s(x.thread, 40) }; }).filter(e => secIds.has(e.sec) && e.end > e.start);
  out.threads = arr(o.threads, 40).map(x => { x = obj(x); return { id: s(x.id, 40) || uid('t'), name: s(x.name, 200), dev: DEV.includes(x.dev) ? x.dev : '', note: s(x.note, 4000) }; });
  const c = obj(o.curriculum);
  out.curriculum = { offered: arr(c.offered, 400).map(x => s(x, 60)), rows: arr(c.rows, 80).map(x => { x = obj(x); return { subject: s(x.subject, 60), level: s(x.level, 20), offered: OFFERED.includes(x.offered) ? x.offered : '', taken: TAKEN.includes(x.taken) ? x.taken : '', note: s(x.note, 4000) }; }) };
  const f = obj(o.final);
  for (const k of Object.keys(FINAL)) { const a = arr(f[k], FINAL[k]); out.final[k] = Array.from({ length: FINAL[k] }, (_, i) => finalItem(a[i])); }
  out.final.core = finalItem(f.core);
  out.timer = { elapsed: int(obj(o.timer).elapsed, 0, 86400, 0) };
  out.feedback = { self: s(obj(o.feedback).self), coach: s(obj(o.feedback).coach) };
  for (const [id] of RUBRIC) out.rubric[id] = s(obj(o.rubric)[id], 2);
  return out;
}
