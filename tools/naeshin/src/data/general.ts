// 일반대학(대학별 산출) 데이터 — 파일② 입결/전형 + 파일① 대학순서
import raw from './general.json';

export interface GYear { basis: string; comp: number | null; grade: number | null; score: number | null; fill: number | null; }
export interface GSpec {
  ratio: number; areas: string[]; allSubjects: boolean; excludeArts: boolean;
  topN: number | null; perAreaN: number | null; jinro: boolean; zscore: boolean; equalWeight: boolean; flags: string[];
}
export interface GRecord {
  univ: string; series: string; dept: string; admName: string; eligibility: string;
  quota27: number | null; quota26: number | null; deltaFlag: string; deltaChange: string;
  suneung27: string; method27: string; banyeong: string; spec: GSpec; exam27: string;
  y2026: GYear; y2025: GYear; y2024: GYear;
}

const _raw = raw as unknown as { order: string[]; records: GRecord[] };
export const GEN_ORDER: string[] = _raw.order;
export const GEN_RECORDS: GRecord[] = _raw.records;

export type SeriesGroup = 'humanities' | 'natural' | 'etc';
export function seriesGroup(s: string): SeriesGroup {
  return s === '인문' ? 'humanities' : s === '자연' ? 'natural' : 'etc';
}
export const SERIES_TABS: { key: 'all' | SeriesGroup; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'humanities', label: '인문계열' },
  { key: 'natural', label: '자연계열' },
  { key: 'etc', label: '공통·기타' },
];

// 파일① 순서 중 실제 데이터가 있는 대학만
export const GEN_UNIVS: string[] = GEN_ORDER.filter((u) => GEN_RECORDS.some((r) => r.univ === u));

export function recordsOf(univ: string): GRecord[] {
  return GEN_RECORDS.filter((r) => r.univ === univ);
}
