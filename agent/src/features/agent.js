/*
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { showToast } from '../ui.js';

let socket = null;
let audioContext = null;
let audioWorklet = null;
let mediaStream = null;
let sessionId = localStorage.getItem('support_bot_session_id') || `session-${Date.now()}`;
localStorage.setItem('support_bot_session_id', sessionId);

let isRecording = false;
let isConnected = false;
let isConnecting = false;
let sessionStartPending = false;

let audioQueue = [];
let isPlayingAudio = false;
let playbackAudioContext = null;
let currentAudioSource = null;

let cameraStream = null;
let screenStream = null;
let cameraInterval = null;
let screenInterval = null;
let lastCameraFrame = null;
let isProcessingFrame = false;

let conversationHistory = [];
let lastGeneratedImage = null;
let lastGeneratedVideo = null;
let currentUserName = "User";
let uploadedImages = [];

let messagesContainer, userInput, sendButton, voiceButton, cameraButton;
let screenShareButton, cameraVideo, cameraContainer, userNameInput;
let setNameButton, currentUserNameDisplay, clearAllButton, uploadButton;

function clearSessionState() {
    conversationHistory = [];
    lastCameraFrame = null;
    uploadedImages = [];
}



export async function getGenMediaContent() {
    try {
        const response = await fetch('/src/features/templates/Support Bot Live.html');
        if (!response.ok) throw new Error(`Failed to load template: ${response.status}`);
        return await response.text();
    } catch (error) {
        console.error('Template load error:', error);
        return '<div class="text-red-500 p-4">Failed to load chat interface. Please refresh.</div>';
    }
}

export function initGenMediaChat() {
    clearSessionState();

    setTimeout(() => {
        messagesContainer = document.getElementById('messages-container');
        userInput = document.getElementById('user-input');
        sendButton = document.getElementById('send-button');
        voiceButton = document.getElementById('voice-button');
        uploadButton = document.getElementById('upload-button');
        cameraButton = document.getElementById('camera-button');
        screenShareButton = document.getElementById('screen-share-button');
        cameraVideo = document.getElementById('camera-video');
        cameraContainer = document.getElementById('camera-container');
        userNameInput = document.getElementById('user-name-input');
        setNameButton = document.getElementById('set-name-btn');
        currentUserNameDisplay = document.getElementById('current-user-name');
        clearAllButton = document.getElementById('clear-all-button');

        if (!messagesContainer || !userInput || !sendButton) {
            console.error('Required UI elements not found');
            return;
        }

        initSocket();
        loadCurrentUserName();

        sendButton.addEventListener('click', sendMessage);
        userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
        voiceButton.addEventListener('click', toggleVoice);
        uploadButton.addEventListener('click', () => document.getElementById('image-upload-input').click());
        document.getElementById('image-upload-input').addEventListener('change', handleImageUpload);
        document.getElementById('remove-upload-btn')?.addEventListener('click', removeUploadedImage);
        cameraButton.addEventListener('click', toggleCamera);
        screenShareButton.addEventListener('click', toggleScreenShare);
        setNameButton.addEventListener('click', setUserName);
        userNameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') setUserName(); });
        clearAllButton.addEventListener('click', clearAllData);

        document.addEventListener('click', () => {
            if (playbackAudioContext?.state === 'suspended') {
                playbackAudioContext.resume();
            }
        }, { once: true });

        const imageModal = document.createElement('div');
        imageModal.className = 'image-modal';
        imageModal.innerHTML = '<img src="" alt="Full size">';
        document.body.appendChild(imageModal);
        imageModal.addEventListener('click', () => { imageModal.style.display = 'none'; });

        window.enlargeImage = (src) => {
            const modal = document.querySelector('.image-modal');
            if (modal) {
                modal.querySelector('img').src = src;
                modal.style.display = 'block';
            }
        };
    }, 100);
}

async function loadCurrentUserName() {
    try {
        const response = await fetch('/api/get-user-name');
        const data = await response.json();
        if (data.name && currentUserNameDisplay) {
            currentUserNameDisplay.textContent = data.name;
            currentUserName = data.name;
        }
    } catch (error) {
        console.error('Load user name error:', error);
    }
}

async function setUserName() {
    const name = userNameInput.value.trim();
    if (!name) {
        showToast('Please enter a name', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/set-user-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        const data = await response.json();
        if (data.success && currentUserNameDisplay) {
            currentUserNameDisplay.textContent = data.name;
            currentUserName = data.name;
            showToast(`Hi ${data.name}!`, 'success');
            userNameInput.value = '';
        }
    } catch (error) {
        console.error('Set name error:', error);
        showToast('Failed to set name', 'error');
    }
}

async function handleImageUpload(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    if (uploadedImages.length + files.length > 14) {
        showToast(`Max 14 images. You have ${uploadedImages.length}.`, 'warning');
        return;
    }

    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            showToast('Please select only image files', 'error');
            return;
        }
    }

    const newImages = [];
    for (const file of files) {
        const reader = new FileReader();
        await new Promise((resolve) => {
            reader.onload = (e) => {
                newImages.push(e.target.result);
                resolve();
            };
            reader.readAsDataURL(file);
        });
    }

    uploadedImages.push(...newImages);
    updateUploadPreview();
    showToast(`${uploadedImages.length} image(s) ready`, 'success');
}

function updateUploadPreview() {
    const previewContainer = document.getElementById('upload-preview-container');
    const previewGrid = document.getElementById('upload-preview-grid');
    const uploadCount = document.getElementById('upload-count');

    if (!uploadedImages.length) {
        previewContainer.style.display = 'none';
        return;
    }

    uploadCount.textContent = uploadedImages.length;
    previewGrid.innerHTML = '';

    uploadedImages.forEach((img, index) => {
        const div = document.createElement('div');
        div.className = 'relative group';
        div.innerHTML = `
            <img src="${img}" alt="Upload ${index + 1}" class="w-full h-24 object-cover rounded border-2 border-gray-300 dark:border-gray-600" />
            <button onclick="window.removeUploadedImageAt(${index})" class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs font-bold opacity-0 group-hover:opacity-100">×</button>
        `;
        previewGrid.appendChild(div);
    });

    previewContainer.style.display = 'block';
}

window.clearAllUploadedImages = () => {
    uploadedImages = [];
    updateUploadPreview();
    document.getElementById('image-upload-input').value = '';
    showToast('All images cleared', 'info');
};

window.removeUploadedImageAt = (index) => {
    uploadedImages.splice(index, 1);
    updateUploadPreview();
    document.getElementById('image-upload-input').value = '';
};

function removeUploadedImage() {
    uploadedImages = [];
    updateUploadPreview();
    document.getElementById('image-upload-input').value = '';
    showToast('Images removed', 'info');
}

async function clearAllData() {
    if (!confirm('Clear all content and reset session?')) return;

    try {
        showSpinner('Clearing...');

        if (isConnected) {
            socket.emit('stop_live_session', { session_id: sessionId });
            isConnected = false;
        }

        await fetch('/api/clear-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });

        conversationHistory = [];
        lastCameraFrame = null;
        uploadedImages = [];
        removeUploadedImage();

        localStorage.removeItem('support_bot_session_id');
        sessionId = `session-${Date.now()}`;
        localStorage.setItem('support_bot_session_id', sessionId);

        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="text-center text-gray-500 dark:text-gray-400 py-8">
                    <p class="text-lg mb-2">All cleared, ${currentUserName}!</p>
                    <p class="text-sm italic">Start fresh - talk or type to begin</p>
                </div>
            `;
        }

        if (isRecording) stopVoice();
        if (cameraStream) stopCamera();
        if (screenStream) stopScreenShare();

        updateConnectionStatus('Ready', 'success');
        showToast('All cleared!', 'success');
    } catch (error) {
        console.error('Clear error:', error);
        showToast('Failed to clear data', 'error');
    }
}

function updateConnectionStatus(status, type) {
    const statusEl = document.getElementById('connection-status');
    if (!statusEl) return;

    const dotClass = type === 'success' ? 'status-ready' :
                     type === 'active' ? 'status-active' :
                     type === 'warning' ? 'status-connecting' : 'status-error';

    statusEl.innerHTML = `<span class="status-dot ${dotClass}"></span><span>${status}</span>`;
}

function initSocket() {
    if (socket?.connected) return;
    if (socket) socket.close();

    socket = io({
        transports: ['polling'],
        upgrade: false,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 3000,
        reconnectionAttempts: Infinity,
        timeout: 60000
    });

    socket.on('connect', () => {
        updateConnectionStatus('Ready', 'success');
        socket.emit('check_session_status', { session_id: sessionId }, (response) => {
            if (response?.active) {
                isConnected = true;
                updateConnectionStatus('Live', 'active');
            }
        });
    });

    socket.on('disconnect', (reason) => {
        if (reason === 'io server disconnect' || reason === 'io client disconnect') {
            updateConnectionStatus('Disconnected', 'error');
            isConnected = false;
        }
        isConnecting = false;
        sessionStartPending = false;
    });

    socket.on('live_session_started', (data) => {
        isConnected = true;
        isConnecting = false;
        sessionStartPending = false;
        updateConnectionStatus('Live', 'active');
        if (data.user_name) currentUserName = data.user_name;
        clearTranscript();
    });

    socket.on('live_session_ended', () => {
        isConnected = false;
        updateConnectionStatus('Disconnected', 'inactive');
        uploadedImages = [];
        updateUploadPreview();
    });

    socket.on('reconnect', () => {
        updateConnectionStatus('Ready', 'success');
        socket.emit('check_session_status', { session_id: sessionId }, (response) => {
            if (response?.active) {
                isConnected = true;
                updateConnectionStatus('Live', 'active');
            }
        });
    });

    socket.on('audio_response', playAudioResponse);

    socket.on('text_response', (data) => {
        if (data.text) appendTranscript(data.text);
    });

    socket.on('input_transcription', (data) => {
        // Input transcription received but not displayed
    });

    socket.on('clear_transcript', () => {
        clearTranscript();
    });


    socket.on('session_ended_reconnect', () => {
        isConnected = false;
        if (cameraStream || screenStream || isRecording) {
            if (!isConnecting) {
                isConnecting = true;
                updateConnectionStatus('Reconnecting...', 'warning');
                setTimeout(() => {
                    requestSessionStart();
                    isConnecting = false;
                }, 500);
            }
        } else {
            updateConnectionStatus('Ready', 'success');
        }
    });

    socket.on('live_session_error', (data) => {
        showToast('Session error: ' + data.error, 'error');
        isConnecting = false;
        sessionStartPending = false;
    });
}

async function waitForConnection(timeout = 15000) {
    return new Promise((resolve) => {
        if (isConnected) {
            resolve(true);
            return;
        }
        const startTime = Date.now();
        const checkConnection = setInterval(() => {
            if (isConnected) {
                clearInterval(checkConnection);
                resolve(true);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkConnection);
                resolve(false);
            }
        }, 100);
    });
}

function requestSessionStart() {
    if (sessionStartPending) return false;
    sessionStartPending = true;
    socket.emit('start_live_session', { session_id: sessionId });
    return true;
}

async function sendMessage() {
    if (!userInput) return;
    const message = userInput.value.trim();
    if (!message) return;

    if (isConnecting) {
        showToast('Please wait, connecting...', 'warning');
        return;
    }

    addMessage('user', message);
    userInput.value = '';
    conversationHistory.push({ role: 'user', content: message });

    if (!isConnected && !isConnecting) {
        isConnecting = true;
        updateConnectionStatus('Connecting...', 'warning');
        requestSessionStart();

        const connected = await waitForConnection(30000);
        isConnecting = false;

        if (!connected) {
            sessionStartPending = false;
            showToast('Connection timeout. Please try again.', 'error');
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (isConnected) {
        if (uploadedImages.length > 0) {
            socket.emit('send_message_with_images', {
                session_id: sessionId,
                text: message,
                images: uploadedImages
            });
        } else {
            socket.emit('send_text_message', { session_id: sessionId, text: message });
        }
    } else {
        showToast('Not connected. Please try again.', 'error');
    }
}

async function toggleVoice() {
    if (!isRecording) await startVoice();
    else stopVoice();
}

async function startVoice() {
    try {
        if (isConnecting) return;

        if (!playbackAudioContext) {
            playbackAudioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            if (playbackAudioContext.state === 'suspended') await playbackAudioContext.resume();
        }

        if (!isConnected && !isConnecting) {
            isConnecting = true;
            updateConnectionStatus('Connecting...', 'warning');
            requestSessionStart();

            const connected = await waitForConnection(30000);

            if (!connected) {
                isConnecting = false;
                sessionStartPending = false;
                showToast('Connection timeout. Please try again.', 'error');
                return;
            }
            isConnecting = false;
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (uploadedImages.length > 0 && isConnected && socket?.connected) {
            socket.emit('send_message_with_images', {
                session_id: sessionId,
                text: 'I have uploaded an image. Please look at it.',
                images: uploadedImages
            });
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const source = audioContext.createMediaStreamSource(mediaStream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);

        let audioBuffer = [];
        let lastSendTime = Date.now();
        const SEND_INTERVAL_MS = 500;

        processor.onaudioprocess = (e) => {
            if (!isRecording || !isConnected) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const int16Array = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            audioBuffer.push(...int16Array);

            const now = Date.now();
            if (now - lastSendTime >= SEND_INTERVAL_MS && audioBuffer.length > 0) {
                // Convert accumulated samples to Int16Array, then base64-encode
                const samples = new Int16Array(audioBuffer);
                const bytes = new Uint8Array(samples.buffer);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const base64Audio = btoa(binary);
                socket.emit('send_audio', { session_id: sessionId, audio: base64Audio });
                audioBuffer = [];
                lastSendTime = now;
            }
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
        audioWorklet = processor;

        isRecording = true;
        voiceButton.classList.add('active');
        voiceButton.querySelector('span').textContent = 'Stop';
        showToast(`Listening, ${currentUserName}!`, 'success');
    } catch (error) {
        console.error('Voice error:', error);
        showToast('Failed to start voice', 'error');
        isConnecting = false;
    }
}

function stopVoice() {
    if (audioWorklet) { audioWorklet.disconnect(); audioWorklet = null; }
    if (audioContext) { audioContext.close(); audioContext = null; }
    if (mediaStream) { mediaStream.getTracks().forEach(track => track.stop()); mediaStream = null; }

    isRecording = false;
    voiceButton.classList.remove('active');
    voiceButton.querySelector('span').textContent = 'Voice';

    updateConnectionStatus(isConnected ? 'Session Active' : 'Ready', isConnected ? 'active' : 'success');
    showToast('Mic off', 'info');
}

async function toggleCamera() {
    if (!cameraStream) await startCamera();
    else stopCamera();
}

async function startCamera() {
    try {
        if (!isConnected && !isConnecting) {
            isConnecting = true;
            updateConnectionStatus('Connecting...', 'warning');
            requestSessionStart();
            await waitForConnection(30000);
            isConnecting = false;
        }

        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { width: 768, height: 768 } });
        cameraVideo.srcObject = cameraStream;
        cameraContainer.style.display = 'block';
        cameraButton.classList.add('active');
        cameraInterval = setInterval(sendCameraFrame, 2000);
        showToast('Camera on', 'success');
    } catch (error) {
        console.error('Camera error:', error);
        showToast('Camera failed', 'error');
    }
}

function stopCamera() {
    if (cameraInterval) { clearInterval(cameraInterval); cameraInterval = null; }
    if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; }
    cameraVideo.srcObject = null;
    cameraContainer.style.display = 'none';
    cameraButton.classList.remove('active');
    showToast('Camera off', 'info');
}

function sendCameraFrame() {
    if (!cameraVideo || !cameraStream || !isConnected || isProcessingFrame) return;
    isProcessingFrame = true;

    const canvas = document.createElement('canvas');
    canvas.width = 768; canvas.height = 768;
    const ctx = canvas.getContext('2d');
    const ar = cameraVideo.videoWidth / cameraVideo.videoHeight;
    let dw = 768, dh = 768, ox = 0, oy = 0;
    if (ar > 1) { dh = 768/ar; oy = (768-dh)/2; } else { dw = 768*ar; ox = (768-dw)/2; }
    ctx.drawImage(cameraVideo, ox, oy, dw, dh);

    canvas.toBlob((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            lastCameraFrame = `data:image/jpeg;base64,${base64}`;
            socket.emit('send_camera_frame', { session_id: sessionId, frame: base64 });
            setTimeout(() => { isProcessingFrame = false; }, 50);
        };
        reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.6);
}

async function toggleScreenShare() {
    if (!screenStream) await startScreenShare();
    else stopScreenShare();
}

async function startScreenShare() {
    try {
        if (!isConnected && !isConnecting) {
            isConnecting = true;
            updateConnectionStatus('Connecting...', 'warning');
            requestSessionStart();
            await waitForConnection(30000);
            isConnecting = false;
        }

        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { width: 768, height: 768 } });
        const screenVideo = document.createElement('video');
        screenVideo.srcObject = screenStream;
        screenVideo.autoplay = true;
        screenVideo.style.display = 'none';
        document.body.appendChild(screenVideo);
        screenShareButton.classList.add('active');
        screenInterval = setInterval(() => sendScreenFrame(screenVideo), 2000);
        screenStream.getVideoTracks()[0].addEventListener('ended', stopScreenShare);
        showToast('Screen sharing', 'success');
    } catch (error) {
        console.error('Screen error:', error);
        showToast('Screen share failed', 'error');
    }
}

function stopScreenShare() {
    if (screenInterval) { clearInterval(screenInterval); screenInterval = null; }
    if (screenStream) { screenStream.getTracks().forEach(track => track.stop()); screenStream = null; }
    screenShareButton.classList.remove('active');
    showToast('Screen sharing stopped', 'info');
}

function sendScreenFrame(screenVideo) {
    if (!screenVideo || !screenStream || !isConnected || isProcessingFrame) return;
    isProcessingFrame = true;

    const canvas = document.createElement('canvas');
    canvas.width = 768; canvas.height = 768;
    const ctx = canvas.getContext('2d');
    const ar = screenVideo.videoWidth / screenVideo.videoHeight;
    let dw = 768, dh = 768, ox = 0, oy = 0;
    if (ar > 1) { dh = 768/ar; oy = (768-dh)/2; } else { dw = 768*ar; ox = (768-dw)/2; }
    ctx.drawImage(screenVideo, ox, oy, dw, dh);

    canvas.toBlob((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            lastCameraFrame = `data:image/jpeg;base64,${base64}`;
            socket.emit('send_camera_frame', { session_id: sessionId, frame: base64 });
            setTimeout(() => { isProcessingFrame = false; }, 50);
        };
        reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.6);
}

function playAudioResponse(data) {
    if (!data.audio) return;
    audioQueue.push(data);
    if (!isPlayingAudio) playNextInQueue();
}

async function playNextInQueue() {
    if (audioQueue.length === 0) { isPlayingAudio = false; return; }
    isPlayingAudio = true;
    const data = audioQueue.shift();

    try {
        if (!playbackAudioContext) {
            playbackAudioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        }
        if (playbackAudioContext.state === 'suspended') await playbackAudioContext.resume();

        const bytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
        const int16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / (int16[i] < 0 ? 32768 : 32767);
        }

        const buf = playbackAudioContext.createBuffer(1, float32.length, 24000);
        buf.getChannelData(0).set(float32);
        const src = playbackAudioContext.createBufferSource();
        src.buffer = buf;
        src.connect(playbackAudioContext.destination);
        currentAudioSource = src;
        src.onended = () => { currentAudioSource = null; playNextInQueue(); };
        src.start(0);
    } catch (error) {
        console.error('Audio playback error:', error);
        playNextInQueue();
    }
}

function addMessage(role, content) {
    if (!messagesContainer) return;
    const div = document.createElement('div');
    div.className = `message message-${role} mb-3`;
    const bubbleClass = role === 'user' ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100' :
                        role === 'error' ? 'bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100' :
                        'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100';
    div.innerHTML = `<div class="inline-block px-4 py-2 rounded-xl ${bubbleClass}">${escapeHtml(content)}</div>`;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function appendTranscript(text) {
    const container = document.getElementById('transcriptContainer');
    const content = document.getElementById('transcriptContent');
    if (!content) return;

    // If text is overflowing, clear old chunks immediately
    if (container && content.scrollHeight > container.clientHeight) {
        content.innerHTML = '';
    }

    const span = document.createElement('span');
    span.className = 'transcript-chunk';
    span.textContent = '';
    content.appendChild(span);

    // Stream character by character
    let i = 0;
    const charDelay = 50; // ms per character, slower pace
    const streamInterval = setInterval(() => {
        if (i < text.length) {
            span.textContent += text[i];
            i++;
            if (container) container.scrollTop = container.scrollHeight;
        } else {
            clearInterval(streamInterval);
            // Auto-fade after 800ms once fully typed, then remove
            setTimeout(() => {
                span.classList.add('fading');
                setTimeout(() => {
                    if (span.parentNode) span.parentNode.removeChild(span);
                }, 400);
            }, 800);
        }
    }, charDelay);
}

function clearTranscript() {
    const content = document.getElementById('transcriptContent');
    if (content) content.innerHTML = '';
}
