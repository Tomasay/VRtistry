import { NoSleep } from './nosleep.js';

var noSleep = new NoSleep();

function enableNoSleep() {
    if (!noSleep.isEnabled) {
        noSleep.enable().catch((err) => {
            console.warn('NoSleep enable failed:', err);
        });
    }
}

// Must be triggered by a real user gesture on iOS — DOMContentLoaded/programmatic
// clicks are rejected by Safari for both video.play() and navigator.wakeLock.request().
document.addEventListener('touchstart', enableNoSleep, { once: true });
document.addEventListener('click', enableNoSleep, { once: true });

// Re-acquire wake lock when tab becomes visible again (e.g. user switches back).
// At this point a wake lock was previously active so the browser permits it.
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && noSleep.isEnabled) {
        noSleep.enable().catch((err) => {
            console.warn('NoSleep re-enable failed:', err);
        });
    }
});