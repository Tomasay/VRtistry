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
    var buildUrl = "Build";
    var loaderUrl = buildUrl + "/WebGL.loader.js";
    var config = {
        // Brotli, not gzip: the player has been on Brotli since the build-size pass, and
        // these names have to match PlayerSettings > Publishing Settings > Compression
        // Format in the Unity project. Point them at an encoding the build did not produce
        // and the page just hangs on the loading bar. server.js serves both.
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
            .then((unityInstance) => {
            console.log("Creating Unity Instance");
            window.unityInstance = unityInstance;
        }).then(onComplete).catch((message) => {
                alert(message);
        });
                  
    };
    document.body.appendChild(script);

    // No resize handler: Unity sizes the drawing buffer itself (clientSize x devicePixelRatio).
    // The old one set it to 1x CSS pixels on every resize, fighting Unity and clearing the canvas.

})();
