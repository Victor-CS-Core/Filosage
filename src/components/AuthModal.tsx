"use client";

import { useAuth } from "@/components/AuthProvider";

interface AuthModalProps {
  onClose: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const { signInWithGoogle } = useAuth();

  const handleGoogle = async () => {
    try {
      await signInWithGoogle();
      onClose();
    } catch (err) {
      console.error("Sign in failed:", err);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(4px)",
          zIndex: 100,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "var(--bg-content)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "40px 36px",
          width: "min(420px, 90vw)",
          boxShadow: "var(--shadow-lg)",
          zIndex: 101,
          textAlign: "center",
          animation: "fadeIn 0.2s ease-out",
        }}
      >
        <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>✦</div>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.5rem",
            fontWeight: 700,
            marginBottom: "8px",
            color: "var(--text-primary)",
          }}
        >
          Sign in to Teach
        </h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "32px", lineHeight: 1.6 }}>
          Save your courses, share them with the world, and access your learning
          from any device.
        </p>

        {/* Google Button */}
        <button
          onClick={handleGoogle}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            padding: "13px 20px",
            background: "var(--bg-content)",
            border: "1.5px solid var(--border-strong)",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            fontSize: "0.95rem",
            fontWeight: 600,
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            transition: "all 0.15s",
            marginBottom: "12px",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-surface)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-strong)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-content)";
          }}
        >
          {/* Google "G" logo SVG */}
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        <button
          onClick={onClose}
          className="btn-ghost"
          style={{ width: "100%", color: "var(--text-muted)" }}
        >
          Maybe later
        </button>
      </div>
    </>
  );
}
