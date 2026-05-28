import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { AuthShell } from "./LoginPage";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setDone(true);
    }
    setLoading(false);
  }

  if (done) {
    return (
      <AuthShell>
        <p className="text-zinc-300 text-sm">Password updated successfully.</p>
        <button
          onClick={() => navigate("/app")}
          className="bg-brand hover:bg-brand-hover text-white rounded-lg px-4 py-3 text-sm font-semibold transition-colors"
        >
          Go to dashboard
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h2 className="text-lg font-semibold">Set new password</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm outline-none focus:border-brand placeholder:text-zinc-500 transition-colors" style={{ color: 'white', caretColor: 'white' }}
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm outline-none focus:border-brand placeholder:text-zinc-500 transition-colors" style={{ color: 'white', caretColor: 'white' }}
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-brand hover:bg-brand-hover text-white rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}
