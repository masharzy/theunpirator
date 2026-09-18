import { and, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm";
import {
  assets,
  devices,
  endUsers,
  playbackSessions,
  securityEvents,
  siteDomains,
  sites,
  usageEvents,
} from "@unpirator/db/schema";
import { signPlaybackToken } from "@unpirator/crypto";
import {
  encryptViewerEmail,
  normalizeViewerEmail,
  viewerIdentityKey,
  viewerIdentityKeyCandidates,
} from "./viewer-identity.js";
import { riskFor } from "@unpirator/security";
import { queueWebhook } from "./webhooks.js";
import { notifyTenant } from "./tenant-notifications.js";
import { AppError, notFound } from "../errors.js";
import { getPlaybackPolicy } from "./entitlements.js";

export function createPlaybackService({ db, cache, config, signingRing, gatewayControl }) {
  async function create(args) {
    const started = performance.now();
    let previous = started;
    const phases = {};
    const recordTiming = (phase) => {
      const now = performance.now();
      phases[phase] = Math.round(now - previous);
      previous = now;
    };
    let sessionId;
    try {
      const result = await db.transaction(async (tx) => {
        recordTiming("transaction_open");
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${args.tenantId}:${viewerIdentityKey(args.input.email, config)}`}, 0))`,
        );
        recordTiming("user_lock");
        return createPlaybackService({
          db: tx,
          cache,
          config,
          signingRing,
          gatewayControl,
        }).createUnlocked({ ...args, recordTiming });
      });
      recordTiming("commit");
      sessionId = result.sessionId;
      return result;
    } finally {
      console.info(
        JSON.stringify({
          component: "playback-timing",
          phase: "session-phases",
          requestId: args.requestId || null,
          sessionId: sessionId || null,
          phases,
          durationMs: Math.round(performance.now() - started),
        }),
      );
    }
  }

  async function directPassthrough({ tenantId, asset, reason, recordTiming }) {
    await notifyTenant(db, {
      tenantId,
      type: "protection_bypassed",
      title: "Protected playback is unavailable",
      body:
        reason === "secure_gateway_disabled"
          ? "Secure gateway is disabled. Playback is being returned to your original source URL without Unpirator protection."
          : "Protected delivery is disabled. Playback is being returned to your original source URL without Unpirator protection.",
      actionUrl: "/dashboard/plans",
      dedupeKey: `protection-bypass:${reason}:${new Date().toISOString().slice(0, 10)}`,
    });
    recordTiming("direct_passthrough");
    return {
      sessionId: null,
      playbackUrl: asset.providerReference,
      token: null,
      tokenExpiresIn: 0,
      features: {
        protectedDelivery: false,
        playerIntegrity: false,
        secureBrowserRestriction: false,
      },
      refreshUrl: null,
      mode: "passthrough",
      attestation: null,
      sessionExpiresAt: null,
      watermark: { enabled: false },
      protectionBypassed: true,
      bypassReason: reason,
    };
  }

  async function createUnlocked({ tenantId, input, ip, userAgent, recordTiming = () => {} }) {
    const [site] = await db
      .select()
      .from(sites)
      .where(
        and(eq(sites.id, input.siteId), eq(sites.tenantId, tenantId), eq(sites.status, "active")),
      )
      .limit(1);
    if (!site) throw notFound("Site not found");
    recordTiming("site");
    const [verifiedDomain] = await db
      .select({ id: siteDomains.id })
      .from(siteDomains)
      .where(and(eq(siteDomains.siteId, site.id), isNotNull(siteDomains.verifiedAt)))
      .limit(1);
    if (!verifiedDomain)
      throw new AppError(
        "DOMAIN_NOT_VERIFIED",
        "Verify at least one site domain before playback",
        409,
      );
    recordTiming("domain");
    let asset;
    const policy = await getPlaybackPolicy(db, tenantId);
    recordTiming("policy");
    if (input.source) {
      if (input.source.provider !== "youtube_custom")
        throw new AppError("SOURCE_INVALID", "Unsupported on-demand provider", 400);
      const enabled = config.YOUTUBE_CUSTOM_GLOBAL && policy.youtube;
      if (policy.secure && policy.protectedDelivery && !enabled)
        throw new AppError("PROVIDER_DISABLED", "Restricted provider disabled", 403);
      const reference = canonicalYoutubeUrl(input.source.url);
      await db.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${site.id}:youtube:${reference}`}, 2))`,
      );
      [asset] = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.tenantId, tenantId),
            eq(assets.siteId, site.id),
            eq(assets.provider, "youtube_custom"),
            eq(assets.providerReference, reference),
            eq(assets.status, "active"),
          ),
        )
        .limit(1);
      if (!asset) {
        [asset] = await db
          .insert(assets)
          .values({
            tenantId,
            siteId: site.id,
            title: input.source.title || `YouTube ${youtubeVideoId(reference)}`,
            provider: "youtube_custom",
            providerReference: reference,
            allowedHosts: [],
            status: "active",
          })
          .returning();
      }
    } else {
      [asset] = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.id, input.assetId),
            eq(assets.tenantId, tenantId),
            eq(assets.status, "active"),
          ),
        )
        .limit(1);
      if (!asset) throw notFound("Asset not found");
      if (asset.siteId !== input.siteId)
        throw new AppError("ASSET_SITE_MISMATCH", "Asset does not belong to this site", 403);
    }

    const secure = policy.secure;
    recordTiming("asset");
    if (!secure)
      return directPassthrough({
        tenantId,
        asset,
        reason: "secure_gateway_disabled",
        recordTiming,
      });
    if (!policy.protectedDelivery)
      return directPassthrough({
        tenantId,
        asset,
        reason: "protected_delivery_disabled",
        recordTiming,
      });

    if (asset.provider === "youtube_custom") {
      const enabled = config.YOUTUBE_CUSTOM_GLOBAL && policy.youtube;
      if (!enabled) throw new AppError("PROVIDER_DISABLED", "Restricted provider disabled", 403);
    }
    const protectedHls = isHlsAsset(asset);
    const entitlements = policy.entitlements;
    const playbackFeatures = {
      protectedDelivery: policy.protectedDelivery,
      playerIntegrity: policy.playerIntegrity,
      secureBrowserRestriction: policy.secureBrowserRestriction,
    };
    const normalizedEmail = normalizeViewerEmail(input.email);
    const identityKey = viewerIdentityKey(normalizedEmail, config);
    const identityCandidates = viewerIdentityKeyCandidates(normalizedEmail, config);
    const encryptedEmail = encryptViewerEmail(normalizedEmail, tenantId, config);
    let [user] = await db
      .select()
      .from(endUsers)
      .where(
        and(
          eq(endUsers.tenantId, tenantId),
          inArray(endUsers.externalUserId, identityCandidates),
        ),
      )
      .limit(1);

    if (!user) {
      const [legacyUser] = await db
        .select()
        .from(endUsers)
        .where(
          and(
            eq(endUsers.tenantId, tenantId),
            or(
              eq(endUsers.externalUserId, normalizedEmail),
              eq(endUsers.displayLabel, normalizedEmail),
            ),
          ),
        )
        .limit(1);
      if (legacyUser) user = legacyUser;
    }

    if (!user) {
      [user] = await db
        .insert(endUsers)
        .values({
          tenantId,
          externalUserId: identityKey,
          displayLabel: encryptedEmail,
        })
        .returning();
    } else if (
      user.externalUserId !== identityKey ||
      !String(user.displayLabel || "").startsWith("enc:v2:")
    ) {
      [user] = await db
        .update(endUsers)
        .set({
          externalUserId: identityKey,
          displayLabel: encryptedEmail,
          updatedAt: new Date(),
        })
        .where(eq(endUsers.id, user.id))
        .returning();
    }
    if (user.status !== "active") throw new AppError("USER_BLOCKED", "User is blocked", 403);
    recordTiming("user");
    const externalDeviceId = input.deviceId;
    let [device] = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.tenantId, tenantId),
          eq(devices.endUserId, user.id),
          eq(devices.externalDeviceId, externalDeviceId),
        ),
      )
      .limit(1);
    if (!device) {
      const existing = await db
        .select({ id: devices.id })
        .from(devices)
        .where(
          and(
            eq(devices.tenantId, tenantId),
            eq(devices.endUserId, user.id),
            eq(devices.status, "active"),
          ),
        );
      if (
        policy.deviceControl &&
        existing.length >= Number(entitlements.max_devices_per_user || 2)
      ) {
        await db.insert(securityEvents).values({
          tenantId,
          siteId: site.id,
          endUserId: user.id,
          assetId: asset.id,
          type: "DEVICE_LIMIT",
          severity: "warning",
          riskScore: riskFor("DEVICE_LIMIT"),
          metadata: { maxDevices: Number(entitlements.max_devices_per_user || 2) },
        });
        throw new AppError("DEVICE_LIMIT", "Device limit reached", 403);
      }
      [device] = await db
        .insert(devices)
        .values({
          tenantId,
          endUserId: user.id,
          externalDeviceId,
          deviceName: input.client.deviceName || "Browser device",
          browser: input.client.browser,
          os: input.client.os,
        })
        .returning();
    } else {
      if (policy.deviceControl && device.status !== "active")
        throw new AppError("DEVICE_BLOCKED", "Device is blocked", 403);
      await db
        .update(devices)
        .set({
          lastSeenAt: new Date(),
          deviceName: input.client.deviceName || device.deviceName,
          browser: input.client.browser || device.browser,
          os: input.client.os || device.os,
        })
        .where(eq(devices.id, device.id));
    }
    recordTiming("device");
    const activeSessions = await db
      .select({ id: playbackSessions.id })
      .from(playbackSessions)
      .where(
        and(
          eq(playbackSessions.endUserId, user.id),
          eq(playbackSessions.status, "active"),
          gt(playbackSessions.expiresAt, new Date()),
        ),
      );
    const maxStreams = Number(entitlements.max_concurrent_streams || 1);
    recordTiming("active_sessions");
    if (policy.concurrentStreamControl && activeSessions.length >= maxStreams) {
      if (entitlements.session_policy === "revoke_old") {
        for (const old of activeSessions) {
          await db
            .update(playbackSessions)
            .set({ status: "revoked", endedAt: new Date() })
            .where(eq(playbackSessions.id, old.id));
          await cache.set(`playback:session:${old.id}`, "revoked", { ex: 8 * 3600 });
          await gatewayControl.syncSession(old.id, "revoked", 8 * 3600);
        }
      } else {
        await db.insert(securityEvents).values({
          tenantId,
          siteId: site.id,
          endUserId: user.id,
          assetId: asset.id,
          type: "CONCURRENT_PLAYBACK",
          severity: "warning",
          riskScore: riskFor("CONCURRENT_PLAYBACK"),
          metadata: { activeSessions: activeSessions.length, maxStreams },
        });
        throw new AppError("CONCURRENT_PLAYBACK", "Concurrent playback limit reached", 409);
      }
    }
    const expiresAt = new Date(Date.now() + 8 * 3600_000);
    recordTiming("concurrency_policy");
    const [session] = await db
      .insert(playbackSessions)
      .values({
        tenantId,
        siteId: site.id,
        assetId: asset.id,
        endUserId: user.id,
        deviceId: device.id,
        ip: input.viewerIp || ip,
        userAgent: input.viewerUserAgent || userAgent,
        expiresAt,
      })
      .returning();
    const tokenTtl = 90;
    recordTiming("session_insert");
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "the-unpirator",
      tid: tenantId,
      sid: site.id,
      uid: user.id,
      aid: asset.id,
      did: device.id,
      psid: session.id,
      features: playbackFeatures,
      iat: now,
      exp: now + tokenTtl,
    };
    const token = signPlaybackToken(payload, {
      ring: signingRing,
      activeKid: config.ACTIVE_SIGNING_KID,
    });
    await cache.set(`playback:session:${session.id}`, "active", { ex: 8 * 3600 });
    recordTiming("token_and_cache");
    await gatewayControl.syncSession(session.id, "active", 8 * 3600, playbackFeatures);
    recordTiming("gateway_sync");
    await db.insert(usageEvents).values({
      tenantId,
      type: "playback_sessions",
      quantity: 1,
      assetId: asset.id,
      sessionId: session.id,
    });
    if (policy.webhooks)
      await queueWebhook(db, tenantId, "playback.started", {
        sessionId: session.id,
        assetId: asset.id,
      });
    recordTiming("usage_and_webhook");
    return {
      sessionId: session.id,
      playbackUrl: `${config.GATEWAY_PUBLIC_URL}/v/${asset.id}/media?token=${encodeURIComponent(token)}`,
      token,
      tokenExpiresIn: tokenTtl,
      features: playbackFeatures,
      refreshUrl: `${config.GATEWAY_PUBLIC_URL}/v/${asset.id}/refresh`,
      mode:
        asset.provider === "youtube_custom"
          ? "protected_segments"
          : protectedHls
            ? "protected_hls"
            : "native",
      attestation:
        asset.provider === "youtube_custom"
          ? { provider: "youtube", contentBinding: youtubeVideoId(asset.providerReference) }
          : null,
      sessionExpiresAt: expiresAt,
      watermark: policy.watermark
        ? {
            enabled: true,
            label: normalizedEmail,
            sessionCode: session.id.slice(0, 8),
            minMoveSeconds: 20,
            maxMoveSeconds: 45,
          }
        : { enabled: false },
    };
  }
  async function revoke({ tenantId, sessionId }) {
    const [session] = await db
      .update(playbackSessions)
      .set({ status: "revoked", endedAt: new Date() })
      .where(and(eq(playbackSessions.id, sessionId), eq(playbackSessions.tenantId, tenantId)))
      .returning();
    if (!session) throw notFound("Playback session not found");
    await cache.set(`playback:session:${session.id}`, "revoked", { ex: 8 * 3600 });
    await gatewayControl.syncSession(session.id, "revoked", 8 * 3600);
    const policy = await getPlaybackPolicy(db, tenantId);
    if (policy.webhooks)
      await queueWebhook(db, tenantId, "playback.revoked", {
        sessionId: session.id,
        assetId: session.assetId,
      });
    return session;
  }
  return { create, createUnlocked, revoke };
}

export function isHlsAsset(asset) {
  if (asset.provider === "hls") return true;
  if (asset.provider === "bunny") {
    try {
      const url = new URL(asset.providerReference);
      if (
        url.hostname.toLowerCase() === "iframe.mediadelivery.net" &&
        /^\/embed\/\d+\/[0-9a-f-]{36}\/?$/i.test(url.pathname)
      )
        return true;
    } catch {
      // Object references and relative provider paths are handled below.
    }
  }
  if (!["bunny", "s3", "r2"].includes(asset.provider)) return false;
  return asset.providerReference.toLowerCase().split(/[?#]/)[0].endsWith(".m3u8");
}

function youtubeVideoId(value) {
  const url = new URL(value);
  if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0];
  return (
    url.searchParams.get("v") ||
    (["shorts", "embed", "live"].includes(url.pathname.split("/")[1])
      ? url.pathname.split("/")[2]
      : null)
  );
}

function canonicalYoutubeUrl(value) {
  let id;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
    if (host !== "youtu.be" && host !== "youtube.com" && !host.endsWith(".youtube.com"))
      throw new Error();
    id = youtubeVideoId(url.toString());
  } catch {
    throw new AppError("INVALID_YOUTUBE_URL", "Enter a valid YouTube video URL", 400);
  }
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id || ""))
    throw new AppError("INVALID_YOUTUBE_URL", "Enter a valid YouTube video URL", 400);
  return `https://www.youtube.com/watch?v=${id}`;
}
