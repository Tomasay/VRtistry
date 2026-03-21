let wakeLock = null;

async function requestWakeLock() {
    if (document.visibilityState !== 'visible') return;
    if (wakeLock !== null) return; // already held
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('Wake Lock acquired.');
        wakeLock.addEventListener('release', () => {
            wakeLock = null;
            console.log('Wake Lock released.');
            // Re-acquire immediately if the page is still visible.
            // iOS can release the lock for reasons other than tab switching.
            if (document.visibilityState === 'visible') {
                requestWakeLock();
            }
        });
    } catch (err) {
        console.warn('Wake Lock request failed:', err.name, err.message);
    }
}

// Re-acquire when returning to the tab
/*
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        requestWakeLock();
    }
});
*/

// iOS Safari may reject the lock without prior user interaction — retry on first touch
document.addEventListener('touchstart', requestWakeLock, { once: true });

// Initial attempt (works on most browsers without a gesture)
//requestWakeLock();
