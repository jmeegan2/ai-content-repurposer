import { useRef, useState } from "react";

interface Props {
  onSubmit: (url: string) => void;
  onFileSubmit: (file: File) => void;
  disabled: boolean;
}

export function UrlForm({ onSubmit, onFileSubmit, disabled }: Props) {
  const [url, setUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = !disabled && (url.trim() !== "" || pendingFile !== null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pendingFile) {
      onFileSubmit(pendingFile);
    } else if (url.trim()) {
      onSubmit(url.trim());
    }
  }

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".mp4")) return;
    setPendingFile(file);
    setUrl("");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUrl(e.target.value);
    if (pendingFile) setPendingFile(null);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 items-stretch">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !pendingFile && !disabled && !dragging && fileInputRef.current?.click()}
        className={`flex-1 min-h-[52px] border-2 rounded-lg transition-colors flex items-center px-4 ${
          disabled ? "opacity-50 cursor-not-allowed border-zinc-700 bg-zinc-900" :
          dragging ? "border-indigo-400 bg-indigo-950 cursor-copy border-dashed" :
          pendingFile ? "border-zinc-600 bg-zinc-900 cursor-default" :
          "border-dashed border-zinc-700 bg-zinc-900 cursor-text"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp4,video/mp4"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          disabled={disabled}
        />

        {dragging ? (
          <p className="w-full text-center text-indigo-300 text-sm select-none">Drop MP4 here</p>
        ) : pendingFile ? (
          <div className="flex items-center justify-between w-full gap-2">
            <span className="text-white text-sm truncate">{pendingFile.name}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPendingFile(null); }}
              className="text-zinc-400 hover:text-white text-lg leading-none flex-shrink-0"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1 w-full" onClick={(e) => e.stopPropagation()}>
            <input
              type="url"
              value={url}
              onChange={handleUrlChange}
              placeholder="Paste a YouTube URL..."
              disabled={disabled}
              className="w-full bg-transparent text-white placeholder-zinc-500 focus:outline-none text-sm disabled:cursor-not-allowed"
            />
            <p className="text-zinc-600 text-xs select-none">or drop an MP4</p>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-6 py-3 rounded-lg transition-colors whitespace-nowrap"
      >
        Generate Clips
      </button>
    </form>
  );
}
