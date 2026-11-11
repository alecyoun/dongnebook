# 동네북 데모 (Cloudflare 버전)

책 『AI로 개발하기』에서 만든 동네북을 Cloudflare에 올린 데모 소스입니다. 완성된 모습은 https://dongne.technote.wiki 에서 볼 수 있습니다.

책에서는 Node.js(Express) 서버와 SQLite로 만들고 클라우드 서버(Lightsail)에 배포했습니다. 이 폴더는 같은 기능을 Cloudflare Workers로 옮긴 것입니다. 주소와 응답 모양은 책의 서버와 같게 두었습니다.

| 책의 예제 | 이 데모 |
|---|---|
| Express 서버(`server.js`) | Worker(`src/worker.js`) |
| SQLite 파일 | D1(`schema.sql`, `seed.sql`) |
| `uploads` 폴더 | R2(사진 저장소) |
| `public` 화면 파일 | `public` (그대로 사용) |

## 데모라서 다른 점
- 회원 가입 대신 체험용 계정(역삼이웃·삼성이웃·대치이웃, 비밀번호 `demo1234`)으로 로그인합니다.
- AI 기능(사진으로 판매글 초안 만들기, 동네북 도우미)은 사이트 전체 하루 100번, 한 사람당 하루 5번까지만 쓸 수 있습니다.
- 매일 새벽 4시(한국 시간)에 처음 상태로 되돌리고, 방문자가 올린 사진을 지웁니다.
- 끌어올리기 결제는 토스페이먼츠 테스트 결제입니다. 실제로 돈이 나가지 않습니다.
- 소셜 로그인과 판매자 문의는 동작하지 않습니다.

## 직접 올려 보기
1. Cloudflare 계정에서 D1 데이터베이스와 R2 버킷을 만들고, `wrangler.jsonc`의 `database_id`, `bucket_name`, 도메인(`routes`)을 내 것으로 바꿉니다.
2. 처음 상태를 만듭니다: `node scripts/build-seed.mjs` → `npx wrangler d1 execute dongnebook-demo --remote --file schema.sql` → `--file seed.sql`
3. 비밀값 4개를 등록합니다. 값은 코드나 저장소에 넣지 않습니다.
   - `OPENAI_API_KEY`: OpenAI API 키
   - `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`: 토스페이먼츠 테스트 키
   - `SESSION_SECRET`: 로그인 쿠키 서명용 임의의 긴 문자열
   - 예: `npx wrangler secret put OPENAI_API_KEY`
4. `npx wrangler deploy`

내 컴퓨터에서 실행하려면 같은 4개 값을 `.dev.vars` 파일에 `이름=값` 형식으로 적고(`.gitignore`에 들어 있어 GitHub에 올라가지 않습니다) `npx wrangler dev`를 실행합니다.
