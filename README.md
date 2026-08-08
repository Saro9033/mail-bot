# Mail Chatbot

AI-powered Gmail assistant built with Node.js, Express, LangChain, and OpenAI. Chat with your inbox — read, search, send, reply, and manage emails through natural language.

## Tech Stack

- **TypeScript** + **Node.js** + **Express.js**
- **LangChain** (`@langchain/openai`, `@langchain/core`) with OpenAI tool calling
- **Google OAuth 2.0** + **Gmail API** (`googleapis`)
- **MongoDB** for persisting OAuth tokens
- Vanilla HTML/CSS frontend with TypeScript client (`src/client/app.ts`)

## Prerequisites

- Node.js 18+
- MongoDB running locally (default: `mongodb://localhost:27017`)
- Google Cloud project with Gmail API enabled
- OpenAI API key

## Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Enable the **Gmail API**:
   - APIs & Services → Library → search "Gmail API" → Enable.
4. Configure OAuth consent screen:
   - APIs & Services → OAuth consent screen.
   - Choose **External** (or Internal for Workspace).
   - Add scopes:
     - `gmail.readonly`
     - `gmail.send`
     - `gmail.modify`
     - `userinfo.email`
   - Add your email as a test user (while in testing mode).
5. Create OAuth 2.0 credentials:
   - APIs & Services → Credentials → Create Credentials → OAuth client ID.
   - Application type: **Web application**.
   - Authorized redirect URI: `http://localhost:3000/auth/google/callback`
6. Copy the **Client ID** and **Client Secret**.

## OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys).
2. Create a new API key.
3. Copy it for your `.env` file.

## Install & Run

```bash
npm install
```

Copy the environment template and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
OPENAI_API_KEY=sk-...
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
SESSION_SECRET=change-me-to-a-long-random-string
MONGODB_URI=mongodb://localhost:27017/mail-chatbot
```

Start MongoDB locally, then run the dev server:

```bash
npm run dev
```

For production:

```bash
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Click **Sign in with Google** and grant Gmail permissions.
2. Type natural language commands in the chat input.

### Example commands

- "Show my latest email."
- "Show unread emails from today."
- "Summarize the latest five emails."
- "Send an email to John about tomorrow's meeting."
- "Reply to the latest email and confirm attendance."

## Project Structure

```
mail-chatbot/
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── tsconfig.client.json
├── tsup.config.ts
├── src/
│   ├── server.ts              # Express app entry
│   ├── config/
│   │   ├── database.ts        # MongoDB connection
│   │   └── google.ts          # OAuth2 client setup
│   ├── models/
│   │   └── User.ts            # User token storage (MongoDB)
│   ├── routes/
│   │   ├── auth.ts            # Google OAuth routes
│   │   └── chat.ts            # Chat API route
│   ├── services/
│   │   ├── gmail.ts           # Gmail API helpers
│   │   └── agent.ts           # LangChain agent
│   ├── tools/
│   │   └── gmailTools.ts      # LangChain Gmail tools
│   ├── types/
│   │   ├── gmail.ts
│   │   └── session.ts
│   └── client/
│       └── app.ts             # Frontend chat logic (compiled to public/app.js)
└── public/
    ├── index.html             # Chat UI
    ├── styles.css
    └── app.js                 # Compiled frontend bundle
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/google` | Redirect to Google OAuth |
| GET | `/auth/google/callback` | OAuth callback |
| GET | `/auth/status` | `{ authenticated, email }` |
| POST | `/auth/logout` | Destroy session |
| POST | `/api/chat` | `{ message }` → `{ reply }` |

## Security

- Never commit `.env` (included in `.gitignore`).
- `SESSION_SECRET` is required at startup.
- OAuth tokens are stored in MongoDB and never sent to the frontend.
- Chat input is validated (non-empty, max 2000 characters).

## License

ISC
