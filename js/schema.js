// 상담 기록의 구조(스키마). 1단계(브라우저 저장)와 2단계(Supabase)가 같은 구조를 공유한다.
// 필드를 바꿀 때는 SCHEMA_VERSION을 올리고 migrateRecord()에 변환 규칙을 추가한다.
import { normalizeCourses, normalizeMocks, blankMock } from './courses.js';
export const SCHEMA_VERSION = 2; // v2: 과목별 성적(courses)·모의고사(mocks) 추가 — 교과 지원판단 보드와 공유

const f = (id, label, type = 'text', required = true, options = null, help = '') => ({ id, label, type, required, options, help });
export { f as field };

export const steps = [
  { title: '학생정보 확인', help: '상담의 출발점입니다. 자료의 기준 시점과 누락 여부부터 확인하세요.', fields: [
    f('caseId', '사례번호'), f('studentName', '학생 이름'), f('year', '지원 학년도'),
    f('school', '고교 유형', 'select', true, ['일반고', '자율고', '특목고', '특성화고', '검정고시', '기타']),
    f('grade', '학년 / 졸업 상태', 'select', true, ['고1', '고2', '고3', '졸업생', '기타']),
    f('date', '상담일', 'date'), f('consultant', '상담자'),
    f('context', '학생 배경 및 상담 요청', 'textarea'),
    f('materials', '확보 자료·기준일·미확보 자료', 'textarea', true, null, '학생부, 성적표, 교육과정 편제표, 모의고사 성적표의 확보 여부를 기록하세요.')] },
  { title: '목표 확인', help: '학생과 학부모의 요구를 따로 듣고, 합의할 조건을 정리합니다.', fields: [
    f('studentGoal', '학생 희망 대학·학과', 'textarea'), f('parentGoal', '학부모 요구사항', 'textarea'),
    f('priority', '선택 우선순위', 'select', true, ['학과 우선', '대학 우선', '지역 우선', '진로 적합성 우선', '미합의']),
    f('constraints', '지역·비용·재수 등 제약조건', 'textarea'),
    f('agreement', '목표 합의 상태', 'select', true, ['합의', '조정 중', '미확인'])] },
  { title: '교과 경쟁력', help: '등급 체계와 반영 방식을 함께 기록합니다. 단순 내신 등급만으로 지원 가능성을 결정하지 않습니다.', fields: [
    f('scale', '내신 등급 체계', 'select', true, ['9등급', '5등급', '혼합 / 기타']),
    f('gpa', '대표 내신 및 산출 범위', 'text', true, null, '예: 2.1 / 9등급 / 국수영사과 / 3학년 1학기까지'),
    f('trend', '학기별·주요 교과 성적 추이', 'textarea'), f('conversion', '대학별 교과 환산 및 반영 차이', 'textarea'),
    f('academicEvidence', '판단 근거·자료 출처', 'textarea'), f('academicJudgment', '교과 경쟁력 판단', 'textarea')] },
  { title: '학생부 경쟁력', help: '기록에 있는 사실과 상담자의 해석을 구분합니다. 활동 수보다 학습 과정과 과목 선택 맥락을 확인하세요.', fields: [
    f('curriculum', '교육편제·과목 선택 맥락', 'textarea'), f('learning', '학업 역량 근거', 'textarea'),
    f('career', '진로·전공 탐색 근거', 'textarea'), f('community', '공동체 역량 근거', 'textarea'),
    f('recordEvidence', '학생부 근거 위치·기록 요약', 'textarea', true, null, '학년·과목·영역 등 다시 확인할 수 있는 위치를 함께 기록하세요.'),
    f('recordJudgment', '강점·한계 및 경쟁력 판단', 'textarea')] },
  { title: '수능 경쟁력', help: '시험별 성적의 일관성과 대학별 반영 차이를 확인한 뒤 수능최저와 정시 가능성을 구분합니다.', fields: [
    f('exam', '시험명·응시일'),
    f('scores', '영역별 성적·선택과목', 'textarea', true, null, '국어·수학·영어·탐구·한국사 / 표준점수·백분위·등급을 구분해 기록'),
    f('examTrend', '최근 시험 추이·변동성', 'textarea'), f('minimum', '수능최저 충족 전망·근거', 'textarea'),
    f('regular', '정시 환산 결과·비교 기준', 'textarea'), f('examJudgment', '수능 경쟁력 판단', 'textarea')] },
  { title: '전형별 경쟁력', help: '전형별 적합도를 상담자가 판단하고, 근거와 전제조건을 남깁니다.', fields: [
    f('routeConclusion', '우선 전형과 판단 근거', 'textarea')] },
  { title: '대학·학과 후보', help: '후보마다 지원자격, 전형 방식, 출처와 기준일을 확인합니다. 분류는 상담자의 판단이며 합격 보장을 뜻하지 않습니다.', fields: [] },
  { title: 'Risk 분석', help: '리스크의 원인, 영향, 대응과 확인 책임을 연결하세요. 해결 전까지 진단 패널에 남습니다.', fields: [
    f('riskSummary', '주요 리스크 종합 판단', 'textarea')] },
  { title: '지원전략', help: '정시 가능성과 학생의 목표를 함께 고려해 지원 조합과 대안을 설계합니다.', fields: [
    f('strategy', '추천 지원 조합·역할', 'textarea'), f('balance', '도전·적정·안정 배분 근거', 'textarea'),
    f('alternative', '조건 미충족 시 대안', 'textarea'), f('schedule', '고사·원서·서류 일정 점검', 'textarea'),
    f('nextAction', '상담 후 실행계획·담당·기한', 'textarea')] },
  { title: '학생·학부모 설명', help: '결론 → 근거 → 불확실성 → 다음 행동 순서로 설명하고, 이해와 합의를 확인합니다.', fields: [
    f('explanation', '핵심 설명문', 'textarea'), f('uncertainty', '불확실성과 유의사항 설명', 'textarea'),
    f('questions', '질문·이견·답변 기록', 'textarea'), f('followup', '합의 내용·후속 상담 계획', 'textarea'),
    f('understood', '이해 확인', 'select', true, ['확인 완료', '추가 설명 필요', '미확인'])] }
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
  return o;
}

const MAX_TEXT = 30000, MAX_ITEMS = 200;
const str = (v, msg) => { if (typeof v !== 'string' || v.length > MAX_TEXT) throw Error(msg); return v; };

// 외부에서 들어온 기록(파일·저장소)을 검증해 허용된 필드만 남긴다.
export function validateRecord(input) {
  const o = migrateRecord(input);
  if (o.version !== SCHEMA_VERSION || !modes.includes(o.mode)) throw Error('지원하지 않는 사례 파일입니다.');
  const out = blank(); out.mode = o.mode;
  const valueIds = steps.flatMap(s => s.fields.map(x => x.id));
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
