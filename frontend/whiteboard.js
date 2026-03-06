/**
 * whiteboard.js - Handles Whiteboard Canvas and drawing capabilities
 */

let canvas, ctx;
let drawing = false;
let currentSettings = {
    color: 'black',
    lineWidth: 3
};

function initWhiteboard() {
    canvas = document.getElementById('whiteboard-canvas');
    if (!canvas) return;

    ctx = canvas.getContext('2d');
    
    // Set actual canvas size dynamically
    const resizeCanvas = () => {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        // Subtract toolbar height roughly
        canvas.height = rect.height - 56; 
    };
    window.addEventListener('resize', resizeCanvas);
    
    // Bind Tools
    const toolbarColors = {
        'btn-color-black': 'black',
        'btn-color-red': '#ef4444',
        'btn-color-blue': '#3b82f6',
        'btn-color-green': '#22c55e'
    };
    
    const allTools = [...Object.keys(toolbarColors), 'btn-tool-eraser'];
    
    const resetToolUI = () => {
        allTools.forEach(id => {
            document.getElementById(id).classList.remove('ring-2', 'ring-offset-2', 'ring-brand');
        });
    };

    Object.keys(toolbarColors).forEach(id => {
        document.getElementById(id).addEventListener('click', () => {
            currentSettings.color = toolbarColors[id];
            currentSettings.lineWidth = 3;
            resetToolUI();
            document.getElementById(id).classList.add('ring-2', 'ring-offset-2', 'ring-brand');
        });
    });

    document.getElementById('btn-tool-eraser').addEventListener('click', () => {
        currentSettings.color = '#f1f3f4'; // Match whiteboard background
        currentSettings.lineWidth = 20;
        resetToolUI();
        document.getElementById('btn-tool-eraser').classList.add('ring-2', 'ring-offset-2', 'ring-brand');
    });

    document.getElementById('btn-clear-board').addEventListener('click', () => {
        clearLocalBoard();
        if(window.getSocket() && window.AppState?.meetingId) {
            window.getSocket().emit('wb-clear', { meetingId: window.AppState.meetingId });
        }
    });

    // Drawing Events
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const startDraw = (e) => {
        drawing = true;
        const pos = getPos(e);
        draw(pos.x, pos.y, pos.x, pos.y, currentSettings.color, currentSettings.lineWidth, true);
    };

    const stopDraw = () => {
        drawing = false;
        ctx.beginPath(); // Create new path so next draw doesn't connect
    };

    const drawMove = (e) => {
        if (!drawing) return;
        e.preventDefault(); // Prevent scrolling on touch
        const pos = getPos(e);
        
        ctx.lineWidth = currentSettings.lineWidth;
        ctx.lineCap = 'round';
        ctx.strokeStyle = currentSettings.color;

        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        
        // Emit Socket Event
        if(window.getSocket() && window.AppState?.meetingId) {
            window.getSocket().emit('wb-draw', {
                meetingId: window.AppState.meetingId,
                x: pos.x / canvas.width,    // Send as normalized percentages to handle window resizing
                y: pos.y / canvas.height,
                color: currentSettings.color,
                size: currentSettings.lineWidth
            });
        }
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', drawMove);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseout', stopDraw);
    
    // touch support
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', drawMove, { passive: false });
    canvas.addEventListener('touchend', stopDraw);

    // Initial resize
    setTimeout(resizeCanvas, 0);
}

function draw(x, y, px, py, color, size, isEmit = false) {
    if (!ctx) return;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
}

function clearLocalBoard() {
    if(!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Global hooks for socket events (bound in signaling/webrtc logic elsewhere usually)
window.handleNetworkDraw = (data) => {
    if(!ctx) return;
    const realX = data.x * canvas.width;
    const realY = data.y * canvas.height;
    
    ctx.lineWidth = data.size;
    ctx.lineCap = 'round';
    ctx.strokeStyle = data.color;

    ctx.lineTo(realX, realY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(realX, realY);
};

window.handleNetworkClear = () => {
    clearLocalBoard();
};
