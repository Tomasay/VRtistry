// On-device WebGPU diagnostics for iOS Safari, where there is no console without a Mac.
//
// Enable by adding &debug=1 to the URL, e.g.
//   https://vrtistry.app/Testing/?partyCode=test&debug=1
//
// Must load BEFORE Template/app.js so the WebGPU patches are in place before Unity
// requests its adapter and device.
//
// This build is aimed at one question: the device is being lost with reason
// "destroyed" partway through startup, and everything downstream (the failing
// beginRenderPass) is fallout. So it tracks device identity end to end, logs a stack
// trace for whoever calls destroy(), tallies GPU memory as it is allocated, and notes
// anything that would make the browser drop the device on its own.
(function () {
    if (!/[?&]debug=1\b/.test(location.search)) return;

    var MAX_LINES = 600;
    var lines = [];
    var panel, body;

    function build() {
        panel = document.createElement('div');
        panel.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:45%;z-index:2147483647;' +
            'background:rgba(0,0,0,.88);color:#d8d8d8;font:10px/1.35 ui-monospace,Menlo,Consolas,monospace;' +
            'display:flex;flex-direction:column;border-top:1px solid #444';

        var bar = document.createElement('div');
        bar.style.cssText = 'flex:0 0 auto;display:flex;gap:6px;padding:4px 6px;background:#151515;' +
            'border-bottom:1px solid #333;align-items:center';
        bar.innerHTML = '<span style="color:#8ab4f8;font-weight:600">GPU debug</span>';

        function button(label, onClick) {
            var b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = 'font:10px/1 inherit;padding:4px 8px;background:#2a2a2a;color:#ddd;' +
                'border:1px solid #444;border-radius:4px';
            b.addEventListener('click', onClick);
            bar.appendChild(b);
            return b;
        }

        button('Copy', function () {
            var text = lines.join('\n');
            if (navigator.clipboard) navigator.clipboard.writeText(text).then(
                function () { log('sys', 'log copied to clipboard'); },
                function () { log('sys', 'clipboard blocked - select the text manually'); });
        });
        button('Clear', function () { lines.length = 0; body.textContent = ''; });
        button('Hide', function () { panel.style.height = panel.style.height === '18px' ? '45%' : '18px'; });

        body = document.createElement('div');
        body.style.cssText = 'flex:1 1 auto;overflow:auto;padding:4px 6px;white-space:pre-wrap;' +
            'word-break:break-word;-webkit-user-select:text;user-select:text';

        panel.appendChild(bar);
        panel.appendChild(body);
        document.body.appendChild(panel);
    }

    var rawLog = console.log.bind(console);

    var COLORS = { error: '#ff8a80', warn: '#ffd54f', gpu: '#8ab4f8', mem: '#ce93d8', sys: '#a5d6a7', log: '#d8d8d8' };

    function log(kind, text) {
        rawLog('[gpu-debug] ' + text);
        push(kind, text);
    }

    function push(kind, text) {
        var stamp = (performance.now() / 1000).toFixed(2);
        var line = stamp + ' [' + kind + '] ' + text;
        lines.push(line);
        if (lines.length > MAX_LINES) lines.shift();
        if (!body) return;
        var el = document.createElement('div');
        el.textContent = line;
        el.style.color = COLORS[kind] || COLORS.log;
        body.appendChild(el);
        while (body.childNodes.length > MAX_LINES) body.removeChild(body.firstChild);
        body.scrollTop = body.scrollHeight;
    }

    function describe(value) {
        if (value instanceof Error) return value.name + ': ' + value.message;
        if (typeof value === 'string') return value;
        try { return JSON.stringify(value); } catch (e) { return String(value); }
    }

    function mb(bytes) { return (bytes / 1048576).toFixed(1) + 'MB'; }

    // ---- console + uncaught errors -------------------------------------------------

    ['log', 'warn', 'error'].forEach(function (name) {
        var original = console[name];
        console[name] = function () {
            push(name === 'log' ? 'log' : name, Array.prototype.map.call(arguments, describe).join(' '));
            return original.apply(console, arguments);
        };
    });

    window.addEventListener('error', function (e) {
        log('error', (e.message || 'error') + (e.filename ? '  @ ' + e.filename + ':' + e.lineno : ''));
    });

    window.addEventListener('unhandledrejection', function (e) {
        log('error', 'unhandled rejection: ' + describe(e.reason));
    });

    // The browser drops the GPU device when a page is backgrounded or frozen. Log these
    // so a device loss can be attributed to them rather than to memory or to Unity.
    document.addEventListener('visibilitychange', function () { log('sys', 'visibility -> ' + document.visibilityState); });
    window.addEventListener('pagehide', function () { log('sys', 'pagehide'); });
    window.addEventListener('pageshow', function () { log('sys', 'pageshow'); });
    window.addEventListener('freeze', function () { log('sys', 'freeze'); });
    window.addEventListener('resume', function () { log('sys', 'resume'); });

    // ---- WebGPU ---------------------------------------------------------------------

    if (!navigator.gpu) { log('sys', 'navigator.gpu is undefined - no WebGPU on this browser'); }
    else {
        var deviceSeq = 0;
        var deviceIds = new WeakMap();
        function idOf(device) {
            if (!device) return 'none';
            return deviceIds.has(device) ? ('device#' + deviceIds.get(device)) : 'device#UNTRACKED';
        }

        // ---- allocation tally -------------------------------------------------------
        // Approximate, but enough to see the trajectory and spot a single huge request.
        var BYTES = {
            r8unorm: 1, r8snorm: 1, r8uint: 1, r8sint: 1, stencil8: 1,
            r16uint: 2, r16sint: 2, r16float: 2, rg8unorm: 2, rg8snorm: 2, rg8uint: 2, rg8sint: 2, depth16unorm: 2,
            r32float: 4, r32uint: 4, r32sint: 4, rg16uint: 4, rg16sint: 4, rg16float: 4,
            rgba8unorm: 4, 'rgba8unorm-srgb': 4, rgba8snorm: 4, rgba8uint: 4, rgba8sint: 4,
            bgra8unorm: 4, 'bgra8unorm-srgb': 4, rgb10a2unorm: 4, rg11b10ufloat: 4, rgb9e5ufloat: 4,
            depth24plus: 4, 'depth24plus-stencil8': 4, depth32float: 4,
            rg32float: 8, rg32uint: 8, rg32sint: 8, rgba16uint: 8, rgba16sint: 8, rgba16float: 8,
            'depth32float-stencil8': 8,
            rgba32float: 16, rgba32uint: 16, rgba32sint: 16
        };

        var textureBytes = 0, bufferBytes = 0, textureCount = 0, bufferCount = 0;
        var nextReportAt = 64 * 1048576;

        function tally(kind, bytes, label) {
            if (kind === 'texture') { textureBytes += bytes; textureCount++; }
            else { bufferBytes += bytes; bufferCount++; }
            if (bytes >= 8 * 1048576) log('mem', 'large ' + kind + ' ' + mb(bytes) + '  ' + (label || 'unlabelled'));
            var total = textureBytes + bufferBytes;
            if (total >= nextReportAt) {
                log('mem', 'gpu total ' + mb(total) + '  (textures ' + mb(textureBytes) + ' x' + textureCount +
                    ', buffers ' + mb(bufferBytes) + ' x' + bufferCount + ')');
                while (nextReportAt <= total) nextReportAt += 64 * 1048576;
            }
        }

        function tallySummary() {
            return 'gpu allocated ' + mb(textureBytes + bufferBytes) +
                '  (textures ' + mb(textureBytes) + ' x' + textureCount +
                ', buffers ' + mb(bufferBytes) + ' x' + bufferCount + ')';
        }

        var createTexture = GPUDevice.prototype.createTexture;
        GPUDevice.prototype.createTexture = function (desc) {
            try {
                var t = createTexture.apply(this, arguments);
                var size = desc.size || {};
                var w = size.width != null ? size.width : (size[0] || 1);
                var h = size.height != null ? size.height : (size[1] || 1);
                var d = size.depthOrArrayLayers != null ? size.depthOrArrayLayers : (size[2] || 1);
                var per = BYTES[desc.format] != null ? BYTES[desc.format] : 1;
                var mips = desc.mipLevelCount > 1 ? 1.34 : 1;
                tally('texture', w * h * d * per * mips * (desc.sampleCount || 1), desc.label ||
                    (w + 'x' + h + ' ' + desc.format));
                return t;
            } catch (err) {
                log('error', 'createTexture FAILED (' + describe(err) + ') for ' + JSON.stringify(desc.size) + ' ' + desc.format);
                throw err;
            }
        };

        var createBuffer = GPUDevice.prototype.createBuffer;
        GPUDevice.prototype.createBuffer = function (desc) {
            try {
                var b = createBuffer.apply(this, arguments);
                tally('buffer', desc.size || 0, desc.label);
                return b;
            } catch (err) {
                log('error', 'createBuffer FAILED (' + describe(err) + ') size=' + desc.size);
                throw err;
            }
        };

        // ---- who destroys the device? -----------------------------------------------

        var destroy = GPUDevice.prototype.destroy;
        GPUDevice.prototype.destroy = function () {
            log('error', 'device.destroy() called on ' + idOf(this));
            log('error', '  ' + tallySummary());
            var stack = (new Error()).stack || '(no stack)';
            // Trim to the frames that identify the caller - Unity's wasm frames are the
            // interesting part, and the full trace is enormous.
            log('error', '  called from:\n' + stack.split('\n').slice(1, 12).join('\n'));
            return destroy.apply(this, arguments);
        };

        // ---- textures do not expose themselves through their views ------------------

        var createView = GPUTexture.prototype.createView;
        GPUTexture.prototype.createView = function () {
            var view = createView.apply(this, arguments);
            try { view.__sourceTexture = this; } catch (e) { /* frozen view - skip */ }
            return view;
        };

        function textureInfo(view) {
            if (!view) return 'none';
            var t = view.__sourceTexture;
            if (!t) return 'view(unknown texture)';
            return (t.label || 'unlabelled') + ' ' + t.width + 'x' + t.height +
                ' ' + t.format + ' samples=' + t.sampleCount + ' mips=' + t.mipLevelCount +
                ' layers=' + t.depthOrArrayLayers + ' usage=0x' + t.usage.toString(16);
        }

        var beginRenderPass = GPUCommandEncoder.prototype.beginRenderPass;
        var alreadyDumped = false;
        GPUCommandEncoder.prototype.beginRenderPass = function (descriptor) {
            try {
                return beginRenderPass.call(this, descriptor);
            } catch (err) {
                if (!alreadyDumped) {
                    alreadyDumped = true;
                    log('error', 'beginRenderPass threw: ' + describe(err));
                    log('error', '  ' + tallySummary());
                    var colors = (descriptor && descriptor.colorAttachments) || [];
                    for (var i = 0; i < colors.length; i++) {
                        if (colors[i]) log('gpu', '  color[' + i + '] ' + textureInfo(colors[i].view));
                    }
                    if (descriptor && descriptor.depthStencilAttachment) {
                        log('gpu', '  depth ' + textureInfo(descriptor.depthStencilAttachment.view));
                    }
                }
                throw err;
            }
        };

        // ---- which device actually drives the canvas? --------------------------------

        if (window.GPUCanvasContext && GPUCanvasContext.prototype.configure) {
            var configure = GPUCanvasContext.prototype.configure;
            GPUCanvasContext.prototype.configure = function (config) {
                var canvas = this.canvas || {};
                log('gpu', 'canvas.configure with ' + idOf(config && config.device) +
                    ' format=' + (config && config.format) +
                    ' alphaMode=' + (config && config.alphaMode) +
                    ' canvas=' + canvas.width + 'x' + canvas.height);
                return configure.apply(this, arguments);
            };
        }

        // ---- device creation ---------------------------------------------------------

        var requestDevice = GPUAdapter.prototype.requestDevice;
        GPUAdapter.prototype.requestDevice = function (desc) {
            if (desc) log('gpu', 'requestDevice features: ' + JSON.stringify(desc.requiredFeatures || []));
            return requestDevice.apply(this, arguments).then(function (device) {
                var id = ++deviceSeq;
                deviceIds.set(device, id);
                log('gpu', 'device#' + id + ' created');
                device.addEventListener('uncapturederror', function (e) {
                    log('error', 'WebGPU error on device#' + id + ': ' + (e.error && e.error.message));
                });
                device.lost.then(function (reason) {
                    log('error', 'device#' + id + ' LOST: ' + reason.reason + ' - ' + (reason.message || '(no message)'));
                    log('error', '  ' + tallySummary());
                });
                return device;
            });
        };

        var requestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
        navigator.gpu.requestAdapter = function () {
            return requestAdapter.apply(null, arguments).then(function (adapter) {
                if (!adapter) { log('error', 'requestAdapter returned null'); return adapter; }
                var info = adapter.info || {};
                log('gpu', 'adapter: vendor=' + (info.vendor || '?') + ' device=' + (info.device || '?'));
                try {
                    ['maxTextureDimension2D', 'maxBufferSize', 'maxColorAttachmentBytesPerSample']
                        .forEach(function (k) { log('gpu', '  limit ' + k + ' = ' + adapter.limits[k]); });
                } catch (e) { /* limits unreadable - not important here */ }
                return adapter;
            });
        };

        // ---- periodic heap + gpu trace ----------------------------------------------
        // The Unity heap and the GPU tally together show whether the device died while
        // memory was climbing.
        setInterval(function () {
            var heap = '';
            try {
                var m = window.unityInstance && window.unityInstance.Module;
                if (m && m.HEAP8) heap = '  wasm heap ' + mb(m.HEAP8.length);
            } catch (e) { /* instance not up yet */ }
            log('mem', tallySummary() + heap);
        }, 1000);
    }

    if (document.body) build();
    else document.addEventListener('DOMContentLoaded', build);

    log('sys', 'gpu-debug active | ' + navigator.userAgent);
    log('sys', 'screen ' + screen.width + 'x' + screen.height + ' dpr=' + window.devicePixelRatio +
        ' inner ' + window.innerWidth + 'x' + window.innerHeight);
})();
