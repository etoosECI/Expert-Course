// 대학별 "정밀" 산출 (복잡 전형): 연세대 Z점수, 숭실대 과목별 가중치 등
// 반환: { grade?, score?, exact } — 해당 항목을 기본 산출 대신 사용.
import type { CourseRecord } from '../types';

// 교과명 정규화: "사회(역사/도덕포함)" → "사회"
const aKey = (a: string): string => (a.includes('사회') ? '사회' : a);
// 숭실 등 사회에 한국사 포함하는 경우
const aKeyH = (a: string): string => (a.includes('사회') || a === '한국사' ? '사회' : a);

// 표준정규 누적분포 Φ(z) (erf 근사)
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
function phi(z: number): number { return 0.5 * (1 + erf(z / Math.SQRT2)); }

const YONSEI_AREAS = ['국어', '수학', '영어', '사회', '과학', '한국사'];
const YONSEI_GRADE_PT: Record<number, number> = { 1: 100, 2: 95, 3: 87.5, 4: 75, 5: 60, 6: 40, 7: 25, 8: 12.5, 9: 5 };
const YONSEI_PCT_CAP: Record<number, number> = { 1: 0.04, 2: 0.11, 3: 0.23, 4: 0.40, 5: 0.60, 6: 0.77, 7: 0.89, 8: 0.96, 9: 1.0 };

// 연세대 추천형 교과점수(100점) — 어디가 공식 정밀 재현.
//   반영과목 A = 공통과목점수 × 0.3 + 일반선택점수 × 0.5 + 진로선택점수
//   공통/일반 각각: ((Σ등급점수×단위 + ΣZ점수×단위) / Σ단위) / 2   [등급50%+Z50%]
//   Z점수 = 100×(1-석차백분율), 석차백분율 = 1-Φ((원점수-평균)/표준편차), 등급별 상한(YONSEI_PCT_CAP)
//   진로선택 = Σ(성취도변환 × 단위)/Σ단위 (A20·B15·C10). 김혜령 연세대 의예 = 96.36 (어디가 96.3647078) 검증.
export function yonseiScore(courses: CourseRecord[]): { score: number | null; exact: boolean } {
  const inArea = (c: CourseRecord) => YONSEI_AREAS.includes(c.area);
  const rankCourses = courses.filter((c) => inArea(c) && c.rank != null && (c.units || 0) > 0);
  const jinroCourses = courses.filter((c) => inArea(c) && c.rank == null && c.achievement && (c.units || 0) > 0);
  if (rankCourses.length === 0) return { score: null, exact: false };

  // 공통과목 판별: kind 우선, 없으면 과목명(2015 개정 공통과목)으로
  const isCommon = (c: CourseRecord): boolean => {
    if (c.kind === '공통') return true;
    if (c.kind === '일반선택' || c.kind === '진로선택') return false;
    const n = String(c.name).replace(/\s/g, '');
    return /^(국어|수학|영어|한국사)$/.test(n) || /^통합사회/.test(n) || /^통합과학/.test(n) || /^과학탐구실험/.test(n);
  };

  let hasZ = true;
  let cSum = 0, cU = 0, gSum = 0, gU = 0; // 공통/일반 각각 Σ((등급+Z)×단위), Σ단위
  for (const c of rankCourses) {
    const gradePt = YONSEI_GRADE_PT[c.rank!] ?? 0;
    let zScore: number;
    if (c.rawScore != null && c.mean != null && c.stdev != null && c.stdev > 0) {
      let z = (c.rawScore - c.mean) / c.stdev;
      z = Math.round(z * 10) / 10;
      z = Math.max(-3, Math.min(3, z));
      let pct = 1 - phi(z); // 석차백분율(상위비율)
      const cap = YONSEI_PCT_CAP[c.rank!] ?? 1;
      if (pct > cap) pct = cap;
      zScore = 100 * (1 - pct);
    } else {
      hasZ = false;
      zScore = gradePt; // 원점수/표준편차 없으면 등급점수로 대체(근사)
    }
    const s = (gradePt + zScore) * c.units;
    if (isCommon(c)) { cSum += s; cU += c.units; } else { gSum += s; gU += c.units; }
  }
  const common = cU > 0 ? (cSum / cU) / 2 : 0;   // 공통과목 점수(0~100)
  const general = gU > 0 ? (gSum / gU) / 2 : 0;   // 일반선택 점수(0~100)

  // 진로선택 (A=20,B=15,C=10; 5단계 D/E는 B/C로) — 20점 만점
  let jw = 0, ju = 0;
  const jpt: Record<string, number> = { A: 20, B: 15, C: 10, D: 15, E: 10 };
  for (const c of jinroCourses) { jw += (jpt[c.achievement!] ?? 15) * c.units; ju += c.units; }
  const jinro = ju > 0 ? jw / ju : 0;

  const total = common * 0.3 + general * 0.5 + jinro; // 반영과목 A
  return { score: Math.round(total * 100) / 100, exact: hasZ };
}

// ─────────────────────────────────────────────────────────────
// 한국외대 학교장추천전형 — 등급점수표(모집요강 38p) 직접 산출.
// 입결이 "환산점수(1,000점)"만 공개(등급 미공개)라 역산 불가 → 공식 등급점수표로 내 환산 계산.
// 교과점수 = Σ[학점×(등급환산 또는 원점수환산 중 상윗값)] + Σ[학점×성취도환산] / 총학점
// ─────────────────────────────────────────────────────────────
const HUFS_AREAS = ['국어', '수학', '영어', '사회', '과학', '한국사'];
const HUFS_GRADE_PT: Record<number, number> = { 1: 1000, 2: 960, 3: 890, 4: 770, 5: 600, 6: 400, 7: 230, 8: 110, 9: 0 };
const HUFS_ACH_PT: Record<string, number> = { A: 1000, B: 960, C: 890, D: 890, E: 890 };
// 원점수 환산: [최소점수, 환산점수] 내림차순 (국·영·사·과·한)
const HUFS_RAW_COMMON: [number, number][] = [[90, 1000], [85, 960], [80, 890], [75, 770], [70, 600], [60, 400], [50, 230], [40, 110], [0, 0]];
// 원점수 환산: 수학(구간이 더 완만)
const HUFS_RAW_MATH: [number, number][] = [[90, 1000], [80, 960], [70, 890], [60, 770], [50, 600], [40, 400], [30, 230], [20, 110], [0, 0]];
function hufsRawPt(area: string, raw: number): number {
  const tbl = area === '수학' ? HUFS_RAW_MATH : HUFS_RAW_COMMON;
  for (const [min, pt] of tbl) if (raw >= min) return pt;
  return 0;
}
export function hufsScore(courses: CourseRecord[]): { score: number | null; exact: boolean } {
  const inArea = (c: CourseRecord) => HUFS_AREAS.includes(c.area);
  let sw = 0; let su = 0; let usedRaw = false; let anyRankMissingRaw = false;
  for (const c of courses) {
    if (!inArea(c) || (c.units || 0) <= 0) continue;
    let pt: number | null = null;
    if (c.rank != null) {
      const gradePt = HUFS_GRADE_PT[c.rank] ?? 0;
      if (c.rawScore != null) { const rp = hufsRawPt(c.area, c.rawScore); pt = Math.max(gradePt, rp); usedRaw = true; }
      else { pt = gradePt; anyRankMissingRaw = true; }
    } else if (c.achievement) {
      pt = HUFS_ACH_PT[c.achievement] ?? 890; // 진로선택 성취도 환산
    }
    if (pt == null) continue;
    sw += pt * c.units; su += c.units;
  }
  if (su === 0) return { score: null, exact: false };
  // 소수점 6자리 미만 절사(모집요강 규정)
  const raw = sw / su;
  const score = Math.floor(raw * 1e5) / 1e5;
  // 원점수를 하나라도 못 쓴 석차과목이 있으면 상윗값 적용이 근사 → exact=false
  return { score: Math.round(score * 100) / 100, exact: usedRaw && !anyRankMissingRaw };
}

// 숭실대 과목별 가중치 등급 — banyeong에서 국(35),수(15),영(35),사(15) 등 파싱
const W_AREA: Record<string, string> = { 국: '국어', 수: '수학', 영: '영어', 사: '사회', 과: '과학', 한: '한국사' };
export function parseWeights(banyeong: string): Record<string, number> | null {
  const out: Record<string, number> = {};
  const re = /([국수영사과한])\s*\(\s*(\d+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(banyeong)) !== null) out[W_AREA[m[1]]] = (out[W_AREA[m[1]]] ?? 0) + Number(m[2]);
  return Object.keys(out).length >= 2 ? out : null;
}
export function weightedGrade(courses: CourseRecord[], weights: Record<string, number>): number | null {
  let sw = 0; let ws = 0;
  for (const [area, w] of Object.entries(weights)) {
    const cs = courses.filter((c) => aKeyH(c.area) === area && c.rank != null && (c.units || 0) > 0);
    if (cs.length === 0) continue;
    let g = 0; let u = 0;
    for (const c of cs) { g += c.rank! * c.units; u += c.units; }
    sw += (g / u) * w; ws += w;
  }
  if (ws === 0) return null;
  return Math.round((sw / ws) * 1000) / 1000;
}

// 숭실대 교과우수자 환산점수 — 공통/일반: Σ[교과((Σ배점×단위)/단위)×(가중치/100)]×8,
//   진로: (가중치평균 진로배점)×2×(최대취득비율/20). 배점 10스케일, 진로 A1·B2·C3등급→배점
const SS_BAE: Record<number, number> = { 1: 10, 2: 9.5, 3: 9, 4: 8.5, 5: 8, 6: 7, 7: 6, 8: 4, 9: 0 };
const SS_JIN: Record<string, number> = { A: 1, B: 2, C: 3 };
export function soongsilScore(courses: CourseRecord[], weights: Record<string, number>): number | null {
  let common = 0;
  for (const [area, w] of Object.entries(weights)) {
    const cs = courses.filter((c) => aKeyH(c.area) === area && c.rank != null && (c.units || 0) > 0);
    if (!cs.length) continue;
    let sg = 0, u = 0; for (const c of cs) { sg += SS_BAE[c.rank!] * c.units; u += c.units; }
    common += (sg / u) * (w / 100);
  }
  common *= 8;
  let jw = 0, jws = 0, jcount = 0;
  for (const [area, w] of Object.entries(weights)) {
    const cs = courses.filter((c) => aKeyH(c.area) === area && c.rank == null && c.achievement && SS_JIN[c.achievement] != null && (c.units || 0) > 0);
    if (!cs.length) continue;
    let sg = 0, u = 0; for (const c of cs) { sg += SS_BAE[SS_JIN[c.achievement!]] * c.units; u += c.units; jcount++; }
    jw += (sg / u) * (w / 100); jws += w / 100;
  }
  const chwideuk = jcount >= 3 ? 20 : jcount === 2 ? 18 : jcount === 1 ? 16 : 0;
  const jinro = jws > 0 ? (jw / jws) * 2 * (chwideuk / 20) : 0;
  return Math.round((common + jinro) * 1000) / 1000;
}

// 성균관대 A군(국수영한사과)×7 + B군(기술가정·제2외국어·한문)×1, 등급점수 배점표
const SKKU_A = new Set(['국어', '수학', '영어', '한국사', '사회', '과학']);
const SKKU_B = new Set(['기술·가정', '기술가정', '제2외국어', '한문']);
const SKKU_BAE_A: Record<number, number> = { 1: 100, 2: 96, 3: 90, 4: 80, 5: 66, 6: 50, 7: 30, 8: 15, 9: 0 };
const SKKU_BAE_B: Record<number, number> = { 1: 100, 2: 98, 3: 95, 4: 90, 5: 85, 6: 75, 7: 65, 8: 50, 9: 30 };
export function skkuScore(courses: CourseRecord[]): { score: number | null; exact: boolean } {
  const grp = (set: Set<string>, bae: Record<number, number>) => {
    const cs = courses.filter((c) => set.has(aKey(c.area)) && c.rank != null && (c.units || 0) > 0);
    if (!cs.length) return null;
    let sg = 0, u = 0; for (const c of cs) { sg += bae[c.rank!] * c.units; u += c.units; }
    return sg / u;
  };
  const a = grp(SKKU_A, SKKU_BAE_A); const b = grp(SKKU_B, SKKU_BAE_B);
  if (a == null) return { score: null, exact: false };
  const score = a * 7 + (b ?? 0) * 1;
  return { score: Math.round(score * 100) / 100, exact: true };
}

// 디스패처: 특정 대학·전형은 정밀식 사용
export function customCalc(
  univ: string, admName: string, banyeong: string, courses: CourseRecord[],
): { grade?: number | null; score?: number | null; exact: boolean; note?: string } | null {
  if (univ === '연세대' && admName.includes('추천형')) {
    const r = yonseiScore(courses);
    return { score: r.score, exact: r.exact, note: r.exact ? '연세대 공식식(등급50%+Z50%)' : '연세대식(원점수 없어 등급점수 근사)' };
  }
  if (univ === '한국외대') {
    const r = hufsScore(courses);
    return { score: r.score, exact: r.exact, note: r.exact ? '한국외대 공식 등급점수표(1,000점)' : '한국외대 등급점수표(원점수 없어 등급환산만·근사)' };
  }
  if (univ === '숭실대') {
    const w = parseWeights(banyeong);
    if (w) {
      const g = weightedGrade(courses, w);
      const sc = soongsilScore(courses, w);
      const label = Object.entries(w).map(([a, v]) => `${a[0]}${v}`).join('·');
      return { grade: g, score: sc, exact: true, note: `숭실 교과우수자 과목별 가중치(${label}), 공통×8+진로20` };
    }
  }
  if (univ === '성균관대') {
    const r = skkuScore(courses);
    return { score: r.score, exact: r.exact, note: '성균관 A군(국수영한사과)×7 + B군(제2외국어 등)×1' };
  }
  return null;
}
