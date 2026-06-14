# InterviewAI

An AI-powered technical interviewer that crawls a candidate's GitHub profile to conduct adaptive, voice-enabled coding interviews and generates structured PDF scorecards.


Yes — here’s a clean GitHub README draft you can paste into your repo README.

```md
# GitInterviewer

GitInterviewer is an AI-powered technical interview platform that analyzes a candidate’s GitHub profile, generates personalized interview questions, conducts a realtime voice/text interview, and produces an AI-generated evaluation scorecard with PDF export.

## Features

- GitHub profile URL input
- Public repository scraping and technology analysis
- AI-generated personalized technical questions
- Adaptive interview difficulty
- Native OpenAI Realtime voice agent using WebRTC
- Text fallback mode for noisy environments or mic issues
- Live AI and candidate voice visualizers
- Transcript storage
- Final evaluation scorecard
- PDF interview report export

## Tech Stack

- Frontend: React 19, TypeScript, Bun, Tailwind CSS, Lucide icons
- Backend: Bun, Express, TypeScript
- Database: PostgreSQL with Prisma
- AI: OpenAI Responses API and OpenAI Realtime API
- Voice: WebRTC with OpenAI Realtime models
- PDF: PDFKit
- Monorepo: Turbo + Bun workspaces

## Architecture

GitInterviewer uses a full-stack monorepo architecture.

The frontend collects a GitHub profile URL and sends it to the backend. The backend scrapes public GitHub repositories, stores interview metadata in PostgreSQL, and uses OpenAI to generate a candidate profile and personalized questions.

For the live interview, the frontend creates a WebRTC connection to OpenAI Realtime. The backend securely creates a short-lived Realtime client secret so the OpenAI API key never reaches the browser. The AI interviewer speaks through the Realtime model, listens to the candidate through microphone audio, and also supports typed responses through a data channel.

After the interview ends, the transcript is sent back to the backend. The backend generates a structured evaluation and stores the scorecard.

## System Flow

1. Candidate enters GitHub profile URL.
2. Backend scrapes public GitHub repositories.
3. OpenAI analyzes repositories and creates personalized questions.
4. Interview session is stored in PostgreSQL.
5. Frontend opens the interview room.
6. Backend creates an OpenAI Realtime client secret.
7. Frontend connects to OpenAI Realtime using WebRTC.
8. AI interviewer asks questions by voice.
9. Candidate answers by voice or text.
10. Final transcript is evaluated by OpenAI.
11. Scorecard and PDF report are generated.

## Project Structure

```txt
apps/
  backend/
    index.ts              # Express API routes
    services/ai.ts        # OpenAI profile, question, and evaluation logic
    scrapers/github.ts    # GitHub repository scraper
    prisma/schema.prisma  # Database schema

  frontend/
    src/components/Form.tsx       # GitHub URL form
    src/components/Interview.tsx  # Realtime interview room
    src/components/Result.tsx     # Scorecard UI
    src/components/VoiceOrb.tsx   # Voice visualizer
```

## Environment Variables

Create a `.env` file for the backend:

```env
OPENAI_API_KEY=your_openai_api_key
DATABASE_URL=your_postgres_database_url

# Optional
OPENAI_MODEL=gpt-5.5
OPENAI_REALTIME_MODEL=gpt-realtime-2
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

## Installation

```bash
bun install
```

## Run Development Servers

Start backend:

```bash
bun --cwd apps/backend dev
```

Start frontend:

```bash
bun --cwd apps/frontend dev
```

Frontend runs on:

```txt
http://localhost:3000
```

Backend runs on:

```txt
http://localhost:3001
```

## Main API Routes

```txt
POST /api/v1/pre-interview
GET  /api/v1/interview/:interviewId
POST /api/v1/interview/:interviewId/session
POST /api/v1/interview/:interviewId/finalize
GET  /api/v1/result/:interviewId
GET  /api/v1/result/:interviewId/pdf
```

## Voice Agent Design

The voice agent uses OpenAI Realtime with WebRTC. The browser captures microphone audio and receives AI speech as a remote audio stream. A WebRTC data channel is used for Realtime events, transcript updates, typed answers, and interview state.

Text mode can be used without microphone access. Voice mode requires browser and operating system microphone permission.

## Output

At the end of an interview, GitInterviewer generates:

- Overall score
- Technical knowledge score
- Problem-solving score
- Communication score
- Confidence score
- Strengths
- Weaknesses
- Recommendations
- Full transcript
- Downloadable PDF report

## Notes

For voice mode, microphone access must be allowed in both the browser and operating system privacy settings.
```
