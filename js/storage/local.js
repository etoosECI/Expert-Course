// 1단계 저장소: 이 브라우저의 localStorage에 보관한다.
// 모든 메서드는 Supabase 어댑터와 같은 모양(async)을 유지한다 → 2단계에서 화면 코드를 바꿀 필요가 없다.
const KEY = 'expertCourse.students.v1';
let memory = null; // localStorage를 쓸 수 없는 환경(사생활 보호 모드 등)용 임시 보관

function readAll() {
  if (memory) return memory;
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : []; }
  catch { memory = []; return memory; }
}
function writeAll(rows) {
  if (memory) { memory = rows; return; }
  try { localStorage.setItem(KEY, JSON.stringify(rows)); }
  catch (e) {
    if (e?.name === 'QuotaExceededError') throw Error('브라우저 저장 공간이 가득 찼습니다. 파일 백업 후 일부 학생을 삭제하세요.');
    memory = rows; throw Error('이 브라우저에서는 저장할 수 없습니다. 파일 백업을 이용하세요.');
  }
}
function persistent() {
  try { const t = '__ec_test__'; localStorage.setItem(t, '1'); localStorage.removeItem(t); return true; } catch { return false; }
}
const clone = o => JSON.parse(JSON.stringify(o));

export function createLocalStorage(config) {
  return {
    kind: 'local',
    async init() {
      const ok = persistent(); if (!ok) memory = [];
      return { title: config.editionTitle, studentLimit: config.studentLimit, isOwner: false, persistent: ok,
        label: ok ? '이 브라우저에만 저장' : '임시 저장(창을 닫으면 사라짐)' };
    },
    async list() { return clone(readAll()).sort((a, b) => a.number - b.number); },
    async create(record) {
      const rows = readAll();
      if (rows.length >= config.studentLimit) throw Error(`저장 한도 ${config.studentLimit}명에 도달했습니다.`);
      let number = 1; while (rows.some(r => r.number === number)) number++;
      const row = { number, revision: 1, updated: new Date().toISOString(), record: clone(record) };
      writeAll([...rows, row]); return { number, revision: row.revision };
    },
    async update(number, record, revision) {
      const rows = readAll(), i = rows.findIndex(r => r.number === number);
      if (i < 0) throw Error('저장된 학생을 찾을 수 없습니다. 목록을 갱신하세요.');
      if (rows[i].revision !== revision) throw Error('다른 탭에서 먼저 수정되었습니다. 목록을 갱신한 뒤 다시 저장하세요.');
      rows[i] = { ...rows[i], revision: revision + 1, updated: new Date().toISOString(), record: clone(record) };
      writeAll(rows); return { number, revision: rows[i].revision };
    },
    async remove(number, revision) {
      const rows = readAll(), row = rows.find(r => r.number === number);
      if (!row) return;
      if (row.revision !== revision) throw Error('다른 탭에서 수정된 기록입니다. 목록을 갱신하세요.');
      writeAll(rows.filter(r => r.number !== number));
    }
  };
}
