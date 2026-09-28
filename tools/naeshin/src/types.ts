// =====================================================================
// 2027 대학별 내신 산출 대시보드 - 데이터 타입 정의
// 이 파일은 학생부(입력) / 대학 산출식(규칙) / 입결(비교) 세 가지 데이터의
// 공통 구조를 정의합니다. 새 대학·전형·입결을 추가할 때 이 구조를 따르세요.
// =====================================================================

// ---------------------------------------------------------------------
// 1) 학생부 교과 성적 (학생이 입력/업로드하는 데이터)
// ---------------------------------------------------------------------
export type SubjectArea =
  | '국어' | '수학' | '영어' | '사회' | '과학' | '한국사'
  | '한문' | '제2외국어' | '기술가정' | '예술' | '체육' | '기타';

export const SUBJECT_AREAS: SubjectArea[] = [
  '국어', '수학', '영어', '사회', '과학', '한국사',
  '한문', '제2외국어', '기술가정', '예술', '체육', '기타',
];

export type Achievement = 'A' | 'B' | 'C' | 'D' | 'E';

export interface CourseRecord {
  id: string;
  year: 1 | 2 | 3;          // 학년
  semester: 1 | 2;          // 학기
  area: SubjectArea;        // 교과(계열)
  name: string;             // 과목명 (예: 문학, 미적분)
  units: number;            // 이수단위(학점)
  rank?: number | null;     // 석차등급 1~9 (석차등급제)
  rawScore?: number | null; // 원점수
  mean?: number | null;     // 과목평균
  stdev?: number | null;    // 표준편차
  kind?: '공통' | '일반선택' | '진로선택' | null; // 과목 구분(공통/일반/진로) — 일부 대학 공통·일반 차등 반영용
  achievement?: Achievement | null; // 성취도 (A~E)
  distA?: number | null;    // 성취도별 분포비율 A(%)
  distB?: number | null;    // 성취도별 분포비율 B(%)
  distC?: number | null;    // 성취도별 분포비율 C(%)
  studentCount?: number | null; // 수강자 수 (소인수 보정용)
}

export type GradType = '졸업자' | '졸업예정자';

export interface StudentProfile {
  id?: string;        // 학생 고유 ID (학생별 저장용)
  name: string;
  series: '인문' | '자연' | '미정'; // 지원 계열
  gradType?: GradType; // 졸업구분(반영학기 결정). 기본 졸업예정자.
  courses: CourseRecord[];
}

// ---------------------------------------------------------------------
// 2) 대학별 산출식 (규칙)
// ---------------------------------------------------------------------
export type Category = 'medical' | 'contract' | 'humanities' | 'natural' | 'general';

export const CATEGORY_LABEL: Record<Category, string> = {
  medical: '의학계열',
  contract: '계약학과',
  humanities: '인문계열',
  natural: '자연계열',
  general: '공통/기타',
};

// 대학 서열 그룹 (탭 정렬용)
export type TierGroup =
  | 'SKY' | '서울상위' | '서울권' | '수도권' | '지방국립' | '지방사립' | '교대';

export const TIER_ORDER: TierGroup[] = [
  'SKY', '서울상위', '서울권', '수도권', '지방국립', '지방사립', '교대',
];

// 등급 → 반영점수 변환표의 한 행
export interface ConversionRow {
  grade: number; // 등급 (1~9)
  score: number; // 반영점수
}

// 교과 반영 방식
export type CalcMethod =
  | 'unitWeightedRank'   // 이수단위 가중평균 등급 (석차등급 기반) - 가장 일반적
  | 'unitWeightedScore'; // 이수단위 가중평균 등급을 점수표로 변환

// 성취도(A~E) → 변환석차등급 방식
export type AchievementConv =
  | 'none'        // 성취과목 미반영
  | 'ratioBased'  // 성취도별 분포비율로 변환석차등급 산출 (고려대式)
  | 'fixedTable'; // A/B/C... 고정 등급 대응표

export interface SubjectFilter {
  mode: 'all' | 'byArea';
  // byArea 일 때 반영할 교과. 계열별로 다르면 humanitiesAreas/naturalAreas 사용.
  areas?: SubjectArea[];
  humanitiesAreas?: SubjectArea[];
  naturalAreas?: SubjectArea[];
  // 상위 N과목만 반영(있으면). 예: 학년별 상위 3과목 등은 별도 확장 필요.
  topNPerArea?: number | null;
}

export interface AdmissionType {
  id: string;
  name: string;          // 전형명 (예: 학생부교과(학교추천전형))
  category: Category;    // 계열 분류
  programs: string[];    // 대표 모집단위 (예: ['의학과'])

  gradeScale: 9 | 5;     // 등급 체계
  reflectRatio: number;  // 교과 반영비율 (1 = 100%, 0.9 = 90%)
  baseScore: number;     // 기본점수 (총점 = baseScore + 교과점수)
  totalScore: number;    // 전형 총점(만점) - 참고용

  subjectFilter: SubjectFilter;
  yearWeights: { '1': number; '2': number; '3': number } | null; // null=학년 무관

  method: CalcMethod;
  conversion: { table: ConversionRow[]; interpolate: boolean } | null;
  achievementConv: AchievementConv;
  achievementFixedTable?: Record<string, number>; // fixedTable 방식일 때

  suneungMin?: string;   // 수능 최저학력기준 (문구)
  notes?: string;        // 특이사항/보정(소인수 등)
  source?: string;       // 모집요강 출처 (파일/페이지)
}

export interface University {
  id: string;            // 영문 슬러그 (korea, yonsei ...)
  name: string;          // 대학명
  campus?: string;       // 캠퍼스
  tier: TierGroup;
  region: '서울' | '수도권' | '지방';
  admissionTypes: AdmissionType[];
}

// ---------------------------------------------------------------------
// 3) 전년도 입시결과 (입결)
// ---------------------------------------------------------------------
export interface AdmissionResult {
  universityId: string;   // University.id 와 매칭
  admissionTypeId: string;// AdmissionType.id 와 매칭
  program: string;        // 모집단위
  year: number;           // 학년도 (2026, 2025)
  metric: 'grade' | 'score'; // 컷 기준 (등급 or 환산점수)
  cut50?: number | null;  // 50% 컷
  cut70?: number | null;  // 70% 컷
  competition?: number | null; // 경쟁률
  note?: string;
}

// ---------------------------------------------------------------------
// 계산 결과
// ---------------------------------------------------------------------
export interface CalcResult {
  avgGrade: number | null;      // 교과평균등급 (낮을수록 우수)
  subjectScore: number | null;  // 교과평균등급점수 (환산표 적용)
  reflectedScore: number | null;// 교과 반영점수 (× 반영비율)
  totalScore: number | null;    // 총점 (baseScore + reflected)
  usedCourses: number;          // 반영된 과목 수
  totalUnits: number;           // 반영된 총 이수단위
  warnings: string[];
}

export interface ComparedResult {
  university: University;
  admissionType: AdmissionType;
  calc: CalcResult;
  results: AdmissionResult[]; // 해당 전형/모집단위 입결들
}
