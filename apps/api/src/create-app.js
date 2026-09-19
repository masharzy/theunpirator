import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createDatabase } from "@unpirator/db";
import { createCache } from "@unpirator/cache";
import { createLogger } from "@unpirator/logger";
import { decodeKeyRing } from "@unpirator/crypto";
import { loadConfig } from "./config.js";
import { requestContext } from "./middleware/request-context.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import {
  dashboardAuth,
  csrfGuard,
  requireRecentMfa,
  requirePlatformPermission,
  requireTenantRole,
  requireVerifiedEmail,
} from "./middleware/auth.js";
import { apiKeyAuth } from "./middleware/api-key-auth.js";
import { createRateLimiter } from "./services/rate-limit.js";
import { createGatewayControl } from "./services/gateway-control.js";
import { createPlaybackService } from "./services/playback.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { sitesRouter } from "./routes/sites.js";
import { assetsRouter } from "./routes/assets.js";
import { apiKeysRouter } from "./routes/api-keys.js";
import { playbackRouter } from "./routes/playback.js";
import { securityConsoleRouter } from "./routes/security-console.js";
import { securityRouter } from "./routes/security.js";
import { viewersRouter } from "./routes/viewers.js";
import { usageRouter } from "./routes/usage.js";
import { adminRouter } from "./routes/admin.js";
import { adminCommerceRouter } from "./routes/admin-commerce.js";
import { internalRouter } from "./routes/internal.js";
import { quotaInternalRouter } from "./routes/quota-internal.js";
import { billingRouter } from "./routes/billing.js";
import { workspaceRouter } from "./routes/workspace.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { publicRouter } from "./routes/public.js";
import { integrationHealthRouter } from "./routes/integration-health.js";
import { operationsLogsRouter } from "./routes/operations-logs.js";
import { auditRouter } from "./routes/audit.js";

export function createApp(overrides = {}) {
  const config = overrides.config || loadConfig();
  const logger = overrides.logger || createLogger({ service: "control-api" });
  const database = overrides.database || createDatabase(config.DATABASE_URL);
  const { db, client: dbClient } = database;
  const cache = overrides.cache || createCache(config);
  const signingRing = decodeKeyRing(config.SIGNING_KEYS_B64);
  if (!signingRing.some((key) => key.kid === config.ACTIVE_SIGNING_KID && key.privateJwk))
    throw new Error("ACTIVE_SIGNING_KID has no private key in SIGNING_KEYS_B64");

  const gatewayControl = overrides.gatewayControl || createGatewayControl(config, logger);
  const playbackService = createPlaybackService({ db, cache, config, signingRing, gatewayControl });
  const auth = dashboardAuth({ db, config });
  const tenantViewer = requireTenantRole(db, "viewer");
  const tenantDeveloper = requireTenantRole(db, "developer");
  const tenantAdmin = requireTenantRole(db, "admin");
  const tenantOwner = requireTenantRole(db, "owner");

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(requestContext(logger));
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: config.DASHBOARD_URL,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());

  app.use("/health", healthRouter({ dbClient, cache }));
  app.use("/v1/public", publicRouter({ db }));
  const sensitiveAuthLimiter = createRateLimiter(cache, {
    prefix: "auth",
    limit: 20,
    windowSeconds: 60,
  });
  const sessionIntrospectionLimiter = createRateLimiter(cache, {
    prefix: "auth-session",
    limit: 600,
    windowSeconds: 60,
  });
  app.use(
    "/v1/auth",
    (req, res, next) =>
      req.method === "GET" && req.path === "/me"
        ? sessionIntrospectionLimiter(req, res, next)
        : sensitiveAuthLimiter(req, res, next),
    authRouter({ db, config, dashboardAuth: auth, csrfGuard }),
  );

  app.use("/v1/sites", auth, csrfGuard, sitesRouter({ db, requireTenantAdmin: tenantAdmin }));
  app.use(
    "/v1/assets",
    auth,
    csrfGuard,
    (req, res, next) =>
      ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
        ? requireVerifiedEmail(req, res, next)
        : next(),
    assetsRouter({ db, config, requireTenantDeveloper: tenantDeveloper }),
  );
  app.use(
    "/v1/api-keys",
    auth,
    csrfGuard,
    (req, res, next) =>
      ["POST", "PUT", "PATCH"].includes(req.method) ? requireVerifiedEmail(req, res, next) : next(),
    apiKeysRouter({ db, requireTenantOwner: tenantOwner }),
  );

  app.use(
    "/v1/playback",
    createRateLimiter(cache, { prefix: "playback", limit: 240, windowSeconds: 60 }),
    playbackRouter({
      playbackService,
      apiKeyAuth: apiKeyAuth(db, "playback:create"),
      db,
      cache,
      config,
      dashboardAuth: auth,
      csrfGuard,
      requireTenantDeveloper: tenantDeveloper,
      requireTenantAdmin: tenantAdmin,
    }),
  );

  app.use(
    "/v1/security",
    auth,
    csrfGuard,
    securityConsoleRouter({ db, config, requireTenantAdmin: tenantAdmin }),
  );
  app.use(
    "/v1/security",
    auth,
    csrfGuard,
    securityRouter({ db, config, requireTenantAdmin: tenantAdmin, playbackService }),
  );
  app.use(
    "/v1/viewers",
    auth,
    csrfGuard,
    viewersRouter({ db, config, requireTenantAdmin: tenantAdmin }),
  );
  app.use("/v1/usage", usageRouter({ db, dashboardAuth: auth, requireTenantViewer: tenantViewer }));

  app.use(
    "/v1/billing",
    billingRouter({
      db,
      dashboardAuth: auth,
      csrfGuard,
      requireTenantViewer: tenantViewer,
      requireTenantOwner: tenantOwner,
      requireVerifiedEmail,
    }),
  );

  app.use(
    "/v1/workspace",
    workspaceRouter({
      db,
      config,
      dashboardAuth: auth,
      csrfGuard,
      requireTenantViewer: tenantViewer,
      requireTenantDeveloper: tenantDeveloper,
      requireTenantAdmin: tenantAdmin,
      requireTenantOwner: tenantOwner,
    }),
  );

  app.use(
    "/v1/integration-health",
    auth,
    csrfGuard,
    integrationHealthRouter({ db, requireTenantDeveloper: tenantDeveloper }),
  );

  app.use(
    "/v1/operations-logs",
    auth,
    csrfGuard,
    operationsLogsRouter({ db, requireTenantDeveloper: tenantDeveloper }),
  );

  app.use(
    "/v1/audit",
    auth,
    csrfGuard,
    auditRouter({ db, requireTenantAdmin: tenantAdmin }),
  );

  app.use(
    "/v1/webhooks",
    webhooksRouter({
      db,
      config,
      dashboardAuth: auth,
      csrfGuard,
      requireTenantDeveloper: tenantDeveloper,
    }),
  );

  app.use(
    "/v1/admin/commerce",
    adminCommerceRouter({
      db,
      dashboardAuth: auth,
      csrfGuard,
      requirePlatformPermission,
      requireRecentMfa,
    }),
  );

  app.use(
    "/v1/admin",
    adminRouter({
      db,
      config,
      dashboardAuth: auth,
      csrfGuard,
      requirePlatformPermission,
      requireRecentMfa,
      gatewayControl,
      cache,
    }),
  );

  app.use("/internal/quota", quotaInternalRouter({ db, config }));
  app.use("/internal", internalRouter({ db, config, signingRing }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, config, logger, db, dbClient, cache };
}
