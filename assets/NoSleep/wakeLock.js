let wakeLock = null;

async function requestWakeLock() {
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('Wake Lock acquired.');
        wakeLock.addEventListener('release', () => {
            console.log('Wake Lock released.');
        });
    } catch (err) {
        console.warn('Wake Lock request failed:', err);
    }
}

// Re-acquire whenever the tab becomes visible (browser releases it automatically on hide)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        requestWakeLock();
    }
});

// Initial acquisition — no user gesture required for the Wake Lock API
requestWakeLock();
