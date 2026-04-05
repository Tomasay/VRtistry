'use strict';

const express = require('express');
const socketIO = require('socket.io');
const compress = require('compression');
const msgPack = require('socket.io-msgpack-parser');

const PORT = process.env.PORT || 3000;
const INDEX = '/index.html';

var app = express();

var connectedUsers = 0;

var activeUnityRoomCodes = {};

var roomsInGameInfo = {};

app.use(compress());
app.use(express.static('assets'));

app.use(express.static('/app/assets/new/Build/'));

app.get('/Build/:filename', (req, res) => {
  var extensionFile = path.extname(req.params.filename);
    if(extensionFile === '.data' || extensionFile === '.mem'){
        res.header('Content-Type', 'application/octet-stream');
    }
    //Response used gzip encoding
    res.header('Content-Encoding', 'gzip');
    //Send file if there is a match into "Compressed" Unity folder
    res.sendFile(path.resolve(__dirname , '../new/Build/'+req.params.filename));
});

var server = app.listen(PORT, function(){
    console.log(`Listening on ${PORT}`);
})

const io = socketIO(server, {
    allowEIO3: true,
    allowEIO4: true,
    serveClient: true,
    cors: {origin: "*"},
    parser: msgPack
});

io.on('connection', (socket) => {
  //...run when anyone connects to the server
  console.log('Client connected');
    
  socket.on('disconnect', () => { //When anyone disconnects from the server
      console.log('Client disconnected');
      io.emit('clientDisconnect', socket.id, socket.request.connection.remoteAddress);
      
      //If client was a Unity client, delete the stored passcode and reference
      if(activeUnityRoomCodes.hasOwnProperty(socket.id)){
          delete activeUnityRoomCodes[socket.id];
      }
  });
    
  socket.on("unityJoinRoom", (code) => { //Unity creates and connects to a room with a given passcode
      //TODO: check if code is already being used
      activeUnityRoomCodes[socket.id] = code;
      roomsInGameInfo[socket.id] = false;
      socket.join(code);
    });
    
  socket.on("joinRoom", (code, name) => { //Mobile client attempts to join room
      if(Object.values(activeUnityRoomCodes).includes(code)){
          if(roomsInGameInfo[code] == true){
              io.to(socket.id).emit('joinedRoom', false, 'Game is in play');
          }
          else{
              console.log("joining room: " + code);
              socket.join(code);
              io.to(code).emit('connectToHost', socket.id, socket.request.connection.remoteAddress, name);
              io.to(socket.id).emit('joinedRoom', true, '');
          }
      }
      else{
          io.to(socket.id).emit('joinedRoom', false, 'Party code is invalid');
      }
    });
    
    socket.on("assignPlayerByteIDServer", (id, byteID) => { //Assigning player's byte ID to them
        let clientRoom = Array.from(socket.rooms.values())[1];
        io.to(clientRoom).emit('assignPlayerByteIDClient', id, byteID);
    });
    
    socket.on("playerInfoFromHost", (id, players) => { //Relaying info of current players in room to be spawned when a player joins
        io.to(id).emit('playerInfoToClient', socket.id, players);
    });
    
    socket.on("syncPlayerPosFromHost", (id, x, y, z, lerp) => { //Relaying player pos to sync with client
        let clientRoom = Array.from(socket.rooms.values())[1];
        io.to(clientRoom).emit('syncPlayerPosToClient', id, x, y, z, lerp);
    });
    
    socket.on("requestPlayerPosFromClient", (id) => { //Relaying player pos to sync with client
        let clientRoom = Array.from(socket.rooms.values())[1];
        io.to(clientRoom).emit('requestPlayerPosToHost', id);
    });
    
    socket.on("syncCustomizationsFromClient", (color, headShape, height, hatIndex) => {
      let clientRoom = Array.from(socket.rooms.values())[1];
      if(clientRoom != undefined){
        io.to(clientRoom).emit('syncCustomizationsFromServer', socket.id, color, headShape, height, hatIndex);
      }
    });
    
    socket.on("syncCustomizationsFromClientDebug", (id, color, headShape, height, hatIndex) => {
      let clientRoom = Array.from(socket.rooms.values())[1];
      if(clientRoom != undefined){
        io.to(clientRoom).emit('syncCustomizationsFromServer', id, color, headShape, height, hatIndex);
      }
    });
    
    socket.on("IS", (input) => { //Input data is sent to Unity
      let clientRoom = Array.from(socket.rooms.values())[1];
      if(clientRoom != undefined){
        io.to(clientRoom).emit('IC', input);
      }
    });
    
    socket.on("inputDebug", (input) => { //Input data is sent to Unity
      let clientRoom = Array.from(socket.rooms.values())[1];
      if(clientRoom != undefined){
        io.to(clientRoom).emit('IC', input);
      }
    });
    
    socket.on("XS", (input) => { //Input data received from Unity host
      let clientRoom = Array.from(socket.rooms.values())[1];
      if(clientRoom != undefined){
          //Relay to clients
          io.to(clientRoom).emit('XC', input);
      }
    });
    
    socket.on("ObjectDataToServer", (data) => { //Object data received from Unity host
      let clientRoom = Array.from(socket.rooms.values())[1];
      if(clientRoom != undefined){
          //Relay to clients
          io.to(clientRoom).emit('ObjectDataToClient', data);
      }
    });
    
    socket.on("MethodCallToServer", (methodName, methodData) => { //Method name received from Unity host, to be called on client side
      let clientRoom = Array.from(socket.rooms.values())[1];
      if(clientRoom != undefined){
          //Relay to clients
          io.to(clientRoom).emit('MethodCallToClient', methodName, methodData);
      }
    });
    
    socket.on("MethodCallToServerByte", (methodName, methodData) => { //Method name received from Unity host, to be called on client side
      let clientRoom = Array.from(socket.rooms.values())[1];
      if(clientRoom != undefined){
          //Relay to clients
          io.to(clientRoom).emit('MethodCallToClientByte', methodName, methodData);
      }
    });
    
    socket.on("MethodCallToServerByteArray", (methodName, methodData) => { //Method name received from Unity host, to be called on client side
      let clientRoom = Array.from(socket.rooms.values())[1];
      if(clientRoom != undefined){
          //Relay to clients
          io.to(clientRoom).emit('MethodCallToClientByteArray', methodName, methodData);
      }
    });
    
    socket.on("InfoFromPlayer", (info) => { //Method name received from Unity host, to be called on client side
      let clientRoom = Array.from(socket.rooms.values())[1];
      if(clientRoom != undefined){
          //Relay to XR player
          io.to(clientRoom).emit('InfoToXR', info, socket.id);
      }
    });

    socket.on("minigameStarted", (code, name) => {
      io.in(code).emit('minigameStart', name);
        
        console.log("Scene name: " + name);
        
        roomsInGameInfo[code] = true;
    });
    
    socket.on("setIsGameInPlay", (code, isInPlay) => {
        roomsInGameInfo[code] = isInPlay;
    });

    socket.on("ReadyUp", (id) => {
      let clientRoom = Array.from(socket.rooms.values())[1];
      if(clientRoom != undefined){
        io.to(clientRoom).emit('readyUp', id);
      }
    });
    
    socket.on("ReadyUpDebug", (id) => {
      let clientRoom = Array.from(socket.rooms.values())[1];
      if(clientRoom != undefined){
        io.to(clientRoom).emit('readyUp', id);
      }
    });
    
    socket.on("ReadyUpVR", () => {
      let clientRoom = Array.from(socket.rooms.values())[1];
      if(clientRoom != undefined){
        io.to(clientRoom).emit('readyUpVR');
      }
    });

    socket.on("Action", (id) => {
      let clientRoom = Array.from(socket.rooms.values())[1];
      if(clientRoom != undefined){
        io.to(clientRoom).emit('action', id);
      }
    });
    
    socket.on("gameStateFromHost", (state) => {
      let clientRoom = Array.from(socket.rooms.values())[1];
      if(clientRoom != undefined){
        io.to(clientRoom).emit('gameStateToClient', state);
      }
    });
    
    io.of("/").adapter.on("leave-room", (room, id) => { //Anyone leaves a room
      console.log(`socket ${id} has left room ${room} ` + 'with IP: ' + io.sockets.sockets.get(id).request.connection.remoteAddress);
      io.to(room).emit('disconnectToUnity', id, io.sockets.sockets.get(id).request.connection.remoteAddress);
    });
    
    socket.on('connection', function connection(ws, req) {
        const ip = req.headers['x-forwarded-for'].split(/\s*,\s*/)[0];
        console.log('Client connected with IP: ' + ip);
    });

  socket.on("unityCloseRoom", (code) => {
      io.in(code).emit("roomClosed"); //Tell everyone in the room that it closed
    });
    
  socket.on("ping", (cb) => {
    if (typeof cb === "function")
      cb();
  });
    
    socket.on('VideoData', (data) => {
        let clientRoom = Array.from(socket.rooms.values())[1];
        if(clientRoom != undefined){
            io.to(clientRoom).emit('ReceivedData', data);
        }
    });
    
});

function removeUnityRoomCode(code){
    io.emit('fromServer', 'removing unity code');
    var index = activeUnityRoomCodes.indexOf(code);
    if (index > -1) {
      activeUnityRoomCodes.splice(index, 1);
    }
}