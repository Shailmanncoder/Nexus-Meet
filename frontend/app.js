/**
 * app.js - Main UI controller, routing logic, and DOM interactions
 */

const AppState = {
  view: 'home', // home, prejoin, meeting
  meetingId: null,
  username: '',
  consentGiven: false,
  isHost: false,
  recordingMode: 'none', // none, entire, selective
  
  // Media state
  micEnabled: true,
  camEnabled: true,
  
  // Sidebar state
  activeSidebar: null, // chat, participants, details
  
  // Toast container tracking
  toastContainer: null
};

document.addEventListener('DOMContentLoaded', () => {
  initDOM();
  const path = window.location.pathname;
  if (path.includes('prejoin.html')) {
      AppState.view = 'prejoin';
      initPrejoin();
  } else if (path.includes('meeting.html')) {
      AppState.view = 'meeting';
      initMeeting();
  } else {
      AppState.view = 'home';
      bindHomeEvents();
      // URL checking for direct invites returning to index
      const urlParams = new URLSearchParams(window.location.search);
      const codeParam = urlParams.get('code');
      if (codeParam) {
         window.location.href = `prejoin.html?code=${codeParam}`;
      }
  }
});

function initDOM() {
  // Setup clock loop for footer
  setInterval(() => {
    const displays = document.querySelectorAll('.meeting-time-display');
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    displays.forEach(el => el.textContent = timeStr);
  }, 1000);

  // Setup toast container
  const toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  document.body.appendChild(toastContainer);
  AppState.toastContainer = toastContainer;
  
  // Bind more options dropdown if present
  const btnMore = document.getElementById('btn-more-options');
  if (btnMore) {
      const dropdown = btnMore.nextElementSibling;
      btnMore.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', () => {
          dropdown.classList.add('hidden');
      });
  }
  
  const btnMoreMobile = document.getElementById('btn-more-options-mobile');
  if (btnMoreMobile) {
      const dropdownMobile = btnMoreMobile.nextElementSibling;
      btnMoreMobile.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdownMobile.classList.toggle('hidden');
      });
      document.addEventListener('click', () => {
          dropdownMobile.classList.add('hidden');
      });
  }
}

function showToast(message, type = 'blue') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> <span>${message}</span>`;
  AppState.toastContainer.appendChild(toast);
  setTimeout(() => {
    if(toast.parentElement) toast.remove();
  }, 5000);
}

// -----------------------------------------------------
// HOME SCREEN LOGIC
// -----------------------------------------------------
function bindHomeEvents() {
  const btnCreate = document.getElementById('btn-create-meeting');
  const btnJoinFromHome = document.getElementById('btn-join-from-home');
  const inputCode = document.getElementById('input-join-code');
  const hostConfigPanel = document.getElementById('host-config-panel');
  const btnConfirmCreate = document.getElementById('btn-confirm-create');

  // Show host configuration (recording choice) - Now a separate page
  btnCreate.addEventListener('click', () => {
    window.location.href = 'new-meeting.html';
  });

  // User input validation
  inputCode.addEventListener('input', () => {
    btnJoinFromHome.disabled = inputCode.value.trim().length < 3;
  });

  btnJoinFromHome.addEventListener('click', () => {
    const code = inputCode.value.trim();
    if(code) {
      // Direct full URL parse
      let parsedCode = code;
      if (code.includes('?code=')) {
          parsedCode = new URL(code).searchParams.get('code');
      }
      window.location.href = `legal.html?code=${parsedCode}&host=false`;
    }
  });

  // Scheduling Logic - Navigate to dedicated page
  const btnSchedule = document.getElementById('btn-schedule-meeting');
  if(btnSchedule) {
      btnSchedule.addEventListener('click', () => {
          window.location.href = 'schedule.html';
      });
  }

  // Handle returning from schedule page with a pre-filled code
  const urlParamsSchedule = new URLSearchParams(window.location.search);
  const scheduledCode = urlParamsSchedule.get('scheduledCode');
  if(scheduledCode && inputCode) {
      inputCode.value = scheduledCode;
      btnJoinFromHome.disabled = false;
  }
}



// -----------------------------------------------------
// PRE-JOIN LOBBY
// -----------------------------------------------------
function initPrejoin() {
  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get('code');
  const isHost = urlParams.get('host') === 'true';
  const recMode = urlParams.get('rec') || 'none';
  const consentGiven = urlParams.get('consent') === 'true';
  
  AppState.meetingId = codeParam;
  AppState.isHost = isHost;
  AppState.recordingMode = recMode;
  AppState.consentGiven = consentGiven;

  // Start local media preview (handled by webrtc.js listener)
  window.dispatchEvent(new CustomEvent('init-local-media'));
  
  const idDisplay = document.getElementById('prejoin-meeting-id');
  if (codeParam) {
    idDisplay.textContent = `Meeting ID: ${codeParam}`;
  } else {
    idDisplay.textContent = `Meeting ID: Generating...`;
  }

  // Bind Buttons
  const btnJoin = document.getElementById('btn-join-meeting');
  const inputName = document.getElementById('input-username');
  
  inputName.addEventListener('input', () => {
    btnJoin.disabled = inputName.value.trim().length === 0;
  });

  btnJoin.onclick = () => {
    AppState.username = inputName.value.trim();
    if(AppState.username) {
       window.location.href = `meeting.html?code=${AppState.meetingId}&name=${encodeURIComponent(AppState.username)}&host=${AppState.isHost}&rec=${AppState.recordingMode}&consent=${AppState.consentGiven}`;
    }
  };

  document.getElementById('btn-cancel-join').onclick = () => {
    window.location.href = 'index.html'; 
  };

  // Prejoin MIC AND CAM TOGGLES
  const btnPrejoinMic = document.getElementById('btn-prejoin-mic');
  const btnPrejoinCam = document.getElementById('btn-prejoin-cam');
  
  if (btnPrejoinMic) {
      btnPrejoinMic.addEventListener('click', () => {
          AppState.micEnabled = !AppState.micEnabled;
          updateControlUI(btnPrejoinMic, AppState.micEnabled, 'fa-microphone', 'fa-microphone-slash');
          window.dispatchEvent(new CustomEvent('toggle-mic', { detail: { state: AppState.micEnabled }}));
      });
  }

  if (btnPrejoinCam) {
      btnPrejoinCam.addEventListener('click', () => {
          AppState.camEnabled = !AppState.camEnabled;
          updateControlUI(btnPrejoinCam, AppState.camEnabled, 'fa-video', 'fa-video-slash');
          window.dispatchEvent(new CustomEvent('toggle-cam', { detail: { state: AppState.camEnabled }}));
          
          const videoEl = document.getElementById('prejoin-video');
          const camOffEl = document.getElementById('prejoin-camera-off');
          if(AppState.camEnabled) {
              if(videoEl) videoEl.classList.remove('hidden');
              if(camOffEl) camOffEl.classList.add('hidden');
          } else {
              if(videoEl) videoEl.classList.add('hidden');
              if(camOffEl) camOffEl.classList.remove('hidden');
          }
      });
  }
}

// -----------------------------------------------------
// MEETING VIEW
// -----------------------------------------------------
function initMeeting() {
  const urlParams = new URLSearchParams(window.location.search);
  AppState.meetingId = urlParams.get('code');
  AppState.username = urlParams.get('name');
  AppState.isHost = urlParams.get('host') === 'true';
  AppState.recordingMode = urlParams.get('rec') || 'none';
  AppState.consentGiven = urlParams.get('consent') === 'true';

  // Initialize local camera/mic FIRST, then join the room
  window.addEventListener('local-media-ready', () => {
    // Fire event for WebRTC logic to connect to socket server
    window.dispatchEvent(new CustomEvent('join-room', {
      detail: { 
        username: AppState.username,
        meetingId: AppState.meetingId,
        consent: AppState.consentGiven,
        isHost: AppState.isHost,
        recordingMode: AppState.recordingMode
      }
    }));
  }, { once: true });

  // Request camera & mic access
  window.dispatchEvent(new CustomEvent('init-local-media'));

  bindMeetingControls();
}

function bindMeetingControls() {
  const btnMic = document.getElementById('btn-toggle-mic');
  const btnCam = document.getElementById('btn-toggle-cam');
  const btnLeave = document.getElementById('btn-leave-call');

  if(btnMic) {
    btnMic.addEventListener('click', () => {
      AppState.micEnabled = !AppState.micEnabled;
      updateControlUI(btnMic, AppState.micEnabled, 'fa-microphone', 'fa-microphone-slash');
      window.dispatchEvent(new CustomEvent('toggle-mic', { detail: { state: AppState.micEnabled }}));
    });
  }

  if(btnCam) {
    btnCam.addEventListener('click', () => {
      AppState.camEnabled = !AppState.camEnabled;
      updateControlUI(btnCam, AppState.camEnabled, 'fa-video', 'fa-video-slash');
      window.dispatchEvent(new CustomEvent('toggle-cam', { detail: { state: AppState.camEnabled }}));
    });
  }

  if(btnLeave) {
    btnLeave.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }

  // Screen Share Toggle (HTML id is btn-toggle-screen)
  const btnShare = document.getElementById('btn-toggle-screen');
  let isSharing = false;
  if(btnShare) {
    btnShare.addEventListener('click', () => {
         window.dispatchEvent(new CustomEvent('toggle-screen-share', {
              detail: { 
                   callback: (success) => {
                        if(success) {
                            isSharing = !isSharing;
                            if(isSharing) {
                                btnShare.classList.add('active');
                            } else {
                                btnShare.classList.remove('active');
                            }
                        }
                   }
              }
         }));
    });

    window.addEventListener('screen-share-stopped', () => {
         isSharing = false;
         btnShare.classList.remove('active');
    });
  }

  // Sidebar Toggles
  const btnChat = document.getElementById('btn-show-chat');
  const btnDetails = document.getElementById('btn-show-details');
  const btnParticipants = document.getElementById('btn-show-participants');
  
  const sidebars = {
    'chat': { btn: btnChat, panel: 'panel-chat', title: 'Stream Messages' },
    'participants': { btn: btnParticipants, panel: 'panel-participants', title: 'People' },
    'details': { btn: btnDetails, panel: 'panel-details', title: 'Meeting Details' }
  };

  const toggleSidebar = (key) => {
    const sidebarContainer = document.getElementById('sidebar-container');
    
    // Deactivate all
    Object.keys(sidebars).forEach(k => {
      if(sidebars[k].btn) sidebars[k].btn.classList.remove('active-panel');
      const panel = document.getElementById(sidebars[k].panel);
      if(panel) panel.classList.remove('active-panel-view');
    });

    if (AppState.activeSidebar === key) {
      // Close sidebar
      sidebarContainer.classList.add('hidden', 'translate-x-full');
      sidebarContainer.classList.remove('md:relative', 'md:translate-x-0');
      AppState.activeSidebar = null;
    } else {
      // Open specifically
      AppState.activeSidebar = key;
      sidebarContainer.classList.remove('hidden', 'translate-x-full');
      sidebarContainer.classList.add('md:relative', 'md:translate-x-0');
      if(sidebars[key].btn) sidebars[key].btn.classList.add('active-panel');
      const panel = document.getElementById(sidebars[key].panel);
      if(panel) panel.classList.add('active-panel-view');
      document.getElementById('sidebar-title').textContent = sidebars[key].title;

      if(key === 'chat') {
        const unreadBadge = document.getElementById('badge-chat-unread');
        if(unreadBadge) unreadBadge.classList.add('hidden');
        setTimeout(() => {
          const chatInput = document.getElementById('chat-input');
          if(chatInput) chatInput.focus();
        }, 100);
      }
    }
    
    // Re-layout grid
    window.dispatchEvent(new CustomEvent('grid-resize'));
  };

  if(btnChat) btnChat.addEventListener('click', () => toggleSidebar('chat'));
  if(btnDetails) btnDetails.addEventListener('click', () => toggleSidebar('details'));
  if(btnParticipants) btnParticipants.addEventListener('click', () => toggleSidebar('participants'));
  
  const btnCloseSidebar = document.getElementById('btn-close-sidebar');
  if(btnCloseSidebar) {
    btnCloseSidebar.addEventListener('click', () => {
      if(AppState.activeSidebar) toggleSidebar(AppState.activeSidebar);
    });
  }

  // Whiteboard Toggle
  const whiteboardTriggers = document.querySelectorAll('.btn-drawing-board-trigger');
  const whiteboardContainer = document.getElementById('whiteboard-container');
  const btnCloseWhiteboard = document.getElementById('btn-close-whiteboard');

  whiteboardTriggers.forEach(btn => {
      btn.addEventListener('click', (e) => {
           e.preventDefault();
           if(whiteboardContainer) {
             whiteboardContainer.classList.remove('hidden');
             whiteboardContainer.classList.add('flex');
           }
           
           // Hide dropdowns if they are open
           const openDropdowns = document.querySelectorAll('.dropdown-menu');
           openDropdowns.forEach(dd => dd.classList.add('hidden'));

           if(window.initWhiteboard) window.initWhiteboard();
           const socket = window.getSocket ? window.getSocket() : null;
           if(socket) socket.emit('whiteboard-toggle', { state: true });
      });
  });

  if(btnCloseWhiteboard) {
    btnCloseWhiteboard.addEventListener('click', () => {
         if(whiteboardContainer) {
           whiteboardContainer.classList.remove('flex');
           whiteboardContainer.classList.add('hidden');
         }
         const socket = window.getSocket ? window.getSocket() : null;
         if(socket) socket.emit('whiteboard-toggle', { state: false });
    });
  }

  // Links info (copy link in detail panel)
  const btnCopyLinkPanel = document.getElementById('btn-copy-link-panel');
  if(btnCopyLinkPanel) btnCopyLinkPanel.addEventListener('click', () => copyInfo());
}

function copyInfo() {
   const url = document.getElementById('meeting-url-display').textContent;
   navigator.clipboard.writeText(url).then(() => {
     showToast("Meeting link copied to clipboard!", "green");
   });
}

function updateControlUI(btn, isEnabled, iconOn, iconOff) {
  const icon = btn.querySelector('i');
  if (isEnabled) {
    btn.classList.remove('off');
    icon.classList.remove(iconOff);
    icon.classList.add(iconOn);
  } else {
    btn.classList.add('off');
    icon.classList.remove(iconOn);
    icon.classList.add(iconOff);
  }
}

// Helpers
window.setMeetingUrls = (id) => {
   const d1 = document.getElementById('meeting-code-display');
   const d2 = document.getElementById('footer-meeting-code');
   const d3 = document.getElementById('meeting-url-display');
   
   if(d1) d1.textContent = id;
   if(d2) d2.textContent = id;
   
   const url = `${window.location.origin}?code=${id}`;
   if(d3) d3.textContent = url;

   // Auto configure host controls if host
   if(AppState.isHost) {
      document.getElementById('host-controls-section').classList.remove('hidden');
   }
}

window.AppState = AppState;
