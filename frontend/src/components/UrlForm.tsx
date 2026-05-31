import { useRef, useState } from "react";

interface Props {
  onFileSelect: (file: File) => void;
  onGenerateClips: () => void;
  onCancelUpload?: () => void;
  onCancelPending?: () => void;
  uploadProgress?: number | null;
  uploadDone?: boolean;
  pendingThumbnailUrl?: string;
  processing?: boolean;
  disabled: boolean;
}

export function UrlForm({
  onFileSelect,
  onGenerateClips,
  onCancelUpload,
  onCancelPending,
  uploadProgress,
  uploadDone,
  pendingThumbnailUrl,
  processing,
  disabled,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUploading = uploadProgress !== null && uploadProgress !== undefined;

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".mp4")) return;
    onFileSelect(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  // Upload done — show thumbnail + Generate Clips button
  if (uploadDone) {
    return (
      <div className="flex flex-col gap-3">
        <div
          className="bg-panel rounded-2xl p-3"
          style={{ border: "1px solid #3f3f46" }}
        >
          <div className="relative rounded-xl overflow-hidden aspect-video bg-zinc-800">
            {pendingThumbnailUrl && (
              <img src={pendingThumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-black/40" />
            {onCancelPending && (
              <button
                type="button"
                onClick={onCancelPending}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white text-sm transition-colors"
                aria-label="Cancel"
              >
                ×
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onGenerateClips}
            disabled={processing}
            className="mt-3 w-full bg-white hover:bg-zinc-100 disabled:opacity-60 disabled:cursor-not-allowed text-black py-3 rounded-xl font-semibold text-sm transition-colors select-none flex items-center justify-center gap-2"
          >
            {processing && (
              <svg className="animate-spin h-4 w-4 text-black" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {processing ? "Starting…" : "Generate Clips"}
          </button>
        </div>
      </div>
    );
  }

  // Idle / uploading — drop zone always visible, progress appears below it
  return (
    <div className="bg-panel rounded-2xl p-3" style={{ border: "1px solid #3f3f46" }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp4,video/mp4"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        disabled={disabled}
      />
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled && !isUploading) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && !isUploading && !dragging && fileInputRef.current?.click()}
        className={`rounded-xl p-7 flex flex-col items-center gap-3 transition-colors duration-200 ${
          disabled || isUploading ? "opacity-50 cursor-not-allowed" : dragging ? "cursor-copy" : "cursor-pointer"
        }`}
        style={{
          border: dragging ? "2px dashed #6723ff" : "2px dashed #3f3f46",
          background: dragging ? "rgba(103,35,255,0.06)" : undefined,
        }}
      >
        {dragging ? (
          <>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(103,35,255,0.18)" }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2v9M9 2L5.5 5.5M9 2l3.5 3.5" stroke="#6723ff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2.5 13v2a1 1 0 001 1h11a1 1 0 001-1v-2" stroke="#6723ff" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-brand text-sm select-none font-medium">Drop MP4 here</p>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(103,35,255,0.12)" }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2v9M9 2L5.5 5.5M9 2l3.5 3.5" stroke="#6723ff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2.5 13v2a1 1 0 001 1h11a1 1 0 001-1v-2" stroke="#6723ff" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-zinc-500 text-sm select-none">
              Drop an MP4 or{" "}
              <span className="text-zinc-200 font-medium">click to browse</span>
            </p>
          </>
        )}
      </div>

      {isUploading && (
        <div className="mt-3 flex flex-col gap-1.5 px-1">
          <div className="w-full bg-zinc-800 rounded-full h-1">
            <div
              className="bg-brand h-1 rounded-full transition-all duration-200"
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
