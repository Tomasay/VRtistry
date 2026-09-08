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

    // Most of this file only observes. Two switches exist because the shader probe below
    // is NOT purely passive - getCompilationInfo() forces the browser to materialise
    // compilation results - and a build that reliably lost its GPU device stopped doing
    // so once the probe was added. These let the same page be run with the probe on and
    // off to find out whether the probe is masking the fault or the fault is flaky.
    //
    //   &probe=0     install none of the shader/pipeline/submit wrappers
    //   &compinfo=0  keep the wrappers, but never call getCompilationInfo()
    var crashed = false;
    var PROBE = !/[?&]probe=0\b/.test(location.search);
    var COMPINFO = !/[?&]compinfo=0\b/.test(location.search);

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

    // Unity prints a fixed block of allocator settings and repeats a handful of audio
    // warnings every startup. None of it varies between runs, and it makes the log
    // tedious to copy off the phone, so keep it out of the panel.
    var NOISE = /^\s*"memorysetup-|^Trying to get (length|metadata) of sound/;

    function push(kind, text) {
        if (NOISE.test(text)) return;
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

    // ---- audio -----------------------------------------------------------------------
    // Decoded audio is the one big allocation neither of the other numbers can see: it is
    // not GPU memory and it does not live in the wasm heap, it sits in the browser's Web
    // Audio memory. The tutorial narration clips are imported Decompress On Load with
    // preloading on, so they all decode to raw PCM in one burst during scene load -
    // right in the window where the device is lost.
    //
    //   &noaudio=1  skip decoding entirely and hand back a short silent buffer, so the
    //               same build can be run with and without the audio memory
    var NOAUDIO = /[?&]noaudio=1\b/.test(location.search);
    var audioCalls = 0, audioInputBytes = 0, audioPcmBytes = 0;

    function audioSummary() {
        return 'audio ' + audioCalls + ' clip(s), ' + mb(audioPcmBytes) + ' decoded PCM';
    }

    (function patchAudio() {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC || !AC.prototype.decodeAudioData) return;
        var decodeAudioData = AC.prototype.decodeAudioData;

        AC.prototype.decodeAudioData = function (data, successCb, errorCb) {
            var bytes = (data && data.byteLength) || 0;
            audioCalls++;
            audioInputBytes += bytes;

            if (NOAUDIO) {
                // Unity only needs a valid AudioBuffer back; a short silence keeps the
                // clip playable-but-empty and skips the PCM allocation completely.
                var silent = this.createBuffer(1, Math.max(1, Math.round(this.sampleRate * 0.1)), this.sampleRate);
                log('sys', 'decodeAudioData STUBBED, skipped ' + mb(bytes) + ' of encoded audio');
                if (successCb) { try { successCb(silent); } catch (e) { /* caller threw */ } }
                return Promise.resolve(silent);
            }

            var counted = false;
            function note(buf) {
                if (counted || !buf) return;
                counted = true;
                var pcm = buf.length * buf.numberOfChannels * 4;
                audioPcmBytes += pcm;
                log('mem', 'decoded audio ' + buf.duration.toFixed(1) + 's ' + buf.numberOfChannels +
                    'ch @' + buf.sampleRate + 'Hz = ' + mb(pcm) + '  (' + audioSummary() + ')');
            }

            var result = decodeAudioData.call(this, data, function (buf) {
                note(buf);
                if (successCb) successCb(buf);
            }, errorCb);

            if (result && result.then) result.then(note, function () { /* reported via errorCb */ });
            return result;
        };
    })();

    // ---- resources the texture/buffer tally cannot see --------------------------------
    // Texture and buffer totals are identical in crashing and clean runs, so whatever the
    // GPU process runs out of is something else. Count the per-frame churn instead: bind
    // groups, samplers, encoders, and the bytes pushed through the queue.
    var rBindGroup = 0, rSampler = 0, rEncoder = 0, rLayout = 0;
    var rWriteBuf = 0, rWriteBufBytes = 0, rWriteTex = 0, rWriteTexBytes = 0;

    function resourceSummary() {
        return 'bindGroups ' + rBindGroup + ', samplers ' + rSampler + ', encoders ' + rEncoder +
            ', layouts ' + rLayout +
            ', writeBuffer ' + rWriteBuf + '/' + mb(rWriteBufBytes) +
            ', writeTexture ' + rWriteTex + '/' + mb(rWriteTexBytes);
    }

    (function countResources() {
        if (!window.GPUDevice) return;
        function wrap(proto, name, onCall) {
            if (!proto || !proto[name]) return;
            var original = proto[name];
            proto[name] = function () {
                try { onCall.apply(null, arguments); } catch (e) { /* counting must never throw */ }
                return original.apply(this, arguments);
            };
        }
        wrap(GPUDevice.prototype, 'createBindGroup', function () { rBindGroup++; });
        wrap(GPUDevice.prototype, 'createBindGroupLayout', function () { rLayout++; });
        wrap(GPUDevice.prototype, 'createSampler', function () { rSampler++; });
        wrap(GPUDevice.prototype, 'createCommandEncoder', function () { rEncoder++; });
        if (window.GPUQueue) {
            wrap(GPUQueue.prototype, 'writeBuffer', function (buf, off, data, dOff, size) {
                rWriteBuf++;
                var n = size != null ? size : (data && (data.byteLength || data.length)) || 0;
                rWriteBufBytes += n;
            });
            wrap(GPUQueue.prototype, 'writeTexture', function (dst, data, layout, size) {
                rWriteTex++;
                // Unity hands in a view over the whole wasm heap, so data.byteLength is the
                // heap size, not the upload. The real volume is the described region.
                var bpr = (layout && layout.bytesPerRow) || 0;
                var rows = (layout && layout.rowsPerImage) ||
                    (size && (size.height != null ? size.height : size[1])) || 1;
                var depth = (size && (size.depthOrArrayLayers != null ? size.depthOrArrayLayers : size[2])) || 1;
                rWriteTexBytes += bpr * rows * depth;
                if (bpr * rows * depth >= 2 * 1048576) {
                    log('mem', 'large texture upload ' + mb(bpr * rows * depth) +
                        '  (' + (size && (size.width || size[0])) + 'x' + rows + ')');
                }
            });
        }
    })();

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
                ', buffers ' + mb(bufferBytes) + ' x' + bufferCount + ')'
                + '  |  shaders ' + shaderCount + '/pipelines ' + pipelineCount
                + '  |  ' + audioSummary() + '  |  ' + resourceSummary();
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
                crashed = true;
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

        // ---- what was the GPU doing when the device died? ----------------------------
        // The device is lost with nothing calling destroy() and with memory well below
        // what the working build reaches, so the likely cause is WebKit's GPU process
        // falling over on something Unity handed it. Keep a short history of the last
        // shaders and pipelines created, and count queue submissions, so the loss can be
        // pinned to either resource creation (before any submit) or a command that was
        // actually executed (after).

        var RING = 20;
        var recentShaders = [];
        var recentPipelines = [];
        var submitCount = 0;

        // Unity puts the source asset path in the first line of every WGSL module it
        // creates, so the whole compile run can be followed by path. The device dies
        // during this phase with no pipelines and no submits, so what matters is how far
        // the run gets and how much of it there is.
        var pipelineCount = 0;
        var shaderCount = 0;
        var shaderPaths = [];
        var lastShaderPath = '';

        function shaderPathOf(code) {
            if (!code) return '(no source)';
            // Asset paths contain spaces ("Third Party/..."), so take the whole comment
            // line rather than the first whitespace-delimited token.
            var m = String(code).match(/^[^\S\r\n]*\/\/[^\S\r\n]*([^\r\n]+)/);
            if (!m) return '(unattributed)';
            return m[1].trim().replace(/^Assets\//, '');
        }

        function remember(ring, entry) {
            ring.push(entry);
            if (ring.length > RING) ring.shift();
        }

        function describePipeline(desc) {
            if (!desc) return '(no descriptor)';
            var parts = [desc.label || 'unlabelled'];
            try {
                if (desc.vertex) parts.push('vs=' + (desc.vertex.entryPoint || '?'));
                if (desc.fragment) {
                    parts.push('fs=' + (desc.fragment.entryPoint || '?'));
                    var targets = (desc.fragment.targets || []).map(function (t) {
                        return t ? t.format : 'null';
                    });
                    parts.push('targets=[' + targets.join(',') + ']');
                }
                if (desc.depthStencil) parts.push('depth=' + desc.depthStencil.format);
                if (desc.multisample) parts.push('samples=' + (desc.multisample.count || 1));
                if (desc.primitive) parts.push('topology=' + (desc.primitive.topology || 'triangle-list'));
            } catch (e) { parts.push('(descriptor unreadable)'); }
            return parts.join(' ');
        }

        if (PROBE) {

        var createShaderModule = GPUDevice.prototype.createShaderModule;
        GPUDevice.prototype.createShaderModule = function (desc) {
            var module = createShaderModule.apply(this, arguments);
            // Unity rarely labels these, so keep a slice of the WGSL as a fingerprint -
            // entry point names and struct names are usually enough to identify a shader.
            var head = '';
            var path = '(unknown)';
            try {
                if (desc && desc.code) {
                    head = String(desc.code).replace(/\s+/g, ' ').slice(0, 110);
                    path = shaderPathOf(desc.code);
                }
            } catch (e) { /* code unreadable */ }

            shaderCount++;
            shaderPaths.push(path);
            // One line per distinct shader rather than per module keeps this readable -
            // each shader usually produces a vertex and a fragment module back to back.
            if (path !== lastShaderPath) {
                lastShaderPath = path;
                log('gpu', 'shader #' + shaderCount + '  ' + path);
            }
            remember(recentShaders, '#' + shaderCount + ' ' + path + ' | ' + head);
            try {
                if (COMPINFO && module.getCompilationInfo) {
                    module.getCompilationInfo().then(function (info) {
                        (info.messages || []).forEach(function (m) {
                            if (m.type === 'error') {
                                log('error', 'shader compile error [' + (desc && desc.label || 'unlabelled') +
                                    '] line ' + m.lineNum + ': ' + m.message);
                            }
                        });
                    }, function () { /* info unavailable */ });
                }
            } catch (e) { /* not supported */ }
            return module;
        };

        ['createRenderPipeline', 'createComputePipeline'].forEach(function (name) {
            var original = GPUDevice.prototype[name];
            if (!original) return;
            GPUDevice.prototype[name] = function (desc) {
                pipelineCount++;
                remember(recentPipelines, name + ': ' + describePipeline(desc));
                try {
                    return original.apply(this, arguments);
                } catch (err) {
                    log('error', name + ' threw: ' + describe(err) + '  ::  ' + describePipeline(desc));
                    throw err;
                }
            };
        });

        ['createRenderPipelineAsync', 'createComputePipelineAsync'].forEach(function (name) {
            var original = GPUDevice.prototype[name];
            if (!original) return;
            GPUDevice.prototype[name] = function (desc) {
                remember(recentPipelines, name + ': ' + describePipeline(desc));
                return original.apply(this, arguments).then(null, function (err) {
                    log('error', name + ' rejected: ' + describe(err) + '  ::  ' + describePipeline(desc));
                    throw err;
                });
            };
        });

        if (window.GPUQueue && GPUQueue.prototype.submit) {
            var submit = GPUQueue.prototype.submit;
            GPUQueue.prototype.submit = function () {
                submitCount++;
                if (submitCount === 1) log('gpu', 'first queue.submit - the GPU has started executing commands');
                return submit.apply(this, arguments);
            };
        }

        } // end PROBE

        function dumpGpuHistory() {
            log('error', '  shader modules created: ' + shaderCount +
                ' (' + new Set(shaderPaths).size + ' distinct shaders)');
            log('error', '  queue submits before this point: ' + submitCount);
            log('error', '  last ' + recentPipelines.length + ' pipelines (newest last):');
            recentPipelines.forEach(function (p, i) { log('error', '    ' + (i + 1) + '. ' + p); });
            log('error', '  last ' + recentShaders.length + ' shader modules (newest last):');
            recentShaders.forEach(function (s, i) { log('error', '    ' + (i + 1) + '. ' + s); });
        }

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
                    crashed = true;
                    log('error', 'device#' + id + ' LOST: ' + reason.reason + ' - ' + (reason.message || '(no message)'));
                    log('error', '  ' + tallySummary());
                    dumpGpuHistory();
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

    // ---- unattended run matrix -------------------------------------------------------
    // An intermittent fault needs many runs to characterise, which is miserable by hand.
    // With &matrix=1 the page drives the whole set itself: each attempt gets a fixed
    // budget, its outcome is stored in localStorage, and the page reloads into the next
    // configuration. Only the final run prints anything worth copying.
    var MATRIX = [
        { label: 'default', params: '' },
        { label: 'default', params: '' },
        { label: 'default', params: '' },
        { label: 'default', params: '' },
        { label: 'noaudio', params: '&noaudio=1' },
        { label: 'noaudio', params: '&noaudio=1' },
        { label: 'noaudio', params: '&noaudio=1' },
        { label: 'noaudio', params: '&noaudio=1' }
    ];
    // Each attempt gets a fixed wall-clock budget rather than waiting on a success
    // signal, so a run that hangs cannot stall the set. &budget=N overrides it (seconds).
    var RUN_BUDGET_MS = (parseFloat((location.search.match(/[?&]budget=([0-9.]+)/) || [])[1]) || 20) * 1000;
    var MATRIX_KEY = 'gpu-debug.matrix';

    function snapshot() {
        var parts = [];
        if (typeof shaderCount !== 'undefined') {
            parts.push('shaders ' + shaderCount + '/' + pipelineCount + ' pipelines');
            parts.push('submits ' + submitCount);
            parts.push('last shader: ' + (lastShaderPath || 'none'));
            parts.push('gpu ' + mb(textureBytes + bufferBytes));
        }
        parts.push(audioSummary());
        parts.push(resourceSummary());
        return parts.join(', ');
    }

    if (/[?&]matrix=1\b/.test(location.search)) {
        // Unity pops an alert() when it halts, which would stall an unattended run.
        window.alert = function (msg) {
            log('sys', 'alert suppressed: ' + String(msg).split('\n')[0]);
        };

        var runIndex = parseInt((location.search.match(/[?&]run=(\d+)/) || [])[1], 10) || 0;
        var results = [];
        if (runIndex > 0) {
            try { results = JSON.parse(localStorage.getItem(MATRIX_KEY) || '[]'); } catch (e) { results = []; }
        }

        log('sys', '=== matrix run ' + (runIndex + 1) + ' of ' + MATRIX.length +
            '  [' + MATRIX[runIndex].label + ']  ' + (RUN_BUDGET_MS / 1000) + 's budget ===');

        setTimeout(function () {
            results.push({
                n: runIndex + 1,
                cfg: MATRIX[runIndex].label,
                outcome: crashed ? 'CRASH' : 'ok',
                detail: snapshot()
            });
            try { localStorage.setItem(MATRIX_KEY, JSON.stringify(results)); } catch (e) { /* private mode */ }

            var next = runIndex + 1;
            if (next < MATRIX.length) {
                var carry = (RUN_BUDGET_MS !== 20000) ? '&budget=' + (RUN_BUDGET_MS / 1000) : '';
                location.replace(location.pathname + '?debug=1&matrix=1&run=' + next +
                    MATRIX[next].params + carry);
                return;
            }

            location.replace(location.pathname + '?debug=1&report=1');
            return;
        }, RUN_BUDGET_MS);
    }

    // The landing page for a finished matrix: no Unity, just the stored results.
    if (/[?&]report=1\b/.test(location.search)) {
        var done = [];
        try { done = JSON.parse(localStorage.getItem(MATRIX_KEY) || '[]'); } catch (e) { done = []; }
        setTimeout(function () {
            log('sys', '========== MATRIX COMPLETE - copy from here ==========');
            done.forEach(function (r) {
                log(r.outcome === 'CRASH' ? 'error' : 'sys',
                    'run ' + r.n + '  ' + r.cfg + '  ' + r.outcome + '  ' + r.detail);
            });
            ['default', 'noaudio'].forEach(function (cfg) {
                var of = done.filter(function (r) { return r.cfg === cfg; });
                var bad = of.filter(function (r) { return r.outcome === 'CRASH'; });
                log('sys', cfg + ': ' + bad.length + ' of ' + of.length + ' crashed');
            });
            log('sys', '========== END ==========');
            try { localStorage.removeItem(MATRIX_KEY); } catch (e) { /* ignore */ }
        }, 50);
    }

    // Expose the buffer so a host machine can read it over Web Inspector / CDP instead of
    // the log having to be copied off the phone by hand.
    window.__gpuDebug = {
        get lines() { return lines.slice(); },
        get text() { return lines.join('\n'); },
        get crashed() { return crashed; },
        snapshot: function () { try { return snapshot(); } catch (e) { return '(unavailable)'; } }
    };

    if (document.body) build();
    else document.addEventListener('DOMContentLoaded', build);

    log('sys', 'gpu-debug active | probe=' + (PROBE ? 'on' : 'OFF') + (NOAUDIO ? ' NOAUDIO' : '') +
        ' compinfo=' + (COMPINFO ? 'on' : 'OFF') + ' | ' + navigator.userAgent);
    log('sys', 'screen ' + screen.width + 'x' + screen.height + ' dpr=' + window.devicePixelRatio +
        ' inner ' + window.innerWidth + 'x' + window.innerHeight);
})();
