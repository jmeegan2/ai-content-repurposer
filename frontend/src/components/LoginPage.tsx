import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { EMAIL_ENABLED } from "../lib/config";

type View = "signin" | "forgot" | "forgot-sent";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [view, setView] = useState<View>("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      setError(error.message);
    } else {
      setView("forgot-sent");
    }
    setLoading(false);
  }

  if (view === "forgot-sent") {
    return (
      <AuthShell>
        <p className="text-zinc-300 text-sm">
          Password reset email sent to <span className="text-white">{email}</span>. Check your inbox.
        </p>
        <button
          onClick={() => setView("signin")}
          className="text-zinc-500 text-sm hover:text-zinc-300 text-left"
        >
          Back to sign in
        </button>
      </AuthShell>
    );
  }

  if (view === "forgot") {
    return (
      <AuthShell>
        <form onSubmit={handleForgot} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm outline-none focus:border-brand placeholder:text-zinc-500 transition-colors" style={{ color: 'white', caretColor: 'white' }}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-white hover:bg-zinc-100 text-black rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <button
          onClick={() => { setView("signin"); setError(null); }}
          className="text-zinc-500 text-sm hover:text-zinc-300 text-left"
        >
          Back to sign in
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={handleSignIn} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm outline-none focus:border-brand placeholder:text-zinc-500 transition-colors" style={{ color: 'white', caretColor: 'white' }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm outline-none focus:border-brand placeholder:text-zinc-500 transition-colors" style={{ color: 'white', caretColor: 'white' }}
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-white hover:bg-zinc-100 text-black rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <div className="flex flex-col gap-2">
        {EMAIL_ENABLED && (
          <button
            onClick={() => { setView("forgot"); setError(null); }}
            className="text-zinc-500 text-sm hover:text-zinc-300 text-left"
          >
            Forgot password?
          </button>
        )}
        <p className="text-zinc-500 text-sm">
          No account?{" "}
          <Link to="/signup" className="text-zinc-300 hover:text-white">
            Sign up
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <Link to="/" className="flex items-center gap-2 mb-2">
          <span className="text-xl font-bold tracking-tight">ClipCraft</span>
        </Link>
        <div className="bg-panel border border-zinc-800 rounded-2xl p-8 flex flex-col gap-6">
          {children}
        </div>
      </div>
    </div>
  );
}
