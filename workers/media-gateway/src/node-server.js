import http from "node:http";
import { Readable } from "node:stream";
import gateway from "./index.js";
import { createNodeBindings } from "./node-bindings.js";

const port = Number(process.env.PORT || process.env.GATEWAY_PORT || 8787);
const required = [
  "INTERNAL_API_URL",
  "GATEWAY_INTERNAL_SECRET",
  "GATEWAY_CONTROL_SECRET",
  "PLAYBACK_PUBLIC_KEYS_B64",
];
const missing = required.filter((name) => !process.env[name]);
if (
  !process.env.REDIS_URL &&
  !(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
)
  missing.push("REDIS_URL or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN");
if (missing.length) throw new Error(`Missing gateway environment: ${missing.join(", ")}`);

const env = createNodeBindings();

function context() {
  return {
    waitUntil(promise) {
      Promise.resolve(promise).catch((error) =>
        console.error(
          JSON.stringify({ level: "error", component: "background", message: error.message }),
        ),
      );
    },
  };
}

async function toWebRequest(req) {
  const host = req.headers.host || `127.0.0.1:${port}`;
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const init = { method: req.method, headers: req.headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }
  return new Request(`${protocol}://${host}${req.url}`, init);
}

async function send(res, response) {
  res.statusCode = response.status;
  for (const [name, value] of response.headers) res.setHeader(name, value);
  if (!response.body) return res.end();
  Readable.fromWeb(response.body)
    .on("error", () => res.destroy())
    .pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    await send(res, await gateway.fetch(await toWebRequest(req), env, context()));
  } catch (error) {
    console.error(
      JSON.stringify({ level: "error", component: "node-server", message: error.message }),
    );
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: { code: "GATEWAY_ERROR", message: "Media gateway error" } }));
    } else res.destroy();
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ level: "info", service: "media-gateway", runtime: "node", port }));
});

for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
