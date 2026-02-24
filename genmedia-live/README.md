# GenMedia Live — Real-Time AI Voice Agent

**A real-time voice and vision agent powered by the Gemini Live API.**

GenMedia Live is a Live Agent that users can talk to naturally, with support for interruptions, camera/screen vision, and text input. Built on the Gemini Live API (`gemini-live-2.5-flash-native-audio`) and hosted on Google Cloud, it enables real-time multimodal interaction — from acting as a real-time translator, to a vision-enabled tutor that "sees" your homework, to a customer support agent.

---

## Features

- **Real-Time Voice Chat**: Natural, low-latency voice conversations via the Gemini Live API. Handles user interruptions gracefully — the model stops speaking when you start talking.
- **Vision (Camera)**: Share your camera so the AI can see your environment in real-time — show a menu, a street sign, homework, or a product for context-aware conversation.
- **Screen Share**: Share your screen for the AI to reference during conversation.
- **Text Input**: Type messages as an alternative to voice.
- **Customizable System Instructions**: Tailor the agent's persona and behavior for any use case (tutor, translator, support agent, etc.).
- **Voice Selection**: Choose from multiple AI voice options (Aoede, Breeze, Juniper, etc.).
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
cd genmedia-live
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
docker build -t genmedia-live .

# Run locally
docker run -p 8080:8080 genmedia-live

# Deploy to Cloud Run
gcloud run deploy genmedia-live \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

---

## Findings & Learnings

- **Native Audio model**: The `gemini-live-2.5-flash-native-audio` model provides natural-sounding voice with very low latency, making conversations feel fluid and real.
- **Interruption handling**: The Live API handles user interruptions natively — no explicit logic needed. The model stops speaking when the user starts talking, which is critical for a natural conversational feel.
- **PCM audio streaming**: Sending raw PCM (16kHz int16) and receiving PCM (24kHz) via base64 over Socket.IO works reliably. The Web Audio API `ScriptProcessorNode` is simple for mic capture.
- **Visual grounding**: Sending camera frames as JPEG blobs enriches conversation significantly — the model can discuss what it sees in real-time, enabling use cases like tutoring with homework or translating signs.
- **Session management**: The Live API sessions have time limits, requiring reconnection logic. The `SessionBridge` pattern with asyncio queues handles the thread boundary between Flask-SocketIO and async Gemini sessions cleanly.
- **Polling transport**: Using Socket.IO with `polling` (not WebSocket) avoids issues with proxies and Cloud Run's request model.

---

## License

Licensed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0).
