import React from 'react';
import { Sparkles, Shield, Lock, Brain, ArrowRight, MessageSquareText, FileText } from 'lucide-react';
import { signInWithGoogle } from '../lib/firebase';

interface LandingHeroProps {
  loading: boolean;
  onSignInSuccess?: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({ loading }) => {
  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Google Sign-In prompt error:', err);
    }
  };

  return (
    <div className="relative overflow-hidden py-12 sm:py-20 lg:py-24 bg-[#0f172a]">
      {/* Background ambient accents */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute left-1/2 top-0 h-[480px] w-[800px] -translate-x-1/2 -translate-y-1/4 rounded-full bg-gradient-to-tr from-indigo-600/20 via-purple-600/15 to-transparent blur-3xl" />
      </div>

      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        {/* Isolated Security Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-950/40 px-3.5 py-1 text-xs font-semibold text-indigo-300 shadow-lg shadow-indigo-500/10">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
          <span>User-Isolated Cloud Firestore &bull; Zero Password Storage</span>
        </div>

        {/* Headline */}
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
          Clarity through reflection, <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-300 to-indigo-200">
            elevated by Gemini
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
          Write personal reflections, brainstorm solutions, and explore ideas in a secure, multi-turn journaling space. Powered by Gemini 3.6 Flash and saved directly to your isolated Firestore vault.
        </p>

        {/* Primary Call to Action */}
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <button
            type="button"
            disabled={loading}
            onClick={handleSignIn}
            className="group inline-flex items-center gap-3 rounded-2xl bg-indigo-600 px-7 py-3.5 text-sm font-bold text-white shadow-xl shadow-indigo-500/30 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 active:scale-95 disabled:opacity-50"
          >
            {/* Google G Logo */}
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.54 0 2.94.57 4.03 1.51l3.03-3.03C17.21 1.74 14.77 1 12 1 7.42 1 3.53 3.59 1.6 7.35l3.69 2.86C6.18 7.37 8.84 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.68 2.86c2.16-1.99 3.74-4.94 3.74-8.68z"
              />
              <path
                fill="#FBBC05"
                d="M5.29 14.79c-.25-.74-.39-1.53-.39-2.35 0-.82.14-1.61.39-2.35L1.6 7.23C.58 9.27 0 11.57 0 14s.58 4.73 1.6 6.77l3.69-2.98z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.24 0 5.95-1.08 7.93-2.91l-3.68-2.86c-1.07.72-2.45 1.16-4.25 1.16-3.16 0-5.82-2.37-6.71-5.21L1.6 16.02C3.53 19.78 7.42 22.37 12 22.37z"
              />
            </svg>
            <span>Sign In with Google to Open Dashboard</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* Feature Grid */}
        <div className="mt-16 grid grid-cols-1 gap-6 text-left sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm">
              <Brain className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-base font-bold text-white">
              Multi-Turn Reflections
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Engage in multi-turn dialogues with Gemini 3.6 Flash. Deepen your thoughts with empathetic inquiry, ideation, and reframing.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm">
              <Lock className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-base font-bold text-white">
              Strict User Isolation
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Zero cross-user data leakage. Cloud Firestore security rules lock every document strictly to your Google Auth UID.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-sm">
              <FileText className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-base font-bold text-white">
              Structured Summaries
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Synthesize extensive reflections into executive takeaways and actionable insights with a single click.
            </p>
          </div>
        </div>

        {/* Prompt Preview Snippet */}
        <div className="mt-12 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-left shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-rose-500/80" />
              <div className="h-3 w-3 rounded-full bg-amber-500/80" />
              <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
              <span className="ml-2 text-xs font-semibold text-slate-400">Sample Reflection Flow</span>
            </div>
            <span className="text-[11px] font-mono text-indigo-400">model: gemini-3.6-flash</span>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-slate-800 border border-slate-700/50 p-3.5 text-xs text-slate-200">
              <span className="font-semibold text-white">You:</span> "I felt overwhelmed balancing three client deliverables this week, but I managed to finish two of them."
            </div>
            <div className="rounded-2xl bg-indigo-950/30 border border-indigo-500/25 p-3.5 text-xs text-indigo-100 leading-relaxed">
              <span className="font-semibold text-indigo-300 flex items-center gap-1 mb-1">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" /> Gemini:
              </span>
              "Notice how your first instinct was to focus on the uncompleted third deliverable rather than celebrating the two you successfully shipped. What made the first two flow effectively, and what can you delegate on the remainder?"
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
