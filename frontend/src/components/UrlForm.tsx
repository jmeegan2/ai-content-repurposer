import { useState } from 'react';

interface Props {
  onSubmit: (url: string) => void;
  disabled: boolean;
}

export function UrlForm({ onSubmit, disabled }: Props) {
  const [url, setUrl] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (url.trim()) onSubmit(url.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://youtube.com/watch?v=..."
        disabled={disabled}
        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      />
      <button
        type="submit"
        disabled={disabled || !url.trim()}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-6 py-3 rounded-lg transition-colors whitespace-nowrap"
      >
        Generate Clips
      </button>
    </form>
  );
}
