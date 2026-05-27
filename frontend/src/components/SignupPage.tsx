import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Shell } from "./LoginPage";
import { EMAIL_ENABLED } from "../lib/config";

interface Props {
  onSignIn: () => void;
}

export function SignupPage({ onSignIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else if (!data.session) {
      setDone(true);
    }
    setLoading(false);
  }

  if (done) {
    return (
      <Shell>
        <p className="text-zinc-300 text-sm">
          {EMAIL_ENABLED
            ? "Check your inbox for a confirmation link. If you don't see it, you may already have an account — try signing in instead."
            : "Account created! You can now sign in."}
        </p>
        <button
          onClick={onSignIn}
          className="text-zinc-500 text-sm hover:text-zinc-300"
        >
          Back to sign in
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={handleSignUp} className="flex flex-col gap-3">
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
        <input
          type="password"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-white text-zinc-950 rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "..." : "Sign up"}
        </button>
      </form>
      <button
        onClick={onSignIn}
        className="text-zinc-500 text-sm hover:text-zinc-300 text-left"
      >
        Have an account? Sign in
      </button>
    </Shell>
  );
}
