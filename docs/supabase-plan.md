# 2단계: Supabase 전환 계획

## 목표
- 교육생별 로그인, 계정별 학생 기록 서버 저장
- 강사가 기수(edition)별 교육생 기록 열람·피드백
- 기수별 배부 링크와 1인당 저장 한도

## 테이블 (초안)

| 테이블 | 주요 컬럼 |
|---|---|
| `editions` | `id`, `title`, `student_limit`, `owner_id`, `created_at` |
| `edition_members` | `edition_id`, `user_id`, `role`(`instructor` / `trainee`) |
| `students` | `id`, `edition_id`, `user_id`, `number`, `record`(jsonb), `revision`, `updated_at` |
| `analyses` | 대학 분석 보드 — `students`와 같은 구조 (`record`는 `js/univ-schema.js` 형식) |
| `gyogwa` | 교과 지원판단 — 같은 구조, `record.student.number`로 `students` 참조 |
| `answer_keys` | (예정) 강사 정답 키 — `edition_id`, `university`, `year`, `key`(jsonb) |

- `record`에는 `js/schema.js`의 기록 구조를 그대로 저장한다 (`version` 포함).
- (`edition_id`, `user_id`, `number`) 유니크.

## 권한 규칙 (RLS)
- 교육생: 자기 `user_id`의 `students`만 읽기·쓰기
- 강사: 자기 기수의 `students` 읽기 + 피드백(`record.feedback.coach`) 쓰기
- 저장 한도는 DB 함수 또는 트리거로 검사

## 전환 절차
1. Supabase 프로젝트 생성, 위 테이블·RLS 적용
2. `js/storage/supabase.js`에 `init / list / create / update / remove` 구현 (낙관적 잠금: `revision`)
3. 로그인 화면·배부 관리 화면 추가
4. `config.js`에서 `storage: 'supabase'`와 URL·anon key 입력
5. 첫 로그인 시 브라우저(localStorage)에 남은 기록을 감지해 "내 계정으로 옮기기" 제안
