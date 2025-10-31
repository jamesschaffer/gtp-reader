# GTP Reader - Project Context

## Project Overview

GTP Reader is a Chrome extension that provides instant, AI-powered article summarization for web content. The extension eliminates the friction of reading long-form content by delivering structured summaries with minimal user interaction.

**Current Version:** 0.3.2
**Status:** Production (Chrome Web Store)

## Vision & Mission

**Mission:** Enable busy professionals to quickly extract value from web articles without sacrificing comprehension or context.

**Vision:** Become the default tool for intelligent content consumption, helping users stay informed without information overload.

## Problem Statement

Professionals face an overwhelming amount of online content daily. Current solutions either:
- Require manual API key setup (high friction)
- Lack structured output (poor UX)
- Don't preserve context or nuance (quality issues)
- Have complex pricing models (user barrier)

GTP Reader solves this by providing zero-config, instant summarization with structured, high-quality output.

## Target Users

### Primary Persona: The Busy Professional
- **Role:** Knowledge workers, researchers, executives, journalists
- **Pain Point:** Information overload, limited reading time
- **Goal:** Stay informed without spending hours reading
- **Behavior:** Frequently opens articles, skims content, context-switches often

### Secondary Persona: The Researcher
- **Role:** Students, academics, content creators
- **Pain Point:** Need to process large volumes of research quickly
- **Goal:** Identify key arguments and evidence efficiently
- **Behavior:** Deep dives into topics, needs nuanced understanding

## Core Features

### 1. One-Click Summarization
- **Implementation:** Right-click context menu integration (sw.js:34-43)
- **UX:** Minimal interaction required - right-click → "Summarize this page"
- **Value:** Reduces friction to near-zero

### 2. Structured Summary Format
- **Headline:** One-sentence thesis/essence (sw.js:142)
- **Tone:** Brief stance characterization (sw.js:144)
- **Bullets:** Up to 7 key points with facts, claims, evidence (sw.js:143)
- **Value:** Scannable, actionable information

### 3. Zero-Configuration Setup
- **Implementation:** Server-side API key management via Cloudflare Worker
- **UX:** Install and immediately use - no setup required
- **Value:** Eliminates primary user onboarding barrier

### 4. Clean, Isolated UI
- **Implementation:** Shadow DOM overlay (sw.js:52-118)
- **UX:** Floating panel that doesn't conflict with page styles
- **Value:** Professional appearance across all websites

## Technical Architecture

### Frontend (Chrome Extension)
- **Manifest:** V3 (modern, secure standard)
- **Service Worker:** sw.js - handles context menu, injection logic
- **Permissions:** storage, activeTab, scripting, contextMenus
- **UI Layer:** Shadow DOM with isolated CSS (reader-overlay.css)

### Backend (Cloudflare Worker)
- **Location:** worker/src/worker.ts
- **Function:** Secure proxy to OpenAI API
- **Security:** Extension ID validation, install token verification
- **API:** GPT-4o-mini streaming responses
- **Hosting:** Cloudflare Workers (gtp-reader-ai-proxy.jamesschaffer.workers.dev)

### Data Flow
1. User right-clicks → Context menu appears
2. Extension extracts article text (up to 20k chars)
3. Sends to Cloudflare Worker with install token
4. Worker authenticates and proxies to OpenAI
5. Streams response back to extension
6. Extension parses JSON and renders in overlay

## Key Technical Decisions

### Why Cloudflare Worker Proxy?
- **Security:** Keeps API keys server-side
- **UX:** Users don't need their own OpenAI account
- **Cost Control:** Centralized billing and rate limiting
- **Privacy:** Single controlled endpoint

### Why Shadow DOM?
- **Isolation:** Prevents page CSS conflicts
- **Reliability:** Consistent appearance across all sites
- **Maintainability:** Self-contained component

### Why GPT-4o-mini?
- **Cost:** More affordable for high-volume usage
- **Speed:** Faster responses improve UX
- **Quality:** Sufficient for summarization tasks

### Why JSON Structured Output?
- **Parsing:** Reliable extraction of headline/tone/bullets
- **UX:** Enables rich formatting and presentation
- **Quality:** Forces AI to think structurally

## Development Workflow

### Local Development
```bash
# Load extension
1. chrome://extensions
2. Enable Developer mode
3. Load unpacked → select project folder
```

### Worker Development
```bash
cd worker
npx wrangler dev        # Local testing
npx wrangler deploy     # Production deployment
```

### Extension Publishing
- Package via Chrome Web Store Developer Dashboard
- Version defined in manifest.json
- Icons: 16, 32, 48, 128px variants

## Success Metrics

### User Engagement
- [ ] Daily active users
- [ ] Summaries generated per user
- [ ] Retention rate (D1, D7, D30)

### Quality Metrics
- [ ] Summary accuracy (user feedback)
- [ ] Error rate (parsing failures, API errors)
- [ ] Average response time

### Growth Metrics
- [ ] Chrome Web Store installs
- [ ] User ratings and reviews
- [ ] Uninstall rate

## Known Limitations

1. **Content Detection:** May struggle with dynamic/JavaScript-heavy sites
2. **Length Limit:** 20k character cap may miss content on very long articles
3. **Paywall Content:** Cannot access content behind authentication
4. **Language:** Optimized for English content
5. **Cost:** Server-side API costs scale with usage

## Future Considerations

### Near-Term Enhancements
- [ ] Keyboard shortcut for faster access
- [ ] Save/export summaries feature
- [ ] Theme support (dark mode)
- [ ] Multi-language support
- [ ] Cost monitoring dashboard

### Long-Term Vision
- [ ] Browser action (toolbar button) in addition to context menu
- [ ] Cross-browser support (Firefox, Safari)
- [ ] Custom summarization styles (technical, ELI5, etc.)
- [ ] Integration with read-it-later services
- [ ] Premium tier with advanced features
- [ ] Local AI model option for privacy-conscious users

## Dependencies

### Runtime
- OpenAI API (GPT-4o-mini)
- Cloudflare Workers platform
- Chrome Extension APIs (Manifest V3)

### Development
- TypeScript (5.9.3)
- Wrangler (4.42.2)
- @cloudflare/workers-types (4.20251011.0)

## Security & Privacy

### User Data
- **No personal data collected:** Extension only sends page content
- **Ephemeral processing:** Content not stored server-side
- **Install tokens:** Anonymous UUID for rate limiting only

### API Security
- Extension ID validation on worker
- Install token requirement
- Allowlist of approved extension IDs
- CORS protection

## Competitive Positioning

**vs. Manual Reading:** 10x faster comprehension
**vs. Reader Mode:** Adds AI intelligence, not just formatting
**vs. Other AI Extensions:** Zero-config, structured output
**vs. ChatGPT Copy-Paste:** One-click in-context experience

## License

Standard license (see license file)

---

**Last Updated:** 2025-10-30
**Maintainer:** James Schaffer
**Repository:** https://github.com/jamesschaffer/gtp-reader
