import { CONFIG } from './config.js?v=3.0';
import { createStorage } from './storage/index.js?v=3.0';
import { overall, MAIN_AREAS } from './courses.js?v=3.0';
import { steps, riskFields, feedbackFields, field, blank, validateRecord, SCHEMA_VERSION } from './schema.js?v=3.0';
import { jinroProfiles, jinroProfile, jinroAvailable, schoolSubjects, programSubjects,
  jinroDiagnosis, jinroGrades, gradeSummary, gradeCourses, jinroCourses, mapSchoolType, JINRO_URL } from './jinro-link.js?v=3.0';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const filled = v => typeof v === 'string' && v.trim().length > 0;

const storage = createStorage(CONFIG);
let data = blank(), current = 0, dirty = false;
let saved = [], activeNumber = null, activeRevision = null, info = null, ready = false, busy = false;

/* ---------- 진단 로직 ---------- */
/* ---------- 진로설계(jinro-dash) 연결 ----------
   옮기는 것은 "사실"뿐이다 — 이름·고교·희망 학과·편제·선택 과목·교과 성적,
   그리고 자동 진단이 찾은 근거 '문장'. 역량 판단과 교과·학생부 판단은 옮기지 않는다. */
const J = { ok: false, loading: true, picked: '', school: null, program: null,
  grades: [], summary: null, diag: null, note: '' };

async function initJinro() {
  try { J.ok = await jinroAvailable(); } catch { J.ok = false; }
  J.loading = false;
  render();
}
const jinroList = () => jinroProfiles();
const f2 = v => (v == null ? '–' : (Math.round(v * 100) / 100).toFixed(2));
const gradeLine = g => !g ? '없음'
  : `${g.subjectCount}과목 · 전 과목 ${f2(g.overallRank)}등급 · 5교과 ${f2(g.coreRank)}등급 · 이수단위 ${g.totalCredits}`
    + (g.spread != null ? ` · 교과 간 격차 ${g.spread}등급 (강 ${g.strong.join('·')} / 약 ${g.weak.join('·')})` : '');

function fillIfEmpty(id, text, report) {
  if (!text) return;
  if (filled(data.values[id])) { report.skipped.push(id); return; }
  data.values[id] = text; report.filled.push(id);
}

async function applyJinro(key) {
  const p = jinroProfile(key);
  if (!p) { toast('그 설계를 찾지 못했습니다.'); return; }
  const report = { filled: [], skipped: [], courses: 0 };
  J.picked = key; J.school = null; J.program = null;

  if (p.schoolPath) { try { J.school = await schoolSubjects(p.schoolPath, p.trackId || ''); } catch { J.school = null; } }
  if (p.programId) { try { J.program = await programSubjects(p.programId); } catch { J.program = null; } }
  J.diag = jinroDiagnosis(p);
  J.grades = jinroGrades(p);
  J.summary = gradeSummary(J.grades);
  const track = J.school && (J.school.tracks || []).find(t => t.id === p.trackId);

  // 학생 이름 — 진로설계 보드에서 동의 후 입력한 값
  if (p.studentName && !filled(data.values.studentName)) { data.values.studentName = p.studentName; report.filled.push('studentName'); }
  else if (p.studentName) report.skipped.push('studentName');

  const st = mapSchoolType(J.school && J.school.schoolType);
  if (st && !filled(data.values.school)) { data.values.school = st; report.filled.push('school'); }
  else if (st) report.skipped.push('school');

  if (J.program) fillIfEmpty('studentGoal', `희망 학과: ${J.program.name}\n(진로설계 보드에서 선택 · 대학은 상담에서 정함)`, report);

  if (J.school) {
    const picked = [...new Set([...(p.takenSubjects || []), ...(p.chosenSubjects || []), ...(p.manualSubjects || [])])].filter(Boolean);
    const lines = [
      `학교: ${J.school.name}${J.school.schoolType ? ` (${J.school.schoolType})` : ''}${track ? ` · ${track.label}` : ''}`,
      `개설 ${(J.school.subjects || []).length}과목 · 설계에서 고른 과목 ${picked.length}개`,
      picked.length ? picked.join(', ') : '',
    ].filter(Boolean);
    if (J.program) {
      const core = J.program.core || [], have = new Set(picked);
      const miss = core.filter(x => !have.has(x));
      lines.push(`${J.program.name} 핵심 과목 ${core.length}개 중 ${core.length - miss.length}개 선택` + (miss.length ? ` · 빠진 과목: ${miss.join(', ')}` : ''));
    }
    fillIfEmpty('curriculum', lines.join('\n') + '\n— 위는 불러온 사실입니다. 선택의 이유와 맥락을 덧붙이세요.', report);
  }

  fillIfEmpty('materials', [
    J.school ? `교육과정 편제표: 진로설계 보드 연결 (${J.school.name})` : '교육과정 편제표: 미연결',
    J.grades.length ? `교과 성적: ${J.grades.length}과목 (생기부에서 읽음, ${p.grades?.at || '시점 미기재'})` : '교과 성적: 미입력',
    J.diag ? `학생부 자동 진단: 있음 (${J.diag.at || '시점 미기재'}, 키워드 기반)` : '학생부 자동 진단: 없음',
    p.entryGrade ? `진로설계 기준: ${p.entryGrade}학년 진입 (학년/졸업 상태는 직접 확인)` : '',
  ].filter(Boolean).join('\n'), report);

  // 교과 성적 → courses (교과 지원판단 보드가 그대로 씁니다)
  const src = J.grades.length ? gradeCourses(J.grades) : (J.school ? jinroCourses(p, J.school) : []);
  const have = new Set(data.courses.map(c => `${c.name}|${c.year}|${c.semester}`));
  const add = src.filter(c => !have.has(`${c.name}|${c.year}|${c.semester}`));
  if (add.length) { data.courses = data.courses.concat(add); report.courses = add.length; }

  dirty = true;
  J.note = `${report.filled.length}개 항목을 채웠습니다.`
    + (report.courses ? ` 과목 ${report.courses}개를 가져왔습니다.` : '')
    + (report.skipped.length ? ` 이미 쓰신 ${report.skipped.length}개는 그대로 두었습니다.` : '')
    + (J.grades.length ? '' : ' 이 설계에는 교과 성적이 없습니다 — 진로설계 보드 STEP 3에서 생기부를 넣고 진단을 실행하면 성적이 저장됩니다.')
    + (p.studentName ? '' : ' 학생 이름도 비어 있습니다 — 진로설계 보드 ①에서 동의 후 입력하세요.');
  render(); toast(J.note);
}

function jinroImportCard() {
  const list = jinroList();
  const opts = list.map(p => {
    const label = [p.studentName || '이름 미입력', p.studentKey, p.schoolName || '학교 미선택'].filter(Boolean).join(' · ');
    return `<option value="${esc(p.studentKey)}" ${J.picked === p.studentKey ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
  return `<div class="card jinro"><div class="card-head"><h3>진로설계에서 학생 불러오기 <small>고교 진로·선택과목 설계</small></h3>
      <a class="linkbtn ghostlink" href="${JINRO_URL}" target="_blank" rel="noopener">진로설계 열기 ↗</a></div>
    <p class="help">학생 등록은 <b>진로설계 보드에서 시작</b>합니다. 거기서 저장한 학생을 여기서 골라 불러오세요.
      <b>이름 · 고교 유형 · 희망 학과 · 교육편제와 선택 과목 · 교과 성적</b>이 넘어옵니다.
      상담일·상담자·학생 배경은 상담에서 직접 쓰는 칸이라 비워 둡니다. 이미 쓰신 칸도 덮지 않습니다.</p>
    <div class="fields"><label class="field wide">저장된 학생
      <select data-jinro-pick="1"><option value="">선택하세요</option>${opts}</select>
      ${list.length ? '' : '<small>이 브라우저에 저장된 진로설계가 없습니다. 진로설계 보드에서 학생을 먼저 저장하세요.</small>'}</label></div>
    ${J.note ? `<p class="help"><b>${esc(J.note)}</b></p>` : ''}
    ${J.loading ? '<p class="help">진로설계 데이터를 확인하는 중…</p>'
      : (J.ok ? '' : '<p class="help">진로설계 데이터 파일에 연결하지 못했습니다. 두 보드가 같은 사이트에 올라가 있어야 편제·학과 과목을 읽습니다.</p>')}</div>`;
}

/* STEP 2 — 교과 경쟁력: 학기별 평균 등급·원점수, 교과 간 편차, 우수·미흡, 이수단위 */
function jinroGradeCard() {
  const g = J.summary;
  if (!g) return `<div class="card jinro"><div class="card-head"><h3>교과 성적 <small>진로설계 보드에서 불러옵니다</small></h3></div>
    <p class="help">아직 불러온 성적이 없습니다. STEP 01에서 학생을 불러오세요.
      진로설계 보드 STEP 3에서 생기부를 넣으면 교과학습발달상황 표를 읽어 성적이 저장됩니다.</p></div>`;
  const AREAS = ['국어', '수학', '영어', '사회', '과학'];
  const tag = a => g.strong.includes(a) ? '<span class="badge">우수</span>' : (g.weak.includes(a) ? '<span class="badge">보완</span>' : '');
  const head = g.terms.map(t => `<th>${esc(t.replace('-', '학년 '))}학기</th>`).join('');
  const body = AREAS.map(a => {
    const b = g.byArea[a];
    const cells = g.terms.map(t => {
      const x = b.terms.find(y => y.term === t);
      return `<td>${x && x.rank != null ? `${f2(x.rank)}<small> / ${x.raw == null ? '–' : f2(x.raw)}점</small>` : '–'}</td>`;
    }).join('');
    const share = g.coreCredits ? Math.round((b.credits / g.coreCredits) * 100) : 0;
    return `<tr><th>${a} ${tag(a)}</th><td><b>${f2(b.rank)}</b></td><td>${f2(b.raw)}</td>
      <td>${b.credits}<small> (${share}%)</small></td>${cells}</tr>`;
  }).join('');
  return `<div class="card jinro"><div class="card-head"><h3>불러온 교과 성적 <small>진로설계 보드 · 생기부에서 읽음</small></h3></div>
    <p class="help">${esc(gradeLine(g))}</p>
    <div style="overflow:auto"><table class="kvs"><thead><tr><th>교과</th><th>평균 등급</th><th>평균 원점수</th><th>이수단위</th>${head}</tr></thead>
      <tbody>${body}</tbody></table></div>
    <p class="help">칸 안은 <b>평균 등급 / 평균 원점수</b>입니다. 이수단위 옆 %는 5교과 안에서의 비중입니다.
      ${g.spread != null ? `교과 간 격차가 <b>${g.spread}등급</b>입니다 — 강한 교과 ${esc(g.strong.join('·'))}, 보완할 교과 ${esc(g.weak.join('·'))}.` : ''}
      이 숫자는 불러온 사실이고, 아래 칸의 <b>판단</b>은 상담자가 씁니다.</p></div>`;
}

/* STEP 3 — 학생부 경쟁력: 편제 / 학업역량(성적) / 진로·공동체(생기부 근거) */
function jinroRecordCards() {
  if (!J.picked) return `<div class="card jinro"><div class="card-head"><h3>진로설계 자료 <small>불러오면 여기에 표시됩니다</small></h3></div>
    <p class="help">STEP 01에서 학생을 불러오면 편제·선택 과목, 교과 성적, 학생부 자동 진단 근거가 이 자리에 나옵니다.</p></div>`;
  const g = J.summary;
  const sub = J.school ? (J.school.subjects || []) : [];
  const byCat = {}; sub.forEach(x => { byCat[x.category] = (byCat[x.category] || 0) + 1; });

  const axis = name => {
    const a = (J.diag && (J.diag.axes || []).find(x => String(x.key).includes(name))) || null;
    if (!a) return '<p class="empty">연결된 설계에 자동 진단 결과가 없습니다. 진로설계 보드 STEP 3에서 생기부를 넣고 진단을 실행하세요.</p>';
    const ev = (a.ev || []).slice(0, 6).map(t => `<li>${esc(t)}</li>`).join('');
    const gap = (a.gap || []).slice(0, 4).map(t => `<li>${esc(t)}</li>`).join('');
    return `<p class="help">자동 판정 <b>${esc(a.level || '-')}</b></p>`
      + (ev ? `<p class="help">기록에서 찾은 근거</p><ul>${ev}</ul>` : '<p class="empty">근거 문장을 찾지 못했습니다.</p>')
      + (gap ? `<p class="help">비어 보이는 부분</p><ul>${gap}</ul>` : '');
  };

  return `<div class="card jinro"><div class="card-head"><h3>교육편제 · 선택 과목 <small>진로설계 보드에서 자동</small></h3></div>
      ${J.school ? `<p class="help"><b>${esc(J.school.name)}</b> · 개설 ${sub.length}과목
        (${esc(Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(' · '))})</p>` : '<p class="empty">학교 편제를 불러오지 못했습니다.</p>'}
      ${J.program ? `<p class="help">희망 <b>${esc(J.program.name)}</b> · 핵심 ${(J.program.core || []).length}과목 / 권장 ${(J.program.recommended || []).length}과목</p>` : ''}
      <p class="help">아래 <b>교육편제·과목 선택에 대한 기록</b> 칸에 선택의 이유와 맥락을 쓰세요.</p></div>

    <div class="card jinro"><div class="card-head"><h3>학업 역량 — 불러온 성적 <small>국·수·영·사·과</small></h3></div>
      ${g ? `<p class="help">${esc(gradeLine(g))}</p>
        <table class="kvs"><tbody>${['국어','수학','영어','사회','과학'].map(a => {
          const b = g.byArea[a];
          return `<tr><th>${a}</th><td>평균 ${f2(b.rank)}등급 · 원점수 ${f2(b.raw)} · ${b.credits}단위 · ${b.subjects}과목</td></tr>`;
        }).join('')}</tbody></table>`
        : '<p class="empty">불러온 성적이 없습니다.</p>'}
      <p class="help">아래 <b>학업 역량 근거</b> 칸에 이 숫자를 어떻게 읽었는지 쓰세요.</p></div>

    <div class="card jinro"><div class="card-head"><h3>진로·전공 탐색 — 생기부에서 찾은 근거 <small>키워드 기반 · 사람의 판단이 아닙니다</small></h3></div>
      ${axis('진로')}<p class="help">아래 <b>진로·전공 탐색 근거</b> 칸에 상담자의 평가를 쓰세요.</p></div>

    <div class="card jinro"><div class="card-head"><h3>공동체 역량 — 생기부에서 찾은 근거 <small>키워드 기반</small></h3></div>
      ${axis('공동체')}<p class="help">아래 <b>공동체 역량 근거</b> 칸에 상담자의 평가를 쓰세요.</p></div>`;
}

function missing() {
  const list = [];
  steps.forEach((s, i) => s.fields.filter(x => x.required && !filled(data.values[x.id])).forEach(x => list.push({ step: i, label: x.label })));
  data.risks.forEach((r, i) => riskFields.filter(x => x.required && !filled(r[x.id])).forEach(x => list.push({ step: 3, label: `확인사항 ${i + 1} · ${x.label}` })));
  return list;
}
function warnings() {
  const a = [];
  data.risks.filter(r => r.status !== '해결').forEach(r => a.push({ step: 3, label: `${r.title || '제목 없는 리스크'} · ${r.severity || '중요도 미정'}` }));
  const g = J.summary;
  if (g && g.spread != null && g.spread >= 2) a.push({ step: 1, label: `교과 간 격차 ${g.spread}등급 — ${g.weak.join('·')} 보완 필요` });
  if (g && !filled(data.values.academicJudgment)) a.push({ step: 1, label: '성적은 불러왔으나 교과 경쟁력 판단 미작성' });
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
  /* 불러온 '사실' 카드는 입력 칸 위(extrasTop)에, 반복 항목은 아래(extras)에 둔다 */
  let top = '', extra = '';
  if (current === 0) top = jinroImportCard();
  if (current === 1) top = jinroGradeCard();
  if (current === 2) top = jinroRecordCards();
  if (current === 3) {
    extra = data.risks.map((r, i) => `<div class="card"><div class="card-head"><h3>확인사항 ${i + 1}</h3><button class="remove" data-remove="risks.${i}">삭제</button></div><div class="fields">${riskFields.map(x => fieldHTML(x, r[x.id] || '', `risks.${i}.${x.id}`)).join('')}</div></div>`).join('')
      + '<button class="add" data-add="risks">+ 리스크 / 확인사항 추가</button>';
  }
  $('#extrasTop').innerHTML = top;
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
/* select는 input이 아니라 change로 온다 */
document.addEventListener('change', e => {
  if (!e.target.dataset.jinroPick) return;
  const key = e.target.value;
  if (!key) { J.picked = ''; J.note = ''; J.summary = null; render(); return; }
  applyJinro(key).catch(err => toast(err.message));
});
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
    if (i === 1 && J.summary) body += `<dt>불러온 교과 성적</dt><dd>${esc(gradeLine(J.summary))}</dd>`;
    if (i === 3) body += data.risks.map((r, j) => `<h3>확인사항 ${j + 1}</h3>${riskFields.map(x => `<dt>${x.label}</dt><dd>${esc(r[x.id] || '미작성')}</dd>`).join('')}`).join('') || '<p>등록 없음</p>';
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
    initJinro().then(() => {
      const jk = new URLSearchParams(location.search).get('jinro');
      if (jk && jinroProfile(jk)) applyJinro(jk).catch(err => toast(err.message));
    });
  } catch (err) {
    $('#accountBar').textContent = '저장 공간을 열지 못했습니다: ' + err.message;
    toast(err.message);
  }
  updateList();
})();
