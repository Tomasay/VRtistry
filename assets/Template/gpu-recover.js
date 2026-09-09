// Safari's GPU process can drop the WebGPU device out from under Unity. Unity cannot
// recover from that - it halts, leaving the player on a frozen page with no way back.
// Reload once so they land in the game instead of a dead screen.
//
// Guarded three ways so a persistent failure can never loop: at most one reload per
// session, no reload while the page is unloading (the device is torn down normally
// then), and the counter resets once a session has run for a while without incident.
(function () {
    if (!navigator.gpu || !navigator.gpu.requestAdapter) return;

    var KEY = 'vrtistry.gpuReload';
    var unloading = false;
    window.addEventListener('pagehide', function () { unloading = true; });
    window.addEventListener('beforeunload', function () { unloading = true; });

    function reloadsSoFar() {
        try { return parseInt(sessionStorage.getItem(KEY) || '0', 10) || 0; } catch (e) { return 0; }
    }

    function onDeviceLost(info) {
        if (unloading) return;
        if (reloadsSoFar() >= 1) {
            console.warn('[gpu-recover] device lost again (' + info.reason + '); not reloading');
            return;
        }
        try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* private mode */ }
        console.warn('[gpu-recover] WebGPU device lost (' + info.reason + '); reloading');
        location.reload();
    }

    // Chrome ignores powerPreference on Windows and warns once for every adapter request
    // that carries it, and Unity always sends one. The hint only actually picks a GPU on
    // machines with two of them, so keep it only where the platform positively looks like
    // a Mac and nothing looks like Windows.
    //
    // Read every platform source, not just the user agent: DevTools device emulation
    // rewrites navigator.userAgent and userAgentData (to an iPhone, say) while Chrome keeps
    // warning based on the real OS, and navigator.platform still reports Win32 there.
    var platformHints = [];
    if (navigator.userAgentData && typeof navigator.userAgentData.platform === 'string')
        platformHints.push(navigator.userAgentData.platform);
    if (typeof navigator.platform === 'string') platformHints.push(navigator.platform);
    if (typeof navigator.userAgent === 'string') platformHints.push(navigator.userAgent);

    function anyHintMatches(pattern) {
        for (var i = 0; i < platformHints.length; i++) {
            if (pattern.test(platformHints[i])) return true;
        }
        return false;
    }

    // Note "like Mac OS X" in every iPhone user agent - harmless, since Safari does not
    // warn about the option and iOS has a single GPU either way.
    var keepPowerPreference = anyHintMatches(/Mac/i) && !anyHintMatches(/Win/i);

    function cleanOptions(options) {
        if (keepPowerPreference || !options || !('powerPreference' in options)) return options;
        var copy = {};
        for (var key in options) {
            if (key !== 'powerPreference') copy[key] = options[key];
        }
        return copy;
    }

    var requestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = function (options) {
        return requestAdapter(cleanOptions(options)).then(function (adapter) {
            if (!adapter) return adapter;
            var requestDevice = adapter.requestDevice.bind(adapter);
            adapter.requestDevice = function () {
                return requestDevice.apply(null, arguments).then(function (device) {
                    device.lost.then(onDeviceLost);
                    // A session that has run this long is healthy; let a later loss retry.
                    setTimeout(function () {
                        try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
                    }, 30000);
                    return device;
                });
            };
            return adapter;
        });
    };
})();
