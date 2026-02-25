# Live Cultural Context Agent — Point, See, Discover

**A real-time voice and vision agent that brings landmarks to life through conversation.**

Live Cultural Context Agent lets you point your camera at any landmark, monument, or point of interest and have a natural voice conversation about it. Powered by the Gemini Live API (`gemini-live-2.5-flash-native-audio`) and hosted on Google Cloud, it acts as a passionate cultural guide who can see what you see — identifying landmarks in real-time, sharing rich historical narratives, and answering your questions naturally.

---

## Features

- **Real-Time Landmark Recognition**: Point your camera at any landmark and the AI identifies it instantly, providing cultural and historical context without being asked.
- **Natural Voice Conversations**: Talk naturally about what you're seeing — ask follow-up questions, request deeper history, or explore cultural connections. The AI handles interruptions gracefully.
- **Visual Exploration Guidance**: The agent proactively points out architectural details, inscriptions, and hidden features you might otherwise miss.
- **Cultural Storytelling**: Go beyond Wikipedia facts — hear the stories behind the stones, the people who built them, and why they matter today.
- **Multilingual Awareness**: Inscriptions and signs in other languages are translated and explained in context.
- **Screen Share**: Share your screen to discuss photos, maps, or articles about places you're planning to visit.
- **Text Input**: Type messages as an alternative to voice.
- **Customizable Persona**: Tailor the agent's focus — art history, architecture, local cuisine, or general cultural exploration.
- **Session Management**: Automatic reconnection and persistent session handling.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (Client)                   │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌──────────┐  │
│  │ Web Audio│  │  Camera  │  │ Screen │  │   Text   │  │
│  │  (mic)   │  │  Stream  │  │ Share  │  │  Input   │  │
│  └────┬─────┘  └────┬─────┘  └───┬────┘  └────┬─────┘  │
│       └──────────────┴───────────┴─────────────┘        │
│                         │                               │
│                   Socket.IO (polling)                    │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Flask + Flask-SocketIO (Python)             │
│                                                         │
│  • Audio: base64 PCM 16kHz → Gemini realtime_input      │
│  • Video: JPEG frames → Gemini realtime_input           │
│  • Text:  client_content → Gemini                       │
│  • Auth:  OAuth token validation via Vertex AI           │
│                                                         │
│              Google GenAI SDK (async)                    │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                Google Cloud (Vertex AI)                  │
│                                                         │
│         gemini-live-2.5-flash-native-audio              │
│         (Live API - bidirectional streaming)             │
│                                                         │
│   Audio response → base64 PCM 24kHz → Browser playback  │
└─────────────────────────────────────────────────────────┘
```

---

## Technologies Used

| Layer       | Technology                                             |
| ----------- | ------------------------------------------------------ |
| Model       | `gemini-live-2.5-flash-native-audio` (Gemini Live API) |
| Backend     | Python, Flask, Flask-SocketIO                          |
| AI SDK      | Google GenAI SDK (`google-genai`)                      |
| Cloud       | Google Cloud Vertex AI                                 |
| Frontend    | HTML, CSS, JavaScript, Web Audio API, Socket.IO        |
| Auth        | Google OAuth2 access tokens                            |
| Deployment  | Docker, Google Cloud Run                               |

---

## Prerequisites

- Python 3.10+
- Google Cloud project with Vertex AI API enabled

## Setup

1. Clone the repository:
```bash
git clone <your-repo-url>
cd agent
```

2. Create and activate virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the application:
```bash
python app.py
```

5. Open http://localhost:8080 in your browser.

## Authentication

1. **Enter your Project ID** on the login page
2. **Click "Open Cloud Shell"** — opens Google Cloud Shell in a new tab
3. **Run the command** in Cloud Shell:
   ```bash
   gcloud auth print-access-token
   ```
4. **Copy the token** and paste it in the "Paste Token" field
5. **Click "Validate & Connect"**

> **Note**: Access tokens expire after ~1 hour. Generate a new token if your session expires.

---

## Deployment (Google Cloud Run)

### Using Docker

```bash
# Build
docker build -t cultural-context-agent .

# Run locally
docker run -p 8080:8080 cultural-context-agent

# Deploy to Cloud Run
gcloud run deploy cultural-context-agent \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

---

## Findings & Learnings

- **Native Audio model**: The `gemini-live-2.5-flash-native-audio` model provides natural-sounding voice with very low latency, making conversations feel fluid and real — essential for a walking-tour experience.
- **Visual grounding for landmarks**: Sending camera frames as JPEG blobs enables the model to identify and discuss landmarks in real-time. The model recognizes architectural styles, inscriptions, and cultural artifacts with impressive accuracy.
- **Interruption handling**: The Live API handles user interruptions natively — no explicit logic needed. The model stops speaking when the user starts talking, which is critical for a natural conversational guide experience.
- **PCM audio streaming**: Sending raw PCM (16kHz int16) and receiving PCM (24kHz) via base64 over Socket.IO works reliably. The Web Audio API `ScriptProcessorNode` is simple for mic capture.
- **Session management**: The Live API sessions have time limits, requiring reconnection logic. The `SessionBridge` pattern with asyncio queues handles the thread boundary between Flask-SocketIO and async Gemini sessions cleanly.
- **Contextual depth via system prompt**: A well-crafted system prompt transforms the model from a generic assistant into a passionate cultural guide. Including instructions for proactive identification, storytelling tone, and cultural sensitivity significantly improves the user experience.
- **Polling transport**: Using Socket.IO with `polling` (not WebSocket) avoids issues with proxies and Cloud Run's request model.

---

## License

Licensed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0).
