const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const cellSize = 30;
const maxSize = 12;
const minSize = 5;
let mousePos = { x: innerWidth * 0.25, y: innerHeight * 0.5 };
let numThingsX;
let numThingsY;
let things;

function drawThing(thing) {
  const {pos, radius, offset, target} = thing;
  //ctx.fillStyle = '#AB3C87';
  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius + offset, 0, Math.PI * 2);
  ctx.fill();
}

function loop() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  things.forEach(thing => {
    const dist = calcDistance(mousePos, thing.pos);
    thing.radius = clamp( maxSize - (dist * 0.01) , 8, maxSize);
    thing.target = retarget(thing);
    thing.offset = linearInterpolation(thing.radius + thing.offset, thing.target, 0.0025) - thing.radius;
    drawThing(thing);
  });
  // For now I'm turning off the RAF loop because
  // there are no ongoing animations.
   window.requestAnimationFrame(loop);
}

function calcDistance(pA, pB){
  let a = pA.x  - pB.x;
  let b = pA.y - pB.y;
  let c = Math.sqrt( a*a + b*b );
  return c;
}

function makeThing(x, y) {
  return {
    pos: { x: x, y: y },
    radius: 2,
    offset: 0,
    target: 0
  };
}

function retarget(thing) {
  if(thing.target == 0 )
  {
      return Math.random() < 0.5 ? 5 : maxSize;
  }
  
  if(thing.radius + 1 <= thing.radius + thing.offset || thing.radius - 1 >= thing.radius + thing.offset)
    {
      let newTarget = thing.offset > 0 ? maxSize : 5;
      thing.offset = thing.offset > 0 ? 0.99 : -0.99 ;
      thing.target = newTarget;
      return newTarget;
    }
  return thing.target;
}

function linearInterpolation( a, b, r ){
  return a + r * (a - b);
}

function makeThings() {
  things = [];
  for (let i = 0; i < numThingsY; i += 1) {
    for (let j = 0; j < numThingsX; j += 1) {
      const thing = makeThing(j * cellSize + cellSize * 0.5, i * cellSize + cellSize * 0.5);
      things.push(thing);
    }
  }
}

function sizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const canvasRect = canvas.getBoundingClientRect();
  canvas.width = canvasRect.width * dpr;
  canvas.height = canvasRect.height * dpr;
  ctx.scale(dpr, dpr);
}

function handleResize() {
  sizeCanvas();
  numThingsX = Math.ceil(innerWidth / cellSize);
  numThingsY = Math.ceil(innerHeight / cellSize);
  makeThings();
}
window.addEventListener('resize', throttled(handleResize));

function handleMouseMove(event) {
  mousePos = { x: event.clientX, y: event.clientY };
  //loop();
}
window.addEventListener('mousemove', throttled(handleMouseMove));

// Kick it off
handleResize();
loop();

// USEFUL FUNCTIONS ----------
function throttled(fn) {
  let didRequest = false;
  return param => {
    if (!didRequest) {
      window.requestAnimationFrame(() => {
        fn(param);
        didRequest = false;
      });
      didRequest = true;
    }
  };
}
function clamp (value, min = 0, max = 1) {
  return value <= min ? min : value >= max ? max : value;
}