# AGENTS.md

## Project Context

ZEUS — AI learning companion. Frontend: React 18 + Vite. Backend: FastAPI + PostgreSQL. AI Orchestrator: 3 Agents (Discovery, Planning, Execution).

## Key Files

- `src/`: frontend source (React 18, React Router, Tailwind)
- `src/api/client.js`: local API client (replaces Base44 SDK) — entities, functions, integrations, auth (demo-user)
- `src/api/client.js`: local API client — entities, functions, integrations, auth (demo-user)
- `vite.config.js`: Vite + React + proxy /api -> 8000, alias @ -> ./src
- `server/app/main.py`: FastAPI entry
- `server/app/models/`: 11 SQLModel tables
- `server/app/services/llm.py`: AI Orchestrator (Pollinations/Groq/Gemini/OpenAI)
- `server/`: FastAPI backend (run with `uvicorn app.main:app --reload`)

## Working Notes

- Backend: `cd server && uvicorn app.main:app --reload --port 8000` (or docker-compose)
- Frontend: `npm run dev` (proxy /api to 8000)
- No Base44 dependency — all removed. Database is PostgreSQL (SQLite fallback).
- Auth is demo-user (postponed). All entities use user_id="demo-user".
- AI: uses free LLM (Pollinations) if no API key, or Groq/Gemini/OpenAI if keys set.
