import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  Fingerprint,
  Layers3,
  Globe2,
  Radio,
  LockKeyhole,
  Check,
  Code2,
  Zap,
  Play,
} from "lucide-react";
import { ProtectionPreview } from "@/components/protection-preview";
const features = [
  [
    LockKeyhole,
    "Your content. Your rules.",
    "Short-lived, signed playback grants keep access tied to the right viewer, asset and session. Your storage credentials stay on the server.",
    "01 / ACCESS CONTROL",
  ],
  [
    Fingerprint,
    "Put a name to every stream.",
    "Moving viewer watermarks add accountability. Register devices, set concurrent stream limits and end sessions from your dashboard.",
    "02 / VIEWER PROTECTION",
  ],
  [
    Globe2,
    "Keep your origin behind the scenes.",
    "Deliver registered MP4 and HLS assets through a separate media gateway, with streaming responses and support for seeking.",
    "03 / SECURE DELIVERY",
  ],
  [
    Radio,
    "See what happens after play.",
    "Explore playback sessions, gateway usage and security events in one workspace. Send signed webhook events to your own tools.",
    "04 / VISIBILITY",
  ],
];
const faqs = [
  [
    "Does this make videos impossible to copy?",
    "No. No browser player can prevent every recording or screen capture. The Unpirator combines server-side authorization, short-lived playback tokens, session revocation and visible watermarks to control access and discourage sharing.",
  ],
  [
    "Do I need to move my video library?",
    "You can register authorized assets from S3-compatible storage including R2, Bunny, or your own HTTP origin. The gateway delivers those assets while your existing storage remains in place.",
  ],
  [
    "Can I use this with my existing website?",
    "Yes. Your backend verifies the viewer’s access and requests a playback session. The JavaScript player runs on your site. Integration examples are available for Next.js, PHP, Laravel, Django and WordPress.",
  ],
  [
    "What happens when a session is revoked?",
    "Subsequent gateway requests are rejected and the player stops when its heartbeat detects the revocation. Media that has already reached the viewer’s browser cannot be recalled.",
  ],
  [
    "What is included in the plans?",
    "Workspace plans define site, device and concurrent stream limits. Paid checkout is not enabled. The comparison describes configured limits, without implying a paid subscription is available.",
  ],
];
export default function Home() {
  return (
    <div className="marketing">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link href="/" className="wordmark" aria-label="The Unpirator home">
          <span className="brand-symbol">
            <ShieldCheck size={21} />
          </span>
          unpirator<span className="brand-dot">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#platform">Platform</a>
          <a href="#how-it-works">How it works</a>
          <a href="#integrations">Developers</a>
          <a href="#plans">Plans</a>
        </nav>
        <div className="header-actions">
          <Link href="/login" className="login-link">
            Log in <ArrowUpRight size={14} />
          </Link>
          <Link href="/register" className="small-cta">
            Get started <ArrowRight size={15} />
          </Link>
        </div>
      </header>
      <main id="main">
        <section className="hero section-wrap">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" /> YOUR CONTENT DESERVES A BOUNDARY
            </div>
            <h1>
              Made to be watched.
              <br />
              <span>Not passed around.</span>
            </h1>
            <p>
              You did the hard part. You made something worth watching. Keep it in the right hands
              with protected playback, viewer watermarks and control over every session.
            </p>
            <div className="hero-actions">
              <Link href="/register" className="primary-cta">
                Protect your content <ArrowUpRight size={20} />
              </Link>
              <a className="text-cta" href="#how-it-works">
                <span className="play-circle">
                  <Play size={12} fill="currentColor" />
                </span>
                See how it works
              </a>
            </div>
            <div className="hero-notes">
              <span>
                <Check size={14} /> Bring your own storage
              </span>
              <span>
                <Check size={14} /> Works with your website
              </span>
            </div>
          </div>
          <ProtectionPreview />
          <div className="hero-bottom">
            <span>YOUR LIBRARY. YOUR STACK. MORE CONTROL.</span>
            <div>
              <span>Cloudflare R2</span>
              <span>Amazon S3</span>
              <span>bunny.net</span>
              <span>HLS</span>
              <span>MP4</span>
            </div>
          </div>
        </section>
        <section id="platform" className="section-wrap platform-section">
          <div className="section-intro">
            <div>
              <div className="eyebrow">PROTECTION, BEYOND THE PLAY BUTTON</div>
              <h2>
                A little less sharing.
                <br />A lot more control.
              </h2>
            </div>
            <p>
              A hidden link isn’t an access policy. Connect your website, your viewers and your
              media through one protected playback system.
            </p>
          </div>
          <div className="feature-grid">
            {features.map(([Icon, title, description, label]) => (
              <article className="feature-card" key={title}>
                <div className="feature-top">
                  <Icon size={24} strokeWidth={1.5} />
                  <span>{label}</span>
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="how-it-works" className="workflow-section">
          <div className="section-wrap">
            <div className="section-intro">
              <div>
                <div className="eyebrow">FROM YOUR LIBRARY TO THEIR SCREEN</div>
                <h2>
                  Three steps.
                  <br />
                  One protected stream.
                </h2>
              </div>
              <a href="#integrations" className="text-cta">
                Explore the integration <ArrowUpRight size={18} />
              </a>
            </div>
            <div className="workflow-grid">
              {[
                [
                  "01",
                  Layers3,
                  "Connect your content",
                  "Create a workspace, verify your site’s domain and register the media you’re authorized to deliver.",
                ],
                [
                  "02",
                  Code2,
                  "Authorize your viewer",
                  "Your backend checks course or membership access, then requests a short-lived playback grant.",
                ],
                [
                  "03",
                  ShieldCheck,
                  "Press play. Stay in control.",
                  "The player streams through the gateway. Track sessions, apply device limits and revoke access when needed.",
                ],
              ].map(([n, Icon, title, body]) => (
                <article key={n}>
                  <div className="step-line">
                    <span>{n}</span>
                    <Icon size={24} />
                  </div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
            <div className="flow-strip">
              <span>Your website</span>
              <ArrowRight />
              <span>Playback grant</span>
              <ArrowRight />
              <strong>
                <ShieldCheck size={17} />
                Unpirator gateway
              </strong>
              <ArrowRight />
              <span>Your media origin</span>
            </div>
          </div>
        </section>
        <section id="integrations" className="section-wrap developer-section">
          <div>
            <div className="eyebrow">FITS RIGHT INTO YOUR STACK</div>
            <h2>
              Keep your platform.
              <br />
              Add the protection.
            </h2>
            <p>
              Use the universal JavaScript player with a small server-side integration. Your backend
              owns the access decision. The browser never needs your secret API key.
            </p>
            <div className="integration-tags">
              {["JavaScript", "Next.js", "PHP", "Laravel", "Django", "WordPress"].map((v) => (
                <span key={v}>{v}</span>
              ))}
            </div>
            <Link className="text-cta" href="/docs">
              Read the integration guide <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="code-window">
            <div className="code-title">
              <span>
                <i />
                <i />
                <i />
              </span>
              your-course-page.js <Code2 size={15} />
            </div>
            <pre>
              <code>
                <span className="code-comment">
                  {"// Your backend checks course access first.\n"}
                </span>
                {"import { mountProtectedPlayer }\n  from '@unpirator/player';\n\n"}
                <span className="code-green">{"await mountProtectedPlayer({\n"}</span>
                {
                  "  element: '#course-player',\n  bootstrap: async () => {\n    const response = await fetch(\n      '/api/course/playback-token',\n      { method: 'POST' }\n    );\n    if (!response.ok) throw new Error(\n      'Access could not be verified'\n    );\n    return response.json();\n  },\n});"
                }
              </code>
            </pre>
            <div className="code-footer">
              <LockKeyhole size={14} /> Secret keys stay on your server.
            </div>
          </div>
        </section>
        <section className="use-cases section-wrap">
          <div className="eyebrow">BUILT FOR CONTENT WORTH PROTECTING</div>
          <div className="use-case-grid">
            {[
              [
                "For educators",
                "Your lessons belong with your students.",
                "Protect course libraries and manage playback across student devices.",
              ],
              [
                "For membership platforms",
                "Make exclusive mean something.",
                "Connect membership checks to session access for your video collection.",
              ],
              [
                "For product teams",
                "Your infrastructure. One access layer.",
                "Add media protection to an existing platform with a versioned API.",
              ],
            ].map(([a, b, c]) => (
              <article key={a}>
                <span>{a}</span>
                <h3>{b}</h3>
                <p>{c}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="plans" className="section-wrap plans-section">
          <div className="section-intro">
            <div>
              <div className="eyebrow">ROOM TO GROW</div>
              <h2>
                Start with your first site.
                <br />
                Grow on your terms.
              </h2>
            </div>
            <p>
              Workspace tiers for different playback needs. These are configured access limits; paid
              checkout is not yet available.
            </p>
          </div>
          <div className="plan-grid">
            {[
              [
                "Starter",
                "For your first protected library.",
                "1 site",
                "2 devices per viewer",
                "1 concurrent stream",
                "Block additional streams",
              ],
              [
                "Pro",
                "For a growing learning platform.",
                "3 sites",
                "4 devices per viewer",
                "2 concurrent streams",
                "Replace older sessions",
              ],
              [
                "Business",
                "For multiple content properties.",
                "10 sites",
                "8 devices per viewer",
                "3 concurrent streams",
                "Replace older sessions",
              ],
            ].map(([name, desc, ...items], i) => (
              <article key={name} className={`plan-card ${i === 1 ? "featured-plan" : ""}`}>
                <div className="plan-heading">
                  <h3>{name}</h3>
                  {i === 1 && <span>MORE FLEXIBILITY</span>}
                </div>
                <p>{desc}</p>
                <div className="plan-label">Workspace tier</div>
                <ul>
                  {[...items, "Protected playback", "Dynamic watermark"].map((item) => (
                    <li key={item}>
                      <Check size={16} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href={i === 0 ? "/register" : "/docs#plans"}>
                  {i === 0 ? "Create a workspace" : "Explore plan limits"}
                  <ArrowUpRight size={18} />
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section className="section-wrap faq-section">
          <div>
            <div className="eyebrow">A FEW THINGS TO KNOW</div>
            <h2>
              Good questions.
              <br />
              Straight answers.
            </h2>
          </div>
          <div className="faq-list">
            {faqs.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <span>+</span>
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="closing-cta section-wrap">
          <div className="eyebrow">
            <Zap size={15} /> TAKE BACK THE PLAY BUTTON
          </div>
          <h2>
            Your next great video.
            <br />
            Your rules.
          </h2>
          <Link className="primary-cta" href="/register">
            Create your workspace <ArrowUpRight size={19} />
          </Link>
          <p>Connect your site. Register your media. Control the stream.</p>
        </section>
      </main>
      <footer className="site-footer section-wrap">
        <Link href="/" className="wordmark">
          <span className="brand-symbol">
            <ShieldCheck size={20} />
          </span>
          unpirator.
        </Link>
        <p>Good content deserves good boundaries.</p>
        <div>
          <Link href="/docs">Documentation</Link>
          <a href="#platform">Platform</a>
          <Link href="/login">
            Dashboard <ArrowUpRight size={13} />
          </Link>
        </div>
        <small>© {new Date().getFullYear()} The Unpirator</small>
      </footer>
    </div>
  );
}
