import { useEffect, useRef, useState } from "react";

const CLIPS = [
  { img: "/hero/clip-1.jpg", caption: "the most important thing" },
  { img: "/hero/clip-2.jpg", caption: "you need to know this"    },
  { img: "/hero/clip-3.jpg", caption: "wait for the ending"      },
  { img: "/hero/clip-4.jpg", caption: "nobody talks about this"  },
  { img: "/hero/clip-5.jpg", caption: "this changed everything"  },
];

type Phase = "reset" | "scanning" | "revealing" | "holding" | "exiting";

export function HeroAnimation() {
  const [phase, setPhase]             = useState<Phase>("reset");
  const [visibleCount, setVisibleCount] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;

    const sleep = (ms: number) =>
      new Promise<void>((res) => {
        const t = setTimeout(res, ms);
        const id = setInterval(() => { if (cancelled.current) { clearTimeout(t); clearInterval(id); res(); } }, 50);
      });

    async function cycle() {
      while (!cancelled.current) {
        setPhase("reset");
        setVisibleCount(0);
        await sleep(500);

        setPhase("scanning");
        await sleep(900);

        setPhase("revealing");
        for (let i = 1; i <= CLIPS.length; i++) {
          if (cancelled.current) return;
          setVisibleCount(i);
          await sleep(180);
        }

        setPhase("holding");
        await sleep(2800);

        setPhase("exiting");
        await sleep(500);
      }
    }

    cycle();
    return () => { cancelled.current = true; };
  }, []);

  const exiting = phase === "exiting" || phase === "reset";

  return (
    <div
      className="relative w-full max-w-lg mx-auto select-none pointer-events-none"
      aria-hidden
    >
      <style>{`
        @keyframes ha-scan {
          from { transform: translateX(-100%); opacity: 0; }
          8%   { opacity: 1; }
          88%  { opacity: 1; }
          to   { transform: translateX(500%); opacity: 0; }
        }
        @keyframes ha-rise {
          from { opacity: 0; transform: translateY(16px) scale(0.94); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes ha-sink {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(8px); }
        }
        .ha-clip { width: 62px; }
        .ha-clip .ha-caption { font-size: 7px; }
        @media (min-width: 480px) { .ha-clip { width: 90px; } }
        @media (min-width: 480px) { .ha-clip .ha-caption { font-size: 11px; } }
      `}</style>

      {/* ── Wide source video ── */}
      <div
        className="rounded-2xl overflow-hidden relative mb-3"
        style={{
          aspectRatio: "16/9",
          background: "#0c0c14",
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          opacity: phase === "revealing" || phase === "holding" ? 0 : 1,
          transition: "opacity 0.4s ease",
        }}
      >
        {/* Real video frame */}
        <img
          src="/hero/wide.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Scan sweep */}
        {phase === "scanning" && (
          <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            <div style={{
              position: "absolute", top: 0, bottom: 0, width: "22%",
              background:
                "linear-gradient(90deg, transparent 0%, rgba(103,35,255,0.35) 50%, transparent 100%)",
              animation: "ha-scan 0.75s ease-in-out forwards",
            }} />
          </div>
        )}

      </div>

      {/* ── Clips row ── */}
      <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "flex-end" }}>
        {CLIPS.map((clip, i) => {
          const visible = i < visibleCount;
          return (
            <div
              key={i}
              className="ha-clip"
              style={{
                aspectRatio: "9/16",
                borderRadius: 8,
                overflow: "hidden",
                position: "relative",
                flexShrink: 0,
                border: "1px solid rgba(255,255,255,0.09)",
                background: "#0c0c14",
                opacity: visible ? 1 : 0,
                animation: visible
                  ? exiting
                    ? "ha-sink 0.35s ease forwards"
                    : `ha-rise 0.35s cubic-bezier(0.16,1,0.3,1) forwards`
                  : "none",
              }}
            >
              {/* Real clip frame */}
              <img
                src={clip.img}
                alt=""
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              />




            </div>
          );
        })}
      </div>
    </div>
  );
}
