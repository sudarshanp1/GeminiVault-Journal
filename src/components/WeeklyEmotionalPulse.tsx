import React, { useMemo } from 'react';
import { Activity, Sparkles, TrendingUp, Heart, Smile, Meh, Frown, ChevronDown, ChevronUp } from 'lucide-react';
import { JournalEntry } from '../types';
import { computeMoodStats, getMoodVisualConfig } from '../lib/moodUtils';

interface WeeklyEmotionalPulseProps {
  entries: JournalEntry[];
  activeMoodFilter?: string | null;
  onSelectMoodFilter?: (mood: string | null) => void;
}

export const WeeklyEmotionalPulse: React.FC<WeeklyEmotionalPulseProps> = ({
  entries,
  activeMoodFilter,
  onSelectMoodFilter,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const stats = useMemo(() => computeMoodStats(entries), [entries]);

  const hasMoodData = stats.analyzedEntriesCount > 0;

  return (
    <div className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-xl px-4 py-2.5 sm:px-6 transition-all">
      <div className="flex flex-col gap-2">
        {/* Top Mini-Bar Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Activity className="h-3.5 w-3.5 animate-pulse" />
              <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Weekly Emotional Pulse
              </span>
              <span className="rounded-full bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                {stats.weeklyEntriesCount} this week
              </span>
              <span className="hidden md:inline text-[11px] text-slate-500">
                &bull; {stats.totalEntries} total {stats.totalEntries === 1 ? 'reflection' : 'reflections'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Sentiment Summary badges on right */}
            {hasMoodData && (
              <div className="hidden sm:flex items-center gap-2 text-[11px]">
                <span className="flex items-center gap-1 font-medium text-emerald-400">
                  <Smile className="h-3 w-3" /> {stats.sentimentBreakdown.positivePct}%
                </span>
                <span className="text-slate-700">|</span>
                <span className="flex items-center gap-1 font-medium text-amber-400">
                  <Meh className="h-3 w-3" /> {stats.sentimentBreakdown.neutralPct}%
                </span>
                <span className="text-slate-700">|</span>
                <span className="flex items-center gap-1 font-medium text-rose-400">
                  <Frown className="h-3 w-3" /> {stats.sentimentBreakdown.challengingPct}%
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition"
              title={isExpanded ? 'Collapse Pulse Banner' : 'Expand Pulse Banner'}
            >
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Expandable Mood Visual Strip */}
        {isExpanded && (
          <div className="pt-1.5 space-y-2">
            {/* Top Moods Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">
                Top Moods:
              </span>

              {stats.topMoods.length > 0 ? (
                stats.topMoods.map((item) => {
                  const isSelected = activeMoodFilter === item.mood;
                  return (
                    <button
                      key={item.mood}
                      type="button"
                      onClick={() => onSelectMoodFilter?.(isSelected ? null : item.mood)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border transition-all ${
                        item.config.badge
                      } ${isSelected ? 'ring-2 ring-indigo-400 scale-105' : 'hover:scale-102'}`}
                      title={`${item.count} ${item.count === 1 ? 'entry' : 'entries'} with mood: ${item.mood}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${item.config.dot}`} />
                      <span>{item.mood}</span>
                      <span className="rounded-full bg-slate-900/60 px-1.5 py-0.2 text-[10px] font-mono opacity-80">
                        {item.count}
                      </span>
                    </button>
                  );
                })
              ) : (
                <span className="text-xs text-slate-400 italic">
                  No mood entries yet. Summarize your reflections with Gemini to generate mood telemetry.
                </span>
              )}

              {activeMoodFilter && (
                <button
                  type="button"
                  onClick={() => onSelectMoodFilter?.(null)}
                  className="rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-300 hover:bg-slate-700 transition"
                >
                  Clear Filter &times;
                </button>
              )}
            </div>

            {/* Glowing Segmented Sentiment Progress Bar */}
            {hasMoodData && (
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80 flex">
                  <div
                    style={{ width: `${stats.sentimentBreakdown.positivePct}%` }}
                    className="bg-emerald-500 shadow-[0_0_8px_#10b981] transition-all duration-500"
                    title={`Positive: ${stats.sentimentBreakdown.positivePct}%`}
                  />
                  <div
                    style={{ width: `${stats.sentimentBreakdown.neutralPct}%` }}
                    className="bg-amber-500 shadow-[0_0_8px_#f59e0b] transition-all duration-500"
                    title={`Neutral: ${stats.sentimentBreakdown.neutralPct}%`}
                  />
                  <div
                    style={{ width: `${stats.sentimentBreakdown.challengingPct}%` }}
                    className="bg-rose-500 shadow-[0_0_8px_#f43f5e] transition-all duration-500"
                    title={`Challenging: ${stats.sentimentBreakdown.challengingPct}%`}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
