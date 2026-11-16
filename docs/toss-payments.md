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

## 3단계: 테스트 주문과 결제금액 준비

개인 .env.local의 TOSS_PAYMENTS_DEV_ORDERS_ENABLED=true로 설정하고 해당 개발 서버를 재시작합니다. 백엔드에도 같은 플래그 true와 local 프로필이 필요합니다. 기존 활성 프로필을 덮어쓰지 말고 백엔드 안내를 따르세요.

http://localhost:3000/dev/toss-order에 접속 → SDK 초기화 성공 → ‘테스트 주문 생성 및 금액 설정’ 클릭 → 서버 주문번호·상품명·10,000 KRW·PENDING 및 ‘테스트 주문 조회 및 위젯 금액 설정 완료’ 표시를 확인하세요.

페이지는 NODE_ENV=development와 서버 전용 활성화 플래그 true를 모두 요구합니다. 비활성화/운영 빌드에서는 404입니다. 기존 /dev/toss-sdk 경로는 유지합니다.

POST /api/dev/toss-orders(본문 없음,201)로 생성한 뒤 GET /api/dev/toss-orders/{orderId}(200)로 조회하고 응답 전체가 일치하는지 검사합니다. 서버 금액만 widgets.setAmount({currency:'KRW',value:amount})에 전달합니다. 브라우저 임의 금액을 서버에 보내지 않습니다.

생성/조회/응답 검증/SDK 금액 설정 중 하나라도 실패하면 준비 완료로 표시하지 않습니다. 즉시 클릭 잠금,20초 제한,네트워크 오류,언마운트 취소,공유 위젯 금액 변경 직렬화를 처리합니다. SDK가 응답하지 않으면 후속 금액 변경도 대기하며 완료로 처리하지 않습니다.

테스트 주문은 메모리 최대1000건·30분 만료이며 서버 재시작 시 사라집니다. 실제 주문·회원 인증과 연결하지 않습니다. src/features/payments/dev-test-orders.ts가 향후 실제 주문 API로 교체할 테스트 전용 연결 지점입니다. 기존 장바구니/실제 주문 API는 수정하지 않았습니다.

원격 초기 공통 apiRequest에는 상태 코드 확인 옵션이 없으므로 선택적 expectedStatus만 추가했습니다. 기존 호출에는 영향이 없으며 회원 전용 오류 처리는 포함하지 않았습니다.

검증 명령은 pnpm run test:payments-sdk(초기화7+주문준비7), pnpm exec tsc --noEmit, pnpm build입니다. 실제 키 없는 환경에서 테스트와 운영 빌드를 진행하세요. 테스트/운영 브랜치 검증과 원본 로컬 브라우저 확인 결과를 구분해야 합니다.



## 4·5단계: 공식 UI와 결제 요청·구매자 인증

기존 개발 주문과 공식 renderPaymentMethods/renderAgreement UI를 유지하고 테스트 결제하기 버튼을 연결했습니다. UI 렌더 완료 전에는 요청할 수 없습니다. 서버 GET으로 저장된 주문을 결제 직전에 다시 확인하고 주문번호·상품명·KRW 금액·PENDING을 비교합니다. 15초 조회 제한, 즉시 중복 잠금, 요청 중 주문 재생성 차단, 오류·취소 재시도를 처리합니다. SDK 자체가 진행 중일 때 임의 타임아웃으로 잠금을 해제하지 않습니다.

requestPayment에는 SDK가 지원하는 orderId/orderName/successUrl/failUrl을 전달합니다. 금액은 3단계 setAmount의 서버 금액을 사용합니다. getSelectedPaymentMethod는 이번 흐름에 필요하지 않아 호출하지 않습니다. 공식 SDK가 선택된 결제수단과 약관 검사를 처리하며 카드사·앱 인증 UI를 직접 만들지 않았습니다.

결과 경로는 /dev/toss-order/success와 /dev/toss-order/fail입니다. 두 경로도 개발 모드와 명시적 활성화를 요구합니다. 성공 URL은 요청 직전 sessionStorage에 저장한 주문과 orderId/amount/paymentKey 필수값을 검사하고 서버 주문을 재조회합니다. paymentKey는 로그·저장소·화면에 기록하지 않습니다. URL만으로 토스 인증의 진위를 확정할 수 없으며 최종 승인/결제완료 처리는 하지 않습니다. 실패 코드는 제한된 형식만 표시하고 제공자의 원문 메시지는 출력하지 않습니다.

기존 테스트 키 검사(test_gck_)를 요청 전에도 반복합니다. 테스트 주문은 서버 메모리 저장(최대1000건/30분)이며 실제 DB 주문이 아닙니다. 실제 주문으로 교체할 때는 dev-test-orders.ts의 연결과 서버 주문 검증을 함께 교체해야 합니다. /checkout과 회원·로그인 코드는 변경하지 않았습니다.

### 검증과 수동 확인

- pnpm run test:payments-sdk: 기존20 + 신규9 = 29개 통과.
- node node_modules/typescript/bin/tsc --noEmit: 통과.
- Windows에서 기존 POSIX build 스크립트와 동등하게 NODE_OPTIONS=--no-deprecation을 프로세스에 설정하고 node node_modules/next/dist/bin/next build: 통과. 기존 Google Fonts 다운로드를 위한 네트워크 접근이 필요했습니다.
- 백엔드 기존 결제 설정·개발 주문 테스트22개와 Gradle build 통과. 전체 애플리케이션 MySQL 테스트는 실행하지 않았습니다.

실제 인증 확인: 이 작업 공간을 테스트 키 및 TOSS_PAYMENTS_DEV_ORDERS_ENABLED=true로 localhost:3000에 실행하고, 기존 개발 주문 백엔드(local 프로필+활성화)를 사용하세요. 기존 서버를 임의 종료하지 말고 포트 전환은 사용자가 결정해야 합니다. 개인 .env.local/키는 작업 공간에 복사하거나 커밋하지 않았습니다. 테스트 공개 클라이언트 키는 별도 미리보기 프로세스의 환경변수로만 전달했습니다.

1. /dev/toss-order 접속 → 테스트 주문 준비 → 공식 결제수단·약관 표시.
2. 필수 약관 확인 → 테스트 결제하기 → 공식 결제창/구매자 인증에서 사용자 조작.
3. 성공 시 /dev/toss-order/success에서 서버 주문 일치와 최종 승인 미실행 문구 확인.
4. 취소 시 현재 화면 안내 또는 SDK 동작에 따른 실패 URL 이동 확인. 취소가 항상 failUrl로 이동한다고 가정하지 않습니다.
5. 실패 경로, 연속 클릭, 주문 만료 후 요청 거부를 확인합니다.

별도 포트3001 미리보기에서는 SDK 초기화, 주문 준비 오류 안내, fail?code=USER_CANCEL 표시, 필수값 없는 success 거부를 브라우저로 확인했습니다. 기존 백엔드 CORS가 localhost:3000만 허용하므로3001에서 정상 주문 준비·공식 결제 인증까지 검증하지 않았습니다. 실제 카드사/휴대폰/앱 인증, 성공 리다이렉트, 결제수단별 실패 리다이렉트와 실청구 없음은 사용자 확인이 남아 있습니다. 합성 URL 확인은 실제 토스 인증 성공을 의미하지 않습니다.

최종 승인 API, 결제 DB 저장, 취소 API, 웹훅은 이번 단계에 포함하지 않습니다. Git commit/push/merge/PR을 수행하지 않았습니다.


## 6단계: 결과 검증·오류 분류·승인 연결 준비

기존 /dev/toss-order/success 및 /dev/toss-order/fail과 공통 결과 화면을 재사용합니다. /payment/* 신규 경로는 만들지 않습니다.

성공값은 누락/중복/공백/제어문자·paymentKey 길이, 양의 안전 정수 amount, 요청 당시 sessionStorage 주문과의 일치를 검사합니다. 기존 readSuccess 표시 계약은 paymentKey를 반환하지 않으며, validateSuccess에서만 향후 승인 요청용 paymentKey/orderId/amount 자료형을 준비합니다. 실제 승인 커넥터·URL·API 호출은 없습니다. 승인 중/실패 상태 문구는 7번 연결을 위한 예약 상태이며 현재 실행 경로에서 가짜로 표시하지 않습니다.

결과 처리 흐름은 서버 주문 GET을 재사용하고 주문번호/상품명/금액/통화/PENDING을 비교합니다. 검증 실패, 주문 없음/만료, 불일치, 네트워크/시간초과, 서버 오류를 구분합니다. 정상 비교 후에도 승인 API 미연결·승인 미실행·결제 완료 아님을 표시합니다. 결제 완료 상태는 없습니다.

동일 주문의 진행 중인 조회는 공유해 Strict Mode/중복 마운트 요청을 줄입니다. 구독 화면이 사라져도 다른 구독자의 공유 조회를 중단하지 않으며, 화면에는 늦은 결과를 반영하지 않습니다. 조회는15초 제한입니다. 새로고침은 서버 주문을 다시 검증하고 이전 검토 마커를 결제 완료로 신뢰하지 않습니다. 검토 마커에는 주문번호/승인 API 대기 상태만 기록하고 paymentKey는 기록하지 않습니다. 이것은 서버 멱등성 구현이 아닙니다.

실패는 사용자 취소/카드사 거절/일반 실패/시스템 오류로 분류합니다. 외부 message는 선택값이며 길이·중복·제어문자를 검사하고 화면에 원문을 출력하지 않습니다. 취소 결과에는 orderId가 없을 수 있어 선택값으로 처리합니다. 재시도는 기존 개발 결제 화면 링크를 사용합니다.

7번 이후: 실제 승인 URL·요청/응답 계약, 서버 측 멱등성, 승인 결과 재조회·저장·응답 검증, 실제 승인 성공/실패 테스트가 필요합니다. 프론트 잠금만으로 새로고침·다른 탭·다른 장치의 중복 승인을 막을 수는 없습니다. 실제 주문 API/표시는 후속 범위입니다.

이번 단계는 실제 인증·승인 요청, DB 변경, 회원/쇼핑몰 변경, Git commit/push/merge/PR 및 실행 중 서버 전환을 하지 않습니다. 6-1~6-18 원문은 현재 대화·첨부·프로젝트 문서에서 확인되지 않아, 사용자 메시지의14개 요구 항목을 기준으로 구현했습니다. 원문 번호별 완료 판정은 보류합니다.

## 6-8~6-11: 개발 승인 API 연결

기존 `/dev/toss-order/success`, `/dev/toss-order/fail`과 화면 구조를 유지합니다.
성공 URL 필수값과 sessionStorage의 요청 주문을 검증하고 서버 GET으로 주문번호·금액·상품명·KRW·PENDING을 대조한 뒤
POST `/api/payments/confirm`에 paymentKey/orderId/amount를 보냅니다. 실제 주문·회원·상품·장바구니 코드는 변경하지 않습니다.

- 결제 전용 클라이언트가 기존 NEXT_PUBLIC_API_BASE_URL과 credentials:include 규칙을 사용합니다.
- 공통 apiRequest/ApiRequestError는 변경하지 않습니다. 전용 어댑터가 HTTP200/202, 실제 응답 DTO 및 오류 코드를 검사합니다.
- 200 + DONE + completed=true, 주문번호/금액/KRW/승인일시/수단 일치일 때만 테스트 결제 완료로 표시합니다.
- 200 WAITING_FOR_DEPOSIT는 입금 대기이며 완료가 아닙니다. 현재 백엔드는 이 결과를 캐시하므로 재요청으로 입금 완료를 갱신할 수 없습니다.
- 202 CONFIRMING/UNKNOWN, 네트워크·타임아웃·잘못된 응답은 완료나 확정 실패로 간주하지 않습니다.
- 서버의 승인 대기 최대120초·연결5초를 고려해 승인 호출은135초 제한입니다. 주문 GET의15초 제한과 분리했습니다.
- Strict Mode/동시 구독자는 진행 중인 조회·승인을 공유합니다. 다른 결제키는 같은 결과를 공유하지 않습니다.
- 언마운트는 화면 갱신만 차단합니다. 공유 승인 요청을 취소하거나 결제 실패로 단정하지 않습니다.
- 미확정 상태는 자동 폴링하지 않습니다. 최소3초 후 '같은 요청 상태 다시 확인' 버튼으로 동일 세 값을 다시 보냅니다.
- 서버는 이미 시작한 요청을 재승인하지 않고 상태 조회/기존 결과로 처리합니다. 프론트 잠금이 서버 멱등성을 대신하지 않습니다.
- sessionStorage의 검토 마커에는 주문번호/금액/요청 시작 힌트만 저장하며 paymentKey·완료 상태는 저장하지 않습니다.
- 마커는 완료 판정에 사용하지 않습니다. 원래 개발 주문이 만료된 재시도에서 서버 승인 저장소에 상태 확인을 요청할 수 있게 하는 힌트일 뿐입니다.
- 콜백 필수값·요청 주문 검증과 서버의 최종 검증은 마커와 무관하게 유지됩니다.
- 오류는 실제 내부 code/providerCode의 허용 목록으로 분류하고 서버/제공자 원문 메시지는 표시하지 않습니다.

### 후속 실제 샌드박스 확인에 필요한 구성

프론트: NODE_ENV=development, 기존 테스트 공개 키, TOSS_PAYMENTS_DEV_ORDERS_ENABLED=true,
NEXT_PUBLIC_API_BASE_URL이 해당 백엔드를 가리키는 설정이 필요합니다.
백엔드: local 활성·prod/production 비활성, 기존 테스트 시크릿 키,
TOSS_PAYMENTS_DEV_ORDERS_ENABLED=true, TOSS_PAYMENTS_TEST_ENABLED=true,
TOSS_PAYMENTS_DEV_CONFIRM_ENABLED=true가 모두 필요합니다.
브라우저 Origin은 기존 cors.allowed-origin(현재 localhost:3000)과 같아야 하고 백엔드 연결은 루프백이어야 합니다.
프론트/서버 키는 같은 상점 테스트 키 쌍이어야 합니다. 시크릿 키를 프론트에 등록하지 않습니다.
이번 작업에서는 환경파일/실행 설정 변경, 서버 재시작, 실제 SDK 인증·토스 승인 요청을 하지 않습니다.

검증: `node scripts/test-payments-sdk.mjs`, `pnpm typecheck`, `pnpm build`.
자동화 테스트는 가짜 전송 함수로만 승인 응답을 검증하며 실제 결제 API를 호출하지 않습니다.
