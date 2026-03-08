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
        
        const tile = document.getElementById('video-container-local');
        if(tile) {
            let offUI = tile.querySelector('.video-off-placeholder');
            if(!e.detail.state) {
                if(!offUI) {
                    offUI = document.createElement('div');
                    offUI.className = 'video-off-placeholder absolute inset-0 bg-[#202124] flex items-center justify-center';
                    const initial = AppState.username ? AppState.username.charAt(0).toUpperCase() : '?';
                    offUI.innerHTML = `
                    <div class="video-off-avatar w-[100px] h-[100px] rounded-full bg-brand flex items-center justify-center text-4xl font-semibold text-white shadow-lg">
                       ${initial}
                    </div>`;
                    tile.appendChild(offUI);
                }
            } else {
                if(offUI) offUI.remove();
            }
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
                    // Join directly
                    socket.emit('join-room', {
                        meetingId: AppState.meetingId,
                        username,
                        consent
                    });
                }
            });
        } else {
            // Everyone joins directly — no waiting room
            window.setMeetingUrls(meetingId);
            socket.emit('join-room', {
                meetingId,
                username,
                consent
            });
        }
    });

    socket.on('error-joining', (data) => {
        showToast(data.message, "red");
        // Only reload if it's a fatal denial, not a waiting room hold
        if(data.message.includes('denied')) {
            setTimeout(() => window.location.href = 'index.html', 3000);
        } else {
            setTimeout(() => window.location.reload(), 2000);
        }
    });

    socket.on('waiting-for-approval', (data) => {
        // Show a full-screen overlay over the meeting grid
        let overlay = document.getElementById('waiting-room-overlay');
        if(!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'waiting-room-overlay';
            overlay.className = 'fixed inset-0 z-50 bg-[#202124] flex flex-col items-center justify-center text-white p-6 text-center';
            overlay.innerHTML = `
                <div class="mb-6"><i class="fa-solid fa-hourglass-half text-6xl text-brand animate-pulse"></i></div>
                <h1 class="text-3xl font-medium mb-2">Asking to join...</h1>
                <p class="text-gray-400 text-lg">You'll join the call when someone lets you in.</p>
            `;
            document.body.appendChild(overlay);
        }
    });

    socket.on('approved-to-join', (data) => {
        // Remove overlay and rejoin
        const overlay = document.getElementById('waiting-room-overlay');
        if(overlay) overlay.remove();
        
        socket.emit('join-room', {
            meetingId: data.meetingId,
            username: AppState.username,
            consent: AppState.consentGiven
        });
    });

    socket.on('user-waiting', (data) => {
        // Trigger a custom event for app.js to show the Host action toast
        window.dispatchEvent(new CustomEvent('host-user-waiting', { detail: data }));
    });

    socket.on('users-in-room', (data) => {
        // Init cohosts
        AppState.coHosts = data.coHosts || [];
        AppState.isCoHost = AppState.coHosts.includes(socket.id);

        // Add ourselves to the grid first
        addVideoToGrid('local', localStream, username, true);
        
        // Add existing chat/participants logic hook
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
            document.getElementById('recording-indicator').classList.remove('hidden');
            document.getElementById('recording-indicator').classList.add('flex');
        }
    });

    socket.on('user-joined', (payload) => {
        addVideoToGrid(payload.socketId, null, payload.username, false);
        const peer = createPeer(payload.socketId, socket.id, localStream);
        peers[payload.socketId] = {
            connection: peer,
            username: payload.username
        };
        showToast(`${payload.username} joined the meeting.`, "green");
        updateParticipantList();
    });

    socket.on('user-screen-share-toggled', (payload) => {
        if (payload.isSharing) {
            const tile = document.getElementById(`video-container-${payload.socketId}`);
            if (tile) {
                const video = tile.querySelector('video');
                if (video && video.srcObject) {
                    showPresentationLayout(video.srcObject, payload.socketId);
                }
            }
            showToast('A participant is presenting their screen.', 'blue');
        } else {
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
                        const pName = peers[payload.socketId] ? peers[payload.socketId].username : '?';
                        const initial = pName.charAt(0).toUpperCase();
                        offUI.innerHTML = `
                        <div class="video-off-avatar w-[100px] h-[100px] rounded-full bg-brand flex items-center justify-center text-4xl font-semibold text-white shadow-lg">
                           ${initial}
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

    socket.on('force-mute', () => {
         if(AppState.micEnabled) document.getElementById('btn-toggle-mic').click();
         showToast("You were muted by the Host/Co-Host.", "warning");
    });

    socket.on('force-remove', () => {
         showToast("You were removed by the Host/Co-Host.", "red");
         setTimeout(() => { window.location.href = 'index.html'; }, 2000);
    });

    socket.on('cohost-assigned', payload => {
         if(!AppState.coHosts) AppState.coHosts = [];
         if(!AppState.coHosts.includes(payload.socketId)) AppState.coHosts.push(payload.socketId);
         
         if(payload.socketId === socket.id) {
             AppState.isCoHost = true;
             showToast("You have been made a Co-Host.", "green");
             document.getElementById('host-controls-section').classList.remove('hidden');
         } else {
             const pname = peers[payload.socketId] ? peers[payload.socketId].username : 'A user';
             showToast(`${pname} is now a Co-Host.`, "blue");
         }
         updateParticipantList();
    });

    socket.on('cohost-removed', payload => {
         if(AppState.coHosts) {
             AppState.coHosts = AppState.coHosts.filter(id => id !== payload.socketId);
         }
         
         if(payload.socketId === socket.id) {
             AppState.isCoHost = false;
             showToast("Your Co-Host privileges have been removed.", "warning");
             if(!AppState.isHost) document.getElementById('host-controls-section').classList.add('hidden');
         }
         updateParticipantList();
    });

    // Whiteboard socket listeners
    socket.on('wb-draw-received', data => {
        if(window.handleNetworkDraw) window.handleNetworkDraw(data);
    });
    
    socket.on('wb-clear-received', () => {
        if(window.handleNetworkClear) window.handleNetworkClear();
    });

    socket.on('whiteboard-toggled', data => {
        const whiteboardContainer = document.getElementById('whiteboard-container');
        if (whiteboardContainer) {
            if (data.state) {
                whiteboardContainer.classList.remove('hidden');
                whiteboardContainer.classList.add('flex');
            } else {
                whiteboardContainer.classList.remove('flex');
                whiteboardContainer.classList.add('hidden');
            }
        }
    });

    socket.on('reaction-received', (data) => {
        showFlyingEmoji(data.emoji, data.socketId);
    });

    socket.on('hand-raised-received', (data) => {
        toggleHandRaisedState(data.socketId, data.state);
    });
}

function joinRoomPayload(meetingId, username, consent) {
    socket.emit('join-room', { meetingId, username, consent });
    updateParticipantList();
}

function createPeer(userToSignal, callerId, stream) {
    // This peer INITIATES the connection (sends Offer)
    const peer = new RTCPeerConnection(iceServers);
    
    if (stream) {
        stream.getTracks().forEach(track => {
            peer.addTrack(track, stream);
        });
    }

    peer.onicecandidate = e => {
        if(e.candidate) {
            socket.emit('sending-signal', { userToSignal, callerId, signal: e.candidate });
        }
    };

    // Since we are the creator, we make the offer
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
    // This peer RECEIVES the connection (sends Answer)
    const peer = new RTCPeerConnection(iceServers);
    
    if (stream) {
        stream.getTracks().forEach(track => {
            peer.addTrack(track, stream);
        });
    }

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
    
    // Add specific record overlay button for remote users
    if (!isLocal) {
        const actionOverlay = document.createElement('div');
        actionOverlay.className = 'absolute top-3 right-3 flex gap-2 z-20';
        
        const recBtn = document.createElement('button');
        recBtn.className = 'w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 backdrop-blur shadow-sm transition-colors';
        recBtn.title = 'Record selective meeting';
        recBtn.innerHTML = '<i class="fa-solid fa-record-vinyl text-[14px]"></i>';
        
        recBtn.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if(window.toggleRecordingForUser) {
                window.toggleRecordingForUser(id);
                // The toggleRecordingForUser handles the activeRecorders state
                setTimeout(() => {
                    if (window.activeRecorders && window.activeRecorders[id]) {
                        recBtn.classList.add('text-danger', 'bg-white');
                        recBtn.classList.remove('bg-black/50', 'text-white');
                        recBtn.innerHTML = '<i class="fa-solid fa-stop text-[14px] animate-pulse"></i>';
                    } else {
                        recBtn.classList.remove('text-danger', 'bg-white');
                        recBtn.classList.add('bg-black/50', 'text-white');
                        recBtn.innerHTML = '<i class="fa-solid fa-record-vinyl text-[14px]"></i>';
                    }
                }, 100);
            }
        };
        actionOverlay.appendChild(recBtn);
        wrapper.appendChild(actionOverlay);
    }
    
    // Default off state if no stream immediately available (or if it's disabled)
    if(!stream || (isLocal && !AppState.camEnabled)) {
         const offUI = document.createElement('div');
         offUI.className = 'video-off-placeholder absolute inset-0 bg-[#202124] flex items-center justify-center';
         const initial = name ? name.charAt(0).toUpperCase() : '?';
         offUI.innerHTML = `
            <div class="video-off-avatar w-[100px] h-[100px] rounded-full bg-brand flex items-center justify-center text-4xl font-semibold text-white shadow-lg">
               ${initial}
            </div>`;
         wrapper.appendChild(offUI);
    }

    grid.appendChild(wrapper);
    updateGridClasses();
    updateParticipantList();

    if (isLocal) {
        // Hook up the PIP drag events once local video is added
        makePiPDraggable();
    }
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
    
    // We treat local vs remote tiles completely differently on mobile
    const allTiles = grid.querySelectorAll('.video-tile-container');
    const localTile = document.getElementById('video-container-local');
    const remoteTiles = grid.querySelectorAll('.video-tile-container:not(#video-container-local)');
    
    const count = allTiles.length;
    const remoteCount = remoteTiles.length;
    
    const isMobile = window.innerWidth <= 768;

    // Trigger Mobile PiP mode if we are on mobile, have local, and at least 1 remote
    if (isMobile && localTile && remoteCount >= 1) {
        document.body.classList.add('mobile-pip-mode');
        
        // Let CSS handle the grid flex container layout properties
        grid.className = "flex flex-col w-full h-full";
        
        // Stacking remotes dynamically 
        remoteTiles.forEach(tile => {
            if (remoteCount === 1) {
                tile.className = "video-tile-container relative animate-fade-in w-full h-full";
            } else if (remoteCount === 2) {
                tile.className = "video-tile-container relative animate-fade-in w-full h-[50dvh]";
            } else if (remoteCount === 3) {
                tile.className = "video-tile-container relative animate-fade-in w-full h-[33.3dvh]";
            } else {
                // If 4+, let's just use CSS grid fallback
                grid.className = "grid grid-cols-2 grid-rows-2 w-full h-full";
                tile.className = "video-tile-container relative animate-fade-in w-full h-[50dvh]";
            }
        });

        // Ensure local tile keeps base class, CSS handles absolute PiP positioning
        localTile.className = "video-tile-container relative animate-fade-in cursor-move";
        
        // Append local tile to end of DOM so it renders on top without z-index fighting
        grid.appendChild(localTile);
    } else {
        // Desktop / Generic Layout Array Fallback
        document.body.classList.remove('mobile-pip-mode');
        
        grid.className = "flex flex-wrap justify-center items-center w-full max-w-7xl mx-auto h-full gap-2 p-4";
        
        // If someone is presenting, don't interfere with mini-grid layouts
        if (grid.classList.contains('hidden')) return;

        let wClass = '';
        if (count === 1) {
            wClass = 'w-full max-w-5xl h-[80vh] md:aspect-video mx-auto object-cover';
        } else if (count === 2) {
            wClass = 'w-1/2 md:w-5/12 aspect-video max-w-2xl mx-1 md:mx-2';
        } else if (count <= 4) {
            wClass = 'w-5/12 aspect-video max-w-2xl mx-1 md:mx-2';
        } else if (count <= 9) {
            wClass = 'w-[32%] aspect-video mx-1';
        } else if (count <= 16) {
            wClass = 'w-[23%] aspect-video mx-1';
        } else {
            wClass = 'w-[18vw] aspect-square mx-1';
        }

        allTiles.forEach(tile => {
            tile.className = `video-tile-container relative animate-fade-in ${wClass} mb-2 md:mb-3 rounded-lg overflow-hidden`;
        });
    }
}

function makePiPDraggable() {
    const pip = document.getElementById('video-container-local');
    if (!pip) return;
    
    // Default initial bottom-right position if unset
    if (!pip.style.left && !pip.style.top) {
        pip.style.top = 'auto'; 
        pip.style.left = 'auto';
        pip.style.bottom = '120px';
        pip.style.right = '16px';
    }

    let isDragging = false;
    let initialX, initialY, startLeft, startTop;

    const dragStart = (e) => {
        if (!document.body.classList.contains('mobile-pip-mode')) return;
        const target = e.target.closest('.video-tile-container');
        if (target !== pip) return;
        
        isDragging = true;
        
        // Convert bottom/right defaults to explicit top/left before dragging
        const rect = pip.getBoundingClientRect();
        pip.style.bottom = 'auto';
        pip.style.right = 'auto';
        pip.style.top = rect.top + 'px';
        pip.style.left = rect.left + 'px';

        initialX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
        initialY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
        
        startLeft = parseFloat(pip.style.left);
        startTop = parseFloat(pip.style.top);
    };

    const drag = (e) => {
        if (!isDragging) return;
        e.preventDefault(); 
        
        const currentX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
        const currentY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
        
        const dx = currentX - initialX;
        const dy = currentY - initialY;
        
        let newX = startLeft + dx;
        let newY = startTop + dy;
        
        // Bounds checking against viewport
        const maxX = window.innerWidth - pip.offsetWidth;
        const maxY = window.innerHeight - pip.offsetHeight;
        
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));
        
        pip.style.left = newX + 'px';
        pip.style.top = newY + 'px';
    };

    const dragEnd = () => {
        isDragging = false;
    };

    // Binding listeners safely
    pip.addEventListener('touchstart', dragStart, { passive: false });
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('touchend', dragEnd);
    
    pip.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
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
    const badgeMap1 = document.getElementById('sheet-participant-count');
    const countText = document.getElementById('participant-count');
    
    if(!listUI) return;
    
    const plist = window.getPeersInfo();
    
    if(badgeMap1) badgeMap1.textContent = plist.length;
    if(countText) countText.textContent = plist.length;

    listUI.innerHTML = '';
    plist.forEach(p => {
        let roles = [];
        if(p.id === 'local' && AppState.isHost) roles.push('Host');
        else if (window.hostId === p.id) roles.push('Host'); // We set hostId from host-info event
        
        if(p.id === 'local' && AppState.isCoHost) roles.push('Co-Host');
        else if(AppState.coHosts && AppState.coHosts.includes(p.id)) roles.push('Co-Host');

        let roleHTML = roles.length > 0 ? `<div class="text-[10px] text-gray-500 font-mono">${roles.join(', ')}</div>` : '';

        const li = document.createElement('li');
        li.className = 'flex items-center justify-between p-2 hover:bg-white/5 rounded-md';
        li.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-xs font-bold shadow">${p.name.charAt(0).toUpperCase()}</div>
                <div class="flex flex-col">
                    <span class="text-sm font-medium text-gray-200">${p.name}</span>
                    ${roleHTML}
                </div>
            </div>
            <div class="text-gray-400 flex gap-2">
                <i class="fa-solid fa-microphone text-xs"></i>
            </div>
        `;
        listUI.appendChild(li);
    });
}

// Global context menu handler hook
window.addEventListener('show-context-menu', (e) => {
    const { x, y, id, name } = e.detail;
    const menu = document.getElementById('video-context-menu');
    const hostOps = document.getElementById('ctx-host-options');
    
    // Only show host options if local user is host or cohost AND target is NOT local user
    if((AppState.isHost || AppState.isCoHost) && id !== 'local') {
        hostOps.classList.remove('hidden');
        
        // Setup Co-Host Make/Remove buttons (Host Only)
        const btnMake = document.getElementById('ctx-make-cohost');
        const btnRemove = document.getElementById('ctx-remove-cohost');
        
        if (AppState.isHost) {
            btnMake.classList.remove('hidden');
            btnMake.onclick = () => {
                socket.emit('make-cohost', { targetSocketId: id });
                menu.classList.add('hidden');
            };
            btnRemove.onclick = () => {
                socket.emit('remove-cohost', { targetSocketId: id });
                menu.classList.add('hidden');
            };

            const isalreadyCoHost = AppState.coHosts && AppState.coHosts.includes(id);
            if(isalreadyCoHost) {
                btnMake.classList.add('hidden');
                btnRemove.classList.remove('hidden');
            } else {
                btnMake.classList.remove('hidden');
                btnRemove.classList.add('hidden');
            }
        } else {
            // Co-hosts cannot make other co-hosts
            btnMake.classList.add('hidden');
            btnRemove.classList.add('hidden');
        }

        // Setup Record specifically
        const btnRecord = document.getElementById('ctx-record');
        if (btnRecord) {
            btnRecord.classList.remove('hidden');
            if (activeRecorders && activeRecorders[id]) {
                btnRecord.innerHTML = '<i class="fa-solid fa-stop w-5 text-center text-white"></i> Stop Recording';
                btnRecord.classList.add('bg-gray-700', 'text-white');
                btnRecord.classList.remove('hover:bg-danger/20', 'text-danger');
            } else {
                btnRecord.innerHTML = '<i class="fa-solid fa-record-vinyl w-5 text-center animate-pulse"></i> Record specifically';
                btnRecord.classList.add('hover:bg-danger/20', 'text-danger');
                btnRecord.classList.remove('bg-gray-700', 'text-white');
            }
            btnRecord.onclick = () => {
                toggleRecordingForUser(id);
                menu.classList.add('hidden');
            };
        }

        // Setup Mute/Remove
        document.getElementById('ctx-mute').onclick = () => {
            socket.emit('remote-mute', { targetSocketId: id });
            menu.classList.add('hidden');
        };
        document.getElementById('ctx-remove').onclick = () => {
            // CoHost cannot remove Host (handled loosely in UI, strictly on backend)
            socket.emit('remote-remove', { targetSocketId: id });
            menu.classList.add('hidden');
        };
    } else {
        hostOps.classList.add('hidden');
    }

    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.remove('hidden');
});

// Hide context menu when clicking elsewhere
document.addEventListener('click', () => {
    const menu = document.getElementById('video-context-menu');
    if(menu && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
    }
});

// Store global hostId from app event
window.addEventListener('host-info', (e) => {
    window.hostId = e.detail.hostId;
    updateParticipantList();
});

// Dispatch socket emissions for host waiting room actions
window.addEventListener('host-admit-user', (e) => {
    if(socket) socket.emit('admit-user', { targetSocketId: e.detail.targetSocketId });
});
window.addEventListener('host-deny-user', (e) => {
    if(socket) socket.emit('deny-user', { targetSocketId: e.detail.targetSocketId });
});

// Recording logic dictionary
const activeRecorders = {};

function toggleRecordingForUser(socketId) {
    if (activeRecorders[socketId]) {
        // Stop it
        activeRecorders[socketId].stop();
        delete activeRecorders[socketId];
        showToast(`Stopped recording user`, "green");
    } else {
        // Start it
        let streamToRecord = null;
        if (socketId === 'local') {
            streamToRecord = localStream;
        } else {
            const videoEl = document.getElementById(`video-${socketId}`);
            if (videoEl && videoEl.srcObject) {
                streamToRecord = videoEl.srcObject;
            }
        }

        if (streamToRecord) {
            startRecordingStream(streamToRecord, socketId);
        } else {
            showToast('No active stream to record for this user', 'red');
        }
    }
}

function startRecordingStream(stream, idLabel) {
    try {
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks = [];
        
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };
        
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `nexusmeet_recording_${idLabel}_${Date.now()}.webm`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
        };
        
        recorder.start();
        activeRecorders[idLabel] = recorder;
        showToast(`Started recording user`, "blue");
    } catch (e) {
        console.error("Recording error:", e);
        showToast("Error starting recording. Browser may not support it.", "red");
    }
}

// Full meeting recording (prompts display media)
window.addEventListener('start-full-meeting-recording', async () => {
    try {
        if (activeRecorders['full-meeting']) {
            activeRecorders['full-meeting'].stop();
            delete activeRecorders['full-meeting'];
            showToast("Stopped full meeting recording", "green");
            return;
        }

        // Ask for screen to record
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        
        const recorder = new MediaRecorder(displayStream, { mimeType: 'video/webm' });
        const chunks = [];
        
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };
        
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `nexusmeet_full_recording_${Date.now()}.webm`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            delete activeRecorders['full-meeting'];
        };

        // If user stops sharing via browser UI, stop recording
        displayStream.getVideoTracks()[0].onended = () => {
            if(recorder.state !== 'inactive') recorder.stop();
        };
        
        recorder.start();
        activeRecorders['full-meeting'] = recorder;
        showToast("Started recording entire meeting", "blue");
        
    } catch (err) {
        console.error("Full meeting recording failed:", err);
        showToast("Screen share required to record entire meeting.", "red");
    }
});

// Captions logic
let captionsActive = false;
let speechRecognition = null;

window.addEventListener('toggle-captions', () => {
    if (!('webkitSpeechRecognition' in window)) {
        showToast('Live Captions are not supported in your browser.', 'red');
        return;
    }
    
    if (captionsActive) {
        captionsActive = false;
        if (speechRecognition) speechRecognition.stop();
        showToast('Captions disabled', 'blue');
        const cc = document.getElementById('captions-container');
        if (cc) cc.remove();
        document.getElementById('btn-captions-sheet')?.classList.remove('text-brand');
    } else {
        captionsActive = true;
        document.getElementById('btn-captions-sheet')?.classList.add('text-brand');
        showToast('Captions enabled. Speak into your mic!', 'green');
        
        let cc = document.getElementById('captions-container');
        if (!cc) {
            cc = document.createElement('div');
            cc.id = 'captions-container';
            cc.className = 'fixed bottom-32 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-6 py-3 rounded-lg max-w-lg text-center z-[100] transition-opacity duration-300 text-lg shadow-xl border border-gray-700 pointer-events-none hidden';
            document.body.appendChild(cc);
        }

        speechRecognition = new webkitSpeechRecognition();
        speechRecognition.continuous = true;
        speechRecognition.interimResults = true;
        speechRecognition.lang = 'en-US';

        speechRecognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            
            const displayTxt = finalTranscript || interimTranscript;
            if (displayTxt.trim().length > 0) {
                cc.classList.remove('hidden');
                cc.innerHTML = `<span class="opacity-75 text-brand hidden md:inline mr-2">${AppState.username}:</span> ${displayTxt}`;
                
                // Auto hide after 3 seconds of no speaking
                clearTimeout(window.captionsTimeout);
                window.captionsTimeout = setTimeout(() => {
                    cc.classList.add('hidden');
                }, 3000);
            }
        };

        speechRecognition.onerror = (e) => {
            console.error('Speech recognition error:', e);
            if(e.error === 'not-allowed') showToast('Microphone access for captions denied.', 'red');
        };

        speechRecognition.start();
    }
});
