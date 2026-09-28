// 대학별 반영교과 기준으로 "내 내신등급(교과평균등급)"을 계산합니다.
// 우선순위 1번: 대학별로 환산한 내신등급.
// 교과평균등급 = Σ(석차등급 × 이수단위) / Σ(이수단위)  (반영교과 · 반영학기 · 상위N 적용)
import type { CourseRecord } from '../types';

export interface MedSpec {
  ratio: number;
  areas: string[];
  allSubjects: boolean;
  excludeArts: boolean;
  semester: string | null; // '3-1' 이면 3학년 2학기 제외
  topN: number | null;
  achievement: boolean;
  zscore: boolean;
  flags: string[];
}

export interface MyGrade {
  grade: number | null; // 교과평균등급 (낮을수록 우수)
  used: number;         // 반영 과목 수
  units: number;        // 반영 총 이수단위
  achievementSkipped: number; // 성취도만 있어 제외된 과목 수(참고)
}

export function myNaeshinGrade(courses: CourseRecord[], spec: MedSpec): MyGrade {
  const inSemester = (c: CourseRecord) =>
    spec.semester === '3-1' ? !(c.year === 3 && c.semester === 2) : true;
  const inArea = (c: CourseRecord) => {
    if (spec.allSubjects) {
      return spec.excludeArts ? !['예술', '체육', '기타'].includes(c.area) : true;
    }
    return spec.areas.includes(c.area);
  };

  const areaCourses = courses.filter((c) => inArea(c) && inSemester(c) && (c.units || 0) > 0);
  const achievementSkipped = areaCourses.filter(
    (c) => (c.rank == null) && !!c.achievement,
  ).length;

  let list = areaCourses.filter((c) => c.rank != null);
  if (spec.topN != null && list.length > spec.topN) {
    list = [...list].sort((a, b) => (a.rank! - b.rank!)).slice(0, spec.topN);
  }
  if (list.length === 0) {
    return { grade: null, used: 0, units: 0, achievementSkipped };
  }
  let sw = 0; let su = 0;
  for (const c of list) { sw += c.rank! * c.units; su += c.units; }
  return {
    grade: Math.round((sw / su) * 1000) / 1000,
    used: list.length, units: su, achievementSkipped,
  };
}

// 유불리 판정 (등급 기준: 낮을수록 우수). 기준선 = 해당 연도 70% 컷.
export type Judge = '우세' | '적정' | '불리' | '정보없음';
export function judge(my: number | null, cut70: number | null | undefined, cut50?: number | null): Judge {
  if (my == null || cut70 == null) return '정보없음';
  if (cut50 != null && my <= cut50 + 1e-9) return '우세'; // 50%컷 이내
  if (my <= cut70 + 1e-9) return '적정';                  // 70%컷 이내
  return '불리';
}
