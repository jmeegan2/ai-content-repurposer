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
  const isUploading = uploadProgress !== null && uploadProgress !== undefined;

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div
        className="bg-panel rounded-2xl p-3 transition-colors duration-200"
        style={{ border: "1px solid #3f3f46" }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp4,video/mp4"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          disabled={disabled}
        />

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !pendingFile && !disabled && !dragging && fileInputRef.current?.click()}
          className={`rounded-xl p-7 flex flex-col items-center gap-3 transition-colors duration-200 ${
            disabled
              ? "opacity-50 cursor-not-allowed"
              : dragging
              ? "cursor-copy"
              : pendingFile
              ? "cursor-default"
              : "cursor-pointer"
          }`}
          style={{
            border: dragging
              ? "2px dashed #6723ff"
              : pendingFile
              ? "2px solid #52525b"
              : "2px dashed #3f3f46",
            background: dragging ? "rgba(103,35,255,0.06)" : undefined,
          }}
        >
          {dragging ? (
            <>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(103,35,255,0.18)" }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 2v9M9 2L5.5 5.5M9 2l3.5 3.5" stroke="#6723ff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2.5 13v2a1 1 0 001 1h11a1 1 0 001-1v-2" stroke="#6723ff" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-brand text-sm select-none font-medium">Drop MP4 here</p>
            </>
          ) : pendingFile ? (
            <div className="flex items-center gap-3 w-full justify-center">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(103,35,255,0.12)" }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="2" y="1" width="8" height="12" rx="1.5" stroke="#6723ff" strokeWidth="1.4" />
                  <path d="M5 4h4M5 6.5h4M5 9h2" stroke="#6723ff" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </div>
              <span className="text-white text-sm truncate max-w-[220px]">{pendingFile.name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPendingFile(null); }}
                className="text-zinc-500 hover:text-white text-lg leading-none flex-shrink-0 transition-colors"
              >
                ×
              </button>
            </div>
          ) : (
            <>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(103,35,255,0.12)" }}
              >
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

        {/* Upload progress inside the card */}
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

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-3 w-full bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed text-black py-3 rounded-xl font-semibold text-sm transition-colors select-none"
        >
          {isUploading ? "Uploading…" : "Generate Clips"}
        </button>
      </div>
    </form>
  );
}
