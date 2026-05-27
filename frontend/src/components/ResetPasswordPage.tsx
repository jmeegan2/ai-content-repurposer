import { useState } from "react";
import { supabase } from "../lib/supabase";

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="w-full max-w-sm px-6 flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Set new password</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
          <input
            type="password"
            placeholder="Confirm new password"
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
            {loading ? "..." : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
