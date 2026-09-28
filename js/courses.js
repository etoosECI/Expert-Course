// 학생부 교과 성적(과목 단위) 공용 모듈 — naeshin-dashboard의 CourseRecord 형식과 동일.
// 상담 진단실 학생 기록(record.courses)과 교과 지원판단 보드가 같은 데이터를 쓴다.
export const AREAS = ['국어', '수학', '영어', '사회', '과학', '한국사', '한문', '제2외국어', '기술가정', '예술', '체육', '기타'];
export const KINDS = ['공통', '일반선택', '진로선택'];
export const ACH = ['A', 'B', 'C', 'D', 'E'];
export const MOCK_AREAS = [['kor', '국어'], ['math', '수학'], ['eng', '영어'], ['tam1', '탐구1'], ['tam2', '탐구2'], ['hist', '한국사']];
export const blankMock = () => ({ name: '', kor: '', math: '', eng: '', tam1: '', tam2: '', hist: '' });

let seq = 0;
const nid = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;
export const emptyCourse = () => ({ id: nid(), year: 1, semester: 1, area: '국어', name: '', units: 0, kind: null, rank: null, rawScore: null, mean: null, stdev: null, achievement: null, distA: null, distB: null, distC: null, studentCount: null });

const toNum = v => { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; };

// 교과 분류 — 원본 lib/xlsx.ts normArea와 동일한 규칙
export function normArea(v, name = '') {
  const s = String(v ?? '').replace(/\s/g, ''), n = String(name ?? '').replace(/\s/g, '');
  if (/제2외국어|기술|가정|정보|교양|한문/.test(s)) {
    if (/한문/.test(n)) return '한문';
    if (/일본어|중국어|독일어|프랑스어|불어|스페인어|서반아어|러시아어|노어|아랍어|베트남어|라틴어|외국어/.test(n)) return '제2외국어';
    if (/기술|가정|정보|공학|농업|상업|수산|해운|가사/.test(n)) return '기술가정';
    if (/한문/.test(s)) return '한문';
    return '기타';
  }
  return AREAS.find(a => s.includes(a)) ?? '기타';
}

// 외부 입력(파일·저장소·다른 대시보드)을 검증·정규화
export function normalizeCourses(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 300) throw Error('성적 목록 형식이 올바르지 않습니다.');
  return list.map(c => {
    if (!c || typeof c !== 'object') throw Error('성적 항목 형식이 올바르지 않습니다.');
    const year = toNum(c.year), sem = toNum(c.semester), ach = String(c.achievement ?? '').toUpperCase();
    return {
      id: typeof c.id === 'string' && c.id.length < 60 ? c.id : nid(),
      year: [1, 2, 3].includes(year) ? year : 1, semester: [1, 2].includes(sem) ? sem : 1,
      area: AREAS.includes(c.area) ? c.area : normArea(c.area, c.name),
      name: String(c.name ?? '').slice(0, 60), units: Math.max(0, Math.min(20, toNum(c.units) ?? 0)),
      kind: KINDS.includes(c.kind) ? c.kind : null,
      rank: (() => { const r = toNum(c.rank); return r != null && r >= 1 && r <= 9 ? r : null; })(),
      rawScore: toNum(c.rawScore), mean: toNum(c.mean), stdev: toNum(c.stdev),
      achievement: ACH.includes(ach) ? ach : null,
      distA: toNum(c.distA), distB: toNum(c.distB), distC: toNum(c.distC), studentCount: toNum(c.studentCount)
    };
  });
}
export function normalizeMocks(list) {
  const out = [blankMock(), blankMock(), blankMock()];
  if (list === undefined) return out;
  if (!Array.isArray(list) || list.length > 3) throw Error('모의고사 형식이 올바르지 않습니다.');
  list.forEach((m, i) => { for (const k of Object.keys(out[i])) { const v = m?.[k]; if (v !== undefined) { if (typeof v !== 'string' || v.length > 40) throw Error('모의고사 값이 올바르지 않습니다.'); out[i][k] = v; } } });
  return out;
}

// 대표 내신: 전 과목 석차등급 이수단위 가중평균 (naeshin-dashboard 대표내신과 동일)
export function overall(courses, areas = null) {
  const list = courses.filter(c => c.rank != null && c.units > 0 && (!areas || areas.includes(c.area)));
  if (!list.length) return null;
  const su = list.reduce((s, c) => s + c.units, 0);
  return Math.round(list.reduce((s, c) => s + c.rank * c.units, 0) / su * 100) / 100;
}
export const MAIN_AREAS = ['국어', '수학', '영어', '사회', '과학'];

/* ---------- 엑셀 (SheetJS를 필요할 때만 CDN에서 불러옴) ---------- */
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = XLSX_URL; s.onload = () => ok(window.XLSX); s.onerror = () => fail(Error('엑셀 도구를 불러오지 못했습니다. 인터넷 연결을 확인하세요.')); document.head.append(s); });
}
// 기대 컬럼(원본과 동일): 학년, 학기, 교과, 과목, 이수단위, 석차등급, 원점수, 과목평균, 표준편차, 성취도, A비율, B비율, C비율, 수강자수 (+선택: 구분)
export async function parseXlsx(buffer) {
  const X = await loadXlsx(), wb = X.read(buffer, { type: 'array' });
  const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }), out = [];
  for (const r of rows) {
    const get = keys => { for (const k of Object.keys(r)) { const kk = k.replace(/\s/g, ''); if (keys.some(t => kk.includes(t))) return r[k]; } return ''; };
    const name = String(get(['과목', '과목명']) ?? '').trim(), year = toNum(get(['학년']));
    if (!name && !year) continue;
    const kraw = String(get(['교과종류구분', '과목구분', '구분']) ?? '');
    out.push({ year, semester: toNum(get(['학기'])), area: normArea(get(['교과', '교과영역', '교과군']), name), name: name || '(과목명)',
      units: toNum(get(['이수단위', '단위', '학점'])), kind: kraw.includes('공통') ? '공통' : kraw.includes('진로') ? '진로선택' : kraw.includes('일반') ? '일반선택' : null,
      rank: toNum(get(['석차등급', '등급'])), rawScore: toNum(get(['원점수'])), mean: toNum(get(['과목평균', '평균'])), stdev: toNum(get(['표준편차'])),
      achievement: String(get(['성취도']) ?? '').trim(), distA: toNum(get(['A비율', 'a비율'])), distB: toNum(get(['B비율', 'b비율'])), distC: toNum(get(['C비율', 'c비율'])), studentCount: toNum(get(['수강자'])) });
  }
  return normalizeCourses(out);
}
export async function downloadTemplate() {
  const X = await loadXlsx();
  const header = ['학년', '학기', '교과', '과목', '구분', '이수단위', '석차등급', '원점수', '과목평균', '표준편차', '성취도', 'A비율', 'B비율', 'C비율', '수강자수'];
  const sample = [[1, 1, '국어', '국어', '공통', 4, 2, 92, 78, 12, '', '', '', '', 250], [1, 1, '수학', '수학', '공통', 4, 1, 96, 70, 14, '', '', '', '', 250], [2, 1, '과학', '물리학Ⅰ', '일반선택', 3, 2, '', '', '', '', '', '', '', 120], [3, 1, '과학', '물리학Ⅱ', '진로선택', 3, '', '', '', '', 'A', 30, 40, 20, 60]];
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([header, ...sample]), '학생부성적'); X.writeFile(wb, '학생부_성적_입력양식.xlsx');
}

/* ---------- 같은 사이트의 내신 산출 대시보드(naeshin-dashboard)에 저장된 학생 ---------- */
export function naeshinStudents() {
  try { const raw = localStorage.getItem('naeshin.students.v2'); const list = raw ? JSON.parse(raw) : []; return Array.isArray(list) ? list.filter(s => Array.isArray(s?.courses) && s.courses.length) : []; }
  catch { return []; }
}
