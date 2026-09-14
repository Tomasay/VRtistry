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

    // Brotli, not gzip. Measured on this build: the wasm drops 16.33 -> 11.38 MB and the
    // data 19.30 -> 16.08 MB, for 8.2 MB less to pull down. Brotli costs about 50 ms more
    // to decode, which is paid back many times over on anything slower than a gigabit link.
    //
    // These names must match PlayerSettings > Publishing Settings > Compression Format in
    // the Unity project. Switch that back to Gzip and these become .gz again, and index.html
    // needs the same edit to its preload hints. server.js serves both.
    var buildUrl = "Build";
    var loaderUrl = buildUrl + "/WebGL.loader.js";
    var config = {
        dataUrl: buildUrl + "/WebGL.data.br",
        frameworkUrl: buildUrl + "/WebGL.framework.js.br",
        codeUrl: buildUrl + "/WebGL.wasm.br",
        streamingAssetsUrl: "StreamingAssets",
        companyName: "SynthLabs",
        productName: "VRtistry",
        productVersion: "0.1",
    };

    var script = document.createElement("script");
    script.src = loaderUrl;
    script.onload = () => {
        createUnityInstance(canvas, config, onProgress)
            .then(onComplete)
            .catch((message) => {
                alert(message);
        });
    };
    document.body.appendChild(script);

    window.addEventListener('resize', onWindowResize);
    onWindowResize();

})();
