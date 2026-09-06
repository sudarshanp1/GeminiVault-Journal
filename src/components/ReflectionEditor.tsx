import React, { useState, useRef, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  Sparkles,
  Send,
  Loader2,
  AlertCircle,
  RefreshCw,
  FileText,
  Lightbulb,
  Heart,
  MessageSquare,
  ShieldCheck,
  Check,
  Share2,
  Copy,
  Tag,
  Trash2,
  Activity,
  Terminal,
  Cpu,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { JournalEntry, Turn, InteractionMode, EntryCategory, UserInteraction } from '../types';
import { requestGeminiReflection, requestGeminiSummary, requestGeminiMoodAnalysis } from '../lib/geminiClient';
import { saveJournalEntry, recordInteraction, deleteJournalEntry } from '../lib/firestoreService';
import { getMoodVisualConfig } from '../lib/moodUtils';

interface ReflectionEditorProps {
  user: User;
  entry: JournalEntry;
  onUpdateEntry: (updated: JournalEntry) => void;
  onDeleteEntry?: (entryId: string) => void;
}

const CATEGORIES: { id: EntryCategory; label: string; icon: React.ReactNode }[] = [
  { id: 'reflection', label: 'Reflection', icon: <Heart className="h-3.5 w-3.5" /> },
  { id: 'brainstorm', label: 'Brainstorm', icon: <Lightbulb className="h-3.5 w-3.5" /> },
  { id: 'gratitude', label: 'Gratitude', icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: 'problem-solving', label: 'Problem Solving', icon: <FileText className="h-3.5 w-3.5" /> },
  { id: 'work', label: 'Career & Work', icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { id: 'creative', label: 'Creative Spark', icon: <Sparkles className="h-3.5 w-3.5" /> },
];

const MODES: { id: InteractionMode; label: string; desc: string }[] = [
  { id: 'reflection', label: 'Deep Reflection', desc: 'Empathy, cognitive reframing & questions' },
  { id: 'brainstorm', label: 'Brainstorm Ideas', desc: 'Creative angles & actionable possibilities' },
  { id: 'summary', label: 'Key Synthesis', desc: 'Concise highlights & actionable takeaways' },
  { id: 'chat', label: 'Conversational', desc: 'Natural back-and-forth dialogue' },
  { id: 'technical-mentor', label: 'Technical Mentor', desc: 'Strict senior EM review, edge-case probing & production scalability' },
];

const TECHNICAL_MENTOR_STARTERS = [
  'Review our database indexing, caching invalidation, and race conditions under concurrent writes:',
  'Here is our asynchronous queue worker design; how will it fail under poison-pill payloads and traffic spikes?',
  'Critique our microservice authentication, JWT token refresh, and session state architecture for security & failure modes:',
  'Review our API rate-limiting and retry backoff logic; what distributed edge cases are we overlooking?',
];

const PROMPT_SUGGESTIONS: Record<EntryCategory, string[]> = {
  reflection: [
    'What was a defining moment today, and what emotion did it bring up?',
    'What is something I have been resisting, and what is beneath that resistance?',
    'If I observed myself with compassionate curiosity today, what would I notice?',
  ],
  brainstorm: [
    'I want to brainstorm 5 novel approaches to tackle my current challenge:',
    'Help me imagine worst-case and best-case outcomes, and creative paths forward:',
    'How can I simplify this process while doubling its impact?',
  ],
  gratitude: [
    'Three micro-moments from today that made me smile or feel peace:',
    'An unexpected kindness someone offered recently that I want to appreciate:',
    'A personal strength or habit that supported me through a recent hurdle:',
  ],
  'problem-solving': [
    'Here is the dilemma I am facing, the constraints, and the trade-offs:',
    'What assumptions am I making about this problem that might be untrue?',
    'What would the simplest, high-integrity resolution look like?',
  ],
  work: [
    'Reflecting on a recent meeting or project checkpoint: what succeeded?',
    'How can I better protect my focused deep work hours this week?',
    'An area where I want to communicate more directly and with clarity:',
  ],
  creative: [
    'An unpolished idea or metaphor that has been lingering in my mind:',
    'What would I create if I knew no one was grading or critiquing it?',
    'Combining two unrelated interests into a unique experiment:',
  ],
};

export const ReflectionEditor: React.FC<ReflectionEditorProps> = ({
  user,
  entry,
  onUpdateEntry,
  onDeleteEntry,
}) => {
  const [title, setTitle] = useState(entry.title);
  const [category, setCategory] = useState<EntryCategory>(entry.category || 'reflection');
  const [mode, setMode] = useState<InteractionMode>('reflection');
  const [inputPrompt, setInputPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isAnalyzingMood, setIsAnalyzingMood] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('saved');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedPayload, setFailedPayload] = useState<{ prompt: string; mode: InteractionMode } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Web Speech API: Voice Dictation (Speech-to-Text) & Voice Synthesis (Text-to-Speech)
  const [isListening, setIsListening] = useState(false);
  const [interimVoiceText, setInterimVoiceText] = useState('');
  const [speechSupported, setSpeechSupported] = useState(true);
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const [speakingTurnId, setSpeakingTurnId] = useState<string | null>(null);
  const [ttsSupported, setTtsSupported] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // Check Web Speech API capability on client mount
  useEffect(() => {
    const hasRecognition = typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    setSpeechSupported(hasRecognition);

    const hasSynthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;
    setTtsSupported(hasSynthesis);

    return () => {
      // Clean up speech synthesis and recognition on unmount
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

  // Cancel any active speech synthesis when active entry changes
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingTurnId(null);
  }, [entry.id]);

  // Clean Markdown symbols before feeding text into SpeechSynthesis
  const cleanMarkdownForSpeech = (text: string): string => {
    return text
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^#+\s*(.*?)$/gm, '$1.')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .trim();
  };

  // Toggle Voice Dictation (Speech-to-Text)
  const toggleVoiceDictation = () => {
    if (!speechSupported) {
      setSpeechNotice('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      setTimeout(() => setSpeechNotice(null), 5000);
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
      setIsListening(false);
      setInterimVoiceText('');
      return;
    }

    try {
      const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechNotice(null);
        setInterimVoiceText('');
      };

      recognition.onresult = (event: any) => {
        let finalChunk = '';
        let interimChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalChunk += transcript;
          } else {
            interimChunk += transcript;
          }
        }

        setInterimVoiceText(interimChunk);

        if (finalChunk) {
          setInputPrompt((prev) => {
            const trimmedPrev = prev.trim();
            const cleanFinal = finalChunk.trim();
            return trimmedPrev ? `${trimmedPrev} ${cleanFinal}` : cleanFinal;
          });
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition notice:', event.error);
        if (event.error === 'not-allowed') {
          setSpeechNotice('Microphone access was denied. Please allow microphone permissions in your browser.');
          setTimeout(() => setSpeechNotice(null), 6000);
        } else if (event.error !== 'no-speech') {
          setSpeechNotice(`Dictation notice: ${event.error}`);
          setTimeout(() => setSpeechNotice(null), 4000);
        }
        setIsListening(false);
        setInterimVoiceText('');
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimVoiceText('');
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.warn('Failed to start voice dictation:', err);
      setSpeechNotice('Could not start microphone dictation. Please check browser settings.');
      setIsListening(false);
      setInterimVoiceText('');
    }
  };

  // Toggle Voice Synthesis (Text-to-Speech)
  const handleToggleReadAloud = (turnId: string, text: string) => {
    if (!ttsSupported || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSpeechNotice('Text-to-speech audio synthesis is not supported in this browser.');
      setTimeout(() => setSpeechNotice(null), 4000);
      return;
    }

    // Toggle stop if already speaking this turn
    if (speakingTurnId === turnId) {
      window.speechSynthesis.cancel();
      setSpeakingTurnId(null);
      return;
    }

    // Stop any existing playback
    window.speechSynthesis.cancel();

    const cleanedText = cleanMarkdownForSpeech(text);
    if (!cleanedText) return;

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Select natural English voice if available
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice =
      voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Premium'))) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      voices[0];

    if (naturalVoice) {
      utterance.voice = naturalVoice;
    }

    utterance.onend = () => {
      setSpeakingTurnId(null);
    };

    utterance.onerror = (e) => {
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        console.warn('Speech synthesis error:', e);
      }
      setSpeakingTurnId(null);
    };

    window.speechSynthesis.speak(utterance);
    setSpeakingTurnId(turnId);
  };

  // Sync internal state if entry ID changes
  useEffect(() => {
    setTitle(entry.title);
    setCategory(entry.category || 'reflection');
    setSaveStatus('saved');
    setErrorMessage(null);
    setFailedPayload(null);
  }, [entry.id]);

  // Scroll to bottom on new turns
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entry.turns.length, isSubmitting]);

  // Update title or category with auto-save
  const handleTitleChange = async (newTitle: string) => {
    setTitle(newTitle);
    const updated: JournalEntry = {
      ...entry,
      title: newTitle,
      updatedAt: new Date().toISOString(),
    };
    onUpdateEntry(updated);
    try {
      setSaveStatus('saving');
      await saveJournalEntry(updated);
      setSaveStatus('saved');
    } catch (err: any) {
      setSaveStatus('error');
      setErrorMessage('Failed to save title: ' + (err?.message || err));
    }
  };

  const handleCategoryChange = async (newCat: EntryCategory) => {
    setCategory(newCat);
    const updated: JournalEntry = {
      ...entry,
      category: newCat,
      updatedAt: new Date().toISOString(),
    };
    onUpdateEntry(updated);
    try {
      setSaveStatus('saving');
      await saveJournalEntry(updated);
      setSaveStatus('saved');
    } catch (err: any) {
      setSaveStatus('error');
      setErrorMessage('Failed to save category: ' + (err?.message || err));
    }
  };

  /**
   * Submit multi-turn prompt to Gemini with guaranteed transaction verification
   */
  const handleSendPrompt = async (retryData?: { prompt: string; mode: InteractionMode }) => {
    const textToSend = retryData ? retryData.prompt : inputPrompt.trim();
    const currentMode = retryData ? retryData.mode : mode;

    if (!textToSend || isSubmitting) return;

    // Automatically stop voice dictation if running when prompt is sent
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
      setIsListening(false);
      setInterimVoiceText('');
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSaveStatus('saving');

    const userTurn: Turn = {
      id: 'turn-' + Date.now() + '-user',
      role: 'user',
      text: textToSend,
      timestamp: new Date().toISOString(),
      mode: currentMode,
    };

    // Pre-calculate optimistic updated turns
    const updatedTurns = [...entry.turns, userTurn];

    try {
      // 1. Call Gemini API (with resilient model fallback ladder on server)
      const previousHistory = entry.turns.map((t) => ({
        role: t.role,
        text: t.text,
        mode: t.mode,
      }));

      const geminiRes = await requestGeminiReflection({
        prompt: textToSend,
        mode: currentMode,
        history: previousHistory,
      });

      const modelTurn: Turn = {
        id: 'turn-' + Date.now() + '-model',
        role: 'model',
        text: geminiRes.text,
        timestamp: new Date().toISOString(),
        mode: currentMode,
        modelUsed: geminiRes.modelUsed,
      };

      const finalTurns = [...updatedTurns, modelTurn];

      // Auto-update title if it's the default "Untitled Reflection"
      let finalTitle = title;
      if (entry.title === 'Untitled Reflection' || !entry.title.trim()) {
        finalTitle = textToSend.slice(0, 45) + (textToSend.length > 45 ? '...' : '');
        setTitle(finalTitle);
      }

      const updatedEntry: JournalEntry = {
        ...entry,
        title: finalTitle,
        category,
        turns: finalTurns,
        updatedAt: new Date().toISOString(),
      };

      // 2. Guaranteed Firestore persistence for Entry
      await saveJournalEntry(updatedEntry);

      // 3. Guaranteed Firestore persistence for single interaction audit log
      const interactionLog: UserInteraction = {
        id: 'interaction-' + Date.now(),
        userId: user.uid,
        entryId: entry.id,
        prompt: textToSend,
        response: geminiRes.text,
        mode: currentMode,
        modelUsed: geminiRes.modelUsed,
        createdAt: new Date().toISOString(),
      };
      await recordInteraction(interactionLog);

      // Successfully saved
      onUpdateEntry(updatedEntry);
      setInputPrompt('');
      setFailedPayload(null);
      setSaveStatus('saved');
    } catch (err: any) {
      console.error('Submission or persistence failed:', err);
      setSaveStatus('error');
      const errText = err?.message || 'Error occurred while contacting Gemini or saving to Firestore.';
      setErrorMessage(errText);
      // Keep payload buffered for Retry
      setFailedPayload({ prompt: textToSend, mode: currentMode });
      // DO NOT clear user's input buffer if it wasn't saved!
      if (!retryData) {
        setInputPrompt(textToSend);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * One-Click Summarization & Structured Mood Extraction of the entire Reflection
   */
  const handleGenerateSummary = async () => {
    if (entry.turns.length === 0 || isSummarizing) return;

    setIsSummarizing(true);
    setErrorMessage(null);
    setSaveStatus('saving');

    try {
      const fullDialog = entry.turns
        .map((t) => `${t.role === 'user' ? 'User' : 'Gemini'}: ${t.text}`)
        .join('\n\n');

      const result = await requestGeminiSummary(entry.title, fullDialog);

      const updatedEntry: JournalEntry = {
        ...entry,
        summary: result.summary,
        mood: result.mood,
        updatedAt: new Date().toISOString(),
      };

      await saveJournalEntry(updatedEntry);
      onUpdateEntry(updatedEntry);
      setSaveStatus('saved');
    } catch (err: any) {
      console.error('Summary generation failed:', err);
      setSaveStatus('error');
      setErrorMessage('Failed to generate summary: ' + (err?.message || err));
    } finally {
      setIsSummarizing(false);
    }
  };

  /**
   * Quick Structured Mood & Sentiment Analysis with Gemini
   */
  const handleAnalyzeMood = async () => {
    if (entry.turns.length === 0 || isAnalyzingMood) return;

    setIsAnalyzingMood(true);
    setErrorMessage(null);
    setSaveStatus('saving');

    try {
      const fullDialog = entry.turns
        .map((t) => `${t.role === 'user' ? 'User' : 'Gemini'}: ${t.text}`)
        .join('\n\n');

      const moodData = await requestGeminiMoodAnalysis(entry.title, fullDialog);

      const updatedEntry: JournalEntry = {
        ...entry,
        mood: moodData,
        updatedAt: new Date().toISOString(),
      };

      await saveJournalEntry(updatedEntry);
      onUpdateEntry(updatedEntry);
      setSaveStatus('saved');
    } catch (err: any) {
      console.error('Mood analysis failed:', err);
      setSaveStatus('error');
      setErrorMessage('Failed to analyze mood: ' + (err?.message || err));
    } finally {
      setIsAnalyzingMood(false);
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex h-full flex-col bg-[#0f172a] text-slate-200">
      {/* Top Header Bar */}
      <div className="border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Title & Category Input */}
          <div className="flex-1 space-y-2">
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Title of reflection..."
              className="w-full text-xl font-bold text-white bg-transparent placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/60 rounded-lg px-2 py-0.5"
            />

            {/* Category selection */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
                <Tag className="h-3 w-3 text-indigo-400" /> Category:
              </span>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategoryChange(cat.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all ${
                    category === cat.id
                      ? 'bg-indigo-500/20 border border-indigo-500/50 text-indigo-300 shadow-xs'
                      : 'bg-slate-800/70 border border-slate-700/60 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200'
                  }`}
                >
                  {cat.icon}
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Status & Actions */}
          <div className="flex items-center gap-2 self-end sm:self-center">
            {/* Save indicator */}
            <div className="flex items-center gap-1.5 text-xs">
              {saveStatus === 'saving' && (
                <span className="flex items-center gap-1 text-indigo-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" /> Saved in Firestore
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="flex items-center gap-1 text-rose-400 font-semibold">
                  <AlertCircle className="h-3.5 w-3.5" /> Save issue
                </span>
              )}
            </div>

            {/* Active Entry Mood Pill */}
            {entry.mood && (
              <div className="hidden sm:flex items-center gap-1.5">
                {(() => {
                  const visual = getMoodVisualConfig(entry.mood.emotion_color, entry.mood.sentiment_score);
                  return (
                    <div
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border shadow-xs ${visual.badge}`}
                      title={`Sentiment: ${entry.mood.sentiment_score}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${visual.dot}`} />
                      <span>{entry.mood.primary_mood}</span>
                      <span className="opacity-70 text-[10px]">({entry.mood.sentiment_score})</span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Quick Detect Mood Action */}
            {entry.turns.length > 0 && (
              <button
                type="button"
                disabled={isAnalyzingMood || isSummarizing}
                onClick={handleAnalyzeMood}
                title="Detect mood & emotional sentiment with Gemini"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 shadow-sm transition hover:bg-slate-700 hover:text-white disabled:opacity-50"
              >
                {isAnalyzingMood ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                ) : (
                  <Activity className="h-3.5 w-3.5 text-indigo-400" />
                )}
                <span className="hidden md:inline">{entry.mood ? 'Re-analyze Mood' : 'Detect Mood'}</span>
              </button>
            )}

            {/* Summary Action Button */}
            {entry.turns.length > 0 && (
              <button
                type="button"
                disabled={isSummarizing || isAnalyzingMood}
                onClick={handleGenerateSummary}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-950/40 px-3 py-1.5 text-xs font-semibold text-indigo-300 shadow-sm transition hover:bg-indigo-900/50 hover:text-white disabled:opacity-50"
              >
                {isSummarizing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-indigo-400" />
                )}
                <span>{entry.summary ? 'Update Summary' : 'Summarize Entry'}</span>
              </button>
            )}

            {/* Delete button */}
            {onDeleteEntry && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Are you sure you want to delete this journal reflection?')) {
                    onDeleteEntry(entry.id);
                  }
                }}
                title="Delete Entry"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Executive Summary Card if generated */}
        {entry.summary && (
          <div className="mt-3 rounded-2xl border border-indigo-500/30 bg-indigo-950/30 p-4 text-xs text-indigo-100 shadow-xl shadow-indigo-950/30">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 font-bold text-indigo-300 border-b border-indigo-500/20">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  Gemini Executive Summary
                </span>
                {entry.mood && (
                  (() => {
                    const visual = getMoodVisualConfig(entry.mood.emotion_color, entry.mood.sentiment_score);
                    return (
                      <div
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border shadow-xs ${visual.badge}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${visual.dot}`} />
                        <span>{entry.mood.primary_mood}</span>
                        <span className="opacity-75 text-[10px]">({entry.mood.sentiment_score})</span>
                      </div>
                    );
                  })()
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleReadAloud('summary', entry.summary || '')}
                  className={`text-[11px] flex items-center gap-1 font-medium transition ${
                    speakingTurnId === 'summary'
                      ? 'text-indigo-300 font-bold'
                      : 'text-indigo-400 hover:text-indigo-200'
                  }`}
                  title={speakingTurnId === 'summary' ? 'Stop reading summary' : 'Read summary aloud (Text-to-Speech)'}
                >
                  {speakingTurnId === 'summary' ? (
                    <>
                      <VolumeX className="h-3 w-3 text-indigo-300 animate-pulse" />
                      <span>Stop</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-3 w-3" />
                      <span>Read Aloud</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopyText('summary', entry.summary || '')}
                  className="text-[11px] text-indigo-400 hover:text-indigo-200 flex items-center gap-1 font-medium transition"
                >
                  {copiedId === 'summary' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedId === 'summary' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <p className="mt-2.5 whitespace-pre-line leading-relaxed font-sans text-indigo-50/95">
              {entry.summary}
            </p>
          </div>
        )}
      </div>

      {/* Error Banner with Retry */}
      {errorMessage && (
        <div className="mx-4 mt-3 flex items-start justify-between rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300 sm:mx-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          {failedPayload && (
            <button
              type="button"
              onClick={() => handleSendPrompt(failedPayload)}
              className="ml-3 inline-flex shrink-0 items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-rose-500"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Retry</span>
            </button>
          )}
        </div>
      )}

      {/* Multi-Turn Dialogue & Journal Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-6">
        {entry.turns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-lg shadow-indigo-500/10">
              <Sparkles className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-white">
              Begin your reflection
            </h2>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-400">
              Write down whatever is on your mind. Choose your reflection mode below to guide Gemini's responses.
            </p>

            {/* Prompt Starter Chips */}
            <div className="mt-6 w-full max-w-lg text-left">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Inspiration Starters
              </p>
              <div className="space-y-2">
                {(mode === 'technical-mentor' ? TECHNICAL_MENTOR_STARTERS : (PROMPT_SUGGESTIONS[category] || PROMPT_SUGGESTIONS.reflection)).map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setInputPrompt(sample)}
                    className="w-full text-left rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-300 transition-all hover:border-indigo-500/40 hover:bg-indigo-950/20 hover:text-white"
                  >
                    &ldquo;{sample}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Multi-Turn Render */
          entry.turns.map((turn, index) => {
            const isUser = turn.role === 'user';
            const isTech = turn.mode === 'technical-mentor';
            return (
              <div
                key={turn.id || index}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-2 mb-1.5 px-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {isUser ? 'You' : isTech ? 'Technical Mentor (Gemini)' : 'Gemini'}
                  </span>
                  {turn.modelUsed && (
                    <span className="rounded-full bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-mono text-indigo-300">
                      {turn.modelUsed}
                    </span>
                  )}
                  {turn.mode && (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        isTech
                          ? 'bg-cyan-950/50 border-cyan-500/40 text-cyan-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 capitalize'
                      }`}
                    >
                      {turn.mode === 'technical-mentor' ? 'Technical Mentor' : turn.mode}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500">
                    {new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="flex items-start gap-3 max-w-3xl">
                  {!isUser && (
                    <div
                      className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 shadow-lg text-white mt-1 ${
                        isTech
                          ? 'bg-gradient-to-br from-cyan-600 via-indigo-600 to-slate-900 shadow-cyan-500/20 border border-cyan-400/30'
                          : 'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-indigo-500/25'
                      }`}
                    >
                      {isTech ? (
                        <Terminal className="h-4 w-4 text-cyan-200" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                    </div>
                  )}

                  <div
                    className={`group relative rounded-3xl p-5 text-[14px] leading-relaxed shadow-xl ${
                      isUser
                        ? 'bg-slate-800 border border-slate-700/60 text-slate-100 rounded-tr-none'
                        : isTech
                        ? 'bg-slate-900/90 border border-cyan-500/30 text-slate-100 rounded-tl-none backdrop-blur-md shadow-cyan-950/30'
                        : 'bg-indigo-950/25 border border-indigo-500/25 text-indigo-50/95 rounded-tl-none backdrop-blur-sm'
                    }`}
                  >
                    <p className="whitespace-pre-line font-sans">{turn.text}</p>

                    {/* Turn Actions: Read Aloud & Copy */}
                    <div className="mt-3 flex items-center justify-between gap-2 pt-1.5 border-t border-slate-700/40">
                      <div>
                        {!isUser && (
                          <button
                            type="button"
                            onClick={() => handleToggleReadAloud(turn.id, turn.text)}
                            className={`text-[11px] flex items-center gap-1.5 font-medium px-2 py-0.5 rounded-lg transition-all ${
                              speakingTurnId === turn.id
                                ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/50 shadow-sm shadow-indigo-500/20'
                                : isTech
                                ? 'text-cyan-400 hover:text-cyan-200 hover:bg-cyan-950/40'
                                : 'text-indigo-400 hover:text-indigo-200 hover:bg-indigo-950/40'
                            }`}
                            title={speakingTurnId === turn.id ? 'Stop reading aloud' : 'Read response aloud (Text-to-Speech)'}
                          >
                            {speakingTurnId === turn.id ? (
                              <>
                                <VolumeX className="h-3 w-3 text-indigo-300 animate-pulse" />
                                <span className="font-semibold text-indigo-200">Stop</span>
                                <span className="relative flex h-1.5 w-1.5 ml-0.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
                                </span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="h-3 w-3" />
                                <span>Read Aloud</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopyText(turn.id, turn.text)}
                        className={`text-[11px] flex items-center gap-1 font-medium transition ${
                          isUser ? 'text-slate-400 hover:text-white' : isTech ? 'text-cyan-400 hover:text-cyan-200' : 'text-indigo-400 hover:text-indigo-200'
                        }`}
                      >
                        {copiedId === turn.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedId === turn.id ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Loading Spinner for Active Generation */}
        {isSubmitting && (
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 text-white shadow-lg ${
                mode === 'technical-mentor'
                  ? 'bg-gradient-to-br from-cyan-600 to-indigo-600 shadow-cyan-500/25 border border-cyan-400/30'
                  : 'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/25'
              }`}
            >
              {mode === 'technical-mentor' ? (
                <Terminal className="h-4 w-4 text-cyan-200 animate-pulse" />
              ) : (
                <Sparkles className="h-4 w-4 animate-pulse" />
              )}
            </div>
            <div
              className={`rounded-3xl border px-5 py-4 text-xs shadow-xl flex items-center gap-2.5 ${
                mode === 'technical-mentor'
                  ? 'border-cyan-500/30 bg-cyan-950/40 text-cyan-200'
                  : 'border-indigo-500/30 bg-indigo-950/40 text-indigo-300'
              }`}
            >
              <Loader2 className={`h-4 w-4 animate-spin ${mode === 'technical-mentor' ? 'text-cyan-400' : 'text-indigo-400'}`} />
              <span className="font-medium">
                {mode === 'technical-mentor'
                  ? 'Technical Mentor is auditing architecture, edge-cases & system scalability...'
                  : 'Gemini is reflecting and synthesizing insights...'}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Mode Selector & Input Footer */}
      <div className="border-t border-slate-800/80 bg-slate-900/70 backdrop-blur-xl p-4 sm:px-6">
        {/* Interaction Mode Tabs */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-400 mr-1 uppercase tracking-wider">AI Mode:</span>
          {MODES.map((m) => {
            const isSelected = mode === m.id;
            const isTech = m.id === 'technical-mentor';
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                title={m.desc}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
                  isSelected
                    ? isTech
                      ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md shadow-cyan-500/25 border border-cyan-400/40 ring-1 ring-cyan-400/30'
                      : 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                    : isTech
                    ? 'bg-slate-800/80 border border-cyan-500/30 text-cyan-300 hover:bg-slate-700/80 hover:text-cyan-200'
                    : 'bg-slate-800/80 border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {isTech && <Terminal className="h-3 w-3" />}
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* Technical Mentor Active Context Banner */}
        {mode === 'technical-mentor' && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-3 py-2 text-xs text-cyan-200 backdrop-blur-md shadow-inner shadow-cyan-950/40">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400">
                <Terminal className="h-3.5 w-3.5" />
              </div>
              <span>
                <strong className="font-semibold text-cyan-100">Technical Mentor Active:</strong> Strict Senior EM persona. Gemini will challenge assumptions, probe edge cases & concurrency hazards, and push for production-grade scalability.
              </span>
            </div>
            <span className="hidden sm:inline-block shrink-0 rounded-md bg-cyan-900/50 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-mono font-medium text-cyan-300">
              STRICT EM MODE
            </span>
          </div>
        )}

        {/* Textarea Capsule & Submit */}
        <div className={`relative rounded-[28px] border bg-slate-800/50 p-2.5 shadow-2xl transition-all ${
          mode === 'technical-mentor'
            ? 'border-cyan-500/40 focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400/40'
            : 'border-slate-700/80 focus-within:border-indigo-500/80 focus-within:ring-1 focus-within:ring-indigo-500/40'
        }`}>
          <textarea
            ref={textareaRef}
            rows={3}
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendPrompt();
              }
            }}
            placeholder={
              mode === 'reflection'
                ? 'Share your thoughts, challenges, or questions for deep reflection...'
                : mode === 'brainstorm'
                ? 'Describe a situation or concept you want to explore and brainstorm around...'
                : mode === 'summary'
                ? 'Paste or write key notes to synthesize into clear insights...'
                : mode === 'technical-mentor'
                ? 'Describe your architecture, paste code, or explain an engineering decision for strict Senior EM review...'
                : 'Continue conversation with Gemini...'
            }
            className="w-full resize-none border-0 bg-transparent px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />

          {/* Live Voice Dictation Real-time Banner */}
          {isListening && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 mb-1 text-xs text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-xl animate-pulse">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                </span>
                <span className="font-semibold text-rose-200 shrink-0">Dictating:</span>
                <span className="truncate italic text-rose-300/90 text-[11px]">
                  {interimVoiceText ? `"${interimVoiceText}"` : 'Listening... speak clearly into your microphone'}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleVoiceDictation}
                className="shrink-0 text-[10px] font-bold uppercase tracking-wider bg-rose-600/60 hover:bg-rose-600 text-white px-2 py-0.5 rounded-md transition"
              >
                Stop
              </button>
            </div>
          )}

          {speechNotice && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 mb-1 text-xs text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-xl">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>{speechNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setSpeechNotice(null)}
                className="text-amber-400 hover:text-amber-200 text-xs px-1"
              >
                ✕
              </button>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-700/50 pt-2 px-2">
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              Press <kbd className="rounded-md bg-slate-800 border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">Enter</kbd> to send, <kbd className="rounded-md bg-slate-800 border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">Shift+Enter</kbd> for new line
            </span>
            <span className="text-[11px] text-slate-500 sm:hidden">
              {isListening ? 'Mic active' : 'Ready'}
            </span>

            <div className="flex items-center gap-2">
              {/* Voice Dictation (Speech-to-Text) Button */}
              <button
                type="button"
                onClick={toggleVoiceDictation}
                className={`inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold transition-all active:scale-95 shadow-md ${
                  isListening
                    ? 'bg-rose-600/30 border border-rose-500 text-rose-200 shadow-rose-500/25 ring-2 ring-rose-500/50 animate-pulse'
                    : 'bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700/90 hover:border-slate-600'
                }`}
                title={isListening ? 'Stop voice recording' : 'Dictate reflection using voice (Web Speech API)'}
              >
                {isListening ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                    </span>
                    <MicOff className="h-3.5 w-3.5 text-rose-300" />
                    <span className="hidden sm:inline">Listening...</span>
                  </>
                ) : (
                  <>
                    <Mic className="h-3.5 w-3.5 text-slate-400 group-hover:text-white" />
                    <span className="hidden sm:inline">Dictate</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isSubmitting || !inputPrompt.trim()}
                onClick={() => handleSendPrompt()}
                className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2 text-xs font-bold text-white shadow-lg transition-all active:scale-95 disabled:opacity-40 ${
                  mode === 'technical-mentor'
                    ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 shadow-cyan-500/25 border border-cyan-400/30'
                    : 'bg-indigo-500 hover:bg-indigo-400 shadow-indigo-500/30'
                }`}
              >
                {isSubmitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : mode === 'technical-mentor' ? (
                  <Terminal className="h-3.5 w-3.5" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                <span>{mode === 'technical-mentor' ? 'Consult EM' : 'Send'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
