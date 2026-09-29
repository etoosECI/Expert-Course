import { CONFIG } from './config.js';
import { createStorage } from './storage/index.js';
import { validateRecord } from './schema.js';
import { normalizeCourses } from './courses.js';
import { mask, splitText, AREAS, AREA_LABEL, ADAPTERS } from './record-input.js';
import { jinroProfiles, jinroProfile, jinroAvailable, schoolList, programList, schoolSubjects, programSubjects, jinroDiagnosis, JINRO_URL } from './jinro-link.js';
import {
  HAKJONG_SCHEMA_VERSION, TAGS, TAG_NAMES, LEVELS, DEV, OFFERED, TAKEN, RUBRIC, RUBRIC_SCORES, FINAL,
  uid, blankSection, blankHakjong, validateHakjong
} from './hakjong-schema.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const filled = v => typeof v === 'string' && v.trim().length > 0;
const num = v => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : null; };
const today = () => new Date().toLocaleDateString('sv-SE');
const TAG_COLOR = Object.fromEntries(TAGS);
const normSub = s => String(s || '').replace(/\s+/g, '').replace(/Ⅰ/g, 'I').replace(/Ⅱ/g, 'II').replace(/Ⅲ/g, 'III').toLowerCase();

const STEPS = [
  { title: '학생·학생부 준비', help: '상담 진단실 학생을 선택하고 학생부 원문을 학년·영역별로 붙여넣습니다. 이름·학번 등 식별정보는 자동으로 가려지지만, 남은 부분은 직접 지우세요.' },
  { title: 'M1 · Evidence Mapping', help: '원문에서 근거가 되는 문장을 마우스로 드래그한 뒤 역량 버튼을 누르세요. 한 문장에 여러 역량을 붙일 수 있습니다. 활동 이름이 아니라 “무엇을 했는지”가 드러나는 문장을 고르세요.' },
  { title: 'M2 · 활동 수준', help: '각 근거를 단순참여 → 조사 → 분석 → 문제해결 → 검증·확장 중 하나로 판단합니다. 기록된 동사와 결과물로 판단하고, 이유를 한 줄로 남기세요.' },
  { title: 'M3 · 연결성', help: '같은 관심사로 이어지는 근거를 “탐구 줄기”로 묶고, 1→2→3학년에 걸쳐 심화·확장되었는지, 반복·단절되었는지 판단합니다.' },
  { title: 'M4 · 교육과정', help: '학교 편제와 실제 선택과목을 비교합니다. 전공 관련 과목을 “개설했는데 듣지 않은 것”과 “개설되지 않아 못 들은 것”을 구분하는 것이 핵심입니다.' },
  { title: 'M5 · 최종평가', help: '점수를 매기지 않습니다. 핵심강점 3·핵심약점 3·의심·검증사항 3·핵심경쟁력 1을 쓰고, 모두 앞 단계의 근거(E번호)와 연결하세요.' },
  { title: '제출·피드백', help: '자기평가를 작성한 뒤 강사 피드백과 루브릭 채점을 받습니다.' }
];
const LIMIT_SEC = 60 * 60;

const storage = createStorage(CONFIG, 'hakjong');
const students = createStorage(CONFIG, 'students');
let data = blankHakjong(), current = 0, dirty = false;
let saved = [], activeNumber = null, activeRevision = null, info = null, ready = false, busy = false;
let stuRows = [], stu = null;
let yearFilter = 0, pendingSel = null, focusEv = '';
let J = { ok: false, schools: [], programs: [], school: null, program: null, loading: false, error: '' };

/* ---------- 파생 ---------- */
const secOf = id => data.sections.find(s => s.id === id);
const evNo = e => 'E' + pad(data.evidence.indexOf(e) + 1);
const evById = id => data.evidence.find(e => e.id === id);
const secLabel = s => `${s.year}학년 ${s.subject ? s.subject + ' ' : ''}${AREA_LABEL[s.area] || s.area}`;
const evLabel = e => { const s = secOf(e.sec); return `${evNo(e)} · ${s ? secLabel(s) : ''}`; };
const short = (t, n = 60) => { t = String(t || ''); return t.length > n ? t.slice(0, n) + '…' : t; };
const sortedEvidence = () => [...data.evidence].sort((a, b) => { const sa = secOf(a.sec), sb = secOf(b.sec); return (sa.year - sb.year) || (data.sections.indexOf(sa) - data.sections.indexOf(sb)) || (a.start - b.start); });
const courses = () => stu?.record.courses || [];
function heat() {
  const h = Object.fromEntries(TAG_NAMES.map(t => [t, [0, 0, 0]]));
  for (const e of data.evidence) { const y = secOf(e.sec)?.year; if (!y) continue; for (const t of e.tags) h[t][y - 1]++; }
  return h;
}
function threadInfo(t) {
  const evs = data.evidence.filter(e => e.thread === t.id), years = [1, 2, 3].map(y => evs.filter(e => secOf(e.sec)?.year === y));
  const maxLv = years.map(list => list.reduce((m, e) => Math.max(m, LEVELS.indexOf(e.level)), -1));
  const present = maxLv.map((v, i) => [v, i]).filter(([, i]) => years[i].length);
  const rising = present.length >= 2 && present.every(([v], k) => k === 0 || v >= present[k - 1][0]) && present.at(-1)[0] > present[0][0];
  return { evs, years, maxLv, span: present.length, rising };
}

/* ---------- 점검 ---------- */
function missing() {
  const m = [], add = (step, l) => m.push({ step, label: l });
  if (!stu) add(0, '상담 진단실 학생 선택');
  if (data.sections.filter(s => filled(s.text)).length < 3) add(0, '학생부 원문 (영역 3개 이상)');
  if (!filled(data.targetMajor)) add(0, '희망 전공');
  TAG_NAMES.forEach(t => { if (!data.evidence.some(e => e.tags.includes(t))) add(1, `${t} 역량 근거 1개 이상`); });
  data.evidence.forEach(e => { if (!e.tags.length) add(1, `${evNo(e)} 역량 태그`); if (!e.level || !filled(e.levelReason)) add(2, `${evNo(e)} 수준·이유`); });
  if (!data.evidence.length) add(2, '근거를 먼저 표시');
  if (!data.threads.length) add(3, '탐구 줄기 1개 이상');
  data.threads.forEach(t => { const n = t.name || '이름 없는 줄기'; if (!filled(t.name)) add(3, '줄기 이름'); if (!t.dev) add(3, `${n} · 발전 유형`); if (!data.evidence.some(e => e.thread === t.id)) add(3, `${n} · 근거 연결`); });
  if (!data.curriculum.rows.length) add(4, '전공 관련 과목 1개 이상');
  data.curriculum.rows.forEach(r => { if (!r.offered || !r.taken) add(4, `${r.subject || '과목'} · 편제/이수`); });
  const f = data.final;
  [['strengths', '핵심강점'], ['weaknesses', '핵심약점'], ['checks', '의심·검증']].forEach(([k, l]) => f[k].forEach((x, i) => { const need = []; if (!filled(x.text)) need.push('내용'); if (!x.evidence.length) need.push('근거'); if (k === 'checks' && !filled(x.how)) need.push('검증 방법'); if (need.length) add(5, `${l} ${i + 1} · ${need.join('·')}`); }));
  if (!filled(f.core.text) || !f.core.evidence.length) add(5, '핵심경쟁력 · 내용·근거');
  if (!filled(data.feedback.self)) add(6, '자기평가');
  return m;
}
function checks() {
  const w = [], add = (step, l) => w.push({ step, label: l });
  if (stu === undefined) add(0, '연결된 진단실 학생을 찾을 수 없음');
  const secs = data.sections.filter(s => filled(s.text));
  [1, 2, 3].forEach(y => { if (secs.length && !secs.some(s => s.year === y)) add(0, `${y}학년 기록 없음 — 의도한 것인지 확인`); });
  if (data.evidence.length) {
    const h = heat(), yrs = [1, 2, 3].filter(y => secs.some(s => s.year === y));
    TAG_NAMES.forEach(t => yrs.forEach(y => { if (!h[t][y - 1]) add(1, `${y}학년 ${t} 근거 0개 → 정말 없는지 원문 재확인`); }));
    const leveled = data.evidence.filter(e => e.level), low = leveled.filter(e => LEVELS.indexOf(e.level) <= 1).length;
    if (leveled.length >= 6 && low / leveled.length >= 0.7) add(2, `근거의 ${Math.round(low / leveled.length * 100)}%가 단순참여·조사 → 깊이 부족을 약점으로 검토`);
    const free = data.evidence.filter(e => !e.thread && e.tags.some(t => t === '탐구' || t === '진로')).length;
    if (data.threads.length && free) add(3, `탐구·진로 근거 ${free}개가 어느 줄기에도 속하지 않음`);
  }
  data.threads.forEach(t => {
    const ti = threadInfo(t), n = t.name || '줄기';
    if ((t.dev === '심화' || t.dev === '확장') && ti.span < 2) add(3, `${n}: 한 학년에만 근거가 있는데 “${t.dev}”`);
    if (t.dev === '심화' && ti.span >= 2 && !ti.rising) add(3, `${n}: 활동 수준이 오르지 않는데 “심화” → 근거 확인`);
    if (t.dev === '반복' && ti.rising) add(3, `${n}: 수준이 오르는데 “반복” → 다시 판단`);
  });
  data.curriculum.rows.filter(r => r.offered === '개설' && r.taken === '미이수').forEach(r => add(4, `${r.subject}: 개설됐는데 미이수 → 약점·검증사항 반영 검토`));
  const used = k => new Set(data.final[k].flatMap(x => x.evidence));
  const both = [...used('strengths')].filter(id => used('weaknesses').has(id));
  if (both.length) add(5, `${both.map(id => evById(id) ? evNo(evById(id)) : '').join(', ')}: 강점과 약점에 같은 근거 사용`);
  if (data.timer.elapsed > LIMIT_SEC) add(6, `제한 시간 60분 초과 (${Math.floor(data.timer.elapsed / 60)}분)`);
  return w;
}

/* ---------- 공통 입력 요소 ---------- */
function ctl({ path, label, value = '', type = 'text', options, required = true, help = '', wide = false, placeholder = '', rerender = false }) {
  const req = required ? '<span class="required"> *</span>' : '', rr = rerender ? ' data-rerender="1"' : '';
  let c;
  if (options) c = `<select data-path="${path}"${rr}><option value="">선택하세요</option>${options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${value === v ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
  else if (type === 'textarea') c = `<textarea data-path="${path}" placeholder="${esc(placeholder || '근거와 판단을 기록하세요')}">${esc(value)}</textarea>`;
  else c = `<input type="${type}" data-path="${path}" value="${esc(value)}" placeholder="${esc(placeholder)}"${rr}>`;
  return `<label class="field ${wide || type === 'textarea' ? 'wide' : ''}">${esc(label)}${req}${c}${help ? `<small>${esc(help)}</small>` : ''}</label>`;
}
const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
const tagChips = e => e.tags.map(t => `<span class="tagchip" style="--c:${TAG_COLOR[t]}">${t}</span>`).join('');
const yearChips = () => `<div class="chips">${[0, 1, 2, 3].map(y => `<button class="chip ${yearFilter === y ? 'active' : ''}" data-year="${y}">${y ? y + '학년' : '전체'}</button>`).join('')}</div>`;

/* ---------- STEP 0: 학생·원문 ---------- */
function prepStep() {
  const opts = stuRows.map(r => `<option value="${r.number}" ${stu && stu.number === r.number ? 'selected' : ''}>${pad(r.number)}번 · ${esc(r.record.values.studentName || '이름 미입력')}</option>`).join('');
  const jp = jinroProfiles();
  let h = `<div class="fields"><label class="field">상담 진단실 학생<span class="required"> *</span><select id="stuPick"><option value="">선택하세요</option>${opts}</select><small>새 학생은 <a href="./">상담 진단실</a>에서 먼저 저장하세요. 실습 사례를 누르면 가상 학생 B가 만들어집니다.</small></label>
    ${ctl({ path: 'targetMajor', label: '희망 전공', value: data.targetMajor, placeholder: '예: 화학과 / 화학·신소재 계열' })}</div>
    <div class="card"><div class="card-head"><h3>jinro-dash 연결 <small>고교 진로·선택과목 설계</small></h3><a class="linkbtn ghostlink" href="${JINRO_URL}" target="_blank" rel="noopener">jinro-dash 열기 ↗</a></div>
      <p class="help">jinro-dash에서 저장한 설계를 연결하면 학교 편제·희망 학과·자동 진단을 M4·M5에서 불러옵니다. 설계 없이 학교·학과만 고를 수도 있습니다. (jinro-dash 학교 데이터는 2022 개정 교육과정 편제입니다)</p>
      <div class="fields"><label class="field">저장된 jinro-dash 설계<select id="jinroPick"><option value="">연결 안 함</option>${jp.map(p => `<option value="${esc(p.studentKey)}" ${data.jinro.key === p.studentKey ? 'selected' : ''}>${esc(p.studentKey)} · ${esc(p.schoolName || '학교 미선택')}${p.programId ? ' · ' + esc(p.programId) : ''}</option>`).join('')}</select>${jp.length ? '' : '<small>이 브라우저에 저장된 jinro-dash 설계가 없습니다.</small>'}</label>
      ${data.jinro.schoolName ? kv('연결된 학교·학과', esc([data.jinro.schoolName, data.jinro.programName].filter(Boolean).join(' · '))) : ''}</div></div>
    <h3 style="margin-top:28px">학생부 원문 <small>${data.sections.length}개 영역 · ${data.sections.reduce((a, s) => a + s.text.length, 0).toLocaleString()}자</small></h3>
    <div class="card"><div class="card-head"><h3>한 번에 붙여넣기</h3><span class="help" style="margin:0">${Object.entries(ADAPTERS).filter(([k]) => k !== 'paste').map(([, a]) => `<button class="sm" disabled title="준비 중">${a.label} 업로드 · 준비 중</button>`).join(' ')}</span></div>
      <p class="help">한 학년 분량을 붙여넣고 “영역별로 나누기”를 누르면 자율·동아리·진로·세특(과목별)·행특으로 나눠집니다. 영역 제목 줄(예: 자율활동, 「화학Ⅰ」)이 있어야 잘 나뉩니다.</p>
      <div class="fields"><label class="field">학년<select id="bulkYear">${[1, 2, 3].map(y => `<option>${y}</option>`).join('')}</select></label><div></div>
      <label class="field wide">원문<textarea id="bulkText" placeholder="자율활동&#10;…&#10;세부능력 및 특기사항&#10;「화학Ⅰ」 …"></textarea></label></div>
      <div class="step-actions" style="border:0;margin:0;padding:0"><span></span><button class="primary" data-act="split">영역별로 나누기</button></div></div>
    ${[1, 2, 3].map(y => { const list = data.sections.filter(s => s.year === y); return `<h3 style="margin-top:22px">${y}학년 <small>${list.length}개</small></h3>` + list.map(s => { const i = data.sections.indexOf(s), n = data.evidence.filter(e => e.sec === s.id).length; return `<div class="card sec-card"><div class="sec-head">
        <select data-path="sections.${i}.year" data-rerender="1">${[1, 2, 3].map(v => `<option value="${v}" ${s.year === v ? 'selected' : ''}>${v}학년</option>`).join('')}</select>
        <select data-path="sections.${i}.area" data-rerender="1">${AREAS.map(a => `<option value="${a}" ${s.area === a ? 'selected' : ''}>${AREA_LABEL[a]}</option>`).join('')}</select>
        <input data-path="sections.${i}.subject" value="${esc(s.subject)}" placeholder="과목명 (세특)">
        ${n ? `<span class="badge">근거 ${n}</span>` : ''}<button class="remove sm" data-del-sec="${s.id}">삭제</button></div>
        <textarea data-path="sections.${i}.text" data-sec-text="${s.id}" ${n ? 'readonly title="근거가 표시된 원문은 수정할 수 없습니다. 근거를 먼저 삭제하세요."' : ''}>${esc(s.text)}</textarea></div>`; }).join(''); }).join('')}
    <button class="add" data-act="addSec">+ 영역 직접 추가</button>`;
  return h;
}

/* ---------- STEP 1: Evidence Mapping ---------- */
function marked(s) {
  const evs = data.evidence.filter(e => e.sec === s.id), cuts = new Set([0, s.text.length]);
  evs.forEach(e => { cuts.add(Math.min(e.start, s.text.length)); cuts.add(Math.min(e.end, s.text.length)); });
  const pts = [...cuts].sort((a, b) => a - b); let out = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], seg = esc(s.text.slice(a, b)), cover = evs.filter(e => e.start <= a && e.end >= b);
    if (!cover.length) { out += seg; continue; }
    const tags = [...new Set(cover.flatMap(e => e.tags))], cols = tags.length ? tags.map(t => TAG_COLOR[t]) : ['#999'];
    const bg = cols.length === 1 ? `${cols[0]}33` : `repeating-linear-gradient(135deg,${cols.map((c, k) => `${c}40 ${k * 6}px,${c}40 ${(k + 1) * 6}px`).join(',')})`;
    out += `<mark data-ev="${cover.map(e => e.id).join(' ')}" style="background:${bg};border-bottom:2px solid ${cols[0]}" class="${cover.some(e => e.id === focusEv) ? 'focus' : ''}">${seg}</mark>`;
  }
  return out;
}
function evCard(e, extra = '') {
  const s = secOf(e.sec);
  return `<div class="card ev-card ${e.id === focusEv ? 'focus' : ''}" id="card-${e.id}"><div class="card-head"><h3>${evNo(e)} <small>${esc(s ? secLabel(s) : '')}</small></h3><div>${tagChips(e)}</div></div>
    <blockquote data-goto="${e.id}">${esc(e.quote)}</blockquote>${extra}</div>`;
}
function mappingStep() {
  const secs = data.sections.filter(s => filled(s.text) && (!yearFilter || s.year === yearFilter));
  if (!data.sections.length) return '<p class="empty">먼저 학생부 원문을 붙여넣으세요.</p>';
  const evs = sortedEvidence().filter(e => !yearFilter || secOf(e.sec)?.year === yearFilter);
  return `${yearChips()}<div class="legend">${TAGS.map(([t, c]) => `<span class="tagchip" style="--c:${c}">${t}</span>`).join('')}<span class="help" style="margin:0">문장을 드래그 → 역량 버튼. 표시된 문장을 누르면 해당 카드로 이동합니다.</span></div>
    <div class="mapwrap"><div class="reader">${secs.map(s => `<div class="rsec"><div class="rsec-h">${esc(secLabel(s))}</div><div class="rtext" data-sec="${s.id}">${marked(s)}</div></div>`).join('')}</div>
    <div class="evlist"><h3>근거 ${evs.length}개</h3>${evs.map(e => { const i = data.evidence.indexOf(e); return evCard(e, `<div class="tagrow">${TAG_NAMES.map(t => `<button class="tagbtn ${e.tags.includes(t) ? 'on' : ''}" style="--c:${TAG_COLOR[t]}" data-toggle-tag="${e.id}|${t}">${t}</button>`).join('')}<button class="remove sm" data-del-ev="${e.id}">삭제</button></div>
      <input data-path="evidence.${i}.summary" value="${esc(e.summary)}" placeholder="한 줄 요약 (무엇을 했는가)">`); }).join('') || '<p class="empty">아직 표시한 근거가 없습니다.</p>'}</div></div>`;
}

/* ---------- STEP 2: 수준 ---------- */
function levelStep() {
  if (!data.evidence.length) return '<p class="empty">M1에서 근거를 먼저 표시하세요.</p>';
  const evs = sortedEvidence().filter(e => !yearFilter || secOf(e.sec)?.year === yearFilter);
  return `${yearChips()}<div class="ladder">${LEVELS.map((l, i) => `<span><b>${i + 1}</b>${l}</span>`).join('<i>→</i>')}</div>
    ${evs.map(e => { const i = data.evidence.indexOf(e); return evCard(e, `${e.summary ? `<p class="help" style="margin:4px 0 0">${esc(e.summary)}</p>` : ''}<div class="seg">${LEVELS.map(l => `<button class="${e.level === l ? 'on' : ''}" data-level="${e.id}|${l}">${l}</button>`).join('')}</div>
      <input data-path="evidence.${i}.levelReason" value="${esc(e.levelReason)}" placeholder="판단 이유 (예: 변인 통제 실험 후 오차 원인을 재설계 → 검증·확장)">`); }).join('')}`;
}

/* ---------- STEP 3: 연결성 ---------- */
function threadStep() {
  if (!data.evidence.length) return '<p class="empty">M1에서 근거를 먼저 표시하세요.</p>';
  const opts = data.threads.map(t => [t.id, t.name || '이름 없는 줄기']);
  let h = data.threads.map((t, i) => {
    const ti = threadInfo(t);
    return `<div class="card"><div class="card-head"><h3>줄기 ${i + 1}</h3><button class="remove sm" data-del-thread="${t.id}">삭제</button></div><div class="fields">
      ${ctl({ path: `threads.${i}.name`, label: '탐구 줄기 이름', value: t.name, placeholder: '예: 촉매와 반응 속도' })}${ctl({ path: `threads.${i}.dev`, label: '발전 유형', value: t.dev, options: DEV, rerender: true })}</div>
      <div class="timeline">${[1, 2, 3].map(y => `<div class="tcol"><div class="th">${y}학년 ${ti.maxLv[y - 1] >= 0 ? `<span class="badge">${LEVELS[ti.maxLv[y - 1]]}</span>` : ''}</div>${ti.years[y - 1].map(e => `<div class="tchip" data-goto="${e.id}" title="${esc(e.quote)}"><b>${evNo(e)}</b> ${esc(short(e.summary || e.quote, 40))}</div>`).join('') || '<div class="tempty">—</div>'}</div>`).join('<div class="tarrow">→</div>')}</div>
      <p class="calc">${ti.span >= 2 ? (ti.rising ? '학년이 올라가며 활동 수준이 높아졌습니다.' : '여러 학년에 걸쳐 있지만 활동 수준은 오르지 않았습니다.') : ti.span === 1 ? '한 학년에만 근거가 있습니다.' : '연결된 근거가 없습니다.'}</p>
      ${ctl({ path: `threads.${i}.note`, label: '판단 근거', value: t.note, type: 'textarea', required: false, placeholder: '어떤 질문이 다음 학년의 어떤 탐구로 이어졌는가' })}</div>`;
  }).join('');
  h += `<button class="add" data-act="addThread">+ 탐구 줄기 추가</button><h3 style="margin-top:26px">근거를 줄기에 연결</h3>${yearChips()}`;
  h += sortedEvidence().filter(e => !yearFilter || secOf(e.sec)?.year === yearFilter).map(e => { const i = data.evidence.indexOf(e); return `<div class="evrow"><span class="evno">${evNo(e)}</span><span class="evtxt" data-goto="${e.id}">${tagChips(e)} ${esc(short(e.summary || e.quote, 70))} ${e.level ? `<span class="badge keep">${e.level}</span>` : ''}</span>
    <select data-path="evidence.${i}.thread" data-rerender="1"><option value="">줄기 없음</option>${opts.map(([v, l]) => `<option value="${v}" ${e.thread === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`; }).join('');
  return h;
}

/* ---------- STEP 4: 교육과정 ---------- */
function takenNames() { const m = new Map(); courses().forEach(c => { if (c.name) m.set(normSub(c.name), `${c.name} (${c.year}-${c.semester})`); }); return m; }
const autoTaken = subj => takenNames().has(normSub(subj)) ? '이수' : '미이수';
const autoOffered = subj => data.curriculum.offered.some(o => normSub(o) === normSub(subj)) ? '개설' : '미개설';
function curriculumStep() {
  const cur = data.curriculum, tn = takenNames();
  let h = `<div class="card"><div class="card-head"><h3>학교 편제 (개설 과목)</h3><small>${cur.offered.length}과목</small></div>
    ${J.ok ? `<div class="fields"><label class="field">jinro-dash 학교에서 불러오기<select id="schoolPick"><option value="">선택하세요</option>${J.schools.map(s => `<option value="${esc(s.path)}" ${data.jinro.schoolPath === s.path ? 'selected' : ''}>${esc(s.name)} · ${esc(s.region)}</option>`).join('')}</select><small>2022 개정 교육과정 편제입니다. 2015 개정 학생(현 고3·졸업생)은 아래에 직접 입력하세요.</small></label>
      ${J.school?.tracks?.length > 1 ? `<label class="field">과정<select id="trackPick"><option value="">전체 과정</option>${J.school.tracks.map(t => `<option value="${esc(t.id)}" ${data.jinro.trackId === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>` : '<div></div>'}</div>` : `<p class="help">${J.loading ? 'jinro-dash 데이터를 확인하는 중…' : 'jinro-dash 데이터에 연결할 수 없어 직접 입력합니다. (배포 사이트에서는 자동 연결됩니다)'}</p>`}
    <label class="field wide">개설 과목 (줄바꿈 또는 쉼표로 구분)<textarea id="offeredText" placeholder="예: 화학Ⅰ, 화학Ⅱ, 물리학Ⅱ, 기하 …">${esc(cur.offered.join(', '))}</textarea><small>편제표에 적힌 과목명을 그대로 적어야 자동 대조가 정확합니다.</small></label></div>
    <div class="card"><div class="card-head"><h3>실제 이수 과목 <small>진단실 성적 ${courses().length}과목</small></h3>${stu ? `<a class="linkbtn ghostlink" href="gyogwa.html?student=${stu.number}">성적 입력 →</a>` : ''}</div>
      <p class="help">${tn.size ? [...tn.values()].map(esc).join(' · ') : '진단실 학생 기록에 과목별 성적이 없습니다. 교과 지원판단 보드에서 입력하면 자동으로 대조됩니다.'}</p></div>
    <div class="card"><div class="card-head"><h3>전공 관련 과목 대조</h3><div>${J.ok ? `<select id="programPick" class="inline"><option value="">jinro-dash 학과 핵심·권장 과목…</option>${J.programs.map(p => `<option value="${esc(p.programId)}" ${data.jinro.programId === p.programId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}<button class="sm" data-act="recheck">자동 대조 다시 하기</button></div></div>
      <div class="table-wrap"><table class="grid"><thead><tr><th>과목</th><th>구분</th><th>편제</th><th>이수</th><th>판단 메모</th><th></th></tr></thead><tbody>
      ${cur.rows.map((r, i) => { const hint = `<small class="auto">자동: ${autoOffered(r.subject)} · ${autoTaken(r.subject)}</small>`; return `<tr class="${r.offered === '개설' && r.taken === '미이수' ? 'warnrow' : ''}"><td><input data-path="curriculum.rows.${i}.subject" value="${esc(r.subject)}"></td>
        <td><select data-path="curriculum.rows.${i}.level">${['핵심', '권장', '직접'].map(v => `<option ${r.level === v ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td><select data-path="curriculum.rows.${i}.offered" data-rerender="1"><option value=""></option>${OFFERED.map(v => `<option ${r.offered === v ? 'selected' : ''}>${v}</option>`).join('')}</select>${hint}</td>
        <td><select data-path="curriculum.rows.${i}.taken" data-rerender="1"><option value=""></option>${TAKEN.map(v => `<option ${r.taken === v ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td><input data-path="curriculum.rows.${i}.note" value="${esc(r.note)}" placeholder="예: 개설됐지만 미선택 → 면접 확인"></td><td><button class="remove sm" data-del-row="${i}">×</button></td></tr>`; }).join('')}
      </tbody></table></div>${cur.rows.length ? '' : '<p class="empty">희망 전공과 관련된 과목을 추가하세요. jinro-dash 학과를 고르면 핵심·권장 과목이 채워집니다.</p>'}
      <button class="add" data-act="addRow">+ 과목 추가</button></div>`;
  const cnt = k => cur.rows.filter(r => `${r.offered}|${r.taken}` === k).length;
  if (cur.rows.length) h += `<div class="kvs">${kv('개설·이수', cnt('개설|이수'))}${kv('개설·미이수 (의심)', cnt('개설|미이수'))}${kv('미개설·미이수 (환경 한계)', cnt('미개설|미이수'))}${kv('공동교육과정·온라인 이수', cur.rows.filter(r => r.offered === '공동교육과정·온라인' && r.taken === '이수').length)}</div>`;
  return h;
}

/* ---------- STEP 5: 최종평가 ---------- */
function evPicker(path, item) {
  const opts = sortedEvidence().filter(e => !item.evidence.includes(e.id));
  return `<div class="evpick">${item.evidence.map(id => { const e = evById(id); return e ? `<span class="evchip" data-goto="${e.id}" title="${esc(e.quote)}">${evNo(e)} ${tagChips(e)}<button data-unpick="${path}|${id}" aria-label="빼기">×</button></span>` : ''; }).join('')}
    <select data-pick="${path}"><option value="">+ 근거 연결</option>${opts.map(e => `<option value="${e.id}">${esc(evLabel(e))} · ${esc(short(e.summary || e.quote, 36))}</option>`).join('')}</select></div>`;
}
function jinroCard() {
  const jd = jinroDiagnosis(jinroProfile(data.jinro.key));
  return jd ? `<div class="card jinro"><div class="card-head"><h3>참고 · jinro-dash 자동 진단 <small>키워드 기반 · ${esc(jd.at || '')}</small></h3></div><p class="help">기계가 키워드로 찾은 결과입니다. 사람의 판단과 어디가 같고 어디가 다른지 비교해 보세요.</p>
      ${jd.axes.map(a => `<p><b>${esc(a.key)}</b> <span class="badge">${{ hi: '높음', mid: '보통', lo: '낮음' }[a.level] || a.level}</span><br><small>${a.ev.map(esc).join('<br>')}${a.gap.length ? '<br>보완: ' + a.gap.map(esc).join(' / ') : ''}</small></p>`).join('')}
      ${jd.gaps.length ? `<p><b>보완점</b><br><small>${jd.gaps.map(esc).join('<br>')}</small></p>` : ''}</div>` : (data.jinro.key ? '<p class="help">연결된 jinro-dash 설계에 생기부 진단 결과가 없습니다. jinro-dash STEP 3에서 이 학생부 원문을 가져와 진단을 실행하면 여기서 비교할 수 있습니다.</p>' : '');
}
function finalStep() {
  if (!data.evidence.length) return '<p class="empty">M1에서 근거를 먼저 표시하세요.</p>' + jinroCard();
  const f = data.final, block = (k, title, place, how) => `<h3 style="margin-top:24px">${title}</h3>` + f[k].map((x, i) => `<div class="card"><h3>${title} ${i + 1}</h3><div class="fields">
    ${ctl({ path: `final.${k}.${i}.text`, label: '내용', value: x.text, type: 'textarea', placeholder: place })}
    ${how ? ctl({ path: `final.${k}.${i}.how`, label: '검증 방법 (면접 질문·추가 자료)', value: x.how, type: 'textarea', placeholder: '예: “오차를 줄이려고 무엇을 바꿨나요?” / 실험 보고서 확인' }) : ''}</div>${evPicker(`final.${k}.${i}`, x)}</div>`).join('');
  return `<div class="card core"><h3>핵심경쟁력 (한 문장)</h3>${ctl({ path: 'final.core.text', label: '이 학생을 한 문장으로', value: f.core.text, wide: true, placeholder: '예: 실험 오차를 스스로 재설계해 검증까지 밀고 가는 화학 탐구자' })}${evPicker('final.core', f.core)}</div>
    ${block('strengths', '핵심강점', '무엇이 강점인지, 어떤 근거로 그렇게 말할 수 있는지')}
    ${block('weaknesses', '핵심약점', '평가자가 약하게 읽을 부분과 그 이유')}
    ${block('checks', '의심·검증사항', '기록만으로는 믿기 어렵거나 과장 가능성이 있는 부분', true)}
    ${jinroCard()}`;
}
function feedbackStep() {
  const total = RUBRIC.reduce((a, [id]) => a + (num(data.rubric[id]) || 0), 0), scored = RUBRIC.filter(([id]) => filled(data.rubric[id])).length;
  return `<div class="kvs">${kv('소요 시간', `${Math.floor(data.timer.elapsed / 60)}분 ${data.timer.elapsed % 60}초`)}${kv('근거', data.evidence.length + '개')}${kv('탐구 줄기', data.threads.length + '개')}</div>
    <div class="fields">${ctl({ path: 'feedback.self', label: '교육생 자기평가', value: data.feedback.self, type: 'textarea', placeholder: '가장 판단이 어려웠던 근거와 이유, 60분 안에 못 본 부분' })}${ctl({ path: 'feedback.coach', label: '강사 피드백', value: data.feedback.coach, type: 'textarea', required: false })}</div>
    <h3 style="margin-top:28px">루브릭 채점 <small style="font-weight:400;color:#7b8899">(강사 작성)</small></h3>
    <div class="fields">${RUBRIC.map(([id, l, h]) => ctl({ path: `rubric.${id}`, label: l, value: data.rubric[id], options: RUBRIC_SCORES, required: false, help: h, rerender: true })).join('')}</div>
    <p class="calc">합계 <span class="score">${total}</span> / ${RUBRIC.length * 5}${scored < RUBRIC.length ? ` (채점 ${scored}/${RUBRIC.length})` : ''}</p>`;
}
const BODY = [prepStep, mappingStep, levelStep, threadStep, curriculumStep, finalStep, feedbackStep];

/* ---------- 렌더 ---------- */
function sidePanel() {
  if (!data.evidence.length) return '';
  const h = heat(), max = Math.max(1, ...Object.values(h).flat());
  const lv = LEVELS.map(l => data.evidence.filter(e => e.level === l).length), lmax = Math.max(1, ...lv);
  return `<div class="diagnostic-group"><h3>역량 × 학년 근거<span>${data.evidence.length}</span></h3><table class="heat"><tr><th></th><th>1</th><th>2</th><th>3</th></tr>${TAG_NAMES.map(t => `<tr><th style="color:${TAG_COLOR[t]}">${t}</th>${h[t].map(n => `<td style="background:${TAG_COLOR[t]}${Math.round(n / max * 200 + (n ? 30 : 0)).toString(16).padStart(2, '0')}">${n || '·'}</td>`).join('')}</tr>`).join('')}</table></div>
    <div class="diagnostic-group"><h3>활동 수준 분포<span>${lv.reduce((a, b) => a + b, 0)}</span></h3>${LEVELS.map((l, i) => `<div class="bar"><span>${l}</span><i style="width:${lv[i] / lmax * 100}%"></i><b>${lv[i]}</b></div>`).join('')}</div>`;
}
function refresh() {
  const m = missing(), w = checks(), done = STEPS.filter((_, i) => !m.some(x => x.step === i)).length;
  const name = stu?.record.values.studentName || data.student.name;
  $('#caseTitle').textContent = [activeNumber ? pad(activeNumber) + '번' : '', name ? `${name} 학생부 정밀분석` : '새 학생부 정밀분석'].filter(Boolean).join(' · ');
  $('#caseSub').textContent = stu ? [stu.record.values.school, stu.record.values.grade, data.targetMajor && `희망 ${data.targetMajor}`, data.jinro.schoolName && `jinro: ${data.jinro.schoolName}`].filter(Boolean).join(' · ') : '학생부 원문에서 근거를 표시하고, 수준·연결성·교육과정을 거쳐 Student Profile Report를 만듭니다.';
  $('#stats').innerHTML = `<div class="stat"><span>작성 완료 단계</span><strong>${done}<span> / ${STEPS.length}</span></strong><small>필수 항목 기준</small></div><div class="stat"><span>표시한 근거</span><strong>${data.evidence.length}</strong><small>원문 ${data.sections.length}개 영역</small></div><div class="stat"><span>탐구 줄기</span><strong>${data.threads.length}</strong><small>1→2→3학년 연결</small></div>`;
  $('#nav').innerHTML = STEPS.map((s, i) => `<button class="nav-item ${i === current ? 'active' : ''}" data-step="${i}" ${i === current ? 'aria-current="step"' : ''}><em>${pad(i + 1)}</em>${s.title}<span class="done">${!m.some(x => x.step === i) ? '✓' : ''}</span></button>`).join('');
  $('#stageState').textContent = m.some(x => x.step === current) ? '작성 중' : '필수 항목 작성됨';
  const group = (title, items, cls, empty) => `<div class="diagnostic-group"><h3>${title}<span>${items.length}</span></h3>${items.length ? items.slice(0, 40).map(x => `<button class="issue ${cls}" data-step="${x.step}">${esc(x.label)}<small>${STEPS[x.step].title} →</small></button>`).join('') + (items.length > 40 ? `<div class="empty">외 ${items.length - 40}건</div>` : '') : `<div class="empty">${empty}</div>`}</div>`;
  $('#matrix').innerHTML = sidePanel();
  $('#diagnostics').innerHTML = group('확인 필요', w, 'red', '현재 확인이 필요한 불일치가 없습니다.') + group('누락 항목', m, '', '필수 항목이 작성되었습니다.');
  $('#storageNote').className = 'storage-note warn';
  $('#storageNote').innerHTML = '<b>학생부 원문은 민감한 개인정보입니다.</b> 이 브라우저에만 저장되며, 이름·학교명은 가리고 입력하세요. 공용 PC에서는 작업 후 분석을 삭제하세요.';
  timerText();
}
function render(keepScroll = false) {
  const y = window.scrollY;
  $('#stepNumber').textContent = `STEP ${pad(current + 1)} / ${STEPS.length}`;
  $('#stepTitle').textContent = STEPS[current].title; $('#stepHelp').textContent = STEPS[current].help;
  $('#body').innerHTML = BODY[current]();
  $('#prev').disabled = current === 0; $('#next').disabled = current === STEPS.length - 1;
  hideSelBar(); refresh(); if (keepScroll) window.scrollTo(0, y);
}
function updateList() {
  document.querySelector('header').inert = busy; document.querySelector('.workspace').inert = busy;
  $('#itemList').innerHTML = '<option value="">새 분석</option>' + saved.map(s => `<option value="${s.number}">${pad(s.number)}번 · ${esc(s.record.student.name || '학생 미선택')}</option>`).join('');
  $('#itemList').value = activeNumber || '';
  $('#deleteItem').disabled = !activeNumber || busy; $('#save').disabled = !ready || busy; $('#backupAll').disabled = !saved.length;
  if (info) $('#accountBar').textContent = `${info.title} · 학생부 정밀분석 저장 ${saved.length} / ${info.studentLimit}건 · ${info.label}`;
}
function toast(s) { const t = $('#toast'); t.textContent = s; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 3500); }
const canReplace = () => !dirty || confirm('저장하지 않은 내용이 있습니다. 계속할까요?');
const full = () => saved.length >= info.studentLimit;

/* ---------- 타이머 ---------- */
let tick = null;
function timerText() { const b = $('#timerBtn'); if (!b) return; const left = LIMIT_SEC - data.timer.elapsed, a = Math.abs(left); b.textContent = `${tick ? '⏸' : '⏱'} ${left < 0 ? '+' : ''}${pad(Math.floor(a / 60))}:${pad(a % 60)}`; b.classList.toggle('over', left < 0); b.classList.toggle('running', !!tick); }
$('#timerBtn').onclick = () => { if (tick) { clearInterval(tick); tick = null; } else tick = setInterval(() => { data.timer.elapsed++; timerText(); }, 1000); dirty = true; timerText(); };

/* ---------- 학생·jinro 연결 ---------- */
async function loadStudentRows() { stuRows = await students.list(); }
function attachStudent(number) {
  const row = stuRows.find(r => r.number === Number(number));
  if (!row) { stu = number ? undefined : null; return; }
  stu = { number: row.number, revision: row.revision, record: validateRecord(row.record) };
  data.student = { number: String(row.number), name: stu.record.values.studentName || '' };
  if (!data.targetMajor && stu.record.values.studentGoal) data.targetMajor = String(stu.record.values.studentGoal).split('\n')[0].slice(0, 60);
}
async function initJinro() {
  J.loading = true;
  try { if (await jinroAvailable()) { [J.schools, J.programs] = await Promise.all([schoolList(), programList()]); J.ok = true; } }
  catch (e) { J.error = e.message; }
  J.loading = false;
  if (data.jinro.schoolPath && J.ok) J.school = await schoolSubjects(data.jinro.schoolPath, data.jinro.trackId).catch(() => null);
  if (current === 4 || current === 0) render(true);
}
async function applySchool(path, trackId = '') {
  if (!path) { Object.assign(data.jinro, { schoolPath: '', schoolName: '', trackId: '' }); J.school = null; return; }
  J.school = await schoolSubjects(path, trackId);
  Object.assign(data.jinro, { schoolPath: path, schoolName: J.school.name, trackId });
  data.curriculum.offered = J.school.subjects.map(s => s.subject);
  recheck();
}
async function applyProgram(id) {
  if (!id) return;
  const p = await programSubjects(id);
  Object.assign(data.jinro, { programId: id, programName: p.name });
  const have = new Set(data.curriculum.rows.map(r => normSub(r.subject)));
  for (const [list, level] of [[p.core, '핵심'], [p.recommended, '권장']]) for (const s of list) if (!have.has(normSub(s))) { data.curriculum.rows.push({ subject: s, level, offered: autoOffered(s), taken: autoTaken(s), note: '' }); have.add(normSub(s)); }
  if (!filled(data.targetMajor)) data.targetMajor = p.name;
}
function recheck() { data.curriculum.rows.forEach(r => { if (r.offered !== '공동교육과정·온라인') r.offered = autoOffered(r.subject); if (r.taken !== '이수 예정') r.taken = autoTaken(r.subject); }); }
async function linkJinro(key) {
  const p = jinroProfile(key);
  data.jinro.key = key || '';
  if (!p) return;
  if (p.schoolPath) await applySchool(p.schoolPath, p.trackId || '');
  if (p.programId) await applyProgram(p.programId);
}

/* ---------- 선택 → 근거 ---------- */
const selBar = Object.assign(document.createElement('div'), { className: 'selbar', hidden: true });
selBar.innerHTML = `<span>선택한 문장을 근거로:</span>${TAGS.map(([t, c]) => `<button data-mk="${t}" style="--c:${c}">${t}</button>`).join('')}<button data-mk="" class="ghost">취소</button>`;
document.body.append(selBar);
function hideSelBar() { selBar.hidden = true; pendingSel = null; }
function offsetIn(container, node, off) { const r = document.createRange(); r.setStart(container, 0); r.setEnd(node, off); return r.toString().length; }
document.addEventListener('mouseup', () => setTimeout(() => {
  if (current !== 1) return;
  const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return hideSelBar();
  const r = sel.getRangeAt(0), box = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer.closest('.rtext') : r.commonAncestorContainer.parentElement?.closest('.rtext');
  if (!box) return hideSelBar();
  const s = secOf(box.dataset.sec); let a = offsetIn(box, r.startContainer, r.startOffset), b = offsetIn(box, r.endContainer, r.endOffset);
  while (a < b && /\s/.test(s.text[a])) a++; while (b > a && /\s/.test(s.text[b - 1])) b--;
  if (b - a < 4) return hideSelBar();
  pendingSel = { sec: s.id, start: a, end: b, quote: s.text.slice(a, b) };
  const rect = r.getBoundingClientRect();
  selBar.style.top = `${Math.min(window.innerHeight - 56, rect.top > 64 ? rect.top - 52 : rect.bottom + 8)}px`; selBar.style.left = `${Math.min(window.innerWidth - 420, Math.max(8, rect.left))}px`; selBar.hidden = false;
}, 0));
selBar.addEventListener('mousedown', e => e.preventDefault());
selBar.addEventListener('click', e => {
  const b = e.target.closest('[data-mk]'); if (!b) return;
  if (b.dataset.mk && pendingSel) {
    const dup = data.evidence.find(x => x.sec === pendingSel.sec && x.start === pendingSel.start && x.end === pendingSel.end);
    if (dup) { if (!dup.tags.includes(b.dataset.mk)) dup.tags.push(b.dataset.mk); focusEv = dup.id; }
    else { const ev = { id: uid('e'), ...pendingSel, tags: [b.dataset.mk], summary: '', level: '', levelReason: '', thread: '' }; data.evidence.push(ev); focusEv = ev.id; }
    dirty = true; window.getSelection().removeAllRanges(); render(true); document.getElementById('card-' + focusEv)?.scrollIntoView({ block: 'nearest' });
  }
  hideSelBar();
});

/* ---------- 이벤트 ---------- */
function setPath(path, value) { const p = path.split('.'); let t = data; for (let i = 0; i < p.length - 1; i++) t = t[p[i]]; const k = p.at(-1); t[k] = (k === 'year') ? Number(value) : value; dirty = true; }
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.path) { let v = el.value; if (el.dataset.secText) v = mask(v); setPath(el.dataset.path, v); if (el.dataset.rerender) render(true); else refresh(); return; }
  if (el.id === 'offeredText') { data.curriculum.offered = el.value.split(/[\n,，]/).map(x => x.trim()).filter(Boolean); dirty = true; clearTimeout(render.t); render.t = setTimeout(refresh, 200); }
});
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.secText && el.value !== mask(el.value)) { el.value = mask(el.value); toast('식별정보로 보이는 부분을 가렸습니다. 남은 이름·학번은 직접 지우세요.'); }
  if (el.id === 'offeredText') render(true);
  if (el.id === 'stuPick') { attachStudent(el.value); dirty = true; render(true); }
  if (el.id === 'jinroPick') { try { await linkJinro(el.value); dirty = true; render(true); if (el.value) toast('jinro-dash 설계를 연결했습니다. M4에서 편제·학과 과목을 확인하세요.'); } catch (err) { toast(err.message); } }
  if (el.id === 'schoolPick') { try { await applySchool(el.value); dirty = true; render(true); } catch (err) { toast(err.message); } }
  if (el.id === 'trackPick') { try { await applySchool(data.jinro.schoolPath, el.value); dirty = true; render(true); } catch (err) { toast(err.message); } }
  if (el.id === 'programPick') { try { await applyProgram(el.value); dirty = true; render(true); toast('학과 핵심·권장 과목을 추가했습니다.'); } catch (err) { toast(err.message); } }
  const pk = el.dataset.pick;
  if (pk && el.value) { const p = pk.split('.'); let t = data; for (const k of p) t = t[k]; t.evidence.push(el.value); dirty = true; render(true); }
});
document.addEventListener('click', e => {
  const t = e.target;
  const step = t.closest('[data-step]'); if (step) { current = Number(step.dataset.step); render(); window.scrollTo(0, 0); return; }
  const yr = t.closest('[data-year]'); if (yr) { yearFilter = Number(yr.dataset.year); render(true); return; }
  const mk = t.closest('mark[data-ev]'); if (mk && current === 1 && window.getSelection().isCollapsed) { focusEv = mk.dataset.ev.split(' ')[0]; render(true); document.getElementById('card-' + focusEv)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  const go = t.closest('[data-goto]'); if (go && !t.closest('button')) { focusEv = go.dataset.goto; const s = secOf(evById(focusEv)?.sec); yearFilter = 0; current = 1; render(); setTimeout(() => document.querySelector(`mark.focus`)?.scrollIntoView({ block: 'center' }), 0); return; }
  const tg = t.closest('[data-toggle-tag]'); if (tg) { const [id, tag] = tg.dataset.toggleTag.split('|'), ev = evById(id); ev.tags = ev.tags.includes(tag) ? ev.tags.filter(x => x !== tag) : [...ev.tags, tag]; dirty = true; render(true); return; }
  const lv = t.closest('[data-level]'); if (lv) { const [id, l] = lv.dataset.level.split('|'); evById(id).level = l; dirty = true; render(true); return; }
  const de = t.closest('[data-del-ev]'); if (de) { const id = de.dataset.delEv; if (!confirm(`${evNo(evById(id))} 근거를 삭제할까요? 최종평가 연결도 함께 빠집니다.`)) return; data.evidence = data.evidence.filter(x => x.id !== id); for (const k of ['strengths', 'weaknesses', 'checks']) data.final[k].forEach(x => x.evidence = x.evidence.filter(y => y !== id)); data.final.core.evidence = data.final.core.evidence.filter(y => y !== id); dirty = true; render(true); return; }
  const ds = t.closest('[data-del-sec]'); if (ds) { const id = ds.dataset.delSec, n = data.evidence.filter(x => x.sec === id).length; if (!confirm(n ? `이 영역과 표시한 근거 ${n}개를 삭제할까요?` : '이 영역을 삭제할까요?')) return; const gone = new Set(data.evidence.filter(x => x.sec === id).map(x => x.id)); data.sections = data.sections.filter(x => x.id !== id); data.evidence = data.evidence.filter(x => !gone.has(x.id)); for (const k of ['strengths', 'weaknesses', 'checks']) data.final[k].forEach(x => x.evidence = x.evidence.filter(y => !gone.has(y))); data.final.core.evidence = data.final.core.evidence.filter(y => !gone.has(y)); dirty = true; render(true); return; }
  const dt = t.closest('[data-del-thread]'); if (dt) { if (!confirm('이 줄기를 삭제할까요? 근거는 남습니다.')) return; data.threads = data.threads.filter(x => x.id !== dt.dataset.delThread); data.evidence.forEach(x => { if (x.thread === dt.dataset.delThread) x.thread = ''; }); dirty = true; render(true); return; }
  const dr = t.closest('[data-del-row]'); if (dr) { data.curriculum.rows.splice(Number(dr.dataset.delRow), 1); dirty = true; render(true); return; }
  const up = t.closest('[data-unpick]'); if (up) { const [path, id] = up.dataset.unpick.split('|'), p = path.split('.'); let o = data; for (const k of p) o = o[k]; o.evidence = o.evidence.filter(x => x !== id); dirty = true; render(true); return; }
  const act = t.closest('[data-act]')?.dataset.act;
  if (act === 'split') { const txt = mask($('#bulkText').value), y = Number($('#bulkYear').value), parts = splitText(txt, y); if (!parts.length) return toast('나눌 내용이 없습니다.'); parts.forEach(p => data.sections.push({ ...blankSection(y, p.area, p.subject), text: p.text })); dirty = true; render(true); toast(`${y}학년 원문을 ${parts.length}개 영역으로 나눴습니다. 영역·과목이 맞는지 확인하세요.`); }
  if (act === 'addSec') { data.sections.push(blankSection(data.sections.at(-1)?.year || 1)); dirty = true; render(true); }
  if (act === 'addThread') { data.threads.push({ id: uid('t'), name: '', dev: '', note: '' }); dirty = true; render(true); }
  if (act === 'addRow') { data.curriculum.rows.push({ subject: '', level: '직접', offered: '', taken: '', note: '' }); dirty = true; render(true); }
  if (act === 'recheck') { recheck(); dirty = true; render(true); toast('편제·이수 여부를 다시 대조했습니다.'); }
});
$('#prev').onclick = () => { current--; render(); window.scrollTo(0, 0); };
$('#next').onclick = () => { current++; render(); window.scrollTo(0, 0); };

/* ---------- 저장·불러오기 ---------- */
function openRow(row) { activeNumber = row.number; activeRevision = row.revision; data = validateHakjong(row.record); attachStudent(data.student.number); dirty = false; current = 0; yearFilter = 0; focusEv = ''; if (data.jinro.schoolPath && J.ok) schoolSubjects(data.jinro.schoolPath, data.jinro.trackId).then(s => { J.school = s; if (current === 4) render(true); }).catch(() => { }); render(); updateList(); }
function startWith(rec = blankHakjong(), studentNo = '') { activeNumber = null; activeRevision = null; data = rec; stu = null; if (studentNo) attachStudent(studentNo); current = 0; yearFilter = 0; focusEv = ''; render(); updateList(); }
async function loadList() { saved = await storage.list(); updateList(); }
$('#new').onclick = () => { if (!ready) return; if (full()) return toast('저장 한도에 도달했습니다.'); if (canReplace()) { dirty = false; startWith(); } };
$('#itemList').onchange = e => { const n = Number(e.target.value); if (!canReplace()) { e.target.value = activeNumber || ''; return; } if (!n) { dirty = false; startWith(); return; } const row = saved.find(s => s.number === n); if (row) openRow(row); };
$('#reloadItems').onclick = async () => { if (!canReplace()) return; try { await loadStudentRows(); await loadList(); const row = activeNumber && saved.find(s => s.number === activeNumber); if (row) openRow(row); else { dirty = false; startWith(); } toast('목록을 갱신했습니다.'); } catch (err) { toast(err.message); } };
$('#save').onclick = async () => {
  if (!ready || busy) return; if (!stu) return toast('학생을 먼저 선택하세요.');
  busy = true; updateList();
  try { const r = activeNumber ? await storage.update(activeNumber, data, activeRevision) : await storage.create(data); activeNumber = r.number; activeRevision = r.revision; await loadList(); dirty = false; render(true); toast('학생부 정밀분석을 저장했습니다.'); }
  catch (err) { toast(err.message); } finally { busy = false; updateList(); }
};
$('#deleteItem').onclick = async () => {
  if (!activeNumber || busy || !confirm('현재 분석(학생부 원문 포함)을 삭제할까요? 진단실 학생 기록은 그대로 남습니다.')) return;
  busy = true; updateList();
  try { await storage.remove(activeNumber, activeRevision); await loadList(); dirty = false; startWith(); toast('삭제했습니다.'); } catch (err) { toast(err.message); } finally { busy = false; updateList(); }
};
function drawFinder() {
  const q = $('#finderSearch').value.trim().toLocaleLowerCase(), rows = saved.filter(s => !q || `${pad(s.number)}번 ${s.record.student.name}`.toLocaleLowerCase().includes(q));
  $('#finderCount').textContent = `검색 ${rows.length}건 / 저장 ${saved.length}건`;
  $('#finderResults').innerHTML = rows.length ? rows.map(s => `<button class="student-result" data-open="${s.number}"><strong>${pad(s.number)}번 · ${esc(s.record.student.name || '학생 미선택')}</strong><span>근거 ${s.record.evidence.length}개 · 줄기 ${s.record.threads.length}개${s.record.targetMajor ? ' · ' + esc(s.record.targetMajor) : ''}</span><small>마지막 저장 ${esc(new Date(s.updated).toLocaleString('ko-KR'))}</small></button>`).join('') : `<p class="empty">${saved.length ? '검색 결과가 없습니다.' : '저장된 분석이 없습니다.'}</p>`;
}
document.addEventListener('click', e => { const o = e.target.closest('[data-open]'); if (o && canReplace()) { const row = saved.find(s => s.number === Number(o.dataset.open)); if (row) { openRow(row); $('#finder').close(); } } });
$('#findItems').onclick = async () => { if (!ready) return; try { await loadList(); $('#finderSearch').value = ''; drawFinder(); $('#finder').showModal(); $('#finderSearch').focus(); } catch (err) { toast(err.message); } };
$('#finderSearch').oninput = drawFinder; $('#closeFinder').onclick = () => $('#finder').close();

function download(obj, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name.replace(/[^\p{L}\p{N}_.-]/gu, '_'); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
$('#backup').onclick = () => { download({ ...data, studentSnapshot: stu ? stu.record : null }, `학생부정밀분석_${data.student.name || '학생'}_${today()}.json`); toast('파일로 백업했습니다. 학생부 원문이 들어 있으니 안전하게 보관하세요.'); };
$('#backupAll').onclick = async () => { try { await loadList(); download({ type: 'expert-course-hakjong-backup', schemaVersion: HAKJONG_SCHEMA_VERSION, exported: new Date().toISOString(), items: saved.map(s => ({ number: s.number, updated: s.updated, record: s.record })) }, `학생부정밀분석_전체백업_${today()}.json`); toast(`${saved.length}건을 백업했습니다.`); } catch (err) { toast(err.message); } };
$('#load').onclick = () => $('#file').click();
$('#file').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 8_000_000) throw Error('8MB 이하의 파일을 선택하세요.');
    const obj = JSON.parse(await file.text());
    if (obj?.type === 'expert-course-hakjong-backup') {
      const recs = (Array.isArray(obj.items) ? obj.items : []).map(x => validateHakjong(x.record)), room = info.studentLimit - saved.length;
      if (recs.length > room) throw Error(`남은 저장 공간(${room}건)이 부족합니다.`);
      if (!confirm(`백업 파일의 ${recs.length}건을 추가할까요?`)) return;
      busy = true; updateList(); for (const r of recs) await storage.create(r); await loadList(); toast(`${recs.length}건을 추가했습니다.`);
    } else {
      const rec = validateHakjong(obj); if (!canReplace()) return;
      let no = rec.student.number;
      if (obj.studentSnapshot && !stuRows.some(r => String(r.number) === no && r.record.values.studentName === rec.student.name)) {
        if (confirm(`파일에 학생 “${rec.student.name}”의 기록이 들어 있습니다. 상담 진단실에 새 학생으로 추가할까요?`)) { const c = await students.create(validateRecord(obj.studentSnapshot)); no = String(c.number); rec.student.number = no; await loadStudentRows(); }
      }
      startWith(rec, no); dirty = true; toast('파일을 불러왔습니다. 분석 저장을 누르면 새로 보관됩니다.');
    }
  } catch (err) { toast(err instanceof SyntaxError ? '올바른 JSON 파일이 아닙니다.' : err.message); }
  finally { busy = false; updateList(); e.target.value = ''; }
};

/* ---------- 실습 사례 ---------- */
$('#demo').onclick = async () => {
  if (!ready || !canReplace()) return;
  try {
    const { DEMO_NAME, demoStudent, demoSections, demoOffered } = await import('./hakjong-demo.js');
    await loadStudentRows();
    let row = stuRows.find(r => r.record.values.studentName === DEMO_NAME);
    if (!row) { await students.create(validateRecord(demoStudent(normalizeCourses))); await loadStudentRows(); row = stuRows.find(r => r.record.values.studentName === DEMO_NAME); }
    const rec = blankHakjong();
    rec.targetMajor = '화학과';
    rec.sections = demoSections().map(s => ({ ...blankSection(s.year, s.area, s.subject), text: s.text }));
    rec.curriculum.offered = demoOffered();
    dirty = false; startWith(rec, row.number); dirty = true;
    toast('가상 학생 B의 학생부(3개 학년)를 불러왔습니다. M1에서 근거 표시부터 시작하세요. 타이머를 누르면 60분이 시작됩니다.');
  } catch (err) { toast(err.message); }
};

/* ---------- 보고서: Student Profile Report ---------- */
function buildReport() {
  const v = stu?.record.values || {}, cell = x => esc(x || '—'), f = data.final, h = heat();
  const evs = ids => ids.map(id => evById(id)).filter(Boolean).map(e => `<li><b>${evNo(e)}</b> [${esc(secLabel(secOf(e.sec)))}] “${esc(short(e.quote, 140))}” <small>${e.tags.join('·')}${e.level ? ' · ' + e.level : ''}</small></li>`).join('');
  const item = (x, i, how) => `<article><h3>${i + 1}. ${cell(x.text)}</h3>${how ? `<p><b>검증 방법:</b> ${cell(x.how)}</p>` : ''}<ul>${evs(x.evidence)}</ul></article>`;
  return `<h1>Student Profile Report</h1><p>${cell(data.student.name)} · ${cell(v.school)} · ${cell(v.grade)} · 희망 ${cell(data.targetMajor)}${data.jinro.schoolName ? ` · 편제 ${esc(data.jinro.schoolName)}` : ''} · 작성 ${today()} · 소요 ${Math.floor(data.timer.elapsed / 60)}분</p>
    <p class="print-note">학생부 기록에 실제로 있는 문장만 근거로 한 교육용 분석입니다. 점수화하지 않으며 합격 가능성을 예측하지 않습니다.</p>
    <section><h2>핵심경쟁력</h2><article><h3>${cell(f.core.text)}</h3><ul>${evs(f.core.evidence)}</ul></article></section>
    <section><h2>핵심강점</h2>${f.strengths.map((x, i) => item(x, i)).join('')}</section>
    <section><h2>핵심약점</h2>${f.weaknesses.map((x, i) => item(x, i)).join('')}</section>
    <section><h2>의심·검증사항</h2>${f.checks.map((x, i) => item(x, i, true)).join('')}</section>
    <section><h2>역량 × 학년 근거 분포</h2><table class="rep"><tr><th class="nw">역량</th><th>1학년</th><th>2학년</th><th>3학년</th></tr>${TAG_NAMES.map(t => `<tr><td class="nw">${t}</td>${h[t].map(n => `<td>${n}</td>`).join('')}</tr>`).join('')}</table>
      <p>활동 수준: ${LEVELS.map(l => `${l} ${data.evidence.filter(e => e.level === l).length}`).join(' · ')}</p></section>
    <section><h2>탐구 줄기</h2><table class="rep"><tr><th>줄기</th><th>1학년</th><th>2학년</th><th>3학년</th><th class="nw">발전</th></tr>${data.threads.map(t => { const ti = threadInfo(t); return `<tr><td>${cell(t.name)}${t.note ? `<br><small>${esc(t.note)}</small>` : ''}</td>${ti.years.map((l, i) => `<td>${l.map(e => evNo(e)).join(', ') || '—'}${ti.maxLv[i] >= 0 ? `<br><small>${LEVELS[ti.maxLv[i]]}</small>` : ''}</td>`).join('')}<td class="nw"><b>${cell(t.dev)}</b></td></tr>`; }).join('')}</table></section>
    <section><h2>교육과정 대조</h2><table class="rep"><tr><th>과목</th><th class="nw">구분</th><th class="nw">편제</th><th class="nw">이수</th><th>판단</th></tr>${data.curriculum.rows.map(r => `<tr><td>${cell(r.subject)}</td><td class="nw">${cell(r.level)}</td><td class="nw">${cell(r.offered)}</td><td class="nw">${cell(r.taken)}</td><td>${cell(r.note)}</td></tr>`).join('')}</table></section>
    <section><h2>근거 목록</h2><table class="rep"><tr><th class="nw">#</th><th class="nw">위치</th><th>문장</th><th class="nw">역량</th><th class="nw">수준</th></tr>${sortedEvidence().map(e => `<tr><td class="nw">${evNo(e)}</td><td class="nw">${esc(secLabel(secOf(e.sec)))}</td><td>${esc(e.quote)}${e.levelReason ? `<br><small>${esc(e.levelReason)}</small>` : ''}</td><td class="nw">${e.tags.join('·')}</td><td class="nw">${cell(e.level)}</td></tr>`).join('')}</table></section>
    <section><h2>자기평가·피드백</h2><dl><dt>자기평가</dt><dd>${cell(data.feedback.self)}</dd><dt>강사 피드백</dt><dd>${cell(data.feedback.coach)}</dd></dl>
      <table class="rep"><tr>${RUBRIC.map(([, l]) => `<th>${l}</th>`).join('')}<th>합계</th></tr><tr>${RUBRIC.map(([id]) => `<td>${cell(data.rubric[id])}</td>`).join('')}<td>${RUBRIC.reduce((a, [id]) => a + (num(data.rubric[id]) || 0), 0)} / ${RUBRIC.length * 5}</td></tr></table></section>`;
}
$('#print').onclick = () => { $('#report').innerHTML = buildReport(); window.print(); };
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

(async function start() {
  render();
  try {
    info = await storage.init(); await students.init();
    await Promise.all([loadList(), loadStudentRows()]); ready = true;
    const q = new URLSearchParams(location.search);
    const openNo = Number(q.get('open')), openRowQ = openNo && saved.find(r => r.number === openNo);
    if (openRowQ) openRow(openRowQ); else startWith(blankHakjong(), q.get('student') && stuRows.some(r => String(r.number) === q.get('student')) ? q.get('student') : '');
    initJinro().then(async () => { const jk = q.get('jinro'); if (jk && jinroProfile(jk)) { await linkJinro(jk); dirty = true; render(true); toast('jinro-dash 설계와 연결했습니다.'); } });
  } catch (err) { $('#accountBar').textContent = '시작하지 못했습니다: ' + err.message; toast(err.message); }
  updateList();
})();
