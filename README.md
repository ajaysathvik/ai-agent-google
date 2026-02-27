# Live Cultural Context Agent

**Live Cultural Context Agent** is a real-time, bidirectional voice and vision agent designed to act as a knowledgeable cultural guide. Users can point their camera at any landmark, monument, or point of interest, and the agent will automatically recognize it and provide cultural and historical context, engaging in natural conversational interactions.

---

## Spin-up Instructions

### Prerequisites
- Python 3.10+
- Google Cloud project with Vertex AI API enabled

### Setup
1. Clone the repository and navigate to the agent directory:
```bash
git clone <your-repo-url>
cd agent
```

2. Create and activate a virtual environment:
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

5. Open `http://localhost:8080` in your web browser.

### Authentication
1. **Enter your Project ID** on the login page.
2. **Click "Open Cloud Shell"** — this opens Google Cloud Shell in a new tab.
3. **Run the command** in Cloud Shell:
   ```bash
   gcloud auth print-access-token
   ```
4. **Copy the token** and paste it into the "Paste Token" field.
5. **Click "Validate & Connect"** to authenticate.

*(Note: Access tokens expire after ~1 hour. Generate a new token if your session expires.)*

---

# Text Description: Live Cultural Context Agent

## Summary of Features and Functionality
The **Live Cultural Context Agent** is a real-time, bidirectional voice and vision agent designed to act as a knowledgeable cultural guide. Users can point their camera at any landmark, monument, or point of interest, and the agent will:
- **Identify Landmarks in Real-Time:** Automatically recognize and provide cultural/historical context about the visual input.
- **Engage in Natural Voice Conversations:** Talk naturally with the user, handle interruptions gracefully, and answer follow-up questions about the recognized scenes.
- **Provide Visual Guidance:** Proactively point out architectural details, inscriptions, and hidden features that the user might otherwise miss.
- **Perform Multilingual Translations:** Translate local inscriptions and signs, explaining them in context.
- **Support Multi-Modal Inputs:** Beyond voice and camera streams, the agent supports screen sharing (for discussing maps or articles) and text-based input.

## Technologies and Data Sources Used
- **Core AI Model:** `gemini-live-2.5-flash-native-audio` (Gemini Live API) for low-latency native audio and multimodal processing.
- **SDK:** Google GenAI SDK (`google-genai`) to interface with the Vertex AI endpoints.
- **Cloud Infrastructure:** Google Cloud Vertex AI (Model Hosting) and Google Cloud Run (Application Deployment via Docker).
- **Backend Framework:** Python, Flask, and Flask-SocketIO for handling HTTP requests and polling connections. 
- **Frontend Stack:** HTML, CSS, JavaScript, with the Web Audio API for recording/playing PCM audio, and Socket.IO for client-server bidirectional streaming.
- **Authentication:** Google OAuth2 for securely generating and validating access tokens.

## Findings and Learnings from the Project
- **Native Audio Empowers Natural Interaction:** Utilizing the `gemini-live-2.5-flash-native-audio` model generated incredibly natural-sounding voice responses with minimal latency, which is essential to make a digital walking-tour feel real and seamless.
- **Visual Grounding is Highly Effective:** Passing camera frames as JPEG blobs continuously alongside the audio stream allows the model to immediately anchor conversations to the user's surroundings. It accurately recognizes architectural styles and can seamlessly blend visual context with historical narratives.
- **Native Interruption Handling:** The Live API inherently manages user interruptions, eliminating the need for complex custom logic to handle turn-aking. When the user starts speaking, the agent stops, matching human conversational dynamics.
- **Audio Streaming Complexity:** Sending raw PCM audio (16kHz int16) from the browser and receiving PCM (24kHz) via base64 encoded strings over Socket.IO proved to be a robust bidirectional architecture, simplifying integration across the Flask-SocketIO thread boundaries.
- **The Power of System Prompting:** Crafting a highly contextual system prompt fundamentally transformed the application from a standard assistant into a passionate cultural guide, significantly improving user immersion by adopting a storytelling tone.

## Developer
- [GDG Profile](https://gdg.community.dev/u/mmtmdc/)
