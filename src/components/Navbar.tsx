import React from 'react';
import { User } from 'firebase/auth';
import { LogIn, LogOut, ShieldCheck, Sparkles, BookOpen, PlusCircle } from 'lucide-react';
import { signInWithGoogle, logOut } from '../lib/firebase';

interface NavbarProps {
  user: User | null;
  loading: boolean;
  onNewEntry?: () => void;
  onViewHistory?: () => void;
  showingHistory?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  loading,
  onNewEntry,
  onViewHistory,
  showingHistory,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-[#020617]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/25">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
              ReflectAI
            </span>
            <span className="ml-2 hidden text-xs font-medium text-slate-400 sm:inline-block">
              Gemini 3.6 Flash &middot; Cloud Firestore
            </span>
          </div>
        </div>

        {/* Actions & Auth */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              {onNewEntry && (
                <button
                  type="button"
                  onClick={onNewEntry}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-500 active:scale-95"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>New Reflection</span>
                </button>
              )}

              {onViewHistory && (
                <button
                  type="button"
                  onClick={onViewHistory}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                    showingHistory
                      ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
                      : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>History</span>
                </button>
              )}

              {/* User Avatar & Logout */}
              <div className="flex items-center gap-2.5 pl-2.5 border-l border-slate-800">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 rounded-full border border-slate-700 object-cover shadow-sm"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-xs font-bold text-white shadow-sm">
                    {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                  </div>
                )}
                <div className="hidden flex-col text-left md:flex">
                  <span className="text-xs font-semibold text-slate-200 leading-tight">
                    {user.displayName || user.email?.split('@')[0]}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" /> Isolated
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => logOut()}
                  title="Sign Out"
                  className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/80 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={() => signInWithGoogle()}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-500 active:scale-95 disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              <span>Sign In with Google</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
