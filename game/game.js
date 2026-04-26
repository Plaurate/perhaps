const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = 320;
canvas.height = 180;

ctx.imageSmoothingEnabled = false;



const WORLD_WIDTH = 1692;



let cameraX = 0;
let MAX_CAMERA_X = WORLD_WIDTH - canvas.width;

const player = {
  x: 50,
  y: 150,
  speed: 2,

  facing: "right",
  isMoving: false,

  offsetX: 0,
  offsetY: 0
};

const keys = {};
const prevKeys = {};

window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

const background = loadImage("background.jpg");
const midground = loadImage("midground.png");

const doorOpen = loadImage("door_open.png");
const doorClosed = loadImage("door_closed.png");

const idleSprite = loadImage("player.png");

const walkFrames = [
  loadImage("frame1.png"),
  loadImage("frame2.png"),
  loadImage("frame3.png"),
  loadImage("frame4.png")
];


let doorOpenState = false;

let doorXWorld = 0;

function updateDoorPosition() {
  if (midground.complete && midground.width && doorClosed.complete) {
    doorXWorld = midground.width - doorClosed.width + 25;
  }
}


let frameIndex = 0;
let frameTimer = 0;
const frameDelay = 10;

function updateAnimation() {
  if (player.isMoving) {
    frameTimer++;
    if (frameTimer >= frameDelay) {
      frameIndex = (frameIndex + 1) % walkFrames.length;
      frameTimer = 0;
    }
  } else {
    frameIndex = 0;
  }
}


function update() {
  let moving = false;

  if (keys["KeyA"]) {
    player.x -= player.speed;
    player.facing = "left";
    moving = true;
  }

  if (keys["KeyD"]) {
    player.x += player.speed;
    player.facing = "right";
    moving = true;
  }

  if (keys["KeyW"]) player.y -= player.speed, moving = true;
  if (keys["KeyS"]) player.y += player.speed, moving = true;

  player.isMoving = moving;

  const sprite = player.isMoving
    ? walkFrames[frameIndex]
    : idleSprite;

  const w = sprite.width || 34;
  const h = sprite.height || 110;

  player.x = Math.max(w / 2, Math.min(WORLD_WIDTH - w / 2, player.x));

  const topLimit = canvas.height * 0.30 + h;
  const bottomLimit = canvas.height;

  player.y = Math.max(topLimit, Math.min(bottomLimit, player.y));

  cameraX = player.x - canvas.width / 2;
  cameraX = Math.max(0, Math.min(MAX_CAMERA_X, cameraX));


  if (keys["KeyE"] && !prevKeys["KeyE"]) {
    doorOpenState = !doorOpenState;
  }

  prevKeys["KeyE"] = keys["KeyE"];

  updateDoorPosition();
  updateAnimation();
}


function drawBackground() {
  if (!background.complete || !background.width) return;

  const bgW = background.width;
  const bgSpeed = 0.12;

  const offsetX = cameraX * bgSpeed;

  const maxScroll = bgW - canvas.width;
  const bgX = Math.max(0, Math.min(maxScroll, offsetX));

  ctx.drawImage(background, -bgX | 0, 0, bgW, canvas.height);
}


function drawTiledLayer(img, speed) {
  if (!img.complete || !img.width) return;

  const imgW = img.width;

  const offsetX = cameraX * speed;

  const viewLeft = cameraX * speed;
  const viewRight = (cameraX + canvas.width) * speed;

  const start = Math.floor(viewLeft / imgW) * imgW - imgW;
  const end = Math.ceil(viewRight / imgW) * imgW + imgW;

  for (let x = start; x < end; x += imgW) {
    const drawX = x - offsetX;
    ctx.drawImage(img, drawX | 0, 0);
  }
}


function drawDoor() {
  const img = doorOpenState ? doorOpen : doorClosed;
  if (!img.complete) return;

  const speed = 0.7;

  const offsetX = cameraX * speed;

  const doorScreenX = doorXWorld - offsetX;

  if (doorScreenX + img.width < 0 || doorScreenX > canvas.width) return;

  ctx.drawImage(img, doorScreenX | 0, 0);
}

function drawPlayer() {
  const sprite = player.isMoving
    ? walkFrames[frameIndex]
    : idleSprite;

  if (!sprite.complete) return;

  const w = sprite.width;
  const h = sprite.height;

  const drawX = (player.x - w / 2 - cameraX + player.offsetX) | 0;
  const drawY = (player.y - h + player.offsetY) | 0;

  ctx.save();

  if (player.facing === "left") {
    ctx.translate(drawX + w, drawY);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, 0, 0);
  } else {
    ctx.drawImage(sprite, drawX, drawY);
  }

  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBackground();
  drawTiledLayer(midground, 0.7);

  drawDoor();

  drawPlayer();
}

function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}

loop();