// 배포 설정. 2단계 전환 시 storage 값을 'supabase'로 바꾸고 supabase 항목을 채운다.
export const CONFIG = {
  storage: 'local',            // 'local' = 이 브라우저에 저장(1단계) / 'supabase' = 계정별 서버 저장(2단계)
  editionTitle: '전문가 과정 1기',
  studentLimit: 99,            // 1인당 저장 학생 수
  supabase: { url: '', anonKey: '' } // 2단계에서 입력 (anon key는 공개용 키이며, 보안은 DB 권한 규칙(RLS)이 담당)
};
