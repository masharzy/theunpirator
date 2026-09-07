import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uuid,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  status: text("status").default("active").notNull(),
  ...timestamps,
});

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastTenantId: uuid("last_tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lastLoginIp: text("last_login_ip"),
    mfaSecretEncrypted: text("mfa_secret_encrypted"),
    mfaConfirmedAt: timestamp("mfa_confirmed_at", { withTimezone: true }),
    platformRole: text("platform_role"),
    status: text("status").default("active").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("accounts_email_uq").on(t.email)],
);

export const accountTokens = pgTable(
  "account_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    tokenHash: text("token_hash").notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("account_tokens_hash_uq").on(t.tokenHash),
    index("account_tokens_account_kind_idx").on(t.accountId, t.kind),
  ],
);

export const oauthIdentities = pgTable(
  "oauth_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("oauth_identities_provider_subject_uq").on(t.provider, t.providerSubject),
    index("oauth_identities_account_idx").on(t.accountId),
  ],
);

export const accountSessions = pgTable(
  "account_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull(),
    csrfToken: text("csrf_token").notNull(),
    mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("account_sessions_token_uq").on(t.tokenHash),
    index("account_sessions_account_idx").on(t.accountId),
  ],
);

export const platformBootstrapState = pgTable("platform_bootstrap_state", {
  id: text("id").primaryKey().default("platform"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: uuid("completed_by").references(() => accounts.id),
  bootstrapVersion: integer("bootstrap_version").default(1).notNull(),
});

export const accountMfaMethods = pgTable(
  "account_mfa_methods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    type: text("type").default("totp").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    enabled: boolean("enabled").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("account_mfa_methods_account_type_uq").on(t.accountId, t.type)],
);

export const mfaRecoveryCodes = pgTable(
  "mfa_recovery_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("mfa_recovery_codes_hash_uq").on(t.codeHash),
    index("mfa_recovery_codes_account_idx").on(t.accountId),
  ],
);

export const tenantMembers = pgTable(
  "tenant_members",
  {
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role").default("viewer").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.accountId] })],
);

export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").default("active").notNull(),
  entitlements: jsonb("entitlements").default({}).notNull(),
  ...timestamps,
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    planId: text("plan_id")
      .references(() => plans.id)
      .notNull(),
    status: text("status").default("trialing").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    provider: text("provider"),
    providerReference: text("provider_reference"),
    ...timestamps,
  },
  (t) => [index("subscriptions_tenant_idx").on(t.tenantId)],
);

export const featureFlags = pgTable(
  "feature_flags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    config: jsonb("config").default({}).notNull(),
    updatedBy: uuid("updated_by").references(() => accounts.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("feature_flags_scope_uq").on(t.key, t.scopeType, t.scopeId)],
);

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    status: text("status").default("active").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("sites_tenant_domain_uq").on(t.tenantId, t.domain),
    index("sites_tenant_idx").on(t.tenantId),
  ],
);

export const siteDomains = pgTable(
  "site_domains",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .references(() => sites.id, { onDelete: "cascade" })
      .notNull(),
    domain: text("domain").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationToken: text("verification_token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("site_domains_site_domain_uq").on(t.siteId, t.domain)],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    secretHash: text("secret_hash").notNull(),
    scopes: jsonb("scopes").default([]).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("api_keys_prefix_uq").on(t.keyPrefix),
    index("api_keys_tenant_idx").on(t.tenantId),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    siteId: uuid("site_id")
      .references(() => sites.id, { onDelete: "cascade" })
      .notNull(),
    title: text("title").notNull(),
    provider: text("provider").notNull(),
    providerReference: text("provider_reference").notNull(),
    allowedHosts: jsonb("allowed_hosts").default([]).notNull(),
    encryptedProviderConfig: text("encrypted_provider_config"),
    securityPolicy: text("security_policy").default("strict").notNull(),
    status: text("status").default("active").notNull(),
    ...timestamps,
  },
  (t) => [index("assets_tenant_idx").on(t.tenantId), index("assets_site_idx").on(t.siteId)],
);

export const endUsers = pgTable(
  "end_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    externalUserId: text("external_user_id").notNull(),
    displayLabel: text("display_label"),
    status: text("status").default("active").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("end_users_external_uq").on(t.tenantId, t.externalUserId),
    index("end_users_tenant_idx").on(t.tenantId),
  ],
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    endUserId: uuid("end_user_id")
      .references(() => endUsers.id, { onDelete: "cascade" })
      .notNull(),
    externalDeviceId: text("external_device_id").notNull(),
    deviceName: text("device_name"),
    browser: text("browser"),
    os: text("os"),
    status: text("status").default("active").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("devices_external_uq").on(t.tenantId, t.endUserId, t.externalDeviceId),
    index("devices_user_idx").on(t.endUserId),
  ],
);

export const playbackSessions = pgTable(
  "playback_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    siteId: uuid("site_id")
      .references(() => sites.id, { onDelete: "cascade" })
      .notNull(),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "cascade" })
      .notNull(),
    endUserId: uuid("end_user_id")
      .references(() => endUsers.id, { onDelete: "cascade" })
      .notNull(),
    deviceId: uuid("device_id")
      .references(() => devices.id, { onDelete: "cascade" })
      .notNull(),
    status: text("status").default("active").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("playback_sessions_tenant_idx").on(t.tenantId),
    index("playback_sessions_user_status_idx").on(t.endUserId, t.status),
  ],
);

export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    siteId: uuid("site_id").references(() => sites.id),
    endUserId: uuid("end_user_id").references(() => endUsers.id),
    assetId: uuid("asset_id").references(() => assets.id),
    sessionId: uuid("session_id").references(() => playbackSessions.id),
    type: text("type").notNull(),
    severity: text("severity").default("info").notNull(),
    riskScore: integer("risk_score").default(0).notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("security_events_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    type: text("type").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    assetId: uuid("asset_id").references(() => assets.id),
    sessionId: uuid("session_id").references(() => playbackSessions.id),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("usage_events_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

export const usageRollups = pgTable(
  "usage_rollups",
  {
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    period: text("period").notNull(),
    metric: text("metric").notNull(),
    quantity: integer("quantity").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.period, t.metric] })],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    actorAccountId: uuid("actor_account_id").references(() => accounts.id),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").default({}).notNull(),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_logs_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    url: text("url").notNull(),
    secretHash: text("secret_hash").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    events: jsonb("events").default([]).notNull(),
    status: text("status").default("active").notNull(),
    ...timestamps,
  },
  (t) => [index("webhooks_tenant_idx").on(t.tenantId)],
);

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  endpointId: uuid("endpoint_id")
    .references(() => webhookEndpoints.id, { onDelete: "cascade" })
    .notNull(),
  eventId: text("event_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const providerHealth = pgTable("provider_health", {
  provider: text("provider").primaryKey(),
  status: text("status").default("healthy").notNull(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  metadata: jsonb("metadata").default({}).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
