import { randomUUID } from "node:crypto";
export function requestContext(logger) {
  return (req, res, next) => {
    req.id = req.get("x-request-id") || randomUUID();
    res.setHeader("x-request-id", req.id);
    req.log = logger.child({ requestId: req.id });
    const started = performance.now();
    res.on("finish", () =>
      req.log.info(
        {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Math.round(performance.now() - started),
        },
        "request complete",
      ),
    );
    next();
  };
}
