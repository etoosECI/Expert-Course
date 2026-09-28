// 대학 분석 보드의 기록 구조. 진단실(schema.js)과 별도 컬렉션(analyses)으로 저장한다.
export const UNIV_SCHEMA_VERSION = 1;

export const SOURCES = [
  ['prevGuide', '전년도 모집요강'], ['currGuide', '올해 모집요강'], ['prevResult', '전년도 입결'],
  ['competition', '경쟁률'], ['fill', '충원(추가합격)'], ['adiga', '대입정보포털 어디가']
];
export const SOURCE_STATUS = ['확보', '미확보', '해당 없음'];

export const ITEMS = [
  ['quota', '모집인원', '인원 증감, 이월·정원 외 여부'],
  ['minimum', '수능최저', '영역 수·등급 합·탐구 반영·한국사, 신설·폐지 여부'],
  ['eligibility', '지원자격', '졸업연도, 추천 인원, 고교 유형, 이수 요건'],
  ['method', '전형방법', '일괄/단계, 반영 비율, 1단계 배수'],
  ['interview', '면접', '유형(서류 기반/제시문), 비율, 일정(수능 전/후)'],
  ['grades', '교과반영', '반영 교과, 학년 비율, 진로선택 처리, 정성평가'],
  ['units', '모집단위', '신설·통합·폐지·명칭 변경, 계열 구분']
];
export const CHANGE_TYPES = ['유지', '신설', '폐지', '강화', '완화', '변경'];
export const ROUTE_TYPES = ['학생부교과', '학생부종합', '논술', '실기·실적', '수능위주', '기타'];
export const DIRECTIONS = ['증가', '감소', '불확실'];
export const CUT_BASIS = ['최종 등록자', '최초 합격자', '기타'];
export const CUT_POINT = ['50%컷', '70%컷', '평균', '최저(100%)', '기타'];
export const CUT_METHOD = ['대학 환산 등급', '전 과목', '주요 교과', '기타'];
export const RESULT_SOURCE = ['입학처', '어디가', '입학처·어디가 모두'];
export const RUBRIC = [
  ['accuracy', '정확성', '요강·입결을 정확하게 읽고 옮겼는가'],
  ['evidence', '근거', '모든 판단에 자료·쪽수가 연결되는가'],
  ['interpretation', '해석', '변화가 지원자·합격선에 미칠 영향을 논리적으로 해석했는가'],
  ['strategy', '전략 연결', 'TOP 3가 실제 지원전략(권할 학생·주의할 학생)으로 이어지는가']
];
export const RUBRIC_SCORES = ['5', '4', '3', '2', '1'];
export const MAX_ROUTES = 5;

const blankItems = () => Object.fromEntries(ITEMS.map(([id]) => [id, { prev: '', curr: '', change: '', page: '', applicants: '', cutline: '', impact: '' }]));
export const blankRoute = () => ({
  name: '', type: '', scope: '', items: blankItems(),
  result: { recruit: '', applicants: '', rate: '', filled: '', cutValue: '', cutBasis: '', cutPoint: '', cutMethod: '', resultSource: '', adigaValue: '', univValue: '', mismatch: '', realRate: '', trend: '' }
});
export const blankTop = () => ({ link: '', summary: '', evidence: '', meaning: '', recommend: '', caution: '' });

export const blankAnalysis = () => ({
  version: UNIV_SCHEMA_VERSION, kind: 'univ-analysis',
  meta: { university: '', year: '', prevYear: '', round: '수시', analyst: '', date: '', note: '' },
  sources: Object.fromEntries(SOURCES.map(([id]) => [id, { status: '', ref: '', checked: '' }])),
  routes: [blankRoute()],
  top: [blankTop(), blankTop(), blankTop()],
  feedback: { self: '', coach: '' },
  rubric: Object.fromEntries(RUBRIC.map(([id]) => [id, '']))
  // answerKey: 강사 정답 키 대조 기능 자리 (docs/ROADMAP.md 참고)
});

export const changeKey = (ri, itemId) => `${ri}.${itemId}`;
export const isFlagged = c => c && c !== '유지';

// ---- 검증: 허용된 필드만 문자열로 복사 ----
const MAX = 30000;
const s = v => { if (v === undefined) return ''; if (typeof v !== 'string' || v.length > MAX) throw Error('입력값 형식이 올바르지 않습니다.'); return v; };
const pick = (src, tmpl) => {
  if (src !== undefined && (typeof src !== 'object' || src === null || Array.isArray(src))) throw Error('분석 파일 구조를 확인하세요.');
  const out = {}; for (const k of Object.keys(tmpl)) out[k] = s(src?.[k]); return out;
};
export function validateAnalysis(o) {
  if (!o || o.kind !== 'univ-analysis' || o.version !== UNIV_SCHEMA_VERSION) throw Error('대학 분석 파일이 아닙니다.');
  const b = blankAnalysis(), out = blankAnalysis();
  out.meta = pick(o.meta, b.meta);
  out.sources = Object.fromEntries(SOURCES.map(([id]) => [id, pick(o.sources?.[id], b.sources[id])]));
  if (!Array.isArray(o.routes) || o.routes.length > MAX_ROUTES) throw Error('전형 목록이 올바르지 않습니다.');
  out.routes = o.routes.map(r => {
    const t = blankRoute(), nr = { ...pick({ name: r?.name, type: r?.type, scope: r?.scope }, { name: 1, type: 1, scope: 1 }) };
    nr.items = Object.fromEntries(ITEMS.map(([id]) => [id, pick(r?.items?.[id], t.items[id])]));
    nr.result = pick(r?.result, t.result);
    return nr;
  });
  if (!Array.isArray(o.top) || o.top.length !== 3) throw Error('핵심 변화 목록이 올바르지 않습니다.');
  out.top = o.top.map(t => pick(t, blankTop()));
  out.feedback = pick(o.feedback, b.feedback);
  out.rubric = pick(o.rubric, b.rubric);
  return out;
}
