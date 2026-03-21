let wakeLock = null;

async function requestWakeLock() {
    if (document.visibilityState !== 'visible') return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('Wake Lock acquired.');
        wakeLock.addEventListener('release', () => {
            console.log('Wake Lock released.');
            // Re-acquire immediately if the page is still visible.
            // iOS can release the lock for reasons other than tab switching.
            if (document.visibilityState === 'visible') {
                requestWakeLock();
            }
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
