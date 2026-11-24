/* 교과별 학업 경쟁력 분석
   진로설계 보드에서 불러온 교과 성적(학년·학기·교과·과목·이수단위·원점수·과목평균·
   표준편차·성취도·석차등급)을 다섯 개 화면으로 나눠 본다.

   ★ 규칙 — 없는 값은 만들지 않는다.
     원점수가 없으면 원점수 칸은 '–'로 두고, 그 과목은 평균 계산에서도 빠진다.
     모든 평균은 '이수단위 가중'이며, 분모가 되는 단위 수를 함께 보여 준다. */

export const AREA_ORDER = ['국어', '영어', '수학', '사회', '과학', '기술가정', '정보', '제2외국어', '한문', '체육', '예술', '교양'];
export const CORE5 = ['국어', '영어', '수학', '사회', '과학'];

const COMBOS = [
  { key: 'all', label: '전교과', areas: null, color: '#6b4fbb' },
  { key: 'kmesc', label: '국영수사과', areas: ['국어', '영어', '수학', '사회', '과학'], color: '#00897b' },
  { key: 'kmes', label: '국영수사', areas: ['국어', '영어', '수학', '사회'], color: '#1f6fd0' },
  { key: 'kmec', label: '국영수과', areas: ['국어', '영어', '수학', '과학'], color: '#d1477a' },
  { key: 'kme', label: '국영수', areas: ['국어', '영어', '수학'], color: '#9a6bd8' },
];
const AREA_COLOR = { 국어: '#6b4fbb', 영어: '#00897b', 수학: '#1f6fd0', 사회: '#c08a1e', 과학: '#c2185b' };

const num = v => { const n = Number(v); return v === '' || v == null || Number.isNaN(n) ? null : n; };
const r2 = v => (v == null ? null : Math.round(v * 100) / 100);
export const f2 = v => (v == null ? '–' : v.toFixed(2));
export const f1 = v => (v == null ? '–' : (Math.round(v * 10) / 10).toFixed(1));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* 교과명 정리 — 한국사는 사회로, 기술·가정은 기술가정으로 */
function areaOf(r) {
  const a = String(r.area || '').replace(/[·\s]/g, '');
  if (a === '한국사' || a === '역사') return '사회';
  if (a === '기술가정' || a === '기술' || a === '가정') return '기술가정';
  if (a.startsWith('제2외')) return '제2외국어';
  if (AREA_ORDER.includes(a)) return a;
  return a || '기타';
}

/* 이수단위 가중평균 — 값이 없는 과목은 분모에서도 빠진다 */
function wavg(list, pick) {
  let sum = 0, cr = 0;
  list.forEach(r => {
    const v = pick(r); if (v == null) return;
    const u = num(r.credits) || 1;
    sum += v * u; cr += u;
  });
  return cr ? { value: r2(sum / cr), credits: cr } : { value: null, credits: 0 };
}

function stats(list) {
  const rank = wavg(list, r => num(r.rank));
  const raw = wavg(list, r => num(r.rawScore));
  const mean = wavg(list, r => num(r.mean));
  const sd = wavg(list, r => num(r.stdev));
  const z = wavg(list, r => {
    const x = num(r.rawScore), m = num(r.mean), s = num(r.stdev);
    return (x == null || m == null || s == null || s <= 0) ? null : (x - m) / s;
  });
  const gap = wavg(list, r => {
    const x = num(r.rawScore), m = num(r.mean);
    return (x == null || m == null) ? null : x - m;
  });
  return {
    subjects: list.length,
    credits: list.reduce((n, r) => n + (num(r.credits) || 0), 0),
    rank: rank.value, rankCredits: rank.credits,
    raw: raw.value, rawCredits: raw.credits,
    mean: mean.value, stdev: sd.value, z: z.value, gap: gap.value,
  };
}

export function buildAnalysis(rows) {
  const list = (rows || []).filter(r => r && r.subject).map(r => ({ ...r, _area: areaOf(r) }));
  if (!list.length) return null;

  const gradeOf = r => String(num(r.grade) || 1);
  const semOf = r => (num(r.semester) === 2 ? '2' : '1');
  const termKey = r => `${gradeOf(r)}-${semOf(r)}`;

  const terms = [...new Set(list.map(termKey))].sort();
  const grades = [...new Set(list.map(gradeOf))].sort();

  /* 표의 세로축 — 학기, 그 학년 전체, 마지막에 전체 */
  const lines = [];
  grades.forEach(g => {
    const gt = terms.filter(t => t.startsWith(g + '-'));
    gt.forEach(t => lines.push({ key: t, label: `${g}학년${t.slice(2)}학기`, kind: 'term', pick: r => termKey(r) === t }));
    if (gt.length > 1) lines.push({ key: 'y' + g, label: `${g}학년 전체`, kind: 'year', pick: r => gradeOf(r) === g });
  });
  lines.push({ key: 'all', label: '전체', kind: 'all', pick: () => true });

  const areas = AREA_ORDER.filter(a => list.some(r => r._area === a))
    .concat([...new Set(list.map(r => r._area))].filter(a => !AREA_ORDER.includes(a)));

  /* 행(학기) × 열(교과) 집계 + 전 교과 + 주요 교과 */
  const cells = {};
  lines.forEach(ln => {
    const sub = list.filter(ln.pick);
    const row = { _all: stats(sub), _core: stats(sub.filter(r => CORE5.includes(r._area))) };
    areas.forEach(a => { row[a] = stats(sub.filter(r => r._area === a)); });
    COMBOS.forEach(c => { row['c_' + c.key] = stats(c.areas ? sub.filter(r => c.areas.includes(r._area)) : sub); });
    cells[ln.key] = row;
  });

  /* 교과별 순위 — 평균 등급이 낮을수록(=좋을수록) 위 */
  const ranking = areas.map(a => {
    const mine = list.filter(r => r._area === a);
    const s = stats(mine);
    const byTerm = terms.map(t => cells[t] && cells[t][a] && cells[t][a].rank).filter(v => v != null);
    return {
      area: a, ...s,
      spread: byTerm.length > 1 ? r2(Math.max(...byTerm) - Math.min(...byTerm)) : null,
      subjectNames: mine.map(r => r.subject),
    };
  }).filter(x => x.subjects)
    .sort((x, y) => (x.rank == null) - (y.rank == null) || (x.rank - y.rank));

  const coreRanks = CORE5.map(a => cells.all[a] && cells.all[a].rank).filter(v => v != null);
  const areaSpread = coreRanks.length > 1 ? r2(Math.max(...coreRanks) - Math.min(...coreRanks)) : null;

  const subjects = list.slice().sort((a, b) =>
    gradeOf(a).localeCompare(gradeOf(b)) || semOf(a).localeCompare(semOf(b)) ||
    AREA_ORDER.indexOf(a._area) - AREA_ORDER.indexOf(b._area) || String(a.subject).localeCompare(String(b.subject)));

  return {
    terms, grades, lines, areas, cells, ranking, combos: COMBOS, subjects,
    all: cells.all._all, core: cells.all._core, areaSpread,
    hasRaw: list.some(r => num(r.rawScore) != null),
    hasMean: list.some(r => num(r.mean) != null),
    hasStdev: list.some(r => num(r.stdev) != null),
    hasRank: list.some(r => num(r.rank) != null),
  };
}

/* ---------- 그리기 ---------- */

const METRICS = [
  { key: 'rank', label: '평균 등급', get: s => s.rank, fmt: f2, better: 'low', axis: [1, 9], span: 1, unit: '등급' },
  { key: 'raw', label: '평균 원점수', get: s => s.raw, fmt: f1, better: 'high', axis: [0, 100], span: 8, unit: '점' },
  { key: 'gap', label: '원점수 − 과목평균', get: s => s.gap, fmt: v => (v == null ? '–' : (v > 0 ? '+' : '') + f1(v)), better: 'high', axis: null, span: 6, unit: '점' },
  { key: 'z', label: '학교 평균 대비 Z', get: s => s.z, fmt: v => (v == null ? '–' : (v > 0 ? '+' : '') + f2(v)), better: 'high', axis: null, span: 0.5, unit: '' },
  { key: 'credits', label: '이수단위', get: s => (s.credits || null), fmt: v => (v == null ? '–' : String(v)), better: 'high', axis: null, unit: '단위' },
];
export const metricOf = key => METRICS.find(m => m.key === key) || METRICS[0];

function tabBar(tab) {
  const t = [['1', '전체 교과 평균표'], ['2', '교과별 추이'], ['3', '교과별 순위'], ['4', '교과 조합별 분석'], ['5', '과목별 상세']];
  return `<div class="gtabs">${t.map(([k, label]) =>
    `<button type="button" class="gtab${tab === k ? ' on' : ''}" data-gtab="${k}">${k}. ${label}</button>`).join('')}</div>`;
}
function metricBar(metric, a, keys) {
  const avail = METRICS.filter(m => keys.includes(m.key))
    .filter(m => (m.key !== 'raw' || a.hasRaw) && (m.key !== 'gap' || (a.hasRaw && a.hasMean)) && (m.key !== 'z' || (a.hasRaw && a.hasMean && a.hasStdev)));
  return `<div class="gmetrics">보기 ${avail.map(m =>
    `<button type="button" class="gm${metric === m.key ? ' on' : ''}" data-gmetric="${m.key}">${m.label}</button>`).join('')}</div>`;
}

/* 탭 1 — 학기 × 교과 평균표 */
function tab1(a, metric) {
  const M = metricOf(metric);
  const head = a.areas.map(x => `<th>${esc(x)}</th>`).join('');
  const body = a.lines.map(ln => {
    const row = a.cells[ln.key];
    const tds = a.areas.map(x => {
      const v = M.get(row[x]);
      return `<td>${v == null ? '–' : M.fmt(v)}</td>`;
    }).join('');
    return `<tr class="${ln.kind}"><th>${esc(ln.label)}</th>${tds}
      <td class="sum">${M.get(row._all) == null ? '–' : M.fmt(M.get(row._all))}</td>
      <td class="sum">${M.get(row._core) == null ? '–' : M.fmt(M.get(row._core))}</td></tr>`;
  }).join('');
  return `${metricBar(metric, a, ['rank', 'raw', 'gap', 'z', 'credits'])}
    <div class="table-wrap"><table class="gtable"><thead><tr><th>구분</th>${head}
      <th class="sum">전 교과</th><th class="sum">주요 교과<small>국·영·수·사·과</small></th></tr></thead>
      <tbody>${body}</tbody></table></div>
    <p class="help">모든 값은 <b>이수단위 가중평균</b>입니다. 값이 없는 과목은 평균에서 빠지며, 전부 없으면 '–'로 둡니다.
      ${metric === 'z' ? '<b>Z</b>는 (원점수 − 과목평균) ÷ 표준편차입니다. +1.0이면 학교 평균보다 표준편차 1만큼 위입니다.' : ''}
      ${metric === 'gap' ? '학교 평균보다 몇 점 위인지입니다. 과목 난도가 달라 교과 간 단순 비교는 조심해야 합니다.' : ''}</p>`;
}

/* 꺾은선 — 공통 */
function lineChart(series, labels, opt) {
  const W = 760, H = 268, L = 52, R = 52, T = 30, B = 34;
  const vals = series.flatMap(s => s.points.filter(v => v != null));
  if (!vals.length) return '<p class="empty">그릴 값이 없습니다.</p>';
  /* 눈금은 값에 맞춰 좁힌다 — 1~9등급을 다 그리면 선이 한 줄로 뭉개진다.
     다만 너무 좁히면 0.1등급 차이가 산처럼 보이므로 최소 폭을 둔다. */
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const minSpan = opt.minSpan || 1;
  if (hi - lo < minSpan) { const c = (lo + hi) / 2; lo = c - minSpan / 2; hi = c + minSpan / 2; }
  const pad = (hi - lo) * 0.18;
  lo -= pad; hi += pad;
  if (opt.axis) { lo = Math.max(opt.axis[0], lo); hi = Math.min(opt.axis[1], hi); }
  const invert = opt.better === 'low';
  const x = i => L + (labels.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (labels.length - 1));
  const y = v => {
    const t = (v - lo) / (hi - lo || 1);
    return T + (invert ? t : 1 - t) * (H - T - B);
  };
  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = lo + (hi - lo) * i / ticks;
    return `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#e4eaf1"/>
            <text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="ax">${opt.fmt(v)}</text>`;
  }).join('');
  const xl = labels.map((lb, i) => `<text x="${x(i).toFixed(1)}" y="${H - 12}" text-anchor="middle" class="ax">${esc(lb)}</text>`).join('');
  const unit = opt.unit ? `<text x="${L - 8}" y="${T - 12}" text-anchor="end" class="ax">${esc(opt.unit)}</text>` : '';
  const paths = series.map(s => {
    const pts = s.points.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
    if (!pts.length) return '';
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const dots = pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="${s.color}"/>`).join('');
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2"/>${dots}`;
  }).join('');
  const legend = series.map(s => `<span class="lg"><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('');
  return `<div class="chartbox"><svg viewBox="0 0 ${W} ${H}" class="chart" role="img"
      aria-label="${esc(series.map(s => s.label).join(', '))} 추이">${grid}${unit}${xl}${paths}</svg>
    <div class="legends">${legend}</div></div>`;
}

const termLabel = t => `${t[0]}학년 ${t.slice(2)}학기`;

/* 탭 2 — 주요 교과 추이 */
function tab2(a, metric) {
  const M = metricOf(metric);
  const series = CORE5.filter(x => a.areas.includes(x)).map(x => ({
    label: x, color: AREA_COLOR[x],
    points: a.terms.map(t => M.get(a.cells[t][x])),
  }));
  const rows = series.map(s => `<tr><th><i style="background:${s.color}"></i>${esc(s.label)}</th>${
    s.points.map(v => `<td>${v == null ? '–' : M.fmt(v)}</td>`).join('')}</tr>`).join('');
  return `${metricBar(metric, a, ['rank', 'raw', 'gap', 'z'])}
    ${lineChart(series, a.terms.map(termLabel), { axis: M.axis, better: M.better, fmt: M.fmt, unit: M.unit, minSpan: M.span })}
    <div class="table-wrap"><table class="gtable"><thead><tr><th>교과</th>${
      a.terms.map(t => `<th>${termLabel(t)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="help">${M.label} 기준입니다. ${M.better === 'low' ? '아래로 갈수록 등급이 나빠집니다 — 선이 위로 올라가면 좋아진 것입니다.' : '위로 갈수록 좋습니다.'}
      한 학기만 있는 교과는 점 하나로 찍힙니다.</p>`;
}

/* 레이더 — 주요 5교과 평균 등급 */
function radar(a) {
  const items = CORE5.filter(x => a.areas.includes(x) && a.cells.all[x].rank != null)
    .map(x => ({ label: x, value: a.cells.all[x].rank, color: AREA_COLOR[x] }));
  if (items.length < 3) return '';
  const C = 150, R = 96, n = items.length;
  const pt = (i, r) => {
    const ang = -Math.PI / 2 + i * 2 * Math.PI / n;
    return [C + r * Math.cos(ang), C + r * Math.sin(ang)];
  };
  const ring = k => `<polygon points="${items.map((_, i) => pt(i, R * k).join(',')).join(' ')}" fill="none" stroke="#e1e7ef"/>`;
  /* 1등급이 바깥, 9등급이 중심 */
  const rad = v => R * Math.max(0.08, (9 - v) / 8);
  const poly = items.map((it, i) => pt(i, rad(it.value)).join(',')).join(' ');
  const dots = items.map((it, i) => { const p = pt(i, rad(it.value)); return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="${it.color}"/>`; }).join('');
  const labels = items.map((it, i) => {
    const p = pt(i, R + 26);
    return `<text x="${p[0].toFixed(1)}" y="${p[1].toFixed(1)}" text-anchor="middle" class="rl" fill="${it.color}">${esc(it.label)}</text>
            <text x="${p[0].toFixed(1)}" y="${(p[1] + 15).toFixed(1)}" text-anchor="middle" class="rv">${f2(it.value)}</text>`;
  }).join('');
  return `<div class="radarbox"><h4>주요 교과 평균 등급</h4>
    <svg viewBox="0 0 300 300" class="radar" role="img" aria-label="주요 교과 평균 등급 레이더">
      ${[1, 0.75, 0.5, 0.25].map(ring).join('')}
      <polygon points="${poly}" fill="rgba(107,79,187,.16)" stroke="#6b4fbb" stroke-width="2"/>${dots}${labels}</svg>
    <p class="help">바깥쪽일수록 좋은 등급(1등급)입니다.</p></div>`;
}

/* 탭 3 — 교과별 순위 */
function tab3(a) {
  const body = a.ranking.map((r, i) => `<tr>
    <td class="no">${i + 1}</td>
    <th><i style="background:${AREA_COLOR[r.area] || '#8a97a8'}"></i>${esc(r.area)}</th>
    <td><b>${f2(r.rank)}</b></td>
    <td>${f1(r.raw)}</td>
    <td>${f1(r.mean)}</td>
    <td>${f1(r.stdev)}</td>
    <td>${r.z == null ? '–' : (r.z > 0 ? '+' : '') + f2(r.z)}</td>
    <td>${r.credits || '–'}<small>${r.subjects}과목</small></td>
    <td>${r.spread == null ? '–' : f2(r.spread)}</td>
    <td class="subs">${esc(r.subjectNames.join(', '))}</td></tr>`).join('');
  return `<div class="rankwrap">
    <div class="table-wrap"><table class="gtable rank"><thead><tr>
      <th>순위</th><th>교과</th><th>평균등급</th><th>평균<br>원점수</th><th>과목평균</th><th>표준편차</th><th>Z</th>
      <th>이수단위</th><th>학기 편차</th><th>이수과목</th></tr></thead><tbody>${body}</tbody></table></div>
    ${radar(a)}</div>
  <p class="help">순위는 <b>평균 등급</b>이 좋은 쪽부터입니다. <b>학기 편차</b>는 그 교과의 학기별 평균 등급 중 최고와 최저의 차이로,
    클수록 학기마다 기복이 있었다는 뜻입니다.
    ${a.areaSpread != null ? `주요 5교과 사이의 격차는 <b>${f2(a.areaSpread)}등급</b>입니다.` : ''}</p>`;
}

/* 탭 4 — 교과 조합별 */
function tab4(a, metric) {
  const M = metricOf(metric);
  const cols = [{ key: 'all', label: '전학년' }, ...a.terms.map(t => ({ key: t, label: termLabel(t) }))];
  const body = a.combos.map(c => `<tr><th><i style="background:${c.color}"></i>${esc(c.label)}</th>${
    cols.map(col => {
      const v = M.get(a.cells[col.key]['c_' + c.key]);
      return `<td${col.key === 'all' ? ' class="sum"' : ''}>${v == null ? '–' : M.fmt(v)}</td>`;
    }).join('')}</tr>`).join('');
  const series = a.combos.map(c => ({ label: c.label, color: c.color, points: a.terms.map(t => M.get(a.cells[t]['c_' + c.key])) }));
  return `${metricBar(metric, a, ['rank', 'raw', 'gap', 'z'])}
    <div class="table-wrap"><table class="gtable"><thead><tr><th>구분</th>${
      cols.map(c => `<th${c.key === 'all' ? ' class="sum"' : ''}>${c.label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>
    ${lineChart(series, a.terms.map(termLabel), { axis: M.axis, better: M.better, fmt: M.fmt, unit: M.unit, minSpan: M.span })}
    <p class="help">대학마다 반영 교과가 다릅니다. 같은 학생이라도 <b>국영수</b>만 보는 전형과 <b>전교과</b>를 보는 전형에서 숫자가 달라집니다 —
      그 차이를 여기서 확인하고 지원 전략에 반영하세요. 한국사는 사회에 포함했습니다.</p>`;
}

/* 탭 5 — 과목별 상세 */
function tab5(a) {
  const body = a.subjects.map(r => {
    const x = num(r.rawScore), m = num(r.mean), s = num(r.stdev);
    const z = (x == null || m == null || s == null || s <= 0) ? null : (x - m) / s;
    const gap = (x == null || m == null) ? null : x - m;
    return `<tr>
      <td>${esc(String(num(r.grade) || 1))}</td><td>${num(r.semester) === 2 ? 2 : 1}</td>
      <td><i style="background:${AREA_COLOR[r._area] || '#8a97a8'}"></i>${esc(r._area)}</td>
      <th>${esc(r.subject)}</th>
      <td>${num(r.credits) ?? '–'}</td>
      <td><b>${x == null ? '–' : f1(x)}</b></td>
      <td>${m == null ? '–' : f1(m)}</td>
      <td class="${gap != null && gap < 0 ? 'minus' : ''}">${gap == null ? '–' : (gap > 0 ? '+' : '') + f1(gap)}</td>
      <td>${s == null ? '–' : f1(s)}</td>
      <td>${z == null ? '–' : (z > 0 ? '+' : '') + f2(z)}</td>
      <td>${esc(r.achievement || '–')}</td>
      <td>${num(r.takers) ?? '–'}</td>
      <td><b>${num(r.rank) == null ? '–' : f1(num(r.rank))}</b></td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="gtable detail"><thead><tr>
      <th>학년</th><th>학기</th><th>교과</th><th>과목</th><th>이수<br>단위</th><th>원점수</th><th>과목평균</th>
      <th>평균 대비</th><th>표준편차</th><th>Z</th><th>성취도</th><th>수강자</th><th>석차등급</th>
    </tr></thead><tbody>${body}</tbody></table></div>
  <p class="help">진로설계 보드에서 읽어 온 표 그대로입니다. <b>평균 대비</b>는 원점수 − 과목평균,
    <b>Z</b>는 그 차이를 표준편차로 나눈 값입니다. 2025학년도 고1부터는 표준편차가 성적표에서 빠지므로 Z가 비는 것이 정상입니다.
    값이 틀렸으면 진로설계 보드 STEP 3의 성적표에서 고친 뒤 다시 불러오세요.</p>`;
}

export function analysisHTML(a, view) {
  if (!a) return '';
  const tab = view.tab || '1';
  const metric = view.metric || 'rank';
  const inner = tab === '2' ? tab2(a, metric)
    : tab === '3' ? tab3(a)
    : tab === '4' ? tab4(a, metric)
    : tab === '5' ? tab5(a)
    : tab1(a, metric);
  return `<div class="gwrap">${tabBar(tab)}${inner}</div>`;
}

/* 한 줄 요약 — 카드 머리에 쓴다 */
export function headline(a) {
  if (!a) return '';
  const best = a.ranking.filter(r => CORE5.includes(r.area) && r.rank != null);
  const parts = [];
  if (a.core.rank != null) parts.push(`주요 교과 평균 ${f2(a.core.rank)}등급`);
  if (a.all.rank != null) parts.push(`전 교과 ${f2(a.all.rank)}등급`);
  if (a.all.credits) parts.push(`이수 ${a.all.credits}단위 · ${a.all.subjects}과목`);
  if (best.length > 1) parts.push(`강한 교과 ${best[0].area}(${f2(best[0].rank)}) · 보완할 교과 ${best[best.length - 1].area}(${f2(best[best.length - 1].rank)})`);
  return parts.join(' · ');
}
