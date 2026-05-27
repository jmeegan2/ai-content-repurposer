import { useState } from "react";
import { supabase } from "../lib/supabase";

type View = "signin" | "forgot" | "forgot-sent";

interface Props {
  onSignUp: () => void;
}

export function LoginPage({ onSignUp }: Props) {
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
      <Shell>
        <p className="text-zinc-300 text-sm">
          Password reset email sent to <span className="text-white">{email}</span>. Check your inbox.
        </p>
        <button
          onClick={() => setView("signin")}
          className="text-zinc-500 text-sm hover:text-zinc-300"
        >
          Back to sign in
        </button>
      </Shell>
    );
  }

  if (view === "forgot") {
    return (
      <Shell>
        <form onSubmit={handleForgot} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-white text-zinc-950 rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "..." : "Send reset link"}
          </button>
        </form>
        <button
          onClick={() => { setView("signin"); setError(null); }}
          className="text-zinc-500 text-sm hover:text-zinc-300"
        >
          Back to sign in
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={handleSignIn} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-white text-zinc-950 rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "..." : "Sign in"}
        </button>
      </form>
      <div className="flex flex-col gap-2">
        <button
          onClick={() => { setView("forgot"); setError(null); }}
          className="text-zinc-500 text-sm hover:text-zinc-300 text-left"
        >
          Forgot password?
        </button>
        <button
          onClick={onSignUp}
          className="text-zinc-500 text-sm hover:text-zinc-300 text-left"
        >
          No account? Sign up
        </button>
      </div>
    </Shell>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="w-full max-w-sm px-6 flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">AI Repurposer</h1>
        {children}
      </div>
    </div>
  );
}
