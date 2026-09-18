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

function check(id, status, title, detail, fix, href, observedAt = null) {
  return { id, status, title, detail, fix, href, observedAt };
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
        latestPlaybackUsage,
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
            status: playbackSessions.status,
            startedAt: playbackSessions.startedAt,
            lastHeartbeatAt: playbackSessions.lastHeartbeatAt,
            endedAt: playbackSessions.endedAt,
          })
          .from(playbackSessions)
          .where(eq(playbackSessions.tenantId, req.tenantId))
          .orderBy(desc(playbackSessions.startedAt))
          .limit(1),
        db
          .select({ metadata: usageEvents.metadata, createdAt: usageEvents.createdAt })
          .from(usageEvents)
          .where(
            and(eq(usageEvents.tenantId, req.tenantId), eq(usageEvents.type, "playback_sessions")),
          )
          .orderBy(desc(usageEvents.createdAt))
          .limit(1),
      ]);

      const verifiedDomain = verifiedDomains[0] || null;
      const activeKey =
        keyRows.find(
          (item) => !item.expiresAt || new Date(item.expiresAt).getTime() > now.getTime(),
        ) || null;
      const latestAsset = latestAssets[0] || null;
      const latestViewer = latestViewers[0] || null;
      const latestDevice = latestDevices[0] || null;
      const latestSession = latestSessions[0] || null;
      const playbackUsage = latestPlaybackUsage[0] || null;
      const client = playbackUsage?.metadata?.client || {};
      const sdkVersion = typeof client.sdkVersion === "string" ? client.sdkVersion : null;
      const sdkName = typeof client.sdkName === "string" ? client.sdkName : null;
      const hasIdentity = Boolean(latestViewer && latestDevice);
      const hasProtectedPlayback = Boolean(latestSession && playbackUsage);

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
        ),
        check(
          "sdk-version",
          sdkVersion ? "pass" : latestSession ? "action" : "waiting",
          "Plugin / SDK version",
          sdkVersion
            ? `${sdkName || "Unpirator SDK"} ${sdkVersion} was observed in the latest protected playback.`
            : latestSession
              ? "Playback has been observed, but the installed client did not report an SDK version."
              : "No SDK version has been observed yet.",
          sdkVersion
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
          latestDevice?.lastSeenAt || latestViewer?.updatedAt || null,
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
            ? `A protected playback session was created successfully; latest state is ${latestSession.status}.`
            : "No protected playback session has completed successfully yet.",
          latestSession
            ? null
            : "Start one authorized playback from a verified site using an active API key, trusted viewer email and stable deviceId.",
          "/dashboard/sessions",
          latestSession?.lastHeartbeatAt || latestSession?.startedAt || null,
        ),
        check(
          "gateway-protection",
          hasProtectedPlayback ? "pass" : latestAsset ? "waiting" : "waiting",
          "Gateway & protection path",
          hasProtectedPlayback
            ? "Gateway session sync and protected delivery completed successfully for the latest recorded playback."
            : "The protected gateway path has not been proven by a completed playback session yet.",
          hasProtectedPlayback
            ? null
            : "Create one protected playback session. A successful session confirms gateway sync and the protected-delivery path.",
          "/dashboard/security",
          playbackUsage?.createdAt || null,
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
