import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
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
import { riskFor } from "@unpirator/security";
import { queueWebhook } from "./webhooks.js";
import { AppError, notFound } from "../errors.js";
import { getEntitlements, featureEnabled, restrictedFeatureEnabled } from "./entitlements.js";

export function createPlaybackService({ db, cache, config, signingRing, gatewayControl }) {
  async function create(args) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${args.tenantId}:${args.input.externalUserId}`}, 0))`,
      );
      return createPlaybackService({
        db: tx,
        cache,
        config,
        signingRing,
        gatewayControl,
      }).createUnlocked(args);
    });
  }
  async function createUnlocked({ tenantId, input, ip, userAgent }) {
    const [site] = await db
      .select()
      .from(sites)
      .where(
        and(eq(sites.id, input.siteId), eq(sites.tenantId, tenantId), eq(sites.status, "active")),
      )
      .limit(1);
    if (!site) throw notFound("Site not found");
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
    let asset;
    if (input.source) {
      if (input.source.provider !== "youtube_custom")
        throw new AppError("SOURCE_INVALID", "Unsupported on-demand provider", 400);
      const enabled =
        config.YOUTUBE_CUSTOM_GLOBAL &&
        (await restrictedFeatureEnabled(db, "youtube_custom", tenantId));
      if (!enabled) throw new AppError("PROVIDER_DISABLED", "Restricted provider disabled", 403);
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
            securityPolicy: "strict",
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
    const secure = await featureEnabled(db, "secure_gateway", tenantId, true);
    if (!secure) throw new AppError("FEATURE_DISABLED", "Secure gateway is disabled", 403);
    if (asset.provider === "youtube_custom") {
      const enabled =
        config.YOUTUBE_CUSTOM_GLOBAL &&
        (await restrictedFeatureEnabled(db, "youtube_custom", tenantId));
      if (!enabled) throw new AppError("PROVIDER_DISABLED", "Restricted provider disabled", 403);
    }
    const entitlements = await getEntitlements(db, tenantId);
    let [user] = await db
      .select()
      .from(endUsers)
      .where(
        and(eq(endUsers.tenantId, tenantId), eq(endUsers.externalUserId, input.externalUserId)),
      )
      .limit(1);
    if (!user)
      [user] = await db
        .insert(endUsers)
        .values({
          tenantId,
          externalUserId: input.externalUserId,
          displayLabel: input.displayLabel,
        })
        .returning();
    if (user.status !== "active") throw new AppError("USER_BLOCKED", "User is blocked", 403);
    let [device] = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.tenantId, tenantId),
          eq(devices.endUserId, user.id),
          eq(devices.externalDeviceId, input.deviceId),
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
        entitlements.device_control &&
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
          externalDeviceId: input.deviceId,
          deviceName: input.client.deviceName,
          browser: input.client.browser,
          os: input.client.os,
        })
        .returning();
    } else {
      if (device.status !== "active")
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
    if (activeSessions.length >= maxStreams) {
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
    const [session] = await db
      .insert(playbackSessions)
      .values({
        tenantId,
        siteId: site.id,
        assetId: asset.id,
        endUserId: user.id,
        deviceId: device.id,
        ip,
        userAgent,
        expiresAt,
      })
      .returning();
    const tokenTtl = 90;
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "the-unpirator",
      tid: tenantId,
      sid: site.id,
      uid: user.id,
      aid: asset.id,
      did: device.id,
      psid: session.id,
      policy: asset.securityPolicy,
      iat: now,
      exp: now + tokenTtl,
    };
    const token = signPlaybackToken(payload, {
      ring: signingRing,
      activeKid: config.ACTIVE_SIGNING_KID,
    });
    await cache.set(`playback:session:${session.id}`, "active", { ex: 8 * 3600 });
    await gatewayControl.syncSession(session.id, "active", 8 * 3600);
    await db.insert(usageEvents).values({
      tenantId,
      type: "playback_sessions",
      quantity: 1,
      assetId: asset.id,
      sessionId: session.id,
    });
    await queueWebhook(db, tenantId, "playback.started", {
      sessionId: session.id,
      assetId: asset.id,
      externalUserId: input.externalUserId,
    });
    return {
      sessionId: session.id,
      playbackUrl: `${config.GATEWAY_PUBLIC_URL}/v/${asset.id}/media?token=${encodeURIComponent(token)}`,
      token,
      tokenExpiresIn: tokenTtl,
      refreshUrl: `${config.GATEWAY_PUBLIC_URL}/v/${asset.id}/refresh`,
      mode:
        asset.provider === "youtube_custom"
          ? "protected_segments"
          : asset.provider === "hls"
            ? "hls"
            : "native",
      sessionExpiresAt: expiresAt,
      watermark: (await featureEnabled(db, "dynamic_watermark", tenantId, true))
        ? {
            enabled: true,
            label: input.displayLabel || input.externalUserId,
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
    await queueWebhook(db, tenantId, "playback.revoked", {
      sessionId: session.id,
      assetId: session.assetId,
    });
    return session;
  }
  return { create, createUnlocked, revoke };
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
