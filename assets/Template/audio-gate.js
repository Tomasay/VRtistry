// Unity's WebGL audio backend polls AudioContext.resume() on a 400 ms interval until
// the context is running. Browsers refuse to start audio before a user gesture and log
// an autoplay warning for every attempt, so a player who spends ten seconds typing a
// name lands in the game with dozens of identical warnings already in the console.
//
// Gate the polling rather than the audio: while the page has no user activation the
// resume() could not have succeeded anyway, so answer it with a resolved promise. The
// first genuine gesture opens the gate and Unity's next poll (<=400 ms later) starts
// audio exactly as it would have.
(function () {
    var ctors = [window.AudioContext, window.webkitAudioContext].filter(Boolean);
    if (!ctors.length) return;

    var GESTURES = ['pointerdown', 'pointerup', 'mousedown', 'keydown', 'touchstart', 'touchend', 'click'];
    var gestured = false;

    function onGesture() {
        gestured = true;
        GESTURES.forEach(function (type) {
            window.removeEventListener(type, onGesture, true);
        });
    }
    GESTURES.forEach(function (type) {
        window.addEventListener(type, onGesture, { capture: true, passive: true });
    });

    function activated() {
        // Chrome and Safari expose sticky activation directly; older browsers fall back
        // to the listeners above, which see the gesture before Unity's own handlers do.
        if (gestured) return true;
        return !!(navigator.userActivation && navigator.userActivation.hasBeenActive);
    }

    ctors.forEach(function (Ctor) {
        var proto = Ctor.prototype;
        if (!proto || !proto.resume || proto.resume.gatedByAudioGate) return;

        var resume = proto.resume;
        function gatedResume() {
            if (this.state === 'suspended' && !activated()) return Promise.resolve();
            return resume.apply(this, arguments);
        }
        gatedResume.gatedByAudioGate = true;
        proto.resume = gatedResume;
    });
})();
