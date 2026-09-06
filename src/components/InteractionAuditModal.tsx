import React, { useEffect, useState } from 'react';
import { ShieldCheck, X, Loader2, Sparkles, Terminal, RefreshCw } from 'lucide-react';
import { UserInteraction } from '../types';
import { fetchUserInteractions } from '../lib/firestoreService';

interface InteractionAuditModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const InteractionAuditModal: React.FC<InteractionAuditModalProps> = ({
  userId,
  isOpen,
  onClose,
}) => {
  const [interactions, setInteractions] = useState<UserInteraction[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchUserInteractions(userId);
      setInteractions(data);
    } catch (err) {
      console.error('Failed to load interactions audit:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, userId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-[#0f172a] shadow-2xl border border-slate-800 text-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Firestore Interaction Audit Vault
              </h3>
              <p className="text-xs text-slate-400">
                Path: <code className="font-mono text-[11px] text-indigo-400">/users/{userId}/interactions/*</code> (Isolated to your UID)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              title="Refresh logs"
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-xs">
              <Loader2 className="h-5 w-5 animate-spin mr-2 text-indigo-400" />
              <span>Querying isolated Firestore interaction logs...</span>
            </div>
          ) : interactions.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-500">
              No single interaction logs recorded yet. Submit a reflection to see the raw audit records.
            </div>
          ) : (
            interactions.map((log) => (
              <div
                key={log.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs space-y-3 shadow-lg"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-300 font-semibold">{log.id}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase font-mono ${
                      log.mode === 'technical-mentor'
                        ? 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-300'
                        : 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-300'
                    }`}>
                      {log.mode}
                    </span>
                    {log.modelUsed && (
                      <span className="rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] font-mono text-slate-300">
                        {log.modelUsed}
                      </span>
                    )}
                  </div>
                  <span className="text-slate-500">{new Date(log.createdAt).toLocaleString()}</span>
                </div>

                <div>
                  <span className="font-semibold text-slate-300 block mb-1">Prompt:</span>
                  <p className="rounded-xl bg-slate-800/80 p-3 text-slate-200 border border-slate-700/60 font-sans">
                    {log.prompt}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-indigo-300 block mb-1 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-400" /> Gemini Response:
                  </span>
                  <p className="rounded-xl bg-indigo-950/30 p-3 text-indigo-100 border border-indigo-500/30 font-sans leading-relaxed whitespace-pre-line">
                    {log.response}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-800 bg-slate-900/90 px-6 py-3.5 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 border border-slate-700 hover:bg-slate-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
