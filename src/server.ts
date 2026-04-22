/**
 * [파일 목적]
 * 이 파일은 chatgpt-codex-proxy의 Express 앱을 구성한다.
 * 공통 미들웨어, 요청 로깅, 라우터, 에러 핸들러를 연결하는 HTTP 조립 계층이다.
 *
 * [주요 흐름]
 * 1. CORS와 JSON body parser를 등록한다.
 * 2. 요청/응답 로그를 남기는 공통 미들웨어를 적용한다.
 * 3. messages 라우터를 연결한다.
 * 4. notFound/error handler를 마지막에 붙인다.
 *
 * [외부 연결]
 * - ./routes/messages.ts: 핵심 API 라우트
 * - ./utils/errors.ts: 404/에러 응답 처리
 *
 * [수정시 주의]
 * - 미들웨어 순서를 바꾸면 body parsing, 라우팅, 에러 처리 결과가 달라진다.
 * - JSON limit 변경은 이미지 포함 요청 허용 범위에 직접 영향이 있다.
 */
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import messagesRouter from "./routes/messages.js";
import { errorHandler, notFoundHandler } from "./utils/errors.js";
import { redactSecrets } from "./utils/sanitize.js";

const app = express();
const jsonBodyLimit = process.env.PROXY_JSON_LIMIT ?? "20mb";

app.use(cors());
app.use(express.json({ limit: jsonBodyLimit }));

app.use((req: Request, _res: Response, next: NextFunction) => {
  const startedAt = Date.now();
  const safeUrl = redactSecrets(req.originalUrl);
  // eslint-disable-next-line no-console
  console.log(`[REQ] ${req.method} ${safeUrl} - ${new Date().toISOString()}`);

  _res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    // eslint-disable-next-line no-console
    console.log(`[RES] ${req.method} ${safeUrl} ${_res.statusCode} - ${durationMs}ms`);
  });

  next();
});

app.use(messagesRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
