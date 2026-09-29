// 학생부 원문 입력 모듈.
// 지금은 "붙여넣기"만 제공하고, PDF·사진은 같은 모양의 어댑터로 나중에 붙인다.
// 모든 어댑터는 파일 → 텍스트(string)를 돌려주고, 이후 과정(마스킹 → 영역 분리 → 섹션)은 공통이다.

/* ---------- 식별정보 마스킹 (jinro-dash assets/js/record.js와 같은 규칙) ---------- */
const MASKS = [
  [/\b\d{6}\s*[-–]\s*\d{7}\b/g, '[주민등록번호 삭제]'],
  [/\b01[0-9]\s*[-–.\s]?\s*\d{3,4}\s*[-–.\s]?\s*\d{4}\b/g, '[전화번호 삭제]'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, '[이메일 삭제]'],
  [/(성\s*명|이\s*름)\s*[:：]\s*\S{2,5}/g, '$1: [삭제]'],
  [/(학\s*번)\s*[:：]?\s*\d{4,}/g, '$1: [삭제]'],
  [/\b\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일\s*생\b/g, '[생년월일 삭제]']
];
export function mask(text) { let t = String(text || ''); MASKS.forEach(([re, to]) => { t = t.replace(re, to); }); return t; }

/* ---------- 영역 ---------- */
export const AREAS = ['자율', '동아리', '진로', '세특', '개인별세특', '독서', '행특', '기타'];
export const AREA_LABEL = { 자율: '자율활동', 동아리: '동아리활동', 진로: '진로활동', 세특: '교과 세특', 개인별세특: '개인별 세특', 독서: '독서활동', 행특: '행동특성 및 종합의견', 기타: '기타' };
const HEAD = [
  ['자율', /자율\s*활동/], ['동아리', /동아리\s*활동/], ['진로', /진로\s*활동/], ['개인별세특', /개인별\s*세부/],
  ['세특', /세부\s*능력\s*(및|,)?\s*특기\s*사항|교과\s*세특/], ['독서', /독서\s*활동/], ['행특', /행동\s*특성\s*(및|,)?\s*종합\s*의견|행특/]
];

// 한 학년 분량의 텍스트를 영역·과목별 섹션으로 나눈다. 제목 줄(짧은 줄)과 「과목」·(과목)·과목: 형태를 인식.
export function splitText(text, year) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out = []; let cur = null;
  const push = (area, subject = '') => { cur = { year, area, subject, text: '' }; out.push(cur); };
  for (const line of lines) {
    if (line.length <= 30) { const h = HEAD.find(([, re]) => re.test(line)); if (h) { push(h[0]); continue; } }
    const m = line.match(/^[「<\[(＜【]\s*([^」>\])＞】]{2,24})\s*[」>\])＞】]\s*[:：]?\s*(.*)$/) || line.match(/^([가-힣A-Za-zⅠⅡⅢ0-9·\s]{2,20})\s*[:：]\s*(.+)$/);
    if (m && (!cur || cur.area === '세특' || cur.area === '개인별세특' || cur.area === '기타')) { push(cur?.area === '개인별세특' ? '개인별세특' : '세특', m[1].trim()); if (m[2]) cur.text = m[2]; continue; }
    if (!cur) push('기타');
    cur.text += (cur.text ? ' ' : '') + line;
  }
  return out.filter(s => s.text.trim());
}

/* ---------- 입력 어댑터 ---------- */
// ready=false인 어댑터는 화면에 "준비 중"으로만 표시된다. 구현 시 read(file) → Promise<string> 을 채우고 ready=true로 바꾼다.
export const ADAPTERS = {
  paste: { label: '붙여넣기', ready: true },
  pdf: {
    label: 'PDF', ready: false, accept: '.pdf,application/pdf',
    // 예정: pdf.js(CDN)로 페이지별 텍스트 추출 → NEIS 표 구조 보정 (naeshin-dashboard lib/extract.ts, jinro-dash record.js 참고)
    async read() { throw Error('PDF 읽기는 준비 중입니다. 지금은 내용을 복사해 붙여넣어 주세요.'); }
  },
  image: {
    label: '사진', ready: false, accept: 'image/*',
    // 예정: tesseract.js(CDN, kor) OCR → 줄 정리. 인식 결과는 반드시 교육생이 원문과 대조 후 확정.
    async read() { throw Error('사진 인식은 준비 중입니다. 지금은 내용을 복사해 붙여넣어 주세요.'); }
  }
};
export async function readFile(kind, file) {
  const a = ADAPTERS[kind]; if (!a?.ready) throw Error(`${a?.label || kind} 입력은 준비 중입니다.`);
  return mask(await a.read(file));
}
