// 2단계 저장소(예정): Supabase 로그인 + 계정별 서버 저장 + 기수별 배부.
// local.js와 같은 메서드(init/list/create/update/remove)를 구현하면 화면 코드는 그대로 동작한다.
// 테이블·권한 설계는 docs/supabase-plan.md 참고.
export function createSupabaseStorage() {
  const notReady = async () => { throw Error('서버 저장은 2단계에서 제공됩니다. config.js의 storage를 local로 두세요.'); };
  return { kind: 'supabase', init: notReady, list: notReady, create: notReady, update: notReady, remove: notReady };
}
