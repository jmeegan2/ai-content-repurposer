import { useRef, useState } from "react";

interface Props {
  onSubmit: (url: string) => void;
  onFileSubmit: (file: File) => void;
  disabled: boolean;
}

export function UrlForm({ onSubmit, onFileSubmit, disabled }: Props) {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"url" | "file">("url");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (url.trim()) onSubmit(url.trim());
  }

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".mp4")) return;
    setFileName(file.name);
    setPendingFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleFileSubmit() {
    if (pendingFile) onFileSubmit(pendingFile);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === "url" ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}
        >
          YouTube URL
        </button>
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === "file" ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}
        >
          Upload MP4
        </button>
      </div>

      {mode === "url" ? (
        <form onSubmit={handleUrlSubmit} className="flex gap-3">
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
      ) : (
        <div className="flex gap-3 items-stretch">
          <div
            onClick={() => !disabled && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex-1 border-2 border-dashed rounded-lg px-4 py-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${
              disabled ? "opacity-50 cursor-not-allowed" :
              dragging ? "border-indigo-400 bg-indigo-950" :
              "border-zinc-700 hover:border-zinc-500"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,video/mp4"
              className="hidden"
              onChange={handleFileInput}
              disabled={disabled}
            />
            {fileName ? (
              <p className="text-white text-sm font-medium">{fileName}</p>
            ) : (
              <>
                <p className="text-zinc-400 text-sm">Drop an MP4 here or click to browse</p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleFileSubmit}
            disabled={disabled || !pendingFile}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-6 py-3 rounded-lg transition-colors whitespace-nowrap"
          >
            Generate Clips
          </button>
        </div>
      )}
    </div>
  );
}
