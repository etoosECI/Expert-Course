// 자동 생성 파일 — 수정하지 마세요. 원본: etoosECI/naeshin-dashboard (tools/naeshin/build.sh로 재생성)

// tools/naeshin/src/engine/customCalc.ts
var aKey = (a) => a.includes("\uC0AC\uD68C") ? "\uC0AC\uD68C" : a;
var aKeyH = (a) => a.includes("\uC0AC\uD68C") || a === "\uD55C\uAD6D\uC0AC" ? "\uC0AC\uD68C" : a;
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
function phi(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}
var YONSEI_AREAS = ["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uC0AC\uD68C", "\uACFC\uD559", "\uD55C\uAD6D\uC0AC"];
var YONSEI_GRADE_PT = { 1: 100, 2: 95, 3: 87.5, 4: 75, 5: 60, 6: 40, 7: 25, 8: 12.5, 9: 5 };
var YONSEI_PCT_CAP = { 1: 0.04, 2: 0.11, 3: 0.23, 4: 0.4, 5: 0.6, 6: 0.77, 7: 0.89, 8: 0.96, 9: 1 };
function yonseiScore(courses) {
  const inArea = (c) => YONSEI_AREAS.includes(c.area);
  const rankCourses = courses.filter((c) => inArea(c) && c.rank != null && (c.units || 0) > 0);
  const jinroCourses = courses.filter((c) => inArea(c) && c.rank == null && c.achievement && (c.units || 0) > 0);
  if (rankCourses.length === 0) return { score: null, exact: false };
  const isCommon = (c) => {
    if (c.kind === "\uACF5\uD1B5") return true;
    if (c.kind === "\uC77C\uBC18\uC120\uD0DD" || c.kind === "\uC9C4\uB85C\uC120\uD0DD") return false;
    const n = String(c.name).replace(/\s/g, "");
    return /^(국어|수학|영어|한국사)$/.test(n) || /^통합사회/.test(n) || /^통합과학/.test(n) || /^과학탐구실험/.test(n);
  };
  let hasZ = true;
  let cSum = 0, cU = 0, gSum = 0, gU = 0;
  for (const c of rankCourses) {
    const gradePt = YONSEI_GRADE_PT[c.rank] ?? 0;
    let zScore;
    if (c.rawScore != null && c.mean != null && c.stdev != null && c.stdev > 0) {
      let z = (c.rawScore - c.mean) / c.stdev;
      z = Math.round(z * 10) / 10;
      z = Math.max(-3, Math.min(3, z));
      let pct = 1 - phi(z);
      const cap = YONSEI_PCT_CAP[c.rank] ?? 1;
      if (pct > cap) pct = cap;
      zScore = 100 * (1 - pct);
    } else {
      hasZ = false;
      zScore = gradePt;
    }
    const s = (gradePt + zScore) * c.units;
    if (isCommon(c)) {
      cSum += s;
      cU += c.units;
    } else {
      gSum += s;
      gU += c.units;
    }
  }
  const common = cU > 0 ? cSum / cU / 2 : 0;
  const general = gU > 0 ? gSum / gU / 2 : 0;
  let jw = 0, ju = 0;
  const jpt = { A: 20, B: 15, C: 10, D: 15, E: 10 };
  for (const c of jinroCourses) {
    jw += (jpt[c.achievement] ?? 15) * c.units;
    ju += c.units;
  }
  const jinro = ju > 0 ? jw / ju : 0;
  const total = common * 0.3 + general * 0.5 + jinro;
  return { score: Math.round(total * 100) / 100, exact: hasZ };
}
var HUFS_AREAS = ["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uC0AC\uD68C", "\uACFC\uD559", "\uD55C\uAD6D\uC0AC"];
var HUFS_GRADE_PT = { 1: 1e3, 2: 960, 3: 890, 4: 770, 5: 600, 6: 400, 7: 230, 8: 110, 9: 0 };
var HUFS_ACH_PT = { A: 1e3, B: 960, C: 890, D: 890, E: 890 };
var HUFS_RAW_COMMON = [[90, 1e3], [85, 960], [80, 890], [75, 770], [70, 600], [60, 400], [50, 230], [40, 110], [0, 0]];
var HUFS_RAW_MATH = [[90, 1e3], [80, 960], [70, 890], [60, 770], [50, 600], [40, 400], [30, 230], [20, 110], [0, 0]];
function hufsRawPt(area, raw) {
  const tbl = area === "\uC218\uD559" ? HUFS_RAW_MATH : HUFS_RAW_COMMON;
  for (const [min, pt] of tbl) if (raw >= min) return pt;
  return 0;
}
function hufsScore(courses) {
  const inArea = (c) => HUFS_AREAS.includes(c.area);
  let sw = 0;
  let su = 0;
  let usedRaw = false;
  let anyRankMissingRaw = false;
  for (const c of courses) {
    if (!inArea(c) || (c.units || 0) <= 0) continue;
    let pt = null;
    if (c.rank != null) {
      const gradePt = HUFS_GRADE_PT[c.rank] ?? 0;
      if (c.rawScore != null) {
        const rp = hufsRawPt(c.area, c.rawScore);
        pt = Math.max(gradePt, rp);
        usedRaw = true;
      } else {
        pt = gradePt;
        anyRankMissingRaw = true;
      }
    } else if (c.achievement) {
      pt = HUFS_ACH_PT[c.achievement] ?? 890;
    }
    if (pt == null) continue;
    sw += pt * c.units;
    su += c.units;
  }
  if (su === 0) return { score: null, exact: false };
  const raw = sw / su;
  const score = Math.floor(raw * 1e5) / 1e5;
  return { score: Math.round(score * 100) / 100, exact: usedRaw && !anyRankMissingRaw };
}
var W_AREA = { \uAD6D: "\uAD6D\uC5B4", \uC218: "\uC218\uD559", \uC601: "\uC601\uC5B4", \uC0AC: "\uC0AC\uD68C", \uACFC: "\uACFC\uD559", \uD55C: "\uD55C\uAD6D\uC0AC" };
function parseWeights(banyeong) {
  const out = {};
  const re = /([국수영사과한])\s*\(\s*(\d+)\s*\)/g;
  let m;
  while ((m = re.exec(banyeong)) !== null) out[W_AREA[m[1]]] = (out[W_AREA[m[1]]] ?? 0) + Number(m[2]);
  return Object.keys(out).length >= 2 ? out : null;
}
function weightedGrade(courses, weights) {
  let sw = 0;
  let ws = 0;
  for (const [area, w] of Object.entries(weights)) {
    const cs = courses.filter((c) => aKeyH(c.area) === area && c.rank != null && (c.units || 0) > 0);
    if (cs.length === 0) continue;
    let g = 0;
    let u = 0;
    for (const c of cs) {
      g += c.rank * c.units;
      u += c.units;
    }
    sw += g / u * w;
    ws += w;
  }
  if (ws === 0) return null;
  return Math.round(sw / ws * 1e3) / 1e3;
}
var SS_BAE = { 1: 10, 2: 9.5, 3: 9, 4: 8.5, 5: 8, 6: 7, 7: 6, 8: 4, 9: 0 };
var SS_JIN = { A: 1, B: 2, C: 3 };
function soongsilScore(courses, weights) {
  let common = 0;
  for (const [area, w] of Object.entries(weights)) {
    const cs = courses.filter((c) => aKeyH(c.area) === area && c.rank != null && (c.units || 0) > 0);
    if (!cs.length) continue;
    let sg = 0, u = 0;
    for (const c of cs) {
      sg += SS_BAE[c.rank] * c.units;
      u += c.units;
    }
    common += sg / u * (w / 100);
  }
  common *= 8;
  let jw = 0, jws = 0, jcount = 0;
  for (const [area, w] of Object.entries(weights)) {
    const cs = courses.filter((c) => aKeyH(c.area) === area && c.rank == null && c.achievement && SS_JIN[c.achievement] != null && (c.units || 0) > 0);
    if (!cs.length) continue;
    let sg = 0, u = 0;
    for (const c of cs) {
      sg += SS_BAE[SS_JIN[c.achievement]] * c.units;
      u += c.units;
      jcount++;
    }
    jw += sg / u * (w / 100);
    jws += w / 100;
  }
  const chwideuk = jcount >= 3 ? 20 : jcount === 2 ? 18 : jcount === 1 ? 16 : 0;
  const jinro = jws > 0 ? jw / jws * 2 * (chwideuk / 20) : 0;
  return Math.round((common + jinro) * 1e3) / 1e3;
}
var SKKU_A = /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uD55C\uAD6D\uC0AC", "\uC0AC\uD68C", "\uACFC\uD559"]);
var SKKU_B = /* @__PURE__ */ new Set(["\uAE30\uC220\xB7\uAC00\uC815", "\uAE30\uC220\uAC00\uC815", "\uC81C2\uC678\uAD6D\uC5B4", "\uD55C\uBB38"]);
var SKKU_BAE_A = { 1: 100, 2: 96, 3: 90, 4: 80, 5: 66, 6: 50, 7: 30, 8: 15, 9: 0 };
var SKKU_BAE_B = { 1: 100, 2: 98, 3: 95, 4: 90, 5: 85, 6: 75, 7: 65, 8: 50, 9: 30 };
function skkuScore(courses) {
  const grp = (set, bae) => {
    const cs = courses.filter((c) => set.has(aKey(c.area)) && c.rank != null && (c.units || 0) > 0);
    if (!cs.length) return null;
    let sg = 0, u = 0;
    for (const c of cs) {
      sg += bae[c.rank] * c.units;
      u += c.units;
    }
    return sg / u;
  };
  const a = grp(SKKU_A, SKKU_BAE_A);
  const b = grp(SKKU_B, SKKU_BAE_B);
  if (a == null) return { score: null, exact: false };
  const score = a * 7 + (b ?? 0) * 1;
  return { score: Math.round(score * 100) / 100, exact: true };
}
function customCalc(univ, admName, banyeong, courses) {
  if (univ === "\uC5F0\uC138\uB300" && admName.includes("\uCD94\uCC9C\uD615")) {
    const r = yonseiScore(courses);
    return { score: r.score, exact: r.exact, note: r.exact ? "\uC5F0\uC138\uB300 \uACF5\uC2DD\uC2DD(\uB4F1\uAE0950%+Z50%)" : "\uC5F0\uC138\uB300\uC2DD(\uC6D0\uC810\uC218 \uC5C6\uC5B4 \uB4F1\uAE09\uC810\uC218 \uADFC\uC0AC)" };
  }
  if (univ === "\uD55C\uAD6D\uC678\uB300") {
    const r = hufsScore(courses);
    return { score: r.score, exact: r.exact, note: r.exact ? "\uD55C\uAD6D\uC678\uB300 \uACF5\uC2DD \uB4F1\uAE09\uC810\uC218\uD45C(1,000\uC810)" : "\uD55C\uAD6D\uC678\uB300 \uB4F1\uAE09\uC810\uC218\uD45C(\uC6D0\uC810\uC218 \uC5C6\uC5B4 \uB4F1\uAE09\uD658\uC0B0\uB9CC\xB7\uADFC\uC0AC)" };
  }
  if (univ === "\uC22D\uC2E4\uB300") {
    const w = parseWeights(banyeong);
    if (w) {
      const g = weightedGrade(courses, w);
      const sc = soongsilScore(courses, w);
      const label = Object.entries(w).map(([a, v]) => `${a[0]}${v}`).join("\xB7");
      return { grade: g, score: sc, exact: true, note: `\uC22D\uC2E4 \uAD50\uACFC\uC6B0\uC218\uC790 \uACFC\uBAA9\uBCC4 \uAC00\uC911\uCE58(${label}), \uACF5\uD1B5\xD78+\uC9C4\uB85C20` };
    }
  }
  if (univ === "\uC131\uADE0\uAD00\uB300") {
    const r = skkuScore(courses);
    return { score: r.score, exact: r.exact, note: "\uC131\uADE0\uAD00 A\uAD70(\uAD6D\uC218\uC601\uD55C\uC0AC\uACFC)\xD77 + B\uAD70(\uC81C2\uC678\uAD6D\uC5B4 \uB4F1)\xD71" };
  }
  return null;
}

// tools/naeshin/src/engine/naeshinRules.ts
function areaKey(a) {
  return a.includes("\uC0AC\uD68C") ? "\uC0AC\uD68C" : a;
}
var hasRank = (c) => c.rank != null && Number.isInteger(c.rank) && c.rank >= 1 && c.rank <= 9;
var semNo = (c) => c.year * 10 + c.semester;
var trunc = (x, d) => {
  const f = 10 ** d;
  return Math.floor(x * f) / f;
};
var round = (x, d) => {
  const f = 10 ** d;
  return Math.round(x * f) / f;
};
var lin = (base, step) => {
  const o = {};
  for (let i = 1; i <= 9; i++) o[i] = base - step * (i - 1);
  return o;
};
var KUK = /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uC0AC\uD68C", "\uACFC\uD559", "\uD55C\uAD6D\uC0AC"]);
var KUS = /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uC0AC\uD68C", "\uACFC\uD559"]);
var KUE = /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uACFC\uD559"]);
var KUEH = /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uACFC\uD559", "\uD55C\uAD6D\uC0AC"]);
function pick(courses, areas, le2, gwatam = false) {
  const seok = [];
  const jinro = [];
  for (const c of courses) {
    if (areas && !areas.has(areaKey(c.area)) || (c.units || 0) <= 0 || semNo(c) > le2) continue;
    if (c.name === "\uACFC\uD559\uD0D0\uAD6C\uC2E4\uD5D8" && !gwatam) continue;
    if (hasRank(c)) seok.push(c);
    else if (c.achievement && "ABCDE".includes(c.achievement)) jinro.push(c);
  }
  return { seok, jinro };
}
function wavg(items) {
  const su = items.reduce((s, i) => s + i[1], 0);
  return su > 0 ? items.reduce((s, i) => s + i[0] * i[1], 0) / su : null;
}
var seokAvg = (s) => wavg(s.map((c) => [c.rank, c.units]));
var baeAvg = (s, bae) => wavg(s.map((c) => [bae[c.rank], c.units]));
var jinMap = (j, m) => j.filter((c) => m[c.achievement] != null).map((c) => [m[c.achievement], c.units]);
var topByGrade = (j, m, n) => [...j].filter((c) => m[c.achievement] != null).sort((a, b) => m[a.achievement] - m[b.achievement]).slice(0, n);
var topByPt = (j, m, n) => [...j].filter((c) => m[c.achievement] != null).sort((a, b) => m[b.achievement] - m[a.achievement]).slice(0, n);
var le = (gt, dropGrad = 31) => gt === "\uC878\uC5C5\uC790" ? 32 : dropGrad;
function bratio(pct) {
  const B = [[4, 1], [11, 2], [23, 3], [40, 4], [60, 5], [77, 6], [89, 7], [96, 8], [100, 9]];
  for (const [b, g] of B) if (pct <= b) return g;
  return 9;
}
function convKorea(c) {
  const a = c.achievement;
  const dA = c.distA ?? 0, dB = c.distB ?? 0, dC = c.distC ?? 0;
  if (a === "A") return 1;
  if (a === "B") return bratio(dA) + (dA + dB) / 100;
  if (a === "C") return bratio(dA + dB) + (dA + dB + dC) / 100;
  return null;
}
function convInt(c) {
  const a = c.achievement;
  const dA = c.distA ?? 0, dB = c.distB ?? 0;
  if (a === "A") return 1;
  if (a === "B") return bratio(dA);
  if (a === "C") return bratio(dA + dB);
  return null;
}
var hasDist = (c) => !!(c.distA || c.distB || c.distC);
function jinroDist(courses, areas, le2, conv) {
  const items = [];
  for (const c of courses) {
    if (c.name === "\uACFC\uD559\uD0D0\uAD6C\uC2E4\uD5D8" || (c.units || 0) <= 0 || semNo(c) > le2) continue;
    if (areas && !areas.has(areaKey(c.area))) continue;
    if (c.rank != null || !c.achievement || !hasDist(c)) continue;
    const g = conv(c);
    if (g != null) items.push([g, c.units]);
  }
  return items;
}
function jinroDistC(courses, areas, le2, conv) {
  return jinroDist(courses, areas, le2, conv).map(([g, u]) => ({ g: Math.round(g), u }));
}
var KOREA_ALL = /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uC0AC\uD68C", "\uACFC\uD559", "\uD55C\uAD6D\uC0AC", "\uAE30\uC220\xB7\uAC00\uC815", "\uC81C2\uC678\uAD6D\uC5B4", "\uAD50\uC591", "\uC608\uC220", "\uCCB4\uC721"]);
var CN_AREAS = /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uC0AC\uD68C", "\uACFC\uD559", "\uD55C\uAD6D\uC0AC", "\uAE30\uC220\xB7\uAC00\uC815", "\uC81C2\uC678\uAD6D\uC5B4"]);
function interpScore(grade, bp) {
  const n = Math.floor(grade);
  const hi = bp[Math.min(n, 9)];
  const lo = bp[Math.min(n + 1, 9)];
  return (hi - lo) * (n + 1 - grade) + lo;
}
var R = (grade, score, scoreMax, subjOnly, sv, note) => ({ grade: grade == null ? null : round(grade, 4), score: score == null ? null : round(score, 2), scoreMax, scoreIsSubjectOnly: subjOnly, scoreVerified: sv, note });
var CAT_BAE = { 1: 100, 2: 99, 3: 98, 4: 97, 5: 96, 6: 95, 7: 94, 8: 88, 9: 70 };
var RULES = {
  // 가톨릭대 지역균형: 국수영사과한 3-1(졸업자·예정 동일), 진로/성취도 A1·B2·C4, 과탐 A1. 배점×10
  "\uAC00\uD1A8\uB9AD\uB300": (cs) => {
    const { seok, jinro } = pick(cs, KUK, 31, true);
    const M = { A: 1, B: 2, C: 4 };
    const items = [...seok.map((c) => [c.rank, c.units]), ...jinMap(jinro, M)];
    const g = wavg(items);
    const su = items.reduce((s, i) => s + i[1], 0);
    const sc = round(round(items.reduce((s, i) => s + CAT_BAE[i[0]] * i[1], 0) / su, 4) * 10, 2);
    return R(g, sc, 1e3, false, true, "\uAC00\uD1A8\uB9AD \uC9C0\uC5ED\uADE0\uD615: \uAD6D\uC218\uC601\uC0AC\uACFC\uD55C 3-1, \uC9C4\uB85C A1\xB7B2\xB7C4, \uBC30\uC810\uD45C 1000\uC810");
  },
  // 울산대 지역교과(의예): 공통 100/석차평균+540, 진로 80/환산평균(A1·B4·C8). 출결 제외 교과점수
  "\uC6B8\uC0B0\uB300": (cs) => {
    const { seok, jinro } = pick(cs, KUK, 31);
    const g = seokAvg(seok);
    const jg = wavg(jinMap(jinro, { A: 1, B: 4, C: 8 }));
    const sc = g == null ? null : 100 / trunc(g, 2) + 540 + (jg == null ? 0 : 80 / trunc(jg, 3));
    return R(g, sc, 720, true, true, "\uC6B8\uC0B0 \uC9C0\uC5ED\uAD50\uACFC(\uC758\uC608): 100/\uC11D\uCC28\uD3C9\uADE0+540 \xB7 \uC9C4\uB85C 80/\uD658\uC0B0\uD3C9\uADE0. \uCD9C\uACB0 \uC81C\uC678");
  },
  // 경희대 지역균형: 국영수사과한(졸업자 전학년/예정 3-1), 진로 상위3 A100·B80·C60. 교과A(비교과 제외)
  // 경희대 지역균형: 총점 700(교과 80%=560 + 비교과 20%). 공통일반 국수영사과한 배점 100/96/89/77/60/40/23/11/0,
  //   진로 국수영사과 상위3 A100·B80·C60. 교과점수(100)=공통×0.8+진로×0.2 → 교과 부분=×5.6. 비교과 제외
  "\uACBD\uD76C\uB300": (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt));
    const g = seokAvg(seok);
    const BAE = { 1: 100, 2: 96, 3: 89, 4: 77, 5: 60, 6: 40, 7: 23, 8: 11, 9: 0 };
    const common = baeAvg(seok, BAE);
    const JP = { A: 100, B: 80, C: 60 };
    const t3 = topByPt(jinro.filter((c) => KUS.has(areaKey(c.area))), JP, 3);
    const jsc = wavg(t3.map((c) => [JP[c.achievement], c.units]));
    const gyo = g == null ? null : (common ?? 0) * 0.8 + (jsc ?? 0) * 0.2;
    return R(g, gyo == null ? null : round(gyo * 5.6, 2), 700, true, true, "\uACBD\uD76C \uC9C0\uC5ED\uADE0\uD615: \uACF5\uD1B5\uC77C\uBC18 \uBC30\uC810(100/96/89/77\u2026)\xD70.8+\uC9C4\uB85C\uC0C1\uC7043(A100\xB7B80\xB7C60)\xD70.2, \uAD50\uACFC \uBD80\uBD84 \xD75.6(700 \uB9CC\uC810). \uBE44\uAD50\uACFC \uC81C\uC678");
  },
  // 가천대 학생부우수자: 국수영과 3-1, 진로 미반영. 배점 1=100·2=99.5…
  "\uAC00\uCC9C\uB300": (cs) => {
    const { seok } = pick(cs, KUE, 31);
    return R(
      seokAvg(seok),
      round((baeAvg(seok, lin(100, 0.5)) ?? 0) * 10, 2),
      1e3,
      false,
      true,
      "\uAC00\uCC9C \uD559\uC0DD\uBD80\uC6B0\uC218\uC790: \uAD6D\uC218\uC601\uACFC 3-1, \uC9C4\uB85C \uBBF8\uBC18\uC601, \uBC30\uC810 1000\uC810"
    );
  },
  // 아주대 고교추천: 국수영사과 3-1, 진로 점수 상위5 A100·B98·C90(20%)
  "\uC544\uC8FC\uB300": (cs) => {
    const { seok, jinro } = pick(cs, KUS, 31);
    const g = seokAvg(seok);
    const BAE = { 1: 100, 2: 99, 3: 98, 4: 95, 5: 92, 6: 89, 7: 86, 8: 83, 9: 80 };
    const ACH = { A: 100, B: 98, C: 90 };
    const uS = seok.reduce((s, c) => s + c.units, 0);
    const scS = seok.reduce((s, c) => s + BAE[c.rank] * c.units, 0);
    const t5 = topByPt(jinro, ACH, 5);
    const uJ = t5.reduce((s, c) => s + c.units, 0);
    const scJ = t5.reduce((s, c) => s + ACH[c.achievement] * c.units, 0);
    return R(g, (scS + scJ) / (uS + uJ), 100, false, true, "\uC544\uC8FC \uACE0\uAD50\uCD94\uCC9C: \uAD6D\uC218\uC601\uC0AC\uACFC, \uC9C4\uB85C\uC0C1\uC7045(A100\xB7B98\xB7C90)");
  },
  // 인하대 지역균형: 국수영과(졸업자3-2/예정3-1), 진로 등급상위3 A1·B2·C4. 배점 step2 ×10
  "\uC778\uD558\uB300": (cs, gt) => {
    const { seok, jinro } = pick(cs, KUE, le(gt));
    const M = { A: 1, B: 2, C: 4 };
    const t3 = topByGrade(jinro, M, 3);
    const g = wavg([...seok.map((c) => [c.rank, c.units]), ...t3.map((c) => [M[c.achievement], c.units])]);
    const BAE = lin(100, 2);
    const BJ = { 1: 100, 2: 99, 3: 98 };
    const uS = seok.reduce((s, c) => s + c.units, 0);
    const scS = seok.reduce((s, c) => s + BAE[c.rank] * c.units, 0);
    const uJ = t3.reduce((s, c) => s + c.units, 0);
    const scJ = t3.reduce((s, c) => s + BJ[M[c.achievement]] * c.units, 0);
    return R(g, round((scS + scJ) / (uS + uJ) * 10, 2), 1e3, false, true, "\uC778\uD558 \uC9C0\uC5ED\uADE0\uD615: \uAD6D\uC218\uC601\uACFC, \uC9C4\uB85C\uB4F1\uAE09\uC0C1\uC7043(A1\xB7B2\xB7C4)");
  },
  // 순천향대 교과우수자: 국수영사과한 3-1 석차, 변환점수표(1=100·2=98·3=96…) ×10
  "\uC21C\uCC9C\uD5A5\uB300": (cs) => {
    const { seok } = pick(cs, KUK, 31);
    return R(
      seokAvg(seok),
      round((baeAvg(seok, lin(100, 2)) ?? 0) * 10, 3),
      1e3,
      false,
      true,
      "\uC21C\uCC9C\uD5A5 \uAD50\uACFC\uC6B0\uC218\uC790: \uAD6D\uC218\uC601\uC0AC\uACFC\uD55C 3-1, \uBCC0\uD658\uC810\uC218\uD45C 1000\uC810"
    );
  },
  // 인제대 지역인재: 국수영과 3-1 미반영. 점수 = 100-((평균×6.5)-6.5)
  "\uC778\uC81C\uB300": (cs) => {
    const { seok } = pick(cs, KUE, 31);
    const g = seokAvg(seok);
    return R(g, g == null ? null : 100 - (g * 6.5 - 6.5), 100, false, true, "\uC778\uC81C \uC9C0\uC5ED\uC778\uC7AC: \uAD6D\uC218\uC601\uACFC, \uC9C4\uB85C \uBBF8\uBC18\uC601");
  },
  // 경북대 지역인재: 국수영사과한 3-1 미반영. 배점 1=400·2=390…
  "\uACBD\uBD81\uB300": (cs) => {
    const { seok } = pick(cs, KUK, 31);
    return R(seokAvg(seok), baeAvg(seok, lin(400, 10)), 400, false, true, "\uACBD\uBD81 \uC9C0\uC5ED\uC778\uC7AC: \uAD6D\uC218\uC601\uC0AC\uACFC\uD55C, \uC9C4\uB85C \uBBF8\uBC18\uC601, 400\uC810");
  },
  // 부산대 학생부교과: 국수영사과한(졸업자3-2/예정3-1) 미반영. 배점×0.8
  "\uBD80\uC0B0\uB300": (cs, gt) => {
    const { seok } = pick(cs, KUK, le(gt));
    return R(seokAvg(seok), round((baeAvg(seok, CAT_BAE) ?? 0) * 0.8, 4), 80, false, true, "\uBD80\uC0B0 \uD559\uC0DD\uBD80\uAD50\uACFC: \uAD6D\uC218\uC601\uC0AC\uACFC\uD55C, \uC9C4\uB85C \uBBF8\uBC18\uC601, 80\uC810");
  },
  // 을지대 지역균형: 국수영사과한 졸업자3-2 미반영. 배점 step2 ×10
  "\uC744\uC9C0\uB300": (cs, gt) => {
    const { seok } = pick(cs, KUK, le(gt));
    return R(seokAvg(seok), round((baeAvg(seok, lin(100, 2)) ?? 0) * 10, 2), 1e3, false, true, "\uC744\uC9C0 \uC9C0\uC5ED\uADE0\uD615: \uAD6D\uC218\uC601\uC0AC\uACFC\uD55C, \uC9C4\uB85C \uBBF8\uBC18\uC601, 1000\uC810");
  },
  // 가톨릭관동대 일반: 국수영과 3-1, 진로 A1·B2·C4(전과목). 점수 630+((9-평균)/8)×270 (출결 제외)
  "\uAC00\uD1A8\uB9AD\uAD00\uB3D9\uB300": (cs) => {
    const { seok, jinro } = pick(cs, KUE, 31);
    const M = { A: 1, B: 2, C: 4 };
    const g = wavg([...seok.map((c) => [c.rank, c.units]), ...jinMap(jinro, M)]);
    return R(g, g == null ? null : 630 + (9 - g) / 8 * 270, 1e3, true, true, "\uAC00\uD1A8\uB9AD\uAD00\uB3D9 \uC77C\uBC18: \uAD6D\uC218\uC601\uACFC+\uC9C4\uB85C A1\xB7B2\xB7C4. \uCD9C\uACB0 \uC81C\uC678");
  },
  // 강원대: 국수영사과한 전과목 + 과학탐구실험(공통 1등급 처리) 배점 lin(1000,30), 교과=공통×0.9+진로(A1000·B970·C910)×0.1.
  //   ※ 일반학과·의학계열 동일 산출식(과탐을 진로가 아니라 공통에 넣어야 936.182로 정확)
  "\uAC15\uC6D0\uB300": (cs, gt) => gangwonYak(cs, gt),
  // 원광대 지역인재교과: 국수영사과한 3-1, 진로 A1·B3·C5. 등급={(공통×0.7)+(진로×0.2)}×100/90
  "\uC6D0\uAD11\uB300": (cs) => {
    const { seok, jinro } = pick(cs, KUK, 31);
    const cg = seokAvg(seok);
    const jg = wavg(jinMap(jinro, { A: 1, B: 3, C: 5 }));
    const grade = cg == null ? null : (cg * 0.7 + (jg ?? 0) * 0.2) * 100 / 90;
    const sc = cg == null ? null : (9 - cg) * 8.75 + (9 - (jg ?? 0)) * 2.5 + 500;
    return R(grade, sc, 600, true, true, "\uC6D0\uAD11 \uC9C0\uC5ED\uC778\uC7AC\uAD50\uACFC: \uD2B9\uC218 \uB4F1\uAE09\uC2DD \xB7 \uAD50\uACFC 600\uC810(\uCD9C\uACB0 \uC81C\uC678)");
  },
  // 전남대 지역인재: 국수영사과한 3-1, 진로 점수상위3 A15·B9·C3. 660+석차배점×2.25+진로 (출결 제외)
  "\uC804\uB0A8\uB300": (cs) => {
    const { seok, jinro } = pick(cs, KUK, 31);
    const BAE = { 1: 100, 2: 95, 3: 90, 4: 85, 5: 80, 6: 75, 7: 70, 8: 65, 9: 60 };
    const scS = baeAvg(seok, BAE);
    const ACH = { A: 15, B: 9, C: 3 };
    const t3 = topByPt(jinro, ACH, 3);
    const jsc = wavg(t3.map((c) => [ACH[c.achievement], c.units]));
    const g = seokAvg(seok);
    return R(g, g == null ? null : 660 + (scS ?? 0) * 2.25 + (jsc ?? 0), 900, true, true, "\uC804\uB0A8 \uC9C0\uC5ED\uC778\uC7AC: 660+\uC11D\uCC28\xD72.25+\uC9C4\uB85C\uC0C1\uC7043. \uCD9C\uACB0 \uC81C\uC678");
  },
  // 동아대 지역인재교과: 국수영과 3-1, 진로 등급 A1·B3·C5. 점수 (석차+진로 등급환산점수)×8
  "\uB3D9\uC544\uB300": (cs) => {
    const { seok, jinro } = pick(cs, KUE, 31);
    const M = { A: 1, B: 3, C: 5 };
    const B = { 1: 100, 2: 99.5, 3: 98, 4: 95.5, 5: 93, 6: 90.5, 7: 88, 8: 85.5, 9: 83 };
    const jm = jinro.filter((c) => M[c.achievement] != null);
    const g = wavg([...seok.map((c) => [c.rank, c.units]), ...jm.map((c) => [M[c.achievement], c.units])]);
    const sg = seok.reduce((s, c) => s + B[c.rank] * c.units, 0) + jm.reduce((s, c) => s + B[M[c.achievement]] * c.units, 0);
    const su = seok.reduce((s, c) => s + c.units, 0) + jm.reduce((s, c) => s + c.units, 0);
    return R(g, round(sg / su * 8, 2), 800, true, true, "\uB3D9\uC544 \uC9C0\uC5ED\uC778\uC7AC\uAD50\uACFC: \uAD6D\uC218\uC601\uACFC+\uC9C4\uB85C A1\xB7B3\xB7C5, \xD78");
  },
  // 고신대 일반고: 국수영과 3-1, 진로 등급 상위1 A1·B3·C5. 배점 step0.5 ×10
  "\uACE0\uC2E0\uB300": (cs) => {
    const { seok, jinro } = pick(cs, KUE, 31);
    const M = { A: 1, B: 3, C: 5 };
    const B = lin(100, 0.5);
    const best = topByGrade(jinro, M, 1);
    const g = wavg([...seok.map((c) => [c.rank, c.units]), ...best.map((c) => [M[c.achievement], c.units])]);
    const sg = seok.reduce((s, c) => s + B[c.rank] * c.units, 0) + best.reduce((s, c) => s + B[M[c.achievement]] * c.units, 0);
    const su = seok.reduce((s, c) => s + c.units, 0) + best.reduce((s, c) => s + c.units, 0);
    return R(g, round(sg / su * 10, 3), 1e3, false, true, "\uACE0\uC2E0 \uC77C\uBC18\uACE0: \uAD6D\uC218\uC601\uACFC+\uC9C4\uB85C \uC0C1\uC7041(A1\xB7B3\xB7C5), \xD710");
  },
  // 단국대(천안) 지역메디바이오: 국수영사과한(+과탐 A1) 졸업자3-2, 진로 A1·B3·C5. 배점 step1 ×0.95×10 (출결 제외)
  "\uB2E8\uAD6D\uB300(\uCC9C\uC548)": (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt), true);
    const M = { A: 1, B: 3, C: 5 };
    const B = lin(100, 1);
    const seokG = (c) => hasRank(c) ? c.rank : 1;
    const g = wavg([...seok.map((c) => [c.rank, c.units]), ...jinMap(jinro, M)]);
    const jm = jinro.filter((c) => M[c.achievement] != null);
    const sg = seok.reduce((s, c) => s + B[seokG(c)] * c.units, 0) + jm.reduce((s, c) => s + B[M[c.achievement]] * c.units, 0);
    const su = seok.reduce((s, c) => s + c.units, 0) + jm.reduce((s, c) => s + c.units, 0);
    return R(g, round(sg / su * 0.95 * 10, 2), 1e3, true, true, "\uB2E8\uAD6D\uCC9C\uC548: \uAD6D\uC218\uC601\uC0AC\uACFC\uD55C(+\uACFC\uD0D0)+\uC9C4\uB85C A1\xB7B3\xB7C5 \xD70.95. \uCD9C\uACB0 \uC81C\uC678");
  },
  // 조선대 일반: 국수영사과한 3-1, 배점 1=40 step4. 450+공통Σ/84+진로상위3(A10·B8·C6)/3
  "\uC870\uC120\uB300": (cs) => {
    const { seok, jinro } = pick(cs, KUK, 31);
    const B = lin(40, 4);
    const common = baeAvg(seok, B) ?? 0;
    const JP = { A: 10, B: 8, C: 6 };
    const t3 = topByPt(jinro, JP, 3);
    const jsc = t3.length ? t3.reduce((s, c) => s + JP[c.achievement], 0) / 3 : 0;
    return R(seokAvg(seok), round(450 + common + jsc, 4), 500, true, true, "\uC870\uC120 \uC77C\uBC18: 450+\uACF5\uD1B5(\uBC30\uC810)+\uC9C4\uB85C\uC0C1\uC7043(A10\xB7B8\xB7C6)/3");
  },
  // 고려대 학교추천: 전과목 석차 + 진로 분포비율 변환석차등급. 등급점수 선형보간 ×0.9
  "\uACE0\uB824\uB300": (cs) => {
    const { seok } = pick(cs, KOREA_ALL, 31);
    const ji = jinroDist(cs, null, 31, convKorea);
    const g = wavg([...seok.map((c) => [c.rank, c.units]), ...ji]);
    const BP = { 1: 100, 2: 96, 3: 92, 4: 86, 5: 70, 6: 55, 7: 40, 8: 20, 9: 0 };
    const sc = g == null ? null : round(interpScore(g, BP) * 0.9, 4);
    return R(g, sc, 100, true, true, "\uACE0\uB824 \uD559\uAD50\uCD94\uCC9C: \uC804\uACFC\uBAA9 \uC11D\uCC28+\uC9C4\uB85C \uBD84\uD3EC\uBE44\uC728 \uBCC0\uD658\uC11D\uCC28\uB4F1\uAE09, \uB4F1\uAE09\uC810\uC218 \xD70.9");
  },
  // 충남대 일반: 국수영사과한+기술가정+제2외국어 졸업자3-2, 진로 분포비율(정수). 배점 1=100 step10
  "\uCDA9\uB0A8\uB300": (cs, gt) => {
    const B = lin(100, 10);
    const { seok } = pick(cs, CN_AREAS, le(gt));
    const jiC = jinroDistC(cs, CN_AREAS, le(gt), convInt);
    const g = wavg([...seok.map((c) => [c.rank, c.units]), ...jiC.map((x) => [x.g, x.u])]);
    const su = seok.reduce((s, c) => s + c.units, 0) + jiC.reduce((s, x) => s + x.u, 0);
    const sg = seok.reduce((s, c) => s + B[c.rank] * c.units, 0) + jiC.reduce((s, x) => s + B[Math.min(x.g, 9)] * x.u, 0);
    return R(g, round(sg / su, 4), 100, true, true, "\uCDA9\uB0A8 \uC77C\uBC18: \uC804\uACFC\uBAA9+\uC804\uBB38\uAD50\uACFC 3-2, \uC9C4\uB85C \uBD84\uD3EC\uBE44\uC728, \uBC30\uC810 1=100 step10");
  },
  // 충북대 학생부교과: 국수영사과한 졸업자3-2, 진로 분포비율(정수). 배점 1=10 step0.5, ×4+40.
  // (어디가 리포트는 심화수학1 누락 → 본 값이 모집요강상 정확값)
  "\uCDA9\uBD81\uB300": (cs, gt) => {
    const B = lin(10, 0.5);
    const { seok } = pick(cs, KUK, le(gt));
    const jiC = jinroDistC(cs, KUK, le(gt), convInt);
    const g = wavg([...seok.map((c) => [c.rank, c.units]), ...jiC.map((x) => [x.g, x.u])]);
    const su = seok.reduce((s, c) => s + c.units, 0) + jiC.reduce((s, x) => s + x.u, 0);
    const sg = seok.reduce((s, c) => s + B[c.rank] * c.units, 0) + jiC.reduce((s, x) => s + B[Math.min(x.g, 9)] * x.u, 0);
    return R(g, round(sg / su * 4 + 40, 3), 80, true, true, "\uCDA9\uBD81 \uD559\uC0DD\uBD80\uAD50\uACFC: \uAD6D\uC218\uC601\uC0AC\uACFC\uD55C 3-2, \uC9C4\uB85C \uBD84\uD3EC\uBE44\uC728, \xD74+40 (\uC5B4\uB514\uAC00 \uB204\uB77D \uBCF4\uC815)");
  },
  // 전북대 의예: 약학계열과 동일 산출(등급=석차평균×0.9 + 진로상위3(A1·B2·C3)×0.1). ※환산점수 배점표는 모집요강 페이지 확보 후속
  "\uC804\uBD81\uB300": (cs, gt) => jeonbukYak(cs, gt),
  // 제주대 의예: 약학·수의예과와 동일 산출(석차 등급환산 1=1000 step20, 공통×0.3+(일반+진로상위3)×0.7)
  "\uC81C\uC8FC\uB300": (cs, gt) => jejuVet(cs, gt),
  // 동국대(WISE) 학업성적우수자: 국수영사과 3-1. 배점 step1, 진로 A100·B98·C96 + 생명Ⅱ·화학Ⅱ 5%가산, ×10
  "\uB3D9\uAD6D\uB300(WISE)": (cs) => {
    const { seok, jinro } = pick(cs, KUS, 31);
    const B = { 1: 100, 2: 99, 3: 98, 4: 96, 5: 94, 6: 92, 7: 90, 8: 88, 9: 86 };
    const JP = { A: 100, B: 98, C: 96 };
    let sg = seok.reduce((s, c) => s + B[c.rank] * c.units, 0);
    let su = seok.reduce((s, c) => s + c.units, 0);
    let bonus = 0;
    for (const c of jinro) {
      if (JP[c.achievement] == null) continue;
      sg += JP[c.achievement] * c.units;
      su += c.units;
      if (c.name === "\uC0DD\uBA85\uACFC\uD559\u2161" || c.name === "\uD654\uD559\u2161") bonus += 5;
    }
    return R(seokAvg(seok), round((sg + bonus) / su * 10, 2), 1e3, false, true, "\uB3D9\uAD6DWISE: \uAD6D\uC218\uC601\uC0AC\uACFC+\uC9C4\uB85C A100\xB7B98\xB7C96(\uC0DD\uBA85\u2161\xB7\uD654\uD559\u2161 5%\uAC00\uC0B0), \xD710");
  },
  // 계명대 일반: 국수영과한 3-1, 배점 1=80 step10. 진로 등급상위3(3단위 캡) A1·B2·C3. 교과=Σ/단위+출결20, 등급=ABS(교과/10-9)
  "\uACC4\uBA85\uB300": (cs) => {
    const { seok, jinro } = pick(cs, KUEH, 31);
    const B = lin(80, 10);
    const M = { A: 1, B: 2, C: 3 };
    const t3 = topByGrade(jinro, M, 3);
    let sg = seok.reduce((s, c) => s + B[c.rank] * c.units, 0);
    let su = seok.reduce((s, c) => s + c.units, 0);
    for (const c of t3) {
      const u = Math.min(c.units, 3);
      sg += B[M[c.achievement]] * u;
      su += u;
    }
    const gyo = su > 0 ? sg / su : null;
    const grade = gyo == null ? null : Math.abs(gyo / 10 - 9);
    return R(grade, gyo == null ? null : round(gyo, 4), 80, true, true, "\uACC4\uBA85 \uC57D\uD559: \uBC30\uC810 80/\uB4F1\uAE09, \uC9C4\uB85C\uC0C1\uC7043(3\uB2E8\uC704\uCEA1), \uAD50\uACFC \uBD80\uBD84(\uCD9C\uACB0 \uC81C\uC678, \uB9CC\uC81080), \uB4F1\uAE09=ABS(\uAD50\uACFC/10\u22129)");
  },
  // 연세대(미래) 교과우수자: 국수영사과한 3-1, 진로 점수상위3 A100·B80·C50(20%). 등급=석차평균
  //   ※ 어디가 리포트는 과학탐구실험에 Z추정등급, 3-2 한국사를 넣는 오류 → 본 엔진은 모집요강대로(3-1·과탐 제외) 산출
  //   유형Ⅳ(의예과): 공통·일반 국수영과 전과목 배점 1=100·2=97·3=94·4=90·5=86·6=76·7=60·8=40·9=10.
  //   진로 국수영과 상위3 A100·B80·C50. 교과총점=공통일반총점×0.8 + 진로총점×0.2. 출결·면접 제외
  "\uC5F0\uC138\uB300(\uBBF8\uB798)": (cs, gt) => {
    const B = { 1: 100, 2: 97, 3: 94, 4: 90, 5: 86, 6: 76, 7: 60, 8: 40, 9: 10 };
    const { seok, jinro } = pick(cs, KUE, le(gt));
    if (!seok.length) return R(null, null, 100, true, false, "\uC5F0\uC138\uBBF8\uB798 \uC758\uC608: \uBC18\uC601\uAD50\uACFC \uC5C6\uC74C");
    const common = baeAvg(seok, B) ?? 0;
    const JP = { A: 100, B: 80, C: 50 };
    const jr = jinro.filter((c) => JP[c.achievement] != null);
    const t3 = [...jr].sort((a, b) => JP[b.achievement] - JP[a.achievement] || b.units - a.units).slice(0, 3);
    const lack = Math.max(0, 3 - t3.length);
    const jsum = t3.reduce((s, c) => s + JP[c.achievement] * c.units, 0) + 50 * lack;
    const junit = t3.reduce((s, c) => s + c.units, 0) + lack;
    const jinScore = junit ? jsum / junit : 50;
    const gyo = common * 0.8 + jinScore * 0.2;
    return R(seokAvg(seok), round(gyo, 2), 100, true, true, "\uC5F0\uC138(\uBBF8\uB798) \uC758\uC608(\uC720\uD615\u2163): \uAD6D\uC218\uC601\uACFC \uBC30\uC810(100/97/94/90\u2026)\xD70.8 + \uC9C4\uB85C\uC0C1\uC7043(A100\xB7B80\xB7C50)\xD70.2. \uBE44\uAD50\uACFC \uC81C\uC678");
  },
  // 건양대 의학과: 국·수·영 전과목 + 과학 상위6과목 석차, 배점 1=100 step2. 변환점수=Σ(배점×단위)/Σ단위,
  //   반영 이수단위 합<75면 ×0.97. 진로선택은 이수단위 충족용(등급 미반영). 출결 제외
  "\uAC74\uC591\uB300": (cs, gt) => {
    const B = lin(100, 2);
    const base = cs.filter((c) => ["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4"].includes(areaKey(c.area)) && hasRank(c) && (c.units || 0) > 0 && semNo(c) <= le(gt));
    const sci = cs.filter((c) => areaKey(c.area) === "\uACFC\uD559" && hasRank(c) && (c.units || 0) > 0 && semNo(c) <= le(gt) && c.name !== "\uACFC\uD559\uD0D0\uAD6C\uC2E4\uD5D8").sort((a, b) => a.rank - b.rank || b.units - a.units).slice(0, 6);
    const list = [...base, ...sci];
    if (!list.length) return R(null, null, 100, true, false, "\uAC74\uC591 \uC758\uD559\uACFC: \uBC18\uC601\uAD50\uACFC \uC5C6\uC74C");
    const su = list.reduce((s, c) => s + c.units, 0);
    const pt = (baeAvg(list, B) ?? 0) * (su >= 75 ? 1 : 0.97);
    return R(seokAvg(list), round(pt * 10, 2), 1e3, true, true, "\uAC74\uC591 \uC758\uD559\uACFC(\uCD5C\uC800): \uAD6D\uC218\uC601 \uC804\uACFC\uBAA9+\uACFC\uD559\uC0C1\uC7046, \uBC30\uC810 1=100 step2, \uB2E8\uC704\uD569<75\uBA74 \xD70.97, \xD710(1000 \uB9CC\uC810). \uCD9C\uACB0 \uC81C\uC678");
  },
  // 건국대(글로컬) 의예(자연계B): 국·영·수·한국사·과학 전과목(공통·일반·진로 구분X), 기준점수 1=10·2=9.5·3=9·4=8.5·5=8·6=7·7=6·8=4·9=0.
  //   진로선택(성취도) 석차등급 변환: A→1, B→등급비율(B%+C%), C→등급비율(C%). 점수=Σ(기준점수×단위)/Σ단위×100, 70단위 이하면 ×0.96−감점. (2015 교육과정 기준)
  "\uAC74\uAD6D\uB300(\uAE00\uB85C\uCEEC)": (cs, gt) => {
    const B = { 1: 10, 2: 9.5, 3: 9, 4: 8.5, 5: 8, 6: 7, 7: 6, 8: 4, 9: 0 };
    const AR = /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uD55C\uAD6D\uC0AC", "\uACFC\uD559"]);
    const seok = cs.filter((c) => AR.has(areaKey(c.area)) && hasRank(c) && (c.units || 0) > 0 && semNo(c) <= le(gt));
    const conv = (c) => {
      const a = c.achievement;
      if (a === "A") return 1;
      if (a === "B") return hasDist(c) ? kkRatioGrade((c.distB ?? 0) + (c.distC ?? 0)) : null;
      if (a === "C") return hasDist(c) ? kkRatioGrade(c.distC ?? 0) : null;
      return null;
    };
    const jinro = cs.filter((c) => AR.has(areaKey(c.area)) && !hasRank(c) && c.achievement && "ABC".includes(c.achievement) && (c.units || 0) > 0 && semNo(c) <= le(gt) && c.name !== "\uACFC\uD559\uD0D0\uAD6C\uC2E4\uD5D8");
    const items = [...seok.map((c) => [c.rank, c.units])];
    for (const c of jinro) {
      const g2 = conv(c);
      if (g2 != null) items.push([g2, c.units]);
    }
    if (!items.length) return R(null, null, 1e3, false, false, "\uAC74\uAD6D\uAE00\uB85C\uCEEC: \uBC18\uC601\uAD50\uACFC \uC5C6\uC74C");
    const su = items.reduce((s, i) => s + i[1], 0);
    let sc = items.reduce((s, i) => s + B[Math.min(i[0], 9)] * i[1], 0) / su * 100;
    if (su <= 70) sc = sc * 0.96 - (70 - su) * 2e-3;
    const g = items.reduce((s, i) => s + i[0] * i[1], 0) / su;
    return R(g, round(sc, 2), 1e3, false, true, "\uAC74\uAD6D(\uAE00\uB85C\uCEEC) \uC790\uC5F0\uACC4: \uAD6D\uC601\uC218\uD55C\uACFC \uAE30\uC900\uC810\uC218(1=10\u20269=0), \u03A3(\uC810\uC218\xD7\uB2E8\uC704)/\u03A3\uB2E8\uC704\xD7100. 2015 \uAD50\uC721\uACFC\uC815 \uAE30\uC900");
  },
  // 대구가톨릭대 교과: 국수영사과한 3-1, 배점 1=100·2=99.2·3=97.8. 교과성적×4 + 진로가산(상위3 A1.0·B0.9·C0.8 합). 출결 제외
  "\uB300\uAD6C\uAC00\uD1A8\uB9AD\uB300": (cs) => {
    const { seok, jinro } = pick(cs, KUK, 31);
    const B = { 1: 100, 2: 99.2, 3: 97.8, 4: 95.4, 5: 93, 6: 90.6, 7: 88.2, 8: 85.8, 9: 83.4 };
    const gyo = baeAvg(seok, B) ?? 0;
    const GP = { A: 1, B: 0.9, C: 0.8 };
    const t3 = topByPt(jinro, GP, 3);
    const add = t3.reduce((s, c) => s + GP[c.achievement], 0);
    return R(seokAvg(seok), round(gyo * 4 + add, 2), 500, true, true, "\uB300\uAD6C\uAC00\uD1A8\uB9AD \uAD50\uACFC: \uBC30\uC810\xD74 + \uC9C4\uB85C\uAC00\uC0B0(\uC0C1\uC7043 A1.0\xB7B0.9\xB7C0.8). \uCD9C\uACB0 \uC81C\uC678");
  },
  // 영남대 일반학생: 국수영한과(전학년)+사회(자연계 1학년만), 진로 등급상위3 A1·B3·C5. 600+8×(11−평균), 진로 32+0.8×(11−진로). 비교과 제외
  "\uC601\uB0A8\uB300": (cs, gt) => {
    const seok = [];
    const jinro = [];
    for (const c of cs) {
      if ((c.units || 0) <= 0 || semNo(c) > 31) continue;
      const a = areaKey(c.area);
      const isYM = a === "\uC0AC\uD68C" ? c.year === 1 : ["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uD55C\uAD6D\uC0AC", "\uACFC\uD559"].includes(a);
      if (!isYM) continue;
      if (hasRank(c)) seok.push(c);
      else if (c.achievement && "ABC".includes(c.achievement)) jinro.push(c);
    }
    const g = seokAvg(seok);
    const M = { A: 1, B: 3, C: 5 };
    const t3 = topByGrade(jinro, M, 3);
    const jg = t3.length ? t3.reduce((s, c) => s + M[c.achievement], 0) / t3.length : null;
    const common = g == null ? null : 600 + 8 * (11 - round(g, 2));
    const jsc = jg == null ? 0 : 32 + 0.8 * (11 - jg);
    return R(g, common == null ? null : round(common + jsc, 2), 800, true, true, "\uC601\uB0A8 \uC77C\uBC18: \uAD6D\uC218\uC601\uD55C\uACFC+\uC0AC\uD68C(\uC790\uC5F01\uD559\uB144), 600+8\xD7(11\u2212\uD3C9\uADE0)+\uC9C4\uB85C. \uCD9C\uACB0\xB7\uC11C\uB958 \uC81C\uC678");
  },
  // ── 이준서 어디가로 검증한 치·약·한·수 신규 대학 (단일 계열 위주, 등급 검증) ──
  // 우석대 약학/한의예: 국수영사과한 석차, 배점 1=100 step5. 점수 360+(배점avg−60)+진로상위1(A10·B6·C2)
  "\uC6B0\uC11D\uB300": (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt));
    const avg = baeAvg(seok, lin(100, 5));
    const t1 = topByPt(jinro, { A: 10, B: 6, C: 2 }, 1);
    const gas = t1.reduce((s, c) => s + { A: 10, B: 6, C: 2 }[c.achievement], 0);
    return R(seokAvg(seok), avg == null ? null : round(360 + (avg - 60) + gas, 2), 500, true, true, "\uC6B0\uC11D \uC57D\uD559: \uBC30\uC810(1=100 step5), 360+(avg\u221260)+\uC9C4\uB85C\uC0C1\uC7041");
  },
  // 한양대(ERICA) 약학: 국수영사과한, 배점 1=100·2=99·3=98·4=95…. 공통일반=avg×8 + 진로(A100·B99·C98)avg×2
  "\uD55C\uC591\uB300(ERICA)": (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt));
    const B = { 1: 100, 2: 99, 3: 98, 4: 95, 5: 92, 6: 89, 7: 86, 8: 83, 9: 80 };
    const avg = baeAvg(seok, B);
    const jg = wavg(jinMap(jinro, { A: 100, B: 99, C: 98 })) ?? 0;
    return R(seokAvg(seok), avg == null ? null : round(avg * 8 + jg * 2, 2), 1e3, false, true, "\uD55C\uC591ERICA \uC57D\uD559: \uBC30\uC810avg\xD78 + \uC9C4\uB85C(A100\xB7B99\xB7C98)avg\xD72");
  },
  // 동신대 한의예: 국영수과사한 전과목 석차, 배점 1=100 step6.25. 환산=Σ(배점×단위)/Σ단위(3자리),
  //   교과=환산×10×반영비율(한의예 0.8) + 이수단위가산(반영석차단위합≥70→일반전형 50) + 진로상위1(A10·B6·C2). 출결 제외
  "\uB3D9\uC2E0\uB300": (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt));
    const hwan = baeAvg(seok, lin(100, 6.25));
    if (hwan == null) return R(null, null, 1e3, true, false, "\uB3D9\uC2E0 \uD55C\uC758\uC608: \uBC18\uC601\uAD50\uACFC \uC5C6\uC74C");
    const su = seok.reduce((s, c) => s + c.units, 0);
    const unitGasan = su >= 70 ? 50 : 0;
    const t1 = topByPt(jinro, { A: 10, B: 6, C: 2 }, 1);
    const jGasan = t1.reduce((s, c) => s + { A: 10, B: 6, C: 2 }[c.achievement], 0);
    const base = round(round(hwan, 3) * 10 * 0.8, 3);
    return R(
      seokAvg(seok),
      round(base + unitGasan + jGasan, 3),
      1e3,
      true,
      true,
      "\uB3D9\uC2E0 \uD55C\uC758\uC608: \uD658\uC0B0(\uBC30\uC810 1=100 step6.25)\xD710\xD70.8 + \uC774\uC218\uB2E8\uC704\uAC00\uC0B0(\u226570\u219250) + \uC9C4\uB85C\uC0C1\uC7041(A10\xB7B6\xB7C2). \uCD9C\uACB0 \uC81C\uC678"
    );
  },
  // 건국대(수의예): 국수영사과한, 기준점수 1=10·2=9.97·3=9.94·4=9.9…. 점수 avg×70
  "\uAC74\uAD6D\uB300": (cs, gt) => {
    const { seok } = pick(cs, KUK, le(gt));
    const B = { 1: 10, 2: 9.97, 3: 9.94, 4: 9.9, 5: 9.5, 6: 9, 7: 8, 8: 6, 9: 0 };
    const avg = baeAvg(seok, B);
    return R(seokAvg(seok), avg == null ? null : round(avg * 70, 3), 1e3, false, true, "\uAC74\uAD6D \uC218\uC758\uC608: \uAE30\uC900\uC810\uC218avg\xD770");
  },
  // 삼육대 약학: 국수영사과한, 배점 1=100·2=99·3=98·4=96.5…. (석차Σ+진로Σ)/총단위×10, 진로 A100·B99·C98
  "\uC0BC\uC721\uB300": (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt));
    const B = { 1: 100, 2: 99, 3: 98, 4: 96.5, 5: 95, 6: 93.5, 7: 92, 8: 90.5, 9: 89 };
    const jA = { A: 100, B: 99, C: 98 };
    const jj = jinro.filter((c) => jA[c.achievement] != null);
    const sg = seok.reduce((s, c) => s + B[c.rank] * c.units, 0) + jj.reduce((s, c) => s + jA[c.achievement] * c.units, 0);
    const su = seok.reduce((s, c) => s + c.units, 0) + jj.reduce((s, c) => s + c.units, 0);
    const avg = su ? sg / su : null;
    const grade = avg == null ? null : 4 + (96.5 - avg) / 1.5;
    return R(grade, avg == null ? null : round(avg * 10, 2), 1e3, false, true, "\uC0BC\uC721 \uC57D\uD559: (\uC11D\uCC28\uBC30\uC810\u03A3+\uC9C4\uB85C\u03A3)/\uCD1D\uB2E8\uC704\xD710, \uB4F1\uAE09=4+(96.5\u2212\uBC30\uC810\uD3C9\uADE0)/1.5");
  },
  // 중앙대 약학(지역균형): 국수영사과, 배점 1=10·2=9.71·3=9.43·4=9.14…. 교과=(석차avg×0.9+진로avg(과목수, A10·B9.43·C8.86)×0.1)×90. 출결 제외
  "\uC911\uC559\uB300": (cs, gt) => {
    const { seok, jinro } = pick(cs, KUS, le(gt));
    const B = { 1: 10, 2: 9.71, 3: 9.43, 4: 9.14, 5: 8.86, 6: 8.57, 7: 8, 8: 6.57, 9: 3.4 };
    const su = seok.reduce((s, c) => s + c.units, 0);
    const sa = su ? seok.reduce((s, c) => s + B[c.rank] * c.units, 0) / su : 0;
    const JA = { A: 10, B: 9.43, C: 8.86 };
    const jj = jinro.filter((c) => JA[c.achievement] != null);
    const ja = jj.length ? jj.reduce((s, c) => s + JA[c.achievement], 0) / jj.length : 0;
    return R(seokAvg(seok), su ? round((sa * 0.9 + ja * 0.1) * 90, 2) : null, 900, true, true, "\uC911\uC559 \uC57D\uD559(\uC9C0\uC5ED\uADE0\uD615): (\uC11D\uCC28avg\xD70.9+\uC9C4\uB85Cavg\xD70.1)\xD790. \uCD9C\uACB0 \uC81C\uC678");
  },
  // 순천대 약학: 국수영사과 석차평균, 점수 (9−평균)×300/8 + 진로상위3(A0.5·B0.3·C0.1)
  "\uC21C\uCC9C\uB300": (cs, gt) => {
    const { seok, jinro } = pick(cs, KUS, le(gt));
    const g = seokAvg(seok);
    const GP = { A: 0.5, B: 0.3, C: 0.1 };
    const t3 = topByPt(jinro, GP, 3);
    const gas = t3.reduce((s, c) => s + GP[c.achievement], 0);
    return R(g, g == null ? null : round((9 - g) * 300 / 8 + gas, 2), 300, true, true, "\uC21C\uCC9C \uC57D\uD559: (9\u2212\uD3C9\uADE0)\xD7300/8 + \uC9C4\uB85C\uC0C1\uC7043 \uAC00\uC0B0");
  },
  // 숙명여대 약학: 환산석차 = 국수영사과한 석차×0.8 + 진로(A1·B3·C5)×0.2, 점수 (11−환산)×70
  "\uC219\uBA85\uC5EC\uB300": (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt));
    const sg = seokAvg(seok);
    const jg = wavg(jinMap(jinro, { A: 1, B: 3, C: 5 })) ?? 0;
    const hs = sg == null ? null : sg * 0.8 + jg * 0.2;
    return R(hs, hs == null ? null : round((11 - hs) * 70, 2), 770, true, true, "\uC219\uBA85 \uC57D\uD559: \uC11D\uCC28\xD70.8+\uC9C4\uB85C(A1\xB7B3\xB7C5)\xD70.2, (11\u2212\uD658\uC0B0)\xD770");
  },
  // 세명대 한의예: 국수영사과 석차 상위20과목(과목수 기준) 평균, 점수 1100−평균×100
  "\uC138\uBA85\uB300": (cs, gt) => {
    const { seok } = pick(cs, KUS, le(gt));
    const top = [...seok].sort((a, b) => a.rank - b.rank).slice(0, 20);
    const g = top.length ? top.reduce((s, c) => s + c.rank, 0) / top.length : null;
    return R(g, g == null ? null : round(1100 - g * 100, 2), 1100, true, true, "\uC138\uBA85 \uD55C\uC758\uC608: \uAD6D\uC218\uC601\uC0AC\uACFC \uC0C1\uC70420\uACFC\uBAA9 \uD3C9\uADE0, 1100\u2212\uD3C9\uADE0\xD7100");
  },
  // 대전대 한의예: 전과목 석차평균, 점수(교과중점 900점): 900−(평균−1)×10. 출결 제외
  "\uB300\uC804\uB300": (cs, gt) => {
    const { seok } = pick(cs, null, le(gt));
    const g = seokAvg(seok);
    return R(g, g == null ? null : round(900 - (g - 1) * 10, 2), 900, true, true, "\uB300\uC804 \uD55C\uC758\uC608(\uAD50\uACFC\uC911\uC810): \uC804\uACFC\uBAA9 \uC11D\uCC28\uD3C9\uADE0, 900\u2212(\uD3C9\uADE0\u22121)\xD710. \uCD9C\uACB0 \uC81C\uC678");
  },
  // 대구한의대 한의예(자연): 국수영사과한 석차 배점 1=100·2=99·3=95·4=90…, 진로 사회·과학 A1·B2·C3. 교과=900+(Σ/총단위)
  "\uB300\uAD6C\uD55C\uC758\uB300": (cs, gt) => {
    const B = { 1: 100, 2: 99, 3: 95, 4: 90, 5: 85, 6: 80, 7: 75, 8: 70, 9: 65 };
    const { seok } = pick(cs, KUK, le(gt));
    const jSG = cs.filter((c) => c.kind !== "\uACF5\uD1B5" && !hasRank(c) && ["\uC0AC\uD68C", "\uACFC\uD559"].includes(areaKey(c.area)) && c.achievement && "ABC".includes(c.achievement) && (c.units || 0) > 0 && semNo(c) <= le(gt));
    const M = { A: 1, B: 2, C: 3 };
    const sg = seok.reduce((s, c) => s + B[c.rank] * c.units, 0) + jSG.reduce((s, c) => s + B[M[c.achievement]] * c.units, 0);
    const su = seok.reduce((s, c) => s + c.units, 0) + jSG.reduce((s, c) => s + c.units, 0);
    const g = wavg([...seok.map((c) => [c.rank, c.units]), ...jSG.map((c) => [M[c.achievement], c.units])]);
    return R(g, su ? round(900 + sg / su, 2) : null, 1e3, true, true, "\uB300\uAD6C\uD55C\uC758(\uC790\uC5F0): \uAD6D\uC218\uC601\uC0AC\uACFC\uD55C \uBC30\uC810 + \uC9C4\uB85C \uC0AC\uACFC(A1\xB7B2\xB7C3), 900+\u03A3/\uB2E8\uC704");
  },
  // 상지대 한의예: 국영수사(한국사포함)과, 학기별 상위5과목(교과당 최대1·동점 이수단위↑) 석차
  //   + 진로 상위3(A1·B3·C6·동성취도 이수단위↑). 평균석차등급=Σ(등급×단위)/Σ단위(2자리),
  //   환산점수=평균×−5+105, 교과성적=환산×10.0(9.00등급→0점). 출결 제외
  "\uC0C1\uC9C0\uB300": (cs, gt) => {
    const AR = /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uC0AC\uD68C", "\uACFC\uD559", "\uD55C\uAD6D\uC0AC"]);
    const sak = (a) => {
      const k = areaKey(a);
      return k === "\uD55C\uAD6D\uC0AC" ? "\uC0AC\uD68C" : k;
    };
    const bySem = /* @__PURE__ */ new Map();
    for (const c of cs) {
      if (!AR.has(areaKey(c.area)) || !hasRank(c) || (c.units || 0) <= 0 || semNo(c) > le(gt) || c.name === "\uACFC\uD559\uD0D0\uAD6C\uC2E4\uD5D8") continue;
      const k = semNo(c);
      if (!bySem.has(k)) bySem.set(k, []);
      bySem.get(k).push(c);
    }
    const sel = [];
    for (const arr of bySem.values()) {
      const byG = /* @__PURE__ */ new Map();
      for (const c of arr) {
        const g2 = sak(c.area);
        const cur = byG.get(g2);
        if (!cur || c.rank < cur.rank || c.rank === cur.rank && c.units > cur.units) byG.set(g2, c);
      }
      sel.push(...[...byG.values()].sort((a, b) => a.rank - b.rank || b.units - a.units).slice(0, 5));
    }
    const M = { A: 1, B: 3, C: 6 };
    const jr = cs.filter((c) => AR.has(areaKey(c.area)) && !hasRank(c) && c.achievement && M[c.achievement] != null && (c.units || 0) > 0 && semNo(c) <= le(gt) && c.name !== "\uACFC\uD559\uD0D0\uAD6C\uC2E4\uD5D8");
    const jr3 = [...jr].sort((a, b) => M[a.achievement] - M[b.achievement] || b.units - a.units).slice(0, 3);
    const items = [
      ...sel.map((c) => [c.rank, c.units]),
      ...jr3.map((c) => [M[c.achievement], c.units])
    ];
    const tu = items.reduce((s, i) => s + i[1], 0);
    if (!tu) return R(null, null, 1e3, true, false, "\uC0C1\uC9C0 \uD55C\uC758\uC608: \uBC18\uC601\uAD50\uACFC \uC5C6\uC74C");
    const g = round(items.reduce((s, i) => s + i[0] * i[1], 0) / tu, 2);
    const hwan = round(g * -5 + 105, 2);
    const gyo = g >= 9 ? 0 : round(hwan * 10, 2);
    return R(
      g,
      gyo,
      1e3,
      true,
      true,
      "\uC0C1\uC9C0 \uD55C\uC758\uC608: \uD559\uAE30\uBCC4 \uAD50\uACFC\uB2F9 \uC0C1\uC7045 \uC11D\uCC28 + \uC9C4\uB85C\uC0C1\uC7043(A1\xB7B3\xB7C6), \uD658\uC0B0=\uD3C9\uADE0\xD7\u22125+105, \xD710. \uCD9C\uACB0 \uC81C\uC678"
    );
  },
  // 동국대(서울) 약학: 국수영사과한 상위10과목(과목수). 등급=평균, 점수=기준점수(1=10·2=9.99·3=9.95·4=9.9…)avg×70
  "\uB3D9\uAD6D\uB300": (cs, gt) => {
    const { seok } = pick(cs, KUK, le(gt));
    const top = [...seok].sort((a, b) => a.rank - b.rank).slice(0, 10);
    const B = { 1: 10, 2: 9.99, 3: 9.95, 4: 9.9, 5: 9, 6: 8, 7: 5, 8: 3, 9: 0 };
    const g = top.length ? top.reduce((s, c) => s + c.rank, 0) / top.length : null;
    const sc = top.length ? top.reduce((s, c) => s + B[c.rank], 0) / top.length * 70 : null;
    return R(g, sc == null ? null : round(sc, 3), 1e3, false, true, "\uB3D9\uAD6D(\uC11C\uC6B8) \uC57D\uD559: \uC0C1\uC70410\uACFC\uBAA9 \uAE30\uC900\uC810\uC218avg\xD770");
  },
  // 차의과대 약학(지역균형): 국수영사과한, 등급환산 1=1000·2=997·3=994·4=990·5=985. 교과=배점avg (CHA학생부교과는 ×0.7)
  "\uCC28\uC758\uACFC\uB300": (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt));
    const B = { 1: 1e3, 2: 997, 3: 994, 4: 990, 5: 985, 6: 980, 7: 975, 8: 970, 9: 965 };
    const M = { A: 1, B: 3, C: 5 };
    const jj = jinro.filter((c) => M[c.achievement] != null);
    const sg = seok.reduce((s, c) => s + B[c.rank] * c.units, 0) + jj.reduce((s, c) => s + B[M[c.achievement]] * c.units, 0);
    const su = seok.reduce((s, c) => s + c.units, 0) + jj.reduce((s, c) => s + c.units, 0);
    return R(seokAvg(seok), su ? round(sg / su, 3) : null, 1e3, true, true, "\uCC28\uC758\uACFC \uC57D\uD559(\uC9C0\uC5ED\uADE0\uD615): \uB4F1\uAE09\uD658\uC0B0(1000/997/994/990/985)avg. CHA\uAD50\uACFC\uB294 \xD70.7");
  },
  // 경성대 약학: 국수영탐구(한국사포함), 공통×3+일반×5+진로×2, 배점 1=100 step2. 과탐=공통 성취A→1등급, 진로 A1·B3·C5
  "\uACBD\uC131\uB300": (cs, gt) => {
    const KS = /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uC0AC\uD68C", "\uACFC\uD559", "\uD55C\uAD6D\uC0AC"]);
    const B = lin(100, 2);
    const MJ = { A: 1, B: 3, C: 5 };
    const gG = [];
    const iG = [];
    const jG = [];
    for (const c of cs) {
      if (!KS.has(areaKey(c.area)) || (c.units || 0) <= 0 || semNo(c) > le(gt)) continue;
      if (c.name === "\uACFC\uD559\uD0D0\uAD6C\uC2E4\uD5D8") {
        gG.push([1, c.units]);
        continue;
      }
      if (c.kind === "\uACF5\uD1B5" && hasRank(c)) gG.push([c.rank, c.units]);
      else if (c.kind === "\uC77C\uBC18\uC120\uD0DD" && hasRank(c)) iG.push([c.rank, c.units]);
      else if (c.kind === "\uC9C4\uB85C\uC120\uD0DD" && MJ[c.achievement] != null) jG.push([MJ[c.achievement], c.units]);
    }
    const av = (a) => {
      const u = a.reduce((s, x) => s + x[1], 0);
      return u ? [a.reduce((s, x) => s + x[0] * x[1], 0) / u, a.reduce((s, x) => s + B[x[0]] * x[1], 0) / u] : [0, 0];
    };
    const [gg, gs] = av(gG);
    const [ig, iis] = av(iG);
    const [jg, js] = av(jG);
    if (!gG.length && !iG.length) return R(null, null, 1e3, true, false, "\uACBD\uC131 \uC57D\uD559(\uACF5\uD1B5/\uC77C\uBC18 \uAD6C\uBD84 \uD544\uC694)");
    return R(round(gg * 0.3 + ig * 0.5 + jg * 0.2, 4), round(gs * 3 + iis * 5 + js * 2, 2), 1e3, true, true, "\uACBD\uC131 \uC57D\uD559: \uACF5\uD1B5\xD73+\uC77C\uBC18\xD75+\uC9C4\uB85C\xD72, \uBC30\uC810 100 step2");
  },
  // 목포대 약학: 국영수과 석차평균, 점수 809+(9−평균)/8×91 + 진로상위3(A5·B4·C3)/3. 출결 제외
  "\uBAA9\uD3EC\uB300": (cs, gt) => {
    const A = /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC601\uC5B4", "\uC218\uD559", "\uACFC\uD559"]);
    const { seok, jinro } = pick(cs, A, le(gt));
    const g = seokAvg(seok);
    const GP = { A: 5, B: 4, C: 3 };
    const t3 = topByPt(jinro, GP, 3);
    const gas = t3.length ? t3.reduce((s, c) => s + GP[c.achievement], 0) / 3 : 0;
    return R(g, g == null ? null : round(809 + (9 - g) / 8 * 91 + gas, 2), 900, true, true, "\uBAA9\uD3EC \uC57D\uD559: 809+(9\u2212\uD3C9\uADE0)/8\xD791 + \uC9C4\uB85C\uAC00\uC0B0. \uCD9C\uACB0 \uC81C\uC678");
  },
  // 덕성여대 약학: 등급=국수영사과한 석차+진로(A1·B2·C4) 병합. 점수: 배점(1=100 step1)avg×9 + 진로(A100·B99·C97)avg×1
  "\uB355\uC131\uC5EC\uB300": (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt));
    const g = wavg([...seok.map((c) => [c.rank, c.units]), ...jinMap(jinro, { A: 1, B: 2, C: 4 })]);
    const avg = baeAvg(seok, lin(100, 1));
    const jg = wavg(jinMap(jinro, { A: 100, B: 99, C: 97 })) ?? 0;
    return R(g, avg == null ? null : round(avg * 9 + jg * 1, 4), 1e3, false, true, "\uB355\uC131 \uC57D\uD559: \uBC30\uC810avg\xD79 + \uC9C4\uB85C(A100\xB7B99\xB7C97)avg\xD71");
  },
  // 동의대 한의예: 등급=국수영사과한+진로(A1·B2·C3) 과목수 평균. 점수: 배점(1=25 step3, 과목수기준)(Σ/n)×12+700
  "\uB3D9\uC758\uB300": (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt));
    const M = { A: 1, B: 2, C: 3 };
    const jj = jinro.filter((c) => M[c.achievement] != null);
    const cnt = seok.length + jj.length;
    const gsum = seok.reduce((s, c) => s + c.rank, 0) + jj.reduce((s, c) => s + M[c.achievement], 0);
    const g = cnt ? gsum / cnt : null;
    const B = { 1: 25, 2: 22, 3: 19, 4: 16, 5: 13, 6: 10, 7: 7, 8: 4, 9: 1 };
    const MJ = { A: 1, B: 3, C: 5 };
    const jjS = jinro.filter((c) => MJ[c.achievement] != null);
    const psum = seok.reduce((s, c) => s + B[c.rank], 0) + jjS.reduce((s, c) => s + B[MJ[c.achievement]], 0);
    const pn = seok.length + jjS.length;
    return R(g, pn ? round(psum / pn * 12 + 700, 2) : null, 1e3, true, true, "\uB3D9\uC758 \uD55C\uC758\uC608: \uACFC\uBAA9\uC218 \uBC30\uC810(1=25 step3)\xD712+700");
  },
  // 동덕여대 약학: 국영수과 4교과(석차등급 부여 과목만·진로 석차포함), 배점 1=100·2=98·3=95·4=91…
  //   평균석차등급점수 = [교과별(Σ배점/과목수)] 4교과 평균 × 1/4, 학생부 100% → ×10. 3-1까지(예정)
  "\uB3D9\uB355\uC5EC\uB300": (cs, gt) => {
    const B = { 1: 100, 2: 98, 3: 95, 4: 91, 5: 86, 6: 80, 7: 70, 8: 60, 9: 40 };
    const { seok } = pick(cs, KUE, le(gt));
    const AREAS = ["\uAD6D\uC5B4", "\uC601\uC5B4", "\uC218\uD559", "\uACFC\uD559"];
    const means = [];
    for (const a of AREAS) {
      const gc = seok.filter((c) => areaKey(c.area) === a);
      if (gc.length) means.push(gc.reduce((s, c) => s + B[c.rank], 0) / gc.length);
    }
    if (means.length < AREAS.length) return R(seokAvg(seok), null, 1e3, false, false, "\uB3D9\uB355 \uC57D\uD559: \uBC18\uC601 4\uAD50\uACFC \uC911 \uC77C\uBD80 \uACFC\uBAA9 \uC5C6\uC74C(\uBD80\uC801\uACA9)");
    const avg = means.reduce((a, b) => a + b, 0) / AREAS.length;
    return R(seokAvg(seok), round(avg * 10, 4), 1e3, false, true, "\uB3D9\uB355 \uC57D\uD559: \uAD6D\uC601\uC218\uACFC 4\uAD50\uACFC \uACFC\uBAA9\uC218 \uD3C9\uADE0\uBC30\uC810\uC758 \uD3C9\uADE0 \xD710");
  },
  // 경상국립대 일반: 국수영사과한 3-1, 배점 1=150 step15. 850+Σ/84 (+진로가산 미세)
  "\uACBD\uC0C1\uAD6D\uB9BD\uB300": (cs) => {
    const { seok } = pick(cs, KUK, 31);
    const common = 850 + seok.reduce((s, c) => s + lin(150, 15)[c.rank] * c.units, 0) / seok.reduce((s, c) => s + c.units, 0);
    return R(seokAvg(seok), round(common, 2), 1e3, false, false, "\uACBD\uC0C1\uAD6D\uB9BD \uC77C\uBC18: 850+\uACF5\uD1B5(\uBC30\uC810 150/\uB4F1\uAE09). \uC9C4\uB85C\uAC00\uC0B0(\u2248+0.17) \uC81C\uC678");
  }
};
var GUBUN_RULES = {
  // 강원대 약학/수의예/치의예: 배점 lin(1000,30)+과탐(A1등급), ×0.9 + 진로(A1000·B970·C910)×0.1. 등급=1+(1000−교과)/30
  "\uAC15\uC6D0\uB300|\uC57D\uD559": (cs, gt) => gangwonYak(cs, gt),
  "\uAC15\uC6D0\uB300|\uC218\uC758\uC608": (cs, gt) => gangwonYak(cs, gt),
  "\uAC15\uC6D0\uB300|\uCE58\uC758\uC608": (cs, gt) => gangwonYak(cs, gt),
  // 전북대 약학/치의예/수의예: 등급 = 석차평균×0.9 + 진로상위3(A1·B2·C3)×0.1
  "\uC804\uBD81\uB300|\uC57D\uD559": (cs, gt) => jeonbukYak(cs, gt),
  "\uC804\uBD81\uB300|\uCE58\uC758\uC608": (cs, gt) => jeonbukYak(cs, gt),
  "\uC804\uBD81\uB300|\uC218\uC758\uC608": (cs, gt) => jeonbukYak(cs, gt),
  // 제주대 수의예: jejuVet (석차 등급환산 1=1000 step20, 공통×0.3 + (일반+진로 상위3)×0.7)
  "\uC81C\uC8FC\uB300|\uC218\uC758\uC608": (cs, gt) => jejuVet(cs, gt),
  // 연세대 치의예/약학: 추천형 로직(등급점수50%+Z점수환산50%, 진로 A/B/C). 등급=국수영사과 석차평균
  "\uC5F0\uC138\uB300|\uCE58\uC758\uC608": (cs, gt) => {
    const r = yonseiScore(cs);
    return R(seokAvg(pick(cs, /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uC0AC\uD68C", "\uACFC\uD559"]), le(gt)).seok), r.score, 100, true, r.exact, "\uC5F0\uC138 \uCE58\uC758\uC608: \uCD94\uCC9C\uD615(\uB4F1\uAE0950%+Z50%)");
  },
  "\uC5F0\uC138\uB300|\uC57D\uD559": (cs, gt) => {
    const r = yonseiScore(cs);
    return R(seokAvg(pick(cs, /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uC0AC\uD68C", "\uACFC\uD559"]), le(gt)).seok), r.score, 100, true, r.exact, "\uC5F0\uC138 \uC57D\uD559: \uCD94\uCC9C\uD615(\uB4F1\uAE0950%+Z50%)");
  },
  // 연세대 의예: 추천형 로직 — 치의예/약학과 동일(등급50%+Z50%). 메디컬 뷰가 근사 역산 대신 정밀식 쓰도록 규칙 추가.
  "\uC5F0\uC138\uB300|\uC758\uC608": (cs, gt) => {
    const r = yonseiScore(cs);
    return R(seokAvg(pick(cs, /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uC0AC\uD68C", "\uACFC\uD559"]), le(gt)).seok), r.score, 100, true, r.exact, "\uC5F0\uC138 \uC758\uC608: \uCD94\uCC9C\uD615(\uB4F1\uAE0950%+Z50%)");
  },
  // 충북대 수의예: 국수영사과, 배점 1=10·2=9.5·3=9…8=4·9=0. 진로 충북식(A→1, B→누적(B+C%), C→누적(C%)). 교과=(Σ/단위)×4+40
  "\uCDA9\uBD81\uB300|\uC218\uC758\uC608": (cs, gt) => {
    const B = { 1: 10, 2: 9.5, 3: 9, 4: 8.5, 5: 8, 6: 7.5, 7: 7, 8: 4, 9: 0 };
    const cum = (p) => {
      const T = [[96.1, 1], [89.1, 2], [77.1, 3], [60.1, 4], [40.1, 5], [23.1, 6], [11.1, 7], [4.1, 8], [0, 9]];
      for (const [lo, g2] of T) if (p >= lo) return g2;
      return 9;
    };
    const convCB = (c) => {
      const a = c.achievement;
      const dB = c.distB ?? 0, dC = c.distC ?? 0;
      return a === "A" ? 1 : a === "B" ? cum(dB + dC) : cum(dC);
    };
    const { seok } = pick(cs, KUS, le(gt));
    const jd = cs.filter((c) => c.kind !== "\uACF5\uD1B5" && !hasRank(c) && KUS.has(areaKey(c.area)) && c.achievement && "ABC".includes(c.achievement) && (c.units || 0) > 0 && semNo(c) <= le(gt) && (c.distA || c.distB || c.distC));
    const sg = seok.reduce((s, c) => s + B[c.rank] * c.units, 0) + jd.reduce((s, c) => s + B[Math.min(convCB(c), 9)] * c.units, 0);
    const su = seok.reduce((s, c) => s + c.units, 0) + jd.reduce((s, c) => s + c.units, 0);
    const g = wavg([...seok.map((c) => [c.rank, c.units]), ...jd.map((c) => [convCB(c), c.units])]);
    return R(g, su ? round(sg / su * 4 + 40, 2) : null, 80, true, true, "\uCDA9\uBD81 \uC218\uC758\uC608: \uAD6D\uC218\uC601\uC0AC\uACFC \uBC30\uC810(1=10\u2026)\xD74+40, \uC9C4\uB85C \uCDA9\uBD81\uC2DD");
  }
};
function gangwonYak(cs, gt) {
  const B = lin(1e3, 30);
  const Mj = { A: 1e3, B: 970, C: 910 };
  let cu = 0, cg = 0, ju = 0, jg = 0;
  for (const c of cs) {
    if (!KUK.has(areaKey(c.area)) || (c.units || 0) <= 0 || semNo(c) > le(gt)) continue;
    if (hasRank(c)) {
      cg += B[c.rank] * c.units;
      cu += c.units;
    } else if (c.name === "\uACFC\uD559\uD0D0\uAD6C\uC2E4\uD5D8") {
      cg += B[1] * c.units;
      cu += c.units;
    } else if (Mj[c.achievement] != null) {
      jg += Mj[c.achievement] * c.units;
      ju += c.units;
    }
  }
  const common = cu ? cg / cu : 0;
  const jinro = ju ? jg / ju : 0;
  const gyo = common * 0.9 + jinro * 0.1;
  const seokList = cs.filter((c) => KUK.has(areaKey(c.area)) && hasRank(c) && semNo(c) <= le(gt) && (c.units || 0) > 0);
  return R(
    round(1 + (1e3 - gyo) / 30, 4),
    round(gyo, 2),
    1e3,
    false,
    true,
    "\uAC15\uC6D0 \uC57D\uD559\uACC4\uC5F4: \uBC30\uC810\xD70.9+\uC9C4\uB85C\xD70.1, \uB4F1\uAE09=1+(1000\u2212\uAD50\uACFC)/30"
  );
}
function kkRatioGrade(p) {
  const T = [[4, 9], [11, 8], [23, 7], [40, 6], [60, 5], [77, 4], [89, 3], [96, 2]];
  for (const [hi, g] of T) if (p < hi) return g;
  return 1;
}
function jejuVet(cs, gt) {
  const B = lin(1e3, 20);
  const KG = /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uACFC\uD559"]);
  const gk = cs.filter((c) => c.kind === "\uACF5\uD1B5" && KUK.has(areaKey(c.area)) && hasRank(c) && semNo(c) <= le(gt) && c.name !== "\uACFC\uD559\uD0D0\uAD6C\uC2E4\uD5D8");
  const il = cs.filter((c) => c.kind === "\uC77C\uBC18\uC120\uD0DD" && KUK.has(areaKey(c.area)) && hasRank(c) && semNo(c) <= le(gt));
  if (!gk.length && !il.length) {
    return R(seokAvg(pick(cs, KUK, le(gt)).seok), null, 1e3, true, false, "\uC81C\uC8FC: \uACF5\uD1B5/\uC77C\uBC18 \uAD6C\uBD84 \uD544\uC694(\uB4F1\uAE09\uB9CC)");
  }
  const jr = cs.filter((c) => c.kind === "\uC9C4\uB85C\uC120\uD0DD" && KG.has(areaKey(c.area)) && c.achievement && "ABC".includes(c.achievement) && semNo(c) <= le(gt));
  const jr3 = [...jr].sort((a, b) => (b.rawScore ?? 0) - (a.rawScore ?? 0)).slice(0, 3);
  const MJ = { A: 1e3, B: 970, C: 940 };
  const gu = gk.reduce((s, c) => s + c.units, 0);
  const gs = gk.reduce((s, c) => s + B[c.rank] * c.units, 0);
  const iu = il.reduce((s, c) => s + c.units, 0);
  const iss = il.reduce((s, c) => s + B[c.rank] * c.units, 0);
  const js = jr3.reduce((s, c) => s + MJ[c.achievement] * c.units, 0);
  const ju = jr3.reduce((s, c) => s + c.units, 0);
  const sc = (gu ? gs / gu * 0.3 : 0) + (iu + ju ? (iss + js) / (iu + ju) * 0.7 : 0);
  const allSeok = pick(cs, KUK, le(gt)).seok;
  const g = wavg([...allSeok.map((c) => [c.rank, c.units]), ...jr3.map((c) => [1, c.units])]);
  return R(g, round(sc, 2), 1e3, false, true, "\uC81C\uC8FC \uC758\uC608\xB7\uC218\uC758\uC608: \uC11D\uCC28 1000 step20, \uACF5\uD1B5\xD70.3+(\uC77C\uBC18+\uC9C4\uB85C\uC0C1\uC7043)\xD70.7");
}
function jeonbukYak(cs, gt) {
  const BJ = { 1: 9.8, 2: 9.3, 3: 8.8, 4: 8.3, 5: 7.8, 6: 6.8, 7: 4.6, 8: 2.4, 9: 0.2 };
  const { seok, jinro } = pick(cs, KUK, le(gt));
  if (!seok.length) return R(null, null, 1e3, true, false, "\uC804\uBD81\uB300: \uBC18\uC601\uAD50\uACFC \uC5C6\uC74C");
  const commonPt = baeAvg(seok, BJ) ?? 0;
  const JP = { A: 9.8, B: 9.3, C: 8.8 };
  const jr = jinro.filter((c) => KUS.has(areaKey(c.area)) && JP[c.achievement] != null);
  const t3 = [...jr].sort((a, b) => JP[b.achievement] - JP[a.achievement] || b.units - a.units).slice(0, 3);
  const jinPt = t3.length ? t3.reduce((s, c) => s + JP[c.achievement] * c.units, 0) / t3.reduce((s, c) => s + c.units, 0) : null;
  const avgPt = jinPt != null ? commonPt * 0.9 + jinPt * 0.1 : commonPt;
  const score = 930 + 70 * avgPt / 9.8;
  const sg = seokAvg(seok);
  const M = { A: 1, B: 2, C: 3 };
  const t3g = topByGrade(jr, M, 3);
  const jg = t3g.length ? t3g.reduce((s, c) => s + M[c.achievement] * c.units, 0) / t3g.reduce((s, c) => s + c.units, 0) : 0;
  const grade = sg == null ? null : t3g.length ? sg * 0.9 + jg * 0.1 : sg;
  return R(grade, round(score, 2), 1e3, true, true, "\uC804\uBD81\uB300: \uB4F1\uAE09\uC810\uC218(1=9.80\u20269=0.20) \uACF5\uD1B5\uC77C\uBC18\xD70.9+\uC9C4\uB85C\uC0C1\uC7043(A9.80\xB7B9.30\xB7C8.80)\xD70.1, 930+70\xD7\uD3C9\uADE0/9.8");
}
var INMUN0 = /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uC0AC\uD68C"]);
var INMUNH = /* @__PURE__ */ new Set(["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uC0AC\uD68C", "\uD55C\uAD6D\uC0AC"]);
var L2 = lin(100, 2);
function jtop(jinro, areas, jmScore, capN) {
  const jj = jinro.filter((c) => areas.has(areaKey(c.area)) && jmScore[c.achievement] != null);
  const s = [...jj].sort((a, b) => jmScore[b.achievement] - jmScore[a.achievement] || b.units - a.units);
  return capN == null ? s : s.slice(0, capN);
}
function genC(seok, jsel, bae, jmScore) {
  const su = seok.reduce((s, c) => s + c.units, 0) + jsel.reduce((s, c) => s + c.units, 0);
  if (!su) return null;
  const sg = seok.reduce((s, c) => s + bae[c.rank] * c.units, 0) + jsel.reduce((s, c) => s + jmScore[c.achievement] * c.units, 0);
  const GM = { A: 1, B: 2, C: 3 };
  const gg = seok.reduce((s, c) => s + c.rank * c.units, 0) + jsel.reduce((s, c) => s + GM[c.achievement] * c.units, 0);
  return { avg: sg / su, grade: gg / su, su };
}
var GENERAL_RULES = {
  // 경북대 일반학과: 인문=국수영사과한 전과목 / 자연(공대·생태·자율)=상위10과목. 배점 lin(400,10). 만점400
  "\uACBD\uBD81\uB300|\uC778\uBB38": (cs, gt) => {
    const { seok } = pick(cs, KUK, le(gt));
    return R(seokAvg(seok), round(baeAvg(seok, lin(400, 10)) ?? 0, 2), 400, true, true, "\uACBD\uBD81 \uC778\uBB38: \uAD6D\uC218\uC601\uC0AC\uACFC\uD55C \uC804\uACFC\uBAA9 \uBC30\uC810 lin(400,10)");
  },
  "\uACBD\uBD81\uB300|\uC790\uC5F0": (cs, gt) => {
    const { seok } = pick(cs, KUK, le(gt));
    const top = [...seok].sort((a, b) => a.rank - b.rank || b.units - a.units).slice(0, 10);
    const su = top.reduce((s, c) => s + c.units, 0);
    if (!su) return R(null, null, 400, true, false, "\uACBD\uBD81 \uC790\uC5F0");
    const B = lin(400, 10);
    return R(round(top.reduce((s, c) => s + c.rank * c.units, 0) / su, 4), round(top.reduce((s, c) => s + B[c.rank] * c.units, 0) / su, 2), 400, true, true, "\uACBD\uBD81 \uC790\uC5F0(\uACF5\uB300\xB7\uC0DD\uD0DC\xB7\uC790\uC728): \uAD6D\uC218\uC601\uC0AC\uACFC\uD55C \uC0C1\uC70410\uACFC\uBAA9 \uBC30\uC810 lin(400,10)");
  },
  // 가천대 일반학과(학생부우수자): max(유형1 변환등급×10, 유형2 상위10 배점×10). 인문=국수영사 / 자연=국수영과
  "\uAC00\uCC9C\uB300|\uC778\uBB38": (cs, gt) => gachon(cs, gt, INMUN0),
  "\uAC00\uCC9C\uB300|\uC790\uC5F0": (cs, gt) => gachon(cs, gt, KUE),
  // 충북대 일반학과: 수의예과와 동일(국수영사과 배점 lin(10,0.5)×4+40, 진로 충북식). → 75.67
  "\uCDA9\uBD81\uB300": (cs, gt) => GUBUN_RULES["\uCDA9\uBD81\uB300|\uC218\uC758\uC608"](cs, gt),
  // 광운대: 배점 lin(100,2), 진로 A1B2C4(=배점[1/2/4]), 결합평균×10. 자연=국영수사과한, 인문=국영수사한
  "\uAD11\uC6B4\uB300|\uC790\uC5F0": (cs, gt) => {
    const { seok, jinro } = pick(cs, KUK, le(gt));
    const jm = { A: L2[1], B: L2[2], C: L2[4] };
    const c = genC(seok, jtop(jinro, KUS, jm, null), L2, jm);
    return R(c && round(c.grade, 4), c && round(c.avg * 10, 3), 1e3, true, true, "\uAD11\uC6B4 \uC790\uC5F0: \uAD6D\uC601\uC218\uC0AC\uACFC\uD55C lin(100,2)+\uC9C4\uB85C(A1B2C4), \uACB0\uD569\uD3C9\uADE0\xD710");
  },
  "\uAD11\uC6B4\uB300|\uC778\uBB38": (cs, gt) => {
    const { seok, jinro } = pick(cs, INMUNH, le(gt));
    const jm = { A: L2[1], B: L2[2], C: L2[4] };
    const c = genC(seok, jtop(jinro, INMUN0, jm, null), L2, jm);
    return R(c && round(c.grade, 4), c && round(c.avg * 10, 3), 1e3, true, true, "\uAD11\uC6B4 \uC778\uBB38: \uAD6D\uC601\uC218\uC0AC\uD55C lin(100,2)+\uC9C4\uB85C(A1B2C4), \uACB0\uD569\uD3C9\uADE0\xD710");
  },
  // 국민대: 공통 배점(3=98,4=95) avg×0.85 + 진로상위3(A100B98C90) avg×0.15, ×10. 인문=국영수사, 자연=국영수과
  "\uAD6D\uBBFC\uB300|\uC778\uBB38": (cs, gt) => generalKM(cs, gt, INMUN0, INMUN0),
  "\uAD6D\uBBFC\uB300|\uC790\uC5F0": (cs, gt) => generalKM(cs, gt, KUE, KUE),
  // 단국대(죽전): 국영수사과한(+과탐 1등급)·진로 A1B3C5, CAT_BAE ×0.95×10 (단국천안과 동일)
  "\uB2E8\uAD6D\uB300|\uC790\uC5F0": (cs, gt) => danguk(cs, gt),
  "\uB2E8\uAD6D\uB300|\uC778\uBB38": (cs, gt) => danguk(cs, gt),
  // 명지대 자연: 국영수과 배점(3=98,4=94)+진로 국수영과(과탐 포함) A1B2C4, (결합평균+총단위×0.05)×10
  "\uBA85\uC9C0\uB300|\uC790\uC5F0": (cs, gt) => myeongji(cs, gt, KUE),
  "\uBA85\uC9C0\uB300|\uC778\uBB38": (cs, gt) => myeongji(cs, gt, INMUN0),
  // 상명대: 전과목 석차 lin(100,2) + 진로상위3(A100B96C90), 결합평균×10
  "\uC0C1\uBA85\uB300|\uC778\uBB38": (cs, gt) => sangmyung(cs, gt),
  "\uC0C1\uBA85\uB300|\uC790\uC5F0": (cs, gt) => sangmyung(cs, gt),
  // 서강대: (10−석차등급평균)×100 + 진로(성취 우수 시 100 상한). 전과목
  "\uC11C\uAC15\uB300|\uC778\uBB38": (cs, gt) => sogang(cs, gt),
  "\uC11C\uAC15\uB300|\uC790\uC5F0": (cs, gt) => sogang(cs, gt),
  // 서울과기대: 배점 1000스케일(3=980,4=970)+진로상위3(A1000B980C960), 결합평균. 자연 국영수과/인문 국영수사
  "\uC11C\uC6B8\uACFC\uAE30\uB300|\uC790\uC5F0": (cs, gt) => {
    const B = { 1: 1e3, 2: 990, 3: 980, 4: 970, 5: 960, 6: 950, 7: 900, 8: 850, 9: 800 };
    const { seok, jinro } = pick(cs, KUE, le(gt));
    const jm = { A: 1e3, B: 980, C: 960 };
    const c = genC(seok, jtop(jinro, KUE, jm, 3), B, jm);
    return R(seokAvg(seok), c && round(c.avg, 2), 1e3, true, true, "\uC11C\uC6B8\uACFC\uAE30 \uC790\uC5F0: \uAD6D\uC601\uC218\uACFC \uBC30\uC810(1000\uC2A4\uCF00\uC77C)+\uC9C4\uB85C\uC0C1\uC7043(A1000B980C960)");
  },
  "\uC11C\uC6B8\uACFC\uAE30\uB300|\uC778\uBB38": (cs, gt) => {
    const B = { 1: 1e3, 2: 990, 3: 980, 4: 970, 5: 960, 6: 950, 7: 900, 8: 850, 9: 800 };
    const { seok, jinro } = pick(cs, INMUN0, le(gt));
    const jm = { A: 1e3, B: 980, C: 960 };
    const c = genC(seok, jtop(jinro, INMUN0, jm, 3), B, jm);
    return R(seokAvg(seok), c && round(c.avg, 2), 1e3, true, true, "\uC11C\uC6B8\uACFC\uAE30 \uC778\uBB38: \uAD6D\uC601\uC218\uC0AC \uBC30\uC810(1000\uC2A4\uCF00\uC77C)+\uC9C4\uB85C\uC0C1\uC7043");
  },
  // 서울여대: 국수영사과(한국사 제외) CAT_BAE avg + 진로상위3 가산(A1.0B0.9C0.5)/3. 만점100
  "\uC11C\uC6B8\uC5EC\uB300|\uC790\uC5F0": (cs, gt) => seoulwomen(cs, gt, KUS),
  "\uC11C\uC6B8\uC5EC\uB300|\uC778\uBB38": (cs, gt) => seoulwomen(cs, gt, INMUN0),
  // 이화여대: 배점 10스케일(2=9.6,3=9.2,4=8.6) 공통avg×0.8 + 진로(A10B8.6C5)avg×0.2, ×100. 자연 국영수사과한
  "\uC774\uD654\uC5EC\uB300|\uC790\uC5F0": (cs, gt) => ewha(cs, gt, KUK),
  "\uC774\uD654\uC5EC\uB300|\uC778\uBB38": (cs, gt) => ewha(cs, gt, INMUNH),
  // 성신여대: (공통+진로 결합 배점평균 ×0.2)+70. 배점(3=98,4=96), 진로상위4 A1B2C4. 자연 국영수과/인문 국영수사
  "\uC131\uC2E0\uC5EC\uB300|\uC790\uC5F0": (cs, gt) => sungshin(cs, gt, KUE),
  "\uC131\uC2E0\uC5EC\uB300|\uC778\uBB38": (cs, gt) => sungshin(cs, gt, INMUNH),
  // 세종대: 공통 배점(1000스케일:3=980,4=950)avg×0.8 + 진로(A1000B980C900)avg×0.2. 자연 국영수과/인문 국영수사
  "\uC138\uC885\uB300|\uC790\uC5F0": (cs, gt) => sejong(cs, gt, KUE),
  "\uC138\uC885\uB300|\uC778\uBB38": (cs, gt) => sejong(cs, gt, INMUN0),
  // 인하대 인문: 국수영사 배점lin(100,2)+진로상위3(A1B2C4), 결합평균×10
  "\uC778\uD558\uB300|\uC778\uBB38": (cs, gt) => {
    const { seok, jinro } = pick(cs, INMUN0, le(gt));
    const jm = { A: L2[1], B: L2[2], C: L2[4] };
    const c = genC(seok, jtop(jinro, INMUN0, jm, 3), L2, jm);
    return R(c && round(c.grade, 4), c && round(c.avg * 10, 3), 1e3, true, true, "\uC778\uD558 \uC778\uBB38: \uAD6D\uC218\uC601\uC0AC lin(100,2)+\uC9C4\uB85C\uC0C1\uC7043(A1B2C4)\xD710");
  },
  // 홍익대: {(공통배점avg×0.9)+진로배점avg}×(총단위/1000+0.9). 배점 경희식, 진로 A10B9C7. 자연 국영수과/인문 국영수사
  "\uD64D\uC775\uB300|\uC778\uBB38": (cs, gt) => hongik(cs, gt, INMUNH, INMUN0),
  "\uD64D\uC775\uB300|\uC790\uC5F0": (cs, gt) => hongik(cs, gt, KUE, KUE),
  // 동국대(서울) 학교장추천인재: 상위10과목(과목수 기준), 기준점수 1=10·2=9.99·3=9.95·4=9.9…, (등급점수/10)×만점700.
  //   인문 국영수사한 / 자연 국영수과한. 등급=상위10 석차평균. (약학 RULES['동국대']와 별개)
  "\uB3D9\uAD6D\uB300|\uC778\uBB38": (cs, gt) => dongguk(cs, gt, INMUNH),
  "\uB3D9\uAD6D\uB300|\uC790\uC5F0": (cs, gt) => dongguk(cs, gt, KUEH),
  // 한양대(추천형): 국영수사과한 배점 경희식 avg×9 (진로 정성평가 미반영). 만점900
  "\uD55C\uC591\uB300|\uC790\uC5F0": (cs, gt) => hanyang(cs, gt),
  "\uD55C\uC591\uB300|\uC778\uBB38": (cs, gt) => hanyang(cs, gt),
  // 한국외대(학교장추천): 국수영사과한, 과목별 max(등급환산, 원점수환산)+진로(A1000B960C890), Σ/Σ단위. 전 계열 동일
  "\uD55C\uAD6D\uC678\uB300": (cs, gt) => hufs(cs, gt),
  // 서울시립대(고교추천): 전과목 석차배점(100/98/95/86/71/50/30/15/0)avg×7 + 진로선택 전과목(A100B97C90)avg×1. 만점800
  "\uC11C\uC6B8\uC2DC\uB9BD\uB300": (cs, gt) => uos(cs, gt)
};
var HONGIK_BAE = { 1: 100, 2: 96, 3: 89, 4: 77, 5: 60, 6: 40, 7: 23, 8: 11, 9: 0 };
function generalKM(cs, gt, sArea, jArea) {
  const B = { 1: 100, 2: 99, 3: 98, 4: 95, 5: 92, 6: 89, 7: 86, 8: 83, 9: 80 };
  const { seok, jinro } = pick(cs, sArea, le(gt));
  const jm = { A: 100, B: 98, C: 90 };
  const common = baeAvg(seok, B);
  const t3 = jtop(jinro, jArea, jm, 3);
  const ja = t3.length ? t3.reduce((s, c) => s + jm[c.achievement], 0) / t3.length : 0;
  const sc = common == null ? null : (common * 0.85 + ja * 0.15) * 10;
  return R(seokAvg(seok), sc == null ? null : round(sc, 2), 1e3, true, true, "\uAD6D\uBBFC\uB300: \uACF5\uD1B5\uBC30\uC810avg\xD70.85+\uC9C4\uB85C\uC0C1\uC7043(A100B98C90)avg\xD70.15, \xD710");
}
function danguk(cs, gt) {
  const { seok, jinro } = pick(cs, KUK, le(gt), true);
  const M = { A: 1, B: 3, C: 5 };
  const B = lin(100, 1);
  const g = wavg([...seok.map((c) => [c.rank, c.units]), ...jinMap(jinro, M)]);
  const jm2 = jinro.filter((c) => M[c.achievement] != null);
  const sg = seok.reduce((s, c) => s + B[c.rank] * c.units, 0) + jm2.reduce((s, c) => s + B[M[c.achievement]] * c.units, 0);
  const su = seok.reduce((s, c) => s + c.units, 0) + jm2.reduce((s, c) => s + c.units, 0);
  return R(g, round(sg / su * 0.95 * 10, 2), 1e3, true, true, "\uB2E8\uAD6D(\uC8FD\uC804): \uAD6D\uC601\uC218\uC0AC\uACFC\uD55C(+\uACFC\uD0D0)+\uC9C4\uB85C A1B3C5 \xD70.95\xD710. \uCD9C\uACB0 \uC81C\uC678");
}
function myeongji(cs, gt, sArea) {
  const B = { 1: 100, 2: 99, 3: 98, 4: 94, 5: 90, 6: 86, 7: 82, 8: 78, 9: 74 };
  const { seok, jinro } = pick(cs, sArea, le(gt));
  const jm = { A: B[1], B: B[2], C: B[4] };
  const jsel = jtop(jinro, sArea, jm, null);
  const gwat = sArea.has("\uACFC\uD559") ? cs.filter((c) => c.name === "\uACFC\uD559\uD0D0\uAD6C\uC2E4\uD5D8" && c.achievement === "A" && (c.units || 0) > 0 && semNo(c) <= le(gt)) : [];
  const su = seok.reduce((s, c) => s + c.units, 0) + jsel.reduce((s, c) => s + c.units, 0) + gwat.reduce((s, c) => s + c.units, 0);
  const sg = seok.reduce((s, c) => s + B[c.rank] * c.units, 0) + jsel.reduce((s, c) => s + jm[c.achievement] * c.units, 0) + gwat.reduce((s, c) => s + B[1] * c.units, 0);
  const sc = su ? (sg / su + su * 0.05) * 10 : null;
  return R(seokAvg(seok), sc == null ? null : round(sc, 3), 1e3, true, true, "\uBA85\uC9C0: \uAD6D\uC601\uC218\uACFC \uBC30\uC810+\uC9C4\uB85C(A1B2C4\xB7\uACFC\uD0D0\uD3EC\uD568)+\uC774\uC218\uB2E8\uC704\uAC00\uC0B0(\xD70.05), \xD710");
}
function sangmyung(cs, gt) {
  const seok = cs.filter((c) => hasRank(c) && (c.units || 0) > 0 && semNo(c) <= le(gt) && c.name !== "\uACFC\uD559\uD0D0\uAD6C\uC2E4\uD5D8");
  const jinro = cs.filter((c) => !hasRank(c) && c.achievement && (c.units || 0) > 0 && semNo(c) <= le(gt) && c.name !== "\uACFC\uD559\uD0D0\uAD6C\uC2E4\uD5D8");
  const jm = { A: 100, B: 96, C: 90 };
  const t3 = [...jinro.filter((c) => jm[c.achievement] != null)].sort((a, b) => jm[b.achievement] - jm[a.achievement] || b.units - a.units).slice(0, 3);
  const su = seok.reduce((s, c) => s + c.units, 0) + t3.reduce((s, c) => s + c.units, 0);
  const sg = seok.reduce((s, c) => s + L2[c.rank] * c.units, 0) + t3.reduce((s, c) => s + jm[c.achievement] * c.units, 0);
  const g = seok.length ? seok.reduce((s, c) => s + c.rank * c.units, 0) / seok.reduce((s, c) => s + c.units, 0) : null;
  return R(g, su ? round(sg / su * 10, 3) : null, 1e3, true, true, "\uC0C1\uBA85: \uC804\uACFC\uBAA9 lin(100,2)+\uC9C4\uB85C\uC0C1\uC7043(A100B96C90), \uACB0\uD569\uD3C9\uADE0\xD710");
}
function sogang(cs, gt) {
  const seok = cs.filter((c) => hasRank(c) && (c.units || 0) > 0 && semNo(c) <= le(gt) && c.name !== "\uACFC\uD559\uD0D0\uAD6C\uC2E4\uD5D8");
  const su = seok.reduce((s, c) => s + c.units, 0);
  if (!su) return R(null, null, 1e3, true, false, "\uC11C\uAC15: \uBC18\uC601\uAD50\uACFC \uC5C6\uC74C");
  const g = seok.reduce((s, c) => s + c.rank * c.units, 0) / su;
  const hasJin = cs.some((c) => !hasRank(c) && c.achievement && semNo(c) <= le(gt) && c.name !== "\uACFC\uD559\uD0D0\uAD6C\uC2E4\uD5D8");
  const jinScore = hasJin ? 100 : 0;
  return R(round(g, 4), round((10 - g) * 100 + jinScore, 2), 1e3, true, true, "\uC11C\uAC15: (10\u2212\uC11D\uCC28\uB4F1\uAE09\uD3C9\uADE0)\xD7100 + \uC9C4\uB85C(\uC131\uCDE8 \uC6B0\uC218 \uC2DC 100). \uC804\uACFC\uBAA9");
}
function seoulwomen(cs, gt, sArea) {
  const { seok, jinro } = pick(cs, sArea, le(gt));
  const common = baeAvg(seok, CAT_BAE);
  const GP = { A: 1, B: 0.9, C: 0.5 };
  const t3 = jtop(jinro, sArea, GP, 3);
  const add = t3.length ? t3.reduce((s, c) => s + GP[c.achievement], 0) / 3 : 0;
  return R(seokAvg(seok), common == null ? null : round(common + add, 2), 100, true, true, "\uC11C\uC6B8\uC5EC\uB300: \uAD6D\uC218\uC601\uC0AC\uACFC CAT\uBC30\uC810avg + \uC9C4\uB85C\uC0C1\uC7043(A1.0B0.9C0.5)/3. \uB9CC\uC810100");
}
function ewha(cs, gt, sArea) {
  const B = { 1: 10, 2: 9.6, 3: 9.2, 4: 8.6, 5: 8, 6: 7, 7: 6, 8: 4, 9: 2 };
  const { seok, jinro } = pick(cs, sArea, le(gt));
  const common = baeAvg(seok, B);
  const jm = { A: 10, B: 8.6, C: 5 };
  const jsel = jtop(jinro, sArea, jm, null);
  const ja = jsel.length ? jsel.reduce((s, c) => s + jm[c.achievement] * c.units, 0) / jsel.reduce((s, c) => s + c.units, 0) : 0;
  const gg = (seok.reduce((s, c) => s + c.rank * c.units, 0) + jsel.reduce((s, c) => s + { A: 1, B: 2, C: 3 }[c.achievement] * c.units, 0)) / (seok.reduce((s, c) => s + c.units, 0) + jsel.reduce((s, c) => s + c.units, 0));
  const sc = common == null ? null : (common * 0.8 + ja * 0.2) * 100;
  return R(round(gg, 4), sc == null ? null : round(sc, 3), 1e3, true, true, "\uC774\uD654: \uBC30\uC810(10\uC2A4\uCF00\uC77C) \uACF5\uD1B5avg\xD70.8+\uC9C4\uB85C(A10B8.6C5)avg\xD70.2, \xD7100");
}
function sungshin(cs, gt, sArea) {
  const B = { 1: 100, 2: 99, 3: 98, 4: 96, 5: 94, 6: 92, 7: 90, 8: 88, 9: 86 };
  const { seok, jinro } = pick(cs, sArea, le(gt));
  const jm = { A: B[1], B: B[2], C: B[4] };
  const jsel = jtop(jinro, sArea, jm, 4);
  const c = genC(seok, jsel, B, jm);
  return R(c && round(c.grade, 4), c ? round(c.avg * 0.2 + 70, 4) : null, 100, true, true, "\uC131\uC2E0: \uACB0\uD569 \uBC30\uC810\uD3C9\uADE0\xD70.2+70(\uC9C4\uB85C\uC0C1\uC7044 A1B2C4). \uAD50\uACFC \uBD80\uBD84 \uB9CC\uC810100");
}
function sejong(cs, gt, sArea) {
  const B = { 1: 1e3, 2: 990, 3: 980, 4: 950, 5: 900, 6: 850, 7: 800, 8: 750, 9: 700 };
  const { seok } = pick(cs, sArea, le(gt));
  const common = baeAvg(seok, B);
  const jm = { A: 1e3, B: 980, C: 900 };
  const jsel = jtop(pick(cs, sArea, le(gt)).jinro, sArea, jm, null);
  const ja = jsel.length ? jsel.reduce((s, c) => s + jm[c.achievement] * c.units, 0) / jsel.reduce((s, c) => s + c.units, 0) : 0;
  const sc = common == null ? null : common * 0.8 + ja * 0.2;
  const jG = { A: 1, B: 3, C: 5 };
  const jgu = jsel.reduce((s, c) => s + c.units, 0);
  const jgAvg = jgu ? jsel.reduce((s, c) => s + jG[c.achievement] * c.units, 0) / jgu : null;
  const sa = seokAvg(seok);
  const grade = sa == null ? null : jgAvg == null ? sa : round(sa * 0.8 + jgAvg * 0.2, 4);
  return R(grade, sc == null ? null : round(sc, 3), 1e3, true, true, "\uC138\uC885: \uACF5\uD1B5 \uBC30\uC810(1000)avg\xD70.8+\uC9C4\uB85C(A1000B980C900)avg\xD70.2. \uB4F1\uAE09=\uACF5\uD1B5\uC11D\uCC28\xD70.8+\uC9C4\uB85C\uC11D\uCC28(A1B3C5)\xD70.2");
}
function hongik(cs, gt, sArea, jArea) {
  const { seok, jinro } = pick(cs, sArea, le(gt));
  const common = baeAvg(seok, HONGIK_BAE);
  const jm = { A: 10, B: 9, C: 7 };
  const jsel = jtop(jinro, jArea, jm, null);
  const ja = jsel.length ? jsel.reduce((s, c) => s + jm[c.achievement] * c.units, 0) / jsel.reduce((s, c) => s + c.units, 0) : 0;
  const su = Math.min(seok.reduce((s, c) => s + c.units, 0) + jsel.reduce((s, c) => s + c.units, 0), 100);
  const sc = common == null ? null : (common * 0.9 + ja) * (su / 1e3 + 0.9);
  return R(seokAvg(seok), sc == null ? null : round(sc, 2), 100, true, true, "\uD64D\uC775: {(\uACF5\uD1B5\uBC30\uC810avg\xD70.9)+\uC9C4\uB85C(A10B9C7)avg}\xD7(min(\uCD1D\uB2E8\uC704,100)/1000+0.9). \uB9CC\uC810100");
}
function dongguk(cs, gt, sArea) {
  const { seok } = pick(cs, sArea, le(gt));
  const top = [...seok].sort((a, b) => a.rank - b.rank || b.units - a.units).slice(0, 10);
  if (!top.length) return R(null, null, 700, true, false, "\uB3D9\uAD6D(\uC11C\uC6B8): \uBC18\uC601\uAD50\uACFC \uC5C6\uC74C");
  const B = { 1: 10, 2: 9.99, 3: 9.95, 4: 9.9, 5: 9, 6: 8, 7: 5, 8: 3, 9: 0 };
  const g = top.reduce((s, c) => s + c.rank, 0) / top.length;
  const sc = top.reduce((s, c) => s + B[c.rank], 0) / top.length / 10 * 700;
  return R(round(g, 2), round(sc, 3), 700, true, true, "\uB3D9\uAD6D(\uC11C\uC6B8): \uC0C1\uC70410\uACFC\uBAA9(\uACFC\uBAA9\uC218) \uAE30\uC900\uC810\uC218, (\uB4F1\uAE09\uC810\uC218/10)\xD7700. \uC778\uBB38 \uAD6D\uC601\uC218\uC0AC\uD55C/\uC790\uC5F0 \uAD6D\uC601\uC218\uACFC\uD55C");
}
function hanyang(cs, gt) {
  const { seok } = pick(cs, KUK, le(gt));
  const common = baeAvg(seok, HONGIK_BAE);
  return R(seokAvg(seok), common == null ? null : round(common * 9, 3), 900, true, true, "\uD55C\uC591(\uCD94\uCC9C\uD615): \uAD6D\uC601\uC218\uC0AC\uACFC\uD55C \uBC30\uC810(\uACBD\uD76C\uC2DD)avg\xD79. \uC9C4\uB85C \uC815\uC131\uD3C9\uAC00 \uBBF8\uBC18\uC601");
}
function hufs(cs, gt) {
  const EB = { 1: 1e3, 2: 960, 3: 890, 4: 770, 5: 600, 6: 400, 7: 230, 8: 110, 9: 0 };
  const rawConv = (raw, area) => {
    if (raw == null) return 0;
    const th = area === "\uC218\uD559" ? [[90, 1e3], [80, 960], [70, 890], [60, 770], [50, 600], [40, 400], [30, 230], [20, 110]] : [[90, 1e3], [85, 960], [80, 890], [75, 770], [70, 600], [60, 400], [50, 230], [40, 110]];
    for (const [lo, v] of th) if (raw >= lo) return v;
    return 0;
  };
  const { seok, jinro } = pick(cs, KUK, le(gt));
  let sg = 0, su = 0;
  for (const c of seok) {
    sg += Math.max(EB[c.rank], rawConv(c.rawScore, areaKey(c.area))) * c.units;
    su += c.units;
  }
  const JP = { A: 1e3, B: 960, C: 890 };
  for (const c of jinro.filter((x) => JP[x.achievement] != null)) {
    sg += JP[c.achievement] * c.units;
    su += c.units;
  }
  return R(seokAvg(seok), su ? round(sg / su, 3) : null, 1e3, true, true, "\uD55C\uAD6D\uC678\uB300: \uAD6D\uC218\uC601\uC0AC\uACFC\uD55C, max(\uB4F1\uAE09\uD658\uC0B0,\uC6D0\uC810\uC218\uD658\uC0B0)+\uC9C4\uB85C(A1000B960C890), \u03A3/\u03A3\uB2E8\uC704");
}
function uos(cs, gt) {
  const B = { 1: 100, 2: 98, 3: 95, 4: 86, 5: 71, 6: 50, 7: 30, 8: 15, 9: 0 };
  const seok = cs.filter((c) => hasRank(c) && (c.units || 0) > 0 && semNo(c) <= le(gt) && c.name !== "\uACFC\uD559\uD0D0\uAD6C\uC2E4\uD5D8");
  const jj = cs.filter((c) => c.kind === "\uC9C4\uB85C\uC120\uD0DD" && !hasRank(c) && c.achievement && "ABC".includes(c.achievement) && (c.units || 0) > 0 && semNo(c) <= le(gt));
  const JP = { A: 100, B: 97, C: 90 };
  const cu = seok.reduce((s, c) => s + c.units, 0);
  if (!cu) return R(null, null, 800, true, false, "\uC11C\uC6B8\uC2DC\uB9BD: \uBC18\uC601\uAD50\uACFC \uC5C6\uC74C");
  const common = seok.reduce((s, c) => s + B[c.rank] * c.units, 0) / cu * 7;
  const ju = jj.reduce((s, c) => s + c.units, 0);
  const jin = ju ? jj.reduce((s, c) => s + JP[c.achievement] * c.units, 0) / ju * 1 : 0;
  const sc = ju ? common + jin : common / 7 * 8;
  const g = seok.reduce((s, c) => s + c.rank * c.units, 0) / cu;
  return R(round(g, 4), round(sc, 3), 800, true, true, "\uC11C\uC6B8\uC2DC\uB9BD(\uACE0\uAD50\uCD94\uCC9C): \uC804\uACFC\uBAA9 \uC11D\uCC28\uBC30\uC810avg\xD77 + \uC9C4\uB85C\uC120\uD0DD(A100B97C90)avg\xD71. \uB9CC\uC810800");
}
function gachon(cs, gt, areas) {
  const { seok } = pick(cs, areas, le(gt));
  if (!seok.length) return R(null, null, 1e3, true, false, "\uAC00\uCC9C \uC77C\uBC18: \uBC18\uC601\uAD50\uACFC \uC5C6\uC74C");
  const byun = (r) => r <= 2 ? 100 : r <= 4 ? 99.5 : r === 5 ? 99 : r <= 7 ? 90 : 70;
  const su1 = seok.reduce((s, c) => s + c.units, 0);
  const s1 = seok.reduce((s, c) => s + byun(c.rank) * c.units, 0) / su1 * 10;
  const GB = { 1: 100, 2: 99.5, 3: 99, 4: 98.5, 5: 98, 6: 97.5, 7: 85, 8: 60, 9: 30 };
  const top = [...seok].sort((a, b) => a.rank - b.rank || b.units - a.units).slice(0, 10);
  const su2 = top.reduce((s, c) => s + c.units, 0);
  const s2 = top.reduce((s, c) => s + GB[c.rank] * c.units, 0) / su2 * 10;
  return R(seokAvg(seok), round(Math.max(s1, s2), 3), 1e3, true, true, "\uAC00\uCC9C \uC77C\uBC18(\uD559\uC0DD\uBD80\uC6B0\uC218\uC790): max(\uC720\uD6151 \uBCC0\uD658\uB4F1\uAE09\xD710, \uC720\uD6152 \uC0C1\uC70410\uBC30\uC810\xD710)");
}
var GEN_REUSE_MED = /* @__PURE__ */ new Set([
  "\uACBD\uD76C\uB300",
  "\uBD80\uC0B0\uB300",
  "\uAC00\uD1A8\uB9AD\uB300",
  "\uC804\uBD81\uB300",
  "\uC544\uC8FC\uB300",
  "\uB355\uC131\uC5EC\uB300",
  "\uACE0\uB824\uB300",
  "\uC911\uC559\uB300",
  "\uC778\uD558\uB300",
  "\uAC74\uAD6D\uB300",
  "\uAC15\uC6D0\uB300",
  "\uCDA9\uB0A8\uB300",
  "\uC804\uB0A8\uB300",
  "\uC81C\uC8FC\uB300",
  "\uC219\uBA85\uC5EC\uB300",
  "\uB3D9\uB355\uC5EC\uB300"
]);
function findGeneralRule(univ, series) {
  if (series && GENERAL_RULES[`${univ}|${series}`]) return GENERAL_RULES[`${univ}|${series}`];
  if (GENERAL_RULES[univ]) return GENERAL_RULES[univ];
  if (GEN_REUSE_MED.has(univ) && RULES[univ]) return RULES[univ];
  return null;
}

// tools/naeshin/src/engine/medGrade.ts
function myNaeshinGrade(courses, spec) {
  const inSemester = (c) => spec.semester === "3-1" ? !(c.year === 3 && c.semester === 2) : true;
  const inArea = (c) => {
    if (spec.allSubjects) {
      return spec.excludeArts ? !["\uC608\uC220", "\uCCB4\uC721", "\uAE30\uD0C0"].includes(c.area) : true;
    }
    return spec.areas.includes(c.area);
  };
  const areaCourses = courses.filter((c) => inArea(c) && inSemester(c) && (c.units || 0) > 0);
  const achievementSkipped = areaCourses.filter(
    (c) => c.rank == null && !!c.achievement
  ).length;
  let list = areaCourses.filter((c) => c.rank != null);
  if (spec.topN != null && list.length > spec.topN) {
    list = [...list].sort((a, b) => a.rank - b.rank).slice(0, spec.topN);
  }
  if (list.length === 0) {
    return { grade: null, used: 0, units: 0, achievementSkipped };
  }
  let sw = 0;
  let su = 0;
  for (const c of list) {
    sw += c.rank * c.units;
    su += c.units;
  }
  return {
    grade: Math.round(sw / su * 1e3) / 1e3,
    used: list.length,
    units: su,
    achievementSkipped
  };
}

// tools/naeshin/src/engine/genEngine.ts
function genGrade(courses, spec) {
  const adapted = {
    ratio: spec.ratio,
    areas: spec.areas,
    allSubjects: spec.allSubjects,
    excludeArts: spec.excludeArts,
    semester: null,
    topN: spec.topN,
    achievement: false,
    zscore: spec.zscore,
    flags: spec.flags
  };
  const r = myNaeshinGrade(courses, adapted);
  if (r.grade == null) return null;
  if (spec.equalWeight) {
    const inArea = (c) => spec.allSubjects ? spec.excludeArts ? !["\uC608\uC220", "\uCCB4\uC721", "\uAE30\uD0C0"].includes(c.area) : true : spec.areas.includes(c.area);
    let list = courses.filter((c) => c.rank != null && inArea(c));
    if (spec.topN != null && list.length > spec.topN) {
      list = [...list].sort((a, b) => a.rank - b.rank).slice(0, spec.topN);
    }
    if (list.length === 0) return null;
    const avg = list.reduce((s, c) => s + c.rank, 0) / list.length;
    return Math.round(avg * 1e3) / 1e3;
  }
  return r.grade;
}
function median(xs) {
  const s = [...xs].sort((p, q) => p - q);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function fitOneYear(pts) {
  const byG = /* @__PURE__ */ new Map();
  for (const [g, s] of pts) {
    const k = Math.round(g * 100) / 100;
    (byG.get(k) ?? byG.set(k, []).get(k)).push(s);
  }
  const uniq = [...byG.entries()].map(([g, ss]) => [g, ss.reduce((a2, b2) => a2 + b2, 0) / ss.length]);
  if (uniq.length < 2) return { ok: false, a: 0, b: 0, scaleMax: 0 };
  const slopes = [];
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
function fitConv(records) {
  for (const yk of ["y2026", "y2025", "y2024"]) {
    const pts = [];
    for (const r of records) {
      const y = r[yk];
      if (y.grade != null && y.score != null) pts.push([y.grade, y.score]);
    }
    const f = fitOneYear(pts);
    if (f.ok) return f;
  }
  return { ok: false, a: 0, b: 0, scaleMax: 0 };
}
function genScore(fit, grade) {
  if (!fit.ok || grade == null) return null;
  const v = fit.a + fit.b * grade;
  if (v < 0) return null;
  return Math.min(v, fit.scaleMax);
}
function buildConvMap(records) {
  const groups = /* @__PURE__ */ new Map();
  for (const r of records) {
    const k = r.admName || "\uC804\uD615";
    (groups.get(k) ?? groups.set(k, []).get(k)).push(r);
  }
  const out = /* @__PURE__ */ new Map();
  for (const [k, rs] of groups) out.set(k, fitConv(rs));
  return out;
}
function judgeGrade(my, cut) {
  if (my == null || cut == null) return "\uC815\uBCF4\uC5C6\uC74C";
  return my <= cut + 1e-9 ? "\uD569\uACA9\uAD8C" : "\uCD08\uACFC";
}

// tools/naeshin/entry.ts
function calcRecord(r, courses, gradType, fit) {
  if (!courses.length) return { grade: null, score: null, precise: false, method: "\uC0B0\uCD9C \uBD88\uAC00", note: null };
  const baseGrade = genGrade(courses, r.spec);
  const custom = customCalc(r.univ, r.admName, r.banyeong, courses);
  const precise = findGeneralRule(r.univ, r.series)?.(courses, gradType ?? "\uC878\uC5C5\uC608\uC815\uC790") ?? null;
  const grade = precise?.grade != null ? precise.grade : custom && custom.grade != null ? custom.grade : baseGrade;
  const fitScore = fit ? genScore(fit, precise?.grade != null ? precise.grade : grade) : null;
  const score = precise?.score != null ? precise.score : custom && custom.score != null ? custom.score : fitScore;
  const method = precise?.grade != null ? "\uC815\uBC00 \uADDC\uCE59" : custom && (custom.grade != null || custom.score != null) ? "\uB300\uD559\uBCC4 \uBCF4\uC815" : grade != null ? "\uBC18\uC601\uACFC\uBAA9 \uD3C9\uADE0(\uADFC\uC0AC)" : "\uC0B0\uCD9C \uBD88\uAC00";
  return { grade, score, precise: precise?.score != null, method, note: precise?.note ?? custom?.note ?? null };
}
function overallGrade(courses) {
  const list = courses.filter((c) => c.rank != null && (c.units || 0) > 0);
  if (!list.length) return null;
  let sw = 0, su = 0;
  for (const c of list) {
    sw += c.rank * c.units;
    su += c.units;
  }
  return Math.round(sw / su * 100) / 100;
}
export {
  buildConvMap,
  calcRecord,
  judgeGrade,
  overallGrade
};
