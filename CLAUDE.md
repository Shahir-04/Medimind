# MediMind — Project Context

> **Read this file first.** It captures the complete architecture, design decisions, and development history of this project so you can immediately get up to speed without asking the user to re-explain anything.

---

## What Is MediMind?

MediMind is a **personalized AI medical chat assistant** that:
- Allows users to sign up/log in with a custom email+password system (no Supabase Auth)
- Lets users upload PDF case files (lab results, reports, etc.)
- Uses **RAG** (Retrieval-Augmented Generation) to search uploaded docs during chat
- Uses **Mem0** to build a persistent, evolving memory profile for each user (allergies, conditions, meds, preferences)
- Sends all of this context to **GPT-4o** to generate highly personalized medical responses
- Allows users to give thumbs-up/down feedback; negative feedback is stored in Mem0 so the AI learns

---

## Tech Stack

### Backend
- **FastAPI** — Python web framework, runs on port **8000**
- **Uvicorn** — ASGI server (`uv run uvicorn backend.main:app --reload --port 8000`)
- **Supabase (PostgreSQL)** — Database for users and document embeddings (NOT used for auth)
- **pgvector** — Postgres extension for vector similarity search on documents
- **OpenAI GPT-4o** — LLM for chat responses
- **OpenAI text-embedding-3-small** — Embeddings for RAG
- **Mem0** — Persistent AI memory store, keyed by `user_email`
- **PyJWT + bcrypt** — Custom JWT-based auth (replaces Supabase Auth)
- **pypdf + langchain-text-splitters** — PDF parsing and chunking
- **uv** — Python package manager (use `uv run` for all commands, NOT `python` or `pip`)

### Frontend
- **React 18 + Vite** — Frontend framework, runs on port **3000**
- **shadcn/ui** — Component library (New York style, blue base color)
- **Tailwind CSS 3.4** — Styling with full custom theme (CSS variables for shadcn)
- **tailwindcss-animate** — Animation plugin used by shadcn
- **lucide-react** — Icon library (`Bot`, `Send`, `Paperclip`, etc.)
- **react-router-dom** — Client-side routing

---

## Project Directory Structure

```
c:\medimind\
├── .env                        # Backend secrets (SUPABASE_URL, SUPABASE_ANON_KEY, OPENAI_API_KEY)
├── pyproject.toml              # Python dependencies (managed with uv)
├── uv.lock                     # Lockfile for Python deps
├── CLAUDE.md                   # THIS FILE — project context for AI assistants
├── supabase_auth_migration.sql # SQL to run in Supabase Dashboard (schema setup)
├── supabase_setup.sql          # Legacy setup file (kept for reference)
├── start_servers.bat           # Windows batch to start both servers
│
├── backend/
│   ├── main.py         # FastAPI app entry point — all routes defined here
│   ├── agent.py        # Core AI logic — builds prompt with memory+RAG and calls GPT-4o
│   ├── rag.py          # PDF pipeline — extract, chunk, embed, store, and search documents
│   ├── auth.py         # Custom auth — bcrypt password hashing + PyJWT token creation
│   ├── db.py           # Supabase client initialization
│   ├── mem0_config.py  # Mem0 client initialization
│   └── models.py       # Pydantic request/response schemas
│
└── frontend/
    ├── index.html              # Root HTML, loads Inter font from Google Fonts
    ├── vite.config.js          # Vite config with @ alias and proxy to backend
    ├── components.json         # shadcn/ui config (style: new-york, baseColor: blue)
    ├── jsconfig.json           # JS path aliases for @ imports
    ├── tailwind.config.js      # Full tailwind theme with shadcn CSS variable colors + animations
    ├── postcss.config.js       # PostCSS config with Tailwind + Autoprefixer
    ├── package.json            # NPM dependencies
    │
    └── src/
        ├── main.jsx            # React entry — mounts <App /> to #root
        ├── index.css           # Global CSS — CSS variables for shadcn colors, glassmorphism utilities
        ├── App.jsx             # Root component — manages auth session state (localStorage)
        ├── lib/
        │   └── utils.js        # shadcn cn() utility (clsx + tailwind-merge)
        ├── components/
        │   └── ui/             # shadcn primitive components (Button, Input, Card, etc.)
        │       ├── button.jsx
        │       ├── input.jsx
        │       ├── label.jsx
        │       ├── card.jsx
        │       ├── scroll-area.jsx
        │       ├── avatar.jsx
        │       ├── tooltip.jsx
        │       └── form.jsx
        └── pages/
            ├── Auth.jsx        # Login/signup page using shadcn Card + glassmorphism
            └── Chat.jsx        # Main chat interface — sidebar, messages, file upload
```

---

## Database Schema (Supabase — project: `fyonilpcfaumovermjis`)

Run `supabase_auth_migration.sql` in the Supabase Dashboard SQL Editor.

### Tables

**`custom_users`**
```sql
email         TEXT PRIMARY KEY
password_hash TEXT NOT NULL
```
Stores user credentials. Password is hashed with bcrypt (raw `bcrypt` library, NOT passlib — passlib has a broken self-test bug with modern bcrypt).

**`documents`**
```sql
id         UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_email TEXT NOT NULL
filename   TEXT
content    TEXT
embedding  VECTOR(1536)
```
Stores PDF chunks with their vector embeddings. Scoped per user via `user_email`.

### RPC Function

**`match_documents(query_embedding, match_email, match_count)`**
Performs cosine similarity search using pgvector `<=>` operator, filtered by `user_email`. Called by `rag.search_documents()`.

> **RLS is DISABLED** on both tables intentionally — security is handled at the application layer (FastAPI).

---

## Authentication Architecture

Supabase Auth was deliberately **removed** due to email rate limiting issues. The custom system works as follows:

1. **Signup** (`POST /signup`): Hash password with bcrypt → insert into `custom_users` → return JWT
2. **Login** (`POST /login`): Lookup user → verify bcrypt hash → return JWT
3. **Frontend**: Stores `access_token` and `email` in `localStorage`. Reads on reload in `App.jsx` `useEffect`.
4. **Token format**: HS256 JWT with `{"sub": email}`, 7-day expiry, signed with `SECRET_KEY = "medimind_local_secret_key"` (change this in production!)
5. **All chat/upload API calls** send `Authorization: Bearer <token>` header

> ⚠️ **IMPORTANT**: `passlib` is listed in `pyproject.toml` but is NOT used. It was replaced with raw `bcrypt` in `auth.py` because passlib's bcrypt self-test crashes with modern `bcrypt >= 4.x`.

---

## API Routes (`backend/main.py`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check — confirms Supabase connection |
| `POST` | `/signup` | Register new user → returns JWT |
| `POST` | `/login` | Authenticate user → returns JWT |
| `POST` | `/chat` | Send a message → returns AI response |
| `POST` | `/upload` | Upload a PDF → extract, embed, store in Supabase |
| `POST` | `/memory/add` | Manually add a fact to user's Mem0 profile |
| `GET` | `/memory/{user_email}` | Retrieve all memories for a user |

The Vite dev server proxies all `/api/*` requests to `http://localhost:8000`, stripping the `/api` prefix. So the frontend calls `/api/signup` which hits `http://localhost:8000/signup`.

---

## AI Response Pipeline (`backend/agent.py`)

For each chat message, `generate_chat_response(user_email, message)`:

1. **Mem0 search** — Finds the top 5 most relevant memories from the user's profile (allergies, conditions, past advice)
2. **RAG search** — Finds the top 3 most relevant PDF chunks from uploaded documents (`rag.search_documents`)
3. **Prompt assembly** — Combines `SYSTEM_PROMPT` + memory context + RAG context + user message
4. **GPT-4o call** — `temperature=0.2` for consistent medical answers
5. **Memory update** — Appends `"User Question: X\nAI Advice Given: Y"` to Mem0 for future context

---

## Frontend Architecture

### Session Management (`App.jsx`)
- `session` state holds `{ email, access_token }` or `null`
- On mount, reads from `localStorage` (`authToken`, `userEmail`)
- `onLogin(email, token)` saves to localStorage and updates state
- `onLogout()` clears localStorage and resets state
- Shows a loading spinner while checking localStorage

### Auth Page (`Auth.jsx`)
- Toggle between login and signup mode
- Uses shadcn `Card`, `Input`, `Label`, `Button`
- Glassmorphism card on a blue gradient background
- Calls `/api/signup` or `/api/login` directly

### Chat Page (`Chat.jsx`)
- **Sidebar**: App logo, user email, PDF upload button (file input hidden behind a styled label)
- **Chat window**: Uses shadcn `ScrollArea`, `Avatar`, `Tooltip`
- **Messages**: User messages are blue gradient bubbles (`message-user`), AI messages are glassmorphic (`message-ai`)
- **Typing indicator**: `Loader2` spinner with "MediMind is thinking..."
- **Feedback**: Thumbs up/down tooltips on each AI message; thumbs-down logs `"User rejected this advice..."` to Mem0
- **Input**: Floating bottom input bar, sends on Enter or button click

---

## Environment Variables

### `c:\medimind\.env` (Backend)
```
SUPABASE_URL=https://fyonilpcfaumovermjis.supabase.co
SUPABASE_ANON_KEY=<anon key for project fyonilpcfaumovermjis>
OPENAI_API_KEY=<openai key>
MEM0_API_KEY=<mem0 key>  # if using Mem0 cloud
```

### `c:\medimind\frontend\.env` (Frontend)
```
VITE_SUPABASE_URL=https://fyonilpcfaumovermjis.supabase.co
VITE_SUPABASE_ANON_KEY=<same anon key>
```
> ⚠️ Both `.env` files MUST point to the same Supabase project (`fyonilpcfaumovermjis`). A mismatch caused the `PGRST205` "table not found in schema cache" error.

---

## How to Run

### Backend
```powershell
cd c:\medimind
uv run uvicorn backend.main:app --reload --port 8000
```

### Frontend
```powershell
cd c:\medimind\frontend
npm run dev
```
Frontend runs at `http://localhost:3000`. 

---

## Known Issues & Gotchas

1. **`passlib` bcrypt bug**: `passlib[bcrypt]` crashes on startup with `ValueError: password cannot be longer than 72 bytes` when using `bcrypt >= 4.x`. Solution: use the raw `bcrypt` library directly (already done in `auth.py`).

2. **Schema cache mismatch**: If you get `PGRST205 Could not find table 'public.custom_users'`, it means the backend `.env` points to a different Supabase project than where the tables were created. Always verify both `.env` files point to project `fyonilpcfaumovermjis`.

3. **uv vs pip**: Always use `uv run` or `uv add` for Python. Never `pip install`.

4. **Vite proxy rewrite**: `/api/*` → strips `/api` → hits FastAPI at port 8000. The `rewrite` rule in `vite.config.js` is essential.

5. **`@ path alias`**: All frontend imports from `@/components/...` resolve to `./src/...`. Configured in both `vite.config.js` and `jsconfig.json`.

6. **RLS disabled**: Row Level Security is intentionally OFF on `custom_users` and `documents`. Security enforcement is in the FastAPI layer.

---

## Styling System

The UI uses a **blue/sky color palette** (changed from the original emerald/teal theme):
- **Primary**: Blue (`hsl(221 83% 53%)`)
- **Accent**: Sky Blue (`hsl(199 89% 48%)`)
- **Background**: Cool off-white
- All colors are CSS variables consumed by shadcn components

Custom utility classes defined in `src/index.css`:
- `.glass`, `.glass-card`, `.glass-subtle` — glassmorphism effects
- `.message-user` — blue gradient bubble for user chat messages
- `.message-ai` — frosted glass bubble for AI chat messages
- `.text-gradient` — blue-to-sky gradient text
- `.hover-lift` — subtle translate-up hover effect
- `.scrollbar-premium` — custom styled scrollbar
- `.glow-primary` / `.glow-primary-strong` — blue glow box shadows
- `.animate-pulse-soft`, `.animate-fade-in`, `.animate-scale-in`, `.animate-slide-up/down` — custom keyframe animations
