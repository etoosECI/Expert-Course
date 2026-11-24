// 상담 기록의 구조(스키마). 1단계(브라우저 저장)와 2단계(Supabase)가 같은 구조를 공유한다.
// 필드를 바꿀 때는 SCHEMA_VERSION을 올리고 migrateRecord()에 변환 규칙을 추가한다.
import { normalizeCourses, normalizeMocks, blankMock } from './courses.js?v=3.0';
export const SCHEMA_VERSION = 3; // v3: 상담 진단실을 4단계로 재구성 (진로설계 보드 연동 중심)

/* 화면에서 뺀 예전 항목들.
   steps에서 빠졌다고 저장된 값을 버리면 예전 사례·백업이 조용히 손실된다.
   그래서 validateRecord가 이 키들도 그대로 지켜 준다 (화면에는 안 나온다). */
export const ARCHIVED_VALUE_IDS = [
  'parentGoal', 'priority', 'constraints', 'agreement',        // 예전 '목표 확인'
  'conversion',                                                // 예전 '대학별 교과 환산'
  'recordEvidence',                                            // 예전 '학생부 근거 위치'
  'exam', 'scores', 'examTrend', 'minimum', 'regular', 'examJudgment',   // 예전 '수능 경쟁력'
  'routeConclusion',                                           // 예전 '전형별 경쟁력'
  'strategy', 'balance', 'alternative', 'schedule', 'nextAction',        // 예전 '지원전략'
  'explanation', 'uncertainty', 'questions', 'followup', 'understood',   // 예전 '학생·학부모 설명'
];

const f = (id, label, type = 'text', required = true, options = null, help = '') => ({ id, label, type, required, options, help });
export { f as field };

export const steps = [
  { title: '학생정보 · 목표', help: '진로설계 보드에서 학생을 불러온 뒤, 상담 당일에만 알 수 있는 것을 더합니다.', fields: [
    f('caseId', '사례번호'),
    f('studentName', '학생 이름'),
    f('school', '고교 유형', 'select', true, ['일반고', '자율고', '특목고', '특성화고', '검정고시', '기타']),
    f('grade', '학년 / 졸업 상태', 'select', true, ['고1', '고2', '고3', '졸업생', '기타']),
    f('year', '지원 학년도'),
    f('studentGoal', '희망 대학 · 학과', 'textarea'),
    f('date', '상담일', 'date'),
    f('consultant', '상담자'),
    f('context', '학생 배경 및 상담 요청', 'textarea'),
    f('materials', '확보 자료·기준일', 'textarea', false, null, '진로설계 보드에서 불러오면 자동으로 채워집니다.')] },

  { title: '교과 경쟁력', help: '진로설계 보드에서 읽어 온 교과 성적을 교과별·학기별로 봅니다. 단순 내신 등급만으로 지원 가능성을 결정하지 않습니다.', fields: [
    f('scale', '내신 등급 체계', 'select', true, ['9등급', '5등급', '혼합 / 기타']),
    f('gpa', '대표 내신 및 산출 범위', 'text', true, null, '예: 2.1 / 9등급 / 국수영사과 / 3학년 1학기까지'),
    f('trend', '학기별·주요 교과 성적 추이', 'textarea'),
    f('academicEvidence', '판단 근거·자료 출처', 'textarea'),
    f('academicJudgment', '교과 경쟁력 판단', 'textarea')] },

  { title: '학생부 경쟁력', help: '기록에 있는 사실과 상담자의 해석을 구분합니다. 위 카드는 불러온 사실이고, 아래 칸은 상담자가 쓰는 자리입니다.', fields: [
    f('curriculum', '교육편제·과목 선택에 대한 기록', 'textarea'),
    f('learning', '학업 역량 근거', 'textarea'),
    f('career', '진로·전공 탐색 근거', 'textarea'),
    f('community', '공동체 역량 근거', 'textarea'),
    f('recordJudgment', '강점·한계 및 경쟁력 판단', 'textarea')] },

  { title: 'Risk 분석', help: '리스크의 원인, 영향, 대응과 확인 책임을 연결하세요. 해결 전까지 진단 패널에 남습니다.', fields: [
    f('riskSummary', '주요 리스크 종합 판단', 'textarea')] },
];

export const candidateFields = [
  f('university', '대학'), f('major', '학과 / 모집단위'), f('route', '전형명'),
  f('round', '모집 시기', 'select', true, ['수시', '정시 가군', '정시 나군', '정시 다군', '기타']),
  f('category', '지원 판단', 'select', true, ['도전', '적정', '안정', '판단 보류']),
  f('eligibility', '지원자격', 'select', true, ['충족 확인', '미확인', '미충족']),
  f('minimum', '수능최저', 'select', true, ['없음', '충족 전망', '불확실', '미충족 전망', '미확인']),
  f('method', '전형방법·환산점수·입결 비교', 'textarea'), f('source', '모집요강·입결 출처 / 페이지'),
  f('checked', '자료 확인일', 'date'), f('reason', '추천 근거·전제조건', 'textarea'), f('deadline', '원서·고사·서류 일정')
];

export const riskFields = [
  f('title', '리스크 / 추가 확인사항'), f('severity', '중요도', 'select', true, ['높음', '보통', '낮음']),
  f('action', '확인 방법·대응책', 'textarea'), f('owner', '확인 담당'), f('due', '확인 기한', 'date'),
  f('status', '처리 상태', 'select', true, ['미해결', '확인 중', '해결'])
];

export const feedbackFields = [['self', '교육생 자기평가'], ['coach', '강사 피드백'], ['revision', '판단 및 이유']];
export const routes = ['학생부교과', '학생부종합', '논술', '수능위주', '실기·실적'];
export const routeRatings = ['우선 검토', '조건부 검토', '비추천', '판단 보류'];
export const modes = ['전문가 실습', '실제 상담'];

export const blank = () => ({
  version: SCHEMA_VERSION, mode: '전문가 실습', values: {},
  routes: routes.map(name => ({ name, rating: '', reason: '' })),
  candidates: [], risks: [], feedback: { self: '', coach: '', revision: '' },
  courses: [], mocks: [blankMock(), blankMock(), blankMock()]
});

// 이전 버전 기록을 현재 버전으로 올린다. 버전이 바뀔 때마다 규칙을 여기에 추가.
export function migrateRecord(o) {
  if (!o || typeof o !== 'object') throw Error('지원하지 않는 사례 파일입니다.');
  if (o.version === 1) o = { ...o, version: 2, courses: [], mocks: undefined }; // v1 → v2: 성적·모의고사 칸 추가
  // v2 → v3: 단계만 재구성했고 저장 구조는 그대로다. 화면에서 뺀 값도 ARCHIVED_VALUE_IDS로 보존된다.
  if (o.version === 2) o = { ...o, version: 3 };
  return o;
}

const MAX_TEXT = 30000, MAX_ITEMS = 200;
const str = (v, msg) => { if (typeof v !== 'string' || v.length > MAX_TEXT) throw Error(msg); return v; };

// 외부에서 들어온 기록(파일·저장소)을 검증해 허용된 필드만 남긴다.
export function validateRecord(input) {
  const o = migrateRecord(input);
  if (o.version !== SCHEMA_VERSION || !modes.includes(o.mode)) throw Error('지원하지 않는 사례 파일입니다.');
  const out = blank(); out.mode = o.mode;
  const valueIds = [...steps.flatMap(s => s.fields.map(x => x.id)), ...ARCHIVED_VALUE_IDS];
  for (const [key, allowed] of [['values', valueIds], ['feedback', feedbackFields.map(x => x[0])]]) {
    if (!o[key] || typeof o[key] !== 'object' || Array.isArray(o[key])) throw Error('사례 구조를 확인하세요.');
    for (const id of allowed) if (o[key][id] !== undefined) out[key][id] = str(o[key][id], '입력값 형식이 올바르지 않습니다.');
  }
  const lists = { candidates: candidateFields.map(x => x.id), risks: riskFields.map(x => x.id), routes: ['rating', 'reason'] };
  for (const [key, allowed] of Object.entries(lists)) {
    if (!Array.isArray(o[key]) || o[key].length > MAX_ITEMS) throw Error('항목 목록이 올바르지 않습니다.');
    if (key === 'routes' && o[key].length !== routes.length) throw Error('전형 목록이 올바르지 않습니다.');
    out[key] = o[key].map((r, i) => {
      if (!r || typeof r !== 'object' || Array.isArray(r)) throw Error('항목 형식이 올바르지 않습니다.');
      const item = key === 'routes' ? { name: routes[i], rating: '', reason: '' } : {};
      allowed.forEach(k => { if (r[k] !== undefined) item[k] = str(r[k], '항목 값이 올바르지 않습니다.'); });
      return item;
    });
  }
  out.courses = normalizeCourses(o.courses);
  out.mocks = normalizeMocks(o.mocks);
  return out;
}
