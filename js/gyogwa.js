import { CONFIG } from './config.js';
import { createStorage } from './storage/index.js';
import { validateRecord } from './schema.js';
import { AREAS, KINDS, ACH, MOCK_AREAS, emptyCourse, normalizeCourses, overall, MAIN_AREAS, parseXlsx, downloadTemplate, naeshinStudents } from './courses.js';
import { calcRecord, buildConvMap, judgeGrade } from './vendor/naeshin-engine.js';
import {
  GYOGWA_SCHEMA_VERSION, MAX_CANDIDATES, PICKS, M1_CHECK, LEVELS, ELIG, JUDGE, RUBRIC, RUBRIC_SCORES,
  recKey, snapshot, blankCandidate, blankGyogwa, validateGyogwa
} from './gyogwa-schema.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const filled = v => typeof v === 'string' && v.trim().length > 0;
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; };
const f2 = v => v == null ? '–' : Number(v).toFixed(2);
const today = () => new Date().toLocaleDateString('sv-SE');
const oneLine = s => String(s || '').replace(/\s*\n\s*/g, ' ');

const STEPS = [
  { title: '학생 A 확인', help: '상담 진단실에 저장된 학생을 선택하고, 과목별 성적·진로선택·모의고사를 확인합니다. 여기서 고친 성적은 진단실 학생 기록에도 함께 저장됩니다.' },
  { title: '교과 후보 10개', help: '학생의 계열·희망학과를 고려해 교과전형 후보 10개를 찾습니다. 목록의 “내 환산”은 대학별 반영 방식으로 다시 계산한 등급입니다.' },
  { title: 'Mission 1 · 교과환산', help: '대학별 반영교과·학년 비율·진로선택 처리로 환산한 등급을 학교 내신과 비교합니다. 반영 방식을 요강으로 확인하고, 차이가 나는 이유를 해석하세요.' },
  { title: 'Mission 2 · 수능최저', help: '최저 기준과 모의고사 추이를 비교해 충족 가능성을 높음·경계·낮음으로 분류합니다. 모의고사 평균이 아니라 최근 하단 성적을 기준으로 보세요.' },
  { title: 'Mission 3 · 지원자격', help: '졸업연도, 학교장 추천 인원, 고교 유형, 이수 요건, 대학 내 중복지원 제한을 확인합니다. 자격은 합격 이전에 “지원 가능성”의 문제입니다.' },
  { title: 'Mission 4 · 전년도 입결', help: '환산 등급을 전년도 입결과 비교합니다. 입결의 기준(최종 등록자 70%컷 등)·모집인원·3개년 추세를 함께 보고 도전·적정·안정을 판단하세요.' },
  { title: '최종 · 추천 6장', help: '후보 10개 중 6개를 고르고, 대학마다 추천근거·위험요인·대체대학을 작성합니다. 같은 리스크가 6번 반복되지 않게 설계하세요.' },
  { title: '제출·피드백', help: '자기평가를 작성한 뒤 강사 피드백과 루브릭 채점을 받습니다.' }
];

const storage = createStorage(CONFIG, 'gyogwa');
const students = createStorage(CONFIG, 'students');
let data = blankGyogwa(), current = 0, dirty = false;
let saved = [], activeNumber = null, activeRevision = null, info = null, ready = false, busy = false;
let stuRows = [], stu = null, stuDirty = false; // stu = 진단실 학생 행 {number, revision, record}
let DB = null, FITS = new Map(), calcCache = new Map();
let finder = { univ: '', series: '', q: '' };

/* ---------- 데이터·계산 ---------- */
async function loadDB() {
  if (DB) return DB;
  const r = await fetch('data/general.json'); if (!r.ok) throw Error('입결 데이터를 불러오지 못했습니다.');
  DB = await r.json();
  DB.byKey = new Map(DB.records.map(x => [recKey(x), x]));
  DB.univs = DB.order.filter(u => DB.records.some(x => x.univ === u));
  for (const u of DB.univs) for (const [k, v] of buildConvMap(DB.records.filter(x => x.univ === u))) FITS.set(`${u}|${k}`, v);
  return DB;
}
const courses = () => stu?.record.courses || [];
const gradType = () => stu?.record.values.grade === '졸업생' ? '졸업자' : '졸업예정자';
function calc(rec) {
  if (!rec) return null;
  const k = recKey(rec);
  if (!calcCache.has(k)) calcCache.set(k, calcRecord(rec, courses(), gradType(), FITS.get(`${rec.univ}|${rec.admName || '전형'}`)));
  return calcCache.get(k);
}
const invalidate = () => calcCache.clear();
const recOf = c => DB?.byKey.get(c.key) || null;
const label = c => `${c.snap.univ} ${oneLine(c.snap.dept)}`;
const labelLong = c => `${c.snap.univ} · ${oneLine(c.snap.dept)} · ${c.snap.admName}`;
const hasMin = c => { const t = oneLine(c.snap.suneung27).trim(); return t && !/^(없음|-|미적용)$/.test(t); };
const needsRecommend = c => /학교당|추천|학교장/.test(c.snap.eligibility);
const gradOnly = c => /졸업\s*예정/.test(c.snap.eligibility) && !/졸업자|졸업생/.test(c.snap.eligibility.replace(/졸업\s*예정자?/g, ''));

// 모의고사: 국·수·영·탐(상위 1과목) 중 상위 N개 등급 합
function mockBest(m, n) {
  const t = [num(m.tam1), num(m.tam2)].filter(v => v != null), vals = [num(m.kor), num(m.math), num(m.eng), t.length ? Math.min(...t) : null].filter(v => v != null);
  if (vals.length < n) return null;
  return [...vals].sort((a, b) => a - b).slice(0, n).reduce((a, b) => a + b, 0);
}
const mocks = () => (stu?.record.mocks || []).filter(m => [m.kor, m.math, m.eng, m.tam1].some(filled));
function minSuggest(c) {
  const n = Number(c.m2.n), sum = num(c.m2.sum), ms = mocks();
  if (!n || sum == null || !ms.length) return null;
  const bests = ms.map(m => mockBest(m, n)).filter(v => v != null);
  if (!bests.length) return null;
  const ok = bests.filter(b => b <= sum).length, margin = Math.min(...bests.map(b => sum - b));
  const level = ok === bests.length ? (margin >= 1 ? '높음' : '경계') : ok >= Math.ceil(bests.length / 2) ? '경계' : '낮음';
  return { level, ok, total: bests.length, bests };
}
function resultSuggest(c) {
  const r = recOf(c), my = calc(r)?.grade, cut = r?.y2026?.grade;
  if (my == null || cut == null) return null;
  const gap = my - cut;
  return { gap, judge: gap <= -0.1 ? '안정' : gap <= 0.1 ? '적정' : '도전', engine: judgeGrade(my, cut) };
}

/* ---------- 점검 ---------- */
function missing() {
  const m = [], add = (step, l) => m.push({ step, label: l });
  if (!stu) add(0, '학생 선택'); else {
    if (!courses().length) add(0, '과목별 성적 입력');
    if (!mocks().length) add(0, '모의고사 1회 이상');
  }
  if (data.candidates.length < MAX_CANDIDATES) add(1, `교과 후보 ${MAX_CANDIDATES}개 (현재 ${data.candidates.length}개)`);
  if (!data.candidates.length) [2, 3, 4, 5].forEach(st => add(st, '교과 후보를 먼저 추가'));
  data.candidates.forEach(c => {
    const l = label(c);
    if (!filled(c.m1.check)) add(2, `${l} · 환산 확인`);
    if (!filled(c.m2.level) || !filled(c.m2.reason)) add(3, `${l} · 최저 분류·근거`);
    if (!filled(c.m3.status)) add(4, `${l} · 자격 확인`);
    if (!filled(c.m4.judge) || !filled(c.m4.reason)) add(5, `${l} · 판단·근거`);
  });
  const picked = data.picks.filter(p => p.key).length;
  if (picked < PICKS) add(6, `추천 ${PICKS}장 선택 (현재 ${picked}장)`);
  data.picks.forEach((p, i) => { if (!p.key) return; const c = data.candidates.find(x => x.key === p.key); const need = []; if (!filled(p.reason)) need.push('추천근거'); if (!filled(p.risk)) need.push('위험요인'); if (!filled(p.alt)) need.push('대체대학'); if (need.length) add(6, `${c ? label(c) : `추천 ${i + 1}`} · ${need.join('·')}`); });
  if (!filled(data.feedback.self)) add(7, '자기평가');
  return m;
}
function checks() {
  const w = [], add = (step, l) => w.push({ step, label: l });
  if (stu === undefined) add(0, '연결된 진단실 학생을 찾을 수 없음 (삭제되었거나 다른 브라우저)');
  if (stuDirty) add(0, '성적 수정 내용이 아직 진단실에 저장되지 않음');
  data.candidates.forEach(c => {
    const l = label(c), sg = minSuggest(c), rs = resultSuggest(c), cc = calc(recOf(c));
    if (!recOf(c)) add(1, `${l} · 입결 데이터에서 찾을 수 없음 (데이터 갱신 확인)`);
    if (cc?.method === '반영과목 평균(근사)') add(2, `${l} · 정밀 규칙 없음 → 요강으로 환산 방식 직접 확인`);
    if (hasMin(c) && c.m2.level === '해당 없음') add(3, `${l} · 최저가 있는데 “해당 없음”으로 분류`);
    if (!hasMin(c) && c.m2.level && c.m2.level !== '해당 없음') add(3, `${l} · 최저 없음 전형 → “해당 없음” 확인`);
    if (sg && c.m2.level && c.m2.level !== '해당 없음' && sg.level !== c.m2.level) add(3, `${l} · 모의고사 계산(${sg.level})과 분류(${c.m2.level})가 다름 → 근거 확인`);
    if (gradType() === '졸업자' && gradOnly(c)) add(4, `${l} · 졸업예정자 대상 전형인데 학생은 졸업생`);
    if (rs && c.m4.judge === '안정' && rs.gap > 0) add(5, `${l} · 환산 등급이 2026 입결보다 ${f2(rs.gap)} 불리한데 “안정”`);
  });
  const ps = data.picks.map(p => data.candidates.find(c => c.key === p.key)).filter(Boolean);
  if (ps.length) {
    ps.filter(c => c.m3.status === '미충족').forEach(c => add(6, `${label(c)} · 지원자격 미충족인데 추천`));
    ps.filter(c => c.m3.status === '확인 필요').forEach(c => add(6, `${label(c)} · 지원자격 확인 필요 상태로 추천`));
    ps.filter(c => c.m2.level === '낮음').forEach(c => add(6, `${label(c)} · 최저 충족 가능성 낮음`));
    if (ps.length === PICKS && ps.every(hasMin)) add(6, '6장 모두 수능최저 → 수능 한 번에 6장이 걸림');
    const js = ps.map(c => c.m4.judge);
    if (ps.length === PICKS && !js.includes('안정')) add(6, '안정 원서 없음 → 하한선 점검');
    if (js.filter(j => j === '안정').length >= 4) add(6, '안정 4장 이상 → 수시 합격 시 정시 포기, 하향 쏠림 점검');
    if (js.filter(j => j === '도전').length >= 4) add(6, '도전 4장 이상 → 상향 쏠림');
    const rec = ps.filter(needsRecommend).length; if (rec >= 3) add(6, `학교장 추천 전형 ${rec}장 → 교내 추천 선발·추천 인원 확인`);
    const byU = {}; ps.forEach(c => byU[c.snap.univ] = (byU[c.snap.univ] || 0) + 1);
    Object.entries(byU).filter(([, n]) => n > 1).forEach(([u]) => add(6, `${u} 2장 이상 → 대학 내 중복지원 허용 여부 확인`));
    const ex = {}; ps.forEach(c => { const e = oneLine(c.snap.exam27).trim(); if (e && e !== '-') (ex[e] ??= []).push(c.snap.univ); });
    Object.entries(ex).filter(([, us]) => us.length > 1).forEach(([e, us]) => add(6, `면접·고사 일정 겹침 가능: ${us.join(', ')} (${e})`));
  }
  return w;
}

/* ---------- 입력 요소 ---------- */
function ctl({ path, label: l, value = '', type = 'text', options, required = true, help = '', wide = false, placeholder = '', rerender = false }) {
  const req = required ? '<span class="required"> *</span>' : '', rr = rerender ? ' data-rerender="1"' : '';
  let c;
  if (options) c = `<select data-path="${path}"${rr}><option value="">선택하세요</option>${options.map(o => `<option ${value === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (type === 'textarea') c = `<textarea data-path="${path}" placeholder="${esc(placeholder || '근거와 판단을 기록하세요')}">${esc(value)}</textarea>`;
  else c = `<input type="${type}" data-path="${path}" value="${esc(value)}" placeholder="${esc(placeholder)}"${rr}>`;
  return `<label class="field ${wide || type === 'textarea' ? 'wide' : ''}">${esc(l)}${req}${c}${help ? `<small>${esc(help)}</small>` : ''}</label>`;
}
const info2 = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;

function studentStep() {
  const opts = stuRows.map(r => `<option value="${r.number}" ${stu && stu.number === r.number ? 'selected' : ''}>${pad(r.number)}번 · ${esc(r.record.values.studentName || '이름 미입력')}</option>`).join('');
  let h = `<div class="fields"><label class="field">상담 진단실 학생<span class="required"> *</span><select id="stuPick"><option value="">선택하세요</option>${opts}</select><small>새 학생은 <a href="./">상담 진단실</a>에서 먼저 저장하세요. 실습 사례를 누르면 가상 학생 A가 만들어집니다.</small></label></div>`;
  if (!stu) return h;
  const v = stu.record.values, cs = courses();
  h += `<div class="kvs">${info2('고교', esc(v.school || '–'))}${info2('학년·졸업', esc(v.grade || '–'))}${info2('지원 학년도', esc(v.year || '–'))}${info2('희망', esc(oneLine(v.studentGoal) || '–'))}${info2('대표 내신', f2(overall(cs)))}${info2('국영수사과', f2(overall(cs, MAIN_AREAS)))}${info2('진로선택', cs.filter(c => c.rank == null && c.achievement).length + '과목')}</div>`;
  const nd = naeshinStudents();
  h += `<div class="toolbar"><h3>과목별 성적 <small>${cs.length}과목</small></h3><div class="actions">
    <button data-act="addCourse">+ 과목 추가</button><button data-act="xlsx">엑셀 불러오기</button><button data-act="template">엑셀 양식 받기</button>
    ${nd.length ? `<select id="naeshinPick"><option value="">내신 산출 대시보드에서 가져오기…</option>${nd.map((s, i) => `<option value="${i}">${esc(s.name || '(이름 없음)')} · ${s.courses.length}과목</option>`).join('')}</select>` : ''}
    ${cs.length ? '<button data-act="clearCourses" class="remove">전체 삭제</button>' : ''}</div></div>
    <div class="table-wrap"><table class="grid"><thead><tr><th>학년</th><th>학기</th><th>교과</th><th>과목</th><th>구분</th><th>단위</th><th>석차</th><th>성취도</th><th>A%</th><th>B%</th><th>C%</th><th>원점수</th><th>평균</th><th>표준편차</th><th>수강자</th><th></th></tr></thead><tbody>
    ${cs.map((c, i) => { const n = k => `<td><input class="num" data-cpath="${i}.${k}" value="${c[k] ?? ''}" inputmode="decimal"></td>`; const sel = (k, opts, blank = true) => `<td><select data-cpath="${i}.${k}">${blank ? '<option value=""></option>' : ''}${opts.map(o => `<option ${String(c[k]) === String(o) ? 'selected' : ''}>${o}</option>`).join('')}</select></td>`;
      return `<tr>${sel('year', [1, 2, 3], false)}${sel('semester', [1, 2], false)}${sel('area', AREAS, false)}<td><input data-cpath="${i}.name" value="${esc(c.name)}"></td>${sel('kind', KINDS)}${n('units')}${n('rank')}${sel('achievement', ACH)}${n('distA')}${n('distB')}${n('distC')}${n('rawScore')}${n('mean')}${n('stdev')}${n('studentCount')}<td><button class="remove sm" data-del-course="${i}" aria-label="삭제">×</button></td></tr>`; }).join('')}
    </tbody></table></div>${cs.length ? '' : '<p class="empty">과목이 없습니다. 엑셀 양식으로 한 번에 불러오거나 과목을 추가하세요.</p>'}
    <h3 style="margin-top:28px">모의고사 (최근 3회, 등급)</h3><div class="table-wrap"><table class="grid"><thead><tr><th>시험명</th>${MOCK_AREAS.map(([, l]) => `<th>${l}</th>`).join('')}<th>국수영탐(1) 상위 2·3·4합</th></tr></thead><tbody>
    ${stu.record.mocks.map((m, i) => `<tr><td><input data-mpath="${i}.name" value="${esc(m.name)}" placeholder="예: 9월 모평"></td>${MOCK_AREAS.map(([k]) => `<td><input class="num" data-mpath="${i}.${k}" value="${esc(m[k])}" inputmode="numeric"></td>`).join('')}<td class="calc">${[2, 3, 4].map(n => mockBest(m, n) ?? '–').join(' · ')}</td></tr>`).join('')}
    </tbody></table></div>`;
  return h;
}

function finderStep() {
  if (!DB) return '<p class="empty">입결 데이터를 불러오는 중입니다…</p>';
  const list = DB.records.filter(r => (!finder.univ || r.univ === finder.univ) && (!finder.series || r.series === finder.series) && (!finder.q || `${r.dept} ${r.admName}`.includes(finder.q)));
  const keys = new Set(data.candidates.map(c => c.key)), shown = list.slice(0, 60);
  const series = [...new Set(DB.records.map(r => r.series))];
  let h = `<div class="kvs">${info2('후보', `${data.candidates.length} / ${MAX_CANDIDATES}`)}${info2('학생 대표 내신', f2(overall(courses())))}${info2('학생 희망', esc(oneLine(stu?.record.values.studentGoal) || '–'))}</div>`;
  if (data.candidates.length) h += `<div class="table-wrap"><table class="grid"><thead><tr><th>#</th><th>대학</th><th>모집단위</th><th>전형</th><th>내 환산</th><th>2026 입결</th><th></th></tr></thead><tbody>${data.candidates.map((c, i) => { const r = recOf(c); return `<tr><td>${i + 1}</td><td>${esc(c.snap.univ)}</td><td>${esc(oneLine(c.snap.dept))}</td><td>${esc(c.snap.admName)}</td><td><b>${f2(calc(r)?.grade)}</b></td><td>${f2(r?.y2026?.grade)} <small>${esc(r?.y2026?.basis || '')}</small></td><td><button class="remove sm" data-remove-cand="${i}">빼기</button></td></tr>`; }).join('')}</tbody></table></div>`;
  h += `<h3 style="margin-top:26px">후보 찾기 <small>40개 대학 교과전형 · 2027 요강·2024~2026 입결</small></h3><div class="fields" style="grid-template-columns:1fr 1fr 1fr">
    <label class="field">대학<select id="fUniv"><option value="">전체</option>${DB.univs.map(u => `<option ${finder.univ === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
    <label class="field">계열<select id="fSeries"><option value="">전체</option>${series.map(s => `<option ${finder.series === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
    <label class="field">모집단위·전형 검색<input id="fQ" value="${esc(finder.q)}" placeholder="예: 화학, 경영"></label></div>
    <p class="help">${list.length}건${list.length > shown.length ? ` 중 ${shown.length}건 표시 — 대학이나 검색어로 좁히세요` : ''}. “내 환산”은 선택한 학생 성적을 그 대학 방식으로 계산한 값입니다.</p>
    <div class="table-wrap"><table class="grid"><thead><tr><th>대학</th><th>계열</th><th>모집단위</th><th>전형</th><th>2027 모집</th><th>내 환산</th><th>2026 입결</th><th>경쟁률</th><th></th></tr></thead><tbody>
    ${shown.map(r => { const k = recKey(r), my = calc(r)?.grade, cut = r.y2026?.grade, cls = my != null && cut != null ? (my <= cut + 1e-9 ? 'ok' : 'over') : ''; return `<tr><td>${r.univ}</td><td>${esc(r.series)}</td><td>${esc(oneLine(r.dept))}</td><td>${esc(r.admName)}</td><td>${r.quota27 ?? '–'}</td><td class="${cls}"><b>${f2(my)}</b></td><td>${f2(cut)} <small>${esc(r.y2026?.basis || '')}</small></td><td>${r.y2026?.comp ?? '–'}</td><td>${keys.has(k) ? '<span class="badge keep">후보</span>' : `<button class="sm" data-add-cand="${esc(k)}" ${data.candidates.length >= MAX_CANDIDATES ? 'disabled' : ''}>추가</button>`}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  return h;
}

function candCard(c, i, inner) {
  return `<div class="card"><div class="card-head"><h3>${i + 1}. ${esc(labelLong(c))}</h3></div>${inner}</div>`;
}
function missionStep() {
  if (!data.candidates.length) return '<p class="empty">먼저 교과 후보를 추가하세요.</p>';
  const all = overall(courses()), main = overall(courses(), MAIN_AREAS);
  return data.candidates.map((c, i) => {
    const r = recOf(c), cc = calc(r), p = `candidates.${i}`;
    if (current === 2) return candCard(c, i, `<div class="kvs">${info2('반영교과', esc(oneLine(c.snap.banyeong) || '–'))}${info2('전형방법', esc(oneLine(c.snap.method27) || '–'))}${info2('내 환산 등급', `<span class="big">${f2(cc?.grade)}</span>`)}${info2('환산점수', cc?.score != null ? Number(cc.score).toFixed(2) : '–')}${info2('학교 내신 대비', cc?.grade != null && all != null ? `${cc.grade - all > 0 ? '+' : ''}${(cc.grade - all).toFixed(2)}` : '–')}${info2('산출 방식', esc(cc?.method || '–'))}</div>
      ${cc?.note ? `<p class="calc">${esc(cc.note)}</p>` : ''}<div class="fields">${ctl({ path: `${p}.m1.check`, label: '요강 확인', value: c.m1.check, options: M1_CHECK, rerender: true })}${ctl({ path: `${p}.m1.note`, label: '환산 해석 (학교 내신과 차이가 나는 이유)', value: c.m1.note, type: 'textarea', required: false, placeholder: `예: 사·과 반영으로 국영수사과 ${f2(main)}보다 유리 / 진로선택 A 환산 반영` })}</div>`);
    if (current === 3) {
      const sg = minSuggest(c);
      return candCard(c, i, `<div class="kvs">${info2('2027 수능최저', esc(oneLine(c.snap.suneung27) || '없음'))}${info2('모의고사', mocks().length + '회')}${sg ? info2(`최근 ${sg.total}회 ${c.m2.n}합`, `${sg.bests.join(' · ')} → ${sg.ok}/${sg.total}회 충족`) : ''}${sg ? info2('계산 제안', `<span class="badge">${sg.level}</span>`) : ''}</div>
        ${hasMin(c) ? `<div class="fields">${ctl({ path: `${p}.m2.n`, label: '영역 수 (합산)', value: c.m2.n, options: ['2', '3', '4'], required: false, rerender: true })}${ctl({ path: `${p}.m2.sum`, label: '등급 합 기준', value: c.m2.sum, required: false, placeholder: '예: 5', rerender: true })}</div><p class="help">자동 계산은 국·수·영·탐(상위 1과목) 중 상위 N개 합만 봅니다. 영어·한국사 별도 기준, 탐구 2과목 평균, 지정 영역은 직접 확인하세요.</p>` : '<p class="help">최저가 없는 전형입니다. “해당 없음”으로 분류하세요.</p>'}
        <div class="fields">${ctl({ path: `${p}.m2.level`, label: '충족 가능성', value: c.m2.level, options: LEVELS, rerender: true })}${ctl({ path: `${p}.m2.reason`, label: '분류 근거', value: c.m2.reason, type: 'textarea', placeholder: '최근 모의고사 하단 성적, 변동성, 영역별 약점' })}</div>`);
    }
    if (current === 4) return candCard(c, i, `<div class="kvs">${info2('지원자격 (2027)', esc(c.snap.eligibility || '–'))}${info2('학생', esc(`${stu?.record.values.grade || '–'} · ${stu?.record.values.school || '–'}`))}${needsRecommend(c) ? info2('추천', '<span class="badge">학교장 추천 전형</span>') : ''}</div>
      ${gradType() === '졸업자' && gradOnly(c) ? '<p class="calc" style="color:#a4464d">졸업예정자 대상으로 보입니다. 학생은 졸업생입니다.</p>' : ''}
      <div class="fields">${ctl({ path: `${p}.m3.status`, label: '지원자격', value: c.m3.status, options: ELIG, rerender: true })}${ctl({ path: `${p}.m3.note`, label: '확인 내용·확인 필요 사항', value: c.m3.note, type: 'textarea', required: false, placeholder: '예: 학교당 10명 추천 → 교내 선발 일정 확인 필요' })}</div>`);
    const rs = resultSuggest(c), yrs = ['y2026', 'y2025', 'y2024'];
    return candCard(c, i, `<div class="kvs">${info2('내 환산 등급', `<span class="big">${f2(cc?.grade)}</span>`)}${info2('2027 모집', `${c.snap.quota27 || '–'}${c.snap.quota26 ? ` (전년 ${c.snap.quota26})` : ''}`)}${rs ? info2('2026 입결 대비', `${rs.gap > 0 ? '+' : ''}${rs.gap.toFixed(2)} → 제안 <span class="badge">${rs.judge}</span>`) : ''}</div>
      <div class="table-wrap"><table class="grid"><thead><tr><th>학년도</th><th>기준</th><th>입결 등급</th><th>환산점수</th><th>경쟁률</th><th>충원</th></tr></thead><tbody>${yrs.map(y => { const d = r?.[y]; return `<tr><td>${y.slice(1)}</td><td>${esc(d?.basis || '–')}</td><td>${f2(d?.grade)}</td><td>${d?.score ?? '–'}</td><td>${d?.comp ?? '–'}</td><td>${d?.fill ?? '–'}</td></tr>`; }).join('')}</tbody></table></div>
      ${c.snap.deltaChange ? `<p class="calc">전년 대비: ${esc(oneLine(c.snap.deltaChange))}</p>` : ''}
      <div class="fields">${ctl({ path: `${p}.m4.judge`, label: '판단', value: c.m4.judge, options: JUDGE, rerender: true })}${ctl({ path: `${p}.m4.reason`, label: '판단 근거', value: c.m4.reason, type: 'textarea', placeholder: '입결 기준·모집인원·3개년 추세·최저 영향' })}</div>`);
  }).join('');
}

function picksStep() {
  if (!data.candidates.length) return '<p class="empty">먼저 교과 후보를 추가하세요.</p>';
  const used = new Set(data.picks.map(p => p.key).filter(Boolean));
  return `<div class="note">후보 ${data.candidates.length}개 중 <b>${used.size} / ${PICKS}장</b> 선택. 오른쪽 매트릭스에서 후보별 판단을 한눈에 비교할 수 있습니다.</div>`
    + data.picks.map((pk, i) => {
      const c = data.candidates.find(x => x.key === pk.key), p = `picks.${i}`;
      const opts = data.candidates.filter(x => x.key === pk.key || !used.has(x.key)).map(x => `<option value="${esc(x.key)}" ${x.key === pk.key ? 'selected' : ''}>${esc(labelLong(x))} — ${x.m4.judge || '판단 전'} · 최저 ${x.m2.level || '?'} · 자격 ${x.m3.status || '?'}</option>`).join('');
      return `<div class="card"><h3>추천 ${i + 1}${c ? ` <span class="badge ${c.m4.judge === '안정' ? 'keep' : ''}">${esc(c.m4.judge || '판단 전')}</span>` : ''}</h3><div class="fields">
        <label class="field wide">후보 선택<span class="required"> *</span><select data-path="${p}.key" data-rerender="1"><option value="">선택하세요</option>${opts}</select></label>
        ${ctl({ path: `${p}.reason`, label: '추천근거', value: pk.reason, type: 'textarea', placeholder: '환산 등급·입결·최저·자격을 연결해서' })}
        ${ctl({ path: `${p}.risk`, label: '위험요인', value: pk.risk, type: 'textarea', placeholder: '최저 미충족, 추천 탈락, 소수 인원 변동성 등' })}
        ${ctl({ path: `${p}.alt`, label: '대체대학', value: pk.alt, wide: true, placeholder: '이 원서가 막히면 대신 쓸 대학·전형 (후보 10개 밖이면 자격·최저도 확인)' })}</div></div>`;
    }).join('');
}
function feedbackStep() {
  const total = RUBRIC.reduce((a, [id]) => a + (num(data.rubric[id]) || 0), 0), scored = RUBRIC.filter(([id]) => filled(data.rubric[id])).length;
  return `<div class="fields">${ctl({ path: 'feedback.self', label: '교육생 자기평가', value: data.feedback.self, type: 'textarea', placeholder: '가장 판단이 어려웠던 원서와 이유, 추가로 확인할 자료' })}${ctl({ path: 'feedback.coach', label: '강사 피드백', value: data.feedback.coach, type: 'textarea', required: false })}</div>
    <h3 style="margin-top:28px">루브릭 채점 <small style="font-weight:400;color:#7b8899">(강사 작성)</small></h3>
    <div class="fields">${RUBRIC.map(([id, l, h]) => ctl({ path: `rubric.${id}`, label: l, value: data.rubric[id], options: RUBRIC_SCORES, required: false, help: h, rerender: true })).join('')}</div>
    <p class="calc">합계 <span class="score">${total}</span> / ${RUBRIC.length * 5}${scored < RUBRIC.length ? ` (채점 ${scored}/${RUBRIC.length})` : ''}</p>`;
}
function stepBody() {
  if (current === 0) return studentStep();
  if (current === 1) return finderStep();
  if (current >= 2 && current <= 5) return missionStep();
  if (current === 6) return picksStep();
  return feedbackStep();
}

/* ---------- 렌더 ---------- */
function matrixHTML() {
  if (!data.candidates.length) return '';
  const picked = new Set(data.picks.map(p => p.key));
  const cell = (v, bad) => `<td class="${bad ? 'bad' : ''}">${esc(v || '·')}</td>`;
  return `<div class="diagnostic-group"><h3>후보 매트릭스<span>${data.candidates.length}</span></h3><div class="table-wrap"><table class="mx"><thead><tr><th></th><th>후보</th><th>환산</th><th>최저</th><th>자격</th><th>판단</th></tr></thead><tbody>
    ${data.candidates.map(c => `<tr class="${picked.has(c.key) ? 'pk' : ''}"><td>${picked.has(c.key) ? '★' : ''}</td><td title="${esc(labelLong(c))}">${esc(label(c))}</td><td>${f2(calc(recOf(c))?.grade)}</td>${cell(c.m2.level, c.m2.level === '낮음')}${cell(c.m3.status, c.m3.status === '미충족')}${cell(c.m4.judge)}</tr>`).join('')}
    </tbody></table></div></div>`;
}
function refresh() {
  const m = missing(), w = checks(), done = STEPS.filter((_, i) => !m.some(x => x.step === i)).length, picked = data.picks.filter(p => p.key).length;
  const name = stu?.record.values.studentName || data.student.name;
  $('#caseTitle').textContent = [activeNumber ? pad(activeNumber) + '번' : '', name ? `${name} 교과 지원판단` : '새 교과 지원판단'].filter(Boolean).join(' · ');
  $('#caseSub').textContent = stu ? [stu.record.values.school, stu.record.values.grade, `대표 내신 ${f2(overall(courses()))}`, oneLine(stu.record.values.studentGoal)].filter(Boolean).join(' · ') : '학생을 선택하고 교과 후보 10개를 찾은 뒤, 미션 1~4를 거쳐 추천 6장을 설계합니다.';
  $('#stats').innerHTML = `<div class="stat"><span>작성 완료 단계</span><strong>${done}<span> / ${STEPS.length}</span></strong><small>필수 항목 기준</small></div><div class="stat"><span>교과 후보</span><strong>${data.candidates.length}<span> / ${MAX_CANDIDATES}</span></strong><small>미션 1~4 대상</small></div><div class="stat"><span>추천</span><strong>${picked}<span> / ${PICKS}</span></strong><small>최종 원서</small></div>`;
  $('#nav').innerHTML = STEPS.map((s, i) => `<button class="nav-item ${i === current ? 'active' : ''}" data-step="${i}" ${i === current ? 'aria-current="step"' : ''}><em>${pad(i + 1)}</em>${s.title}<span class="done">${!m.some(x => x.step === i) ? '✓' : ''}</span></button>`).join('');
  $('#stageState').textContent = m.some(x => x.step === current) ? '작성 중' : '필수 항목 작성됨';
  const group = (title, items, cls, empty) => `<div class="diagnostic-group"><h3>${title}<span>${items.length}</span></h3>${items.length ? items.map(x => `<button class="issue ${cls}" data-step="${x.step}">${esc(x.label)}<small>${STEPS[x.step].title} →</small></button>`).join('') : `<div class="empty">${empty}</div>`}</div>`;
  $('#matrix').innerHTML = matrixHTML();
  $('#diagnostics').innerHTML = group('확인 필요', w, 'red', '현재 확인이 필요한 위험이 없습니다. 입력되지 않은 위험까지 확인된 것은 아닙니다.') + group('누락 항목', m, '', '필수 항목이 작성되었습니다.');
  $('#storageNote').className = 'storage-note' + (info?.persistent === false ? ' warn' : '');
  $('#storageNote').innerHTML = '<b>판단 저장</b>을 누르면 이 브라우저에 보관되고, 수정한 성적은 <b>상담 진단실 학생 기록</b>에도 함께 저장됩니다. 강사 제출은 <b>파일 백업</b>을 이용하세요.';
}
function render(keepScroll = false) {
  const y = window.scrollY;
  $('#stepNumber').textContent = `STEP ${pad(current + 1)} / ${STEPS.length}`;
  $('#stepTitle').textContent = STEPS[current].title; $('#stepHelp').textContent = STEPS[current].help;
  $('#body').innerHTML = stepBody();
  $('#prev').disabled = current === 0; $('#next').disabled = current === STEPS.length - 1;
  refresh(); if (keepScroll) window.scrollTo(0, y);
}
function updateList() {
  document.querySelector('header').inert = busy; document.querySelector('.workspace').inert = busy;
  $('#itemList').innerHTML = '<option value="">새 판단</option>' + saved.map(s => `<option value="${s.number}">${pad(s.number)}번 · ${esc(s.record.student.name || '학생 미선택')}</option>`).join('');
  $('#itemList').value = activeNumber || '';
  $('#deleteItem').disabled = !activeNumber || busy; $('#save').disabled = !ready || busy; $('#backupAll').disabled = !saved.length;
  if (info) $('#accountBar').textContent = `${info.title} · 교과 지원판단 저장 ${saved.length} / ${info.studentLimit}건 · ${info.label}`;
}
function toast(s) { const t = $('#toast'); t.textContent = s; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 3500); }
const canReplace = () => !(dirty || stuDirty) || confirm('저장하지 않은 내용이 있습니다. 계속할까요?');
const full = () => saved.length >= info.studentLimit;

async function loadStudentRows() { stuRows = await students.list(); }
function attachStudent(number) {
  const row = stuRows.find(r => r.number === Number(number));
  if (!row) { stu = number ? undefined : null; invalidate(); return; }
  stu = { number: row.number, revision: row.revision, record: validateRecord(row.record) };
  data.student = { number: String(row.number), name: stu.record.values.studentName || '' };
  stuDirty = false; invalidate();
}
function openRow(row) { activeNumber = row.number; activeRevision = row.revision; data = validateGyogwa(row.record); attachStudent(data.student.number); dirty = false; current = 0; render(); updateList(); }
function startWith(rec = blankGyogwa(), studentNo = '') { activeNumber = null; activeRevision = null; data = rec; stu = null; if (studentNo) attachStudent(studentNo); current = 0; render(); updateList(); }
async function loadList() { saved = await storage.list(); updateList(); }

/* ---------- 이벤트 ---------- */
function setPath(path, value) { const p = path.split('.'); let t = data; for (let i = 0; i < p.length - 1; i++) t = t[p[i]]; t[p.at(-1)] = value; dirty = true; }
const NUMF = ['units', 'rank', 'distA', 'distB', 'distC', 'rawScore', 'mean', 'stdev', 'studentCount', 'year', 'semester'];
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.path) { setPath(el.dataset.path, el.value); if (el.dataset.rerender) render(true); else refresh(); return; }
  if (el.dataset.cpath && stu) {
    const [i, k] = el.dataset.cpath.split('.'), c = stu.record.courses[Number(i)];
    c[k] = NUMF.includes(k) ? (el.value === '' ? null : num(el.value)) : (el.value || null);
    if (k === 'name') c.name = el.value;
    stuDirty = true; invalidate(); refresh(); return;
  }
  if (el.dataset.mpath && stu) { const [i, k] = el.dataset.mpath.split('.'); stu.record.mocks[Number(i)][k] = el.value; stuDirty = true; refresh(); const cell = el.closest('tr')?.querySelector('td.calc'); if (cell) cell.textContent = [2, 3, 4].map(n => mockBest(stu.record.mocks[Number(i)], n) ?? '–').join(' · '); return; }
  if (el.id === 'fQ') { finder.q = el.value.trim(); clearTimeout(render.t); render.t = setTimeout(() => { render(true); const q = $('#fQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250); }
});
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.id === 'stuPick') {
    if (stuDirty && !confirm('저장하지 않은 성적 수정이 있습니다. 학생을 바꿀까요?')) { el.value = stu?.number || ''; return; }
    attachStudent(el.value); dirty = true; render(true);
  }
  if (el.id === 'fUniv') { finder.univ = el.value; render(true); }
  if (el.id === 'fSeries') { finder.series = el.value; render(true); }
  if (el.id === 'naeshinPick' && el.value !== '' && stu) {
    const src = naeshinStudents()[Number(el.value)];
    if (src && (!courses().length || confirm(`현재 ${courses().length}과목을 “${src.name}” 성적 ${src.courses.length}과목으로 바꿀까요?`))) {
      stu.record.courses = normalizeCourses(src.courses); stuDirty = true; invalidate(); render(true); toast('내신 산출 대시보드의 성적을 가져왔습니다. 판단 저장 시 진단실에도 저장됩니다.');
    } else el.value = '';
  }
});
document.addEventListener('click', async e => {
  const t = e.target, step = t.closest('[data-step]');
  if (step) { current = Number(step.dataset.step); if (current === 1 && !finder.univ && !finder.q) finder.series = stu?.record.values.studentGoal?.match(/인문|자연/)?.[0] || ''; render(); window.scrollTo(0, 0); return; }
  const add = t.closest('[data-add-cand]');
  if (add) { if (data.candidates.length >= MAX_CANDIDATES) return toast(`후보는 ${MAX_CANDIDATES}개까지입니다.`); const r = DB.byKey.get(add.dataset.addCand); if (r) { data.candidates.push(blankCandidate(recKey(r), snapshot(r))); dirty = true; render(true); } return; }
  const rm = t.closest('[data-remove-cand]');
  if (rm) { const c = data.candidates[Number(rm.dataset.removeCand)]; if (!confirm(`${label(c)} 후보와 미션 기록을 뺄까요?`)) return; data.candidates.splice(Number(rm.dataset.removeCand), 1); data.picks.forEach(p => { if (p.key === c.key) Object.assign(p, { key: '' }); }); dirty = true; render(true); return; }
  const dc = t.closest('[data-del-course]');
  if (dc && stu) { stu.record.courses.splice(Number(dc.dataset.delCourse), 1); stuDirty = true; invalidate(); render(true); return; }
  const act = t.closest('[data-act]')?.dataset.act;
  if (!act || !stu) return;
  if (act === 'addCourse') { const last = courses().at(-1), c = emptyCourse(); if (last) Object.assign(c, { year: last.year, semester: last.semester }); stu.record.courses.push(c); stuDirty = true; render(true); }
  if (act === 'clearCourses' && confirm('입력한 과목을 모두 지울까요?')) { stu.record.courses = []; stuDirty = true; invalidate(); render(true); }
  if (act === 'template') { try { await downloadTemplate(); } catch (err) { toast(err.message); } }
  if (act === 'xlsx') $('#xlsxFile').click();
});
$('#prev').onclick = () => { current--; render(); window.scrollTo(0, 0); };
$('#next').onclick = () => { current++; render(); window.scrollTo(0, 0); };

const xlsxInput = Object.assign(document.createElement('input'), { type: 'file', id: 'xlsxFile', accept: '.xlsx,.xls', hidden: true });
document.body.append(xlsxInput);
xlsxInput.onchange = async e => {
  const file = e.target.files[0]; if (!file || !stu) return;
  try {
    const list = await parseXlsx(await file.arrayBuffer());
    if (!list.length) throw Error('읽을 수 있는 과목이 없습니다. 양식의 머리글(학년·학기·교과·과목…)을 확인하세요.');
    if (courses().length && !confirm(`현재 ${courses().length}과목을 엑셀의 ${list.length}과목으로 바꿀까요?`)) return;
    stu.record.courses = list; stuDirty = true; invalidate(); render(true); toast(`${list.length}과목을 불러왔습니다. 판단 저장 시 진단실에도 저장됩니다.`);
  } catch (err) { toast(err.message); } finally { e.target.value = ''; }
};

async function saveStudent() {
  if (!stu || !stuDirty) return;
  const r = await students.update(stu.number, stu.record, stu.revision);
  stu.revision = r.revision; stuDirty = false; await loadStudentRows();
}
$('#new').onclick = () => { if (!ready) return; if (full()) return toast('저장 한도에 도달했습니다.'); if (canReplace()) { dirty = false; stuDirty = false; startWith(); } };
$('#itemList').onchange = e => { const n = Number(e.target.value); if (!canReplace()) { e.target.value = activeNumber || ''; return; } stuDirty = false; if (!n) { dirty = false; startWith(); return; } const row = saved.find(s => s.number === n); if (row) openRow(row); };
$('#reloadItems').onclick = async () => { if (!canReplace()) return; try { await loadStudentRows(); await loadList(); stuDirty = false; const row = activeNumber && saved.find(s => s.number === activeNumber); if (row) openRow(row); else { dirty = false; startWith(); } toast('목록을 갱신했습니다.'); } catch (err) { toast(err.message); } };
$('#save').onclick = async () => {
  if (!ready || busy) return;
  if (!stu) return toast('학생을 먼저 선택하세요.');
  busy = true; updateList();
  try {
    await saveStudent();
    const r = activeNumber ? await storage.update(activeNumber, data, activeRevision) : await storage.create(data);
    activeNumber = r.number; activeRevision = r.revision; await loadList(); dirty = false; render(true); toast('교과 지원판단을 저장했습니다.');
  } catch (err) { toast(err.message); } finally { busy = false; updateList(); }
};
$('#deleteItem').onclick = async () => {
  if (!activeNumber || busy || !confirm('현재 지원판단 기록을 삭제할까요? 학생 성적(진단실)은 그대로 남습니다.')) return;
  busy = true; updateList();
  try { await storage.remove(activeNumber, activeRevision); await loadList(); dirty = false; stuDirty = false; startWith(); toast('삭제했습니다.'); } catch (err) { toast(err.message); } finally { busy = false; updateList(); }
};
function drawFinder() {
  const q = $('#finderSearch').value.trim().toLocaleLowerCase(), rows = saved.filter(s => !q || `${pad(s.number)}번 ${s.record.student.name}`.toLocaleLowerCase().includes(q));
  $('#finderCount').textContent = `검색 ${rows.length}건 / 저장 ${saved.length}건`;
  $('#finderResults').innerHTML = rows.length ? rows.map(s => `<button class="student-result" data-open="${s.number}"><strong>${pad(s.number)}번 · ${esc(s.record.student.name || '학생 미선택')}</strong><span>후보 ${s.record.candidates.length}개 · 추천 ${s.record.picks.filter(p => p.key).length}장</span><small>마지막 저장 ${esc(new Date(s.updated).toLocaleString('ko-KR'))}</small></button>`).join('') : `<p class="empty">${saved.length ? '검색 결과가 없습니다.' : '저장된 지원판단이 없습니다.'}</p>`;
}
document.addEventListener('click', e => { const o = e.target.closest('[data-open]'); if (o && canReplace()) { const row = saved.find(s => s.number === Number(o.dataset.open)); if (row) { stuDirty = false; openRow(row); $('#finder').close(); } } });
$('#findItems').onclick = async () => { if (!ready) return; try { await loadList(); $('#finderSearch').value = ''; drawFinder(); $('#finder').showModal(); $('#finderSearch').focus(); } catch (err) { toast(err.message); } };
$('#finderSearch').oninput = drawFinder; $('#closeFinder').onclick = () => $('#finder').close();

function download(obj, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name.replace(/[^\p{L}\p{N}_.-]/gu, '_'); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
// 개별 백업에는 학생 성적 스냅샷을 함께 넣어 강사가 같은 성적으로 확인할 수 있게 한다.
$('#backup').onclick = () => { download({ ...data, studentSnapshot: stu ? stu.record : null }, `교과지원판단_${data.student.name || '학생'}_${today()}.json`); toast('현재 지원판단을 파일로 백업했습니다.'); };
$('#backupAll').onclick = async () => { try { await loadList(); download({ type: 'expert-course-gyogwa-backup', schemaVersion: GYOGWA_SCHEMA_VERSION, exported: new Date().toISOString(), items: saved.map(s => ({ number: s.number, updated: s.updated, record: s.record })) }, `교과지원판단_전체백업_${today()}.json`); toast(`${saved.length}건을 백업했습니다.`); } catch (err) { toast(err.message); } };
$('#load').onclick = () => $('#file').click();
$('#file').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 5_000_000) throw Error('5MB 이하의 파일을 선택하세요.');
    const obj = JSON.parse(await file.text());
    if (obj?.type === 'expert-course-gyogwa-backup') {
      const recs = (Array.isArray(obj.items) ? obj.items : []).map(x => validateGyogwa(x.record)), room = info.studentLimit - saved.length;
      if (recs.length > room) throw Error(`남은 저장 공간(${room}건)이 부족합니다.`);
      if (!confirm(`백업 파일의 ${recs.length}건을 추가할까요? 학생 성적은 진단실 기록을 따릅니다.`)) return;
      busy = true; updateList(); for (const r of recs) await storage.create(r); await loadList(); toast(`${recs.length}건을 추가했습니다.`);
    } else {
      const rec = validateGyogwa(obj); if (!canReplace()) return;
      let no = rec.student.number;
      if (obj.studentSnapshot && !stuRows.some(r => String(r.number) === no && r.record.values.studentName === rec.student.name)) {
        if (confirm(`파일에 학생 “${rec.student.name}”의 성적이 들어 있습니다. 상담 진단실에 새 학생으로 추가할까요?`)) {
          const created = await students.create(validateRecord(obj.studentSnapshot)); no = String(created.number); rec.student.number = no; await loadStudentRows();
        }
      }
      stuDirty = false; startWith(rec, no); dirty = true; toast('파일을 불러왔습니다. 판단 저장을 누르면 새로 보관됩니다.');
    }
  } catch (err) { toast(err instanceof SyntaxError ? '올바른 JSON 파일이 아닙니다.' : err.message); }
  finally { busy = false; updateList(); e.target.value = ''; }
};

/* ---------- 실습 사례: 가상 학생 A (내신 약 1.8) ---------- */
const DEMO_NAME = '학생 A (가상 실습)';
function demoCourses() {
  const rows = [], add = (y, s, area, name, units, rank, kind = '일반선택', ach = null) => rows.push({ year: y, semester: s, area, name, units, rank, kind, achievement: ach, distA: ach ? 35 : null, distB: ach ? 40 : null, distC: ach ? 25 : null });
  for (const s of [1, 2]) { add(1, s, '국어', '국어', 4, s === 1 ? 2 : 2, '공통'); add(1, s, '수학', '수학', 4, s === 1 ? 2 : 1, '공통'); add(1, s, '영어', '영어', 4, 2, '공통'); add(1, s, '사회', '통합사회', 3, s === 1 ? 2 : 1, '공통'); add(1, s, '과학', '통합과학', 3, 1, '공통'); add(1, s, '한국사', '한국사', 3, 2, '공통'); add(1, s, '과학', '과학탐구실험', 1, null, '공통', 'A'); add(1, s, '기술가정', '기술·가정', 2, 3, '일반선택'); }
  for (const s of [1, 2]) { add(2, s, '국어', s === 1 ? '문학' : '독서', 4, 2); add(2, s, '수학', s === 1 ? '수학Ⅰ' : '수학Ⅱ', 4, 2); add(2, s, '영어', s === 1 ? '영어Ⅰ' : '영어Ⅱ', 4, 1); add(2, s, '과학', '화학Ⅰ', 3, 1); add(2, s, '과학', '생명과학Ⅰ', 3, s === 1 ? 2 : 1); add(2, s, '과학', '물리학Ⅰ', 2, 2); add(2, s, '제2외국어', '중국어Ⅰ', 2, 2); }
  add(3, 1, '국어', '언어와 매체', 3, 2); add(3, 1, '수학', '미적분', 4, 2); add(3, 1, '영어', '영어독해와 작문', 4, 2); add(3, 1, '수학', '확률과 통계', 3, 3);
  add(3, 1, '과학', '화학Ⅱ', 3, null, '진로선택', 'A'); add(3, 1, '과학', '생명과학Ⅱ', 3, null, '진로선택', 'A'); add(3, 1, '과학', '물리학Ⅱ', 3, null, '진로선택', 'B');
  return normalizeCourses(rows);
}
$('#demo').onclick = async () => {
  if (!ready || !canReplace()) return;
  try {
    await loadStudentRows();
    let row = stuRows.find(r => r.record.values.studentName === DEMO_NAME);
    if (!row) {
      const rec = validateRecord({ version: 2, mode: '전문가 실습', values: { studentName: DEMO_NAME, year: '2027', school: '일반고', grade: '고3', consultant: '교육생', date: today(), studentGoal: '자연계열 — 화학·생명과학 관련 학과 희망', context: '3강 교과 지원판단 워크숍용 가상 학생. 수도권 교과전형 중심 상담 요청.', materials: '학생부 3학년 1학기까지, 6·9월 모의평가 확보 (가상 자료)' },
        routes: [{}, {}, {}, {}, {}], candidates: [], risks: [], feedback: {}, courses: demoCourses(),
        mocks: [{ name: '3월 학평', kor: '2', math: '3', eng: '2', tam1: '2', tam2: '3', hist: '2' }, { name: '6월 모평', kor: '3', math: '2', eng: '2', tam1: '2', tam2: '2', hist: '1' }, { name: '9월 모평', kor: '2', math: '3', eng: '3', tam1: '1', tam2: '3', hist: '2' }] });
      await students.create(rec); await loadStudentRows(); row = stuRows.find(r => r.record.values.studentName === DEMO_NAME);
    }
    dirty = false; stuDirty = false; startWith(blankGyogwa(), row.number); dirty = true;
    toast(`가상 학생 A(대표 내신 ${f2(overall(courses()))})를 불러왔습니다. 교과 후보 10개부터 찾아보세요.`);
  } catch (err) { toast(err.message); }
};

/* ---------- 보고서 ---------- */
function buildReport() {
  const v = stu?.record.values || {}, cell = x => esc(x || '—'), ps = data.picks.map(p => ({ p, c: data.candidates.find(x => x.key === p.key) })).filter(x => x.c);
  const total = RUBRIC.reduce((a, [id]) => a + (num(data.rubric[id]) || 0), 0);
  return `<h1>${cell(data.student.name)} 학생부교과 지원판단 보고서</h1>
    <p>${cell(v.school)} · ${cell(v.grade)} · ${cell(v.year)}학년도 · 대표 내신 ${f2(overall(courses()))} (국영수사과 ${f2(overall(courses(), MAIN_AREAS))}) · 희망 ${cell(oneLine(v.studentGoal))} · 작성 ${today()}</p>
    <p class="print-note">대학별 환산은 etoosECI/naeshin-dashboard 산출 엔진과 2027 요강·2024~2026 입결 데이터 기준 추정치입니다. 합격 가능성을 보장하지 않습니다.</p>
    <section><h2>추천 ${PICKS}장</h2><table class="rep"><tr><th class="nw">#</th><th>대학 · 모집단위 · 전형</th><th class="nw">환산</th><th class="nw">2026 입결</th><th class="nw">최저</th><th class="nw">자격</th><th class="nw">판단</th></tr>
      ${ps.map(({ c }, i) => { const r = recOf(c); return `<tr><td class="nw">${i + 1}</td><td>${esc(labelLong(c))}</td><td class="nw">${f2(calc(r)?.grade)}</td><td class="nw">${f2(r?.y2026?.grade)}</td><td class="nw">${cell(c.m2.level)}</td><td class="nw">${cell(c.m3.status)}</td><td class="nw"><b>${cell(c.m4.judge)}</b></td></tr>`; }).join('')}</table>
      ${ps.map(({ p, c }, i) => `<article><h3>${i + 1}. ${esc(labelLong(c))}</h3><dl><dt>추천근거</dt><dd>${cell(p.reason)}</dd><dt>위험요인</dt><dd>${cell(p.risk)}</dd><dt>대체대학</dt><dd>${cell(p.alt)}</dd></dl></article>`).join('')}</section>
    <section><h2>후보 ${data.candidates.length}개 비교</h2><table class="rep"><tr><th>후보</th><th class="nw">환산</th><th>최저 기준</th><th class="nw">최저</th><th class="nw">자격</th><th class="nw">2026 입결</th><th class="nw">판단</th></tr>
      ${data.candidates.map(c => { const r = recOf(c); return `<tr><td>${esc(labelLong(c))}</td><td class="nw">${f2(calc(r)?.grade)}</td><td>${cell(oneLine(c.snap.suneung27))}</td><td class="nw">${cell(c.m2.level)}</td><td class="nw">${cell(c.m3.status)}</td><td class="nw">${f2(r?.y2026?.grade)} ${esc(r?.y2026?.basis || '')}</td><td class="nw">${cell(c.m4.judge)}</td></tr>`; }).join('')}</table>
      ${data.candidates.map(c => `<p><b>${esc(label(c))}</b> — 환산: ${cell(c.m1.note)} / 최저: ${cell(c.m2.reason)} / 자격: ${cell(c.m3.note)} / 판단: ${cell(c.m4.reason)}</p>`).join('')}</section>
    <section><h2>자기평가·피드백</h2><dl><dt>자기평가</dt><dd>${cell(data.feedback.self)}</dd><dt>강사 피드백</dt><dd>${cell(data.feedback.coach)}</dd></dl>
      <table class="rep"><tr>${RUBRIC.map(([, l]) => `<th>${l}</th>`).join('')}<th>합계</th></tr><tr>${RUBRIC.map(([id]) => `<td>${cell(data.rubric[id])}</td>`).join('')}<td>${total} / ${RUBRIC.length * 5}</td></tr></table></section>`;
}
$('#print').onclick = () => { $('#report').innerHTML = buildReport(); window.print(); };
window.addEventListener('beforeunload', e => { if (dirty || stuDirty) { e.preventDefault(); e.returnValue = ''; } });

(async function start() {
  render();
  try {
    info = await storage.init(); await students.init();
    await Promise.all([loadList(), loadStudentRows()]);
    $('#accountBar').textContent = '입결 데이터를 불러오는 중…';
    await loadDB(); ready = true;
    const q = new URLSearchParams(location.search).get('student');
    startWith(blankGyogwa(), q && stuRows.some(r => String(r.number) === q) ? q : '');
  } catch (err) { $('#accountBar').textContent = '시작하지 못했습니다: ' + err.message; toast(err.message); }
  updateList();
})();
