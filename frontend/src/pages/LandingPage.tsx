import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeroAnimation } from "../components/HeroAnimation";


const STEPS = [
  { n: "01", title: "Upload your episode", desc: "Drop any podcast recording MP4 directly into the app." },
  { n: "02", title: "AI finds the moments", desc: "HorizonClips scans your episode for the most shareable clips and adds word-level captions automatically." },
  { n: "03", title: "Post to YouTube Shorts", desc: "9:16 clips post directly to your YouTube channel — no editing required." },
];

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="8" r="4" stroke="#6723ff" strokeWidth="1.6"/>
        <path d="M3 19c0-4 3.6-7 8-7s8 3 8 7" stroke="#6723ff" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M16 6l2-2M6 6L4 4" stroke="#6723ff" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
    title: "Face-tracked framing",
    desc: "Your host and guests stay centered in every cut. No manual cropping, ever.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="3" y="6" width="16" height="10" rx="2" stroke="#6723ff" strokeWidth="1.6"/>
        <path d="M7 10h8M7 13h5" stroke="#6723ff" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
    title: "Burned-in captions",
    desc: "Word-level captions, perfectly synced and burned in automatically.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="7" y="2" width="8" height="18" rx="2" stroke="#6723ff" strokeWidth="1.6"/>
        <circle cx="11" cy="17" r="1" fill="#6723ff"/>
      </svg>
    ),
    title: "Posts to YouTube Shorts",
    desc: "Clips upload directly to your YouTube channel. One click, done.",
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <style>{`
@keyframes cc-fadeup {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .cc-fu { animation: cc-fadeup 0.55s cubic-bezier(0.16,1,0.3,1) both; }
        .cc-fu-1 { animation-delay: 0.05s; }
        .cc-fu-2 { animation-delay: 0.15s; }
        .cc-fu-3 { animation-delay: 0.25s; }
        .cc-fu-4 { animation-delay: 0.35s; }
        .cc-fu-5 { animation-delay: 0.45s; }
      `}</style>

      <div className="bg-surface text-white min-h-screen antialiased">

        {/* ── Nav ── */}
        <nav
          className={`sticky top-0 z-50 transition-all duration-300 ${
            scrolled
              ? "border-b border-zinc-800 bg-surface/90 backdrop-blur-md"
              : "bg-transparent"
          }`}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
            <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight select-none shrink-0">
              <img src="/favicon.svg" className="h-7 w-7" alt="" />
              HorizonClips
            </Link>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <Link
                to="/login"
                className="text-zinc-400 hover:text-white text-sm px-3 sm:px-4 py-2 transition-colors rounded-lg hover:bg-zinc-800/50 whitespace-nowrap"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="bg-white hover:bg-zinc-100 text-black text-sm font-semibold px-3 sm:px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
              >
                <span className="hidden sm:inline">Get Started Free</span>
                <span className="sm:hidden">Get Started</span>
              </Link>
            </div>
          </div>
        </nav>

        {/* ── Hero ── */}
        <section className="relative pt-20 pb-4 px-6 flex flex-col items-center text-center overflow-hidden">
          {/* Ambient glow */}
          <div
            aria-hidden
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at 50% 0%, rgba(103,35,255,0.14) 0%, transparent 65%)",
            }}
          />

          {/* Eyebrow */}
          <div
            className="cc-fu cc-fu-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 mb-7"
            style={{
              border: "1px solid rgba(103,35,255,0.35)",
              background: "rgba(103,35,255,0.09)",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-brand" />
            <span className="text-brand text-xs font-semibold uppercase tracking-widest">
              Built for Podcasters
            </span>
          </div>


          {/* H1 */}
          <h1 className="cc-fu cc-fu-2 font-bold tracking-tight leading-[1.05] mb-5 max-w-3xl text-5xl sm:text-6xl md:text-7xl">
            <span
              style={{
                background: "linear-gradient(175deg, #ffffff 30%, #71717a 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Podcasts into Shorts, automatically
            </span>
            <br />
            <span className="text-zinc-500">No editing required.</span>
          </h1>

          {/* Subtext */}
          <p className="cc-fu cc-fu-3 text-zinc-400 text-lg max-w-md mb-10 leading-relaxed">
            Upload your podcast recording. HorizonClips finds the best moments, crops them vertical, burns in captions, and posts directly to YouTube Shorts.
          </p>

          {/* Fake upload widget */}
          <div
            className="cc-fu cc-fu-4 w-full max-w-md mb-3 cursor-pointer group"
            onClick={() => navigate("/signup")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && navigate("/signup")}
            aria-label="Get started — sign up"
          >
            <div
              className="bg-panel rounded-2xl p-3 transition-colors duration-200 group-hover:border-zinc-600"
              style={{ border: "1px solid #3f3f46" }}
            >
              <div
                className="rounded-xl p-7 flex flex-col items-center gap-3 transition-colors duration-200"
                style={{ border: "2px dashed #3f3f46" }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(103,35,255,0.12)" }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path
                      d="M9 2v9M9 2L5.5 5.5M9 2l3.5 3.5"
                      stroke="#6723ff"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2.5 13v2a1 1 0 001 1h11a1 1 0 001-1v-2"
                      stroke="#6723ff"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <p className="text-zinc-500 text-sm select-none">
                  Drop an MP4 or{" "}
                  <span className="text-zinc-200 font-medium">click to browse</span>
                </p>
              </div>
              <button
                className="mt-3 w-full bg-white text-black py-3 rounded-xl font-semibold text-sm pointer-events-none select-none"
                tabIndex={-1}
              >
                Generate Clips
              </button>
            </div>
          </div>

          <p className="cc-fu cc-fu-4 text-zinc-600 text-xs mb-10 select-none">
            Free to start · No credit card required
          </p>

          {/* Demo animation */}
          <div className="cc-fu cc-fu-5 w-full max-w-lg mb-4">
            <HeroAnimation />
          </div>

        </section>

        {/* ── How It Works ── */}
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-zinc-600 text-xs uppercase tracking-widest font-semibold mb-3">
                How it works
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold">Three steps. Zero effort.</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
              {STEPS.map(({ n, title, desc }) => (
                <div key={n} className="flex flex-col gap-4">
                  <span
                    className="text-6xl font-bold tabular-nums leading-none"
                    style={{ color: "rgba(103,35,255,0.35)" }}
                  >
                    {n}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold mb-1.5">{title}</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section
          className="py-28 px-6"
          style={{ background: "rgba(255,255,255,0.015)" }}
        >
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-zinc-600 text-xs uppercase tracking-widest font-semibold mb-3">
                Features
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold">Built for podcasters who want to grow.</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {FEATURES.map(({ icon, title, desc }) => (
                <div
                  key={title}
                  className="bg-panel border border-zinc-800 rounded-2xl p-6 flex flex-col gap-5"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(103,35,255,0.1)" }}
                  >
                    {icon}
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1.5 text-sm">{title}</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing Teaser ── */}
        <section className="py-28 px-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-zinc-600 text-xs uppercase tracking-widest font-semibold mb-3">
                Pricing
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold">Start free. Scale as you grow.</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
              {/* Free */}
              <div className="bg-panel border border-zinc-800 rounded-2xl p-8 flex flex-col gap-6">
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wider font-semibold">Free</p>
                  <p className="text-5xl font-bold mt-2">$0</p>
                </div>
                <ul className="flex flex-col gap-2.5 text-sm text-zinc-400">
                  <li className="flex items-center gap-2">
                    <span className="text-zinc-600">—</span> 30 credits to start
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-zinc-600">—</span> Try the full pipeline
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-zinc-600">—</span> No credit card required
                  </li>
                </ul>
                <Link
                  to="/signup"
                  className="block text-center bg-white hover:bg-zinc-100 text-black text-sm font-semibold py-3 rounded-xl transition-colors"
                >
                  Try it out
                </Link>
              </div>
              {/* Pro */}
              <div
                className="rounded-2xl p-8 flex flex-col gap-6"
                style={{
                  background:
                    "linear-gradient(140deg, rgba(103,35,255,0.12) 0%, #18181b 55%)",
                  border: "1px solid rgba(103,35,255,0.3)",
                }}
              >
                <div>
                  <p className="text-brand text-xs uppercase tracking-wider font-semibold">Pro</p>
                  <p className="text-5xl font-bold mt-2">
                    $9.99
                    <span className="text-lg font-normal text-zinc-500">/mo</span>
                  </p>
                </div>
                <ul className="flex flex-col gap-2.5 text-sm text-zinc-300">
                  <li className="flex items-center gap-2">
                    <span className="text-brand">✓</span> 150 credits per month
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-brand">✓</span> 9:16 crop + burned captions
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-brand">✓</span> YouTube Shorts ready
                  </li>
                </ul>
                <Link
                  to="/signup"
                  className="block text-center bg-white hover:bg-zinc-100 text-black text-sm font-semibold py-3 rounded-xl transition-colors"
                >
                  Get Started
                </Link>
              </div>
            </div>
            <div className="text-center">
              <Link
                to="/pricing"
                className="text-zinc-600 hover:text-zinc-400 text-sm transition-colors"
              >
                See full pricing →
              </Link>
            </div>
          </div>
        </section>

        {/* ── Bottom CTA ── */}
        <section className="relative py-20 px-6 text-center overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at 50% 100%, rgba(103,35,255,0.12) 0%, transparent 60%)",
            }}
          />
          <h2
            className="text-3xl sm:text-4xl font-bold mb-3 leading-tight"
            style={{
              background: "linear-gradient(175deg, #ffffff 40%, #71717a 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Grow your podcast on YouTube Shorts.
          </h2>
          <p className="text-zinc-500 text-base mb-8">Upload your first episode and see what clips in seconds.</p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2.5 bg-white hover:bg-zinc-100 text-black font-semibold px-8 py-4 rounded-xl text-sm transition-colors"
          >
            Get Started Free
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 7h10M8 3l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t border-zinc-900 py-8 px-6">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="font-bold text-sm">HorizonClips</span>
            <p className="text-zinc-700 text-xs">© 2026 HorizonClips. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <Link to="/login" className="text-zinc-600 hover:text-zinc-300 text-sm transition-colors">
                Sign in
              </Link>
              <Link to="/signup" className="text-zinc-600 hover:text-zinc-300 text-sm transition-colors">
                Sign up
              </Link>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
