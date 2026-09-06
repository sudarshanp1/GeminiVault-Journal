import React, { useState, useRef, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  Search,
  Sparkles,
  Loader2,
  X,
  ArrowRight,
  BookOpen,
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Tag,
  Flame,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { JournalEntry, SemanticSearchResult } from '../types';
import { requestSemanticSearch } from '../lib/geminiClient';
import { recordInteraction, fetchUserEntries } from '../lib/firestoreService';
import { getMoodVisualConfig } from '../lib/moodUtils';

interface SemanticJournalSearchProps {
  user: User;
  entries: JournalEntry[];
  onSelectEntry: (entry: JournalEntry) => void;
  className?: string;
}

const SUGGESTED_QUERIES = [
  'What stressed me out recently and how did I react?',
  'What creative ideas or experiments have I brainstormed?',
  'Where did I experience gratitude, calm, or victories?',
  'What recurring challenges or work problems did I face?',
];

export const SemanticJournalSearch: React.FC<SemanticJournalSearchProps> = ({
  user,
  entries,
  onSelectEntry,
  className = '',
}) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<SemanticSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
    };
  }, []);

  const toggleSearchDictation = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
      setIsListening(false);
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = navigator.language || 'en-US';

      rec.onstart = () => setIsListening(true);
      rec.onresult = (event: any) => {
        let text = '';
        for (let i = 0; i < event.results.length; ++i) {
          text += event.results[i][0].transcript;
        }
        setQuery(text);
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);

      recognitionRef.current = rec;
      rec.start();
    } catch (e) {
      setIsListening(false);
    }
  };

  const toggleReadAloudAnswer = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !result?.synthesizedAnswer) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = result.synthesizedAnswer
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[*#_`]/g, '')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const handleSearch = async (queryText?: string) => {
    const textToSearch = (queryText || query).trim();
    if (!textToSearch || isSearching) return;

    setIsSearching(true);
    setError(null);
    setIsPanelOpen(true);
    if (queryText) {
      setQuery(queryText);
    }

    try {
      // 1. Fetch user's entries strictly from their isolated Firestore subcollection
      let userEntries: JournalEntry[] = [];
      try {
        userEntries = await fetchUserEntries(user.uid);
      } catch (fetchErr) {
        console.warn('Direct fetch from Firestore fallback to real-time entries:', fetchErr);
        userEntries = entries.filter((e) => e.userId === user.uid);
      }

      if (userEntries.length === 0 && entries.length > 0) {
        userEntries = entries.filter((e) => e.userId === user.uid);
      }

      // 2. Send query and isolated entries as context to Gemini API
      const searchResult = await requestSemanticSearch(textToSearch, userEntries);
      setResult(searchResult);

      // 3. Record interaction in user's isolated audit log
      await recordInteraction({
        id: 'interaction-' + Date.now(),
        userId: user.uid,
        prompt: `[Semantic Search] ${textToSearch}`,
        response: searchResult.answer,
        mode: 'summary',
        modelUsed: searchResult.modelUsed,
        createdAt: new Date().toISOString(),
      }).catch((auditErr) => {
        console.warn('Could not record search interaction audit:', auditErr);
      });
    } catch (err: any) {
      console.error('Semantic search error:', err);
      setError(err?.message || 'Failed to search your reflections. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResult(null);
    setError(null);
  };

  const handleCopyAnswer = () => {
    if (!result?.answer) return;
    navigator.clipboard.writeText(result.answer);
    setCopiedAnswer(true);
    setTimeout(() => setCopiedAnswer(false), 2000);
  };

  // Find the actual entry objects referenced by relevantEntryIds
  const matchedEntries = result?.relevantEntryIds
    ? entries.filter((e) => result.relevantEntryIds.includes(e.id))
    : [];

  return (
    <div className={`w-full ${className}`}>
      {/* Search Input Bar */}
      <div className="relative rounded-2xl border border-slate-800 bg-[#020617]/80 p-2 shadow-xl shadow-indigo-950/20 backdrop-blur-xl transition-all focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/30">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="flex items-center gap-2"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
            <Sparkles className="h-4 w-4" />
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask Gemini anything across your journal (e.g., 'What stressed me out last week?')..."
            className="flex-1 bg-transparent px-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden"
          />

          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={toggleSearchDictation}
            className={`rounded-xl p-2 transition active:scale-95 ${
              isListening
                ? 'bg-rose-600/30 text-rose-300 border border-rose-500 animate-pulse'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
            title={isListening ? 'Listening... click to stop' : 'Search by voice'}
          >
            {isListening ? <MicOff className="h-3.5 w-3.5 text-rose-300" /> : <Mic className="h-3.5 w-3.5" />}
          </button>

          <button
            type="submit"
            disabled={!query.trim() || isSearching}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 transition hover:bg-indigo-500 active:scale-95 disabled:opacity-40 disabled:hover:bg-indigo-600"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="hidden sm:inline">Synthesizing...</span>
              </>
            ) : (
              <>
                <Search className="h-3.5 w-3.5" />
                <span>Search</span>
              </>
            )}
          </button>
        </form>

        {/* Suggested Quick Inquiries */}
        {!result && !isSearching && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 px-1 pt-1.5 border-t border-slate-800/60">
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Flame className="h-3 w-3 text-amber-500" /> Prompts:
            </span>
            {SUGGESTED_QUERIES.map((suggested, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSearch(suggested)}
                className="rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-[11px] text-slate-400 hover:border-indigo-500/40 hover:bg-indigo-950/30 hover:text-indigo-200 transition"
              >
                {suggested}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading state indicator banner */}
      {isSearching && (
        <div className="mt-3 flex items-center justify-center gap-3 rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-4 text-xs text-indigo-300 backdrop-blur-md animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
          <span>Gemini is reading across {entries.length} reflections in your private vault to synthesize an answer...</span>
        </div>
      )}

      {/* Error Banner */}
      {error && !isSearching && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => handleSearch()}
            className="rounded-lg bg-rose-900/60 px-2.5 py-1 text-xs font-medium text-rose-200 hover:bg-rose-800 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Dedicated Results Section */}
      {result && !isSearching && (
        <div className="mt-3 rounded-2xl border border-indigo-500/30 bg-[#020617]/95 p-4 sm:p-5 shadow-2xl shadow-indigo-950/40 backdrop-blur-2xl transition-all">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-500/20 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                  <span>Semantic Journal Synthesis</span>
                  {result.modelUsed && (
                    <span className="rounded-md border border-indigo-500/30 bg-indigo-950/40 px-1.5 py-0.5 text-[10px] font-mono text-indigo-300">
                      {result.modelUsed}
                    </span>
                  )}
                </h4>
                <p className="text-[11px] text-slate-400">
                  Query: <span className="text-indigo-200 font-medium">"{result.query}"</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleReadAloudAnswer}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  isSpeaking
                    ? 'border-indigo-500 bg-indigo-600/30 text-indigo-200 animate-pulse'
                    : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
                title={isSpeaking ? 'Stop reading answer' : 'Read synthesis aloud (Text-to-Speech)'}
              >
                {isSpeaking ? <VolumeX className="h-3.5 w-3.5 text-indigo-300" /> : <Volume2 className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{isSpeaking ? 'Stop' : 'Read Aloud'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyAnswer}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs text-slate-300 hover:text-white hover:bg-slate-700 transition"
                title="Copy Synthesis"
              >
                {copiedAnswer ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{copiedAnswer ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPanelOpen(!isPanelOpen)}
                className="rounded-lg p-1 text-slate-400 hover:text-white transition"
                title={isPanelOpen ? 'Collapse' : 'Expand'}
              >
                {isPanelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={handleClear}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-rose-300 transition"
                title="Dismiss result"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {isPanelOpen && (
            <div className="mt-3.5 space-y-4">
              {/* Key Themes tags */}
              {result.keyThemes && result.keyThemes.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Key Themes:
                  </span>
                  {result.keyThemes.map((theme, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-indigo-500/20 bg-indigo-950/50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              )}

              {/* Synthesized Answer Body */}
              <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-4 text-xs sm:text-sm text-slate-200 leading-relaxed font-sans whitespace-pre-line">
                {result.answer}
              </div>

              {/* Relevant Journal Entries */}
              {matchedEntries.length > 0 && (
                <div className="border-t border-slate-800/80 pt-3">
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
                      Referenced Reflections ({matchedEntries.length})
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Click to jump into full conversation
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {matchedEntries.map((entry) => {
                      const moodVisual = entry.mood
                        ? getMoodVisualConfig(entry.mood.emotion_color, entry.mood.sentiment_score)
                        : null;

                      return (
                        <div
                          key={entry.id}
                          onClick={() => onSelectEntry(entry)}
                          className="group relative cursor-pointer rounded-xl border border-slate-800 bg-slate-900/80 p-3 transition hover:border-indigo-500/50 hover:bg-indigo-950/30 hover:shadow-md"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h5 className="font-semibold text-xs text-slate-100 group-hover:text-indigo-300 transition line-clamp-1">
                              {entry.title || 'Untitled Reflection'}
                            </h5>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-indigo-400 transition shrink-0" />
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-2.5 w-2.5" />
                              {new Date(entry.updatedAt || entry.createdAt).toLocaleDateString()}
                            </span>
                            <span>•</span>
                            <span className="capitalize">{entry.category || 'reflection'}</span>
                          </div>

                          {entry.mood && moodVisual && (
                            <div className="mt-2">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${moodVisual.badge}`}
                              >
                                <span className={`h-1 w-1 rounded-full ${moodVisual.dot}`} />
                                {entry.mood.primary_mood}
                              </span>
                            </div>
                          )}

                          {entry.summary && (
                            <p className="mt-1.5 text-[11px] text-slate-400 line-clamp-2 leading-tight">
                              {entry.summary}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
