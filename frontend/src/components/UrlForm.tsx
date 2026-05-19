import { useRef, useState } from "react";

interface Props {
  onFileSubmit: (file: File) => void;
  disabled: boolean;
  uploadProgress?: number | null;
  onCancelUpload?: () => void;
}

export function UrlForm({ onFileSubmit, disabled, uploadProgress, onCancelUpload }: Props) {
  const [dragging, setDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = !disabled && pendingFile !== null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pendingFile) onFileSubmit(pendingFile);
  }

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".mp4")) return;
    setPendingFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="flex flex-col gap-2">
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
            "border-dashed border-zinc-700 bg-zinc-900 cursor-pointer"
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
            <p className="text-zinc-500 text-sm select-none">Drop an MP4 or click to browse</p>
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

      {uploadProgress !== null && (
        <div className="flex flex-col gap-1">
          <div className="w-full bg-zinc-800 rounded-full h-1.5">
            <div
              className="bg-indigo-500 h-1.5 rounded-full transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-zinc-500 text-xs">Uploading… {uploadProgress}%</p>
            {onCancelUpload && (
              <button
                type="button"
                onClick={onCancelUpload}
                className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
