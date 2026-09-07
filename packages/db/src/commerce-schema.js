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
} from "drizzle-orm/pg-core";
import { accounts, tenants } from "./schema.js";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const billingPlans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  priceMinor: integer("price_minor"),
  currency: text("currency").default("BDT").notNull(),
  billingInterval: text("billing_interval").default("month").notNull(),
  durationDays: integer("duration_days").default(30).notNull(),
  trialDays: integer("trial_days").default(14).notNull(),
  status: text("status").default("active").notNull(),
  isPublic: boolean("is_public").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  badge: text("badge"),
  entitlements: jsonb("entitlements").default({}).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
});

export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: text("type").notNull(),
    displayName: text("display_name").notNull(),
    accountNumber: text("account_number").notNull(),
    accountName: text("account_name"),
    accountType: text("account_type"),
    instructions: text("instructions"),
    enabled: boolean("enabled").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    minAmountMinor: integer("min_amount_minor"),
    maxAmountMinor: integer("max_amount_minor"),
    createdBy: uuid("created_by").references(() => accounts.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => accounts.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payment_methods_type_uq").on(t.type),
    index("payment_methods_enabled_order_idx").on(t.enabled, t.sortOrder),
  ],
);

export const paymentRequests = pgTable(
  "payment_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "restrict" })
      .notNull(),
    planId: text("plan_id").notNull(),
    paymentMethodId: uuid("payment_method_id")
      .references(() => paymentMethods.id, { onDelete: "restrict" })
      .notNull(),
    planNameSnapshot: text("plan_name_snapshot").notNull(),
    amountMinorSnapshot: integer("amount_minor_snapshot").notNull(),
    currencySnapshot: text("currency_snapshot").notNull(),
    durationDaysSnapshot: integer("duration_days_snapshot").notNull(),
    senderNumber: text("sender_number").notNull(),
    transactionId: text("transaction_id").notNull(),
    proofReference: text("proof_reference"),
    customerNote: text("customer_note"),
    status: text("status").default("pending").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    reviewedBy: uuid("reviewed_by").references(() => accounts.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    rejectionReason: text("rejection_reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payment_requests_method_transaction_uq").on(t.paymentMethodId, t.transactionId),
    index("payment_requests_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("payment_requests_status_created_idx").on(t.status, t.createdAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    actionUrl: text("action_url"),
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("notifications_account_created_idx").on(t.accountId, t.createdAt),
    index("notifications_tenant_created_idx").on(t.tenantId, t.createdAt),
  ],
);

export const providerConnections = pgTable(
  "provider_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(),
    name: text("name").notNull(),
    encryptedConfig: text("encrypted_config").notNull(),
    status: text("status").default("configured").notNull(),
    lastTestAt: timestamp("last_test_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    createdBy: uuid("created_by").references(() => accounts.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("provider_connections_tenant_name_uq").on(t.tenantId, t.name),
    index("provider_connections_tenant_provider_idx").on(t.tenantId, t.provider),
  ],
);

export const tenantSettings = pgTable("tenant_settings", {
  tenantId: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .primaryKey(),
  timezone: text("timezone").default("Asia/Dhaka").notNull(),
  defaultSecurityPolicy: text("default_security_policy").default("strict").notNull(),
  notificationPreferences: jsonb("notification_preferences").default({}).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tenantInvitations = pgTable(
  "tenant_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    email: text("email").notNull(),
    role: text("role").default("viewer").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedBy: uuid("invited_by").references(() => accounts.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => accounts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("tenant_invitations_token_uq").on(t.tokenHash),
    index("tenant_invitations_tenant_email_idx").on(t.tenantId, t.email),
  ],
);

export const assetConnectionRefs = pgTable("assets", {
  id: uuid("id").primaryKey(),
  connectionId: uuid("connection_id").references(() => providerConnections.id, {
    onDelete: "set null",
  }),
});

export const tenantSupportNotes = pgTable("tenant_support_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  authorAccountId: uuid("author_account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  body: text("body").notNull(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const adminImpersonationSessions = pgTable("admin_impersonation_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminAccountId: uuid("admin_account_id")
    .references(() => accounts.id, { onDelete: "cascade" })
    .notNull(),
  tenantId: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  tokenHash: text("token_hash").notNull(),
  reason: text("reason").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const restrictedIntegrationAccess = pgTable("restricted_integration_access", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  provider: text("provider").notNull(),
  status: text("status").default("pending").notNull(),
  eligibility: jsonb("eligibility").default({}).notNull(),
  requestedBy: uuid("requested_by").references(() => accounts.id, { onDelete: "set null" }),
  reviewedBy: uuid("reviewed_by").references(() => accounts.id, { onDelete: "set null" }),
  reason: text("reason"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...timestamps,
});
