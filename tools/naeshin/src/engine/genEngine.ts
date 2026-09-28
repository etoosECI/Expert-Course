// 일반대학 산출 엔진: 내 등급(반영과목 가중평균) + 내 환산점수(대학 발표값 역산)
import type { CourseRecord } from '../types';
import type { GRecord, GSpec } from '../data/general';
import { myNaeshinGrade } from './medGrade';

// 내 교과평균등급 — 반영과목 석차등급 이수단위 가중평균(단위미적용이면 단순평균)
export function genGrade(courses: CourseRecord[], spec: GSpec): number | null {
  const adapted = {
    ratio: spec.ratio, areas: spec.areas, allSubjects: spec.allSubjects,
    excludeArts: spec.excludeArts, semester: null, topN: spec.topN,
    achievement: false, zscore: spec.zscore, flags: spec.flags,
  } as any;
  const r = myNaeshinGrade(courses, adapted);
  if (r.grade == null) return null;
  // 단위 미적용(단순평균) 옵션
  if (spec.equalWeight) {
    const inArea = (c: CourseRecord) => spec.allSubjects
      ? (spec.excludeArts ? !['예술', '체육', '기타'].includes(c.area) : true)
      : spec.areas.includes(c.area);
    let list = courses.filter((c) => c.rank != null && inArea(c));
    if (spec.topN != null && list.length > spec.topN) {
      list = [...list].sort((a, b) => a.rank! - b.rank!).slice(0, spec.topN);
    }
    if (list.length === 0) return null;
    const avg = list.reduce((s, c) => s + c.rank!, 0) / list.length;
    return Math.round(avg * 1000) / 1000;
  }
  return r.grade;
}

// ---- 대학별(전형별) 환산 역산: (등급,환산) 점들의 선형 적합(Theil–Sen) ----
export interface ConvFit { ok: boolean; a: number; b: number; scaleMax: number; }

function median(xs: number[]): number {
  const s = [...xs].sort((p, q) => p - q); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// 한 연도의 (등급,환산) 점들로 선형 역산 (같은 연도 = 같은 환산 스케일)
function fitOneYear(pts: [number, number][]): ConvFit {
  const byG = new Map<number, number[]>();
  for (const [g, s] of pts) {
    const k = Math.round(g * 100) / 100;
    (byG.get(k) ?? byG.set(k, []).get(k)!).push(s);
  }
  const uniq: [number, number][] = [...byG.entries()].map(([g, ss]) => [g, ss.reduce((a, b) => a + b, 0) / ss.length]);
  if (uniq.length < 2) return { ok: false, a: 0, b: 0, scaleMax: 0 };
  const slopes: number[] = [];
  for (let i = 0; i < uniq.length; i++) {
    for (let j = i + 1; j < uniq.length; j++) {
      if (uniq[i][0] !== uniq[j][0]) slopes.push((uniq[j][1] - uniq[i][1]) / (uniq[j][0] - uniq[i][0]));
    }
  }
  if (slopes.length === 0) return { ok: false, a: 0, b: 0, scaleMax: 0 };
  const b = median(slopes);
  if (!(b < 0)) return { ok: false, a: 0, b: 0, scaleMax: 0 };
  const a = median(uniq.map(([g, s]) => s - b * g));
  const scaleMax = a + b * 1;
  const maxObs = Math.max(...pts.map((p) => p[1]));
  if (scaleMax <= 0 || scaleMax > maxObs * 1.25 || scaleMax < maxObs * 0.85) return { ok: false, a: 0, b: 0, scaleMax: 0 };
  return { ok: true, a, b, scaleMax };
}

// 대학·전형 환산 역산 — 연도별로 스케일이 바뀔 수 있어 최신 연도(2026 우선)로 적합.
// (3개년 통합 시 스케일 변경으로 기울기가 뒤집히는 문제를 방지)
export function fitConv(records: GRecord[]): ConvFit {
  for (const yk of ['y2026', 'y2025', 'y2024'] as const) {
    const pts: [number, number][] = [];
    for (const r of records) {
      const y = r[yk];
      if (y.grade != null && y.score != null) pts.push([y.grade, y.score]);
    }
    const f = fitOneYear(pts);
    if (f.ok) return f;
  }
  return { ok: false, a: 0, b: 0, scaleMax: 0 };
}

export function genScore(fit: ConvFit, grade: number | null): number | null {
  if (!fit.ok || grade == null) return null;
  const v = fit.a + fit.b * grade;
  if (v < 0) return null;
  return Math.min(v, fit.scaleMax);
}

// (대학, 전형명)별 환산 역산 맵 — 같은 전형은 같은 환산 스케일
export function buildConvMap(records: GRecord[]): Map<string, ConvFit> {
  const groups = new Map<string, GRecord[]>();
  for (const r of records) {
    const k = r.admName || '전형';
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  const out = new Map<string, ConvFit>();
  for (const [k, rs] of groups) out.set(k, fitConv(rs));
  return out;
}

export function judgeGrade(my: number | null, cut: number | null | undefined): '합격권' | '초과' | '정보없음' {
  if (my == null || cut == null) return '정보없음';
  return my <= cut + 1e-9 ? '합격권' : '초과';
}
