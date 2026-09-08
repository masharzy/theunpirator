import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PublicNav } from "@/components/public-nav";
export const metadata = { title: "Integration guide | The Unpirator" };
export default function Docs() {
  return (
    <div className="marketing">
      <PublicNav />
      <main className="docs-page">
        <h1>From your site to protected playback.</h1>
        <p>
          Use this guide to connect a customer website to the Control API and universal player. The
          API secret belongs only on your backend.
        </p>
        <h2>1. Create your workspace</h2>
        <ol>
          <li>
            <Link href="/register">Register an account</Link> and open Sites in the dashboard.
          </li>
          <li>Add your website domain and verify it with DNS, a meta tag or a text file.</li>
          <li>
            For YouTube Custom, videos are discovered on demand. Other providers use registered
            assets and allowed origin hosts.
          </li>
          <li>
            Create an API key with the playback:create scope. Save the secret when it is first
            shown.
          </li>
        </ol>
        <h2>2. Authorize the viewer on your backend</h2>
        <p>
          Check your own login and course or membership permissions before calling this endpoint.
          Supply a stable external user ID and a registered device identifier.
        </p>
        <pre>{`POST /v1/playback/sessions
Authorization: Bearer YOUR_SERVER_API_KEY
Content-Type: application/json
Idempotency-Key: UNIQUE_REQUEST_ID

{
  "siteId": "YOUR_SITE_UUID",
  "source": {
    "provider": "youtube_custom",
    "url": "https://www.youtube.com/watch?v=VIDEO_ID"
  },
  "externalUserId": "student-123",
  "deviceId": "stable-device-id",
  "displayLabel": "Student 123",
  "client": { "browser": "Chrome", "os": "Windows" }
}`}</pre>
        <h2>3. Protect existing YouTube players</h2>
        <p>
          Initialize the player plugin once. It finds current and dynamically-added YouTube embeds,
          requests an authorized session from your backend and replaces them with protected players.
        </p>
        <pre>{`import { protectYoutubeEmbeds } from '@unpirator/player';

const stop = protectYoutubeEmbeds({
  endpoint: '/api/unpirator/playback'
});

// When your application unmounts:
// stop();`}</pre>
        <h2>4. Manage access</h2>
        <p>
          The dashboard shows sessions and devices. Revoke a session to reject subsequent gateway
          requests. The player checks session status on a heartbeat; already downloaded media cannot
          be recalled. Watermarks discourage redistribution but cannot prevent screen capture.
        </p>
        <h2 id="plans">Workspace plan limits</h2>
        <p>
          Starter: 1 site, 2 devices per viewer and 1 concurrent stream. Pro: 3 sites, 4 devices and
          2 streams. Business: 10 sites, 8 devices and 3 streams. Paid checkout is not available; a
          platform administrator manages plan assignments.
        </p>
        <h2>Providers and framework examples</h2>
        <p>
          YouTube Custom sources are resolved when a viewer presses play and reused internally;
          customers do not register every video. Direct MP4, HLS, S3, Cloudflare R2 and Bunny use
          explicit assets. Keep provider credentials server-side and encrypted.
        </p>
        <h2>Deployment</h2>
        <p>
          Run PostgreSQL and Redis, apply database migrations and configure the API signing keys.
          The Cloudflare gateway uses only public verification keys. Configure a verified domain,
          HTTPS and separate credentials for production. Detailed deployment, backup and incident
          procedures are in the repository docs directory.
        </p>
        <Link href="/" className="text-cta" style={{ marginTop: 32 }}>
          <ArrowLeft size={16} /> Back to home
        </Link>
      </main>
    </div>
  );
}
