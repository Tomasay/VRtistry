// On-device WebGPU diagnostics for iOS Safari, where there is no console without a Mac.
//
// Enable by adding &debug=1 to the URL, e.g.
//   https://vrtistry.app/Testing/?partyCode=test&debug=1
//
// Must load BEFORE Template/app.js so the WebGPU patches are in place before Unity
// requests its adapter and device.
//
// What it captures:
//   - the GPU adapter's identity and the limits Safari actually reports on the device
//   - every WebGPU validation error, via the device's `uncapturederror` event, which
//     carries a far more specific message than the exception Unity surfaces
//   - the full attachment descriptor of any beginRenderPass that throws: format,
//     sample count, size and usage of every colour/depth target involved
(function () {
    if (!/[?&]debug=1\b/.test(location.search)) return;

    var MAX_LINES = 400;
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

    var COLORS = { error: '#ff8a80', warn: '#ffd54f', gpu: '#8ab4f8', sys: '#a5d6a7', log: '#d8d8d8' };

    function log(kind, text) {
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

    // ---- console + uncaught errors -------------------------------------------------

    ['log', 'warn', 'error'].forEach(function (name) {
        var original = console[name];
        console[name] = function () {
            var kind = name === 'log' ? 'log' : name;
            log(kind, Array.prototype.map.call(arguments, describe).join(' '));
            return original.apply(console, arguments);
        };
    });

    window.addEventListener('error', function (e) {
        log('error', (e.message || 'error') + (e.filename ? '  @ ' + e.filename + ':' + e.lineno : ''));
        if (e.error && e.error.stack) log('error', e.error.stack);
    });

    window.addEventListener('unhandledrejection', function (e) {
        log('error', 'unhandled rejection: ' + describe(e.reason));
    });

    // ---- WebGPU ---------------------------------------------------------------------

    if (!navigator.gpu) { log('sys', 'navigator.gpu is undefined - no WebGPU on this browser'); }
    else {
        // Textures do not expose themselves through their views, so remember the parent.
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

        function dumpPass(descriptor) {
            log('gpu', 'failing pass label: ' + (descriptor && descriptor.label || 'none'));
            var colors = (descriptor && descriptor.colorAttachments) || [];
            for (var i = 0; i < colors.length; i++) {
                var a = colors[i];
                if (!a) { log('gpu', '  color[' + i + '] = null'); continue; }
                log('gpu', '  color[' + i + '] ' + textureInfo(a.view) +
                    ' load=' + a.loadOp + ' store=' + a.storeOp);
                if (a.resolveTarget) log('gpu', '    resolve -> ' + textureInfo(a.resolveTarget));
            }
            var d = descriptor && descriptor.depthStencilAttachment;
            if (d) {
                log('gpu', '  depth ' + textureInfo(d.view) +
                    ' depthLoad=' + d.depthLoadOp + ' depthStore=' + d.depthStoreOp +
                    ' depthReadOnly=' + d.depthReadOnly +
                    ' stencilLoad=' + d.stencilLoadOp + ' stencilStore=' + d.stencilStoreOp +
                    ' stencilReadOnly=' + d.stencilReadOnly);
            }
            if (descriptor && descriptor.maxDrawCount != null) log('gpu', '  maxDrawCount=' + descriptor.maxDrawCount);
        }

        var beginRenderPass = GPUCommandEncoder.prototype.beginRenderPass;
        var alreadyDumped = false;
        GPUCommandEncoder.prototype.beginRenderPass = function (descriptor) {
            try {
                return beginRenderPass.call(this, descriptor);
            } catch (err) {
                // One dump is enough - this would otherwise fire every frame.
                if (!alreadyDumped) {
                    alreadyDumped = true;
                    log('error', 'beginRenderPass threw: ' + describe(err));
                    try { dumpPass(descriptor); } catch (e) { log('error', 'descriptor dump failed: ' + describe(e)); }
                }
                throw err;
            }
        };

        var requestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
        navigator.gpu.requestAdapter = function () {
            return requestAdapter.apply(null, arguments).then(function (adapter) {
                if (!adapter) { log('error', 'requestAdapter returned null'); return adapter; }
                var info = adapter.info || {};
                log('gpu', 'adapter: vendor=' + (info.vendor || '?') + ' architecture=' + (info.architecture || '?') +
                    ' device=' + (info.device || '?') + ' description=' + (info.description || '?'));
                log('gpu', 'preferred canvas format: ' + navigator.gpu.getPreferredCanvasFormat());
                try {
                    var interesting = ['maxTextureDimension2D', 'maxColorAttachmentBytesPerSample',
                        'maxColorAttachments', 'maxBufferSize', 'maxStorageBufferBindingSize',
                        'maxBindGroups', 'maxSampledTexturesPerShaderStage'];
                    interesting.forEach(function (k) { log('gpu', '  limit ' + k + ' = ' + adapter.limits[k]); });
                    log('gpu', '  features: ' + Array.from(adapter.features).join(', '));
                } catch (e) { log('warn', 'could not read adapter limits: ' + describe(e)); }

                var requestDevice = adapter.requestDevice.bind(adapter);
                adapter.requestDevice = function (desc) {
                    if (desc) log('gpu', 'requestDevice features: ' + JSON.stringify(desc.requiredFeatures || []));
                    return requestDevice(desc).then(function (device) {
                        log('gpu', 'device created');
                        device.addEventListener('uncapturederror', function (e) {
                            // This is the message worth reading - far more specific than
                            // the exception Unity reports.
                            log('error', 'WebGPU ' + (e.error && e.error.constructor ? e.error.constructor.name : 'error') +
                                ': ' + (e.error && e.error.message));
                        });
                        device.lost.then(function (reason) {
                            log('error', 'DEVICE LOST: ' + reason.reason + ' - ' + reason.message);
                        });
                        return device;
                    });
                };
                return adapter;
            });
        };
    }

    if (document.body) build();
    else document.addEventListener('DOMContentLoaded', build);

    log('sys', 'gpu-debug active | ' + navigator.userAgent);
    log('sys', 'screen ' + screen.width + 'x' + screen.height + ' dpr=' + window.devicePixelRatio +
        ' inner ' + window.innerWidth + 'x' + window.innerHeight);
})();
