import { z } from "zod";

export const idSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const emailSchema = z
  .string()
  .email()
  .max(320)
  .transform((v) => v.toLowerCase());
export const passwordSchema = z
  .string()
  .min(12)
  .max(256)
  .regex(/[a-z]/, "Password needs a lowercase letter")
  .regex(/[A-Z]/, "Password needs an uppercase letter")
  .regex(/[0-9]/, "Password needs a number");
export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(253)
  .regex(
    /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    "Enter a hostname without a protocol or path",
  );

export const registerSchema = z
  .object({
    tenantName: z.string().min(2).max(120),
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();
export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(10).max(256) })
  .strict();
export const siteCreateSchema = z
  .object({
    name: z.string().min(2).max(120),
    domain: domainSchema,
    allowedDomains: z.array(domainSchema).max(20).default([]),
  })
  .strict();
export const assetCreateSchema = z
  .object({
    siteId: idSchema,
    title: z.string().min(1).max(240),
    provider: z.enum(["r2", "s3", "bunny", "direct", "hls", "youtube_custom"]),
    providerReference: z.string().min(1).max(2048),
    allowedHosts: z.array(domainSchema).min(1).max(20),
    providerConfig: z.record(z.string(), z.unknown()).default({}),
    connectionId: idSchema.optional().nullable(),
    securityPolicy: z.enum(["standard", "strict", "maximum"]).default("strict"),
  })
  .strict();
const clientMetadataSchema = z
  .string()
  .max(2048)
  .transform((value) => value.trim().slice(0, 100));
export const playbackSessionSchema = z
  .object({
    siteId: idSchema,
    assetId: idSchema.optional(),
    source: z
      .object({
        provider: z.literal("youtube_custom"),
        url: z.string().url().max(2048),
        title: z.string().trim().min(1).max(240).optional(),
      })
      .strict()
      .optional(),
    externalUserId: z.string().min(1).max(180),
    deviceId: z.string().min(8).max(180),
    displayLabel: z.string().max(180).optional(),
    client: z
      .object({
        browser: clientMetadataSchema.optional(),
        os: clientMetadataSchema.optional(),
        deviceName: clientMetadataSchema.optional(),
      })
      .default({}),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Boolean(value.assetId) === Boolean(value.source)) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either assetId or source",
        path: ["assetId"],
      });
    }
  });
export const heartbeatSchema = z
  .object({
    sessionId: idSchema,
    positionSeconds: z
      .number()
      .min(0)
      .max(60 * 60 * 24)
      .optional(),
  })
  .strict();
export const webhookCreateSchema = z
  .object({ url: z.string().url(), events: z.array(z.string().min(3).max(80)).min(1).max(50) })
  .strict();

export function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const error = new Error("Validation failed");
    error.code = "VALIDATION_ERROR";
    error.status = 400;
    error.details = result.error.flatten();
    throw error;
  }
  return result.data;
}
