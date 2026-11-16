# 토스페이먼츠 개발 설정

## 1단계: 개인 로컬 환경

Node.js 24와 기존 pnpm 및 pnpm-lock.yaml을 사용합니다. 설치는 pnpm install --frozen-lockfile로 진행하세요. 다른 잠금 파일을 추가하지 마세요.

프로젝트 루트의 개인 .env.local에 다음 항목을 설정합니다. 기존 파일의 다른 값은 보존하고 .env.example은 빈 값/기본 비활성화 상태로 유지하세요.

- NEXT_PUBLIC_API_BASE_URL: 로컬 백엔드 주소(http://localhost:8080).
- NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY: 개발자센터 상단 ‘주문서형·결제창형 연동 키’의 테스트 클라이언트 키(test_gck_ 접두어). 각자 로컬에 입력합니다.
- TOSS_PAYMENTS_DEV_ORDERS_ENABLED: 기본 false. 3단계 개발 주문 확인 시에만 true로 설정합니다. NEXT_PUBLIC 접두어가 없는 서버 전용 플래그입니다.

클라이언트 키와 백엔드 시크릿 키는 같은 상단 테스트 키 쌍을 사용해야 합니다. API 개별 연동 키·운영 키와 섞지 마세요. 시크릿 키를 프론트 환경변수·코드·화면·로그에 넣지 마세요. 실제 키나 공식 예제용 키 값을 문서/코드에 하드코딩하지 마세요.

키/플래그 변경 후 실행 중인 해당 프로젝트 개발 서버만 종료하고 pnpm local로 다시 실행합니다. 이미 3000 서버가 있으면 중복 실행하지 말고 해당 프로젝트 프로세스인지 먼저 확인하세요. .env.local은 Git 제외 대상이며 추적하지 않습니다.

기존 dev/build/start 스크립트는 POSIX 셸 문법입니다. Windows에서 명령 호환 문제가 있다면 개발 서버는 pnpm local을 사용하고, 빌드는 Git Bash 또는 프로세스 한정 script-shell 설정으로 실행하세요. 다른 팀원의 공통 스크립트를 이 결제 변경에서 교체하지 않았습니다.

이 단계는 환경 준비이며 SDK/API 인증·결제 성공 검증이 아닙니다.

공식 문서: https://docs.tosspayments.com/sdk/v2/js/payment-widget

## 2단계: SDK 초기화 확인

공식 @tosspayments/tosspayments-sdk 2.10.0을 사용합니다. pnpm install --frozen-lockfile 후 pnpm local로 실행하고 http://localhost:3000/dev/toss-sdk에 접속하세요. 키 변경 시 서버를 재시작합니다.

브라우저에서 공개 환경변수로 loadTossPayments()를 호출하고 SDK의 ANONYMOUS 식별값으로 widgets()를 생성합니다. 초기화 중/성공/실패와 재시도만 표시합니다. 클라이언트 전용 실행, 테스트 키 형식, 20초 제한, 공유 Promise로 Strict Mode 중복 초기화 방지, 실패 시 캐시 초기화, 언마운트 후 상태 갱신 차단을 처리합니다.

운영 빌드에서는 확인 페이지가 404를 반환합니다. 테스트는 pnpm run test:payments-sdk, 타입 검사는 pnpm exec tsc --noEmit, 빌드는 pnpm build입니다. 현재 lint 스크립트는 없습니다. SDK 단위 테스트는 실제 키 없이 fixture_only 문자열과 가짜 SDK로 실행하며 네트워크/API 인증을 검증하지 않습니다. SDK 로드·비회원 인스턴스 생성 성공도 실제 API 인증·결제 성공을 뜻하지 않습니다.

결제 금액 설정·결제 UI·결제 요청은 이 단계에 포함하지 않습니다.
