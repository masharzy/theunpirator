"use client";
import { useState } from "react";
import {
  ShieldCheck,
  Play,
  Pause,
  Volume2,
  Maximize,
  LockKeyhole,
  Check,
  CircleStop,
} from "lucide-react";
export function ProtectionPreview() {
  const [playing, setPlaying] = useState(false);
  const [revoked, setRevoked] = useState(false);
  return (
    <div className="protection-preview" aria-label="Interactive protection illustration">
      <div className="preview-top">
        <span>
          <span className="live-dot" /> PROTECTED PLAYBACK
        </span>
        <span>INTERACTIVE PREVIEW</span>
      </div>
      <div className={`preview-film ${playing ? "is-playing" : ""}`}>
        <div className="film-grid" />
        <div className="orb orb-one" />
        <div className="orb orb-two" />
        <div className="orb orb-three" />
        <div className="film-caption">
          <span>THE CREATIVE SERIES / EP. 01</span>
          <h2>
            Ideas into
            <br />
            something real.
          </h2>
        </div>
        <div className="preview-watermark">alex@studio.example · S:8FA2</div>
        <button
          className="preview-play"
          onClick={() => setPlaying(!playing)}
          disabled={revoked}
          aria-label={playing ? "Pause preview animation" : "Play preview animation"}
        >
          {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </button>
        {revoked && (
          <div className="revoked-overlay">
            <LockKeyhole size={28} />
            <strong>Session ended</strong>
            <span>Access revoked. You’re in control.</span>
          </div>
        )}
        <div className="film-controls">
          <Play size={12} />
          <span className="film-progress">
            <i className={playing ? "progress-running" : ""} />
          </span>
          <span>PREVIEW</span>
          <Volume2 size={14} />
          <Maximize size={14} />
        </div>
      </div>
      <div className="preview-details">
        <span className="preview-file">
          <span className="file-icon">
            <Play size={15} />
          </span>
          <span>
            <strong>The creative series</strong>
            <small>Session-bound · Dynamic watermark</small>
          </span>
        </span>
        <ShieldCheck size={22} className="preview-shield" />
      </div>
      <div className="session-card">
        <div className="session-card-top">
          <span>
            <span className={`live-dot ${revoked ? "dot-ended" : ""}`} />
            {revoked ? "SESSION REVOKED" : "VIEWER AUTHORIZED"}
          </span>
          <span>01 DEVICE</span>
        </div>
        <div className="session-person">
          <span className="avatar">AL</span>
          <div>
            <strong>Alex Lee</strong>
            <small>Chrome · macOS</small>
          </div>
          <span className="session-status">
            {revoked ? (
              "Ended"
            ) : (
              <>
                <Check size={12} /> Active
              </>
            )}
          </span>
        </div>
        <button
          onClick={() => {
            setRevoked(!revoked);
            setPlaying(false);
          }}
        >
          <CircleStop size={14} />
          {revoked ? "Reset preview" : "Try revoking this session"}
        </button>
      </div>
      <div className="preview-note">
        <ShieldCheck size={14} /> An illustration of protection in action. No media is streamed.
      </div>
    </div>
  );
}
