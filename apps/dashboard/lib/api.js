// Vercel uses /control-api as a same-origin proxy to the temporary API project.
// Local development and a future VPS can keep using an absolute URL.
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4100";
function csrf() {
  if (typeof document === "undefined") return "";
  return (
    document.cookie
      .split("; ")
      .find((v) => v.startsWith("ap_csrf="))
      ?.split("=")
      .slice(1)
      .join("=") || ""
  );
}
export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (!["GET", "HEAD"].includes(options.method || "GET"))
    headers.set("x-csrf-token", decodeURIComponent(csrf()));
  const tenantId =
    typeof window !== "undefined" ? localStorage.getItem("unpirator_tenant_id") : null;
  if (tenantId) headers.set("x-tenant-id", tenantId);
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Request failed (${response.status})`);
  return data;
}
export { API };
