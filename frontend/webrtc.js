/**
 * webrtc.js - Core WebRTC and Media Logic
 * Handles Mesh topology PeerConnections, local media, grid layout
 */

const peers = {}; // socketId -> RTCPeerConnection
let localStream = null;
let screenStream = null;
let socket = null;

// STUN servers for NAT traversal
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// Listen for app events
window.addEventListener('init-local-media', async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const prejoinVideo = document.getElementById('prejoin-video');
        if(prejoinVideo) prejoinVideo.srcObject = localStream;
        
        // Notify app.js that camera is ready
        window.dispatchEvent(new CustomEvent('local-media-ready'));
    } catch (err) {
        console.error("Failed to get local media", err);
        showToast("Please grant camera and microphone permissions.", "red");
        // Still fire ready so the user can join (just without camera)
        window.dispatchEvent(new CustomEvent('local-media-ready'));
    }
});

// Device management via app events
window.addEventListener('toggle-mic', (e) => {
    if(localStream) {
        localStream.getAudioTracks().forEach(track => track.enabled = e.detail.state);
        if(socket && AppState.meetingId) {
            socket.emit('toggle-media', { meetingId: AppState.meetingId, type: 'audio', state: e.detail.state });
        }
    }
});

window.addEventListener('toggle-cam', (e) => {
    if(localStream) {
        localStream.getVideoTracks().forEach(track => track.enabled = e.detail.state);
        if(socket && AppState.meetingId) {
            socket.emit('toggle-media', { meetingId: AppState.meetingId, type: 'video', state: e.detail.state });
        }
    }
});

window.addEventListener('join-room', (e) => {
    connectAndJoin(e.detail);
});

window.addEventListener('grid-resize', () => {
   updateGridClasses();
});

// Socket & WebRTC setup
function connectAndJoin({ username, meetingId, consent, isHost, recordingMode }) {
    // Determine the current host/port, handle if served from root
    let wsUrl = window.location.origin;
    if (wsUrl === 'null' || wsUrl.includes('file://')) {
        wsUrl = 'http://localhost:3000'; // fallback for local dev without server
    }

    socket = io(wsUrl);

    socket.on('connect', () => {
        if (isHost) {
            socket.emit('create-meeting', { meetingId }, (response) => {
                if(response.success) {
                    AppState.meetingId = response.meetingId;
                    window.setMeetingUrls(response.meetingId);
                    socket.emit('join-room', {
                        meetingId: AppState.meetingId,
                        username,
                        consent,
                        isHost: true
                    });
                }
            });
        } else {
            // Non-host: server will put in waiting room
            window.setMeetingUrls(meetingId);
            socket.emit('join-room', {
                meetingId,
                username,
                consent,
                isHost: false
            });
        }
    });

    // Waiting room events
    socket.on('waiting-for-host', () => {
        showWaitingOverlay();
    });

    socket.on('admitted-to-meeting', () => {
        hideWaitingOverlay();
        // Now complete the actual join
        socket.emit('complete-join', {
            meetingId: AppState.meetingId || meetingId,
            username,
            consent
        });
        showToast('You have been admitted to the meeting!', 'green');
    });

    socket.on('denied-from-meeting', () => {
        hideWaitingOverlay();
        showToast('The host did not admit you to this meeting.', 'red');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
    });

    // Host receives join requests
    socket.on('user-requesting-join', (payload) => {
        showAdmitNotification(payload.socketId, payload.username, meetingId);
    });

    socket.on('error-joining', (data) => {
        showToast(data.message, "red");
        setTimeout(() => window.location.reload(), 2000);
    });

    socket.on('users-in-room', (data) => {
        // Add ourselves to the grid first
        addVideoToGrid('local', localStream, username, true);
        
        // Add existing chat/participants logic hook (in chat.js/app.js via custom event if needed)
        window.dispatchEvent(new CustomEvent('host-info', { detail: { hostId: data.host } }));

        data.users.forEach(user => {
            const peer = createPeer(user.socketId, socket.id, localStream);
            peers[user.socketId] = {
                connection: peer,
                username: user.username
            };
            // Add placeholder instantly, then attach stream when it arrives
            addVideoToGrid(user.socketId, null, user.username, false);
        });

        if (data.recording) {
            // Already recording when joined
            document.getElementById('recording-indicator').classList.remove('hidden');
            document.getElementById('recording-indicator').classList.add('flex');
            // Show consent modal if not already consented to recording specifically
            // (Assuming base consent covers everything for now as per Legal popup)
        }
    });

    socket.on('user-joined', (payload) => {
        addVideoToGrid(payload.socketId, null, payload.username, false);
        const peer = addPeer(payload.socketId, socket.id, localStream);
        peers[payload.socketId] = {
            connection: peer,
            username: payload.username
        };
        showToast(`${payload.username} joined the meeting.`, "green");
        updateParticipantList();
    });

    socket.on('user-screen-share-toggled', (payload) => {
        if (payload.isSharing) {
            // Remote user started sharing — show their video tile as presentation
            const tile = document.getElementById(`video-container-${payload.socketId}`);
            if (tile) {
                const video = tile.querySelector('video');
                if (video && video.srcObject) {
                    showPresentationLayout(video.srcObject, payload.socketId);
                }
            }
            showToast('A participant is presenting their screen.', 'blue');
        } else {
            // Remote user stopped sharing
            hidePresentationLayout();
            showToast('Screen sharing ended.', 'blue');
        }
    });

    // Cleanup when a user leaves
    socket.on('user-left', (payload) => {
        const id = payload.socketId;
        if (peers[id]) {
            if (peers[id].connection) {
                peers[id].connection.close();
            }
            delete peers[id];
        }
        removeVideoFromGrid(id);
        updateParticipantList();
        console.log(`[WebRTC] Cleaned up disconnected user: ${id}`);
    });

    socket.on('user-joined-signal', async payload => {
        const item = peers[payload.callerId];
        if (item) {
            try {
                if(payload.signal.type === 'offer') {
                    await item.connection.setRemoteDescription(new RTCSessionDescription(payload.signal));
                    const answer = await item.connection.createAnswer();
                    await item.connection.setLocalDescription(answer);
                    socket.emit('returning-signal', { signal: answer, callerId: payload.callerId });
                } else if(payload.signal.candidate) {
                    await item.connection.addIceCandidate(new RTCIceCandidate(payload.signal));
                }
            } catch (e) { console.error(e); }
        }
    });

    socket.on('receiving-returned-signal', async payload => {
        const item = peers[payload.id];
        if (item) {
             try {
                if(payload.signal.type === 'answer') {
                    await item.connection.setRemoteDescription(new RTCSessionDescription(payload.signal));
                } else if(payload.signal.candidate) {
                    await item.connection.addIceCandidate(new RTCIceCandidate(payload.signal));
                }
             } catch(e) { console.error(e); }
        }
    });

    // Media toggles
    socket.on('user-toggled-media', payload => {
        const tile = document.getElementById(`video-container-${payload.socketId}`);
        if(tile) {
            if(payload.type === 'audio') {
                // Show mute icon on tile?
                let badge = tile.querySelector('.mute-indicator');
                if(!payload.state) {
                    if(!badge) {
                        badge = document.createElement('i');
                        badge.className = 'fa-solid fa-microphone-slash mute-indicator text-danger absolute top-3 right-3 bg-white/20 p-1.5 rounded-full backdrop-blur text-xs';
                        tile.appendChild(badge);
                    }
                } else {
                    if(badge) badge.remove();
                }
            } else if (payload.type === 'video') {
                let offUI = tile.querySelector('.video-off-placeholder');
                if(!payload.state) {
                    if(!offUI) {
                        offUI = document.createElement('div');
                        offUI.className = 'video-off-placeholder absolute inset-0 bg-[#202124] flex items-center justify-center';
                        // Google Meet SVG Avatar
                        offUI.innerHTML = `
                        <div class="video-off-avatar w-[100px] h-[100px] rounded-full bg-[#3c4043] flex items-center justify-center text-gray-300">
                           <svg focusable="false" viewBox="0 0 32 32" class="w-14 h-14 fill-current"><path d="M16 14.5A6.5 6.5 0 109.5 8a6.5 6.5 0 006.5 6.5zM16 18c-4.34 0-13 2.17-13 6.5V28h26v-3.5c0-4.33-8.66-6.5-13-6.5z"></path></svg>
                        </div>`;
                        tile.appendChild(offUI);
                    }
                } else {
                    if(offUI) offUI.remove();
                }
            }
        }
    });

    // Host controls
    socket.on('host-action-received', payload => {
         if(payload.action === 'mute') {
             if(AppState.micEnabled) document.getElementById('btn-toggle-mic').click();
             showToast("The host has muted your microphone.", "warning");
         }
    });

    // Whiteboard socket listeners
    socket.on('wb-draw-received', data => {
        if(window.handleNetworkDraw) window.handleNetworkDraw(data);
    });
    
    socket.on('wb-clear-received', () => {
        if(window.handleNetworkClear) window.handleNetworkClear();
    });
}

function joinRoomPayload(meetingId, username, consent) {
    socket.emit('join-meeting', { meetingId, username, consent });
    updateParticipantList();
}

// Waiting room UI
function showWaitingOverlay() {
    let overlay = document.getElementById('waiting-room-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'waiting-room-overlay';
        overlay.className = 'fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#202124]';
        overlay.innerHTML = `
            <div class="text-center">
                <div class="w-16 h-16 rounded-full bg-brand/20 flex items-center justify-center mx-auto mb-6">
                    <i class="fa-solid fa-clock text-brand text-2xl animate-pulse"></i>
                </div>
                <h2 class="text-xl font-semibold text-white mb-2">Waiting for the host to let you in</h2>
                <p class="text-gray-400 text-sm mb-8">You'll join the meeting when the host admits you</p>
                <div class="flex gap-2 items-center justify-center">
                    <div class="w-2 h-2 bg-brand rounded-full animate-bounce" style="animation-delay: 0s"></div>
                    <div class="w-2 h-2 bg-brand rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                    <div class="w-2 h-2 bg-brand rounded-full animate-bounce" style="animation-delay: 0.4s"></div>
                </div>
                <button onclick="window.location.href='index.html'" class="mt-8 text-sm text-gray-400 hover:text-white transition-colors underline">Leave</button>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    overlay.classList.remove('hidden');
}

function hideWaitingOverlay() {
    const overlay = document.getElementById('waiting-room-overlay');
    if (overlay) overlay.remove();
}

function showAdmitNotification(socketId, username, meetingId) {
    const container = document.getElementById('admit-notifications') || createAdmitContainer();
    
    const notification = document.createElement('div');
    notification.id = `admit-${socketId}`;
    notification.className = 'flex items-center justify-between bg-gray-800 border border-gray-600 rounded-xl p-4 shadow-2xl animate-fade-in w-80';
    notification.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-xs font-bold text-white">${username.charAt(0).toUpperCase()}</div>
            <div>
                <p class="text-sm font-medium text-white">${username}</p>
                <p class="text-xs text-gray-400">wants to join</p>
            </div>
        </div>
        <div class="flex gap-2">
            <button class="btn-deny px-3 py-1.5 text-xs rounded-lg border border-gray-500 text-gray-300 hover:bg-gray-700 transition-colors">Deny</button>
            <button class="btn-admit px-3 py-1.5 text-xs rounded-lg bg-brand text-white hover:bg-blue-600 transition-colors font-medium">Admit</button>
        </div>
    `;
    
    notification.querySelector('.btn-admit').addEventListener('click', () => {
        socket.emit('admit-user', { meetingId: AppState.meetingId || meetingId, socketId });
        notification.remove();
        if (container.children.length === 0) container.classList.add('hidden');
    });
    
    notification.querySelector('.btn-deny').addEventListener('click', () => {
        socket.emit('deny-user', { meetingId: AppState.meetingId || meetingId, socketId });
        notification.remove();
        if (container.children.length === 0) container.classList.add('hidden');
    });
    
    container.classList.remove('hidden');
    container.appendChild(notification);
}

function createAdmitContainer() {
    const container = document.createElement('div');
    container.id = 'admit-notifications';
    container.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 hidden';
    document.body.appendChild(container);
    return container;
}

function createPeer(userToSignal, callerId, stream) {
    const peer = new RTCPeerConnection(iceServers);
    
    stream.getTracks().forEach(track => {
        peer.addTrack(track, stream);
    });

    peer.onicecandidate = e => {
        if(e.candidate) {
            socket.emit('sending-signal', { userToSignal, callerId, signal: e.candidate });
        }
    };

    peer.onnegotiationneeded = async () => {
        try {
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            socket.emit('sending-signal', { userToSignal, callerId, signal: peer.localDescription });
        } catch(err) { console.error(err); }
    };

    peer.ontrack = e => {
        attachStreamToVideo(userToSignal, e.streams[0]);
    };

    return peer;
}

function addPeer(incomingSignalId, callerId, stream) {
    const peer = new RTCPeerConnection(iceServers);
    
    stream.getTracks().forEach(track => {
        peer.addTrack(track, stream);
    });

    peer.onicecandidate = e => {
        if(e.candidate) {
            socket.emit('returning-signal', { signal: e.candidate, callerId: incomingSignalId });
        }
    };

    peer.ontrack = e => {
        attachStreamToVideo(incomingSignalId, e.streams[0]);
    };

    return peer;
}

// ------------------------------------------------------------------
// SCREEN SHARING
// ------------------------------------------------------------------
window.addEventListener('toggle-screen-share', async (e) => {
    if (!screenStream) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            
            // Listen for native "Stop Sharing" bar button
            screenStream.getVideoTracks()[0].onended = () => {
                stopScreenShare();
            };

            // Substitute webcam track with screen share track for peers
            const videoTrack = screenStream.getVideoTracks()[0];
            Object.values(peers).forEach(peerObj => {
                const sender = peerObj.connection.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(videoTrack).catch(err => console.error("Replace track err:", err));
                }
            });

            // Show presentation layout (Google Meet style)
            showPresentationLayout(screenStream, 'local');
            
            // Notify peers about screen share
            if(socket) {
                socket.emit('screen-share-toggle', { meetingId: AppState.meetingId, isSharing: true });
            }
            
            e.detail.callback(true);
        } catch (err) {
            console.error("Screen share failed", err);
            e.detail.callback(false);
        }
    } else {
        stopScreenShare();
        e.detail.callback(false);
    }
});

function showPresentationLayout(stream, sharerId) {
    const videoGrid = document.getElementById('video-grid');
    const presentationArea = document.getElementById('presentation-area');
    const presentationVideo = document.getElementById('presentation-video');
    const miniGrid = document.getElementById('mini-video-grid');
    const presentationName = document.getElementById('presentation-name');

    if (!presentationArea || !videoGrid) return;

    // Set the shared screen stream
    presentationVideo.srcObject = stream;
    
    // Set presenter name
    if (sharerId === 'local') {
        presentationName.textContent = 'You are';
    } else if (peers[sharerId]) {
        presentationName.textContent = peers[sharerId].username + ' is';
    } else {
        presentationName.textContent = 'Someone is';
    }

    // Move all video tiles from main grid into the mini sidebar strip
    const tiles = Array.from(videoGrid.querySelectorAll('.video-tile-container'));
    tiles.forEach(tile => {
        tile.className = 'video-tile-container relative animate-fade-in w-full aspect-video mb-2 rounded-lg overflow-hidden';
        miniGrid.appendChild(tile);
    });

    // Hide normal grid, show presentation layout
    videoGrid.classList.add('hidden');
    presentationArea.classList.remove('hidden');
    presentationArea.classList.add('flex');
}

function hidePresentationLayout() {
    const videoGrid = document.getElementById('video-grid');
    const presentationArea = document.getElementById('presentation-area');
    const miniGrid = document.getElementById('mini-video-grid');

    if (!presentationArea || !videoGrid) return;

    // Move all tiles back from mini strip to main grid
    const tiles = Array.from(miniGrid.querySelectorAll('.video-tile-container'));
    tiles.forEach(tile => {
        videoGrid.appendChild(tile);
    });

    // Show normal grid, hide presentation layout
    videoGrid.classList.remove('hidden');
    presentationArea.classList.add('hidden');
    presentationArea.classList.remove('flex');

    // Recalculate grid tile sizes
    updateGridClasses();
}

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;

        // Restore local webcam track for peers
        const videoTrack = localStream ? localStream.getVideoTracks()[0] : null;
        Object.values(peers).forEach(peerObj => {
            const sender = peerObj.connection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender && videoTrack) {
                sender.replaceTrack(videoTrack).catch(err => console.error("Replace local track err:", err));
            }
        });

        // Restore local video preview in tile
        const localVideo = document.getElementById('video-local');
        if(localVideo && localStream) {
            localVideo.srcObject = localStream;
            localVideo.classList.add('mirror-mode');
        }

        // Return to normal grid layout
        hidePresentationLayout();

        // Notify peers
        if(socket) {
            socket.emit('screen-share-toggle', { meetingId: AppState.meetingId, isSharing: false });
        }

        // Inform app.js to reset UI
        window.dispatchEvent(new CustomEvent('screen-share-stopped'));
    }
}

// ------------------------------------------------------------------
// UI GRID MANAGEMENT
// ------------------------------------------------------------------
function addVideoToGrid(id, stream, name, isLocal) {
    const grid = document.getElementById('video-grid');
    if(!grid) return;
    if(document.getElementById(`video-container-${id}`)) return; // Already exists

    const wrapper = document.createElement('div');
    wrapper.id = `video-container-${id}`;
    wrapper.className = 'video-tile-container animate-fade-in aspect-video relative';
    wrapper.setAttribute('data-name', name);
    // Bind context menu
    wrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('show-context-menu', { 
            detail: { x: e.pageX, y: e.pageY, id, name } 
        }));
    });

    const video = document.createElement('video');
    video.id = `video-${id}`;
    video.autoplay = true;
    video.playsInline = true;
    if(isLocal) {
        video.muted = true;
        video.classList.add('mirror-mode');
    }
    if(stream) video.srcObject = stream;

    const badge = document.createElement('div');
    badge.className = 'name-badge';
    badge.innerHTML = `<span>${name} ${isLocal ? '(You)' : ''}</span>`;

    wrapper.appendChild(video);
    wrapper.appendChild(badge);
    
    // Default off state if no stream immediately available (or if it's disabled)
    if(!stream || (isLocal && !AppState.camEnabled)) {
         const offUI = document.createElement('div');
         offUI.className = 'video-off-placeholder absolute inset-0 bg-[#202124] flex items-center justify-center';
         offUI.innerHTML = `
            <div class="video-off-avatar w-[100px] h-[100px] rounded-full bg-[#3c4043] flex items-center justify-center text-gray-300">
               <svg focusable="false" viewBox="0 0 32 32" class="w-14 h-14 fill-current"><path d="M16 14.5A6.5 6.5 0 109.5 8a6.5 6.5 0 006.5 6.5zM16 18c-4.34 0-13 2.17-13 6.5V28h26v-3.5c0-4.33-8.66-6.5-13-6.5z"></path></svg>
            </div>`;
         wrapper.appendChild(offUI);
    }

    grid.appendChild(wrapper);
    updateGridClasses();
    updateParticipantList();
}

function attachStreamToVideo(id, stream) {
    const wrapper = document.getElementById(`video-container-${id}`);
    if(wrapper) {
        const video = wrapper.querySelector('video');
        if(video) {
            video.srcObject = stream;
        }
        const offPH = wrapper.querySelector('.video-off-placeholder');
        if(offPH) offPH.remove();
    }
}

function removeVideoFromGrid(id) {
    const el = document.getElementById(`video-container-${id}`);
    if(el) el.remove();
    updateGridClasses();
}

function updateGridClasses() {
    const grid = document.getElementById('video-grid');
    if (!grid) return;
    const tiles = grid.querySelectorAll('.video-tile-container');
    const count = tiles.length;
    
    // Determine dynamic tailwind width classes based on count 
    // to simulate Google Meet tile scaling
    let wClass = '';
    
    if (count === 1) {
        wClass = 'w-full max-w-5xl aspect-video mx-auto';
    } else if (count === 2) {
        wClass = 'w-5/12 aspect-video max-w-2xl mx-2';
    } else if (count <= 4) {
        wClass = 'w-5/12 aspect-video max-w-2xl mx-2';
    } else if (count <= 9) {
        wClass = 'w-[32%] aspect-video mx-1';
    } else if (count <= 16) {
        wClass = 'w-[23%] aspect-video mx-1';
    } else {
        wClass = 'w-[18vw] aspect-square mx-1';
    }

    tiles.forEach(tile => {
        tile.className = `video-tile-container relative animate-fade-in ${wClass} mb-3`;
    });
}

// Device Selection Utils
function populateDeviceSelectors(devices) {
    const micSelect = document.getElementById('select-mic');
    const camSelect = document.getElementById('select-cam');
    
    micSelect.innerHTML = '';
    camSelect.innerHTML = '';

    devices.forEach(device => {
        if(device.kind === 'audioinput') {
            const opt = document.createElement('option');
            opt.value = device.deviceId;
            opt.text = device.label || `Microphone ${micSelect.length + 1}`;
            micSelect.appendChild(opt);
        } else if(device.kind === 'videoinput') {
            const opt = document.createElement('option');
            opt.value = device.deviceId;
            opt.text = device.label || `Camera ${camSelect.length + 1}`;
            camSelect.appendChild(opt);
        }
    });

    // In a real app we'd bind onChange to these to swap tracks via RTCRtpSender.replaceTrack()
}

// Provide access to Socket for other modules (like chat and recording)
window.getSocket = () => socket;
window.getPeersInfo = () => {
   const plist = [{ id: 'local', name: AppState.username + ' (You)'}];
   Object.keys(peers).forEach(k => {
       plist.push({ id: k, name: peers[k].username });
   });
   return plist;
};

// Handle generic participant list UI updater
function updateParticipantList() {
    const listUI = document.getElementById('participants-list');
    const countBadge = document.getElementById('badge-participant-count');
    const countText = document.getElementById('participant-count');
    
    if(!listUI) return;
    
    const plist = window.getPeersInfo();
    
    if(countBadge) countBadge.textContent = plist.length;
    if(countText) countText.textContent = plist.length;

    listUI.innerHTML = '';
    plist.forEach(p => {
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between p-2 hover:bg-white/5 rounded-md';
        li.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-xs font-bold shadow">${p.name.charAt(0).toUpperCase()}</div>
                <span class="text-sm font-medium text-gray-200">${p.name}</span>
            </div>
            <div class="text-gray-400 flex gap-2">
                <i class="fa-solid fa-microphone text-xs"></i>
            </div>
        `;
        listUI.appendChild(li);
    });
}
