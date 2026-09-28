import { CONFIG } from './config.js';
import { createStorage } from './storage/index.js';
import { steps, candidateFields, riskFields, feedbackFields, routeRatings, field, blank, validateRecord, SCHEMA_VERSION } from './schema.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const filled = v => typeof v === 'string' && v.trim().length > 0;

const storage = createStorage(CONFIG);
let data = blank(), current = 0, dirty = false;
let saved = [], activeNumber = null, activeRevision = null, info = null, ready = false, busy = false;

/* ---------- 진단 로직 ---------- */
function missing() {
  const list = [];
  steps.forEach((s, i) => s.fields.filter(x => x.required && !filled(data.values[x.id])).forEach(x => list.push({ step: i, label: x.label })));
  data.routes.forEach(r => { if (!filled(r.rating) || !filled(r.reason)) list.push({ step: 5, label: r.name + ' 적합도·근거' }); });
  if (!data.candidates.length) list.push({ step: 6, label: '대학·학과 후보 1개 이상' });
  data.candidates.forEach((c, i) => candidateFields.filter(x => x.required && !filled(c[x.id])).forEach(x => list.push({ step: 6, label: `후보 ${i + 1} · ${x.label}` })));
  data.risks.forEach((r, i) => riskFields.filter(x => x.required && !filled(r[x.id])).forEach(x => list.push({ step: 7, label: `확인사항 ${i + 1} · ${x.label}` })));
  return list;
}
function warnings() {
  const a = [], okMin = ['없음', '충족 전망'];
  if (data.values.agreement && data.values.agreement !== '합의') a.push({ step: 1, label: '학생·학부모 목표 합의 필요' });
  data.candidates.forEach((c, i) => {
    const name = c.university || `후보 ${i + 1}`;
    if (c.eligibility !== '충족 확인') a.push({ step: 6, label: `${name} · 지원자격 ${c.eligibility || '미확인'}` });
    if (!okMin.includes(c.minimum)) a.push({ step: 6, label: `${name} · 수능최저 ${c.minimum || '미확인'}` });
    if (!c.source || !c.checked) a.push({ step: 6, label: `${name} · 출처 / 확인일 누락` });
    if (c.category === '안정' && (!c.reason || c.eligibility !== '충족 확인' || !okMin.includes(c.minimum))) a.push({ step: 6, label: `${name} · 안정 분류 재검토` });
  });
  if (data.candidates.length && data.candidates.every(c => c.category === '도전')) a.push({ step: 8, label: '모든 후보가 도전으로 분류됨' });
  data.risks.filter(r => r.status !== '해결').forEach(r => a.push({ step: 7, label: `${r.title || '제목 없는 리스크'} · ${r.severity || '중요도 미정'}` }));
  return a;
}

/* ---------- 화면 ---------- */
function fieldHTML(fd, value, path) {
  const req = fd.required ? '<span class="required"> *</span>' : '';
  let control;
  if (fd.type === 'select') control = `<select data-path="${path}"><option value="">선택하세요</option>${fd.options.map(o => `<option ${value === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (fd.type === 'textarea') control = `<textarea data-path="${path}" placeholder="근거와 판단을 기록하세요">${esc(value)}</textarea>`;
  else control = `<input type="${fd.type}" ${fd.id === 'caseId' ? 'readonly aria-readonly="true"' : ''} data-path="${path}" value="${esc(value)}">`;
  return `<label class="field ${fd.type === 'textarea' ? 'wide' : ''}">${esc(fd.label)}${req}${control}${fd.help ? `<small>${esc(fd.help)}</small>` : ''}</label>`;
}

function refresh() {
  const m = missing(), w = warnings(), done = steps.filter((_, i) => !m.some(x => x.step === i)).length;
  $('#caseTitle').textContent = [data.values.caseId ? data.values.caseId + '번' : '', data.values.studentName || '새 학생'].filter(Boolean).join(' · ');
  $('#caseSub').textContent = [data.values.year ? data.values.year + '학년도' : '', data.values.school, data.values.grade].filter(Boolean).join(' · ') || '학생의 현재 위치를 파악하고, 다음 판단을 준비합니다.';
  $('#stats').innerHTML = `<div class="stat"><span>필수 작성 단계</span><strong>${done}<span> / ${steps.length}</span></strong><small>작성 여부 기준</small></div><div class="stat"><span>누락 항목</span><strong>${m.length}</strong><small>근거·기본정보 포함</small></div><div class="stat"><span>확인할 리스크</span><strong>${w.length}</strong><small>자동 점검 + 직접 등록</small></div>`;
  $('#nav').innerHTML = steps.map((s, i) => `<button class="nav-item ${i === current ? 'active' : ''}" data-step="${i}" ${i === current ? 'aria-current="step"' : ''}><em>${pad(i + 1)}</em>${s.title}<span class="done">${!m.some(x => x.step === i) ? '✓' : ''}</span></button>`).join('');
  $('#stageState').textContent = m.some(x => x.step === current) ? '작성 중' : '필수 항목 작성됨';
  const group = (title, items, cls, empty) => `<div class="diagnostic-group"><h3>${title}<span>${items.length}</span></h3>${items.length ? items.map(x => `<button class="issue ${cls}" data-step="${x.step}">${esc(x.label)}<small>${steps[x.step].title} →</small></button>`).join('') : `<div class="empty">${empty}</div>`}</div>`;
  const tasks = data.risks.filter(r => r.status !== '해결').map(r => ({ step: 7, label: `${r.title || '확인사항'} / ${r.owner || '담당 미지정'} / ${r.due || '기한 미정'}` }));
  $('#diagnostics').innerHTML = group('주요 리스크', w, 'red', '현재 등록된 리스크가 없습니다. 입력되지 않은 위험까지 확인된 것은 아닙니다.')
    + group('추가 확인·실행', tasks, 'blue', 'Risk 분석에서 담당자와 기한을 지정하세요.')
    + group('누락 항목', m, '', '필수 항목이 작성되었습니다. 판단의 타당성은 별도 검토하세요.');
  storageNote();
}

function render() {
  const s = steps[current];
  $('#stepNumber').textContent = `STEP ${pad(current + 1)} / ${steps.length}`;
  $('#stepTitle').textContent = s.title;
  $('#stepHelp').textContent = s.help;
  $('#fields').innerHTML = `<div class="fields">${s.fields.map(x => fieldHTML(x, data.values[x.id] || '', 'values.' + x.id)).join('')}</div>`;
  let extra = '';
  if (current === 5) extra = data.routes.map((r, i) => `<div class="card"><h3>${r.name}</h3><div class="fields">${fieldHTML(field('rating', '적합도', 'select', true, routeRatings), r.rating, `routes.${i}.rating`)}${fieldHTML(field('reason', '판단 근거·보완 조건', 'textarea'), r.reason, `routes.${i}.reason`)}</div></div>`).join('');
  if (current === 6 || current === 7) {
    const key = current === 6 ? 'candidates' : 'risks', fs = current === 6 ? candidateFields : riskFields, label = current === 6 ? '지원 후보' : '확인사항';
    extra = data[key].map((r, i) => `<div class="card"><div class="card-head"><h3>${label} ${i + 1}</h3><button class="remove" data-remove="${key}.${i}">삭제</button></div><div class="fields">${fs.map(x => fieldHTML(x, r[x.id] || '', `${key}.${i}.${x.id}`)).join('')}</div></div>`).join('')
      + `<button class="add" data-add="${key}">+ ${current === 6 ? '대학·학과 후보' : '리스크 / 확인사항'} 추가</button>`;
  }
  $('#extras').innerHTML = extra;
  $('#mode').value = data.mode;
  $('#practice').hidden = data.mode !== '전문가 실습';
  $('#feedback').innerHTML = `<div class="fields">${feedbackFields.map(([id, label]) => fieldHTML(field(id, label, 'textarea', false), data.feedback[id], `feedback.${id}`)).join('')}</div>`;
  $('#prev').disabled = current === 0;
  $('#next').disabled = current === steps.length - 1;
  refresh();
}

function storageNote() {
  const note = $('#storageNote');
  if (data.mode === '실제 상담') {
    note.className = 'storage-note warn';
    note.innerHTML = '<b>실제 상담 모드</b> · 학생 개인정보는 이 브라우저에만 저장됩니다. 공용 PC에서는 사용하지 말고, 가능하면 이름은 이니셜로 입력하세요. 백업 파일도 안전한 곳에 보관하세요.';
  } else {
    note.className = 'storage-note';
    note.innerHTML = info?.persistent === false
      ? '<b>임시 저장 상태</b>입니다. 이 브라우저에서는 저장이 유지되지 않으니, 작업 후 반드시 <b>파일 백업</b>을 하세요.'
      : '<b>사례 저장</b>을 누르면 <b>이 브라우저</b>에 보관됩니다. 다른 기기나 브라우저에서는 보이지 않으니 <b>파일 백업</b>을 함께 해두세요. 저장 전 종료하면 변경 내용이 사라집니다.';
  }
}

function updateList() {
  document.querySelector('header').inert = busy;
  document.querySelector('.workspace').inert = busy;
  const select = $('#studentList');
  select.innerHTML = '<option value="">새 학생</option>' + saved.map(s => `<option value="${s.number}">${pad(s.number)}번 · ${esc(s.record.values.studentName || '이름 미입력')}</option>`).join('');
  select.value = activeNumber || '';
  $('#deleteStudent').disabled = !activeNumber || busy;
  $('#save').disabled = !ready || busy;
  $('#backupAll').disabled = !saved.length;
  if (info) $('#accountBar').textContent = `${info.title} · 저장 ${saved.length} / ${info.studentLimit}명 · ${info.label}`;
}

function toast(s) { const t = $('#toast'); t.textContent = s; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 3500); }
const canReplace = () => !dirty || confirm('저장하지 않은 내용이 있습니다. 현재 사례를 바꿀까요?');
const nextNumber = () => { for (let n = 1; n <= info.studentLimit; n++) if (!saved.some(s => s.number === n)) return pad(n); return ''; };
const full = () => saved.length >= info.studentLimit;

function openRecord(row) {
  activeNumber = row.number; activeRevision = row.revision;
  data = validateRecord(row.record); data.values.caseId = pad(row.number);
  dirty = false; current = 0; render(); updateList();
}
function startBlank(record = blank()) {
  activeNumber = null; activeRevision = null; data = record; data.values.caseId = nextNumber();
  current = 0; render(); updateList();
}
async function loadStudents() { saved = await storage.list(); updateList(); }

/* ---------- 입력 이벤트 ---------- */
function setPath(path, value) { const p = path.split('.'); let t = data; for (let i = 0; i < p.length - 1; i++) t = t[p[i]]; t[p.at(-1)] = value; dirty = true; }
document.addEventListener('input', e => { if (e.target.dataset.path) { setPath(e.target.dataset.path, e.target.value); refresh(); } });
document.addEventListener('click', e => {
  const step = e.target.closest('[data-step]');
  if (step) { current = Number(step.dataset.step); render(); }
  const add = e.target.closest('[data-add]');
  if (add) { data[add.dataset.add].push({}); dirty = true; render(); }
  const rem = e.target.closest('[data-remove]');
  if (rem && confirm('이 항목을 삭제할까요?')) { const [k, i] = rem.dataset.remove.split('.'); data[k].splice(Number(i), 1); dirty = true; render(); }
  const open = e.target.closest('[data-open-student]');
  if (open && canReplace()) {
    const row = saved.find(s => s.number === Number(open.dataset.openStudent));
    if (row) { openRecord(row); $('#studentDialog').close(); toast(`${pad(row.number)}번 · ${data.values.studentName} 학생을 불러왔습니다.`); }
  }
});
$('#prev').onclick = () => { current--; render(); };
$('#next').onclick = () => { current++; render(); };
$('#mode').onchange = e => { data.mode = e.target.value; dirty = true; render(); };

/* ---------- 학생 관리 ---------- */
$('#new').onclick = () => {
  if (!ready) return; if (full()) return toast(`저장 한도 ${info.studentLimit}명에 도달했습니다.`);
  if (canReplace()) { dirty = false; startBlank(); }
};
$('#studentList').onchange = e => {
  const n = Number(e.target.value);
  if (!canReplace()) { e.target.value = activeNumber || ''; return; }
  if (!n) { dirty = false; startBlank(); return; }
  const row = saved.find(s => s.number === n); if (row) openRecord(row);
};
$('#reloadStudents').onclick = async () => {
  if (!canReplace()) return;
  try {
    await loadStudents();
    const row = activeNumber && saved.find(s => s.number === activeNumber);
    if (row) openRecord(row); else { dirty = false; startBlank(); }
    toast('목록을 갱신했습니다.');
  } catch (err) { toast(err.message); }
};
$('#save').onclick = async () => {
  if (!ready || busy) return;
  if (!data.values.studentName?.trim()) return toast('학생 이름을 입력하세요.');
  busy = true; updateList();
  try {
    const result = activeNumber ? await storage.update(activeNumber, data, activeRevision) : await storage.create(data);
    activeNumber = result.number; activeRevision = result.revision; data.values.caseId = pad(result.number);
    await loadStudents(); dirty = false; render(); toast('학생 자료를 저장했습니다.');
  } catch (err) { toast(err.message); }
  finally { busy = false; updateList(); }
};
$('#deleteStudent').onclick = async () => {
  if (!activeNumber || busy || !confirm('현재 학생의 저장 자료를 삭제할까요? 필요하면 먼저 파일 백업을 하세요.')) return;
  busy = true; updateList();
  try { await storage.remove(activeNumber, activeRevision); await loadStudents(); dirty = false; startBlank(); toast('학생 자료를 삭제했습니다.'); }
  catch (err) { toast(err.message); }
  finally { busy = false; updateList(); }
};

/* ---------- 찾기 ---------- */
function drawResults() {
  const q = $('#studentSearch').value.trim().toLocaleLowerCase();
  const rows = saved.filter(s => !q || `${pad(s.number)}번 ${s.record.values.studentName || ''}`.toLocaleLowerCase().includes(q));
  $('#finderCount').textContent = `검색 ${rows.length}명 / 저장 ${saved.length}명 (한도 ${info.studentLimit}명)`;
  $('#studentResults').innerHTML = rows.length ? rows.map(s => `<button class="student-result" data-open-student="${s.number}"><strong>${pad(s.number)}번 · ${esc(s.record.values.studentName || '이름 미입력')}</strong><span>${esc(s.record.values.school || '고교 미입력')} · ${esc(s.record.values.grade || '학년 미입력')}</span><small>마지막 저장 ${esc(new Date(s.updated).toLocaleString('ko-KR'))}</small></button>`).join('')
    : `<p class="empty">${saved.length ? '검색 결과가 없습니다. 번호 또는 이름을 확인하세요.' : '저장된 학생이 없습니다. 이름과 내용을 입력한 뒤 사례 저장을 눌러주세요.'}</p>`;
}
$('#findStudents').onclick = async () => {
  if (!ready) return;
  try { await loadStudents(); $('#studentSearch').value = ''; drawResults(); $('#studentDialog').showModal(); $('#studentSearch').focus(); }
  catch (err) { toast(err.message); }
};
$('#studentSearch').oninput = drawResults;
$('#closeFinder').onclick = () => $('#studentDialog').close();

/* ---------- 파일 백업·불러오기 ---------- */
function download(obj, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name.replace(/[^\p{L}\p{N}_.-]/gu, '_'); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const today = () => new Date().toLocaleDateString('sv-SE');
$('#backup').onclick = () => {
  download(data, `${data.values.caseId || '상담사례'}_${data.values.studentName || '새학생'}_${today()}.json`);
  toast('현재 학생을 파일로 백업했습니다.');
};
$('#backupAll').onclick = async () => {
  try {
    await loadStudents();
    download({ type: 'expert-course-backup', schemaVersion: SCHEMA_VERSION, exported: new Date().toISOString(), edition: info.title, students: saved.map(s => ({ number: s.number, updated: s.updated, record: s.record })) }, `전체백업_${today()}.json`);
    toast(`저장된 학생 ${saved.length}명을 한 파일로 백업했습니다.`);
  } catch (err) { toast(err.message); }
};
$('#load').onclick = () => $('#file').click();
$('#file').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 5_000_000) throw Error('5MB 이하의 파일을 선택하세요.');
    const obj = JSON.parse(await file.text());
    if (obj?.type === 'expert-course-backup') {
      if (!Array.isArray(obj.students)) throw Error('전체 백업 파일 형식이 올바르지 않습니다.');
      const records = obj.students.map(s => validateRecord(s.record));
      const room = info.studentLimit - saved.length;
      if (records.length > room) throw Error(`남은 저장 공간(${room}명)보다 학생 수(${records.length}명)가 많습니다.`);
      if (!confirm(`백업 파일의 학생 ${records.length}명을 새 학생으로 추가할까요? 기존 학생은 그대로 유지됩니다.`)) return;
      busy = true; updateList();
      for (const r of records) await storage.create(r);
      await loadStudents(); toast(`${records.length}명을 추가했습니다.`);
    } else {
      const record = validateRecord(obj);
      if (full()) throw Error('새 학생을 저장할 공간이 없습니다.');
      if (!canReplace()) return;
      startBlank(record); dirty = true;
      toast('파일을 불러왔습니다. 사례 저장을 누르면 새 학생으로 보관됩니다.');
    }
  } catch (err) { toast(err instanceof SyntaxError ? '올바른 JSON 사례 파일이 아닙니다.' : err.message); }
  finally { busy = false; updateList(); e.target.value = ''; }
};

/* ---------- 실습 사례 ---------- */
$('#demo').onclick = () => {
  if (!ready || !canReplace()) return;
  if (full()) return toast('새 학생을 저장할 공간이 없습니다.');
  const d = blank();
  d.values = { studentName: '김예시 (가상 학생)', year: '2027', school: '일반고', grade: '고3', date: today(), consultant: '교육생',
    context: '생명과학 분야를 희망하며, 교과와 학종의 우선순위 판단을 요청함.',
    materials: '학생부 3학년 1학기까지 확보. 교육편제표 미확보. 6·9월 모의평가 성적표 확인 필요.',
    studentGoal: '수도권 생명과학 관련 학과', parentGoal: '학과보다 대학 인지도를 우선 희망', priority: '진로 적합성 우선',
    constraints: '수도권 선호, 재수 여부는 미합의', agreement: '조정 중', scale: '9등급', gpa: '2.1 / 국수영과 / 3학년 1학기까지 (가상)',
    trend: '과학 교과 상승 추세. 수학 성적 변동 있음.', academicEvidence: '가상 성적표 예시. 실제 대학 환산 방식은 확인 전.',
    academicJudgment: '과학 교과 강점을 살릴 반영 방식 검토 필요.', exam: '가상 9월 모의평가',
    scores: '국어 2 / 수학 3 / 영어 2 / 생명과학 2 / 지구과학 3 / 한국사 2 (등급)', examTrend: '수학·탐구 변동이 있어 최저 충족을 낙관하기 어려움.' };
  d.candidates = [{ university: '가상 A대학교', major: '생명과학과', route: '학생부교과 예시', round: '수시', category: '적정', eligibility: '미확인', minimum: '불확실', reason: '교과 강점은 있으나 대학 환산 및 공식 자료 검증이 필요함.' }];
  d.risks = [
    { title: '학생과 학부모의 대학·학과 우선순위 불일치', severity: '높음', action: '학생의 진로 목표를 확인한 뒤 공동 상담에서 우선순위 합의', owner: '담당 상담자', due: '', status: '확인 중' },
    { title: '교육편제표 미확보', severity: '보통', action: '학교 편제표 확보 후 과목 선택 맥락 재검토', owner: '학생', due: '', status: '미해결' }];
  startBlank(d); dirty = true;
  toast('가상 실습 사례입니다. 실제 대학 입결이 아닙니다.');
};

/* ---------- 인쇄 ---------- */
function buildReport() {
  const rows = steps.map((s, i) => {
    let body = s.fields.map(x => `<dt>${esc(x.label)}</dt><dd>${esc(data.values[x.id] || '미작성')}</dd>`).join('');
    if (i === 5) body += data.routes.map(r => `<dt>${r.name} · ${esc(r.rating || '미작성')}</dt><dd>${esc(r.reason || '근거 미작성')}</dd>`).join('');
    if (i === 6 || i === 7) {
      const k = i === 6 ? 'candidates' : 'risks', fs = i === 6 ? candidateFields : riskFields;
      body += data[k].map((r, j) => `<h3>${i === 6 ? '후보' : '확인사항'} ${j + 1}</h3>${fs.map(x => `<dt>${x.label}</dt><dd>${esc(r[x.id] || '미작성')}</dd>`).join('')}`).join('') || '<p>등록 없음</p>';
    }
    return `<section><h2>${i + 1}. ${s.title}</h2><dl>${body}</dl></section>`;
  }).join('');
  const w = warnings();
  return `<h1>입시컨설팅 진단서</h1><p>${esc(data.values.caseId || '새 사례')} · ${esc(data.values.year || '학년도 미작성')} · ${esc(data.values.date || '상담일 미작성')}</p><p class="print-note">상담자의 판단과 확인 과제를 기록한 자료입니다. 합격 가능성의 자동 평가 또는 보장을 의미하지 않습니다.</p><article><h2>진단 요약</h2><p>누락 ${missing().length}건 / 리스크 ${w.length}건</p>${w.map(x => `<p>• ${esc(x.label)}</p>`).join('')}</article>${rows}${data.mode === '전문가 실습' ? `<section><h2>실습 피드백</h2>${feedbackFields.map(([k, l]) => `<h3>${l}</h3><p>${esc(data.feedback[k] || '미작성')}</p>`).join('')}</section>` : ''}`;
}
$('#print').onclick = () => { $('#report').innerHTML = buildReport(); window.print(); };
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- 시작 ---------- */
(async function start() {
  render();
  try {
    info = await storage.init();
    await loadStudents(); ready = true; startBlank();
  } catch (err) {
    $('#accountBar').textContent = '저장 공간을 열지 못했습니다: ' + err.message;
    toast(err.message);
  }
  updateList();
})();
