let wakeLock = null;

// --- Video fallback for PWA/Home Screen mode on iOS < 18.4 ---
// WebKit bug #254545: navigator.wakeLock silently fails when the page is launched
// from the home screen (standalone mode) on iOS 16.4–18.3. Fixed in iOS 18.4.
// The video trick is the only reliable workaround for that case.
let videoFallback = null;

function isStandalonePWA() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
}

function startVideoFallback() {
    if (videoFallback) return;

    videoFallback = document.createElement('video');
    videoFallback.setAttribute('playsinline', '');
    videoFallback.setAttribute('muted', '');
    videoFallback.setAttribute('loop', '');
    videoFallback.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';

    // Minimal 1-frame silent MP4 — keeps the iOS media session active
    const src = document.createElement('source');
    src.src = 'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJtcDQxaXNvbWF2YzEAAAAIZnJlZQAAAs1tZGF0AAACoAYF//+c3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE0MiByMjQ3OSBkZDc5YTYxIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxNCAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTAgcmVmPTEgZGVibG9jaz0wOjA6MCBhbmFseXNlPTB4MToweDExMSBtZT1oZXggc3VibWU9MyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0wIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MiBlaWdodHg4ZGN0PTAgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz02IGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9MCByYz1jcmYgbWJ0cmVlPTAgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IHZidl9tYXhyYXRlPTAgdmJ2X2J1ZnNpemU9MCBjcmZfbWF4PTAuMCBuYWxfaHJkPW5vbmUgZmlsbGVyPTAgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAA9liIQL8mKAAosBzgABkAAAABZBmiRsQ//+qZYADLgAEBAAAAwBnh42Q///';
    src.type = 'video/mp4';
    videoFallback.appendChild(src);

    document.body.appendChild(videoFallback);
    videoFallback.play().catch(() => {
        // Will retry on first user touch below
    });
}

function stopVideoFallback() {
    if (!videoFallback) return;
    videoFallback.pause();
    videoFallback.remove();
    videoFallback = null;
}

// --- Screen Wake Lock API ---

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) {
        // Browser doesn't support the API at all — go straight to video fallback
        startVideoFallback();
        return;
    }
    if (document.visibilityState !== 'visible') return;
    if (wakeLock !== null) return;

    try {
        wakeLock = await navigator.wakeLock.request('screen');
        stopVideoFallback(); // Lock acquired — video fallback not needed
        wakeLock.addEventListener('release', () => {
            wakeLock = null;
            if (document.visibilityState === 'visible') {
                // Delay required: iOS Safari throws NotAllowedError if you re-request
                // synchronously — the document isn't fully "active" yet (WebKit race condition)
                setTimeout(requestWakeLock, 200);
            }
        });
    } catch (err) {
        wakeLock = null;
        if (err.name === 'NotAllowedError') {
            // Can happen in PWA mode on iOS < 18.4, or when Low Power Mode is on.
            // Fall back to video trick.
            console.warn('Wake Lock denied — starting video fallback:', err.message);
            startVideoFallback();
        } else {
            console.warn('Wake Lock request failed:', err.name, err.message);
        }
    }
}

// Re-acquire when returning to the tab.
// Delay is required to avoid the iOS Safari NotAllowedError race condition.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        setTimeout(requestWakeLock, 200);
    }
});

// If the initial lock attempt fails silently (common on iOS before first touch),
// retry on the first user interaction.
document.addEventListener('touchstart', () => {
    if (wakeLock === null && !videoFallback) requestWakeLock();
}, { once: true });

// If running as a PWA on iOS < 18.4, skip straight to video fallback.
// The Wake Lock API is broken in standalone mode on those versions (WebKit bug #254545).
if (isStandalonePWA()) {
    startVideoFallback();
} else {
    requestWakeLock();
}
