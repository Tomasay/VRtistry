let wakeLock = null;

async function requestWakeLock() {
    if (document.visibilityState !== 'visible') return;
    if (wakeLock !== null) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
            wakeLock = null;
            if (document.visibilityState === 'visible') {
                setTimeout(requestWakeLock, 200);
            }
        });
    } catch (err) {
        wakeLock = null;
        console.warn('Wake Lock failed:', err.name, err.message);
    }
}

// Expose globally so index.html can call it from the canvas touchend handler
window.requestWakeLock = requestWakeLock;

// Re-acquire when returning to the tab
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        setTimeout(requestWakeLock, 200);
    }
});

// Initial attempt on load
requestWakeLock();
