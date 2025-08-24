'use strict';

let socket = io();
let el;

window.onload = setup;
window.onclick = onClick;


function setup(){
    el = document.getElementById('server-time');
}

function onClick(){
    el.innerHTML = 'X: ' + e.pageX + '  Y: ' + e.pageY;
}

/*
socket.on('time', (timeString) => {
    el.innerHTML = 'Server time: ' + timeString;
});
*/