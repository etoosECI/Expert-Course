// Expert-Course용 내신 산출 엔진 진입점.
// 원본: etoosECI/naeshin-dashboard (src/engine) — UPSTREAM 파일에 가져온 커밋이 기록되어 있다.
// 산출 우선순위는 원본 GeneralView(DeptCard)와 동일:
//   ① 정밀 규칙(모집요강 산출식·어디가 검증, naeshinRules) → ② customCalc(연세·숭실 등) → ③ 반영과목 가중평균 + 환산 역산 근사
import type { CourseRecord, GradType } from './src/types';
import { findGeneralRule } from './src/engine/naeshinRules';
import { customCalc } from './src/engine/customCalc';
import { genGrade, buildConvMap, genScore, judgeGrade } from './src/engine/genEngine';

export { buildConvMap, judgeGrade };

export interface CalcOut {
  grade: number | null; score: number | null; precise: boolean; method: '정밀 규칙' | '대학별 보정' | '반영과목 평균(근사)' | '산출 불가'; note: string | null;
}

export function calcRecord(r: any, courses: CourseRecord[], gradType: GradType, fit?: any): CalcOut {
  if (!courses.length) return { grade: null, score: null, precise: false, method: '산출 불가', note: null };
  const baseGrade = genGrade(courses, r.spec);
  const custom = customCalc(r.univ, r.admName, r.banyeong, courses);
  const precise = findGeneralRule(r.univ, r.series)?.(courses, gradType ?? '졸업예정자') ?? null;
  const grade = precise?.grade != null ? precise.grade : (custom && custom.grade != null ? custom.grade : baseGrade);
  const fitScore = fit ? genScore(fit, precise?.grade != null ? precise.grade : grade) : null;
  const score = precise?.score != null ? precise.score : (custom && custom.score != null ? custom.score : fitScore);
  const method = precise?.grade != null ? '정밀 규칙' : (custom && (custom.grade != null || custom.score != null)) ? '대학별 보정' : grade != null ? '반영과목 평균(근사)' : '산출 불가';
  return { grade, score, precise: precise?.score != null, method, note: precise?.note ?? custom?.note ?? null };
}

// 대표 내신(전 과목 석차등급 이수단위 가중평균) — 원본 GeneralView overall과 동일
export function overallGrade(courses: CourseRecord[]): number | null {
  const list = courses.filter((c) => c.rank != null && (c.units || 0) > 0);
  if (!list.length) return null;
  let sw = 0, su = 0; for (const c of list) { sw += c.rank! * c.units; su += c.units; }
  return Math.round((sw / su) * 100) / 100;
}
