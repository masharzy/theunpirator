import { blindIndex, decryptJson, deriveKey, encryptJson } from "@unpirator/crypto";

const EMAIL_CONTEXT = "viewer-email";
const EMAIL_PREFIX_V1 = "enc:v1:";
const EMAIL_PREFIX_V2 = "enc:v2:";

function viewerLookupKey(config) {
  return deriveKey(config.APP_ENCRYPTION_KEY_BASE64, "viewer-email:lookup:v2");
}

function viewerEmailEncryptionKey(config) {
  return deriveKey(config.APP_ENCRYPTION_KEY_BASE64, "viewer-email:encryption:v2");
}

function legacyViewerEmailEncryptionKey(config) {
  const derivedHex = blindIndex(
    "viewer-email-encryption-key",
    config.APP_ENCRYPTION_KEY_BASE64,
    "key-derivation:v1",
  );
  return Buffer.from(derivedHex, "hex").toString("base64");
}

export function normalizeViewerEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function viewerIdentityKey(email, config) {
  const normalized = normalizeViewerEmail(email);
  if (!normalized) throw new Error("Viewer email is required");
  return `email_hmac_v2_${blindIndex(normalized, viewerLookupKey(config), EMAIL_CONTEXT)}`;
}

export function viewerIdentityKeyCandidates(email, config) {
  const normalized = normalizeViewerEmail(email);
  if (!normalized) throw new Error("Viewer email is required");
  return [
    viewerIdentityKey(normalized, config),
    `email_hmac_v1_${blindIndex(
      normalized,
      config.APP_ENCRYPTION_KEY_BASE64,
      EMAIL_CONTEXT,
    )}`,
  ];
}

export function encryptViewerEmail(email, tenantId, config) {
  const normalized = normalizeViewerEmail(email);
  if (!normalized) throw new Error("Viewer email is required");
  return `${EMAIL_PREFIX_V2}${encryptJson(
    { email: normalized },
    viewerEmailEncryptionKey(config),
    `${EMAIL_CONTEXT}:${tenantId}`,
  )}`;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

export function decryptViewerEmail(value, tenantId, config) {
  if (!value) return null;
  const text = String(value);
  if (!text.startsWith("enc:")) {
    return validEmail(text) ? normalizeViewerEmail(text) : null;
  }

  const context = `${EMAIL_CONTEXT}:${tenantId}`;
  const decode = (payload, key) => decryptJson(payload, key, context);
  let decoded = null;

  try {
    if (text.startsWith(EMAIL_PREFIX_V2)) {
      decoded = decode(text.slice(EMAIL_PREFIX_V2.length), viewerEmailEncryptionKey(config));
    } else if (text.startsWith(EMAIL_PREFIX_V1)) {
      const payload = text.slice(EMAIL_PREFIX_V1.length);
      try {
        decoded = decode(payload, legacyViewerEmailEncryptionKey(config));
      } catch {
        // Compatibility for the brief pre-key-separation v1 rollout.
        decoded = decode(payload, config.APP_ENCRYPTION_KEY_BASE64);
      }
    }
  } catch {
    return null;
  }

  return validEmail(decoded?.email) ? normalizeViewerEmail(decoded.email) : null;
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
