"""Support Bot Live - Real-time AI voice and vision agent."""

import asyncio
import base64
import json
import logging
from datetime import datetime
import os
import threading
import traceback
from pathlib import Path

import google.auth
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from google import genai
from google.genai import types
from google.oauth2.credentials import Credentials

app = Flask(__name__, static_folder="src", static_url_path="")
CORS(app)
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    ping_timeout=300,
    ping_interval=60,
    max_http_buffer_size=50000000,
    transports=["polling"],
)

DEFAULT_PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT")
DEFAULT_LOCATION_ID = "us-central1"

if not DEFAULT_PROJECT_ID:
    try:
        _, project = google.auth.default()
        if project:
            DEFAULT_PROJECT_ID = project
    except Exception:
        pass

GEMINI_LIVE_MODEL = "gemini-live-2.5-flash-native-audio"
GEMINI_VALIDATE_MODEL = "gemini-2.0-flash"  # Standard model for token validation via generateContent

session_credentials = {}
bridges = {}
live_sessions = {}
starting_sessions = set()
starting_session_sids = {}
session_states = {}
session_resumption_handles = {}  # session_id -> handle string
user_name = "User"
custom_system_instructions = "You are a helpful real-time AI assistant."

# Data directory for session persistence
DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

def save_transcript(session_id, role, text):
    """Append a transcript line to a session's transcript file in the data folder."""
    transcript_file = DATA_DIR / f"transcript_{session_id}.txt"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        with open(transcript_file, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] {role}: {text}\n")
    except Exception as e:
        logging.error(f"[TRANSCRIPT] Failed to save: {e}")

def save_session_handle(session_id, handle):
    """Save a session resumption handle to disk."""
    session_resumption_handles[session_id] = handle
    handle_file = DATA_DIR / f"{session_id}_handle.json"
    try:
        handle_file.write_text(json.dumps({"session_id": session_id, "handle": handle}))
        logging.info(f"[SESSION] Saved resumption handle for {session_id}")
    except Exception as e:
        logging.error(f"[SESSION] Failed to save handle: {e}")

def load_session_handle(session_id):
    """Load a session resumption handle from disk."""
    if session_id in session_resumption_handles:
        return session_resumption_handles[session_id]
    handle_file = DATA_DIR / f"{session_id}_handle.json"
    if handle_file.exists():
        try:
            data = json.loads(handle_file.read_text())
            handle = data.get("handle")
            if handle:
                session_resumption_handles[session_id] = handle
                logging.info(f"[SESSION] Loaded resumption handle for {session_id}")
                return handle
        except Exception as e:
            logging.error(f"[SESSION] Failed to load handle: {e}")
    return None

def clear_session_handle(session_id):
    """Remove a stored session handle."""
    session_resumption_handles.pop(session_id, None)
    handle_file = DATA_DIR / f"{session_id}_handle.json"
    if handle_file.exists():
        try:
            handle_file.unlink()
        except Exception:
            pass

def get_session_state(session_id):
    if session_id not in session_states:
        session_states[session_id] = {"last_seen_frame": None}
    return session_states[session_id]

def get_active_client():
    if "oauth" in session_credentials:
        creds_data = session_credentials["oauth"]
        creds = Credentials(token=creds_data["access_token"])
        return genai.Client(
            vertexai=True,
            project=creds_data["project_id"],
            location=creds_data["location"],
            credentials=creds,
        )
    else:
        try:
            return genai.Client(vertexai=True, project=DEFAULT_PROJECT_ID, location=DEFAULT_LOCATION_ID)
        except Exception as e:
            logging.error(f"Failed to use default credentials: {e}")
            return None

# Load grounding context from context.txt
GROUNDING_CONTEXT = ""
_context_file = Path("context.txt")
if _context_file.exists():
    GROUNDING_CONTEXT = _context_file.read_text().strip()
    logging.info(f"[CONTEXT] Loaded grounding context ({len(GROUNDING_CONTEXT)} chars)")
else:
    logging.warning("[CONTEXT] context.txt not found, no grounding context loaded")

def get_live_system_prompt():
    custom = f"\n{custom_system_instructions}\n" if custom_system_instructions else ""
    name_section = f"\nUser's name: {user_name}\n" if user_name and user_name != "User" else ""
    context_section = f"\n--- GROUNDING CONTEXT ---\n{GROUNDING_CONTEXT}\n--- END CONTEXT ---\n" if GROUNDING_CONTEXT else ""
    return f"""You are a Real-Time AI Voice Agent for Amrita Hospital.

IMPORTANT: You MUST begin every new conversation by saying EXACTLY:
"Namah Shivaya. Welcome to Amrita Hospital. I am your health assistant. How can I help you or your loved ones today?"
Do NOT skip or modify this greeting. Always start with it before anything else.

{custom}{name_section}{context_section}
You support real-time voice interaction and can be interrupted naturally.
If the user uploads an image or shares their camera, use that visual context to help them (e.g., explain what you see, answer questions about it, translate text in images, tutor based on homework shown, etc.).
Keep responses concise, natural, and conversational.
"""

class SessionBridge:
    def __init__(self, loop):
        self.loop = loop
        self.queue = asyncio.Queue(maxsize=100)

    def put_nowait(self, item):
        if not self.loop.is_closed():
            try:
                self.loop.call_soon_threadsafe(self.queue.put_nowait, item)
            except RuntimeError:
                pass
            except asyncio.QueueFull:
                try:
                    self.queue.get_nowait()
                    self.queue.put_nowait(item)
                except Exception:
                    pass



async def run_live_session(session_id, sid):
    if session_id in live_sessions and live_sessions[session_id].get("active"):
        live_sessions[session_id]["sid"] = sid
        socketio.emit("live_session_started", {"status": "reconnected", "user_name": user_name}, room=sid)
        return

    max_reconnects = 5
    reconnect_count = 0

    while reconnect_count < max_reconnects:
        input_queue = asyncio.Queue(maxsize=100)
        loop = asyncio.get_event_loop()
        bridge = SessionBridge(loop)
        bridge.queue = input_queue
        bridges[session_id] = bridge

        try:
            # Check for a stored resumption handle
            stored_handle = load_session_handle(session_id)
            if stored_handle:
                logging.info(f"[SESSION] Using resumption handle for {session_id} (reconnect #{reconnect_count})")
            resumption_config = types.SessionResumptionConfig(
                handle=stored_handle,
                transparent=True,
            )

            config = types.LiveConnectConfig(
                response_modalities=["AUDIO"],
                system_instruction=get_live_system_prompt(),
                media_resolution=types.MediaResolution.MEDIA_RESOLUTION_MEDIUM,
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
                    )
                ),
                realtime_input_config=types.RealtimeInputConfig(
                    automatic_activity_detection=types.AutomaticActivityDetection(
                        disabled=False,
                        start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_LOW,
                        end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_LOW,
                        prefix_padding_ms=20,
                        silence_duration_ms=100,
                    )
                ),
                input_audio_transcription=types.AudioTranscriptionConfig(),
                output_audio_transcription=types.AudioTranscriptionConfig(),
                session_resumption=resumption_config,
            )

            client = get_active_client()
            if client is None:
                current_sid = starting_session_sids.get(session_id, sid)
                socketio.emit("live_session_error", {
                    "error": "Authentication required. Please enter your Project ID and access token.",
                    "code": 401
                }, room=current_sid)
                break

            # Connect directly to the configured model
            logging.info(f"[LIVE] Connecting to model: {GEMINI_LIVE_MODEL}")
            try:
              async with client.aio.live.connect(model=GEMINI_LIVE_MODEL, config=config) as session:
                logging.info(f"[LIVE] ✅ Connected to {GEMINI_LIVE_MODEL}")
                current_sid = starting_session_sids.get(session_id, sid)
                live_sessions[session_id] = {"active": True, "sid": current_sid}
                starting_sessions.discard(session_id)
                starting_session_sids.pop(session_id, None)
                socketio.emit("live_session_started", {"status": "connected", "user_name": user_name}, room=current_sid)

                async def sender_loop():
                    while live_sessions.get(session_id, {}).get("active"):
                        try:
                            item = await asyncio.wait_for(input_queue.get(), timeout=0.5)
                            if item["type"] == "audio":
                                await session.send_realtime_input(audio=item["data"])
                            elif item["type"] == "video":
                                await session.send_realtime_input(video=item["data"])
                            elif item["type"] == "text":
                                await session.send_client_content(
                                    turns=types.Content(role="user", parts=[types.Part(text=item["data"])]),
                                    turn_complete=True,
                                )
                            input_queue.task_done()
                        except asyncio.TimeoutError:
                            continue
                        except Exception as e:
                            logging.error(f"Send error: {e}")

                async def receiver_loop():
                    try:
                        while live_sessions.get(session_id, {}).get("active"):
                            async for response in session.receive():
                                if not live_sessions.get(session_id, {}).get("active"):
                                    return "ended"
                                current_sid = live_sessions[session_id]["sid"]

                                # Handle session resumption updates
                                if hasattr(response, 'session_resumption_update') and response.session_resumption_update:
                                    update = response.session_resumption_update
                                    if update.resumable and update.new_handle:
                                        save_session_handle(session_id, update.new_handle)
                                        logging.info(f"[SESSION] ✅ Resumption handle updated for {session_id}")

                                if response.server_content and response.server_content.model_turn:
                                    for part in response.server_content.model_turn.parts:
                                        if part.text:
                                            logging.info(f"[TRANSCRIPTION] Output: {part.text}")
                                            socketio.emit("text_response", {"text": part.text}, room=current_sid)
                                        if part.inline_data:
                                            logging.info(f"[AUDIO] Sending audio chunk ({len(part.inline_data.data)} bytes)")
                                            audio_b64 = base64.b64encode(part.inline_data.data).decode("utf-8")
                                            socketio.emit("audio_response", {
                                                "audio": audio_b64,
                                                "mime_type": part.inline_data.mime_type,
                                            }, room=current_sid)

                                # Handle input audio transcription (what the user said)
                                if response.server_content and response.server_content.input_transcription:
                                    transcript = response.server_content.input_transcription.text
                                    logging.info(f"[TRANSCRIPTION] Input: {transcript}")
                                    if transcript:
                                        socketio.emit("input_transcription", {"text": transcript}, room=current_sid)
                                        save_transcript(session_id, "User", transcript)

                                # Log the raw server_content keys for debugging
                                if response.server_content:
                                    sc = response.server_content
                                    has_model_turn = sc.model_turn is not None
                                    has_input_transcription = hasattr(sc, 'input_transcription') and sc.input_transcription is not None
                                    has_output_transcription = hasattr(sc, 'output_transcription') and sc.output_transcription is not None
                                    has_turn_complete = sc.turn_complete
                                    if has_model_turn or has_input_transcription or has_output_transcription or has_turn_complete:
                                        logging.info(f"[SERVER_CONTENT] model_turn={has_model_turn}, input_transcription={has_input_transcription}, output_transcription={has_output_transcription}, turn_complete={has_turn_complete}")

                                    # Clear transcript on turn completion so old text disappears
                                    if has_turn_complete:
                                        socketio.emit("clear_transcript", room=current_sid)

                                    # Also check output_transcription if it exists separately
                                    if has_output_transcription:
                                        logging.info(f"[TRANSCRIPTION] Output (via output_transcription): {sc.output_transcription.text}")
                                        if sc.output_transcription.text:
                                            socketio.emit("text_response", {"text": sc.output_transcription.text}, room=current_sid)
                                            save_transcript(session_id, "Assistant", sc.output_transcription.text)
                    except asyncio.CancelledError:
                        return "cancelled"
                    except Exception as e:
                        return "error"
                    return "ended"

                sender_task = asyncio.create_task(sender_loop())
                receiver_task = asyncio.create_task(receiver_loop())
                done, pending = await asyncio.wait([sender_task, receiver_task], return_when=asyncio.FIRST_COMPLETED)
                
                for task in pending:
                    task.cancel()

              session_active = live_sessions.get(session_id, {}).get("active", False)
              if session_active:
                  reconnect_count += 1
                  await asyncio.sleep(1)
                  continue
              else:
                  break
            except Exception as e:
                logging.error(f"[LIVE] ❌ Failed to connect to {GEMINI_LIVE_MODEL}: {type(e).__name__}: {e}")
                current_sid = starting_session_sids.get(session_id, sid)
                socketio.emit("live_session_error", {
                    "error": f"Failed to connect to {GEMINI_LIVE_MODEL}. Check server logs.",
                    "code": 500
                }, room=current_sid)
                break

        except Exception as e:
            logging.error(f"Session error: {e}")
            break

    if session_id in bridges:
        del bridges[session_id]
    has_handle = load_session_handle(session_id) is not None
    if session_id in live_sessions:
        final_sid = live_sessions[session_id]["sid"]
        del live_sessions[session_id]
        socketio.emit("session_ended_reconnect", {
            "session_id": session_id,
            "can_resume": has_handle,
        }, room=final_sid)
    starting_sessions.discard(session_id)


def start_background_loop(session_id, sid):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(run_live_session(session_id, sid))
    finally:
        loop.close()


@socketio.on("connect")
def handle_connect():
    pass

@socketio.on("disconnect")
def handle_disconnect():
    pass

@socketio.on("start_live_session")
def handle_start(data):
    session_id = data.get("session_id", "default")
    sid = request.sid
    if session_id in bridges and session_id in live_sessions:
        live_sessions[session_id]["sid"] = sid
        emit("live_session_started", {"status": "reconnected", "user_name": user_name})
        return
    if session_id in starting_sessions:
        return
    starting_sessions.add(session_id)
    starting_session_sids[session_id] = sid
    t = threading.Thread(target=start_background_loop, args=(session_id, sid), daemon=True)
    t.start()

@socketio.on("stop_live_session")
def handle_stop(data):
    session_id = data.get("session_id")
    if session_id in live_sessions:
        live_sessions[session_id]["active"] = False
        emit("live_session_stopped")

@socketio.on("check_session_status")
def handle_check_session(data):
    session_id = data.get("session_id")
    if session_id in live_sessions:
        return {"active": True}
    return {"active": False}

@socketio.on("send_audio")
def handle_audio(data):
    session_id = data.get("session_id")
    audio = data.get("audio")
    if session_id in bridges and audio:
        try:
            b = base64.b64decode(audio)
            audio_blob = types.Blob(mime_type="audio/pcm;rate=16000", data=b)
            bridges[session_id].put_nowait({"type": "audio", "data": audio_blob})
        except Exception as e:
            logging.error(f"Audio decode/send error: {e}")

@socketio.on("send_camera_frame")
def handle_video(data):
    session_id = data.get("session_id")
    frame = data.get("frame")
    if session_id in bridges and frame:
        try:
            frame_bytes = base64.b64decode(frame)
            video_blob = types.Blob(mime_type="image/jpeg", data=frame_bytes)
            bridges[session_id].put_nowait({"type": "video", "data": video_blob})
        except Exception:
            pass

@socketio.on("send_text_message")
def handle_text(data):
    session_id = data.get("session_id")
    text = data.get("text")
    if session_id in bridges and text:
        bridges[session_id].put_nowait({"type": "text", "data": text})


@app.route("/api/probe-models", methods=["POST"])
def probe_models():
    """Test the configured model with generateContent."""
    client = get_active_client()
    if client is None:
        return jsonify({"error": "Not authenticated. Validate token first."}), 401

    try:
        client.models.generate_content(model=GEMINI_LIVE_MODEL, contents="say hi")
        result = {"model": GEMINI_LIVE_MODEL, "status": "ok", "api": "generateContent"}
        logging.info(f"[PROBE] ✅ {GEMINI_LIVE_MODEL} works with generateContent")
    except Exception as e:
        err_msg = str(e)
        if "not supported" in err_msg.lower():
            result = {"model": GEMINI_LIVE_MODEL, "status": "live_only", "message": "Not supported in generateContent (expected for live-only model)", "api": "generateContent"}
            logging.info(f"[PROBE] ⚡ {GEMINI_LIVE_MODEL} is live-only")
        else:
            result = {"model": GEMINI_LIVE_MODEL, "status": "error", "message": err_msg, "api": "generateContent"}
            logging.warning(f"[PROBE] ❌ {GEMINI_LIVE_MODEL} failed: {err_msg}")

    return jsonify({
        "current_live_model": GEMINI_LIVE_MODEL,
        "result": result,
    })

@app.route("/api/current-model", methods=["GET"])
def current_model():
    return jsonify({"live_model": GEMINI_LIVE_MODEL, "validate_model": GEMINI_VALIDATE_MODEL})

@app.route("/api/validate-token", methods=["POST"])
def validate_token():
    global session_credentials
    data = request.json
    project_id = data.get("projectId")
    location = data.get("location", "us-central1")
    access_token = data.get("accessToken")
    try:
        creds = Credentials(token=access_token)
        test_client = genai.Client(vertexai=True, project=project_id, location=location, credentials=creds)
        test_client.models.generate_content(model=GEMINI_VALIDATE_MODEL, contents="ok")
        session_credentials["oauth"] = {
            "credentials": creds,
            "project_id": project_id,
            "location": location,
            "access_token": access_token,
        }
        return jsonify({"valid": True, "project": project_id})
    except Exception as e:
        return jsonify({"valid": False, "message": str(e)})

@app.route("/api/auth-status", methods=["GET"])
def auth_status():
    if "oauth" in session_credentials:
        return jsonify({"authenticated": True, "project": session_credentials["oauth"]["project_id"]})
    return jsonify({"authenticated": False, "project": DEFAULT_PROJECT_ID, "using": "default"})

@app.route("/api/logout", methods=["POST"])
def logout():
    global session_credentials
    if "oauth" in session_credentials:
        del session_credentials["oauth"]
    return jsonify({"success": True})

@app.route("/api/set-user-name", methods=["POST"])
def set_user_name_route():
    global user_name
    user_name = request.json.get("name", "User")
    return jsonify({"success": True, "name": user_name})

@app.route("/api/get-system-instructions", methods=["GET"])
def get_system_instructions():
    return jsonify({"instructions": custom_system_instructions})

@app.route("/api/set-system-instructions", methods=["POST"])
def set_system_instructions():
    global custom_system_instructions
    custom_system_instructions = request.json.get("instructions", "").strip()
    return jsonify({"success": True, "instructions": custom_system_instructions})

@app.route("/api/list-files", methods=["GET"])
def api_list_files():
    return jsonify({"files": []})

@app.route("/api/clear-session-handle", methods=["POST"])
def api_clear_session_handle():
    data = request.json
    session_id = data.get("session_id")
    if session_id:
        clear_session_handle(session_id)
        logging.info(f"[SESSION] Cleared handle for {session_id} (new session requested)")
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "No session_id provided"})

@app.route("/")
def serve_home():
    return send_from_directory(".", "index.html")

@app.route("/home")
def serve_home_preview():
    return send_from_directory(".", "home.html")

@app.route("/src/<path:filename>")
def serve_src_files(filename):
    return send_from_directory("src", filename)

@app.route("/style.css")
def serve_style(): 
    if Path("style.css").exists():
        return send_from_directory(".", "style.css")
    return "", 200

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=8080, debug=False)