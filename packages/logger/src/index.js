import pino from "pino";

export function createLogger(options = {}) {
  return pino({
    level: process.env.LOG_LEVEL || "info",
    base: { service: options.service || "the-unpirator" },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "password",
        "secret",
        "token",
        "providerConfig",
      ],
      censor: "[REDACTED]",
    },
  });
}
