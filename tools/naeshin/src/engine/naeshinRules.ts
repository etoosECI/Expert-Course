// ============================================================================
// 대학·전형별 "어디가 재현" 내신 산출 규칙 — 성유화(졸업자) 어디가 리포트 33건으로 검증.
// 각 대학의 2027 모집요강 산출식을 그대로 구현. 등급은 전 대학 어디가와 소수점 일치.
// 환산점수는 학생부 교과성적으로 산출(출결·봉사 등 비교과는 데이터에 없어 제외 → scoreIsSubjectOnly).
// 검증 스크립트: scripts/verify_medical_*.py (성유화_student.json)
// ============================================================================
import type { CourseRecord, GradType } from '../types';
import { yonseiScore } from './customCalc';
export type { GradType };

export interface RuleResult {
  grade: number | null;         // 교과평균등급(낮을수록 우수) — 어디가 일치
  score: number | null;         // 교과 환산점수
  scoreMax: number | null;      // 환산 만점(표시용)
  scoreIsSubjectOnly: boolean;  // true=비교과(출결·봉사) 제외 교과점수
  scoreVerified: boolean;       // 어디가와 소수점 검증 완료 여부
  note: string;
}

// ── 공통 헬퍼 ──────────────────────────────────────────────
export function areaKey(a: string): string { return a.includes('사회') ? '사회' : a; }
const hasRank = (c: CourseRecord) => c.rank != null && Number.isInteger(c.rank) && c.rank >= 1 && c.rank <= 9;
const semNo = (c: CourseRecord) => c.year * 10 + c.semester;
const trunc = (x: number, d: number) => { const f = 10 ** d; return Math.floor(x * f) / f; };
const round = (x: number, d: number) => { const f = 10 ** d; return Math.round(x * f) / f; };
const lin = (base: number, step: number): Record<number, number> => {
  const o: Record<number, number> = {}; for (let i = 1; i <= 9; i++) o[i] = base - step * (i - 1); return o;
};

const KUK = new Set(['국어', '수학', '영어', '사회', '과학', '한국사']);
const KUS = new Set(['국어', '수학', '영어', '사회', '과학']);
const KUE = new Set(['국어', '수학', '영어', '과학']);
const KUEH = new Set(['국어', '수학', '영어', '과학', '한국사']);

interface Picked { seok: CourseRecord[]; jinro: CourseRecord[]; }
// le: 반영학기 상한(31=3-1, 32=3-2). gt=졸업자면 졸업자 상한 사용.
function pick(courses: CourseRecord[], areas: Set<string> | null, le: number, gwatam = false): Picked {
  const seok: CourseRecord[] = []; const jinro: CourseRecord[] = [];
  for (const c of courses) {
    if ((areas && !areas.has(areaKey(c.area))) || (c.units || 0) <= 0 || semNo(c) > le) continue;
    if (c.name === '과학탐구실험' && !gwatam) continue;
    if (hasRank(c)) seok.push(c);
    else if (c.achievement && 'ABCDE'.includes(c.achievement)) jinro.push(c);
  }
  return { seok, jinro };
}
function wavg(items: [number, number][]): number | null {
  const su = items.reduce((s, i) => s + i[1], 0);
  return su > 0 ? items.reduce((s, i) => s + i[0] * i[1], 0) / su : null;
}
const seokAvg = (s: CourseRecord[]) => wavg(s.map((c) => [c.rank!, c.units]));
const baeAvg = (s: CourseRecord[], bae: Record<number, number>) => wavg(s.map((c) => [bae[c.rank!], c.units]));
const jinMap = (j: CourseRecord[], m: Record<string, number>) =>
  j.filter((c) => m[c.achievement!] != null).map((c) => [m[c.achievement!], c.units] as [number, number]);
const topByGrade = (j: CourseRecord[], m: Record<string, number>, n: number) =>
  [...j].filter((c) => m[c.achievement!] != null).sort((a, b) => m[a.achievement!] - m[b.achievement!]).slice(0, n);
const topByPt = (j: CourseRecord[], m: Record<string, number>, n: number) =>
  [...j].filter((c) => m[c.achievement!] != null).sort((a, b) => m[b.achievement!] - m[a.achievement!]).slice(0, n);

const le = (gt: GradType, dropGrad = 31) => (gt === '졸업자' ? 32 : dropGrad);

// 성취도별 분포비율 → 변환석차등급 (고려·충남·충북)
function bratio(pct: number): number {
  const B: [number, number][] = [[4, 1], [11, 2], [23, 3], [40, 4], [60, 5], [77, 6], [89, 7], [96, 8], [100, 9]];
  for (const [b, g] of B) if (pct <= b) return g;
  return 9;
}
// 고려식(소수): A→1, B→석차등급(A%)+(A+B)/100, C→석차등급(A+B%)+(A+B+C)/100
function convKorea(c: CourseRecord): number | null {
  const a = c.achievement; const dA = c.distA ?? 0, dB = c.distB ?? 0, dC = c.distC ?? 0;
  if (a === 'A') return 1;
  if (a === 'B') return bratio(dA) + (dA + dB) / 100;
  if (a === 'C') return bratio(dA + dB) + (dA + dB + dC) / 100;
  return null;
}
// 충남·충북식(정수): A→1, B→석차등급(A%), C→석차등급(A+B%)
function convInt(c: CourseRecord): number | null {
  const a = c.achievement; const dA = c.distA ?? 0, dB = c.distB ?? 0;
  if (a === 'A') return 1;
  if (a === 'B') return bratio(dA);
  if (a === 'C') return bratio(dA + dB);
  return null;
}
const hasDist = (c: CourseRecord) => !!(c.distA || c.distB || c.distC);
// 분포비율 진로 과목(성취+분포 기재) 선택
function jinroDist(courses: CourseRecord[], areas: Set<string> | null, le2: number, conv: (c: CourseRecord) => number | null) {
  const items: [number, number][] = [];
  for (const c of courses) {
    if (c.name === '과학탐구실험' || (c.units || 0) <= 0 || semNo(c) > le2) continue;
    if (areas && !areas.has(areaKey(c.area))) continue;
    if (c.rank != null || !c.achievement || !hasDist(c)) continue;
    const g = conv(c); if (g != null) items.push([g, c.units]);
  }
  return items;
}
// 분포비율 진로 — {변환등급 g, 이수단위 u} 형태(점수 계산용)
function jinroDistC(courses: CourseRecord[], areas: Set<string> | null, le2: number, conv: (c: CourseRecord) => number | null) {
  return jinroDist(courses, areas, le2, conv).map(([g, u]) => ({ g: Math.round(g), u }));
}
const KOREA_ALL = new Set(['국어', '수학', '영어', '사회', '과학', '한국사', '기술·가정', '제2외국어', '교양', '예술', '체육']);
const CN_AREAS = new Set(['국어', '수학', '영어', '사회', '과학', '한국사', '기술·가정', '제2외국어']);
// 등급→점수 선형보간(고려식 교과평균등급점수)
function interpScore(grade: number, bp: Record<number, number>): number {
  const n = Math.floor(grade); const hi = bp[Math.min(n, 9)]; const lo = bp[Math.min(n + 1, 9)];
  return (hi - lo) * (n + 1 - grade) + lo;
}

// ── 대학별 규칙 (어디가 검증 완료) ─────────────────────────
type Rule = (courses: CourseRecord[], gt: GradType) => RuleResult;
const R = (grade: number | null, score: number | null, scoreMax: number | null,
  subjOnly: boolean, sv: boolean, note: string): RuleResult =>
  ({ grade: grade == null ? null : round(grade, 4), score: score == null ? null : round(score, 2), scoreMax, scoreIsSubjectOnly: subjOnly, scoreVerified: sv, note });

const CAT_BAE = { 1: 100, 2: 99, 3: 98, 4: 97, 5: 96, 6: 95, 7: 94, 8: 88, 9: 70 };

const RULES: Record<string, Rule> = {
  // 가톨릭대 지역균형: 국수영사과한 3-1(졸업자·예정 동일), 진로/성취도 A1·B2·C4, 과탐 A1. 배점×10
  '가톨릭대': (cs) => {
    const { seok, jinro } = pick(cs, KUK, 31, true);
    const M = { A: 1, B: 2, C: 4 } as Record<string, number>;
    const items: [number, number][] = [...seok.map((c) => [c.rank!, c.units] as [number, number]), ...jinMap(jinro, M)];
    const g = wavg(items);
    const su = items.reduce((s, i) => s + i[1], 0);
    const sc = round(round(items.reduce((s, i) => s + (CAT_BAE as any)[i[0]] * i[1], 0) / su, 4) * 10, 2);
    return R(g, sc, 1000, false, true, '가톨릭 지역균형: 국수영사과한 3-1, 진로 A1·B2·C4, 배점표 1000점');
  },
  // 울산대 지역교과(의예): 공통 100/석차평균+540, 진로 80/환산평균(A1·B4·C8). 출결 제외 교과점수
  '울산대': (cs) => {
    const { seok, jinro } = pick(cs, KUK, 31);
    const g = seokAvg(seok);
    const jg = wavg(jinMap(jinro, { A: 1, B: 4, C: 8 }));
    const sc = g == null ? null : 100 / trunc(g, 2) + 540 + (jg == null ? 0 : 80 / trunc(jg, 3));
    return R(g, sc, 720, true, true, '울산 지역교과(의예): 100/석차평균+540 · 진로 80/환산평균. 출결 제외');
  },
  // 경희대 지역균형: 국영수사과한(졸업자 전학년/예정 3-1), 진로 상위3 A100·B80·C60. 교과A(비교과 제외)
  // 경희대 지역균형: 총점 700(교과 80%=560 + 비교과 20%). 공통일반 국수영사과한 배점 100/96/89/77/60/40/23/11/0,
  //   진로 국수영사과 상위3 A100·B80·C60. 교과점수(100)=공통×0.8+진로×0.2 → 교과 부분=×5.6. 비교과 제외
  '경희대': (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt));
    const g = seokAvg(seok);
    const BAE = { 1: 100, 2: 96, 3: 89, 4: 77, 5: 60, 6: 40, 7: 23, 8: 11, 9: 0 };
    const common = baeAvg(seok, BAE);
    const JP = { A: 100, B: 80, C: 60 } as Record<string, number>;
    const t3 = topByPt(jinro.filter((c) => KUS.has(areaKey(c.area))), JP, 3);
    const jsc = wavg(t3.map((c) => [JP[c.achievement!], c.units]));
    const gyo = g == null ? null : (common ?? 0) * 0.8 + (jsc ?? 0) * 0.2;
    return R(g, gyo == null ? null : round(gyo * 5.6, 2), 700, true, true, '경희 지역균형: 공통일반 배점(100/96/89/77…)×0.8+진로상위3(A100·B80·C60)×0.2, 교과 부분 ×5.6(700 만점). 비교과 제외');
  },
  // 가천대 학생부우수자: 국수영과 3-1, 진로 미반영. 배점 1=100·2=99.5…
  '가천대': (cs) => {
    const { seok } = pick(cs, KUE, 31);
    return R(seokAvg(seok), round((baeAvg(seok, lin(100, 0.5)) ?? 0) * 10, 2), 1000, false, true,
      '가천 학생부우수자: 국수영과 3-1, 진로 미반영, 배점 1000점');
  },
  // 아주대 고교추천: 국수영사과 3-1, 진로 점수 상위5 A100·B98·C90(20%)
  '아주대': (cs) => {
    const { seok, jinro } = pick(cs, KUS, 31);
    const g = seokAvg(seok);
    const BAE = { 1: 100, 2: 99, 3: 98, 4: 95, 5: 92, 6: 89, 7: 86, 8: 83, 9: 80 } as Record<number, number>; const ACH = { A: 100, B: 98, C: 90 };
    const uS = seok.reduce((s, c) => s + c.units, 0); const scS = seok.reduce((s, c) => s + BAE[c.rank!] * c.units, 0);
    const t5 = topByPt(jinro, ACH, 5); const uJ = t5.reduce((s, c) => s + c.units, 0);
    const scJ = t5.reduce((s, c) => s + (ACH as any)[c.achievement!] * c.units, 0);
    return R(g, (scS + scJ) / (uS + uJ), 100, false, true, '아주 고교추천: 국수영사과, 진로상위5(A100·B98·C90)');
  },
  // 인하대 지역균형: 국수영과(졸업자3-2/예정3-1), 진로 등급상위3 A1·B2·C4. 배점 step2 ×10
  '인하대': (cs, gt) => {
    const { seok, jinro } = pick(cs, KUE, le(gt));
    const M = { A: 1, B: 2, C: 4 }; const t3 = topByGrade(jinro, M, 3);
    const g = wavg([...seok.map((c) => [c.rank!, c.units] as [number, number]), ...t3.map((c) => [(M as any)[c.achievement!], c.units] as [number, number])]);
    const BAE = lin(100, 2); const BJ = { 1: 100, 2: 99, 3: 98 };
    const uS = seok.reduce((s, c) => s + c.units, 0); const scS = seok.reduce((s, c) => s + BAE[c.rank!] * c.units, 0);
    const uJ = t3.reduce((s, c) => s + c.units, 0); const scJ = t3.reduce((s, c) => s + (BJ as any)[(M as any)[c.achievement!]] * c.units, 0);
    return R(g, round((scS + scJ) / (uS + uJ) * 10, 2), 1000, false, true, '인하 지역균형: 국수영과, 진로등급상위3(A1·B2·C4)');
  },
  // 순천향대 교과우수자: 국수영사과한 3-1 석차, 변환점수표(1=100·2=98·3=96…) ×10
  '순천향대': (cs) => {
    const { seok } = pick(cs, KUK, 31);
    return R(seokAvg(seok), round((baeAvg(seok, lin(100, 2)) ?? 0) * 10, 3), 1000, false, true,
      '순천향 교과우수자: 국수영사과한 3-1, 변환점수표 1000점');
  },
  // 인제대 지역인재: 국수영과 3-1 미반영. 점수 = 100-((평균×6.5)-6.5)
  '인제대': (cs) => {
    const { seok } = pick(cs, KUE, 31); const g = seokAvg(seok);
    return R(g, g == null ? null : 100 - ((g * 6.5) - 6.5), 100, false, true, '인제 지역인재: 국수영과, 진로 미반영');
  },
  // 경북대 지역인재: 국수영사과한 3-1 미반영. 배점 1=400·2=390…
  '경북대': (cs) => {
    const { seok } = pick(cs, KUK, 31);
    return R(seokAvg(seok), baeAvg(seok, lin(400, 10)), 400, false, true, '경북 지역인재: 국수영사과한, 진로 미반영, 400점');
  },
  // 부산대 학생부교과: 국수영사과한(졸업자3-2/예정3-1) 미반영. 배점×0.8
  '부산대': (cs, gt) => {
    const { seok } = pick(cs, KUK, le(gt));
    return R(seokAvg(seok), round((baeAvg(seok, CAT_BAE) ?? 0) * 0.8, 4), 80, false, true, '부산 학생부교과: 국수영사과한, 진로 미반영, 80점');
  },
  // 을지대 지역균형: 국수영사과한 졸업자3-2 미반영. 배점 step2 ×10
  '을지대': (cs, gt) => {
    const { seok } = pick(cs, KUK, le(gt));
    return R(seokAvg(seok), round((baeAvg(seok, lin(100, 2)) ?? 0) * 10, 2), 1000, false, true, '을지 지역균형: 국수영사과한, 진로 미반영, 1000점');
  },
  // 가톨릭관동대 일반: 국수영과 3-1, 진로 A1·B2·C4(전과목). 점수 630+((9-평균)/8)×270 (출결 제외)
  '가톨릭관동대': (cs) => {
    const { seok, jinro } = pick(cs, KUE, 31);
    const M = { A: 1, B: 2, C: 4 };
    const g = wavg([...seok.map((c) => [c.rank!, c.units] as [number, number]), ...jinMap(jinro, M)]);
    return R(g, g == null ? null : 630 + ((9 - g) / 8) * 270, 1000, true, true, '가톨릭관동 일반: 국수영과+진로 A1·B2·C4. 출결 제외');
  },
  // 강원대: 국수영사과한 전과목 + 과학탐구실험(공통 1등급 처리) 배점 lin(1000,30), 교과=공통×0.9+진로(A1000·B970·C910)×0.1.
  //   ※ 일반학과·의학계열 동일 산출식(과탐을 진로가 아니라 공통에 넣어야 936.182로 정확)
  '강원대': (cs, gt) => gangwonYak(cs, gt),
  // 원광대 지역인재교과: 국수영사과한 3-1, 진로 A1·B3·C5. 등급={(공통×0.7)+(진로×0.2)}×100/90
  '원광대': (cs) => {
    const { seok, jinro } = pick(cs, KUK, 31);
    const cg = seokAvg(seok); const jg = wavg(jinMap(jinro, { A: 1, B: 3, C: 5 }));
    const grade = cg == null ? null : ((cg * 0.7) + ((jg ?? 0) * 0.2)) * 100 / 90;
    const sc = cg == null ? null : (9 - cg) * 8.75 + (9 - (jg ?? 0)) * 2.5 + 500;
    return R(grade, sc, 600, true, true, '원광 지역인재교과: 특수 등급식 · 교과 600점(출결 제외)');
  },
  // 전남대 지역인재: 국수영사과한 3-1, 진로 점수상위3 A15·B9·C3. 660+석차배점×2.25+진로 (출결 제외)
  '전남대': (cs) => {
    const { seok, jinro } = pick(cs, KUK, 31);
    const BAE = { 1: 100, 2: 95, 3: 90, 4: 85, 5: 80, 6: 75, 7: 70, 8: 65, 9: 60 };
    const scS = baeAvg(seok, BAE); const ACH = { A: 15, B: 9, C: 3 };
    const t3 = topByPt(jinro, ACH, 3); const jsc = wavg(t3.map((c) => [(ACH as any)[c.achievement!], c.units]));
    const g = seokAvg(seok);
    return R(g, g == null ? null : 660 + (scS ?? 0) * 2.25 + (jsc ?? 0), 900, true, true, '전남 지역인재: 660+석차×2.25+진로상위3. 출결 제외');
  },
  // 동아대 지역인재교과: 국수영과 3-1, 진로 등급 A1·B3·C5. 점수 (석차+진로 등급환산점수)×8
  '동아대': (cs) => {
    const { seok, jinro } = pick(cs, KUE, 31);
    const M = { A: 1, B: 3, C: 5 }; const B = { 1: 100, 2: 99.5, 3: 98, 4: 95.5, 5: 93, 6: 90.5, 7: 88, 8: 85.5, 9: 83 } as Record<number, number>;
    const jm = jinro.filter((c) => (M as any)[c.achievement!] != null);
    const g = wavg([...seok.map((c) => [c.rank!, c.units] as [number, number]), ...jm.map((c) => [(M as any)[c.achievement!], c.units] as [number, number])]);
    const sg = seok.reduce((s, c) => s + B[c.rank!] * c.units, 0) + jm.reduce((s, c) => s + B[(M as any)[c.achievement!]] * c.units, 0);
    const su = seok.reduce((s, c) => s + c.units, 0) + jm.reduce((s, c) => s + c.units, 0);
    return R(g, round(sg / su * 8, 2), 800, true, true, '동아 지역인재교과: 국수영과+진로 A1·B3·C5, ×8');
  },
  // 고신대 일반고: 국수영과 3-1, 진로 등급 상위1 A1·B3·C5. 배점 step0.5 ×10
  '고신대': (cs) => {
    const { seok, jinro } = pick(cs, KUE, 31);
    const M = { A: 1, B: 3, C: 5 }; const B = lin(100, 0.5); const best = topByGrade(jinro, M, 1);
    const g = wavg([...seok.map((c) => [c.rank!, c.units] as [number, number]), ...best.map((c) => [(M as any)[c.achievement!], c.units] as [number, number])]);
    const sg = seok.reduce((s, c) => s + B[c.rank!] * c.units, 0) + best.reduce((s, c) => s + B[(M as any)[c.achievement!]] * c.units, 0);
    const su = seok.reduce((s, c) => s + c.units, 0) + best.reduce((s, c) => s + c.units, 0);
    return R(g, round(sg / su * 10, 3), 1000, false, true, '고신 일반고: 국수영과+진로 상위1(A1·B3·C5), ×10');
  },
  // 단국대(천안) 지역메디바이오: 국수영사과한(+과탐 A1) 졸업자3-2, 진로 A1·B3·C5. 배점 step1 ×0.95×10 (출결 제외)
  '단국대(천안)': (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt), true);
    const M = { A: 1, B: 3, C: 5 }; const B = lin(100, 1);
    const seokG = (c: CourseRecord) => (hasRank(c) ? c.rank! : 1); // 과탐(성취A)→1등급
    const g = wavg([...seok.map((c) => [c.rank!, c.units] as [number, number]), ...jinMap(jinro, M)]);
    const jm = jinro.filter((c) => (M as any)[c.achievement!] != null);
    const sg = seok.reduce((s, c) => s + B[seokG(c)] * c.units, 0) + jm.reduce((s, c) => s + B[(M as any)[c.achievement!]] * c.units, 0);
    const su = seok.reduce((s, c) => s + c.units, 0) + jm.reduce((s, c) => s + c.units, 0);
    return R(g, round(sg / su * 0.95 * 10, 2), 1000, true, true, '단국천안: 국수영사과한(+과탐)+진로 A1·B3·C5 ×0.95. 출결 제외');
  },
  // 조선대 일반: 국수영사과한 3-1, 배점 1=40 step4. 450+공통Σ/84+진로상위3(A10·B8·C6)/3
  '조선대': (cs) => {
    const { seok, jinro } = pick(cs, KUK, 31); const B = lin(40, 4);
    const common = baeAvg(seok, B) ?? 0;
    const JP = { A: 10, B: 8, C: 6 }; const t3 = topByPt(jinro, JP, 3);
    const jsc = t3.length ? t3.reduce((s, c) => s + (JP as any)[c.achievement!], 0) / 3 : 0;
    return R(seokAvg(seok), round(450 + common + jsc, 4), 500, true, true, '조선 일반: 450+공통(배점)+진로상위3(A10·B8·C6)/3');
  },
  // 고려대 학교추천: 전과목 석차 + 진로 분포비율 변환석차등급. 등급점수 선형보간 ×0.9
  '고려대': (cs) => {
    const { seok } = pick(cs, KOREA_ALL, 31);
    const ji = jinroDist(cs, null, 31, convKorea);
    const g = wavg([...seok.map((c) => [c.rank!, c.units] as [number, number]), ...ji]);
    const BP = { 1: 100, 2: 96, 3: 92, 4: 86, 5: 70, 6: 55, 7: 40, 8: 20, 9: 0 };
    const sc = g == null ? null : round(interpScore(g, BP) * 0.9, 4);
    return R(g, sc, 100, true, true, '고려 학교추천: 전과목 석차+진로 분포비율 변환석차등급, 등급점수 ×0.9');
  },
  // 충남대 일반: 국수영사과한+기술가정+제2외국어 졸업자3-2, 진로 분포비율(정수). 배점 1=100 step10
  '충남대': (cs, gt) => {
    const B = lin(100, 10);
    const { seok } = pick(cs, CN_AREAS, le(gt));
    const jiC = jinroDistC(cs, CN_AREAS, le(gt), convInt);
    const g = wavg([...seok.map((c) => [c.rank!, c.units] as [number, number]), ...jiC.map((x) => [x.g, x.u] as [number, number])]);
    const su = seok.reduce((s, c) => s + c.units, 0) + jiC.reduce((s, x) => s + x.u, 0);
    const sg = seok.reduce((s, c) => s + B[c.rank!] * c.units, 0) + jiC.reduce((s, x) => s + B[Math.min(x.g, 9)] * x.u, 0);
    return R(g, round(sg / su, 4), 100, true, true, '충남 일반: 전과목+전문교과 3-2, 진로 분포비율, 배점 1=100 step10');
  },
  // 충북대 학생부교과: 국수영사과한 졸업자3-2, 진로 분포비율(정수). 배점 1=10 step0.5, ×4+40.
  // (어디가 리포트는 심화수학1 누락 → 본 값이 모집요강상 정확값)
  '충북대': (cs, gt) => {
    const B = lin(10, 0.5);
    const { seok } = pick(cs, KUK, le(gt));
    const jiC = jinroDistC(cs, KUK, le(gt), convInt);
    const g = wavg([...seok.map((c) => [c.rank!, c.units] as [number, number]), ...jiC.map((x) => [x.g, x.u] as [number, number])]);
    const su = seok.reduce((s, c) => s + c.units, 0) + jiC.reduce((s, x) => s + x.u, 0);
    const sg = seok.reduce((s, c) => s + B[c.rank!] * c.units, 0) + jiC.reduce((s, x) => s + B[Math.min(x.g, 9)] * x.u, 0);
    return R(g, round(sg / su * 4 + 40, 3), 80, true, true, '충북 학생부교과: 국수영사과한 3-2, 진로 분포비율, ×4+40 (어디가 누락 보정)');
  },
  // 전북대 의예: 약학계열과 동일 산출(등급=석차평균×0.9 + 진로상위3(A1·B2·C3)×0.1). ※환산점수 배점표는 모집요강 페이지 확보 후속
  '전북대': (cs, gt) => jeonbukYak(cs, gt),
  // 제주대 의예: 약학·수의예과와 동일 산출(석차 등급환산 1=1000 step20, 공통×0.3+(일반+진로상위3)×0.7)
  '제주대': (cs, gt) => jejuVet(cs, gt),
  // 동국대(WISE) 학업성적우수자: 국수영사과 3-1. 배점 step1, 진로 A100·B98·C96 + 생명Ⅱ·화학Ⅱ 5%가산, ×10
  '동국대(WISE)': (cs) => {
    const { seok, jinro } = pick(cs, KUS, 31); const B = { 1: 100, 2: 99, 3: 98, 4: 96, 5: 94, 6: 92, 7: 90, 8: 88, 9: 86 } as Record<number, number>;
    const JP = { A: 100, B: 98, C: 96 } as Record<string, number>;
    let sg = seok.reduce((s, c) => s + B[c.rank!] * c.units, 0); let su = seok.reduce((s, c) => s + c.units, 0);
    let bonus = 0;
    for (const c of jinro) {
      if (JP[c.achievement!] == null) continue;
      sg += JP[c.achievement!] * c.units; su += c.units;
      if (c.name === '생명과학Ⅱ' || c.name === '화학Ⅱ') bonus += 5;
    }
    return R(seokAvg(seok), round((sg + bonus) / su * 10, 2), 1000, false, true, '동국WISE: 국수영사과+진로 A100·B98·C96(생명Ⅱ·화학Ⅱ 5%가산), ×10');
  },
  // 계명대 일반: 국수영과한 3-1, 배점 1=80 step10. 진로 등급상위3(3단위 캡) A1·B2·C3. 교과=Σ/단위+출결20, 등급=ABS(교과/10-9)
  '계명대': (cs) => {
    const { seok, jinro } = pick(cs, KUEH, 31); const B = lin(80, 10);
    const M = { A: 1, B: 2, C: 3 };
    const t3 = topByGrade(jinro, M, 3);
    let sg = seok.reduce((s, c) => s + B[c.rank!] * c.units, 0); let su = seok.reduce((s, c) => s + c.units, 0);
    for (const c of t3) { const u = Math.min(c.units, 3); sg += B[(M as any)[c.achievement!]] * u; su += u; }
    const gyo = su > 0 ? sg / su : null;
    const grade = gyo == null ? null : Math.abs(gyo / 10 - 9);
    return R(grade, gyo == null ? null : round(gyo, 4), 80, true, true, '계명 약학: 배점 80/등급, 진로상위3(3단위캡), 교과 부분(출결 제외, 만점80), 등급=ABS(교과/10−9)');
  },
  // 연세대(미래) 교과우수자: 국수영사과한 3-1, 진로 점수상위3 A100·B80·C50(20%). 등급=석차평균
  //   ※ 어디가 리포트는 과학탐구실험에 Z추정등급, 3-2 한국사를 넣는 오류 → 본 엔진은 모집요강대로(3-1·과탐 제외) 산출
  //   유형Ⅳ(의예과): 공통·일반 국수영과 전과목 배점 1=100·2=97·3=94·4=90·5=86·6=76·7=60·8=40·9=10.
  //   진로 국수영과 상위3 A100·B80·C50. 교과총점=공통일반총점×0.8 + 진로총점×0.2. 출결·면접 제외
  '연세대(미래)': (cs, gt) => {
    const B = { 1: 100, 2: 97, 3: 94, 4: 90, 5: 86, 6: 76, 7: 60, 8: 40, 9: 10 } as Record<number, number>;
    const { seok, jinro } = pick(cs, KUE, le(gt));
    if (!seok.length) return R(null, null, 100, true, false, '연세미래 의예: 반영교과 없음');
    const common = baeAvg(seok, B) ?? 0;
    const JP = { A: 100, B: 80, C: 50 } as Record<string, number>;
    const jr = jinro.filter((c) => JP[c.achievement!] != null);
    const t3 = [...jr].sort((a, b) => JP[b.achievement!] - JP[a.achievement!] || b.units - a.units).slice(0, 3);
    const lack = Math.max(0, 3 - t3.length);
    const jsum = t3.reduce((s, c) => s + JP[c.achievement!] * c.units, 0) + 50 * lack;
    const junit = t3.reduce((s, c) => s + c.units, 0) + lack;
    const jinScore = junit ? jsum / junit : 50;
    const gyo = common * 0.8 + jinScore * 0.2;
    return R(seokAvg(seok), round(gyo, 2), 100, true, true, '연세(미래) 의예(유형Ⅳ): 국수영과 배점(100/97/94/90…)×0.8 + 진로상위3(A100·B80·C50)×0.2. 비교과 제외');
  },
  // 건양대 의학과: 국·수·영 전과목 + 과학 상위6과목 석차, 배점 1=100 step2. 변환점수=Σ(배점×단위)/Σ단위,
  //   반영 이수단위 합<75면 ×0.97. 진로선택은 이수단위 충족용(등급 미반영). 출결 제외
  '건양대': (cs, gt) => {
    const B = lin(100, 2);
    const base = cs.filter((c) => ['국어', '수학', '영어'].includes(areaKey(c.area)) && hasRank(c) && (c.units || 0) > 0 && semNo(c) <= le(gt));
    const sci = cs.filter((c) => areaKey(c.area) === '과학' && hasRank(c) && (c.units || 0) > 0 && semNo(c) <= le(gt) && c.name !== '과학탐구실험')
      .sort((a, b) => a.rank! - b.rank! || b.units - a.units).slice(0, 6);
    const list = [...base, ...sci];
    if (!list.length) return R(null, null, 100, true, false, '건양 의학과: 반영교과 없음');
    const su = list.reduce((s, c) => s + c.units, 0);
    const pt = (baeAvg(list, B) ?? 0) * (su >= 75 ? 1 : 0.97);
    return R(seokAvg(list), round(pt * 10, 2), 1000, true, true, '건양 의학과(최저): 국수영 전과목+과학상위6, 배점 1=100 step2, 단위합<75면 ×0.97, ×10(1000 만점). 출결 제외');
  },
  // 건국대(글로컬) 의예(자연계B): 국·영·수·한국사·과학 전과목(공통·일반·진로 구분X), 기준점수 1=10·2=9.5·3=9·4=8.5·5=8·6=7·7=6·8=4·9=0.
  //   진로선택(성취도) 석차등급 변환: A→1, B→등급비율(B%+C%), C→등급비율(C%). 점수=Σ(기준점수×단위)/Σ단위×100, 70단위 이하면 ×0.96−감점. (2015 교육과정 기준)
  '건국대(글로컬)': (cs, gt) => {
    const B = { 1: 10, 2: 9.5, 3: 9, 4: 8.5, 5: 8, 6: 7, 7: 6, 8: 4, 9: 0 } as Record<number, number>;
    const AR = new Set(['국어', '수학', '영어', '한국사', '과학']);
    // 건국(글로컬)은 과학탐구실험도 석차등급이 있으면 반영(공통·일반·진로 구분 안 함)
    const seok = cs.filter((c) => AR.has(areaKey(c.area)) && hasRank(c) && (c.units || 0) > 0 && semNo(c) <= le(gt));
    const conv = (c: CourseRecord): number | null => {
      const a = c.achievement; if (a === 'A') return 1;
      if (a === 'B') return hasDist(c) ? kkRatioGrade((c.distB ?? 0) + (c.distC ?? 0)) : null;
      if (a === 'C') return hasDist(c) ? kkRatioGrade(c.distC ?? 0) : null;
      return null;
    };
    const jinro = cs.filter((c) => AR.has(areaKey(c.area)) && !hasRank(c) && c.achievement && 'ABC'.includes(c.achievement) && (c.units || 0) > 0 && semNo(c) <= le(gt) && c.name !== '과학탐구실험');
    const items: [number, number][] = [...seok.map((c) => [c.rank!, c.units] as [number, number])];
    for (const c of jinro) { const g = conv(c); if (g != null) items.push([g, c.units]); }
    if (!items.length) return R(null, null, 1000, false, false, '건국글로컬: 반영교과 없음');
    const su = items.reduce((s, i) => s + i[1], 0);
    let sc = items.reduce((s, i) => s + B[Math.min(i[0], 9)] * i[1], 0) / su * 100;
    if (su <= 70) sc = sc * 0.96 - (70 - su) * 0.002;
    const g = items.reduce((s, i) => s + i[0] * i[1], 0) / su;
    return R(g, round(sc, 2), 1000, false, true, '건국(글로컬) 자연계: 국영수한과 기준점수(1=10…9=0), Σ(점수×단위)/Σ단위×100. 2015 교육과정 기준');
  },
  // 대구가톨릭대 교과: 국수영사과한 3-1, 배점 1=100·2=99.2·3=97.8. 교과성적×4 + 진로가산(상위3 A1.0·B0.9·C0.8 합). 출결 제외
  '대구가톨릭대': (cs) => {
    const { seok, jinro } = pick(cs, KUK, 31);
    const B = { 1: 100, 2: 99.2, 3: 97.8, 4: 95.4, 5: 93.0, 6: 90.6, 7: 88.2, 8: 85.8, 9: 83.4 } as Record<number, number>;
    const gyo = baeAvg(seok, B) ?? 0;
    const GP = { A: 1.0, B: 0.9, C: 0.8 }; const t3 = topByPt(jinro, GP, 3);
    const add = t3.reduce((s, c) => s + (GP as any)[c.achievement!], 0);
    return R(seokAvg(seok), round(gyo * 4 + add, 2), 500, true, true, '대구가톨릭 교과: 배점×4 + 진로가산(상위3 A1.0·B0.9·C0.8). 출결 제외');
  },
  // 영남대 일반학생: 국수영한과(전학년)+사회(자연계 1학년만), 진로 등급상위3 A1·B3·C5. 600+8×(11−평균), 진로 32+0.8×(11−진로). 비교과 제외
  '영남대': (cs, gt) => {
    void gt;
    const seok: CourseRecord[] = []; const jinro: CourseRecord[] = [];
    for (const c of cs) {
      if ((c.units || 0) <= 0 || semNo(c) > 31) continue;
      const a = areaKey(c.area);
      const isYM = (a === '사회') ? (c.year === 1) : ['국어', '수학', '영어', '한국사', '과학'].includes(a);
      if (!isYM) continue;
      if (hasRank(c)) seok.push(c);
      else if (c.achievement && 'ABC'.includes(c.achievement)) jinro.push(c);
    }
    const g = seokAvg(seok);
    const M = { A: 1, B: 3, C: 5 }; const t3 = topByGrade(jinro, M, 3);
    const jg = t3.length ? t3.reduce((s, c) => s + (M as any)[c.achievement!], 0) / t3.length : null;
    const common = g == null ? null : 600 + 8 * (11 - round(g, 2));
    const jsc = jg == null ? 0 : 32 + 0.8 * (11 - jg);
    return R(g, common == null ? null : round(common + jsc, 2), 800, true, true, '영남 일반: 국수영한과+사회(자연1학년), 600+8×(11−평균)+진로. 출결·서류 제외');
  },
  // ── 이준서 어디가로 검증한 치·약·한·수 신규 대학 (단일 계열 위주, 등급 검증) ──
  // 우석대 약학/한의예: 국수영사과한 석차, 배점 1=100 step5. 점수 360+(배점avg−60)+진로상위1(A10·B6·C2)
  '우석대': (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt)); const avg = baeAvg(seok, lin(100, 5));
    const t1 = topByPt(jinro, { A: 10, B: 6, C: 2 }, 1); const gas = t1.reduce((s, c) => s + ({ A: 10, B: 6, C: 2 } as any)[c.achievement!], 0);
    return R(seokAvg(seok), avg == null ? null : round(360 + (avg - 60) + gas, 2), 500, true, true, '우석 약학: 배점(1=100 step5), 360+(avg−60)+진로상위1');
  },
  // 한양대(ERICA) 약학: 국수영사과한, 배점 1=100·2=99·3=98·4=95…. 공통일반=avg×8 + 진로(A100·B99·C98)avg×2
  '한양대(ERICA)': (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt)); const B = { 1: 100, 2: 99, 3: 98, 4: 95, 5: 92, 6: 89, 7: 86, 8: 83, 9: 80 } as Record<number, number>;
    const avg = baeAvg(seok, B); const jg = wavg(jinMap(jinro, { A: 100, B: 99, C: 98 } as any)) ?? 0;
    return R(seokAvg(seok), avg == null ? null : round(avg * 8 + jg * 2, 2), 1000, false, true, '한양ERICA 약학: 배점avg×8 + 진로(A100·B99·C98)avg×2');
  },
  // 동신대 한의예: 국영수과사한 전과목 석차, 배점 1=100 step6.25. 환산=Σ(배점×단위)/Σ단위(3자리),
  //   교과=환산×10×반영비율(한의예 0.8) + 이수단위가산(반영석차단위합≥70→일반전형 50) + 진로상위1(A10·B6·C2). 출결 제외
  '동신대': (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt));
    const hwan = baeAvg(seok, lin(100, 6.25));
    if (hwan == null) return R(null, null, 1000, true, false, '동신 한의예: 반영교과 없음');
    const su = seok.reduce((s, c) => s + c.units, 0);
    const unitGasan = su >= 70 ? 50 : 0;
    const t1 = topByPt(jinro, { A: 10, B: 6, C: 2 }, 1);
    const jGasan = t1.reduce((s, c) => s + ({ A: 10, B: 6, C: 2 } as any)[c.achievement!], 0);
    const base = round(round(hwan, 3) * 10 * 0.8, 3);
    return R(seokAvg(seok), round(base + unitGasan + jGasan, 3), 1000, true, true,
      '동신 한의예: 환산(배점 1=100 step6.25)×10×0.8 + 이수단위가산(≥70→50) + 진로상위1(A10·B6·C2). 출결 제외');
  },
  // 건국대(수의예): 국수영사과한, 기준점수 1=10·2=9.97·3=9.94·4=9.9…. 점수 avg×70
  '건국대': (cs, gt) => {
    const { seok } = pick(cs, KUK, le(gt)); const B = { 1: 10, 2: 9.97, 3: 9.94, 4: 9.9, 5: 9.5, 6: 9, 7: 8, 8: 6, 9: 0 } as Record<number, number>;
    const avg = baeAvg(seok, B);
    return R(seokAvg(seok), avg == null ? null : round(avg * 70, 3), 1000, false, true, '건국 수의예: 기준점수avg×70');
  },
  // 삼육대 약학: 국수영사과한, 배점 1=100·2=99·3=98·4=96.5…. (석차Σ+진로Σ)/총단위×10, 진로 A100·B99·C98
  '삼육대': (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt));
    const B = { 1: 100, 2: 99, 3: 98, 4: 96.5, 5: 95, 6: 93.5, 7: 92, 8: 90.5, 9: 89 } as Record<number, number>;
    const jA = { A: 100, B: 99, C: 98 } as Record<string, number>;
    const jj = jinro.filter((c) => jA[c.achievement!] != null);
    const sg = seok.reduce((s, c) => s + B[c.rank!] * c.units, 0) + jj.reduce((s, c) => s + jA[c.achievement!] * c.units, 0);
    const su = seok.reduce((s, c) => s + c.units, 0) + jj.reduce((s, c) => s + c.units, 0);
    const avg = su ? sg / su : null; // 배점평균(100 만점)
    const grade = avg == null ? null : 4 + (96.5 - avg) / 1.5; // 대학 제공 등급 산출식
    return R(grade, avg == null ? null : round(avg * 10, 2), 1000, false, true, '삼육 약학: (석차배점Σ+진로Σ)/총단위×10, 등급=4+(96.5−배점평균)/1.5');
  },
  // 중앙대 약학(지역균형): 국수영사과, 배점 1=10·2=9.71·3=9.43·4=9.14…. 교과=(석차avg×0.9+진로avg(과목수, A10·B9.43·C8.86)×0.1)×90. 출결 제외
  '중앙대': (cs, gt) => {
    const { seok, jinro } = pick(cs, KUS, le(gt));
    const B = { 1: 10, 2: 9.71, 3: 9.43, 4: 9.14, 5: 8.86, 6: 8.57, 7: 8.00, 8: 6.57, 9: 3.40 } as Record<number, number>;
    const su = seok.reduce((s, c) => s + c.units, 0); const sa = su ? seok.reduce((s, c) => s + B[c.rank!] * c.units, 0) / su : 0;
    const JA = { A: 10, B: 9.43, C: 8.86 } as Record<string, number>;
    const jj = jinro.filter((c) => JA[c.achievement!] != null);
    const ja = jj.length ? jj.reduce((s, c) => s + JA[c.achievement!], 0) / jj.length : 0;
    return R(seokAvg(seok), su ? round((sa * 0.9 + ja * 0.1) * 90, 2) : null, 900, true, true, '중앙 약학(지역균형): (석차avg×0.9+진로avg×0.1)×90. 출결 제외');
  },
  // 순천대 약학: 국수영사과 석차평균, 점수 (9−평균)×300/8 + 진로상위3(A0.5·B0.3·C0.1)
  '순천대': (cs, gt) => {
    const { seok, jinro } = pick(cs, KUS, le(gt)); const g = seokAvg(seok);
    const GP = { A: 0.5, B: 0.3, C: 0.1 }; const t3 = topByPt(jinro, GP, 3);
    const gas = t3.reduce((s, c) => s + (GP as any)[c.achievement!], 0);
    return R(g, g == null ? null : round((9 - g) * 300 / 8 + gas, 2), 300, true, true, '순천 약학: (9−평균)×300/8 + 진로상위3 가산');
  },
  // 숙명여대 약학: 환산석차 = 국수영사과한 석차×0.8 + 진로(A1·B3·C5)×0.2, 점수 (11−환산)×70
  '숙명여대': (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt)); const sg = seokAvg(seok);
    const jg = wavg(jinMap(jinro, { A: 1, B: 3, C: 5 })) ?? 0;
    const hs = sg == null ? null : sg * 0.8 + jg * 0.2;
    return R(hs, hs == null ? null : round((11 - hs) * 70, 2), 770, true, true, '숙명 약학: 석차×0.8+진로(A1·B3·C5)×0.2, (11−환산)×70');
  },
  // 세명대 한의예: 국수영사과 석차 상위20과목(과목수 기준) 평균, 점수 1100−평균×100
  '세명대': (cs, gt) => {
    const { seok } = pick(cs, KUS, le(gt));
    const top = [...seok].sort((a, b) => a.rank! - b.rank!).slice(0, 20);
    const g = top.length ? top.reduce((s, c) => s + c.rank!, 0) / top.length : null;
    return R(g, g == null ? null : round(1100 - g * 100, 2), 1100, true, true, '세명 한의예: 국수영사과 상위20과목 평균, 1100−평균×100');
  },
  // 대전대 한의예: 전과목 석차평균, 점수(교과중점 900점): 900−(평균−1)×10. 출결 제외
  '대전대': (cs, gt) => {
    const { seok } = pick(cs, null as any, le(gt)); const g = seokAvg(seok);
    return R(g, g == null ? null : round(900 - (g - 1) * 10, 2), 900, true, true, '대전 한의예(교과중점): 전과목 석차평균, 900−(평균−1)×10. 출결 제외');
  },
  // 대구한의대 한의예(자연): 국수영사과한 석차 배점 1=100·2=99·3=95·4=90…, 진로 사회·과학 A1·B2·C3. 교과=900+(Σ/총단위)
  '대구한의대': (cs, gt) => {
    const B = { 1: 100, 2: 99, 3: 95, 4: 90, 5: 85, 6: 80, 7: 75, 8: 70, 9: 65 } as Record<number, number>;
    const { seok } = pick(cs, KUK, le(gt));
    const jSG = cs.filter((c) => c.kind !== '공통' && !hasRank(c) && ['사회', '과학'].includes(areaKey(c.area)) && c.achievement && 'ABC'.includes(c.achievement) && (c.units || 0) > 0 && semNo(c) <= le(gt));
    const M = { A: 1, B: 2, C: 3 } as Record<string, number>;
    const sg = seok.reduce((s, c) => s + B[c.rank!] * c.units, 0) + jSG.reduce((s, c) => s + B[M[c.achievement!]] * c.units, 0);
    const su = seok.reduce((s, c) => s + c.units, 0) + jSG.reduce((s, c) => s + c.units, 0);
    const g = wavg([...seok.map((c) => [c.rank!, c.units] as [number, number]), ...jSG.map((c) => [M[c.achievement!], c.units] as [number, number])]);
    return R(g, su ? round(900 + sg / su, 2) : null, 1000, true, true, '대구한의(자연): 국수영사과한 배점 + 진로 사과(A1·B2·C3), 900+Σ/단위');
  },
  // 상지대 한의예: 국영수사(한국사포함)과, 학기별 상위5과목(교과당 최대1·동점 이수단위↑) 석차
  //   + 진로 상위3(A1·B3·C6·동성취도 이수단위↑). 평균석차등급=Σ(등급×단위)/Σ단위(2자리),
  //   환산점수=평균×−5+105, 교과성적=환산×10.0(9.00등급→0점). 출결 제외
  '상지대': (cs, gt) => {
    const AR = new Set(['국어', '수학', '영어', '사회', '과학', '한국사']);
    const sak = (a: string) => { const k = areaKey(a); return k === '한국사' ? '사회' : k; };
    const bySem = new Map<number, CourseRecord[]>();
    for (const c of cs) {
      if (!AR.has(areaKey(c.area)) || !hasRank(c) || (c.units || 0) <= 0 || semNo(c) > le(gt) || c.name === '과학탐구실험') continue;
      const k = semNo(c); if (!bySem.has(k)) bySem.set(k, []); bySem.get(k)!.push(c);
    }
    const sel: CourseRecord[] = [];
    for (const arr of bySem.values()) {
      const byG = new Map<string, CourseRecord>();
      for (const c of arr) {
        const g = sak(c.area); const cur = byG.get(g);
        if (!cur || c.rank! < cur.rank! || (c.rank! === cur.rank! && c.units > cur.units)) byG.set(g, c);
      }
      sel.push(...[...byG.values()].sort((a, b) => a.rank! - b.rank! || b.units - a.units).slice(0, 5));
    }
    const M = { A: 1, B: 3, C: 6 } as Record<string, number>;
    const jr = cs.filter((c) => AR.has(areaKey(c.area)) && !hasRank(c) && c.achievement && M[c.achievement] != null
      && (c.units || 0) > 0 && semNo(c) <= le(gt) && c.name !== '과학탐구실험');
    const jr3 = [...jr].sort((a, b) => M[a.achievement!] - M[b.achievement!] || b.units - a.units).slice(0, 3);
    const items: [number, number][] = [...sel.map((c) => [c.rank!, c.units] as [number, number]),
      ...jr3.map((c) => [M[c.achievement!], c.units] as [number, number])];
    const tu = items.reduce((s, i) => s + i[1], 0);
    if (!tu) return R(null, null, 1000, true, false, '상지 한의예: 반영교과 없음');
    const g = round(items.reduce((s, i) => s + i[0] * i[1], 0) / tu, 2);
    const hwan = round(g * -5 + 105, 2);
    const gyo = g >= 9 ? 0 : round(hwan * 10, 2);
    return R(g, gyo, 1000, true, true,
      '상지 한의예: 학기별 교과당 상위5 석차 + 진로상위3(A1·B3·C6), 환산=평균×−5+105, ×10. 출결 제외');
  },
  // 동국대(서울) 약학: 국수영사과한 상위10과목(과목수). 등급=평균, 점수=기준점수(1=10·2=9.99·3=9.95·4=9.9…)avg×70
  '동국대': (cs, gt) => {
    const { seok } = pick(cs, KUK, le(gt));
    const top = [...seok].sort((a, b) => a.rank! - b.rank!).slice(0, 10);
    const B = { 1: 10, 2: 9.99, 3: 9.95, 4: 9.9, 5: 9, 6: 8, 7: 5, 8: 3, 9: 0 } as Record<number, number>;
    const g = top.length ? top.reduce((s, c) => s + c.rank!, 0) / top.length : null;
    const sc = top.length ? top.reduce((s, c) => s + B[c.rank!], 0) / top.length * 70 : null;
    return R(g, sc == null ? null : round(sc, 3), 1000, false, true, '동국(서울) 약학: 상위10과목 기준점수avg×70');
  },
  // 차의과대 약학(지역균형): 국수영사과한, 등급환산 1=1000·2=997·3=994·4=990·5=985. 교과=배점avg (CHA학생부교과는 ×0.7)
  '차의과대': (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt));
    const B = { 1: 1000, 2: 997, 3: 994, 4: 990, 5: 985, 6: 980, 7: 975, 8: 970, 9: 965 } as Record<number, number>;
    const M = { A: 1, B: 3, C: 5 }; const jj = jinro.filter((c) => (M as any)[c.achievement!] != null);
    const sg = seok.reduce((s, c) => s + B[c.rank!] * c.units, 0) + jj.reduce((s, c) => s + B[(M as any)[c.achievement!]] * c.units, 0);
    const su = seok.reduce((s, c) => s + c.units, 0) + jj.reduce((s, c) => s + c.units, 0);
    return R(seokAvg(seok), su ? round(sg / su, 3) : null, 1000, true, true, '차의과 약학(지역균형): 등급환산(1000/997/994/990/985)avg. CHA교과는 ×0.7');
  },
  // 경성대 약학: 국수영탐구(한국사포함), 공통×3+일반×5+진로×2, 배점 1=100 step2. 과탐=공통 성취A→1등급, 진로 A1·B3·C5
  '경성대': (cs, gt) => {
    const KS = new Set(['국어', '수학', '영어', '사회', '과학', '한국사']); const B = lin(100, 2);
    const MJ = { A: 1, B: 3, C: 5 } as Record<string, number>;
    const gG: [number, number][] = []; const iG: [number, number][] = []; const jG: [number, number][] = [];
    for (const c of cs) {
      if (!KS.has(areaKey(c.area)) || (c.units || 0) <= 0 || semNo(c) > le(gt)) continue;
      if (c.name === '과학탐구실험') { gG.push([1, c.units]); continue; }
      if (c.kind === '공통' && hasRank(c)) gG.push([c.rank!, c.units]);
      else if (c.kind === '일반선택' && hasRank(c)) iG.push([c.rank!, c.units]);
      else if (c.kind === '진로선택' && MJ[c.achievement!] != null) jG.push([MJ[c.achievement!], c.units]);
    }
    const av = (a: [number, number][]): [number, number] => {
      const u = a.reduce((s, x) => s + x[1], 0);
      return u ? [a.reduce((s, x) => s + x[0] * x[1], 0) / u, a.reduce((s, x) => s + B[x[0]] * x[1], 0) / u] : [0, 0];
    };
    const [gg, gs] = av(gG); const [ig, iis] = av(iG); const [jg, js] = av(jG);
    if (!gG.length && !iG.length) return R(null, null, 1000, true, false, '경성 약학(공통/일반 구분 필요)');
    return R(round(gg * 0.3 + ig * 0.5 + jg * 0.2, 4), round(gs * 3 + iis * 5 + js * 2, 2), 1000, true, true, '경성 약학: 공통×3+일반×5+진로×2, 배점 100 step2');
  },
  // 목포대 약학: 국영수과 석차평균, 점수 809+(9−평균)/8×91 + 진로상위3(A5·B4·C3)/3. 출결 제외
  '목포대': (cs, gt) => {
    const A = new Set(['국어', '영어', '수학', '과학']); const { seok, jinro } = pick(cs, A, le(gt));
    const g = seokAvg(seok); const GP = { A: 5, B: 4, C: 3 }; const t3 = topByPt(jinro, GP, 3);
    const gas = t3.length ? t3.reduce((s, c) => s + (GP as any)[c.achievement!], 0) / 3 : 0;
    return R(g, g == null ? null : round(809 + (9 - g) / 8 * 91 + gas, 2), 900, true, true, '목포 약학: 809+(9−평균)/8×91 + 진로가산. 출결 제외');
  },
  // 덕성여대 약학: 등급=국수영사과한 석차+진로(A1·B2·C4) 병합. 점수: 배점(1=100 step1)avg×9 + 진로(A100·B99·C97)avg×1
  '덕성여대': (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt));
    const g = wavg([...seok.map((c) => [c.rank!, c.units] as [number, number]), ...jinMap(jinro, { A: 1, B: 2, C: 4 })]);
    const avg = baeAvg(seok, lin(100, 1)); const jg = wavg(jinMap(jinro, { A: 100, B: 99, C: 97 } as any)) ?? 0;
    return R(g, avg == null ? null : round(avg * 9 + jg * 1, 4), 1000, false, true, '덕성 약학: 배점avg×9 + 진로(A100·B99·C97)avg×1');
  },
  // 동의대 한의예: 등급=국수영사과한+진로(A1·B2·C3) 과목수 평균. 점수: 배점(1=25 step3, 과목수기준)(Σ/n)×12+700
  '동의대': (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt));
    const M = { A: 1, B: 2, C: 3 }; const jj = jinro.filter((c) => (M as any)[c.achievement!] != null);
    const cnt = seok.length + jj.length;
    const gsum = seok.reduce((s, c) => s + c.rank!, 0) + jj.reduce((s, c) => s + (M as any)[c.achievement!], 0);
    const g = cnt ? gsum / cnt : null;
    const B = { 1: 25, 2: 22, 3: 19, 4: 16, 5: 13, 6: 10, 7: 7, 8: 4, 9: 1 } as Record<number, number>;
    const MJ = { A: 1, B: 3, C: 5 }; const jjS = jinro.filter((c) => (MJ as any)[c.achievement!] != null);
    const psum = seok.reduce((s, c) => s + B[c.rank!], 0) + jjS.reduce((s, c) => s + B[(MJ as any)[c.achievement!]], 0);
    const pn = seok.length + jjS.length;
    return R(g, pn ? round((psum / pn) * 12 + 700, 2) : null, 1000, true, true, '동의 한의예: 과목수 배점(1=25 step3)×12+700');
  },
  // 동덕여대 약학: 국영수과 4교과(석차등급 부여 과목만·진로 석차포함), 배점 1=100·2=98·3=95·4=91…
  //   평균석차등급점수 = [교과별(Σ배점/과목수)] 4교과 평균 × 1/4, 학생부 100% → ×10. 3-1까지(예정)
  '동덕여대': (cs, gt) => {
    const B = { 1: 100, 2: 98, 3: 95, 4: 91, 5: 86, 6: 80, 7: 70, 8: 60, 9: 40 } as Record<number, number>;
    const { seok } = pick(cs, KUE, le(gt));
    const AREAS = ['국어', '영어', '수학', '과학'];
    const means: number[] = [];
    for (const a of AREAS) {
      const gc = seok.filter((c) => areaKey(c.area) === a);
      if (gc.length) means.push(gc.reduce((s, c) => s + B[c.rank!], 0) / gc.length);
    }
    if (means.length < AREAS.length) return R(seokAvg(seok), null, 1000, false, false, '동덕 약학: 반영 4교과 중 일부 과목 없음(부적격)');
    const avg = means.reduce((a, b) => a + b, 0) / AREAS.length;
    return R(seokAvg(seok), round(avg * 10, 4), 1000, false, true, '동덕 약학: 국영수과 4교과 과목수 평균배점의 평균 ×10');
  },
  // 경상국립대 일반: 국수영사과한 3-1, 배점 1=150 step15. 850+Σ/84 (+진로가산 미세)
  '경상국립대': (cs) => {
    const { seok } = pick(cs, KUK, 31);
    const common = 850 + (seok.reduce((s, c) => s + lin(150, 15)[c.rank!] * c.units, 0) / seok.reduce((s, c) => s + c.units, 0));
    return R(seokAvg(seok), round(common, 2), 1000, false, false, '경상국립 일반: 850+공통(배점 150/등급). 진로가산(≈+0.17) 제외');
  },
};

// ── 계열(치·약·한·수)별 override 규칙 — 같은 대학이라도 계열마다 반영교과·배점·등급식이 다른 경우 ──
// 키: `${대학}|${계열}` (계열 = 의예/치의예/약학/한의예/수의예). 이준서 어디가 리포트로 검증.
const GUBUN_RULES: Record<string, Rule> = {
  // 강원대 약학/수의예/치의예: 배점 lin(1000,30)+과탐(A1등급), ×0.9 + 진로(A1000·B970·C910)×0.1. 등급=1+(1000−교과)/30
  '강원대|약학': (cs, gt) => gangwonYak(cs, gt),
  '강원대|수의예': (cs, gt) => gangwonYak(cs, gt),
  '강원대|치의예': (cs, gt) => gangwonYak(cs, gt),
  // 전북대 약학/치의예/수의예: 등급 = 석차평균×0.9 + 진로상위3(A1·B2·C3)×0.1
  '전북대|약학': (cs, gt) => jeonbukYak(cs, gt),
  '전북대|치의예': (cs, gt) => jeonbukYak(cs, gt),
  '전북대|수의예': (cs, gt) => jeonbukYak(cs, gt),
  // 제주대 수의예: jejuVet (석차 등급환산 1=1000 step20, 공통×0.3 + (일반+진로 상위3)×0.7)
  '제주대|수의예': (cs, gt) => jejuVet(cs, gt),
  // 연세대 치의예/약학: 추천형 로직(등급점수50%+Z점수환산50%, 진로 A/B/C). 등급=국수영사과 석차평균
  '연세대|치의예': (cs, gt) => {
    const r = yonseiScore(cs);
    return R(seokAvg(pick(cs, new Set(['국어', '수학', '영어', '사회', '과학']), le(gt)).seok), r.score, 100, true, r.exact, '연세 치의예: 추천형(등급50%+Z50%)');
  },
  '연세대|약학': (cs, gt) => {
    const r = yonseiScore(cs);
    return R(seokAvg(pick(cs, new Set(['국어', '수학', '영어', '사회', '과학']), le(gt)).seok), r.score, 100, true, r.exact, '연세 약학: 추천형(등급50%+Z50%)');
  },
  // 연세대 의예: 추천형 로직 — 치의예/약학과 동일(등급50%+Z50%). 메디컬 뷰가 근사 역산 대신 정밀식 쓰도록 규칙 추가.
  '연세대|의예': (cs, gt) => {
    const r = yonseiScore(cs);
    return R(seokAvg(pick(cs, new Set(['국어', '수학', '영어', '사회', '과학']), le(gt)).seok), r.score, 100, true, r.exact, '연세 의예: 추천형(등급50%+Z50%)');
  },
  // 충북대 수의예: 국수영사과, 배점 1=10·2=9.5·3=9…8=4·9=0. 진로 충북식(A→1, B→누적(B+C%), C→누적(C%)). 교과=(Σ/단위)×4+40
  '충북대|수의예': (cs, gt) => {
    const B = { 1: 10, 2: 9.5, 3: 9, 4: 8.5, 5: 8, 6: 7.5, 7: 7, 8: 4, 9: 0 } as Record<number, number>;
    // 누적비율(높을수록 상위)→석차등급: 100~96.1→1등급 … 4.0~0→9등급
    const cum = (p: number): number => {
      const T: [number, number][] = [[96.1, 1], [89.1, 2], [77.1, 3], [60.1, 4], [40.1, 5], [23.1, 6], [11.1, 7], [4.1, 8], [0, 9]];
      for (const [lo, g] of T) if (p >= lo) return g; return 9;
    };
    const convCB = (c: CourseRecord): number => {
      const a = c.achievement; const dB = c.distB ?? 0, dC = c.distC ?? 0;
      return a === 'A' ? 1 : a === 'B' ? cum(dB + dC) : cum(dC);
    };
    const { seok } = pick(cs, KUS, le(gt));
    const jd = cs.filter((c) => c.kind !== '공통' && !hasRank(c) && KUS.has(areaKey(c.area)) && c.achievement && 'ABC'.includes(c.achievement) && (c.units || 0) > 0 && semNo(c) <= le(gt) && (c.distA || c.distB || c.distC));
    const sg = seok.reduce((s, c) => s + B[c.rank!] * c.units, 0) + jd.reduce((s, c) => s + B[Math.min(convCB(c), 9)] * c.units, 0);
    const su = seok.reduce((s, c) => s + c.units, 0) + jd.reduce((s, c) => s + c.units, 0);
    const g = wavg([...seok.map((c) => [c.rank!, c.units] as [number, number]), ...jd.map((c) => [convCB(c), c.units] as [number, number])]);
    return R(g, su ? round(sg / su * 4 + 40, 2) : null, 80, true, true, '충북 수의예: 국수영사과 배점(1=10…)×4+40, 진로 충북식');
  },
};
function gangwonYak(cs: CourseRecord[], gt: GradType): RuleResult {
  const B = lin(1000, 30); const Mj = { A: 1000, B: 970, C: 910 } as Record<string, number>;
  let cu = 0, cg = 0, ju = 0, jg = 0;
  for (const c of cs) {
    if (!KUK.has(areaKey(c.area)) || (c.units || 0) <= 0 || semNo(c) > le(gt)) continue;
    if (hasRank(c)) { cg += B[c.rank!] * c.units; cu += c.units; }
    else if (c.name === '과학탐구실험') { cg += B[1] * c.units; cu += c.units; }
    else if (Mj[c.achievement!] != null) { jg += Mj[c.achievement!] * c.units; ju += c.units; }
  }
  const common = cu ? cg / cu : 0; const jinro = ju ? jg / ju : 0;
  const gyo = common * 0.9 + jinro * 0.1;
  const seokList: CourseRecord[] = cs.filter((c) => KUK.has(areaKey(c.area)) && hasRank(c) && semNo(c) <= le(gt) && (c.units || 0) > 0);
  return R(round(1 + (1000 - gyo) / 30, 4), round(gyo, 2), 1000, false, true,
    '강원 약학계열: 배점×0.9+진로×0.1, 등급=1+(1000−교과)/30');
  void seokList;
}
// 건국(글로컬) 진로 성취도 B/C → 등급비율(누적 상위%)에 따른 석차등급
function kkRatioGrade(p: number): number {
  const T: [number, number][] = [[4, 9], [11, 8], [23, 7], [40, 6], [60, 5], [77, 4], [89, 3], [96, 2]];
  for (const [hi, g] of T) if (p < hi) return g;
  return 1;
}
// 제주대 의예·수의예 공통: 석차 등급환산 1=1000 step20, 공통×0.3 + (일반+진로 상위3)×0.7. 진로 국수영과 A1000·B970·C940
function jejuVet(cs: CourseRecord[], gt: GradType): RuleResult {
  const B = lin(1000, 20); const KG = new Set(['국어', '수학', '영어', '과학']);
  const gk = cs.filter((c) => c.kind === '공통' && KUK.has(areaKey(c.area)) && hasRank(c) && semNo(c) <= le(gt) && c.name !== '과학탐구실험');
  const il = cs.filter((c) => c.kind === '일반선택' && KUK.has(areaKey(c.area)) && hasRank(c) && semNo(c) <= le(gt));
  if (!gk.length && !il.length) {
    return R(seokAvg(pick(cs, KUK, le(gt)).seok), null, 1000, true, false, '제주: 공통/일반 구분 필요(등급만)');
  }
  const jr = cs.filter((c) => c.kind === '진로선택' && KG.has(areaKey(c.area)) && c.achievement && 'ABC'.includes(c.achievement) && semNo(c) <= le(gt));
  const jr3 = [...jr].sort((a, b) => (b.rawScore ?? 0) - (a.rawScore ?? 0)).slice(0, 3);
  const MJ = { A: 1000, B: 970, C: 940 } as Record<string, number>;
  const gu = gk.reduce((s, c) => s + c.units, 0); const gs = gk.reduce((s, c) => s + B[c.rank!] * c.units, 0);
  const iu = il.reduce((s, c) => s + c.units, 0); const iss = il.reduce((s, c) => s + B[c.rank!] * c.units, 0);
  const js = jr3.reduce((s, c) => s + MJ[c.achievement!] * c.units, 0); const ju = jr3.reduce((s, c) => s + c.units, 0);
  const sc = (gu ? gs / gu * 0.3 : 0) + ((iu + ju) ? (iss + js) / (iu + ju) * 0.7 : 0);
  const allSeok = pick(cs, KUK, le(gt)).seok;
  const g = wavg([...allSeok.map((c) => [c.rank!, c.units] as [number, number]), ...jr3.map((c) => [1, c.units] as [number, number])]);
  return R(g, round(sc, 2), 1000, false, true, '제주 의예·수의예: 석차 1000 step20, 공통×0.3+(일반+진로상위3)×0.7');
}
// 전북대(전 계열 동일): 국수영사과한 6교과군, 등급점수 1=9.80…9=0.20(9.8만점). 공통일반평균×0.9 + 진로상위3평균×0.1
//   진로 지정교과군(국수영사과) 성취도 A=9.80·B=9.30·C=8.80. 교과성적=930 + 70×평균등급점수/9.8. (진로 없으면 ×1.0)
function jeonbukYak(cs: CourseRecord[], gt: GradType): RuleResult {
  const BJ = { 1: 9.80, 2: 9.30, 3: 8.80, 4: 8.30, 5: 7.80, 6: 6.80, 7: 4.60, 8: 2.40, 9: 0.20 } as Record<number, number>;
  const { seok, jinro } = pick(cs, KUK, le(gt));
  if (!seok.length) return R(null, null, 1000, true, false, '전북대: 반영교과 없음');
  const commonPt = baeAvg(seok, BJ) ?? 0; // 공통·일반 등급점수 평균(9.8 만점)
  const JP = { A: 9.80, B: 9.30, C: 8.80 } as Record<string, number>;
  const jr = jinro.filter((c) => KUS.has(areaKey(c.area)) && JP[c.achievement!] != null); // 진로 지정교과군(국수영사과)
  const t3 = [...jr].sort((a, b) => JP[b.achievement!] - JP[a.achievement!] || b.units - a.units).slice(0, 3);
  const jinPt = t3.length ? t3.reduce((s, c) => s + JP[c.achievement!] * c.units, 0) / t3.reduce((s, c) => s + c.units, 0) : null;
  const avgPt = jinPt != null ? commonPt * 0.9 + jinPt * 0.1 : commonPt;
  const score = 930 + 70 * avgPt / 9.8;
  // 등급(참고): 석차평균×0.9 + 진로상위3(A1·B2·C3)×0.1
  const sg = seokAvg(seok);
  const M = { A: 1, B: 2, C: 3 }; const t3g = topByGrade(jr, M, 3);
  const jg = t3g.length ? t3g.reduce((s, c) => s + (M as any)[c.achievement!] * c.units, 0) / t3g.reduce((s, c) => s + c.units, 0) : 0;
  const grade = sg == null ? null : (t3g.length ? sg * 0.9 + jg * 0.1 : sg);
  return R(grade, round(score, 2), 1000, true, true, '전북대: 등급점수(1=9.80…9=0.20) 공통일반×0.9+진로상위3(A9.80·B9.30·C8.80)×0.1, 930+70×평균/9.8');
}

// ══════════════════════════════════════════════════════════════════
// 일반학과(대학별 산출) 정밀 규칙 — 어디가 교과 부분 재현(이준서 검증). 계열: 인문/자연
// ══════════════════════════════════════════════════════════════════
const INMUN0 = new Set(['국어', '수학', '영어', '사회']);            // 국영수사(한국사 제외)
const INMUNH = new Set(['국어', '수학', '영어', '사회', '한국사']);  // 국영수사한
const L2 = lin(100, 2);

// 진로 선택 과목(교과 필터+성취도 상위 capN)
function jtop(jinro: CourseRecord[], areas: Set<string>, jmScore: Record<string, number>, capN: number | null): CourseRecord[] {
  const jj = jinro.filter((c) => areas.has(areaKey(c.area)) && jmScore[c.achievement!] != null);
  const s = [...jj].sort((a, b) => jmScore[b.achievement!] - jmScore[a.achievement!] || b.units - a.units);
  return capN == null ? s : s.slice(0, capN);
}
// 결합평균(석차 배점 + 진로 환산배점) — score용 avg, grade용(진로 A1B2C3), 총단위
function genC(seok: CourseRecord[], jsel: CourseRecord[], bae: Record<number, number>, jmScore: Record<string, number>) {
  const su = seok.reduce((s, c) => s + c.units, 0) + jsel.reduce((s, c) => s + c.units, 0);
  if (!su) return null;
  const sg = seok.reduce((s, c) => s + bae[c.rank!] * c.units, 0) + jsel.reduce((s, c) => s + jmScore[c.achievement!] * c.units, 0);
  const GM = { A: 1, B: 2, C: 3 } as Record<string, number>;
  const gg = seok.reduce((s, c) => s + c.rank! * c.units, 0) + jsel.reduce((s, c) => s + GM[c.achievement!] * c.units, 0);
  return { avg: sg / su, grade: gg / su, su };
}

const GENERAL_RULES: Record<string, Rule> = {
  // 경북대 일반학과: 인문=국수영사과한 전과목 / 자연(공대·생태·자율)=상위10과목. 배점 lin(400,10). 만점400
  '경북대|인문': (cs, gt) => { const { seok } = pick(cs, KUK, le(gt)); return R(seokAvg(seok), round(baeAvg(seok, lin(400, 10)) ?? 0, 2), 400, true, true, '경북 인문: 국수영사과한 전과목 배점 lin(400,10)'); },
  '경북대|자연': (cs, gt) => {
    const { seok } = pick(cs, KUK, le(gt));
    const top = [...seok].sort((a, b) => a.rank! - b.rank! || b.units - a.units).slice(0, 10);
    const su = top.reduce((s, c) => s + c.units, 0); if (!su) return R(null, null, 400, true, false, '경북 자연');
    const B = lin(400, 10);
    return R(round(top.reduce((s, c) => s + c.rank! * c.units, 0) / su, 4), round(top.reduce((s, c) => s + B[c.rank!] * c.units, 0) / su, 2), 400, true, true, '경북 자연(공대·생태·자율): 국수영사과한 상위10과목 배점 lin(400,10)');
  },
  // 가천대 일반학과(학생부우수자): max(유형1 변환등급×10, 유형2 상위10 배점×10). 인문=국수영사 / 자연=국수영과
  '가천대|인문': (cs, gt) => gachon(cs, gt, INMUN0),
  '가천대|자연': (cs, gt) => gachon(cs, gt, KUE),
  // 충북대 일반학과: 수의예과와 동일(국수영사과 배점 lin(10,0.5)×4+40, 진로 충북식). → 75.67
  '충북대': (cs, gt) => GUBUN_RULES['충북대|수의예'](cs, gt),
  // 광운대: 배점 lin(100,2), 진로 A1B2C4(=배점[1/2/4]), 결합평균×10. 자연=국영수사과한, 인문=국영수사한
  '광운대|자연': (cs, gt) => { const { seok, jinro } = pick(cs, KUK, le(gt)); const jm = { A: L2[1], B: L2[2], C: L2[4] } as Record<string, number>; const c = genC(seok, jtop(jinro, KUS, jm, null), L2, jm); return R(c && round(c.grade, 4), c && round(c.avg * 10, 3), 1000, true, true, '광운 자연: 국영수사과한 lin(100,2)+진로(A1B2C4), 결합평균×10'); },
  '광운대|인문': (cs, gt) => { const { seok, jinro } = pick(cs, INMUNH, le(gt)); const jm = { A: L2[1], B: L2[2], C: L2[4] } as Record<string, number>; const c = genC(seok, jtop(jinro, INMUN0, jm, null), L2, jm); return R(c && round(c.grade, 4), c && round(c.avg * 10, 3), 1000, true, true, '광운 인문: 국영수사한 lin(100,2)+진로(A1B2C4), 결합평균×10'); },
  // 국민대: 공통 배점(3=98,4=95) avg×0.85 + 진로상위3(A100B98C90) avg×0.15, ×10. 인문=국영수사, 자연=국영수과
  '국민대|인문': (cs, gt) => generalKM(cs, gt, INMUN0, INMUN0),
  '국민대|자연': (cs, gt) => generalKM(cs, gt, KUE, KUE),
  // 단국대(죽전): 국영수사과한(+과탐 1등급)·진로 A1B3C5, CAT_BAE ×0.95×10 (단국천안과 동일)
  '단국대|자연': (cs, gt) => danguk(cs, gt),
  '단국대|인문': (cs, gt) => danguk(cs, gt),
  // 명지대 자연: 국영수과 배점(3=98,4=94)+진로 국수영과(과탐 포함) A1B2C4, (결합평균+총단위×0.05)×10
  '명지대|자연': (cs, gt) => myeongji(cs, gt, KUE),
  '명지대|인문': (cs, gt) => myeongji(cs, gt, INMUN0),
  // 상명대: 전과목 석차 lin(100,2) + 진로상위3(A100B96C90), 결합평균×10
  '상명대|인문': (cs, gt) => sangmyung(cs, gt),
  '상명대|자연': (cs, gt) => sangmyung(cs, gt),
  // 서강대: (10−석차등급평균)×100 + 진로(성취 우수 시 100 상한). 전과목
  '서강대|인문': (cs, gt) => sogang(cs, gt),
  '서강대|자연': (cs, gt) => sogang(cs, gt),
  // 서울과기대: 배점 1000스케일(3=980,4=970)+진로상위3(A1000B980C960), 결합평균. 자연 국영수과/인문 국영수사
  '서울과기대|자연': (cs, gt) => { const B = { 1: 1000, 2: 990, 3: 980, 4: 970, 5: 960, 6: 950, 7: 900, 8: 850, 9: 800 } as Record<number, number>; const { seok, jinro } = pick(cs, KUE, le(gt)); const jm = { A: 1000, B: 980, C: 960 } as Record<string, number>; const c = genC(seok, jtop(jinro, KUE, jm, 3), B, jm); return R(seokAvg(seok), c && round(c.avg, 2), 1000, true, true, '서울과기 자연: 국영수과 배점(1000스케일)+진로상위3(A1000B980C960)'); },
  '서울과기대|인문': (cs, gt) => { const B = { 1: 1000, 2: 990, 3: 980, 4: 970, 5: 960, 6: 950, 7: 900, 8: 850, 9: 800 } as Record<number, number>; const { seok, jinro } = pick(cs, INMUN0, le(gt)); const jm = { A: 1000, B: 980, C: 960 } as Record<string, number>; const c = genC(seok, jtop(jinro, INMUN0, jm, 3), B, jm); return R(seokAvg(seok), c && round(c.avg, 2), 1000, true, true, '서울과기 인문: 국영수사 배점(1000스케일)+진로상위3'); },
  // 서울여대: 국수영사과(한국사 제외) CAT_BAE avg + 진로상위3 가산(A1.0B0.9C0.5)/3. 만점100
  '서울여대|자연': (cs, gt) => seoulwomen(cs, gt, KUS),
  '서울여대|인문': (cs, gt) => seoulwomen(cs, gt, INMUN0),
  // 이화여대: 배점 10스케일(2=9.6,3=9.2,4=8.6) 공통avg×0.8 + 진로(A10B8.6C5)avg×0.2, ×100. 자연 국영수사과한
  '이화여대|자연': (cs, gt) => ewha(cs, gt, KUK),
  '이화여대|인문': (cs, gt) => ewha(cs, gt, INMUNH),
  // 성신여대: (공통+진로 결합 배점평균 ×0.2)+70. 배점(3=98,4=96), 진로상위4 A1B2C4. 자연 국영수과/인문 국영수사
  '성신여대|자연': (cs, gt) => sungshin(cs, gt, KUE),
  '성신여대|인문': (cs, gt) => sungshin(cs, gt, INMUNH),
  // 세종대: 공통 배점(1000스케일:3=980,4=950)avg×0.8 + 진로(A1000B980C900)avg×0.2. 자연 국영수과/인문 국영수사
  '세종대|자연': (cs, gt) => sejong(cs, gt, KUE),
  '세종대|인문': (cs, gt) => sejong(cs, gt, INMUN0),
  // 인하대 인문: 국수영사 배점lin(100,2)+진로상위3(A1B2C4), 결합평균×10
  '인하대|인문': (cs, gt) => { const { seok, jinro } = pick(cs, INMUN0, le(gt)); const jm = { A: L2[1], B: L2[2], C: L2[4] } as Record<string, number>; const c = genC(seok, jtop(jinro, INMUN0, jm, 3), L2, jm); return R(c && round(c.grade, 4), c && round(c.avg * 10, 3), 1000, true, true, '인하 인문: 국수영사 lin(100,2)+진로상위3(A1B2C4)×10'); },
  // 홍익대: {(공통배점avg×0.9)+진로배점avg}×(총단위/1000+0.9). 배점 경희식, 진로 A10B9C7. 자연 국영수과/인문 국영수사
  '홍익대|인문': (cs, gt) => hongik(cs, gt, INMUNH, INMUN0),
  '홍익대|자연': (cs, gt) => hongik(cs, gt, KUE, KUE),
  // 동국대(서울) 학교장추천인재: 상위10과목(과목수 기준), 기준점수 1=10·2=9.99·3=9.95·4=9.9…, (등급점수/10)×만점700.
  //   인문 국영수사한 / 자연 국영수과한. 등급=상위10 석차평균. (약학 RULES['동국대']와 별개)
  '동국대|인문': (cs, gt) => dongguk(cs, gt, INMUNH),
  '동국대|자연': (cs, gt) => dongguk(cs, gt, KUEH),
  // 한양대(추천형): 국영수사과한 배점 경희식 avg×9 (진로 정성평가 미반영). 만점900
  '한양대|자연': (cs, gt) => hanyang(cs, gt),
  '한양대|인문': (cs, gt) => hanyang(cs, gt),
  // 한국외대(학교장추천): 국수영사과한, 과목별 max(등급환산, 원점수환산)+진로(A1000B960C890), Σ/Σ단위. 전 계열 동일
  '한국외대': (cs, gt) => hufs(cs, gt),
  // 서울시립대(고교추천): 전과목 석차배점(100/98/95/86/71/50/30/15/0)avg×7 + 진로선택 전과목(A100B97C90)avg×1. 만점800
  '서울시립대': (cs, gt) => uos(cs, gt),
};

const HONGIK_BAE = { 1: 100, 2: 96, 3: 89, 4: 77, 5: 60, 6: 40, 7: 23, 8: 11, 9: 0 } as Record<number, number>;
function generalKM(cs: CourseRecord[], gt: GradType, sArea: Set<string>, jArea: Set<string>): RuleResult {
  const B = { 1: 100, 2: 99, 3: 98, 4: 95, 5: 92, 6: 89, 7: 86, 8: 83, 9: 80 } as Record<number, number>;
  const { seok, jinro } = pick(cs, sArea, le(gt)); const jm = { A: 100, B: 98, C: 90 } as Record<string, number>;
  const common = baeAvg(seok, B); const t3 = jtop(jinro, jArea, jm, 3);
  const ja = t3.length ? t3.reduce((s, c) => s + jm[c.achievement!], 0) / t3.length : 0;
  const sc = common == null ? null : (common * 0.85 + ja * 0.15) * 10;
  return R(seokAvg(seok), sc == null ? null : round(sc, 2), 1000, true, true, '국민대: 공통배점avg×0.85+진로상위3(A100B98C90)avg×0.15, ×10');
}
function danguk(cs: CourseRecord[], gt: GradType): RuleResult {
  const { seok, jinro } = pick(cs, KUK, le(gt), true); const M = { A: 1, B: 3, C: 5 }; const B = lin(100, 1);
  const g = wavg([...seok.map((c) => [c.rank!, c.units] as [number, number]), ...jinMap(jinro, M)]);
  const jm2 = jinro.filter((c) => (M as any)[c.achievement!] != null);
  const sg = seok.reduce((s, c) => s + B[c.rank!] * c.units, 0) + jm2.reduce((s, c) => s + B[(M as any)[c.achievement!]] * c.units, 0);
  const su = seok.reduce((s, c) => s + c.units, 0) + jm2.reduce((s, c) => s + c.units, 0);
  return R(g, round(sg / su * 0.95 * 10, 2), 1000, true, true, '단국(죽전): 국영수사과한(+과탐)+진로 A1B3C5 ×0.95×10. 출결 제외');
}
function myeongji(cs: CourseRecord[], gt: GradType, sArea: Set<string>): RuleResult {
  const B = { 1: 100, 2: 99, 3: 98, 4: 94, 5: 90, 6: 86, 7: 82, 8: 78, 9: 74 } as Record<number, number>;
  const { seok, jinro } = pick(cs, sArea, le(gt)); const jm = { A: B[1], B: B[2], C: B[4] } as Record<string, number>;
  const jsel = jtop(jinro, sArea, jm, null);
  // 과학탐구실험(성취A) 진로 이수단위 포함(자연)
  const gwat = sArea.has('과학') ? cs.filter((c) => c.name === '과학탐구실험' && c.achievement === 'A' && (c.units || 0) > 0 && semNo(c) <= le(gt)) : [];
  const su = seok.reduce((s, c) => s + c.units, 0) + jsel.reduce((s, c) => s + c.units, 0) + gwat.reduce((s, c) => s + c.units, 0);
  const sg = seok.reduce((s, c) => s + B[c.rank!] * c.units, 0) + jsel.reduce((s, c) => s + jm[c.achievement!] * c.units, 0) + gwat.reduce((s, c) => s + B[1] * c.units, 0);
  const sc = su ? (sg / su + su * 0.05) * 10 : null;
  return R(seokAvg(seok), sc == null ? null : round(sc, 3), 1000, true, true, '명지: 국영수과 배점+진로(A1B2C4·과탐포함)+이수단위가산(×0.05), ×10');
}
function sangmyung(cs: CourseRecord[], gt: GradType): RuleResult {
  const seok = cs.filter((c) => hasRank(c) && (c.units || 0) > 0 && semNo(c) <= le(gt) && c.name !== '과학탐구실험');
  const jinro = cs.filter((c) => !hasRank(c) && c.achievement && (c.units || 0) > 0 && semNo(c) <= le(gt) && c.name !== '과학탐구실험');
  const jm = { A: 100, B: 96, C: 90 } as Record<string, number>;
  const t3 = [...jinro.filter((c) => jm[c.achievement!] != null)].sort((a, b) => jm[b.achievement!] - jm[a.achievement!] || b.units - a.units).slice(0, 3);
  const su = seok.reduce((s, c) => s + c.units, 0) + t3.reduce((s, c) => s + c.units, 0);
  const sg = seok.reduce((s, c) => s + L2[c.rank!] * c.units, 0) + t3.reduce((s, c) => s + jm[c.achievement!] * c.units, 0);
  const g = seok.length ? seok.reduce((s, c) => s + c.rank! * c.units, 0) / seok.reduce((s, c) => s + c.units, 0) : null;
  return R(g, su ? round(sg / su * 10, 3) : null, 1000, true, true, '상명: 전과목 lin(100,2)+진로상위3(A100B96C90), 결합평균×10');
}
function sogang(cs: CourseRecord[], gt: GradType): RuleResult {
  const seok = cs.filter((c) => hasRank(c) && (c.units || 0) > 0 && semNo(c) <= le(gt) && c.name !== '과학탐구실험');
  const su = seok.reduce((s, c) => s + c.units, 0); if (!su) return R(null, null, 1000, true, false, '서강: 반영교과 없음');
  const g = seok.reduce((s, c) => s + c.rank! * c.units, 0) / su;
  const hasJin = cs.some((c) => !hasRank(c) && c.achievement && semNo(c) <= le(gt) && c.name !== '과학탐구실험');
  const jinScore = hasJin ? 100 : 0; // 진로 성취비율식(우수 시 100 상한). 이준서 전A→100
  return R(round(g, 4), round((10 - g) * 100 + jinScore, 2), 1000, true, true, '서강: (10−석차등급평균)×100 + 진로(성취 우수 시 100). 전과목');
}
function seoulwomen(cs: CourseRecord[], gt: GradType, sArea: Set<string>): RuleResult {
  const { seok, jinro } = pick(cs, sArea, le(gt)); const common = baeAvg(seok, CAT_BAE);
  const GP = { A: 1.0, B: 0.9, C: 0.5 } as Record<string, number>; const t3 = jtop(jinro, sArea, GP, 3);
  const add = t3.length ? t3.reduce((s, c) => s + GP[c.achievement!], 0) / 3 : 0;
  return R(seokAvg(seok), common == null ? null : round(common + add, 2), 100, true, true, '서울여대: 국수영사과 CAT배점avg + 진로상위3(A1.0B0.9C0.5)/3. 만점100');
}
function ewha(cs: CourseRecord[], gt: GradType, sArea: Set<string>): RuleResult {
  const B = { 1: 10, 2: 9.6, 3: 9.2, 4: 8.6, 5: 8, 6: 7, 7: 6, 8: 4, 9: 2 } as Record<number, number>;
  const { seok, jinro } = pick(cs, sArea, le(gt)); const common = baeAvg(seok, B);
  const jm = { A: 10, B: 8.6, C: 5 } as Record<string, number>; const jsel = jtop(jinro, sArea, jm, null);
  const ja = jsel.length ? jsel.reduce((s, c) => s + jm[c.achievement!] * c.units, 0) / jsel.reduce((s, c) => s + c.units, 0) : 0;
  const gg = (seok.reduce((s,c)=>s+c.rank!*c.units,0)+jsel.reduce((s,c)=>s+({A:1,B:2,C:3} as any)[c.achievement!]*c.units,0))/(seok.reduce((s,c)=>s+c.units,0)+jsel.reduce((s,c)=>s+c.units,0));
  const sc = common == null ? null : (common * 0.8 + ja * 0.2) * 100;
  return R(round(gg,4), sc == null ? null : round(sc, 3), 1000, true, true, '이화: 배점(10스케일) 공통avg×0.8+진로(A10B8.6C5)avg×0.2, ×100');
}
function sungshin(cs: CourseRecord[], gt: GradType, sArea: Set<string>): RuleResult {
  const B = { 1: 100, 2: 99, 3: 98, 4: 96, 5: 94, 6: 92, 7: 90, 8: 88, 9: 86 } as Record<number, number>;
  const { seok, jinro } = pick(cs, sArea, le(gt)); const jm = { A: B[1], B: B[2], C: B[4] } as Record<string, number>;
  const jsel = jtop(jinro, sArea, jm, 4); const c = genC(seok, jsel, B, jm);
  return R(c && round(c.grade, 4), c ? round(c.avg * 0.2 + 70, 4) : null, 100, true, true, '성신: 결합 배점평균×0.2+70(진로상위4 A1B2C4). 교과 부분 만점100');
}
function sejong(cs: CourseRecord[], gt: GradType, sArea: Set<string>): RuleResult {
  const B = { 1: 1000, 2: 990, 3: 980, 4: 950, 5: 900, 6: 850, 7: 800, 8: 750, 9: 700 } as Record<number, number>;
  const { seok } = pick(cs, sArea, le(gt)); const common = baeAvg(seok, B);
  const jm = { A: 1000, B: 980, C: 900 } as Record<string, number>; const jsel = jtop(pick(cs, sArea, le(gt)).jinro, sArea, jm, null);
  const ja = jsel.length ? jsel.reduce((s, c) => s + jm[c.achievement!] * c.units, 0) / jsel.reduce((s, c) => s + c.units, 0) : 0;
  const sc = common == null ? null : common * 0.8 + ja * 0.2;
  // 내등급: 공통/일반 석차평균×0.8 + 진로 석차등급평균(A=1·B=3·C=5)×0.2 (진로 없으면 공통석차평균). 어디가 재현.
  const jG = { A: 1, B: 3, C: 5 } as Record<string, number>;
  const jgu = jsel.reduce((s, c) => s + c.units, 0);
  const jgAvg = jgu ? jsel.reduce((s, c) => s + jG[c.achievement!] * c.units, 0) / jgu : null;
  const sa = seokAvg(seok);
  const grade = sa == null ? null : (jgAvg == null ? sa : round(sa * 0.8 + jgAvg * 0.2, 4));
  return R(grade, sc == null ? null : round(sc, 3), 1000, true, true, '세종: 공통 배점(1000)avg×0.8+진로(A1000B980C900)avg×0.2. 등급=공통석차×0.8+진로석차(A1B3C5)×0.2');
}
function hongik(cs: CourseRecord[], gt: GradType, sArea: Set<string>, jArea: Set<string>): RuleResult {
  const { seok, jinro } = pick(cs, sArea, le(gt)); const common = baeAvg(seok, HONGIK_BAE);
  const jm = { A: 10, B: 9, C: 7 } as Record<string, number>; const jsel = jtop(jinro, jArea, jm, null);
  const ja = jsel.length ? jsel.reduce((s, c) => s + jm[c.achievement!] * c.units, 0) / jsel.reduce((s, c) => s + c.units, 0) : 0;
  // 이수단위 보정은 총 이수단위 상한 100 (어디가: 103→100). 100 미만이면 실단위 그대로.
  const su = Math.min(seok.reduce((s, c) => s + c.units, 0) + jsel.reduce((s, c) => s + c.units, 0), 100);
  const sc = common == null ? null : (common * 0.9 + ja) * (su / 1000 + 0.9);
  return R(seokAvg(seok), sc == null ? null : round(sc, 2), 100, true, true, '홍익: {(공통배점avg×0.9)+진로(A10B9C7)avg}×(min(총단위,100)/1000+0.9). 만점100');
}
// 동국대(서울) 일반학과: 반영교과 상위10과목(과목수 기준). 기준점수 1=10·2=9.99·3=9.95·4=9.9…, (등급점수/10)×700.
function dongguk(cs: CourseRecord[], gt: GradType, sArea: Set<string>): RuleResult {
  const { seok } = pick(cs, sArea, le(gt));
  const top = [...seok].sort((a, b) => a.rank! - b.rank! || b.units - a.units).slice(0, 10);
  if (!top.length) return R(null, null, 700, true, false, '동국(서울): 반영교과 없음');
  const B = { 1: 10, 2: 9.99, 3: 9.95, 4: 9.9, 5: 9, 6: 8, 7: 5, 8: 3, 9: 0 } as Record<number, number>;
  const g = top.reduce((s, c) => s + c.rank!, 0) / top.length;               // 상위10 석차평균
  const sc = top.reduce((s, c) => s + B[c.rank!], 0) / top.length / 10 * 700; // (등급점수/10)×700
  return R(round(g, 2), round(sc, 3), 700, true, true, '동국(서울): 상위10과목(과목수) 기준점수, (등급점수/10)×700. 인문 국영수사한/자연 국영수과한');
}
function hanyang(cs: CourseRecord[], gt: GradType): RuleResult {
  const { seok } = pick(cs, KUK, le(gt)); const common = baeAvg(seok, HONGIK_BAE);
  return R(seokAvg(seok), common == null ? null : round(common * 9, 3), 900, true, true, '한양(추천형): 국영수사과한 배점(경희식)avg×9. 진로 정성평가 미반영');
}
function hufs(cs: CourseRecord[], gt: GradType): RuleResult {
  const EB = { 1: 1000, 2: 960, 3: 890, 4: 770, 5: 600, 6: 400, 7: 230, 8: 110, 9: 0 } as Record<number, number>;
  const rawConv = (raw: number | null | undefined, area: string): number => {
    if (raw == null) return 0;
    const th: [number, number][] = area === '수학'
      ? [[90, 1000], [80, 960], [70, 890], [60, 770], [50, 600], [40, 400], [30, 230], [20, 110]]
      : [[90, 1000], [85, 960], [80, 890], [75, 770], [70, 600], [60, 400], [50, 230], [40, 110]];
    for (const [lo, v] of th) if (raw >= lo) return v; return 0;
  };
  const { seok, jinro } = pick(cs, KUK, le(gt));
  let sg = 0, su = 0;
  for (const c of seok) { sg += Math.max(EB[c.rank!], rawConv(c.rawScore, areaKey(c.area))) * c.units; su += c.units; }
  const JP = { A: 1000, B: 960, C: 890 } as Record<string, number>;
  for (const c of jinro.filter((x) => JP[x.achievement!] != null)) { sg += JP[c.achievement!] * c.units; su += c.units; }
  return R(seokAvg(seok), su ? round(sg / su, 3) : null, 1000, true, true, '한국외대: 국수영사과한, max(등급환산,원점수환산)+진로(A1000B960C890), Σ/Σ단위');
}
function uos(cs: CourseRecord[], gt: GradType): RuleResult {
  const B = { 1: 100, 2: 98, 3: 95, 4: 86, 5: 71, 6: 50, 7: 30, 8: 15, 9: 0 } as Record<number, number>;
  const seok = cs.filter((c) => hasRank(c) && (c.units || 0) > 0 && semNo(c) <= le(gt) && c.name !== '과학탐구실험'); // 전과목 석차
  const jj = cs.filter((c) => c.kind === '진로선택' && !hasRank(c) && c.achievement && 'ABC'.includes(c.achievement) && (c.units || 0) > 0 && semNo(c) <= le(gt)); // 진로선택 전과목
  const JP = { A: 100, B: 97, C: 90 } as Record<string, number>;
  const cu = seok.reduce((s, c) => s + c.units, 0);
  if (!cu) return R(null, null, 800, true, false, '서울시립: 반영교과 없음');
  const common = seok.reduce((s, c) => s + B[c.rank!] * c.units, 0) / cu * 7;
  const ju = jj.reduce((s, c) => s + c.units, 0);
  const jin = ju ? jj.reduce((s, c) => s + JP[c.achievement!] * c.units, 0) / ju * 1 : 0;
  const sc = ju ? common + jin : (common / 7 * 8); // 진로 0단위면 공통×8
  const g = seok.reduce((s, c) => s + c.rank! * c.units, 0) / cu;
  return R(round(g, 4), round(sc, 3), 800, true, true, '서울시립(고교추천): 전과목 석차배점avg×7 + 진로선택(A100B97C90)avg×1. 만점800');
}
// 가천대 학생부우수자(일반학과): 유형1(변환등급 A1~2=100·B3~4=99.5·C5=99·D6~7=90·E8~9=70)×10 vs 유형2(상위10 배점)×10 중 높은 값
function gachon(cs: CourseRecord[], gt: GradType, areas: Set<string>): RuleResult {
  const { seok } = pick(cs, areas, le(gt));
  if (!seok.length) return R(null, null, 1000, true, false, '가천 일반: 반영교과 없음');
  const byun = (r: number) => (r <= 2 ? 100 : r <= 4 ? 99.5 : r === 5 ? 99 : r <= 7 ? 90 : 70);
  const su1 = seok.reduce((s, c) => s + c.units, 0);
  const s1 = seok.reduce((s, c) => s + byun(c.rank!) * c.units, 0) / su1 * 10;
  const GB = { 1: 100, 2: 99.5, 3: 99, 4: 98.5, 5: 98, 6: 97.5, 7: 85, 8: 60, 9: 30 } as Record<number, number>;
  const top = [...seok].sort((a, b) => a.rank! - b.rank! || b.units - a.units).slice(0, 10);
  const su2 = top.reduce((s, c) => s + c.units, 0);
  const s2 = top.reduce((s, c) => s + GB[c.rank!] * c.units, 0) / su2 * 10;
  return R(seokAvg(seok), round(Math.max(s1, s2), 3), 1000, true, true, '가천 일반(학생부우수자): max(유형1 변환등급×10, 유형2 상위10배점×10)');
}
// 의학계열과 일반학과가 동일 전형·산출식·반영교과·스케일을 쓰는 대학 → 메디컬 정밀규칙 재사용(탭 간 값 통일)
// (전형/반영교과/스케일 일치 확인된 대학만. 다른 대학은 별도 일반학과 규칙 필요.)
const GEN_REUSE_MED = new Set(['경희대', '부산대', '가톨릭대', '전북대', '아주대', '덕성여대', '고려대', '중앙대', '인하대', '건국대',
  '강원대', '충남대', '전남대', '제주대', '숙명여대', '동덕여대']);
export function findGeneralRule(univ: string, series?: string): Rule | null {
  if (series && GENERAL_RULES[`${univ}|${series}`]) return GENERAL_RULES[`${univ}|${series}`];
  if (GENERAL_RULES[univ]) return GENERAL_RULES[univ];
  if (GEN_REUSE_MED.has(univ) && RULES[univ]) return RULES[univ];
  return null; // 검증된 정밀 규칙이 없으면 GeneralView가 기존 역산(근사) 사용
}

// 졸업생도 3학년 1학기(3-1)까지만 반영하는 의학계열 대학·계열 (업로드 목록 '졸업생 교과 반영 학기_0903').
// ※ 이 집합에 있는 (대학|구분)만 3-1로 고정. 목록에 없는 대학/전형은 졸업생이면 종전대로 3-2까지 반영.
//    파일 대학명은 대시보드 키로 매핑함(건국대(충주)=건국대(글로컬)·경상대=경상국립대·대가대=대구가톨릭대·
//    대구한=대구한의대·동국대(경주)=동국대(WISE)·순천향=순천향대).
const GRAD_31_ONLY = new Set<string>([
  '가천대|약학', '가천대|의예', '가천대|한의예', '가톨릭관동대|의예', '가톨릭대|약학', '가톨릭대|의예', '강원대|수의예', '강원대|약학',
  '강원대|의예', '건국대(글로컬)|의예', '건양대|의예', '경북대|수의예', '경북대|약학', '경북대|의예', '경북대|치의예', '경상국립대|수의예',
  '경상국립대|약학', '경상국립대|의예', '경성대|약학', '계명대|약학', '계명대|의예', '고신대|의예', '대구가톨릭대|약학', '대구가톨릭대|의예',
  '대구한의대|한의예', '덕성여대|약학', '동국대(WISE)|의예', '동국대(WISE)|한의예', '동신대|한의예', '동아대|의예', '동의대|한의예',
  '삼육대|약학', '상지대|한의예', '세명대|한의예', '순천향대|의예', '아주대|의예', '영남대|약학', '영남대|의예', '우석대|약학', '우석대|한의예',
  '울산대|의예', '원광대|약학', '원광대|의예', '원광대|치의예', '원광대|한의예', '인제대|약학', '인제대|의예', '전남대|수의예', '전남대|약학',
  '전남대|의예', '전남대|치의예', '전북대|수의예', '전북대|약학', '전북대|의예', '전북대|치의예', '조선대|약학', '조선대|의예', '조선대|치의예',
  '차의과대|약학', '한림대|의예', '한양대(ERICA)|약학',
]);

export function findRule(univ: string, _admName: string, gubun?: string): Rule | null {
  const base = (gubun && GUBUN_RULES[`${univ}|${gubun}`]) ? GUBUN_RULES[`${univ}|${gubun}`] : (RULES[univ] ?? null);
  if (!base) return null;
  // 목록에 있는 대학/계열만 졸업생도 3-1까지 반영 → 반영학기 상한을 3-1('졸업예정자')로 고정.
  // 3-2 성적이 업로드돼 있어도 산출에서 제외됨. 산출식(반영교과·배점·스케일)은 그대로이고 반영 '학기 범위'만 3-1로 고정.
  if (gubun && GRAD_31_ONLY.has(`${univ}|${gubun}`)) {
    return (courses: CourseRecord[], _gt: GradType) => base(courses, '졸업예정자');
  }
  return base; // 목록 외 대학/전형: 졸업생이면 3-2까지 반영(종전과 동일)
}
export function hasRule(univ: string, admName: string, gubun?: string): boolean { return findRule(univ, admName, gubun) != null; }

// 이 (대학|구분)이 '졸업생도 3-1까지만 반영' 목록에 있는지 (카드 표기·검증용)
export function isGrad31Only(univ: string, gubun?: string): boolean {
  return !!(gubun && GRAD_31_ONLY.has(`${univ}|${gubun}`));
}
