(function () {

    var container = document.querySelector("#unity-container");
    var canvas = document.querySelector("#unity-canvas");
    var loader= document.querySelector("#loader");
    var loaderFill= document.querySelector("#fill");

    function onProgress(progress) {
        loaderFill.style.width = progress * 100 + "%";
    }

    function onComplete(unityInstance) {
        loader.remove();
    }
    function onWindowResize() {
        var width = window.innerWidth
        || document.documentElement.clientWidth
        || document.body.clientWidth;

        var height = window.innerHeight
        || document.documentElement.clientHeight
        || document.body.clientHeight;

        canvas.height=height;
        canvas.width=width;
    }

    // iOS Safari tears down the WebGPU device when GPU memory runs out. At
    // devicePixelRatio 3 a 390x671 canvas becomes a 1170x2013 render target, and with
    // 4x MSAA that pair of colour+depth targets alone costs ~180MB - enough to lose the
    // device partway through startup. Unity honours Module.devicePixelRatio (see
    // _JS_SystemInfo_GetPreferredDevicePixelRatio in the framework), and every config
    // key is copied onto Module, so capping it here scales the render target down
    // without touching the CSS layout. ?dpr=N overrides it for A/B testing on device.
    var dprOverride = parseFloat((location.search.match(/[?&]dpr=([0-9.]+)/) || [])[1]);
    var deviceRatio = dprOverride > 0 ? dprOverride : Math.min(window.devicePixelRatio || 1, 2);

    var buildUrl = "Build";
    var loaderUrl = buildUrl + "/WebGL.loader.js";
    var config = {
        dataUrl: buildUrl + "/WebGL.data.gz",
        frameworkUrl: buildUrl + "/WebGL.framework.js.gz",
        codeUrl: buildUrl + "/WebGL.wasm.gz",
        streamingAssetsUrl: "StreamingAssets",
        companyName: "",
        productName: "Funky Virtual Party",
        productVersion: "0.1",
        devicePixelRatio: deviceRatio,
    };

    var script = document.createElement("script");
    script.src = loaderUrl;
    script.onload = () => {
        createUnityInstance(canvas, config, onProgress)
            .then((unityInstance) => {
            console.log("Creating Unity Instance");
            window.unityInstance = unityInstance;
        }).then(onComplete).catch((message) => {
                alert(message);
        });
                  
    };
    document.body.appendChild(script);

    window.addEventListener('resize', onWindowResize);
    onWindowResize();

})();
