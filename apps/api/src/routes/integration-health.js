import { Router } from "express";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import {
  apiKeys,
  assets,
  devices,
  endUsers,
  playbackSessions,
  siteDomains,
  sites,
  usageEvents,
} from "@unpirator/db/schema";

function check(id, status, title, detail, fix, href, observedAt = null, evidence = null) {
  return { id, status, title, detail, fix, href, observedAt, evidence };
}

export function isCurrentClientVersion(version) {
  return typeof version === "string" && version.startsWith("0.2.");
}

export function findSuccessfulGatewayUsage(events) {
  return events.find(
    (item) =>
      item.type === "gateway_requests" &&
      Number(item.metadata?.status) >= 200 &&
      Number(item.metadata?.status) < 400,
  );
}

export function integrationHealthRouter({ db, requireTenantDeveloper }) {
  const router = Router();

  router.get("/", requireTenantDeveloper, async (req, res, next) => {
    try {
      const now = new Date();
      const [
        verifiedDomains,
        keyRows,
        latestAssets,
        latestViewers,
        latestDevices,
        latestSessions,
      ] = await Promise.all([
        db
          .select({
            siteName: sites.name,
            domain: siteDomains.domain,
            verifiedAt: siteDomains.verifiedAt,
          })
          .from(siteDomains)
          .innerJoin(sites, eq(siteDomains.siteId, sites.id))
          .where(
            and(
              eq(sites.tenantId, req.tenantId),
              eq(sites.status, "active"),
              isNotNull(siteDomains.verifiedAt),
            ),
          )
          .orderBy(desc(siteDomains.verifiedAt))
          .limit(1),
        db
          .select({
            name: apiKeys.name,
            keyPrefix: apiKeys.keyPrefix,
            scopes: apiKeys.scopes,
            lastUsedAt: apiKeys.lastUsedAt,
            expiresAt: apiKeys.expiresAt,
            createdAt: apiKeys.createdAt,
          })
          .from(apiKeys)
          .where(and(eq(apiKeys.tenantId, req.tenantId), isNull(apiKeys.revokedAt)))
          .orderBy(desc(apiKeys.createdAt)),
        db
          .select({
            title: assets.title,
            provider: assets.provider,
            createdAt: assets.createdAt,
            updatedAt: assets.updatedAt,
          })
          .from(assets)
          .where(and(eq(assets.tenantId, req.tenantId), eq(assets.status, "active")))
          .orderBy(desc(assets.updatedAt))
          .limit(1),
        db
          .select({ createdAt: endUsers.createdAt, updatedAt: endUsers.updatedAt })
          .from(endUsers)
          .where(eq(endUsers.tenantId, req.tenantId))
          .orderBy(desc(endUsers.updatedAt))
          .limit(1),
        db
          .select({
            deviceName: devices.deviceName,
            browser: devices.browser,
            os: devices.os,
            lastSeenAt: devices.lastSeenAt,
          })
          .from(devices)
          .where(eq(devices.tenantId, req.tenantId))
          .orderBy(desc(devices.lastSeenAt))
          .limit(1),
        db
          .select({
            id: playbackSessions.id,
            siteId: playbackSessions.siteId,
            assetId: playbackSessions.assetId,
            endUserId: playbackSessions.endUserId,
            deviceId: playbackSessions.deviceId,
            status: playbackSessions.status,
            startedAt: playbackSessions.startedAt,
            lastHeartbeatAt: playbackSessions.lastHeartbeatAt,
            endedAt: playbackSessions.endedAt,
          })
          .from(playbackSessions)
          .where(eq(playbackSessions.tenantId, req.tenantId))
          .orderBy(desc(playbackSessions.startedAt))
          .limit(1),
      ]);

      const verifiedDomain = verifiedDomains[0] || null;
      const activeKey =
        keyRows.find(
          (item) =>
            (!item.expiresAt || new Date(item.expiresAt).getTime() > now.getTime()) &&
            (item.scopes?.includes("playback:create") || item.scopes?.includes("*")),
        ) || null;
      const latestAsset = latestAssets[0] || null;
      const latestViewer = latestViewers[0] || null;
      const latestDevice = latestDevices[0] || null;
      const latestSession = latestSessions[0] || null;
      const correlatedUsage = latestSession
        ? await db
            .select({
              type: usageEvents.type,
              metadata: usageEvents.metadata,
              createdAt: usageEvents.createdAt,
            })
            .from(usageEvents)
            .where(
              and(
                eq(usageEvents.tenantId, req.tenantId),
                eq(usageEvents.sessionId, latestSession.id),
              ),
            )
            .orderBy(desc(usageEvents.createdAt))
        : [];
      const playbackUsage = correlatedUsage.find((item) => item.type === "playback_sessions") || null;
      const gatewayUsage = findSuccessfulGatewayUsage(correlatedUsage);
      const heartbeatUsage = correlatedUsage.find((item) => item.type === "playback_heartbeat");
      const client = playbackUsage?.metadata?.client || {};
      const sdkVersion = typeof client.sdkVersion === "string" ? client.sdkVersion : null;
      const sdkName = typeof client.sdkName === "string" ? client.sdkName : null;
      const hasIdentity = Boolean(latestSession?.endUserId && latestSession?.deviceId);
      const hasProtectedPlayback = Boolean(latestSession && playbackUsage && gatewayUsage);

      const checks = [
        check(
          "domain",
          verifiedDomain ? "pass" : "action",
          "Verified domain",
          verifiedDomain
            ? `${verifiedDomain.domain} is verified for ${verifiedDomain.siteName}.`
            : "No verified customer domain is available for protected playback.",
          verifiedDomain
            ? null
            : "Add a site and complete domain verification before testing playback.",
          "/dashboard/sites",
          verifiedDomain?.verifiedAt || null,
        ),
        check(
          "api-key",
          activeKey ? "pass" : "action",
          "Server API key",
          activeKey
            ? `${activeKey.name} (${activeKey.keyPrefix}…) is active${activeKey.lastUsedAt ? " and has been used" : " but has not been observed in a request yet"}.`
            : "No active server API key is available.",
          activeKey
            ? activeKey.lastUsedAt
              ? null
              : "Configure this API key only on your server, then start one protected playback request."
            : "Create an API key and configure it only in your server-side integration.",
          "/dashboard/api-keys",
          activeKey?.lastUsedAt || activeKey?.createdAt || null,
          activeKey ? { keyPrefix: activeKey.keyPrefix, scopes: activeKey.scopes } : null,
        ),
        check(
          "sdk-version",
          isCurrentClientVersion(sdkVersion) ? "pass" : latestSession ? "action" : "waiting",
          "Plugin / SDK version",
          isCurrentClientVersion(sdkVersion)
            ? `${sdkName || "Unpirator SDK"} ${sdkVersion} was observed in the correlated playback session.`
            : sdkVersion
              ? `${sdkName || "Unpirator SDK"} ${sdkVersion} is outdated; production requires the 0.2.x line.`
            : latestSession
              ? "Playback has been observed, but the installed client did not report an SDK version."
              : "No SDK version has been observed yet.",
          isCurrentClientVersion(sdkVersion)
            ? null
            : latestSession
              ? "Upgrade the browser SDK, redeploy the customer app, then start one new protected playback."
              : "Install the current browser SDK and start one protected playback; version telemetry is recorded automatically.",
          "/docs",
          playbackUsage?.createdAt || null,
        ),
        check(
          "viewer-identity",
          hasIdentity ? "pass" : latestSession ? "action" : "waiting",
          "Viewer identity & device",
          hasIdentity
            ? `Authenticated viewer identity and a stable device were observed${latestDevice?.browser ? ` from ${latestDevice.browser}` : ""}.`
            : "A trusted viewer email and stable device ID have not both been observed.",
          hasIdentity
            ? null
            : "Resolve the authenticated viewer email on the customer server and send a stable browser deviceId. Never trust a browser-supplied email.",
          "/dashboard/viewers",
          latestSession?.startedAt || latestDevice?.lastSeenAt || latestViewer?.updatedAt || null,
        ),
        check(
          "asset-sync",
          latestAsset ? "pass" : "waiting",
          "Asset discovery",
          latestAsset
            ? `${latestAsset.title} is available through ${latestAsset.provider}.`
            : "No asset has been discovered for this workspace yet.",
          latestAsset
            ? null
            : "Start protected playback or use the server asset-upsert flow; assets are discovered automatically.",
          "/dashboard/assets",
          latestAsset?.updatedAt || latestAsset?.createdAt || null,
        ),
        check(
          "playback-session",
          latestSession ? "pass" : "waiting",
          "Protected playback session",
          latestSession
            ? `Session ${latestSession.id} was created and is correlated to site ${latestSession.siteId}, asset ${latestSession.assetId}, viewer and device; latest state is ${latestSession.status}.`
            : "No protected playback session has completed successfully yet.",
          latestSession
            ? null
            : "Start one authorized playback from a verified site using an active API key, trusted viewer email and stable deviceId.",
          "/dashboard/sessions",
          latestSession?.lastHeartbeatAt || latestSession?.startedAt || null,
          latestSession
            ? {
                sessionId: latestSession.id,
                siteId: latestSession.siteId,
                assetId: latestSession.assetId,
              }
            : null,
        ),
        check(
          "gateway-protection",
          hasProtectedPlayback ? "pass" : latestAsset ? "waiting" : "waiting",
          "Gateway & protection path",
          hasProtectedPlayback
            ? `A successful protected media response (${gatewayUsage.metadata.status}) was recorded for session ${latestSession.id}.`
            : latestSession
              ? `Session ${latestSession.id} was created, but no successful media response from the protected gateway was recorded.`
              : "The protected gateway path has not been proven by a playback session yet.",
          hasProtectedPlayback
            ? null
            : "Play until a visible frame appears, then rescan. Session creation alone does not prove media delivery.",
          "/dashboard/security",
          gatewayUsage?.createdAt || null,
          latestSession
            ? {
                sessionId: latestSession.id,
                gatewayStatus: gatewayUsage?.metadata?.status ?? "not observed",
              }
            : null,
        ),
        check(
          "playback-heartbeat",
          heartbeatUsage ? "pass" : latestSession ? "action" : "waiting",
          "Sustained playback heartbeat",
          heartbeatUsage
            ? `Continued playback activity was recorded for session ${latestSession.id}.`
            : latestSession
              ? `Session ${latestSession.id} has no correlated playback heartbeat yet.`
              : "No playback session is available for heartbeat verification.",
          heartbeatUsage
            ? null
            : "Keep the video playing for at least one heartbeat interval, then run the scan again.",
          "/dashboard/sessions",
          heartbeatUsage?.createdAt || null,
          latestSession ? { sessionId: latestSession.id } : null,
        ),
      ];

      res.set("cache-control", "no-store").json({
        scannedAt: new Date().toISOString(),
        summary: {
          total: checks.length,
          healthy: checks.filter((item) => item.status === "pass").length,
          action: checks.filter((item) => item.status === "action").length,
          waiting: checks.filter((item) => item.status === "waiting").length,
        },
        checks,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
