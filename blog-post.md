# 🌍 Building the Live Cultural Context Agent 🗿

*Because sometimes, a building is just a building... until an AI tells you someone famous tripped on its stairs.* 🤪

Have you ever walked past an incredible monument and thought, *"Wow, I wonder what that is? I should Google it..."* only to immediately get distracted by a pigeon? 🐦 Yeah, same. 

That’s why I built the **Live Cultural Context Agent**! It’s a real-time, bidirectional voice and vision agent designed to act as your knowledgeable—and very talkative—cultural guide. You just point your camera at a landmark, and it tells you everything you need to know. No typing, no scrolling, and literally zero risk of walking into a lamppost while staring at your phone. 🚶‍♂️💥

Here’s a quick rundown of what this little digital tour guide can do:
- 🏛️ **Real-Time Landmark ID:** It automatically recognizes what you're looking at. *(No more pretending you know the difference between Doric and Corinthian columns! 🤫)*
- 🗣️ **Natural Voice Conversations:** Talk to it like a real person! It handles interruptions gracefully. *(Finally, an AI that lets me finish a sentence without talking over me! 😅)*
- 🖼️ **Visual Guidance:** It proactively points out sneaky architectural details you definitely would have missed.
- 🔤 **Multilingual Translations:** Translates signs and inscriptions in context.
- 📱 **Multi-Modal:** Supports screen sharing and text input too, in case you don't feel like talking out loud on a crowded bus. 🚌

---

## 🛠️ The Tech Stack (What Makes It Tick)
We’re pulling out the big guns for this one. Here's what's running under the hood:
- **Core AI Model:** 🧠 `gemini-live-2.5-flash-native-audio` (Gemini Live API). This handles low-latency native audio and multimodal processing. 
- **SDK:** 🛠️ Google GenAI SDK (`google-genai`).
- **Cloud Infrastructure:** ☁️ Google Cloud Vertex AI and Google Cloud Run via Docker. *(Because we love containerizing our problems! 🐳)*
- **Frontend / Backend:** 🐍 Python, Flask, Flask-SocketIO, and the Web Audio API for managing PCM audio streaming over Socket.IO. *(Debugging this bidirectional audio stream was definitely a character-building exercise... 🥲)*

---

## 🚀 How to Spin It Up Yourself!

Want to try it out? Let's get this party started! 🎉 Here is the step-by-step configuration to get the agent running locally.

### 📋 Prerequisites
You're going to need Python 3.10+ 🐍 and a Google Cloud project with the Vertex AI API enabled ☁️. 

### 🏗️ Step-by-Step Setup

**1. Clone the repository:** *(Standard procedure, folks!)*
```bash
git clone <your-repo-url>
cd agent
```

**2. Create a virtual environment:** *(Safety first! Always use protection... for your dependencies.)*
```bash
python -m venv .venv
source .venv/bin/activate  # Or whatever magic spell Windows uses
```

**3. Install dependencies:** *(Grabbing the digital building blocks 🧱)*
```bash
pip install -r requirements.txt
```

**4. Spin it up:** *(Moment of truth... 🤞)*
```bash
python app.py
```

**5. Say Hello:** Open `http://localhost:8080` in your web browser. 🌐

### 🔐 The Secret Handshake (Authentication)
We need to make sure the app has the right permissions to talk to Google Cloud. 

1. **Enter your Project ID** on the login page.
2. **Click "Open Cloud Shell"** — this spawns Google Cloud Shell in a new tab. 🐚
3. **Run the magic spell:**
   ```bash
   gcloud auth print-access-token
   ```
4. **Copy the token** that pops out and paste it into the "Paste Token" field in our app.
5. **Click "Validate & Connect"** to authenticate. 🤝

*(⚡ **Pro-Tip**: Access tokens expire after about an hour. Time flies when you're having fun! If your session dies suddenly, just grab a new token and you'll be back in business. ⏰)*

---

### 💡 What I Learned
- **Native Audio is Wild:** Using `gemini-live-2.5-flash-native-audio` blew my mind. It sounds incredibly natural and the latency is so low it feels conversational. *(Almost too real... it even judged my taste in souvenirs 🛍️).*
- **Visual Grounding works like magic:** Streaming camera frames as JPEG blobs continuously alongside the audio allows the model to instantly anchor conversations to the real world. 
- **System Prompting is everything:** A highly contextual system prompt drastically changed this from a generic "AI Assistant" into an overly enthusiastic, passionate cultural guide. 🎭

Give it a spin, point your camera at something cool, and let me know what you think! 

🔗 **Say hi on my [GDG Profile](https://gdg.community.dev/u/mmtmdc/)! I promise I don't bite. 🧛‍♀️**
