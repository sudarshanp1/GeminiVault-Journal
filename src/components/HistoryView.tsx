import React, { useState, useMemo } from 'react';
import {
  Search,
  Calendar,
  MessageSquare,
  Sparkles,
  ChevronRight,
  Trash2,
  Download,
  Tag,
  BookOpen,
  Filter,
} from 'lucide-react';
import { JournalEntry, EntryCategory } from '../types';
import { getMoodVisualConfig } from '../lib/moodUtils';

interface HistoryViewProps {
  entries: JournalEntry[];
  activeEntryId: string | null;
  activeMoodFilter?: string | null;
  onClearMoodFilter?: () => void;
  onSelectEntry: (entry: JournalEntry) => void;
  onDeleteEntry: (entryId: string) => void;
  onNewEntry: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  entries,
  activeEntryId,
  activeMoodFilter,
  onClearMoodFilter,
  onSelectEntry,
  onDeleteEntry,
  onNewEntry,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredEntries = useMemo(() => {
    return entries.filter((item) => {
      const matchesCategory =
        selectedCategory === 'all' || item.category === selectedCategory;

      const matchesMood =
        !activeMoodFilter || item.mood?.primary_mood === activeMoodFilter;

      const query = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        item.title.toLowerCase().includes(query) ||
        (item.summary && item.summary.toLowerCase().includes(query)) ||
        (item.mood?.primary_mood && item.mood.primary_mood.toLowerCase().includes(query)) ||
        (item.mood?.sentiment_score && item.mood.sentiment_score.toLowerCase().includes(query)) ||
        item.turns.some((t) => t.text.toLowerCase().includes(query));

      return matchesCategory && matchesMood && matchesSearch;
    });
  }, [entries, searchTerm, selectedCategory, activeMoodFilter]);

  const handleExport = (entry: JournalEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    let content = `# ${entry.title}\n`;
    content += `**Date:** ${new Date(entry.createdAt).toLocaleDateString()}\n`;
    content += `**Category:** ${entry.category}\n`;
    if (entry.mood) {
      content += `**Primary Mood:** ${entry.mood.primary_mood} (${entry.mood.sentiment_score})\n`;
    }
    content += `\n`;

    if (entry.summary) {
      content += `## Gemini Summary\n${entry.summary}\n\n`;
    }

    content += `## Reflection Dialogue\n\n`;
    for (const turn of entry.turns) {
      const speaker = turn.role === 'user' ? 'User' : 'Gemini';
      content += `### ${speaker} (${new Date(turn.timestamp).toLocaleTimeString()})\n${turn.text}\n\n`;
    }

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${entry.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_reflection.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col border-r border-slate-800 bg-[#020617] text-slate-200">
      {/* Header */}
      <div className="border-b border-slate-800 bg-[#020617] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-bold tracking-tight text-white">
              Journal Vault
            </h2>
            <span className="rounded-full bg-slate-800 border border-slate-700/60 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
              {entries.length}
            </span>
          </div>

          <button
            type="button"
            onClick={onNewEntry}
            className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition-all hover:bg-indigo-500 active:scale-95"
          >
            + New
          </button>
        </div>

        {/* Search */}
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search reflections, insights..."
            className="w-full rounded-xl border border-slate-800 bg-slate-900/90 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-indigo-500/80 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
          />
        </div>

        {/* Category Pills */}
        <div className="mt-2.5 flex flex-wrap gap-1">
          {['all', 'reflection', 'brainstorm', 'gratitude', 'problem-solving', 'work'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold capitalize transition ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                  : 'bg-slate-900/80 border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Active Mood Filter Notice */}
        {activeMoodFilter && (
          <div className="mt-2.5 flex items-center justify-between rounded-xl bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-1 text-xs text-indigo-300">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3 w-3 text-indigo-400" />
              <span className="text-[11px]">Mood: <strong>{activeMoodFilter}</strong></span>
            </div>
            <button
              type="button"
              onClick={onClearMoodFilter}
              className="text-[10px] font-bold text-indigo-400 hover:text-white"
            >
              Clear &times;
            </button>
          </div>
        )}
      </div>

      {/* Entries List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredEntries.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            {entries.length === 0
              ? 'No saved reflections yet. Start your first entry!'
              : 'No entries match your search query.'}
          </div>
        ) : (
          filteredEntries.map((item) => {
            const isSelected = item.id === activeEntryId;
            const dateStr = new Date(item.updatedAt || item.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            });

            return (
              <div
                key={item.id}
                onClick={() => onSelectEntry(item)}
                className={`group relative flex cursor-pointer flex-col rounded-xl p-3 text-left transition-all border ${
                  isSelected
                    ? 'border-indigo-500/40 bg-indigo-500/10 shadow-lg shadow-indigo-950/40'
                    : 'border-slate-800/60 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`line-clamp-1 text-sm font-semibold ${isSelected ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}>
                    {item.title || 'Untitled Reflection'}
                  </h3>
                  <span className="shrink-0 text-[11px] text-slate-500">{dateStr}</span>
                </div>

                {/* Prominent Mood & Sentiment Badge */}
                <div className="mt-1.5 flex items-center gap-1.5">
                  {item.mood?.primary_mood ? (
                    (() => {
                      const visual = getMoodVisualConfig(item.mood.emotion_color, item.mood.sentiment_score);
                      return (
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border shadow-xs ${visual.badge}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${visual.dot}`} />
                          <span>{item.mood.primary_mood}</span>
                          <span className="opacity-70 text-[10px] font-normal">
                            ({item.mood.sentiment_score})
                          </span>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium border border-slate-800/80 bg-slate-900/60 text-slate-500">
                      <span className="h-1 w-1 rounded-full bg-slate-600" />
                      <span>Pending Mood</span>
                    </div>
                  )}
                </div>

                {/* Summary or turn preview */}
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-400 font-sans">
                  {item.summary || (item.turns[0]?.text ?? 'Empty reflection')}
                </p>

                {/* Footer metadata & actions */}
                <div className="mt-2.5 flex items-center justify-between border-t border-slate-800/70 pt-1.5 text-[11px] text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="capitalize text-indigo-400 font-semibold">
                      {item.category || 'Reflection'}
                    </span>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3 text-slate-500" /> {item.turns.length} turns
                    </span>
                  </div>

                  <div className="flex items-center gap-1 opacity-75 group-hover:opacity-100">
                    <button
                      type="button"
                      title="Export Markdown"
                      onClick={(e) => handleExport(item, e)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete Entry"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this journal reflection?')) {
                          onDeleteEntry(item.id);
                        }
                      }}
                      className="rounded-lg p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
