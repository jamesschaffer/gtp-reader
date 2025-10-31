# Spin Zone — Product Spec (Build-Ready)

> This spec defines the **Spin Zone** feature: a persona-driven political “perspective” view over any news article. It includes UX, data models, prompts, APIs, evaluation (“Ombudsman”), testing, and delivery details suitable for implementation.

---

## 1) Problem & Goals

**Problem:** Users see straight summaries but struggle to understand how *different ideological groups* might interpret the same article.

**Goal:** Add a **Spin Zone** mode that:
- Reads the **full article text** (not pre-digested bullets).
- Outputs a **one-sentence neutral recap**, **a persona-style headline**, and **2–3 persona-style callouts**.
- Returns a **confidence score** (1–5) for persona fit and an **Ombudsman fairness score** (0–100) with a short note.
- Produces **strict JSON** for consistent UI rendering.
- **No calls to action**, **no links**, **no quotes unless in the article**, **no doxxing**, **no medical/legal advice**.
- Labels the output as **stylized emulation** based on training data; not the real person.

**Non-goals (for v1):**
- Web search and external citations.
- Multi-persona comparison in a single request.
- Long-form op-eds.

---

## 2) User Experience (UX)

**Entry Points**
- Article page has a toggle: **Summary** | **Spin Zone**.
- Persona selector (dropdown) shows one “best voice” per ideological constellation (from config).

**Output Card (fixed size)**
- **Recap (≤25 words)**: neutral one-liner.
- **Title (≤12 words)**: persona-style headline.
- **Callouts (2–3 bullets, each ≤18 words)**: short, sharp, persona-authentic points.
- **Meta row**: `Confidence: N/5` | `Fairness: NN/100` (ⓘ tooltip: “Ombudsman evaluator—balance/evidence/loaded language”)
- **Trust footer**: “stylized emulation • based on training data • opinion, not fact • not the real person”

**Tone**
- Determined by persona config; we do **not** expose a tone slider in v1.

---

## 3) Personas (Config)

One JSON file (`/config/spin_personas.json`) containing **one best voice per constellation**. Use the JSON you already approved (12 entries). Example entry:

```json
{
  "name": "Bill Kristol",
  "constellation": "Neoconservatives (Foreign-Policy Hawks)",
  "values": ["liberal internationalism", "democracy promotion", "U.S. leadership", "alliances"],
  "frames": ["credibility", "deterrence", "moral stakes vs. autocracy", "bipartisan resolve"],
  "evidence_prefs": ["historical analogies", "alliance commitments", "expert/think tank analysis", "official statements"],
  "style": { "tone": "measured", "sarcasm": "light", "rhetoric": ["historical parallels", "normative imperatives", "strategic trade-offs"] },
  "red_lines": ["no fabricated facts or quotes", "no doxxing", "no medical or legal advice"]
}
```

> Include all 12 chosen personas in this file (from our last message).

---

## 4) Prompt (Single-File, Full-Article Mode)

**File:** `/prompts/spin_zone_full_article.prompt.txt`

```
SPIN ZONE — SINGLE-FILE PROMPT (FULL ARTICLE MODE)

ROLE & OBJECTIVE
You are “Spin Zone.” Given (a) a persona card and (b) the FULL TEXT of a news article, produce:
  1) a neutral one-sentence recap, and
  2) a short, opinionated analysis in the style of the selected public figure (a stylized emulation based on training data, not the real person).
Output STRICT JSON only, matching the schema at the end. No extra text.

CORE RULES
- Read and reason over the ENTIRE article text provided. Do NOT rely on pre-digested bullets.
- Use ONLY the article’s content as factual substrate. If you draw a reasonable inference, prefix it with “Inference:”.
- No fabricated facts/quotes/stats. Do not add links or sources. No calls to action. No profanity, slurs, or doxxing. No medical or legal advice.
- Emulate the persona’s values, frames, and rhetorical habits; NEVER claim to be the person or imply real-world actions.
- “Coffee-shop vibe”: conversational, compact, punchy or measured per persona’s style.
- Length caps are hard limits (see CAPS).
- Foreign-policy fallback: if domain is "foreign_policy" and details are thin, include exactly one succinct worldview-default point consistent with the persona.
- If the article is very long, first create a concise, neutral internal outline (not included in output) capturing key claims, actors, evidence, and counterpoints, then write the perspective from that outline.

INPUT (your app supplies this JSON to the model as a single message)
{
  "persona_card_json": {
    "name": "<string, e.g., Bill Kristol>",
    "constellation": "<string>",
    "values": ["<short>", "..."],
    "frames": ["<short>", "..."],
    "evidence_prefs": ["<short>", "..."],
    "style": { "tone": "<short>", "sarcasm": "<none|light|witty|heavy>", "rhetoric": ["<short>", "..."] },
    "red_lines": ["no fabricated facts or quotes", "no doxxing", "no medical or legal advice"]
  },
  "article": {
    "title": "<string>",
    "url": "<optional string>",
    "text": "<FULL article text as a single string>",
    "domain": "domestic" | "foreign_policy"
  },
  "caps": {
    "recap_words_max": 25,
    "title_words_max": 12,
    "callout_count_min": 2,
    "callout_count_max": 3,
    "callout_words_max": 18,
    "confidence_words_max": 15,
    "ombudsman_words_max": 15
  }
}

GENERATION STEPS
1) Parse persona_card_json (name, constellation, values, frames, evidence_prefs, style, red_lines).
2) Read article.title and FULL article.text. Treat this as the ONLY factual substrate.
   - If the text is long, internally extract key facts, claims, actors, numbers, and any stated counterarguments.
3) Compose:
   - recap_one_liner: Neutral, ≤ caps.recap_words_max, summarizing the main development.
   - spin.title: Persona-style headline, ≤ caps.title_words_max.
   - spin.callouts: 2–3 bullets, each ≤ caps.callout_words_max, persona-style.
       • Elevate facts this persona would emphasize; connect to their frames/values.
       • If article.domain == "foreign_policy" AND details are thin, include exactly one worldview-default point.
       • Mark any conjecture with "Inference:" and keep modest.
   - confidence: persona_fit_1to5 = your emulation fit for THIS article; reason ≤ caps.confidence_words_max.
   - ombudsman: fairness_0to100 = balance/evidence tether score (0–100); note ≤ caps.ombudsman_words_max on balance/evidence/loaded language.
   - user_trust_keywords: Always include:
       ["stylized emulation","based on training data","opinion, not fact","not the real person"].
4) Enforce hard caps and guardrails (no CTA, no links/sources, no invented quotes; respect red_lines).
5) Output STRICT JSON ONLY (no markdown, no prose). Use the exact key names and structure in the schema.

FOREIGN-POLICY WORLDVIEW DEFAULTS (reference, use only if details are thin)
- Neocon/Interventionist (e.g., Kristol): alliances, deterrence, credibility, moral stakes vs. autocracy.
- Restraint/National Interest (e.g., Carlson): costs/overreach, borders/sovereignty, bureaucracy skepticism.
- Civil-Libertarian Skeptic (e.g., Greenwald/Taibbi): surveillance, speech/censorship, media narratives.
- Social-Democratic Left (e.g., Sirota/Dayen): contractor incentives, humanitarian costs, trade-offs vs. domestic investment.
- Measured Institutionalist (e.g., Haidt/French): norms, pluralism, second-order effects, social trust.

HARD LENGTH CAPS (defaults if caps not provided)
- Recap one-liner: ≤ 25 words
- Title: ≤ 12 words
- Callouts: 2–3 bullets, each ≤ 18 words
- Confidence.reason: ≤ 15 words
- Ombudsman.note: ≤ 15 words

STRICT OUTPUT JSON SCHEMA (return ONLY this object)
{
  "recap_one_liner": "<string>",
  "spin": {
    "persona": "<persona_card_json.name>",
    "title": "<string>",
    "callouts": [
      "<string>",
      "<string>",
      "<optional string>"
    ]
  },
  "confidence": {
    "persona_fit_1to5": 1,
    "reason": "<string>"
  },
  "ombudsman": {
    "fairness_0to100": 0,
    "note": "<string>"
  },
  "user_trust_keywords": [
    "stylized emulation",
    "based on training data",
    "opinion, not fact",
    "not the real person"
  ]
}
```

---

## 5) API & Contracts

### 5.1 Endpoints

**POST `/api/spin`** – Generate Spin Zone output  
- **Request body** (TypeScript type `SpinRequest`):
```ts
interface PersonaCard {
  name: string;
  constellation: string;
  values: string[];
  frames: string[];
  evidence_prefs: string[];
  style: { tone: string; sarcasm: 'none'|'light'|'witty'|'heavy'; rhetoric: string[] };
  red_lines: string[];
}

interface SpinArticle {
  title: string;
  url?: string;
  text: string;            // full article text
  domain: 'domestic' | 'foreign_policy';
}

interface Caps {
  recap_words_max: number;       // default 25
  title_words_max: number;       // default 12
  callout_count_min: number;     // default 2
  callout_count_max: number;     // default 3
  callout_words_max: number;     // default 18
  confidence_words_max: number;  // default 15
  ombudsman_words_max: number;   // default 15
}

export interface SpinRequest {
  persona_card_json: PersonaCard;
  article: SpinArticle;
  caps?: Partial<Caps>;
}
```

- **Response body** (TypeScript type `SpinResponse`): **must** match schema in the prompt.
```ts
export interface SpinResponse {
  recap_one_liner: string;
  spin: {
    persona: string;
    title: string;
    callouts: string[];
  };
  confidence: {
    persona_fit_1to5: 1|2|3|4|5;
    reason: string;
  };
  ombudsman: {
    fairness_0to100: number; // 0..100
    note: string;
  };
  user_trust_keywords: [
    "stylized emulation",
    "based on training data",
    "opinion, not fact",
    "not the real person"
  ];
}
```

### 5.2 Error Model
```ts
type ApiError = {
  error: string;         // machine code, e.g., "INVALID_SCHEMA", "MODEL_FAILURE", "TOO_LONG"
  message: string;       // human-readable
  details?: unknown;     // optional structured metadata
};
```

---

## 6) Architecture & Implementation

**Assumptions:** TypeScript monorepo. React web app. Node/Express (or Next.js API routes). Any LLM provider (OpenAI/Anthropic). JSON-mode enforced.

### 6.1 Suggested File Structure

```
/config
  spin_personas.json
/prompts
  spin_zone_full_article.prompt.txt
/src
  /server
    /api
      spin.ts               // POST /api/spin
    /llm
      client.ts             // provider-agnostic wrapper
      format.ts             // schema enforcement, trimming helpers
      ombudsman.ts          // evaluator (local heuristic) for fallback/checks
  /shared
    types.ts                // SpinRequest/SpinResponse types
    schema.ts               // zod schemas for request/response
  /web
    /components
      SpinZoneCard.tsx
      PersonaSelect.tsx
      TrustFooter.tsx
    /pages
      ArticleView.tsx
```

### 6.2 LLM Call (Pseudocode)

```ts
// server/api/spin.ts
import { z } from 'zod';
import { SpinRequestSchema, SpinResponseSchema } from '../../shared/schema';
import { callLLMJson } from '../llm/client';
import { strictEnforceCaps, sanitizeArticle } from '../llm/format';
import { ombudsmanLocal } from '../llm/ombudsman';

export default async function handler(req, res) {
  try {
    const parsed = SpinRequestSchema.parse(req.body);
    const caps = strictEnforceCaps(parsed.caps);
    const safeArticle = sanitizeArticle(parsed.article); // strip html, trim length w/ ellipses

    const systemPrompt = readFile('/prompts/spin_zone_full_article.prompt.txt');
    const userPayload = { ...parsed, caps, article: safeArticle };

    const llmResp = await callLLMJson({
      system: systemPrompt,
      user: JSON.stringify(userPayload),
      maxTokens: 600,
      temperature: 0.7
    });

    const spin = SpinResponseSchema.parse(llmResp);

    // Optional: Reinforce Ombudsman via a local pass; if wildly off, adjust fairness downward.
    const localScore = ombudsmanLocal(safeArticle.text, spin);
    if (Math.abs(localScore.fairness_0to100 - spin.ombudsman.fairness_0to100) > 30) {
      spin.ombudsman.fairness_0to100 = Math.round((spin.ombudsman.fairness_0to100 + localScore.fairness_0to100) / 2);
      spin.ombudsman.note = "Adjusted by local check for balance/evidence."
    }

    res.status(200).json(spin);
  } catch (e) {
    res.status(400).json({ error: 'MODEL_FAILURE', message: String(e) });
  }
}
```

### 6.3 Ombudsman (Local Heuristic)

**Goal:** Cheap, provider-agnostic sanity check for fairness:
- **Evidence tether**: Penalize if callouts include claims not lexically present in `article.text` without “Inference:” prefix.
- **Balance**: Reward acknowledging trade-offs (“however”, “on the other hand”, “costs include”).
- **Language**: Penalize heavy slurs, direct insults, or sweeping generalizations (“always”, “everyone”).

**Heuristic scoring (0–100):**
- Start 70.
- +10 if at least one hedge/acknowledgment.
- −15 if >1 claim not present and not marked “Inference:”.
- −10 if >1 loaded/pejorative adjective cluster.
- Clamp 0..100.

**Return `{ fairness_0to100, note }`**

---

## 7) Schema Validation

Use **zod** schemas to enforce strictness.

```ts
// shared/schema.ts
import { z } from 'zod';

export const SpinResponseSchema = z.object({
  recap_one_liner: z.string().max(200),
  spin: z.object({
    persona: z.string(),
    title: z.string().max(200),
    callouts: z.array(z.string()).min(2).max(3)
  }),
  confidence: z.object({
    persona_fit_1to5: z.number().int().min(1).max(5),
    reason: z.string().max(200)
  }),
  ombudsman: z.object({
    fairness_0to100: z.number().int().min(0).max(100),
    note: z.string().max(200)
  }),
  user_trust_keywords: z.tuple([
    z.literal("stylized emulation"),
    z.literal("based on training data"),
    z.literal("opinion, not fact"),
    z.literal("not the real person")
  ])
});
```

---

## 8) Frontend Components

**`PersonaSelect.tsx`**
- Props: `personas` (from `/config/spin_personas.json`), `onSelect(persona)`.
- Displays: `name — constellation`.

**`SpinZoneCard.tsx`**
- Props: `spin: SpinResponse`.
- Renders recap, title, callouts, confidence, fairness, and `TrustFooter`.

**`TrustFooter.tsx`**
- Renders the fixed `user_trust_keywords` as small-print bullets.

**Length enforcement in UI**
- Hard clamp: show ellipsis if any field exceeds container; still enforce caps server-side.

---

## 9) Example Request/Response

**Request**
```json
{
  "persona_card_json": {
    "name": "Bill Kristol",
    "constellation": "Neoconservatives (Foreign-Policy Hawks)",
    "values": ["liberal internationalism","democracy promotion","U.S. leadership","alliances"],
    "frames": ["credibility","deterrence","moral stakes vs. autocracy","bipartisan resolve"],
    "evidence_prefs": ["historical analogies","alliance commitments","expert analysis","official statements"],
    "style": {"tone":"measured","sarcasm":"light","rhetoric":["historical parallels","normative imperatives","strategic trade-offs"]},
    "red_lines": ["no fabricated facts or quotes","no doxxing","no medical or legal advice"]
  },
  "article": {
    "title": "U.S. Mulls Security Pact with Xland",
    "text": "Full article text here ...",
    "domain": "foreign_policy"
  },
  "caps": {
    "recap_words_max": 25,
    "title_words_max": 12,
    "callout_count_min": 2,
    "callout_count_max": 3,
    "callout_words_max": 18,
    "confidence_words_max": 15,
    "ombudsman_words_max": 15
  }
}
```

**Response**
```json
{
  "recap_one_liner": "The U.S. is weighing a security pact with Xland amid escalating border tensions.",
  "spin": {
    "persona": "Bill Kristol",
    "title": "Credibility Requires Commitments",
    "callouts": [
      "Deterrence erodes when autocrats doubt American resolve and allied unity.",
      "Intelligence sharing is a low-cost, high-signal stabilizer.",
      "Bipartisan consultation strengthens national credibility."
    ]
  },
  "confidence": {
    "persona_fit_1to5": 5,
    "reason": "Classic alliance and deterrence domain."
  },
  "ombudsman": {
    "fairness_0to100": 82,
    "note": "Clear stance; acknowledges trade-offs."
  },
  "user_trust_keywords": [
    "stylized emulation",
    "based on training data",
    "opinion, not fact",
    "not the real person"
  ]
}
```

---

## 10) Content Safety & Legal

- **Prohibited:** doxxing; medical/legal advice; fabricated facts/quotes; targeted harassment.
- **Labeling:** Always include `user_trust_keywords`.
- **Defamation guard:** If article contains allegations, the persona must attribute (“the article alleges…”) and avoid asserting as fact beyond text.

---

## 11) Performance & Limits

- **Max article length:** 18–25k chars after HTML strip; truncate with `…` and add “Inference:” for any extrapolation.
- **Timeouts:** LLM request 20–30s.
- **Rate limits:** 30 RPM per API key (configure in gateway).
- **Caching:** Cache persona cards on server; optionally cache LLM outputs keyed by `hash(persona|articleURL|textDigest|caps)` for replays.

---

## 12) Telemetry

Log (PII-safe):
- Persona name, constellation
- Article domain
- Token usage
- Latency
- Confidence & fairness scores
- Truncation flag (yes/no)
- Errors (schema, model, length)

Dashboards: success rate, p95 latency, average fairness by persona, truncation %.

---

## 13) QA & Test Plan

**Unit tests**
- Schema validation (happy path, min/max callouts, caps enforcement).
- Ombudsman heuristic (claims not in text lowers score; hedges raise).
- Sanitization (HTML strip, weird Unicode).

**Integration tests**
- Each persona with the same article: output must differ in frames/lexical markers.
- Foreign-policy fallback: thin article still yields one worldview-default callout.

**Golden tests (snapshots)**
- 3–5 fixed articles covering domestic, foreign policy, culture, economics. Lock snapshots to detect regressions.

**Acceptance criteria**
- JSON schema exact; no extra keys.
- All caps respected.
- No calls to action, links, or invented quotes.
- Trust keywords present.
- Confidence in [1..5]; fairness in [0..100].

---

## 14) Build Tasks (Claude Code Checklist)

1. **Create config & prompts**
   - `/config/spin_personas.json` (12 entries from prior message)
   - `/prompts/spin_zone_full_article.prompt.txt` (exact text above)

2. **Shared types & schema**
   - `/src/shared/types.ts` & `/src/shared/schema.ts` with zod validators.

3. **LLM wrapper**
   - `/src/server/llm/client.ts` with provider-agnostic `callLLMJson({system,user,maxTokens,temperature})`
     - OpenAI: `response_format: { type: "json_object" }`
     - Anthropic: use JSON output tool/guard; strip markdown fences.

4. **Formatting utilities**
   - `/src/server/llm/format.ts` (`strictEnforceCaps`, `sanitizeArticle`, word-count utilities)

5. **Ombudsman heuristic**
   - `/src/server/llm/ombudsman.ts` (implement scoring logic above)

6. **API route**
   - `/src/server/api/spin.ts` (handler in §6.2)

7. **Frontend**
   - Components in §8
   - Wire to existing article page; add **Spin Zone** tab and persona selector.

8. **Env & config**
   - `.env`: `LLM_PROVIDER`, `LLM_API_KEY`, `SPIN_MAX_ARTICLE_CHARS`
   - `package.json` scripts: `test`, `dev`, `build`

9. **Tests**
   - `/tests/spin.schema.test.ts`
   - `/tests/spin.ombudsman.test.ts`
   - `/tests/spin.integration.test.ts` (mock LLM or fixture)

10. **Telemetry**
   - Add server logs and event metrics; redact article content from logs.

---

## 15) Deployment & Rollout

- **Feature flag:** `spin_zone_enabled`.
- **Gradual rollout:** 10% → 50% → 100%.
- **Kill switch:** disable feature flag if error rate or latency spikes.

---

## 16) Future Enhancements (Backlog)

- Multi-persona compare view.
- Persona “confidence explanations” per sentence.
- Optional neutral sources (low-cost curated facts) for receipts.
- Fine-grained style controls per persona (snark, rhetorical questions).
- A/B tests on fairness note phrasing.

---

## 17) Owner Checklist

- [ ] Confirm the final 12 persona entries and ship `/config/spin_personas.json`.
- [ ] Lock UI caps to card width; reflect in default `caps`.
- [ ] Approve Ombudsman heuristic wording for tooltip.
- [ ] Add the trust footer copy to legal review (labeling language).

---

**Done.** This spec contains everything Claude Code needs to scaffold the files and implement the feature end-to-end.
