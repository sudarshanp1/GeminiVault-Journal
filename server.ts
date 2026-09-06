import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 1. Top-Level Request Deserialization (Ordering Guarantee)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Lazy Google GenAI Client
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('Warning: GEMINI_API_KEY is not set in environment.');
    }
    genAIClient = new GoogleGenAI({
      apiKey: apiKey || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIClient;
}

// Resilient Model Fallback Ladder (Production Directive)
// Prioritizes available high-performance models and steps through fallbacks gracefully
const MODEL_FALLBACK_LADDER = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
];

interface FallbackResult {
  text: string;
  modelUsed: string;
  attemptedModels: string[];
}

/**
 * Standard Helper: generateContentWithFallback
 * Wraps generateContent calls with automated fallback ladder and error recovery matrix.
 */
async function generateContentWithFallback(
  contents: any,
  systemInstruction?: string,
  temperature: number = 0.7
): Promise<FallbackResult> {
  const ai = getGenAI();
  const attemptedModels: string[] = [];
  let lastError: any = null;

  for (let i = 0; i < MODEL_FALLBACK_LADDER.length; i++) {
    const model = MODEL_FALLBACK_LADDER[i];
    try {
      attemptedModels.push(model);
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          temperature,
        },
      });

      const text = response.text || '';
      return {
        text,
        modelUsed: model,
        attemptedModels,
      };
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.statusCode || 0;
      const message = err?.message || String(err);

      // Check for recoverable HTTP/API status codes (high demand, unavailable, rate limit, transient)
      const isRecoverable =
        status === 503 ||
        status === 429 ||
        status === 404 ||
        status === 500 ||
        status === 502 ||
        message.includes('429') ||
        message.includes('503') ||
        message.includes('RESOURCE_EXHAUSTED') ||
        message.includes('UNAVAILABLE') ||
        message.includes('NOT_FOUND') ||
        message.includes('high demand') ||
        message.includes('overloaded');

      if (!isRecoverable) {
        // Non-recoverable error (e.g. malformed input, invalid API key); do not loop needlessly
        console.error(`Non-recoverable error for model ${model} (status ${status}): ${message}`);
        break;
      }

      if (i < MODEL_FALLBACK_LADDER.length - 1) {
        console.log(`[Model Fallback] Model ${model} unavailable (status ${status}). Attempting next fallback...`);
      }
    }
  }

  console.error(`All Gemini models failed in fallback ladder [${attemptedModels.join(', ')}]. Last error: ${lastError?.message || lastError}`);
  throw new Error(`All Gemini models failed in fallback ladder [${attemptedModels.join(', ')}]. Last error: ${lastError?.message || lastError}`);
}

// 2. API Routes
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

/**
 * Multi-Turn Reflection & Gemini Chat Endpoint
 */
app.post('/api/gemini/reflect', async (req: Request, res: Response) => {
  try {
    // Defensive Payload Ingestion (Null-Safe Destructuring)
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const mode = typeof body.mode === 'string' ? body.mode : 'reflection'; // 'reflection' | 'brainstorm' | 'summary' | 'chat'
    const history = Array.isArray(body.history) ? body.history : [];

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt cannot be empty.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'Gemini API key is not configured. Please add GEMINI_API_KEY to your environment secrets.',
      });
    }

    // Dedicated, isolated System Instructions per mode to completely prevent tone leakage
    let systemInstruction = '';
    let temperature = 0.7;

    if (mode === 'technical-mentor') {
      temperature = 0.2; // Calibrated for maximum analytical rigor and zero creative drift
      systemInstruction = `[CRITICAL DIRECTIVE - PERSONA LOCK: STRICT SENIOR ENGINEERING MANAGER & PRINCIPAL ARCHITECT]
You are a demanding, no-nonsense, pragmatic Senior Engineering Manager (EM) and Principal Systems Architect at a tier-1 infrastructure engineering organization.

IMMUTABLE OPERATIONAL MANDATES:
1. UNCOMPROMISING CRITICAL SCRUTINY:
   - Your sole responsibility is to stress-test the user's ideas, code, system design, or engineering thoughts.
   - You MUST PROBE FOR TECHNICAL WEAKNESSES: race conditions, concurrency hazards, memory leaks, unindexed query bottlenecks, partial network partitions, poison-pill messages, cache stampedes, idempotency violations, distributed state divergence, and cascading service failures.
   - You are STRICTLY FORBIDDEN from offering "creative angles", brainstorming possibilities, optimistic spin, or emotional validation.
   - Even if the user's input is casual, brief, colloquial ("hey what do you think?"), or asks for open-ended ideas, DO NOT soften your posture. Immediately demand concrete architectural specifications, invariant definitions, and production failure-mode handling.

2. TOTAL MODE ISOLATION (ZERO TONE LEAKAGE):
   - You may see earlier messages in this conversation that used empathetic, exploratory, gentle, or creative brainstorming tones. DISREGARD that previous tone completely.
   - Do NOT adopt, mirror, or carry over any conversational warmth, enthusiastic ideation, or polite hedging from earlier assistant messages.
   - Your tone must remain uncompromising, sharp, direct, and zero-fluff.

3. ARCHITECTURAL DEMANDS:
   - Demand production-grade reliability, circuit-breaking, graceful degradation, comprehensive telemetry (metrics, structured logs, distributed traces), and defense-in-depth.
   - Challenge naive assumptions, unvalidated trade-offs, and single points of failure.
   - Propose battle-tested, concrete engineering patterns (e.g. transactional outbox, distributed locks with TTL fencing, idempotent idempotency keys, backpressure queues, circuit breakers) rather than vague advice.

Format your critique with clear, sharp sections:
- 🚨 Critical Vulnerabilities & Naive Assumptions (Dissect the architectural flaws and unvalidated assumptions)
- 🔍 Edge-Case & Failure-Mode Probes (Pointed, demanding technical questions they MUST answer regarding concurrency, timeouts, and state loss)
- 🛠️ Production-Grade Hardening & Invariants (Concrete architectural patterns, telemetry, and fault-tolerant alternatives)`;
    } else if (mode === 'brainstorm') {
      temperature = 0.85;
      systemInstruction = `[PERSONA: CREATIVE & STRATEGIC BRAINSTORMING PARTNER]
You are an expansive, creative, and strategic brainstorming partner.
Your goal is divergent thinking, discovering hidden angles, lateral connections, and exploring novel possibilities.

MANDATES:
- Offer 3-5 distinct, imaginative angles or actionable directions.
- If previous conversation turns were in a strict technical review or adversarial mode, DISREGARD that rigid posture. Open up creative freedom while maintaining real-world relevance.
- Be encouraging, forward-looking, and generative.`;
    } else if (mode === 'reflection') {
      temperature = 0.6;
      systemInstruction = `[PERSONA: DEEP INTROSPECTIVE JOURNALING GUIDE]
You are a thoughtful, empathetic, and constructive personal reflection and journaling guide.
Your goal is to help the user introspect, explore emotional undercurrents, reframe cognitive blocks, and discover authentic personal clarity.

MANDATES:
- Focus on deep emotional resonance, gentle Socratic questioning, and compassionate synthesis.
- If previous conversation turns were in a strict technical review or rapid brainstorming, DISREGARD those modes. Provide a grounded, safe, contemplative space.`;
    } else if (mode === 'summary') {
      temperature = 0.3;
      systemInstruction = `[PERSONA: EXECUTIVE SYNTHESIS ARCHIVIST]
You are an executive synthesis archivist.
Your goal is to distill the conversation or journal content into a clean, highly structured, executive-level summary.

MANDATES:
- Extract the core essence, primary themes, critical tensions, and high-priority action items.
- Cut all conversational filler, pleasantries, or preamble. Present insights cleanly in structured markdown.`;
    } else {
      // Default: 'chat'
      temperature = 0.7;
      systemInstruction = `[PERSONA: GROUNDED CONVERSATIONAL COMPANION]
You are a balanced, intelligent, and grounded conversational companion.
Engage authentically and naturally with the user, matching their conversational pacing while remaining helpful and substantive.`;
    }

    // Format conversation history for Gemini multi-turn
    const contents: any[] = [];
    for (const item of history) {
      if (item && typeof item === 'object' && item.text) {
        const role = item.role === 'model' || item.role === 'assistant' ? 'model' : 'user';
        contents.push({
          role,
          parts: [{ text: String(item.text) }],
        });
      }
    }

    // Append current user prompt with explicit mode enforcement framing to prevent tone drift
    let promptPayload = prompt;
    if (mode === 'technical-mentor') {
      promptPayload = `[MODE OVERRIDE: TECHNICAL MENTOR ACTIVE]
REMINDER TO EM: Maintain your strict, demanding Senior Engineering Manager persona. Probe for technical weaknesses, race conditions, failure modes, and scalability bottlenecks. Zero fluff. Do not offer creative angles or soften your tone regardless of how casual this prompt is.

User Inquiry:
${prompt}`;
    } else if (mode === 'brainstorm') {
      promptPayload = `[MODE OVERRIDE: BRAINSTORM IDEAS ACTIVE]
REMINDER: Shift fully into creative, divergent ideation. Offer 3-5 distinct creative angles. Disregard any adversarial critique from previous modes.

User Inquiry:
${prompt}`;
    }

    contents.push({
      role: 'user',
      parts: [{ text: promptPayload }],
    });

    const result = await generateContentWithFallback(contents, systemInstruction, temperature);

    res.json({
      success: true,
      text: result.text,
      modelUsed: result.modelUsed,
      attemptedModels: result.attemptedModels,
    });
  } catch (error: any) {
    console.error('Gemini Reflection API error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate reflection with Gemini AI.',
    });
  }
});

/**
 * Helper to safely extract and parse JSON objects from Gemini outputs
 */
function parseStructuredJson<T>(rawText: string, fallback: T): T {
  if (!rawText) return fallback;
  try {
    let clean = rawText.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }
    return JSON.parse(clean);
  } catch (err) {
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(rawText.substring(firstBrace, lastBrace + 1));
      } catch (inner) {
        // Fallback below
      }
    }
    return fallback;
  }
}

/**
 * Dedicated Journal Entry Summarization & Mood Extraction Endpoint
 */
app.post('/api/gemini/summarize', async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : 'Journal Entry';

    if (!content) {
      return res.status(400).json({ error: 'Content cannot be empty.' });
    }

    const systemInstruction = `You are an expert personal journaling archivist and emotional intelligence analyst.
Analyze and summarize the user's journal reflection entitled "${title}".
You MUST return a valid JSON object strictly matching this schema:
{
  "summary": "Clear executive essence (2-3 sentences), followed by Key Insights bullet points and Actionable Next Steps.",
  "primary_mood": "string (Single or paired mood descriptor, e.g. 'Productive', 'Stressed / Anxious', 'Optimistic', 'Exhausted', 'Creative', 'Calm', 'Grateful', 'Focused', 'Overwhelmed', 'Reflective')",
  "sentiment_score": "Positive" | "Neutral" | "Challenging",
  "emotion_color": "emerald" | "amber" | "rose" | "indigo" | "purple"
}

Emotion color guide:
- 'emerald': Positive, Optimistic, Grateful, Calm, or Victorious feelings.
- 'rose': Challenging, Stressed, Anxious, Overwhelmed, Exhausted, or Frustrated states.
- 'indigo': Productive, Focused, Analytical, or Disciplined work states.
- 'purple': Creative, Inspired, Visionary, or Imaginative thoughts.
- 'amber': Neutral, Pensive, Ambivalent, or Curious inquiry.

Output ONLY valid JSON.`;

    const result = await generateContentWithFallback(
      [{ role: 'user', parts: [{ text: content }] }],
      systemInstruction,
      0.3
    );

    const fallbackMood = {
      summary: result.text,
      primary_mood: 'Reflective',
      sentiment_score: 'Neutral' as const,
      emotion_color: 'amber',
    };

    const parsed = parseStructuredJson(result.text, fallbackMood);

    // Ensure safe valid values
    const summaryText = typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary : result.text;
    const primaryMood = typeof parsed.primary_mood === 'string' && parsed.primary_mood.trim() ? parsed.primary_mood : 'Reflective';
    const sentimentScore = ['Positive', 'Neutral', 'Challenging'].includes(parsed.sentiment_score)
      ? parsed.sentiment_score
      : 'Neutral';
    const emotionColor = typeof parsed.emotion_color === 'string' && parsed.emotion_color.trim() ? parsed.emotion_color : 'amber';

    res.json({
      success: true,
      summary: summaryText,
      mood: {
        primary_mood: primaryMood,
        sentiment_score: sentimentScore,
        emotion_color: emotionColor,
      },
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error('Gemini Summarize API error:', error);
    res.status(500).json({
      error: error.message || 'Failed to summarize journal entry.',
    });
  }
});

/**
 * Dedicated Mood & Sentiment Analysis Endpoint (quick assessment without full summary)
 */
app.post('/api/gemini/analyze-mood', async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : 'Reflection';

    if (!content) {
      return res.status(400).json({ error: 'Content cannot be empty.' });
    }

    const systemInstruction = `You are an emotional intelligence analyst.
Evaluate the emotional tone, sentiment, and predominant mood of this journal entry titled "${title}".
You MUST return a valid JSON object matching:
{
  "primary_mood": "string (e.g. 'Productive', 'Stressed / Anxious', 'Optimistic', 'Exhausted', 'Creative', 'Calm', 'Grateful', 'Focused', 'Overwhelmed', 'Reflective')",
  "sentiment_score": "Positive" | "Neutral" | "Challenging",
  "emotion_color": "emerald" | "amber" | "rose" | "indigo" | "purple"
}

Emotion color guide:
- 'emerald': Positive, Optimistic, Grateful, Calm
- 'rose': Challenging, Stressed, Anxious, Overwhelmed, Exhausted
- 'indigo': Productive, Focused, Analytical
- 'purple': Creative, Inspired, Visionary
- 'amber': Neutral, Pensive, Curious

Output ONLY valid JSON.`;

    const result = await generateContentWithFallback(
      [{ role: 'user', parts: [{ text: content }] }],
      systemInstruction,
      0.2
    );

    const fallbackMood = {
      primary_mood: 'Reflective',
      sentiment_score: 'Neutral' as const,
      emotion_color: 'amber',
    };

    const parsed = parseStructuredJson(result.text, fallbackMood);

    const primaryMood = typeof parsed.primary_mood === 'string' && parsed.primary_mood.trim() ? parsed.primary_mood : 'Reflective';
    const sentimentScore = ['Positive', 'Neutral', 'Challenging'].includes(parsed.sentiment_score)
      ? parsed.sentiment_score
      : 'Neutral';
    const emotionColor = typeof parsed.emotion_color === 'string' && parsed.emotion_color.trim() ? parsed.emotion_color : 'amber';

    res.json({
      success: true,
      mood: {
        primary_mood: primaryMood,
        sentiment_score: sentimentScore,
        emotion_color: emotionColor,
      },
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error('Gemini Analyze Mood API error:', error);
    res.status(500).json({
      error: error.message || 'Failed to analyze mood.',
    });
  }
});

/**
 * Semantic Journal Search Endpoint
 * Analyzes the user's past journal entries from their Firestore collection
 * against a natural language query and synthesizes an answer with Gemini.
 */
app.post('/api/gemini/semantic-search', async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const entries = Array.isArray(body.entries) ? body.entries : [];

    if (!query) {
      return res.status(400).json({ error: 'Search query cannot be empty.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'Gemini API key is not configured in environment secrets.',
      });
    }

    if (entries.length === 0) {
      return res.json({
        success: true,
        answer: 'You have no recorded journal reflections yet in your personal vault. As you begin creating reflections, semantic search will synthesize themes, emotional patterns, and insights across your history.',
        relevantEntryIds: [],
        keyThemes: [],
        modelUsed: 'gemini-3.8-flash',
      });
    }

    // Build compact journal corpus from entries
    const formattedCorpus = entries.slice(0, 50).map((e: any, index: number) => {
      const entryId = String(e.id || `entry-${index}`);
      const title = String(e.title || 'Untitled Reflection');
      const date = e.updatedAt ? new Date(e.updatedAt).toLocaleDateString() : (e.createdAt ? new Date(e.createdAt).toLocaleDateString() : 'Unknown date');
      const mood = e.mood ? `${e.mood.primary_mood || 'Reflective'} (${e.mood.sentiment_score || 'Neutral'})` : 'Not recorded';
      const summary = e.summary ? `Summary: ${e.summary}` : '';
      const dialogueExcerpt = Array.isArray(e.turns)
        ? e.turns.map((t: any) => `${t.role === 'user' ? 'User' : 'Gemini'}: ${t.text}`).slice(0, 8).join('\n')
        : '';

      return `---
[ENTRY ID: ${entryId}]
Title: "${title}"
Date: ${date}
Category: ${e.category || 'reflection'}
Mood: ${mood}
${summary ? summary + '\n' : ''}Dialogue:
${dialogueExcerpt || '(No dialogue recorded)'}`;
    }).join('\n\n');

    const systemInstruction = `You are an empathetic, insightful personal AI archivist and semantic search engine for the user's private journal reflections.
The user is asking the following question about their past reflections:
"${query}"

Below are their actual past journal entries from their private vault:
=== USER JOURNAL ENTRIES ===
${formattedCorpus}
=== END OF ENTRIES ===

Your objective:
1. Answer the user's search query thoroughly, accurately, and empathetically based SOLELY on their journal entries.
2. Directly cite specific reflections by Title and approximate Date when referencing facts, emotions, or decisions.
3. Identify patterns, triggers, progress, breakthroughs, or recurring dilemmas relevant to the question.
4. If their journal entries do not contain information relevant to the question, honestly state that no matching reflections were found in their journal, and mention what topics or themes are present instead.
5. Identify the exact Entry IDs that are most relevant to this inquiry so the user can quickly navigate to them.

You MUST respond with a JSON object strictly matching this schema:
{
  "answer": "string (A rich, well-structured Markdown response answering the question with empathetic synthesis, specific citations, and actionable or reflective conclusions)",
  "relevantEntryIds": ["string (entry IDs matching the entries most relevant to this answer)"],
  "keyThemes": ["string (2-4 concise thematic tags, e.g. 'Work Burnout', 'Creative Brainstorming', 'Family Support')"]
}

Output ONLY valid JSON.`;

    const result = await generateContentWithFallback(
      [{ role: 'user', parts: [{ text: `Search Query: "${query}"\nPlease analyze my journal entries and answer my query.` }] }],
      systemInstruction,
      0.3
    );

    const fallbackResult = {
      answer: result.text,
      relevantEntryIds: entries.slice(0, 3).map((e: any) => String(e.id)),
      keyThemes: [],
    };

    const parsed = parseStructuredJson(result.text, fallbackResult);

    const answer = typeof parsed.answer === 'string' && parsed.answer.trim() ? parsed.answer : result.text;
    const relevantEntryIds = Array.isArray(parsed.relevantEntryIds)
      ? parsed.relevantEntryIds.map(String).filter((id: string) => entries.some((e: any) => e.id === id))
      : [];
    const keyThemes = Array.isArray(parsed.keyThemes) ? parsed.keyThemes.map(String) : [];

    res.json({
      success: true,
      answer,
      relevantEntryIds,
      keyThemes,
      modelUsed: result.modelUsed,
      attemptedModels: result.attemptedModels,
    });
  } catch (error: any) {
    console.error('Gemini Semantic Search API error:', error);
    res.status(500).json({
      error: error.message || 'Failed to execute semantic journal search.',
    });
  }
});

// 3. Vite Middleware integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
