import { z } from "zod";

const boolString = z
  .string()
  .optional()
  .transform((v) => v === "true");
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
    API_PUBLIC_URL: z.string().url().default("http://localhost:4100"),
    DASHBOARD_URL: z.string().url().default("http://localhost:3100"),
    COOKIE_DOMAIN: z.string().optional(),
    SESSION_COOKIE_NAME: z.string().default("unpirator_session"),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(24),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().optional(),
    UPSTASH_REDIS_REST_URL: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.string().url().optional(),
    ),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    APP_ENCRYPTION_KEY_BASE64: z.string().min(40),
    SIGNING_KEYS_B64: z.string().min(20),
    ACTIVE_SIGNING_KID: z.string().min(3),
    GATEWAY_PUBLIC_URL: z.string().url().default("http://localhost:8787"),
    GATEWAY_CONTROL_URL: z.string().url().default("http://localhost:8787"),
    GATEWAY_CONTROL_SECRET: z.string().min(16),
    GATEWAY_INTERNAL_SECRET: z.string().min(16),
    YOUTUBE_CUSTOM_GLOBAL: boolString,
    LOG_LEVEL: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.NODE_ENV === "production" &&
      !value.REDIS_URL &&
      !(value.UPSTASH_REDIS_REST_URL && value.UPSTASH_REDIS_REST_TOKEN)
    )
      ctx.addIssue({
        code: "custom",
        message: "Production requires REDIS_URL or Upstash REST credentials",
        path: ["REDIS_URL"],
      });
  });

export function loadConfig(env = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    console.error("Invalid environment configuration", result.error.flatten().fieldErrors);
    throw new Error("Environment validation failed");
  }
  return result.data;
}
