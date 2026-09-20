import { Router } from "express";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { apiKeys, playbackSessions, siteDomains, sites, usageEvents } from "@unpirator/db/schema";
import { notFound } from "../errors.js";

function check(id, status, title, detail, fix = null, href = null, evidence = null) {
  return { id, status, title, detail, fix, href, evidence };
}

export function isCurrentClientVersion(version) {
  return typeof version === "string" && version.startsWith("0.2.");
}

export function findSuccessfulGatewayUsage(events) {
  return events.find(
    (item) => item.type === "gateway_requests" && Number(item.metadata?.status) >= 200 && Number(item.metadata?.status) < 400,
  );
}

function summarize(checks) {
  return {
    total: checks.length,
    passed: checks.filter((item) => item.status === "pass").length,
    critical: checks.filter((item) => item.status === "critical").length,
    warning: checks.filter((item) => item.status === "warning").length,
    manual: checks.filter((item) => item.status === "manual").length,
  };
}

function overallStatus(summary) {
  if (summary.critical) return "critical";
  if (summary.warning) return "needs_attention";
  return "secure";
}

export function integrationHealthRouter({ db, requireTenantDeveloper }) {
  const router = Router();
  router.get("/", requireTenantDeveloper, async (req, res, next) => {
    try {
      const siteRows = await db.select().from(sites).where(and(eq(sites.tenantId, req.tenantId), eq(sites.status, "active"))).orderBy(desc(sites.createdAt));
      const selectedSiteId = typeof req.query.siteId === "string" ? req.query.siteId : null;
      if (selectedSiteId && !siteRows.some((site) => site.id === selectedSiteId)) throw notFound();

      const keyRows = await db.select({ name: apiKeys.name, keyPrefix: apiKeys.keyPrefix, scopes: apiKeys.scopes, expiresAt: apiKeys.expiresAt }).from(apiKeys).where(and(eq(apiKeys.tenantId, req.tenantId), isNull(apiKeys.revokedAt))).orderBy(desc(apiKeys.createdAt));
      const now = Date.now();
      const activeKey = keyRows.find((item) => (!item.expiresAt || new Date(item.expiresAt).getTime() > now) && (item.scopes?.includes("playback:create") || item.scopes?.includes("*"))) || null;

      async function inspectSite(site) {
        const [verifiedDomains, sessions] = await Promise.all([
          db.select({ domain: siteDomains.domain }).from(siteDomains).where(and(eq(siteDomains.siteId, site.id), isNotNull(siteDomains.verifiedAt))).orderBy(desc(siteDomains.verifiedAt)),
          db.select({ id: playbackSessions.id, endUserId: playbackSessions.endUserId, deviceId: playbackSessions.deviceId }).from(playbackSessions).where(and(eq(playbackSessions.tenantId, req.tenantId), eq(playbackSessions.siteId, site.id))).orderBy(desc(playbackSessions.startedAt)).limit(1),
        ]);
        const latestSession = sessions[0] || null;
        const sessionUsage = latestSession ? await db.select({ type: usageEvents.type, metadata: usageEvents.metadata }).from(usageEvents).where(and(eq(usageEvents.tenantId, req.tenantId), eq(usageEvents.sessionId, latestSession.id))).orderBy(desc(usageEvents.createdAt)) : [];
        const playbackUsage = sessionUsage.find((item) => item.type === "playback_sessions");
        const client = playbackUsage?.metadata?.client || {};
        const sdkVersion = typeof client.sdkVersion === "string" ? client.sdkVersion : null;
        const sdkName = typeof client.sdkName === "string" ? client.sdkName : null;
        const verifiedDomain = verifiedDomains[0] || null;
        const checks = [
          check("domain", verifiedDomain ? "pass" : "critical", "Domain verification", verifiedDomain ? `${verifiedDomain.domain} is verified for this site.` : `${site.domain} has not been verified. Protected playback must remain locked.`, verifiedDomain ? null : "Verify the site's primary domain before enabling playback.", "/dashboard/sites"),
          check("api-key", activeKey ? "pass" : "critical", "Server API key", activeKey ? `${activeKey.name} has permission to create playback sessions.` : "No active server API key has playback:create permission.", activeKey ? null : "Create a scoped API key and keep it only in the customer server environment.", "/dashboard/api-keys", activeKey ? { keyPrefix: `${activeKey.keyPrefix}...`, scopes: activeKey.scopes } : null),
          check("sdk-version", isCurrentClientVersion(sdkVersion) ? "pass" : sdkVersion ? "warning" : "manual", "Plugin / SDK version", isCurrentClientVersion(sdkVersion) ? `${sdkName || "Unpirator SDK"} ${sdkVersion} is on the supported 0.2 release line.` : sdkVersion ? `${sdkName || "Unpirator SDK"} ${sdkVersion} is outdated.` : "No client version has been reported for this site yet.", isCurrentClientVersion(sdkVersion) ? null : "Confirm the installed package version after deploying the integration.", "/docs", sdkVersion ? { sdkName: sdkName || "unknown", sdkVersion } : null),
          check("site-binding", latestSession ? "pass" : "manual", "Site binding", latestSession ? "The server has created a session bound to this exact site ID." : "No session evidence exists yet to confirm the configured site ID.", latestSession ? null : "Create one test session and confirm the server uses this site's ID.", "/docs"),
          check("trusted-identity", "manual", "Trusted viewer identity", "The dashboard cannot prove whether your server derived the viewer identity from an authenticated session or trusted browser input.", "Review the server endpoint and reject browser-supplied email, user ID and authorization decisions.", "/docs"),
          check("secret-exposure", "manual", "Secret exposure", "Browser bundles and rendered HTML cannot be inspected safely from the control API.", "Confirm API keys and provider authorization headers exist only in server environment variables.", "/docs"),
          check("source-exposure", "manual", "Protected source exposure", "The control API cannot prove that customer templates or application state omit the original source URL.", "Inspect rendered HTML, serialized data and browser requests for the original protected source URL.", "/docs"),
          check("browser-policy", "manual", "HTTPS, CSP and security headers", "These browser-facing policies require a scan of the deployed customer page.", "Confirm HTTPS, a restrictive Content-Security-Policy and appropriate cookie security attributes.", "/docs"),
        ];
        const summary = summarize(checks);
        return { id: site.id, name: site.name, domain: site.domain, domainVerified: Boolean(verifiedDomain), status: overallStatus(summary), summary, ...(selectedSiteId === site.id ? { checks } : {}) };
      }

      const inspected = await Promise.all(siteRows.map(inspectSite));
      res.set("cache-control", "no-store").json({ scannedAt: new Date().toISOString(), sites: inspected, site: selectedSiteId ? inspected.find((site) => site.id === selectedSiteId) : null });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
