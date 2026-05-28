import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { AuthShell } from "./LoginPage";
import { EMAIL_ENABLED } from "../lib/config";

export function SignupPage() {
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
      <AuthShell>
        <p className="text-zinc-300 text-sm">
          {EMAIL_ENABLED
            ? "Check your inbox for a confirmation link. If you don't see it, you may already have an account — try signing in instead."
            : "Account created! You can now sign in."}
        </p>
        <Link to="/login" className="text-zinc-500 text-sm hover:text-zinc-300">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={handleSignUp} className="flex flex-col gap-3">
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
        <input
          type="password"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm outline-none focus:border-brand placeholder:text-zinc-500 transition-colors" style={{ color: 'white', caretColor: 'white' }}
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-white hover:bg-zinc-100 text-black rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          {loading ? "Creating account…" : "Get started free"}
        </button>
      </form>
      <p className="text-zinc-500 text-sm">
        Already have an account?{" "}
        <Link to="/login" className="text-zinc-300 hover:text-white">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
