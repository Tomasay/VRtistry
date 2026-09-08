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

    // ?dpr=N renders at a chosen pixel ratio instead of the display's own. Unity honours
    // Module.devicePixelRatio (see _JS_SystemInfo_GetPreferredDevicePixelRatio in the
    // framework) and every config key is copied onto Module, so this scales the render
    // target without touching the CSS layout - useful for isolating resolution from
    // other variables on a device. Default behaviour is unchanged.
    //
    // Note: capping this was tried as a fix for the iOS device loss and did NOT help -
    // the device is lost at the same point at dpr 2 as at dpr 3, and the build that works
    // allocates MORE GPU memory than the one that fails. Resolution is not the problem.
    var dprOverride = parseFloat((location.search.match(/[?&]dpr=([0-9.]+)/) || [])[1]);
    var deviceRatio = dprOverride > 0 ? dprOverride : (window.devicePixelRatio || 1);

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
