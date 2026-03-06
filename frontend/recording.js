/**
 * recording.js - handles Selective Participant Recording & platform recording logic
 */

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let currentlyRecordingTarget = null; // socket id

document.addEventListener('DOMContentLoaded', () => {
    
    // Listen for custom event from webrtc.js to show context menu on video tile
    window.addEventListener('show-context-menu', (e) => {
        const { x, y, id, name } = e.detail;
        showContextMenu(x, y, id, name);
    });

    // Hide context menu when clicking outside
    document.addEventListener('click', () => {
        document.getElementById('video-context-menu').classList.add('hidden');
    });

    const waitSocket = setInterval(() => {
       const socket = window.getSocket();
       if(socket) {
           clearInterval(waitSocket);
           bindRecordingSocketEvents(socket);
       }
    }, 500);

    // Host Platform Recording generic button
    const btnRecordMaster = document.getElementById('btn-recording-master');
    if(btnRecordMaster) {
        btnRecordMaster.addEventListener('click', () => {
           if(isRecording) stopRecording(null);
           else {
             // Let host know they need to select a participant or it records their view
             showToast("Please use the video tile right-click menu for Selective Recording.", "blue");
           }
        });
    }
    
    // Consent Modal Handlers
    const consentModal = document.getElementById('recording-consent-modal');
    document.getElementById('btn-leave-recording').addEventListener('click', () => {
        window.location.reload(); // Hard leave
    });
    document.getElementById('btn-accept-recording').addEventListener('click', () => {
        consentModal.classList.add('hidden');
    });
});

function showContextMenu(x, y, id, name) {
    const menu = document.getElementById('video-context-menu');
    menu.classList.remove('hidden');
    
    // Bounds checking
    const rightEdge = window.innerWidth;
    const bottomEdge = window.innerHeight;
    
    let left = x;
    let top = y;
    
    if (x + 200 > rightEdge) left = x - 200;
    if (y + 150 > bottomEdge) top = y - 150;
    
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    // Host options visibility
    const hostOpts = document.getElementById('ctx-host-options');
    if (AppState.isHost) {
        hostOpts.classList.remove('hidden');
    } else {
        hostOpts.classList.add('hidden');
    }

    // Attach specific events for this click
    const btnMute = document.getElementById('ctx-mute');
    const btnRecord = document.getElementById('ctx-record');
    
    // Clone & replace to remove old listeners
    const newBtnMute = btnMute.cloneNode(true);
    btnMute.replaceWith(newBtnMute);
    const newBtnRecord = btnRecord.cloneNode(true);
    btnRecord.replaceWith(newBtnRecord);

    newBtnMute.onclick = () => {
        const socket = window.getSocket();
        if(socket) socket.emit('host-action', { meetingId: AppState.meetingId, targetSocketId: id, action: 'mute' });
        menu.classList.add('hidden');
    };

    newBtnRecord.onclick = () => {
        if(isRecording) {
            stopRecording(name);
            newBtnRecord.innerHTML = `<i class="fa-solid fa-record-vinyl w-4 text-center"></i> Record specifically`;
        } else {
            startSelectiveRecording(id, name);
            newBtnRecord.innerHTML = `<i class="fa-solid fa-stop w-4 text-center"></i> Stop recording`;
        }
        menu.classList.add('hidden');
    };
}

function startSelectiveRecording(targetId, targetName) {
    if(!AppState.isHost) return;

    // Find the stream for this user. 
    // In our WebRTC setup, local stream is attached to `video-container-local`
    // Remote streams are attached to `video-container-<targetId>`
    
    const wrapper = document.getElementById(`video-container-${targetId}`);
    if (!wrapper) {
        showToast("Cannot find video stream.", "red");
        return;
    }
    
    const video = wrapper.querySelector('video');
    if (!video || !video.srcObject) {
         showToast("Participant has no active stream to record.", "red");
         return;
    }

    const stream = video.srcObject;

    try {
        const options = { mimeType: 'video/webm;codecs=vp9,opus' };
        mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
        // Fallback
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    }

    recordedChunks = [];

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = () => {
        downloadRecording(targetName);
    };

    mediaRecorder.start();
    isRecording = true;
    currentlyRecordingTarget = targetId;

    // Notify server to inform users
    const socket = window.getSocket();
    if (socket) {
        socket.emit('start-recording', { meetingId: AppState.meetingId, targetSocketId: targetId });
    }

    showToast(`Started recording ${targetName}'s stream.`, "red");
    document.getElementById('recording-indicator').classList.remove('hidden');
    document.getElementById('recording-indicator').classList.add('flex');
}

function stopRecording(targetName) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    isRecording = false;
    currentlyRecordingTarget = null;
    
    const socket = window.getSocket();
    if (socket) {
        socket.emit('stop-recording', { meetingId: AppState.meetingId });
    }

    showToast(`Stopped recording. Rendering file...`, "blue");
    document.getElementById('recording-indicator').classList.add('hidden');
    document.getElementById('recording-indicator').classList.remove('flex');
}

function downloadRecording(targetName) {
    const blob = new Blob(recordedChunks, {
        type: 'video/webm'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    document.body.appendChild(a);
    a.style = 'display: none';
    a.href = url;
    const dateStr = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    a.download = `MeetLite_${targetName}_${dateStr}.webm`;
    a.click();
    window.URL.revokeObjectURL(url);
    showToast(`Recording saved to your device.`, "green");
}

function bindRecordingSocketEvents(socket) {
    socket.on('recording-started', (data) => {
        document.getElementById('recording-indicator').classList.remove('hidden');
        document.getElementById('recording-indicator').classList.add('flex');
        
        // Show consent popup if NOT host
        if (!AppState.isHost) {
            document.getElementById('recording-consent-modal').classList.remove('hidden');
        } else {
            showToast("Recording has started. All participants have been notified.", "red");
        }
    });

    socket.on('recording-stopped', () => {
        document.getElementById('recording-indicator').classList.add('hidden');
        document.getElementById('recording-indicator').classList.remove('flex');
        document.getElementById('recording-consent-modal').classList.add('hidden');
    });
}
