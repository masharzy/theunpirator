import { blindIndex, decryptJson, encryptJson } from "@unpirator/crypto";

const EMAIL_PREFIX = "enc:v1:";
const EMAIL_CONTEXT = "viewer-email";

export function normalizeViewerEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function viewerIdentityKey(email, config) {
  const normalized = normalizeViewerEmail(email);
  if (!normalized) throw new Error("Viewer email is required");
  return `email_hmac_v1_${blindIndex(
    normalized,
    config.APP_ENCRYPTION_KEY_BASE64,
    EMAIL_CONTEXT,
  )}`;
}

export function encryptViewerEmail(email, tenantId, config) {
  const normalized = normalizeViewerEmail(email);
  if (!normalized) throw new Error("Viewer email is required");
  return `${EMAIL_PREFIX}${encryptJson(
    { email: normalized },
    config.APP_ENCRYPTION_KEY_BASE64,
    `${EMAIL_CONTEXT}:${tenantId}`,
  )}`;
}

export function decryptViewerEmail(value, tenantId, config) {
  if (!value) return null;
  const text = String(value);
  if (!text.startsWith(EMAIL_PREFIX)) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? normalizeViewerEmail(text) : null;
  }
  try {
    const decoded = decryptJson(
      text.slice(EMAIL_PREFIX.length),
      config.APP_ENCRYPTION_KEY_BASE64,
      `${EMAIL_CONTEXT}:${tenantId}`,
    );
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(decoded?.email || "")
      ? normalizeViewerEmail(decoded.email)
      : null;
  } catch {
    return null;
  }
}

export function publicViewer(row, tenantId, config) {
  if (!row) return null;
  return {
    id: row.id,
    email: decryptViewerEmail(row.displayLabel, tenantId, config),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
