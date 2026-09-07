export function notFoundHandler(req, res) {
  res
    .status(404)
    .json({ error: { code: "NOT_FOUND", message: "Route not found", requestId: req.id } });
}
export function errorHandler(error, req, res, _next) {
  req.log?.error({ err: error, code: error.code }, "request failed");
  const status = Number(error.status || 500);
  res.status(status).json({
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: status >= 500 ? "Internal server error" : error.message,
      requestId: req.id,
      ...(status < 500 && error.details ? { details: error.details } : {}),
    },
  });
}
