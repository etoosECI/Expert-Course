import { CONFIG } from './config.js';
import { createStorage } from './storage/index.js';
import {
  UNIV_SCHEMA_VERSION, SOURCES, SOURCE_STATUS, ITEMS, CHANGE_TYPES, ROUTE_TYPES, DIRECTIONS, CUT_BASIS, CUT_POINT, CUT_METHOD,
  RESULT_SOURCE, RUBRIC, RUBRIC_SCORES, MAX_ROUTES, blankAnalysis, blankRoute, changeKey, isFlagged, validateAnalysis
} from './univ-schema.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const filled = v => typeof v === 'string' && v.trim().length > 0;
const norm = v => String(v || '').replace(/\s+/g, '');
const num = v => { const n = parseFloat(String(v).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; };
const today = () => new Date().toLocaleDateString('sv-SE');
const itemLabel = id => ITEMS.find(x => x[0] === id)[1];

const STEPS = [
  { title: '과제 설정', help: '분석할 대학·학년도를 정하고, 제공 자료 6종의 확보 여부와 출처를 기록합니다. 원자료가 없으면 판단의 범위도 제한됩니다.' },
  { title: '분석 전형', help: '분석할 전형을 등록합니다. 전형명은 대학이 붙인 이름 그대로 쓰고, 유형은 선발 방법 기준으로 고르세요.' },
  { title: '전년 대비 변화', help: '전형마다 7개 항목을 비교합니다. 달라진 것이 없어도 반드시 “유지”를 선택하세요. “안 본 것”과 “변화 없음”은 다릅니다.' },
  { title: '결과 데이터 읽기', help: '전년도 입결·경쟁률·충원을 정리합니다. 입결 수치에는 반드시 기준(최초/최종, 50·70%컷·평균, 산출 방식)을 함께 적으세요.' },
  { title: '변화의 영향', help: '유지가 아닌 변화마다 지원자 규모와 합격선이 어느 쪽으로 움직일지, 누구에게 유리·불리한지 근거와 함께 해석합니다.' },
  { title: '핵심 변화 TOP 3', help: '최종 질문: 올해 이 대학에서 지원전략상 가장 중요한 변화 3개는 무엇인가? 각 변화를 앞 단계의 근거와 연결하세요.' },
  { title: '제출·피드백', help: '자기평가를 작성한 뒤 강사 피드백과 루브릭 채점을 받습니다.' }
];

const storage = createStorage(CONFIG, 'analyses');
let data = blankAnalysis(), current = 0, routeIx = 0, dirty = false;
let saved = [], activeNumber = null, activeRevision = null, info = null, ready = false, busy = false;

/* ---------- 파생 데이터 ---------- */
const routeName = (r, i) => r.name || `전형 ${i + 1}`;
function flaggedList() {
  const out = [];
  data.routes.forEach((r, ri) => ITEMS.forEach(([id, label]) => {
    const it = r.items[id];
    if (isFlagged(it.change)) out.push({ key: changeKey(ri, id), ri, id, label: `${routeName(r, ri)} · ${label} · ${it.change}` });
  }));
  return out;
}

/* ---------- 점검 ---------- */
function missing() {
  const m = [], add = (step, label) => m.push({ step, label });
  const mt = data.meta;
  [['university', '대학명'], ['year', '분석 학년도'], ['prevYear', '비교 학년도'], ['analyst', '분석자'], ['date', '분석일']].forEach(([k, l]) => { if (!filled(mt[k])) add(0, l); });
  SOURCES.forEach(([id, l]) => { const s = data.sources[id]; if (!filled(s.status)) add(0, `${l} 확보 여부`); else if (s.status === '확보' && !filled(s.ref)) add(0, `${l} 출처`); });
  if (!data.routes.length) add(1, '분석 전형 1개 이상');
  data.routes.forEach((r, ri) => {
    const n = routeName(r, ri);
    if (!filled(r.name)) add(1, `전형 ${ri + 1} · 전형명`);
    if (!filled(r.type)) add(1, `${n} · 전형 유형`);
    ITEMS.forEach(([id, l]) => {
      const it = r.items[id], lack = [];
      if (!filled(it.change)) lack.push('변화 유형'); if (!filled(it.prev)) lack.push('전년도'); if (!filled(it.curr)) lack.push('올해'); if (!filled(it.page)) lack.push('근거 쪽수');
      if (lack.length) add(2, `${n} · ${l} (${lack.join('·')})`);
      if (isFlagged(it.change)) {
        const need = []; if (!filled(it.applicants)) need.push('지원자 규모'); if (!filled(it.cutline)) need.push('합격선'); if (!filled(it.impact)) need.push('해석');
        if (need.length) add(4, `${n} · ${l} (${need.join('·')})`);
      }
    });
    const rs = r.result, need = [];
    [['recruit', '모집인원'], ['rate', '경쟁률'], ['filled', '충원 인원'], ['cutValue', '입결 수치'], ['cutBasis', '입결 대상'], ['cutPoint', '입결 지점'], ['cutMethod', '산출 방식'], ['resultSource', '입결 출처'], ['realRate', '실질 경쟁률 추정']]
      .forEach(([k, l]) => { if (!filled(rs[k])) need.push(l); });
    if (need.length) add(3, `${n} · ${need.join('·')}`);
  });
  if (!flaggedList().length && data.routes.some(r => ITEMS.some(([id]) => !filled(r.items[id].change)))) add(4, '전년 대비 변화 판단을 먼저 완료');
  data.top.forEach((t, i) => {
    const need = []; [['link', '연결 변화'], ['summary', '핵심 변화'], ['evidence', '근거'], ['meaning', '전략적 의미'], ['recommend', '권할 학생']].forEach(([k, l]) => { if (!filled(t[k])) need.push(l); });
    if (need.length) add(5, `TOP ${i + 1} · ${need.join('·')}`);
  });
  if (!filled(data.feedback.self)) add(6, '자기평가');
  return m;
}
function checks() {
  const w = [], add = (step, label) => w.push({ step, label });
  SOURCES.forEach(([id, l]) => { if (data.sources[id].status === '미확보') add(0, `${l} 미확보 → 분석 범위 제한 명시 필요`); });
  data.routes.forEach((r, ri) => {
    const n = routeName(r, ri);
    ITEMS.forEach(([id, l]) => {
      const it = r.items[id];
      if (it.change === '유지' && filled(it.prev) && filled(it.curr) && norm(it.prev) !== norm(it.curr)) add(2, `${n} · ${l}: “유지”인데 전년도와 올해 내용이 다름`);
      if (isFlagged(it.change) && filled(it.prev) && norm(it.prev) === norm(it.curr)) add(2, `${n} · ${l}: “${it.change}”인데 내용이 같음`);
    });
    const rs = r.result;
    if (filled(rs.adigaValue) && filled(rs.univValue) && norm(rs.adigaValue) !== norm(rs.univValue) && !filled(rs.mismatch)) add(3, `${n} · 어디가와 입학처 수치가 다름 → 사유 기록`);
    if (rs.cutBasis === '최초 합격자') add(3, `${n} · 최초 합격자 기준 입결 → 충원 반영 여부 확인`);
  });
  const keys = new Set(flaggedList().map(x => x.key)), links = data.top.map(t => t.link).filter(Boolean);
  data.top.forEach((t, i) => { if (t.link && !keys.has(t.link)) add(5, `TOP ${i + 1}: 연결한 변화가 더 이상 “변화”로 표시되어 있지 않음`); });
  if (new Set(links).size < links.length) add(5, 'TOP 3에 같은 변화가 중복 연결됨');
  if (data.routes.length && keys.size === 0 && data.routes.every(r => ITEMS.every(([id]) => filled(r.items[id].change)))) add(2, '모든 항목이 “유지” → 정말 변화가 없는지 다시 확인');
  return w;
}

/* ---------- 입력 요소 ---------- */
function ctl({ path, label, value = '', type = 'text', options, required = true, help = '', wide = false, placeholder = '', rerender = false }) {
  const req = required ? '<span class="required"> *</span>' : '', rr = rerender ? ' data-rerender="1"' : '';
  let c;
  if (options) c = `<select data-path="${path}"${rr}><option value="">선택하세요</option>${options.map(o => `<option ${value === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (type === 'textarea') c = `<textarea data-path="${path}" placeholder="${esc(placeholder || '근거와 판단을 기록하세요')}">${esc(value)}</textarea>`;
  else c = `<input type="${type}" data-path="${path}" value="${esc(value)}" placeholder="${esc(placeholder)}">`;
  return `<label class="field ${wide || type === 'textarea' ? 'wide' : ''}">${esc(label)}${req}${c}${help ? `<small>${esc(help)}</small>` : ''}</label>`;
}
const chips = () => data.routes.length > 1 ? `<div class="chips" role="tablist">${data.routes.map((r, i) => `<button class="chip ${i === routeIx ? 'active' : ''}" data-route="${i}" role="tab" aria-selected="${i === routeIx}">${esc(routeName(r, i))}</button>`).join('')}</div>` : '';

function stepBody() {
  const d = data;
  if (current === 0) {
    const mt = d.meta;
    return `<div class="fields">${ctl({ path: 'meta.university', label: '대학명', value: mt.university })}${ctl({ path: 'meta.round', label: '모집 시기', value: mt.round, options: ['수시', '정시'] })}
      ${ctl({ path: 'meta.year', label: '분석 학년도 (올해)', value: mt.year, placeholder: '예: 2027' })}${ctl({ path: 'meta.prevYear', label: '비교 학년도 (전년도)', value: mt.prevYear, placeholder: '예: 2026' })}
      ${ctl({ path: 'meta.analyst', label: '분석자', value: mt.analyst })}${ctl({ path: 'meta.date', label: '분석일', value: mt.date, type: 'date' })}
      ${ctl({ path: 'meta.note', label: '분석 목적·메모', value: mt.note, type: 'textarea', required: false, placeholder: '예: 교과·종합 동시 지원 학생 상담 대비' })}</div>
      <h3 style="margin-top:30px">제공 자료 확인</h3>
      ${SOURCES.map(([id, l]) => { const s = d.sources[id]; return `<div class="card"><div class="card-head"><h3>${l}</h3>${s.status ? `<span class="badge ${s.status === '확보' ? 'keep' : ''}">${esc(s.status)}</span>` : ''}</div><div class="fields">
        ${ctl({ path: `sources.${id}.status`, label: '확보 여부', value: s.status, options: SOURCE_STATUS, rerender: true })}${ctl({ path: `sources.${id}.checked`, label: '확인일', value: s.checked, type: 'date', required: false })}
        ${ctl({ path: `sources.${id}.ref`, label: '출처 (자료명·URL·쪽수)', value: s.ref, wide: true, required: s.status === '확보' })}</div></div>`; }).join('')}`;
  }
  if (current === 1) {
    return d.routes.map((r, i) => `<div class="card"><div class="card-head"><h3>전형 ${i + 1}</h3>${d.routes.length > 1 ? `<button class="remove" data-remove-route="${i}">삭제</button>` : ''}</div><div class="fields">
      ${ctl({ path: `routes.${i}.name`, label: '전형명 (대학 표기 그대로)', value: r.name, placeholder: '예: 학교추천전형' })}${ctl({ path: `routes.${i}.type`, label: '전형 유형', value: r.type, options: ROUTE_TYPES })}
      ${ctl({ path: `routes.${i}.scope`, label: '분석 범위 (모집단위·계열)', value: r.scope, wide: true, required: false, placeholder: '예: 전체 / 자연계열 / 경영학과 중심' })}</div></div>`).join('')
      + (d.routes.length < MAX_ROUTES ? `<button class="add" data-add-route>+ 분석 전형 추가 (최대 ${MAX_ROUTES}개)</button>` : '');
  }
  const r = d.routes[routeIx];
  if (current === 2) {
    if (!r) return '<p class="empty">먼저 분석 전형을 등록하세요.</p>';
    return chips() + ITEMS.map(([id, l, hint]) => {
      const it = r.items[id], p = `routes.${routeIx}.items.${id}`;
      return `<div class="card item-card ${isFlagged(it.change) ? 'flag' : ''}"><h3>${l}<small>${esc(hint)}</small>${it.change ? `<span class="badge ${it.change === '유지' ? 'keep' : ''}" style="margin-left:auto">${esc(it.change)}</span>` : ''}</h3>
        <div class="item-grid">${ctl({ path: `${p}.prev`, label: `전년도${d.meta.prevYear ? ` (${d.meta.prevYear})` : ''}`, value: it.prev, placeholder: '요강 내용 요약' })}${ctl({ path: `${p}.curr`, label: `올해${d.meta.year ? ` (${d.meta.year})` : ''}`, value: it.curr, placeholder: '요강 내용 요약' })}
        ${ctl({ path: `${p}.change`, label: '변화 유형', value: it.change, options: CHANGE_TYPES, rerender: true })}${ctl({ path: `${p}.page`, label: '근거 쪽수', value: it.page, placeholder: '예: p.12' })}</div></div>`;
    }).join('');
  }
  if (current === 3) {
    if (!r) return '<p class="empty">먼저 분석 전형을 등록하세요.</p>';
    const rs = r.result, p = `routes.${routeIx}.result`, rec = num(rs.recruit), fil = num(rs.filled), app = num(rs.applicants);
    const calc = [app && rec ? `계산 경쟁률 ${(app / rec).toFixed(2)} : 1` : '', fil !== null && rec ? `충원율 ${Math.round(fil / rec * 100)}%` : ''].filter(Boolean).join(' · ');
    return chips() + `<div class="fields">
      ${ctl({ path: `${p}.recruit`, label: '전년도 모집인원', value: rs.recruit, placeholder: '예: 30' })}${ctl({ path: `${p}.applicants`, label: '지원자 수', value: rs.applicants, required: false, placeholder: '예: 420' })}
      ${ctl({ path: `${p}.rate`, label: '경쟁률', value: rs.rate, placeholder: '예: 14.0 : 1' })}${ctl({ path: `${p}.filled`, label: '충원 인원', value: rs.filled, placeholder: '예: 18' })}
      </div>${calc ? `<p class="calc">${calc}</p>` : ''}
      <h3 style="margin-top:28px">입결</h3><div class="fields">
      ${ctl({ path: `${p}.cutValue`, label: '입결 수치', value: rs.cutValue, placeholder: '예: 2.35' })}${ctl({ path: `${p}.cutBasis`, label: '입결 대상', value: rs.cutBasis, options: CUT_BASIS })}
      ${ctl({ path: `${p}.cutPoint`, label: '입결 지점', value: rs.cutPoint, options: CUT_POINT })}${ctl({ path: `${p}.cutMethod`, label: '산출 방식', value: rs.cutMethod, options: CUT_METHOD })}
      ${ctl({ path: `${p}.resultSource`, label: '입결 출처', value: rs.resultSource, options: RESULT_SOURCE, rerender: true })}</div>
      ${rs.resultSource === '입학처·어디가 모두' ? `<h3 style="margin-top:28px">교차검증</h3><div class="fields">${ctl({ path: `${p}.adigaValue`, label: '어디가 수치', value: rs.adigaValue, required: false })}${ctl({ path: `${p}.univValue`, label: '입학처 수치', value: rs.univValue, required: false })}
      ${ctl({ path: `${p}.mismatch`, label: '두 수치가 다른 이유', value: rs.mismatch, type: 'textarea', required: false, placeholder: '예: 어디가는 최종 등록자 70%컷, 입학처는 최종 등록자 최저점' })}</div>` : ''}
      <div class="fields">${ctl({ path: `${p}.realRate`, label: '실질 경쟁률 추정·근거', value: rs.realRate, type: 'textarea', placeholder: '수능최저 충족률, 결시, 중복 합격 이탈 등을 근거로 추정' })}
      ${ctl({ path: `${p}.trend`, label: '3개년 추세 메모', value: rs.trend, type: 'textarea', required: false, placeholder: '경쟁률·입결·충원의 3개년 흐름' })}</div>`;
  }
  if (current === 4) {
    const list = flaggedList();
    if (!list.length) return '<p class="empty">“유지”가 아닌 변화가 아직 없습니다. 전년 대비 변화 단계에서 변화 유형을 먼저 선택하세요.</p>';
    return list.map(x => {
      const it = d.routes[x.ri].items[x.id], p = `routes.${x.ri}.items.${x.id}`;
      return `<div class="card item-card flag"><h3>${esc(routeName(d.routes[x.ri], x.ri))} · ${itemLabel(x.id)}<span class="badge" style="margin-left:auto">${esc(it.change)}</span></h3>
        <p class="help" style="margin:6px 0 0">${esc(it.prev || '—')} → <b>${esc(it.curr || '—')}</b> ${it.page ? `(${esc(it.page)})` : ''}</p>
        <div class="fields">${ctl({ path: `${p}.applicants`, label: '지원자 규모 전망', value: it.applicants, options: DIRECTIONS })}${ctl({ path: `${p}.cutline`, label: '합격선 전망', value: it.cutline, options: ['상승', '하락', '불확실'] })}
        ${ctl({ path: `${p}.impact`, label: '해석: 누구에게 유리·불리한가, 그 근거는', value: it.impact, type: 'textarea' })}</div></div>`;
    }).join('');
  }
  if (current === 5) {
    const list = flaggedList();
    return `<div class="note">후보는 “유지”가 아닌 변화 <b>${list.length}개</b>입니다. 그중 지원전략에 가장 큰 영향을 주는 3개를 고르세요.</div>`
      + d.top.map((t, i) => `<div class="card"><h3>TOP ${i + 1}</h3><div class="fields">
        <label class="field wide">연결할 변화<span class="required"> *</span><select data-path="top.${i}.link" data-rerender="1"><option value="">선택하세요</option>${list.map(x => `<option value="${x.key}" ${t.link === x.key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select><small>앞 단계에서 “변화”로 표시한 항목만 선택할 수 있습니다.</small></label>
        ${ctl({ path: `top.${i}.summary`, label: '핵심 변화 (한 문장)', value: t.summary, wide: true })}
        ${ctl({ path: `top.${i}.evidence`, label: '근거 (자료·쪽수·데이터)', value: t.evidence, type: 'textarea' })}
        ${ctl({ path: `top.${i}.meaning`, label: '지원전략상 의미', value: t.meaning, type: 'textarea' })}
        ${ctl({ path: `top.${i}.recommend`, label: '권할 학생', value: t.recommend, type: 'textarea' })}
        ${ctl({ path: `top.${i}.caution`, label: '주의할 학생', value: t.caution, type: 'textarea', required: false })}</div></div>`).join('');
  }
  const total = RUBRIC.reduce((a, [id]) => a + (num(d.rubric[id]) || 0), 0), scored = RUBRIC.filter(([id]) => filled(d.rubric[id])).length;
  return `<div class="fields">${ctl({ path: 'feedback.self', label: '교육생 자기평가', value: d.feedback.self, type: 'textarea', placeholder: '가장 판단이 어려웠던 변화와 그 이유, 추가로 확인하고 싶은 자료' })}
    ${ctl({ path: 'feedback.coach', label: '강사 피드백', value: d.feedback.coach, type: 'textarea', required: false, placeholder: '놓친 변화, 해석의 오류, 잘한 점' })}</div>
    <h3 style="margin-top:28px">루브릭 채점 <small style="font-weight:400;color:#7b8899">(강사 작성)</small></h3>
    <div class="fields">${RUBRIC.map(([id, l, h]) => ctl({ path: `rubric.${id}`, label: l, value: d.rubric[id], options: RUBRIC_SCORES, required: false, help: h, rerender: true })).join('')}</div>
    <p class="calc">합계 <span class="score">${total}</span> / ${RUBRIC.length * 5}${scored < RUBRIC.length ? ` (채점 ${scored}/${RUBRIC.length})` : ''}</p>`;
}

/* ---------- 렌더 ---------- */
function refresh() {
  const m = missing(), w = checks(), f = flaggedList(), done = STEPS.filter((_, i) => !m.some(x => x.step === i)).length;
  const mt = data.meta;
  $('#caseTitle').textContent = [data.number ? pad(data.number) + '번' : '', mt.university || '새 대학 분석'].filter(Boolean).join(' · ');
  $('#caseSub').textContent = mt.university ? [mt.year && mt.prevYear ? `${mt.prevYear} → ${mt.year}학년도` : '', mt.round, data.routes.map((r, i) => routeName(r, i)).join(', ')].filter(Boolean).join(' · ') : '전년도와 올해 자료를 비교해 지원전략상 가장 중요한 변화 3개를 찾습니다.';
  $('#stats').innerHTML = `<div class="stat"><span>작성 완료 단계</span><strong>${done}<span> / ${STEPS.length}</span></strong><small>필수 항목 기준</small></div><div class="stat"><span>누락 항목</span><strong>${m.length}</strong><small>근거·쪽수 포함</small></div><div class="stat"><span>핵심 변화 후보</span><strong>${f.length}</strong><small>“유지”가 아닌 변화</small></div>`;
  $('#nav').innerHTML = STEPS.map((s, i) => `<button class="nav-item ${i === current ? 'active' : ''}" data-step="${i}" ${i === current ? 'aria-current="step"' : ''}><em>${pad(i + 1)}</em>${s.title}<span class="done">${!m.some(x => x.step === i) ? '✓' : ''}</span></button>`).join('');
  $('#stageState').textContent = m.some(x => x.step === current) ? '작성 중' : '필수 항목 작성됨';
  const group = (title, items, cls, empty) => `<div class="diagnostic-group"><h3>${title}<span>${items.length}</span></h3>${items.length ? items.map(x => `<button class="issue ${cls}" data-step="${x.step}" ${x.ri !== undefined ? `data-route="${x.ri}"` : ''}>${esc(x.label)}<small>${STEPS[x.step].title} →</small></button>`).join('') : `<div class="empty">${empty}</div>`}</div>`;
  $('#diagnostics').innerHTML = group('확인 필요', w, 'red', '현재 확인이 필요한 불일치가 없습니다.')
    + group('핵심 변화 후보', f.map(x => ({ ...x, step: 4 })), 'gold', '“유지”가 아닌 변화가 표시되면 여기에 모입니다.')
    + group('누락 항목', m, '', '필수 항목이 작성되었습니다. 해석의 타당성은 강사 피드백으로 확인하세요.');
  $('#storageNote').className = 'storage-note' + (info?.persistent === false ? ' warn' : '');
  $('#storageNote').innerHTML = info?.persistent === false ? '<b>임시 저장 상태</b>입니다. 작업 후 반드시 <b>파일 백업</b>을 하세요.' : '<b>분석 저장</b>을 누르면 <b>이 브라우저</b>에 보관됩니다. 강사 제출은 <b>파일 백업</b>으로 내려받은 파일을 보내세요.';
}
function render(keepScroll = false) {
  const y = window.scrollY;
  if (routeIx >= data.routes.length) routeIx = Math.max(0, data.routes.length - 1);
  $('#stepNumber').textContent = `STEP ${pad(current + 1)} / ${STEPS.length}`;
  $('#stepTitle').textContent = STEPS[current].title;
  $('#stepHelp').textContent = STEPS[current].help;
  $('#body').innerHTML = stepBody();
  $('#prev').disabled = current === 0; $('#next').disabled = current === STEPS.length - 1;
  refresh();
  if (keepScroll) window.scrollTo(0, y);
}
function updateList() {
  document.querySelector('header').inert = busy; document.querySelector('.workspace').inert = busy;
  $('#itemList').innerHTML = '<option value="">새 분석</option>' + saved.map(s => `<option value="${s.number}">${pad(s.number)}번 · ${esc(s.record.meta.university || '대학 미입력')}</option>`).join('');
  $('#itemList').value = activeNumber || '';
  $('#deleteItem').disabled = !activeNumber || busy; $('#save').disabled = !ready || busy; $('#backupAll').disabled = !saved.length;
  if (info) $('#accountBar').textContent = `${info.title} · 대학 분석 저장 ${saved.length} / ${info.studentLimit}건 · ${info.label}`;
}
function toast(s) { const t = $('#toast'); t.textContent = s; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 3500); }
const canReplace = () => !dirty || confirm('저장하지 않은 내용이 있습니다. 현재 분석을 바꿀까요?');
const full = () => saved.length >= info.studentLimit;
function openRow(row) { activeNumber = row.number; activeRevision = row.revision; data = validateAnalysis(row.record); data.number = row.number; dirty = false; current = 0; routeIx = 0; render(); updateList(); }
function startWith(rec = blankAnalysis()) { activeNumber = null; activeRevision = null; data = rec; current = 0; routeIx = 0; render(); updateList(); }
async function loadList() { saved = await storage.list(); updateList(); }
const recordOnly = () => { const { number, ...rest } = data; return rest; };

/* ---------- 이벤트 ---------- */
function setPath(path, value) { const p = path.split('.'); let t = data; for (let i = 0; i < p.length - 1; i++) t = t[p[i]]; t[p.at(-1)] = value; dirty = true; }
document.addEventListener('input', e => { const el = e.target; if (!el.dataset.path) return; setPath(el.dataset.path, el.value); if (el.dataset.rerender) render(true); else refresh(); });
document.addEventListener('click', e => {
  const route = e.target.closest('[data-route]'), step = e.target.closest('[data-step]');
  if (route) routeIx = Number(route.dataset.route);
  if (step) { current = Number(step.dataset.step); render(); window.scrollTo(0, 0); return; }
  if (route) { render(true); return; }
  if (e.target.closest('[data-add-route]')) { data.routes.push(blankRoute()); dirty = true; render(true); return; }
  const rm = e.target.closest('[data-remove-route]');
  if (rm && confirm('이 전형과 입력한 비교 내용을 삭제할까요?')) {
    const i = Number(rm.dataset.removeRoute); data.routes.splice(i, 1);
    data.top.forEach(t => { if (!t.link) return; const [ri, id] = t.link.split('.'); const n = Number(ri); t.link = n === i ? '' : n > i ? `${n - 1}.${id}` : t.link; });
    dirty = true; render(true);
  }
  const open = e.target.closest('[data-open]');
  if (open && canReplace()) { const row = saved.find(s => s.number === Number(open.dataset.open)); if (row) { openRow(row); $('#finder').close(); } }
});
$('#prev').onclick = () => { current--; render(); window.scrollTo(0, 0); };
$('#next').onclick = () => { current++; render(); window.scrollTo(0, 0); };

$('#new').onclick = () => { if (!ready) return; if (full()) return toast('저장 한도에 도달했습니다.'); if (canReplace()) { dirty = false; startWith(); } };
$('#itemList').onchange = e => { const n = Number(e.target.value); if (!canReplace()) { e.target.value = activeNumber || ''; return; } if (!n) { dirty = false; startWith(); return; } const row = saved.find(s => s.number === n); if (row) openRow(row); };
$('#reloadItems').onclick = async () => { if (!canReplace()) return; try { await loadList(); const row = activeNumber && saved.find(s => s.number === activeNumber); if (row) openRow(row); else { dirty = false; startWith(); } toast('목록을 갱신했습니다.'); } catch (err) { toast(err.message); } };
$('#save').onclick = async () => {
  if (!ready || busy) return;
  if (!filled(data.meta.university)) return toast('대학명을 입력하세요.');
  busy = true; updateList();
  try {
    const r = activeNumber ? await storage.update(activeNumber, recordOnly(), activeRevision) : await storage.create(recordOnly());
    activeNumber = r.number; activeRevision = r.revision; data.number = r.number; await loadList(); dirty = false; render(true); toast('대학 분석을 저장했습니다.');
  } catch (err) { toast(err.message); } finally { busy = false; updateList(); }
};
$('#deleteItem').onclick = async () => {
  if (!activeNumber || busy || !confirm('현재 분석의 저장 자료를 삭제할까요? 필요하면 먼저 파일 백업을 하세요.')) return;
  busy = true; updateList();
  try { await storage.remove(activeNumber, activeRevision); await loadList(); dirty = false; startWith(); toast('분석을 삭제했습니다.'); } catch (err) { toast(err.message); } finally { busy = false; updateList(); }
};
function drawFinder() {
  const q = $('#finderSearch').value.trim().toLocaleLowerCase();
  const rows = saved.filter(s => !q || `${pad(s.number)}번 ${s.record.meta.university}`.toLocaleLowerCase().includes(q));
  $('#finderCount').textContent = `검색 ${rows.length}건 / 저장 ${saved.length}건`;
  $('#finderResults').innerHTML = rows.length ? rows.map(s => `<button class="student-result" data-open="${s.number}"><strong>${pad(s.number)}번 · ${esc(s.record.meta.university || '대학 미입력')}</strong><span>${esc([s.record.meta.prevYear && s.record.meta.year ? `${s.record.meta.prevYear} → ${s.record.meta.year}` : '', s.record.routes.map(r => r.name).filter(Boolean).join(', ')].filter(Boolean).join(' · ') || '전형 미입력')}</span><small>마지막 저장 ${esc(new Date(s.updated).toLocaleString('ko-KR'))}</small></button>`).join('') : `<p class="empty">${saved.length ? '검색 결과가 없습니다.' : '저장된 분석이 없습니다.'}</p>`;
}
$('#findItems').onclick = async () => { if (!ready) return; try { await loadList(); $('#finderSearch').value = ''; drawFinder(); $('#finder').showModal(); $('#finderSearch').focus(); } catch (err) { toast(err.message); } };
$('#finderSearch').oninput = drawFinder;
$('#closeFinder').onclick = () => $('#finder').close();

function download(obj, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name.replace(/[^\p{L}\p{N}_.-]/gu, '_'); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
$('#backup').onclick = () => { download(recordOnly(), `대학분석_${data.meta.university || '미입력'}_${data.meta.analyst || ''}_${today()}.json`); toast('현재 분석을 파일로 백업했습니다.'); };
$('#backupAll').onclick = async () => { try { await loadList(); download({ type: 'expert-course-analyses-backup', schemaVersion: UNIV_SCHEMA_VERSION, exported: new Date().toISOString(), items: saved.map(s => ({ number: s.number, updated: s.updated, record: s.record })) }, `대학분석_전체백업_${today()}.json`); toast(`분석 ${saved.length}건을 백업했습니다.`); } catch (err) { toast(err.message); } };
$('#load').onclick = () => $('#file').click();
$('#file').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 5_000_000) throw Error('5MB 이하의 파일을 선택하세요.');
    const obj = JSON.parse(await file.text());
    if (obj?.type === 'expert-course-analyses-backup') {
      const recs = (Array.isArray(obj.items) ? obj.items : []).map(x => validateAnalysis(x.record)), room = info.studentLimit - saved.length;
      if (recs.length > room) throw Error(`남은 저장 공간(${room}건)보다 분석 수(${recs.length}건)가 많습니다.`);
      if (!confirm(`백업 파일의 분석 ${recs.length}건을 새로 추가할까요?`)) return;
      busy = true; updateList(); for (const r of recs) await storage.create(r); await loadList(); toast(`${recs.length}건을 추가했습니다.`);
    } else {
      const rec = validateAnalysis(obj); if (full()) throw Error('저장 공간이 없습니다.'); if (!canReplace()) return;
      startWith(rec); dirty = true; toast('파일을 불러왔습니다. 분석 저장을 누르면 새로 보관됩니다.');
    }
  } catch (err) { toast(err instanceof SyntaxError ? '올바른 JSON 파일이 아닙니다.' : err.message); }
  finally { busy = false; updateList(); e.target.value = ''; }
};

/* ---------- 실습 사례 (가상 대학) ---------- */
$('#demo').onclick = () => {
  if (!ready || !canReplace()) return;
  const d = blankAnalysis();
  d.meta = { university: '가상 한빛대학교', year: '2027', prevYear: '2026', round: '수시', analyst: '교육생', date: today(), note: '가상 실습 사례입니다. 실제 대학의 모집요강·입결이 아닙니다.' };
  const src = { prevGuide: '2026 수시 모집요강(가상) 전체', currGuide: '2027 수시 모집요강(가상) 전체', prevResult: '2026 수시 전형결과(가상), 입학처', competition: '2026 수시 경쟁률(가상), 입학처', fill: '2026 충원 현황(가상), 입학처', adiga: '어디가 2026 전형결과(가상)' };
  SOURCES.forEach(([id]) => { d.sources[id] = { status: '확보', ref: src[id], checked: today() }; });
  const set = (r, vals) => { Object.entries(vals).forEach(([id, [prev, curr, page]]) => Object.assign(r.items[id], { prev, curr, page })); };
  const r1 = blankRoute(); Object.assign(r1, { name: '학교추천전형', type: '학생부교과', scope: '전체 모집단위' });
  set(r1, { quota: ['312명', '336명 (+24)', 'p.8'], minimum: ['인문 3개 합 7 / 자연 3개 합 7 (탐구 1과목)', '인문·자연 모두 2개 합 5 (탐구 1과목)', 'p.21'],
    eligibility: ['고교별 추천 10명, 졸업예정자', '고교별 추천 10명, 졸업예정자', 'p.19'], method: ['교과 100% 일괄', '교과 80% + 서류 정성평가 20% 일괄', 'p.20'],
    interview: ['없음', '없음', 'p.20'], grades: ['국영수사과 전 과목, 학년 비율 없음, 진로선택 미반영', '국영수사과 전 과목, 진로선택 성취도 A=1등급 환산 반영', 'p.22'],
    units: ['자유전공학부 없음', '자유전공학부 신설(18명)', 'p.9'] });
  Object.assign(r1.result, { recruit: '312', applicants: '3120', rate: '10.0 : 1', filled: '281', cutValue: '1.92', cutBasis: '최종 등록자', cutPoint: '70%컷', cutMethod: '대학 환산 등급', resultSource: '입학처·어디가 모두', adigaValue: '1.92', univValue: '2.08', mismatch: '', realRate: '', trend: '2024 1.81 → 2025 1.88 → 2026 1.92 (70%컷, 가상)' });
  const r2 = blankRoute(); Object.assign(r2, { name: '활동우수형', type: '학생부종합', scope: '자연계열 중심' });
  set(r2, { quota: ['540명', '505명 (-35)', 'p.8'], minimum: ['없음', '없음', 'p.27'], eligibility: ['졸업생 지원 가능', '졸업생 지원 가능', 'p.25'],
    method: ['1단계 서류 100% (3배수) → 2단계 서류 70 + 면접 30', '1단계 서류 100% (3배수) → 2단계 서류 70 + 면접 30', 'p.26'],
    interview: ['서류 기반 면접, 수능 전', '서류 기반 면접, 수능 후 실시', 'p.28'], grades: ['서류 종합평가', '서류 종합평가', 'p.26'], units: ['의예과 모집', '의예과 모집, 약학과 추가 모집(10명)', 'p.10'] });
  Object.assign(r2.result, { recruit: '540', applicants: '11880', rate: '22.0 : 1', filled: '162', cutValue: '2.41', cutBasis: '최종 등록자', cutPoint: '50%컷', cutMethod: '전 과목', resultSource: '입학처', realRate: '', trend: '' });
  d.routes = [r1, r2];
  startWith(d); dirty = true;
  toast('가상 실습 사례입니다. 변화 유형 판단부터 직접 해보세요.');
};

/* ---------- 보고서 ---------- */
function buildReport() {
  const d = data, mt = d.meta, cell = v => esc(v || '—');
  const src = `<table class="rep"><tr><th class="nw">자료</th><th class="nw">확보</th><th>출처</th><th>확인일</th></tr>${SOURCES.map(([id, l]) => `<tr><td class="nw">${l}</td><td class="nw">${cell(d.sources[id].status)}</td><td>${cell(d.sources[id].ref)}</td><td>${cell(d.sources[id].checked)}</td></tr>`).join('')}</table>`;
  const routes = d.routes.map((r, i) => {
    const rs = r.result;
    return `<section><h2>${esc(routeName(r, i))} <small>(${cell(r.type)}${r.scope ? ` · ${esc(r.scope)}` : ''})</small></h2>
      <h3>전년 대비 변화</h3><table class="rep"><tr><th class="nw">항목</th><th>${cell(mt.prevYear)}</th><th>${cell(mt.year)}</th><th class="nw">변화</th><th class="nw">쪽</th></tr>${ITEMS.map(([id, l]) => { const it = r.items[id]; return `<tr><td class="nw">${l}</td><td>${cell(it.prev)}</td><td>${cell(it.curr)}</td><td class="nw"><b>${cell(it.change)}</b></td><td class="nw">${cell(it.page)}</td></tr>`; }).join('')}</table>
      <h3>전년도 결과</h3><table class="rep"><tr><th>모집</th><th>경쟁률</th><th>충원</th><th>입결</th><th>입결 기준</th></tr><tr><td>${cell(rs.recruit)}</td><td>${cell(rs.rate)}</td><td>${cell(rs.filled)}</td><td>${cell(rs.cutValue)}</td><td>${esc([rs.cutBasis, rs.cutPoint, rs.cutMethod, rs.resultSource].filter(Boolean).join(' · ') || '—')}</td></tr></table>
      ${rs.mismatch ? `<p><b>교차검증:</b> 어디가 ${cell(rs.adigaValue)} / 입학처 ${cell(rs.univValue)} — ${esc(rs.mismatch)}</p>` : ''}
      <p><b>실질 경쟁률 추정:</b> ${cell(rs.realRate)}</p>${rs.trend ? `<p><b>3개년 추세:</b> ${esc(rs.trend)}</p>` : ''}
      ${ITEMS.filter(([id]) => isFlagged(r.items[id].change)).map(([id, l]) => { const it = r.items[id]; return `<p><b>[영향] ${l} (${esc(it.change)})</b> — 지원자 ${cell(it.applicants)}, 합격선 ${cell(it.cutline)}<br>${cell(it.impact)}</p>`; }).join('')}</section>`;
  }).join('');
  const lab = new Map(flaggedList().map(x => [x.key, x.label]));
  const top = d.top.map((t, i) => `<article><h3>TOP ${i + 1}. ${cell(t.summary)}</h3><p><small>연결: ${cell(lab.get(t.link))}</small></p><dl><dt>근거</dt><dd>${cell(t.evidence)}</dd><dt>지원전략상 의미</dt><dd>${cell(t.meaning)}</dd><dt>권할 학생</dt><dd>${cell(t.recommend)}</dd><dt>주의할 학생</dt><dd>${cell(t.caution)}</dd></dl></article>`).join('');
  const total = RUBRIC.reduce((a, [id]) => a + (num(d.rubric[id]) || 0), 0);
  return `<h1>${cell(mt.university)} ${esc(mt.year || '')}학년도 ${esc(mt.round)} 분석 보고서</h1>
    <p>비교 기준: ${cell(mt.prevYear)} → ${cell(mt.year)} · 분석자 ${cell(mt.analyst)} · ${cell(mt.date)}</p>
    <p class="print-note">모집요강·입결 원자료를 근거로 작성한 교육용 분석입니다. 합격 가능성을 보장하지 않습니다.</p>
    <section><h2>핵심 변화 TOP 3</h2>${top}</section><section><h2>분석 자료</h2>${src}</section>${routes}
    <section><h2>자기평가·피드백</h2><dl><dt>자기평가</dt><dd>${cell(d.feedback.self)}</dd><dt>강사 피드백</dt><dd>${cell(d.feedback.coach)}</dd></dl>
    <table class="rep"><tr>${RUBRIC.map(([, l]) => `<th>${l}</th>`).join('')}<th>합계</th></tr><tr>${RUBRIC.map(([id]) => `<td>${cell(d.rubric[id])}</td>`).join('')}<td>${total} / ${RUBRIC.length * 5}</td></tr></table></section>`;
}
$('#print').onclick = () => { $('#report').innerHTML = buildReport(); window.print(); };
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

(async function start() {
  render();
  try { info = await storage.init(); await loadList(); ready = true; startWith(); }
  catch (err) { $('#accountBar').textContent = '저장 공간을 열지 못했습니다: ' + err.message; toast(err.message); }
  updateList();
})();
