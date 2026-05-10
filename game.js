const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = 320;
canvas.height = 180;

ctx.imageSmoothingEnabled = false;

// roundRect polyfill for older browsers
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    this.closePath();
  };
}


// ── Constants ────────────────────────────────────────────────────────────────

const MIDGROUND_SPEED = 0.7;
const BG_SPEED        = 0.12;

// ── Volume settings (0.0 – 1.0) ─────────────────────────────────────────────
const VOLUME_MUSIC      = 0.3;
const VOLUME_FOOTSTEPS  = 0.7;


// ── Ending overlay canvas (draws glitch effects over the video) ───────────────
const overlayCanvas = document.getElementById("effects-overlay");
const overlayCtx    = overlayCanvas.getContext("2d");

// ── Fade-to-video transition ──────────────────────────────────────────────────
// Fades the game canvas to black over FADE_TO_VIDEO_FRAMES, then reveals video.

const FADE_TO_VIDEO_FRAMES = 90; // ~1.5 s at 60 fps

const cameraBlink = {
  active:  false,
  frame:   0,
  onVideo: false,
};

function startCameraBlink() {
  cameraBlink.active  = true;
  cameraBlink.frame   = 0;
  cameraBlink.onVideo = false;
}

function updateCameraBlink() {
  if (!cameraBlink.active) return;

  cameraBlink.frame++;
  const t     = Math.min(1, cameraBlink.frame / FADE_TO_VIDEO_FRAMES);
  const alpha = t * t * (3 - 2 * t); // smooth-step

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle   = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  if (t >= 1 && !cameraBlink.onVideo) {
    cameraBlink.onVideo = true;
    cameraBlink.active  = false;
    const vid = document.getElementById("ending");
    vid.style.display           = "block";
    overlayCanvas.style.display = "block";
    overlayCanvas.width         = window.innerWidth;
    overlayCanvas.height        = window.innerHeight;
    vid.play().catch(() => {});
  }
}


// ── Night mode ────────────────────────────────────────────────────────────────

const nightMode = {
  active: false,
};

let imgNightBackground, imgNightMidground, imgNightDoorOpen, imgNightDoorClosed,
    imgNightShelf1, imgNightShelf2, imgNightDrawerOpen, imgNightDrawerClosed,
    imgNightKey, imgNightIdle, nightWalkFrames;

// Creep sounds
const creepSounds = [];
for (let i = 1; i <= 5; i++) {
  const a = new Audio(`music/creep${i}.mp3`);
  a.volume = 0.7;
  creepSounds.push(a);
}

let creepSlotTimer = 0;
const CREEP_SLOT_FRAMES = 60;
const CREEP_PLAY_CHANCE = 0.12;

function updateCreepSounds() {
  if (!nightMode.active) return;
  creepSlotTimer++;
  if (creepSlotTimer >= CREEP_SLOT_FRAMES) {
    creepSlotTimer = 0;
    const anyPlaying = creepSounds.some(c => !c.paused);
    if (!anyPlaying && Math.random() < CREEP_PLAY_CHANCE) {
      const clip = creepSounds[Math.floor(Math.random() * creepSounds.length)];
      clip.currentTime = 0;
      clip.play().catch(() => {});
    }
  }
}

function setNightMode(on) {
  if (nightMode.active === on) return;
  nightMode.active = on;
  if (on) {
    music.pause();
    creepSlotTimer = 0;
    fadeinBg2();
  } else {
    music.play().catch(() => {});
  }
}

function ni(day, night) { return nightMode.active ? night : day; }

function sh1() {
  if (brDoorTriggered || chaseMode.stage === "chase" || chaseMode.stage === "freeze" ||
      chaseMode.stage === "cornered" || chaseMode.stage === "standoff" || chaseMode.stage === "win") {
    return imgShelf1Br;
  }
  return nightMode.active ? imgNightShelf1 : imgShelf1;
}

function sh2() {
  if (brDoorTriggered || chaseMode.stage === "chase" || chaseMode.stage === "freeze" ||
      chaseMode.stage === "cornered" || chaseMode.stage === "standoff" || chaseMode.stage === "win") {
    return imgShelf2Br;
  }
  return nightMode.active ? imgNightShelf2 : imgShelf2;
}

function penta() {
  if (brDoorTriggered || chaseMode.stage === "chase" || chaseMode.stage === "freeze" ||
      chaseMode.stage === "cornered" || chaseMode.stage === "standoff" || chaseMode.stage === "win") {
    return imgPentagramBr;
  }
  return imgPentagram;
}

// ── Inventory ─────────────────────────────────────────────────────────────────

const inventory = { hasKey: false };

// ── Padlock puzzle (Room 3) ───────────────────────────────────────────────────

const PADLOCK_POOL = [
  { word: "RUST", morse: { R: "·−·", U: "··−", S: "···", T: "−"     } },
  { word: "DUSK", morse: { D: "−··", U: "··−", S: "···", K: "−·−"   } },
  { word: "GRIM", morse: { G: "−−·", R: "·−·", I: "··",  M: "−−"    } },
  { word: "BOLT", morse: { B: "−···",O: "−−−", L: "·−··",T: "−"     } },
  { word: "FAWN", morse: { F: "··−·",A: "·−",  W: "·−−", N: "−·"    } },
  { word: "HAZE", morse: { H: "····",A: "·−",  Z: "−−··",E: "·"     } },
  { word: "CLOP", morse: { C: "−·−·",L: "·−··",O: "−−−", P: "·−−·"  } },
  { word: "JINX", morse: { J: "·−−−",I: "··",  N: "−·",  X: "−··−"  } },
];

function pickPadlockEntry() {
  return PADLOCK_POOL[Math.floor(Math.random() * PADLOCK_POOL.length)];
}

let currentPadlock = pickPadlockEntry();
function getPadlockCode()  { return currentPadlock.word;  }
function getPadlockMorse() { return currentPadlock.morse; }

const padlock = {
  open:    false,
  overlay: false,
  input:   "",
  shake:   0,
};

const morseShelf2 = {
  xWorld:  400,
  centre:  0,
  range:   50,
  visible: false,
};

const morseShelf3 = {
  xWorld: 1500,
  centre: 0,
  range:  60,
};

const drawerNote = {
  visible: false,
};

function drawPadlockOverlay() {
  if (!padlock.overlay) return;

  const cx = canvas.width  / 2;
  const cy = canvas.height / 2;
  const w  = 160, h = 80;
  const x  = cx - w / 2;
  const y  = cy - h / 2;

  const shakeX = padlock.shake > 0 ? (Math.random() * 4 - 2) : 0;

  ctx.save();
  ctx.translate(shakeX, 0);

  ctx.fillStyle = "rgba(20, 15, 10, 0.92)";
  ctx.strokeStyle = "#7a5c30";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();

  ctx.font = "8px sans-serif";
  ctx.fillStyle = "#c8a96e";
  ctx.textAlign = "center";
  ctx.fillText("PADLOCK  —  Enter 4-letter code", cx, y + 14);

  const slotW = 22, slotH = 26, gap = 6;
  const totalW = 4 * slotW + 3 * gap;
  const slotStartX = cx - totalW / 2;
  const slotY = y + 24;

  for (let i = 0; i < 4; i++) {
    const sx = slotStartX + i * (slotW + gap);
    const filled = i < padlock.input.length;
    ctx.fillStyle = filled ? "#3a2a14" : "#1e1610";
    ctx.strokeStyle = i === padlock.input.length ? "#e8c87a" : "#5a4020";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(sx, slotY, slotW, slotH, 3);
    ctx.fill();
    ctx.stroke();

    if (filled) {
      ctx.font = "bold 14px sans-serif";
      ctx.fillStyle = "#f0d090";
      ctx.textAlign = "center";
      ctx.fillText(padlock.input[i], sx + slotW / 2, slotY + 18);
    }
  }

  ctx.font = "7px sans-serif";
  ctx.fillStyle = "rgba(200,180,140,0.7)";
  ctx.textAlign = "center";
  ctx.fillText("[A-Z] type  ·  [Backspace] delete  ·  [Enter] confirm  ·  [Escape] close", cx, y + h - 8);

  ctx.restore();
}

function drawMorseOverlay(visible) {
  if (!visible) return;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  const morse = getPadlockMorse();
  const lines  = Object.values(morse);
  const font   = "11px monospace";
  ctx.font     = font;

  let maxW = 0;
  for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);

  const padX = 5, padY = 4, lineH = 13;
  const bw = Math.ceil(maxW + padX * 2);
  const bh = lines.length * lineH + padY * 2;
  const bx = Math.round(canvas.width - bw - 4);
  const by = 18;

  ctx.fillStyle   = "rgba(10,8,5,0.90)";
  ctx.strokeStyle = "#7a5c30";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#d4b87a";
  ctx.textAlign = "left";
  lines.forEach((line, i) => {
    ctx.fillText(line, Math.round(bx + padX), Math.round(by + padY + lineH * i + lineH - 2));
  });

  ctx.restore();
}

function drawDrawerNoteOverlay() {
  if (!drawerNote.visible) return;

  const W = canvas.width, H = canvas.height;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = "rgba(12, 9, 5, 0.97)";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#7a5c30";
  ctx.lineWidth   = 1;
  ctx.strokeRect(3, 3, W - 6, H - 6);

  ctx.font      = "10px monospace";
  ctx.fillStyle = "#c8a96e";
  ctx.textAlign = "center";
  ctx.fillText("MORSE CODE", Math.round(W / 2), 16);

  ctx.fillStyle = "#7a5c30";
  ctx.fillRect(6, 20, W - 12, 1);

  const FULL_MORSE = [
    ["A","·−"],   ["B","−···"], ["C","−·−·"], ["D","−··"],
    ["E","·"],    ["F","··−·"], ["G","−−·"],  ["H","····"],
    ["I","··"],   ["J","·−−−"],["K","−·−"],  ["L","·−··"],
    ["M","−−"],   ["N","−·"],   ["O","−−−"],  ["P","·−−·"],
    ["Q","−−·−"],["R","·−·"],  ["S","···"],  ["T","−"],
    ["U","··−"],  ["V","···−"], ["W","·−−"],  ["X","−··−"],
    ["Y","−·−−"],["Z","−−··"],
  ];

  const cols    = 2;
  const rows    = Math.ceil(FULL_MORSE.length / cols);
  const startY  = 28;
  const lineH   = Math.floor((H - startY - 14) / rows);
  const colW    = Math.floor((W - 10) / cols);

  ctx.font      = "9px monospace";
  ctx.textAlign = "left";

  FULL_MORSE.forEach(([letter, code], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const tx  = Math.round(6 + col * colW);
    const ty  = Math.round(startY + row * lineH + lineH - 1);

    ctx.fillStyle = "#e8c87a";
    ctx.fillText(letter + ":", tx, ty);

    ctx.fillStyle = "#f0e0a0";
    ctx.fillText(code, tx + 16, ty);
  });

  ctx.font      = "8px monospace";
  ctx.fillStyle = "rgba(180,160,120,0.6)";
  ctx.textAlign = "center";
  ctx.fillText("[E] or [Escape] close", Math.round(W / 2), H - 4);

  ctx.restore();
}

// ── HUD message ───────────────────────────────────────────────────────────────

let hudMessage     = "";
let hudMessageTimer = 0;
const HUD_DURATION  = 150;

function showHUD(text) {
  hudMessage      = text;
  hudMessageTimer = HUD_DURATION;
}

function tickHUD() {
  if (hudMessageTimer > 0) hudMessageTimer--;
}

function drawHUD() {
  if (hudMessageTimer <= 0 || !hudMessage) return;
  const alpha = Math.min(1, hudMessageTimer / 30);
  ctx.save();
  ctx.font      = "11px sans-serif";
  ctx.fillStyle = `rgba(255, 230, 150, ${alpha})`;
  ctx.textAlign = "center";
  ctx.fillText(hudMessage, canvas.width / 2, canvas.height - 8);
  ctx.restore();
}


// ── Input ────────────────────────────────────────────────────────────────────

const keys     = {};
const prevKeys = {};

window.addEventListener("keydown", (e) => {
  keys[e.code] = true;

  if (padlock.overlay) {
    if (e.code === "Escape") {
      padlock.overlay = false;
      padlock.input   = "";
    } else if (e.code === "Backspace") {
      padlock.input = padlock.input.slice(0, -1);
    } else if (e.code === "Enter") {
      if (padlock.input === getPadlockCode()) {
        padlock.open    = true;
        padlock.overlay = false;
        room3.doorRight.isOpen = true;
        showHUD("The padlock clicks open!");
      } else {
        padlock.shake = 20;
        padlock.input = "";
        currentPadlock = pickPadlockEntry();
        showHUD("Wrong code.");
      }
    } else if (e.key.length === 1 && /[a-zA-Z]/.test(e.key) && padlock.input.length < 4) {
      padlock.input += e.key.toUpperCase();
    }
    e.preventDefault();
    return;
  }

  if (drawerNote.visible) {
    if (e.code === "Escape" || e.code === "KeyE") {
      drawerNote.visible = false;
      e.preventDefault();
    }
    return;
  }

  if (morseShelf2.visible) {
    if (e.code === "Escape") {
      morseShelf2.visible = false;
      e.preventDefault();
    }
    return;
  }
});
window.addEventListener("keyup", (e) => { keys[e.code] = false; });


// ── Asset loader ─────────────────────────────────────────────────────────────

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

const imgBackground   = loadImage("img/background.jpg");
const imgMidground    = loadImage("img/midground.png");
const imgDoorOpen     = loadImage("img/door_open.png");
const imgDoorClosed   = loadImage("img/door_closed.png");
const imgShelf1       = loadImage("img/shelf1.png");
const imgShelf2       = loadImage("img/shelf2.png");
const imgDrawerOpen   = loadImage("img/opened_drawer.png");
const imgDrawerClosed = loadImage("img/closed_drawer.png");
const imgKey          = loadImage("img/key.png");
const imgIdle         = loadImage("img/player.png");
const walkFrames      = [
  loadImage("img/frame1.png"),
  loadImage("img/frame2.png"),
  loadImage("img/frame3.png"),
  loadImage("img/frame4.png"),
];

imgNightBackground   = loadImage("img/night/background.jpg");
imgNightMidground    = loadImage("img/night/midground.png");
imgNightDoorOpen     = loadImage("img/night/door_open.png");
imgNightDoorClosed   = loadImage("img/night/door_closed.png");
imgNightShelf1       = loadImage("img/night/shelf1.png");
imgNightShelf2       = loadImage("img/night/shelf2.png");
imgNightDrawerOpen   = loadImage("img/night/opened_drawer.png");
imgNightDrawerClosed = loadImage("img/night/closed_drawer.png");
imgNightKey          = loadImage("img/night/key.png");
imgNightIdle         = loadImage("img/night/player.png");
nightWalkFrames      = [
  loadImage("img/night/frame1.png"),
  loadImage("img/night/frame2.png"),
  loadImage("img/night/frame3.png"),
  loadImage("img/night/frame4.png"),
];

// ── Room 7 / chase specific assets ───────────────────────────────────────────

const imgShelf1Br     = loadImage("img/night/shelf1_br.png");
const imgShelf2Br     = loadImage("img/night/shelf2_br.png");
const imgPentagramBr  = loadImage("img/night/pentagram_br.png");

const imgDoorClosedBr = loadImage("img/night/door_closed_br.png");

const imgScPlayer     = loadImage("img/night/sc_player.png");
const runFrames       = [
  loadImage("img/night/run1.png"),
  loadImage("img/night/run2.png"),
  loadImage("img/night/run3.png"),
  loadImage("img/night/run4.png"),
];

const imgImposterIdle = loadImage("img/night/imposter.png");
const imposterWalkFrames = [
  loadImage("img/night/imposter1.png"),
  loadImage("img/night/imposter2.png"),
  loadImage("img/night/imposter3.png"),
  loadImage("img/night/imposter4.png"),
];


// ── Audio ────────────────────────────────────────────────────────────────────

const music = new Audio("music/silly.mp3");
music.loop   = true;
music.volume = VOLUME_MUSIC;

const musicBg2 = new Audio("music/bg2.mp3");
musicBg2.loop   = true;
musicBg2.volume = 0;

function fadeinBg2() {
  musicBg2.play().catch(() => {});
  const target = VOLUME_MUSIC;
  const step   = target / (60 * 3);
  function tick() {
    if (musicBg2.volume < target) {
      musicBg2.volume = Math.min(target, musicBg2.volume + step);
      requestAnimationFrame(tick);
    }
  }
  tick();
}

const footsteps = new Audio("music/footsteps.mp3");
footsteps.loop   = true;
footsteps.volume = VOLUME_FOOTSTEPS;

const runningFootsteps = new Audio("music/running_footsteps.mp3");
runningFootsteps.loop   = true;
runningFootsteps.volume = VOLUME_FOOTSTEPS;

const chaseEffect = new Audio("music/chase_effect1.mp3");
chaseEffect.loop   = true;
chaseEffect.volume = 0.8;

let musicStarted = false;
function tryStartMusic() {
  if (musicStarted) return;
  musicStarted = true;
  music.play().catch(() => { musicStarted = false; });
}
window.addEventListener("keydown", tryStartMusic, { once: false });
window.addEventListener("click",   tryStartMusic, { once: false });

function updateFootsteps() {
  const inChase = chaseMode.active || chaseMode.stage === "freeze" ||
                  chaseMode.stage === "cornered" || chaseMode.stage === "standoff";

  if (inChase) {
    if (!footsteps.paused) { footsteps.pause(); footsteps.currentTime = 0; }
    if (player.isMoving && chaseMode.active) {
      if (runningFootsteps.paused) runningFootsteps.play().catch(() => {});
    } else {
      if (!runningFootsteps.paused) { runningFootsteps.pause(); runningFootsteps.currentTime = 0; }
    }
    if (chaseMode.imposterMoving) {
      if (chaseEffect.paused) chaseEffect.play().catch(() => {});
    } else {
      if (!chaseEffect.paused) { chaseEffect.pause(); chaseEffect.currentTime = 0; }
    }
  } else {
    if (!runningFootsteps.paused) { runningFootsteps.pause(); runningFootsteps.currentTime = 0; }
    if (!chaseEffect.paused)      { chaseEffect.pause();      chaseEffect.currentTime = 0; }
    if (player.isMoving) {
      if (footsteps.paused) footsteps.play().catch(() => {});
    } else {
      if (!footsteps.paused) { footsteps.pause(); footsteps.currentTime = 0; }
    }
  }
}


// ── Player ───────────────────────────────────────────────────────────────────

const player = {
  x: 50,
  y: 150,
  speed: 2,
  facing: "right",
  isMoving: false,
  offsetX: 0,
  offsetY: 0,
};

let frameIndex = 0;
let frameTimer = 0;
const frameDelay    = 16;
const frameDelayRun =  7;

function updateAnimation() {
  if (player.isMoving || chaseMode.active) {
    const delay = chaseMode.active ? frameDelayRun : frameDelay;
    frameTimer++;
    if (frameTimer >= delay) {
      frameIndex = (frameIndex + 1) % 4;
      frameTimer = 0;
    }
  } else {
    frameIndex = 0;
  }
}


// ── Fade / transition ────────────────────────────────────────────────────────

const fade = { alpha: 0, speed: 0.03, state: "none" };
let pendingRoom = null;

function startFadeTo(roomId) {
  if (fade.state !== "none") return;
  fade.state = "out";
  fade.alpha = 0;
  pendingRoom = roomId;
}

function updateFade() {
  if (fade.state === "out") {
    fade.alpha += fade.speed;
    if (fade.alpha >= 1) {
      fade.alpha = 1;
      switchRoom(pendingRoom);
      fade.state = "in";
    }
  } else if (fade.state === "in") {
    fade.alpha -= fade.speed;
    if (fade.alpha <= 0) {
      fade.alpha  = 0;
      fade.state  = "none";
      pendingRoom = null;
    }
  }
}

function drawFade() {
  if (fade.alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = fade.alpha;
  ctx.fillStyle   = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}


// ── Chase / imposter state machine ───────────────────────────────────────────

const FREEZE_FRAMES   = 60;
const CAUGHT_FRAMES   = 300;
const STANDOFF_FRAMES = 60;

const chaseMode = {
  active:       false,
  stage:        "idle",
  timer:        0,

  imposterX:    0,
  imposterFacing: "left",
  imposterMoving: false,
  imposterSpeed:  0.18,

  imposterFrameIndex: 0,
  imposterFrameTimer: 0,
};

let roomsFleed        = 0;
let imposterChaseRoom = 0;
let brDoorTriggered   = false;
let standoffBg2FadeStep = 0; // volume-per-frame decrement, set when standoff begins

function updateImposterAnimation() {
  if (chaseMode.imposterMoving) {
    chaseMode.imposterFrameTimer++;
    if (chaseMode.imposterFrameTimer >= 20) {
      chaseMode.imposterFrameIndex = (chaseMode.imposterFrameIndex + 1) % 4;
      chaseMode.imposterFrameTimer = 0;
    }
  } else {
    chaseMode.imposterFrameIndex = 0;
  }
}

function getImposterSprite() {
  if (chaseMode.imposterMoving) {
    return imposterWalkFrames[chaseMode.imposterFrameIndex];
  }
  return imgImposterIdle;
}

function resetGame() {
  inventory.hasKey = false;
  padlock.open     = false;
  padlock.overlay  = false;
  padlock.input    = "";
  padlock.shake    = 0;
  currentPadlock   = pickPadlockEntry();

  nightMode.active = false;
  musicBg2.pause();
  musicBg2.volume = 0;
  creepSounds.forEach(c => { c.pause(); c.currentTime = 0; });
  runningFootsteps.pause(); runningFootsteps.currentTime = 0;
  chaseEffect.pause();      chaseEffect.currentTime = 0;
  footsteps.pause();        footsteps.currentTime = 0;
  music.currentTime = 0;
  music.play().catch(() => {});

  chaseMode.active         = false;
  chaseMode.stage          = "idle";
  chaseMode.timer          = 0;
  chaseMode.imposterX      = 0;
  chaseMode.imposterMoving = false;
  chaseMode.imposterFrameIndex = 0;
  chaseMode.imposterFrameTimer = 0;

  chaseEffectAlpha = 0;

  // Reset camera blink state
  cameraBlink.active  = false;
  cameraBlink.frame   = 0;
  cameraBlink.onVideo = false;

  // Hide video and overlay canvas if visible
  const vid = document.getElementById("ending");
  vid.pause();
  vid.currentTime      = 0;
  vid.style.display    = "none";
  overlayCanvas.style.display = "none";

  roomsFleed          = 0;
  imposterChaseRoom   = 0;
  brDoorTriggered     = false;
  standoffBg2FadeStep = 0;

  drawerNote.visible  = false;
  morseShelf2.visible = false;

  room1.door.isOpen        = false;
  room2.doorLeft.isOpen    = false;
  room2.doorRight.isOpen   = false;
  room2.drawer.isOpen      = false;
  room2.keyShelf.keyPickedUp = false;
  room3.doorLeft.isOpen    = false;
  room3.doorRight.isOpen   = false;
  room3.drawer.isOpen      = false;
  room4.doorLeft.isOpen    = false;
  room4.doorRight.isOpen   = false;
  room5.doorLeft.isOpen    = false;
  room5.doorRight.isOpen   = false;
  room6.doorLeft.isOpen    = false;
  room6.doorRight.isOpen   = false;
  room7.doorLeft.isOpen    = false;

  hudMessage      = "";
  hudMessageTimer = 0;

  switchRoom(1);
}


// ── Room definitions ──────────────────────────────────────────────────────────

let currentRoom = null;

// ── Room 1 ───────────────────────────────────────────────────────────────────

const room1 = {
  id: 1,
  worldWidth: 1692,
  maxCameraX: 1692 - canvas.width,
  cameraX: 0,

  interactables: [
    {
      type: "door",
      img: function() { return this.isOpen ? ni(imgDoorOpen, imgNightDoorOpen) : ni(imgDoorClosed, imgNightDoorClosed); },
      xWorld: 0,
      isOpen: false,
      centre: 0,
      range: 40,
    },
  ],

  exit: { centre: 0, range: 0, targetRoom: 2 },
  props: [],
  get door() { return this.interactables[0]; },
};

// ── Room 2 ───────────────────────────────────────────────────────────────────

const room2 = {
  id: 2,
  worldWidth: 1692,
  maxCameraX: 1692 - canvas.width,
  cameraX: 0,

  interactables: [
    {
      type: "drawer",
      img: function() { return this.isOpen ? ni(imgDrawerOpen, imgNightDrawerOpen) : ni(imgDrawerClosed, imgNightDrawerClosed); },
      xWorld: 900,
      isOpen: false,
      centre: 0,
      range: 55,
    },
    {
      type: "doorLeft",
      img: function() { return this.isOpen ? ni(imgDoorOpen, imgNightDoorOpen) : ni(imgDoorClosed, imgNightDoorClosed); },
      xWorld: 0,
      isOpen: false,
      centre: 0,
      range: 40,
      flipped: true,
    },
    {
      type: "doorRight",
      img: function() { return this.isOpen ? ni(imgDoorOpen, imgNightDoorOpen) : ni(imgDoorClosed, imgNightDoorClosed); },
      xWorld: 0,
      isOpen: false,
      centre: 0,
      range: 40,
      flipped: false,
      locked: true,
    },
    {
      type: "keyShelf",
      xWorld: 150,
      centre: 0,
      range: 45,
      keyPickedUp: false,
    },
  ],

  exitLeft:  { centre: 0, range: 0, targetRoom: 1 },
  exitRight: { centre: 0, range: 0, targetRoom: 3 },

  props: [
    { img: function() { return ni(imgShelf1, imgNightShelf1); }, xWorld: 400 },
    { img: function() { return ni(imgShelf2, imgNightShelf2); }, xWorld: 650 },
    { img: function() { return ni(imgShelf1, imgNightShelf1); }, xWorld: 1100 },
    { img: function() { return ni(imgShelf2, imgNightShelf2); }, xWorld: 1300 },
    { img: function() { return ni(imgShelf1, imgNightShelf1); }, xWorld: 150 },
    { img: function() { return ni(imgShelf2, imgNightShelf2); }, xWorld: 1500 },
  ],

  get drawer()    { return this.interactables[0]; },
  get doorLeft()  { return this.interactables[1]; },
  get doorRight() { return this.interactables[2]; },
  get keyShelf()  { return this.interactables[3]; },
};


// ── Room 3 ───────────────────────────────────────────────────────────────────

const room3 = {
  id: 3,
  worldWidth: 1692,
  maxCameraX: 1692 - canvas.width,
  cameraX: 0,

  interactables: [
    {
      type: "drawer",
      img: function() { return this.isOpen ? ni(imgDrawerOpen, imgNightDrawerOpen) : ni(imgDrawerClosed, imgNightDrawerClosed); },
      xWorld: 900,
      isOpen: false,
      centre: 0,
      range: 55,
    },
    {
      type: "doorLeft",
      img: function() { return this.isOpen ? ni(imgDoorOpen, imgNightDoorOpen) : ni(imgDoorClosed, imgNightDoorClosed); },
      xWorld: 0,
      isOpen: false,
      centre: 0,
      range: 40,
      flipped: true,
    },
    {
      type: "doorRight",
      img: function() { return this.isOpen ? ni(imgDoorOpen, imgNightDoorOpen) : ni(imgDoorClosed, imgNightDoorClosed); },
      xWorld: 0,
      isOpen: false,
      centre: 0,
      range: 40,
      flipped: false,
      locked: true,
    },
  ],

  exitLeft:  { centre: 0, range: 0, targetRoom: 2 },
  exitRight: null,

  props: [
    { img: function() { return ni(imgShelf1, imgNightShelf1); }, xWorld: 400 },
    { img: function() { return ni(imgShelf2, imgNightShelf2); }, xWorld: 650 },
    { img: function() { return ni(imgShelf1, imgNightShelf1); }, xWorld: 1100 },
    { img: function() { return ni(imgShelf2, imgNightShelf2); }, xWorld: 1300 },
    { img: function() { return ni(imgShelf1, imgNightShelf1); }, xWorld: 150 },
    { img: function() { return ni(imgShelf2, imgNightShelf2); }, xWorld: 1500 },
  ],

  get drawer()    { return this.interactables[0]; },
  get doorLeft()  { return this.interactables[1]; },
  get doorRight() { return this.interactables[2]; },
};


// ── Room 4 ───────────────────────────────────────────────────────────────────

const room4 = {
  id: 4,
  worldWidth: 1692,
  maxCameraX: 1692 - canvas.width,
  cameraX: 0,

  interactables: [
    {
      type: "doorLeft",
      img: function() { return this.isOpen ? ni(imgDoorOpen, imgNightDoorOpen) : ni(imgDoorClosed, imgNightDoorClosed); },
      xWorld: 0,
      isOpen: false,
      centre: 0,
      range: 40,
      flipped: true,
    },
    {
      type: "doorRight",
      img: function() { return this.isOpen ? ni(imgDoorOpen, imgNightDoorOpen) : ni(imgDoorClosed, imgNightDoorClosed); },
      xWorld: 0,
      isOpen: false,
      centre: 0,
      range: 40,
      flipped: false,
    },
  ],

  exitLeft:  { centre: 0, range: 0, targetRoom: 3 },
  exitRight: { centre: 0, range: 0, targetRoom: 5 },

  props: [
    { img: function() { return sh1(); }, xWorld: 400  },
    { img: function() { return sh2(); }, xWorld: 650  },
    { img: function() { return sh1(); }, xWorld: 1100 },
    { img: function() { return sh2(); }, xWorld: 1300 },
    { img: function() { return sh1(); }, xWorld: 150  },
    { img: function() { return sh2(); }, xWorld: 1500 },
  ],

  get doorLeft()  { return this.interactables[0]; },
  get doorRight() { return this.interactables[1]; },
};

// ── Room 5 ───────────────────────────────────────────────────────────────────

const room5 = {
  id: 5,
  worldWidth: 1692,
  maxCameraX: 1692 - canvas.width,
  cameraX: 0,

  interactables: [
    {
      type: "doorLeft",
      img: function() {
        if (brDoorTriggered) return imgDoorClosedBr;
        return this.isOpen ? ni(imgDoorOpen, imgNightDoorOpen) : ni(imgDoorClosed, imgNightDoorClosed);
      },
      xWorld: 0,
      isOpen: false,
      centre: 0,
      range: 40,
      flipped: true,
    },
    {
      type: "doorRight",
      img: function() { return this.isOpen ? ni(imgDoorOpen, imgNightDoorOpen) : ni(imgDoorClosed, imgNightDoorClosed); },
      xWorld: 0,
      isOpen: false,
      centre: 0,
      range: 40,
      flipped: false,
    },
  ],

  exitLeft:  { centre: 0, range: 0, targetRoom: 4 },
  exitRight: { centre: 0, range: 0, targetRoom: 6 },

  props: [
    { img: function() { return sh1(); }, xWorld: 400  },
    { img: function() { return sh2(); }, xWorld: 650  },
    { img: function() { return sh1(); }, xWorld: 1100 },
    { img: function() { return sh2(); }, xWorld: 1300 },
    { img: function() { return sh1(); }, xWorld: 150  },
    { img: function() { return sh2(); }, xWorld: 1500 },
  ],

  get doorLeft()  { return this.interactables[0]; },
  get doorRight() { return this.interactables[1]; },
};

// ── Room 6 ───────────────────────────────────────────────────────────────────

const imgPentagram = loadImage("img/night/pentagram.png");

const room6 = {
  id: 6,
  worldWidth: 1692,
  maxCameraX: 1692 - canvas.width,
  cameraX: 0,

  interactables: [
    {
      type: "doorLeft",
      img: function() { return this.isOpen ? ni(imgDoorOpen, imgNightDoorOpen) : ni(imgDoorClosed, imgNightDoorClosed); },
      xWorld: 0,
      isOpen: false,
      centre: 0,
      range: 40,
      flipped: true,
    },
    {
      type: "doorRight",
      img: function() { return this.isOpen ? ni(imgDoorOpen, imgNightDoorOpen) : ni(imgDoorClosed, imgNightDoorClosed); },
      xWorld: 0,
      isOpen: false,
      centre: 0,
      range: 40,
      flipped: false,
      locked: true,
    },
  ],

  exitLeft:  { centre: 0, range: 0, targetRoom: 5 },
  exitRight: { centre: 0, range: 0, targetRoom: 7 },

  props: [
    { img: function() { return sh1(); }, xWorld: 400  },
    { img: function() { return sh2(); }, xWorld: 650  },
    { img: function() { return sh1(); }, xWorld: 1100 },
    { img: function() { return sh2(); }, xWorld: 1300 },
    { img: function() { return sh1(); }, xWorld: 150  },
    { img: function() { return sh2(); }, xWorld: 1500 },
  ],

  pentagram: { xWorld: 820 },

  get doorLeft()  { return this.interactables[0]; },
  get doorRight() { return this.interactables[1]; },
};


// ── Room 7 ───────────────────────────────────────────────────────────────────

const room7 = {
  id: 7,
  worldWidth: 1692,
  maxCameraX: 1692 - canvas.width,
  cameraX: 0,

  interactables: [
    {
      type: "doorLeft",
      img: function() { return this.isOpen ? ni(imgDoorOpen, imgNightDoorOpen) : ni(imgDoorClosed, imgNightDoorClosed); },
      xWorld: 0,
      isOpen: false,
      centre: 0,
      range: 40,
      flipped: true,
    },
  ],

  exitLeft: { centre: 0, range: 0, targetRoom: 6 },
  exitRight: null,

  props: [
    { img: function() { return imgShelf1Br; }, xWorld: 400  },
    { img: function() { return imgShelf2Br; }, xWorld: 650  },
    { img: function() { return imgShelf1Br; }, xWorld: 1100 },
    { img: function() { return imgShelf2Br; }, xWorld: 1300 },
    { img: function() { return imgShelf1Br; }, xWorld: 150  },
  ],

  imposterStartX: 0,

  get doorLeft() { return this.interactables[0]; },
};


function playerNear(centre, range) {
  return Math.abs(player.x - centre) <= range;
}


// ── Room setup (image-size-dependent) ────────────────────────────────────────

imgMidground.onload = () => {
  const mgW = imgMidground.width;
  for (const room of [room1, room2, room3, room4, room5, room6, room7]) {
    room.maxCameraX = (mgW - canvas.width) / MIDGROUND_SPEED;
    room.worldWidth = room.maxCameraX + canvas.width;
  }
  setupRoom1Door();
  setupRoom2();
  setupRoom3();
  setupRoom4();
  setupRoom5();
  setupRoom6();
  setupRoom7();
};

imgDoorClosed.onload = () => {
  setupRoom1Door(); setupRoom2(); setupRoom3(); setupRoom4(); setupRoom5(); setupRoom6(); setupRoom7();
};

function setupRoom1Door() {
  if (!imgMidground.complete || !imgMidground.width) return;
  const mgW = imgMidground.width;
  const dw  = imgDoorClosed.width || 0;

  room1.door.xWorld = mgW - dw + 25;

  const screenXAtMax = room1.door.xWorld - room1.maxCameraX * MIDGROUND_SPEED;
  const visualWorldX = room1.maxCameraX + screenXAtMax + dw / 2;
  const range        = (Math.abs(room1.worldWidth - visualWorldX) + canvas.width / 2) / 4;

  room1.door.range  = range;
  room1.door.centre = visualWorldX + (room1.worldWidth - visualWorldX) * 0.75;

  room1.exit.centre = room1.door.centre;
  room1.exit.range  = room1.door.range;
}

function setupRoom2() {
  if (!imgMidground.complete || !imgMidground.width) return;
  const mgW = imgMidground.width;
  const dw  = imgDoorClosed.width || 0;

  room2.doorRight.xWorld = mgW - dw + 25;
  const rScreenAtMax  = room2.doorRight.xWorld - room2.maxCameraX * MIDGROUND_SPEED;
  const rVisualWorldX = room2.maxCameraX + rScreenAtMax + dw / 2;
  const rRange        = (Math.abs(room2.worldWidth - rVisualWorldX) + canvas.width / 2) / 4;
  room2.doorRight.range  = rRange;
  room2.doorRight.centre = rVisualWorldX + (room2.worldWidth - rVisualWorldX) * 0.75;

  room2.exitRight.centre = room2.doorRight.centre;
  room2.exitRight.range  = room2.doorRight.range;

  room2.doorLeft.xWorld = -25;
  room2.doorLeft.centre = 36;
  room2.doorLeft.range  = 40;

  room2.exitLeft.centre = room2.doorLeft.centre;
  room2.exitLeft.range  = room2.doorLeft.range;

  const drawer      = room2.drawer;
  const drawerWidth = imgDrawerClosed.width || 48;
  drawer.centre     = (drawer.xWorld + (drawerWidth * 0.2)) / MIDGROUND_SPEED;

  const ks  = room2.keyShelf;
  ks.centre = (ks.xWorld + 175) / MIDGROUND_SPEED;

  morseShelf2.centre = ks.centre + 400;
}

function setupRoom3() {
  if (!imgMidground.complete || !imgMidground.width) return;
  const mgW = imgMidground.width;
  const dw  = imgDoorClosed.width || 0;

  room3.doorRight.xWorld = mgW - dw + 25;
  const rScreenAtMax  = room3.doorRight.xWorld - room3.maxCameraX * MIDGROUND_SPEED;
  const rVisualWorldX = room3.maxCameraX + rScreenAtMax + dw / 2;
  const rRange        = (Math.abs(room3.worldWidth - rVisualWorldX) + canvas.width / 2) / 4;
  room3.doorRight.range  = rRange;
  room3.doorRight.centre = rVisualWorldX + (room3.worldWidth - rVisualWorldX) * 0.75;

  room3.exitRight = { centre: room3.doorRight.centre, range: room3.doorRight.range, targetRoom: 4 };

  room3.doorLeft.xWorld = -25;
  room3.doorLeft.centre = 36;
  room3.doorLeft.range  = 40;

  room3.exitLeft.centre = room3.doorLeft.centre;
  room3.exitLeft.range  = room3.doorLeft.range;

  const drawer      = room3.drawer;
  const drawerWidth = imgDrawerClosed.width || 48;
  drawer.centre     = (drawer.xWorld + (drawerWidth * 0.2)) / MIDGROUND_SPEED;

  morseShelf3.centre = (morseShelf3.xWorld + 60) / MIDGROUND_SPEED;
}

function setupRoom4() {
  if (!imgMidground.complete || !imgMidground.width) return;

  room4.doorLeft.xWorld = -25;
  room4.doorLeft.centre = 36;
  room4.doorLeft.range  = 40;

  room4.exitLeft.centre = room4.doorLeft.centre;
  room4.exitLeft.range  = room4.doorLeft.range;

  const mgW = imgMidground.width;
  const dw  = imgDoorClosed.width || 0;

  room4.doorRight.xWorld = mgW - dw + 25;
  const rScreenAtMax  = room4.doorRight.xWorld - room4.maxCameraX * MIDGROUND_SPEED;
  const rVisualWorldX = room4.maxCameraX + rScreenAtMax + dw / 2;
  const rRange        = (Math.abs(room4.worldWidth - rVisualWorldX) + canvas.width / 2) / 4;
  room4.doorRight.range  = rRange;
  room4.doorRight.centre = rVisualWorldX + (room4.worldWidth - rVisualWorldX) * 0.75;

  room4.exitRight.centre = room4.doorRight.centre;
  room4.exitRight.range  = room4.doorRight.range;
}

function setupRoom5() {
  if (!imgMidground.complete || !imgMidground.width) return;
  const mgW = imgMidground.width;
  const dw  = imgDoorClosed.width || 0;

  room5.doorLeft.xWorld = -25;
  room5.doorLeft.centre = 36;
  room5.doorLeft.range  = 40;
  room5.exitLeft.centre = room5.doorLeft.centre;
  room5.exitLeft.range  = room5.doorLeft.range;

  room5.doorRight.xWorld = mgW - dw + 25;
  const r5ScreenAtMax  = room5.doorRight.xWorld - room5.maxCameraX * MIDGROUND_SPEED;
  const r5VisualWorldX = room5.maxCameraX + r5ScreenAtMax + dw / 2;
  const r5Range        = (Math.abs(room5.worldWidth - r5VisualWorldX) + canvas.width / 2) / 4;
  room5.doorRight.range  = r5Range;
  room5.doorRight.centre = r5VisualWorldX + (room5.worldWidth - r5VisualWorldX) * 0.75;
  room5.exitRight.centre = room5.doorRight.centre;
  room5.exitRight.range  = room5.doorRight.range;
}

function setupRoom6() {
  if (!imgMidground.complete || !imgMidground.width) return;
  const mgW = imgMidground.width;
  const dw  = imgDoorClosed.width || 0;

  room6.doorLeft.xWorld = -25;
  room6.doorLeft.centre = 36;
  room6.doorLeft.range  = 40;
  room6.exitLeft.centre = room6.doorLeft.centre;
  room6.exitLeft.range  = room6.doorLeft.range;

  room6.doorRight.xWorld = mgW - dw + 25;
  const r6ScreenAtMax  = room6.doorRight.xWorld - room6.maxCameraX * MIDGROUND_SPEED;
  const r6VisualWorldX = room6.maxCameraX + r6ScreenAtMax + dw / 2;
  const r6Range        = (Math.abs(room6.worldWidth - r6VisualWorldX) + canvas.width / 2) / 4;
  room6.doorRight.range  = r6Range;
  room6.doorRight.centre = r6VisualWorldX + (room6.worldWidth - r6VisualWorldX) * 0.75;

  room6.exitRight.centre = room6.doorRight.centre;
  room6.exitRight.range  = room6.doorRight.range;
}

function setupRoom7() {
  if (!imgMidground.complete || !imgMidground.width) return;

  room7.doorLeft.xWorld = -25;
  room7.doorLeft.centre = 36;
  room7.doorLeft.range  = 40;
  room7.exitLeft.centre = room7.doorLeft.centre;
  room7.exitLeft.range  = room7.doorLeft.range;

  room7.imposterStartX = Math.round(room7.maxCameraX * MIDGROUND_SPEED + 220);
}


// ── Switch room ───────────────────────────────────────────────────────────────

function switchRoom(id) {
  const previousRoomId = currentRoom ? currentRoom.id : null;

  if      (id === 1) currentRoom = room1;
  else if (id === 2) currentRoom = room2;
  else if (id === 3) currentRoom = room3;
  else if (id === 4) currentRoom = room4;
  else if (id === 5) currentRoom = room5;
  else if (id === 6) currentRoom = room6;
  else if (id === 7) currentRoom = room7;

  if (id === 7) {
    chaseMode.stage          = "idle";
    chaseMode.active         = false;
    chaseMode.imposterX      = room7.imposterStartX || Math.round(room7.maxCameraX * MIDGROUND_SPEED + 220);
    chaseMode.imposterMoving = false;
    chaseMode.imposterFacing = "left";
    chaseMode.timer          = 0;
    imposterChaseRoom        = 7;
    roomsFleed               = 0;
    player.x      = 50;
    player.facing = "right";
    currentRoom.cameraX = 0;
    return;
  }

  if (chaseMode.stage === "chase" || chaseMode.stage === "freeze") {
    if (previousRoomId && id < previousRoomId) {
      roomsFleed++;
      if (roomsFleed >= 2 && !brDoorTriggered) {
        brDoorTriggered = true;
      }
    }
  }

  if (id === 1 && previousRoomId === 2) {
    player.x = room1.door.centre;
    player.facing = "left";
    currentRoom.cameraX = room1.maxCameraX;
  } else if (id === 2 && previousRoomId === 3) {
    player.x      = room2.doorRight.centre;
    player.facing = "left";
    currentRoom.cameraX = room2.maxCameraX;
  } else if (id === 3 && previousRoomId === 4) {
    player.x      = room3.doorRight.centre;
    player.facing = "left";
    currentRoom.cameraX = room3.maxCameraX;
  } else if (id === 4 && previousRoomId === 5) {
    player.x      = room4.doorRight.centre;
    player.facing = "left";
    currentRoom.cameraX = room4.maxCameraX;
  } else if (id === 5 && previousRoomId === 6) {
    player.x      = room5.doorRight.centre;
    player.facing = "left";
    currentRoom.cameraX = room5.maxCameraX;
  } else if (id === 6 && previousRoomId === 7) {
    player.x      = room6.doorRight.centre;
    player.facing = "left";
    currentRoom.cameraX = room6.maxCameraX;
  } else if (id === 4) {
    player.x      = 50;
    player.facing = "right";
    currentRoom.cameraX = 0;
  } else {
    player.x      = 50;
    player.facing = "right";
    currentRoom.cameraX = 0;
  }

  player.isMoving = false;
}

currentRoom = room1;


// ── Update ────────────────────────────────────────────────────────────────────

function update() {

  if (chaseMode.stage === "caught") {
    chaseMode.timer--;
    if (chaseMode.timer <= 0) resetGame();
    return;
  }

  if (chaseMode.stage === "win") {
    return;
  }

  if (chaseMode.stage === "cornered") {
    chaseMode.imposterX     -= chaseMode.imposterSpeed;
    chaseMode.imposterMoving  = true;
    chaseMode.imposterFacing  = "left";

    // Keep chase_effect1 playing while the imposter is walking in
    if (chaseEffect.paused) chaseEffect.play().catch(() => {});

    const playerScreenX   = player.x - room5.cameraX;
    const imposterScreenX = chaseMode.imposterX - room5.cameraX * MIDGROUND_SPEED;
    if (imposterScreenX <= playerScreenX + 15) {
      chaseMode.imposterMoving = false;
      chaseMode.stage          = "standoff";
      chaseMode.timer          = 120;

      // Imposter has stopped — cut the chase effect immediately
      chaseEffect.pause();
      chaseEffect.currentTime = 0;

      // Begin fading out bg2 over the standoff duration (120 frames)
      standoffBg2FadeStep = musicBg2.volume / 120;
    }

    updateImposterAnimation();
    return;
  }

  if (chaseMode.stage === "standoff") {
    // Tick bg2 fade-out every frame
    if (musicBg2.volume > 0) {
      musicBg2.volume = Math.max(0, musicBg2.volume - standoffBg2FadeStep);
    }

    chaseMode.timer--;
    if (chaseMode.timer <= 0) {
      chaseMode.stage = "win";
      // Stop all audio
      music.pause();        music.currentTime = 0;
      musicBg2.pause();     musicBg2.volume = 0;
      footsteps.pause();    footsteps.currentTime = 0;
      runningFootsteps.pause(); runningFootsteps.currentTime = 0;
      chaseEffect.pause();  chaseEffect.currentTime = 0;
      creepSounds.forEach(c => { c.pause(); c.currentTime = 0; });
      // Kick off the camera-blink transition instead of showing video directly
      startCameraBlink();
    }
    updateImposterAnimation();
    return;
  }

  if (fade.state !== "none") {
    updateFade();
    Object.assign(prevKeys, keys);
    return;
  }

  const room   = currentRoom;
  let   moving = false;

  if (chaseMode.stage === "freeze") {
    player.isMoving          = false;
    chaseMode.imposterMoving = false;

    if (!footsteps.paused)        { footsteps.pause();        footsteps.currentTime = 0; }
    if (!runningFootsteps.paused) { runningFootsteps.pause(); runningFootsteps.currentTime = 0; }
    if (!chaseEffect.paused)      { chaseEffect.pause();      chaseEffect.currentTime = 0; }

    chaseMode.timer--;
    if (chaseMode.timer <= 0) {
      chaseMode.stage          = "chase";
      chaseMode.active         = true;
      chaseMode.imposterMoving = true;
    }

    room.cameraX = Math.max(0, Math.min(room.maxCameraX, player.x - canvas.width / 2));
    updateImposterAnimation();
    tickHUD();
    return;
  }

  const canMove = !padlock.overlay && !drawerNote.visible && !morseShelf2.visible;

  const moveSpeed = chaseMode.active ? 3.5 : player.speed;

  if (canMove) {
    if (keys["KeyA"]) { player.x -= moveSpeed; player.facing = "left";  moving = true; }
    if (keys["KeyD"]) { player.x += moveSpeed; player.facing = "right"; moving = true; }
    if (keys["KeyW"]) { player.y -= moveSpeed; moving = true; }
    if (keys["KeyS"]) { player.y += moveSpeed; moving = true; }
  }

  player.isMoving = moving;

  const sprite = player.isMoving
    ? (chaseMode.active ? runFrames[frameIndex] : (nightMode.active ? nightWalkFrames[frameIndex] : walkFrames[frameIndex]))
    : (chaseMode.active ? imgScPlayer : (nightMode.active ? imgNightIdle : imgIdle));

  const w = (sprite && sprite.width)  || 34;
  const h = (sprite && sprite.height) || 110;

  player.x = Math.max(w / 2, Math.min(room.worldWidth - w / 2, player.x));

  const topLimit    = canvas.height * 0.30 + h;
  const bottomLimit = canvas.height;
  player.y = Math.max(topLimit, Math.min(bottomLimit, player.y));

  room.cameraX = Math.max(0, Math.min(room.maxCameraX, player.x - canvas.width / 2));

  if (room.id === 7 && chaseMode.stage === "idle") {
    chaseMode.imposterMoving = false;
    chaseMode.imposterFacing = "left";

    const nearEnd = room.cameraX >= room.maxCameraX - 10;
    if (nearEnd) {
      chaseMode.stage          = "freeze";
      chaseMode.timer          = FREEZE_FRAMES;
      chaseMode.active         = false;
      chaseMode.imposterMoving = false;
    }
  }

  if (room.id === 7 && chaseMode.stage === "chase") {
    chaseMode.imposterX     -= chaseMode.imposterSpeed;
    chaseMode.imposterFacing  = "left";
    chaseMode.imposterMoving  = true;

    const playerScreenX   = player.x - room.cameraX;
    const imposterScreenX = chaseMode.imposterX - room.cameraX * MIDGROUND_SPEED;
    if (imposterScreenX <= playerScreenX + 20) {
      chaseMode.stage = "caught";
      chaseMode.timer = CAUGHT_FRAMES;
      chaseMode.imposterMoving = false;
    }
  }

  if (room.id === 5 && brDoorTriggered && chaseMode.stage === "chase") {
    if (playerNear(room5.doorLeft.centre, room5.doorLeft.range + 10)) {
      player.isMoving          = false;
      chaseMode.stage          = "cornered";
      chaseMode.imposterX      = room5.cameraX * MIDGROUND_SPEED + canvas.width + 10;
      chaseMode.imposterMoving = false;
    }
  }

  if (room.id === 5 && brDoorTriggered) {
    player.x = Math.max(room5.doorLeft.centre + 20, player.x);
  }

  const canInteract = !padlock.overlay && !drawerNote.visible && !morseShelf2.visible
                      && chaseMode.stage === "idle" && !chaseMode.active;

  if (canInteract) {

    if (keys["KeyE"] && !prevKeys["KeyE"]) {
      let interacted = false;

      if (room.id === 2) {
        const ks = room2.keyShelf;
        if (!ks.keyPickedUp && playerNear(ks.centre, ks.range)) {
          ks.keyPickedUp   = true;
          inventory.hasKey = true;
          showHUD("You picked up a key.");
          interacted = true;
        }

        if (!interacted && playerNear(morseShelf2.centre, morseShelf2.range)) {
          morseShelf2.visible = true;
          interacted = true;
        }

        if (!interacted && playerNear(room2.doorRight.centre, room2.doorRight.range)) {
          if (inventory.hasKey) {
            room2.doorRight.isOpen = true;
          } else {
            showHUD("The door is locked.");
          }
          interacted = true;
        }
      }

      if (room.id === 3) {
        const dr = room3.drawer;
        if (dr.isOpen && playerNear(dr.centre, dr.range)) {
          drawerNote.visible = true;
          interacted = true;
        }

        if (!interacted && playerNear(room3.doorRight.centre, room3.doorRight.range)) {
          if (!padlock.open) {
            padlock.overlay = true;
            padlock.input   = "";
          }
          interacted = true;
        }
      }

      if (!interacted && room.id === 6 && playerNear(room6.doorRight.centre, room6.doorRight.range)) {
        room6.doorRight.isOpen = true;
        interacted = true;
      }

      if (!interacted) {
        for (const obj of room.interactables) {
          if (obj.type === "keyShelf") continue;
          if (room.id === 2 && obj.type === "doorRight") continue;
          if (room.id === 3 && obj.type === "doorRight") continue;
          if (room.id === 6 && obj.type === "doorRight") continue;
          if (room.id === 3 && obj.type === "drawer" && obj.isOpen && playerNear(obj.centre, obj.range)) {
            obj.isOpen = false;
            interacted = true;
            break;
          }
          if (playerNear(obj.centre, obj.range)) {
            obj.isOpen = !obj.isOpen;
            interacted = true;
            break;
          }
        }
      }
    }

    if (keys["Enter"] && !prevKeys["Enter"]) {
      if (room.id === 1 && room.exit) {
        if (room1.door.isOpen && playerNear(room.exit.centre, room.exit.range)) {
          startFadeTo(room.exit.targetRoom);
        }
      } else if (room.id === 2) {
        if (room2.doorLeft.isOpen && playerNear(room2.exitLeft.centre, room2.exitLeft.range)) {
          startFadeTo(1);
        }
        if (room2.doorRight.isOpen && playerNear(room2.exitRight.centre, room2.exitRight.range)) {
          startFadeTo(3);
        }
      } else if (room.id === 3) {
        if (room3.doorLeft.isOpen && playerNear(room3.exitLeft.centre, room3.exitLeft.range)) {
          startFadeTo(2);
        }
        if (room3.exitRight && room3.doorRight.isOpen && playerNear(room3.exitRight.centre, room3.exitRight.range)) {
          startFadeTo(4);
        }
      } else if (room.id === 4) {
        if (room4.doorLeft.isOpen && playerNear(room4.exitLeft.centre, room4.exitLeft.range)) {
          startFadeTo(3);
        }
        if (room4.doorRight.isOpen && playerNear(room4.exitRight.centre, room4.exitRight.range)) {
          startFadeTo(5);
        }
      } else if (room.id === 5) {
        if (!brDoorTriggered && room5.doorLeft.isOpen && playerNear(room5.exitLeft.centre, room5.exitLeft.range)) {
          startFadeTo(4);
        }
        if (room5.doorRight.isOpen && playerNear(room5.exitRight.centre, room5.exitRight.range)) {
          startFadeTo(6);
        }
      } else if (room.id === 6) {
        if (room6.doorLeft.isOpen && playerNear(room6.exitLeft.centre, room6.exitLeft.range)) {
          startFadeTo(5);
        }
        if (room6.doorRight.isOpen && playerNear(room6.exitRight.centre, room6.exitRight.range)) {
          startFadeTo(7);
        }
      } else if (room.id === 7) {
        if (room7.doorLeft.isOpen && playerNear(room7.exitLeft.centre, room7.exitLeft.range)) {
          startFadeTo(6);
        }
      }
    }
  }

  if (chaseMode.active && chaseMode.stage === "chase") {
    const r = currentRoom;
    if (r.id === 7 && playerNear(room7.doorLeft.centre, room7.doorLeft.range)) {
      room7.doorLeft.isOpen = true;
      startFadeTo(6);
    }
    if (r.id === 6 && playerNear(room6.exitLeft.centre, room6.exitLeft.range)) {
      room6.doorLeft.isOpen = true;
      startFadeTo(5);
    }
    if (r.id === 5 && !brDoorTriggered && playerNear(room5.exitLeft.centre, room5.exitLeft.range)) {
      room5.doorLeft.isOpen = true;
      startFadeTo(4);
    }
    if (r.id === 4 && playerNear(room4.exitLeft.centre, room4.exitLeft.range)) {
      room4.doorLeft.isOpen = true;
      startFadeTo(3);
    }
  }

  if (currentRoom.id === 4 && !nightMode.active && player.x >= 400) {
    setNightMode(true);
  }

  if (padlock.shake > 0) padlock.shake--;

  prevKeys["KeyE"]  = keys["KeyE"];
  prevKeys["Enter"] = keys["Enter"];

  updateAnimation();
  updateImposterAnimation();
  updateFootsteps();
  updateCreepSounds();
  tickHUD();
}


// ── Draw helpers ──────────────────────────────────────────────────────────────

function drawBackground(cameraX) {
  const bg = nightMode.active ? imgNightBackground : imgBackground;
  if (!bg || !bg.complete || !bg.width) return;
  const bgW      = bg.width;
  const offsetX  = cameraX * BG_SPEED;
  const maxScroll = bgW - canvas.width;
  const bgX      = Math.max(0, Math.min(maxScroll, offsetX));
  ctx.drawImage(bg, -bgX | 0, 0, bgW, canvas.height);
}

function drawMidground(cameraX) {
  const mg = nightMode.active ? imgNightMidground : imgMidground;
  if (!mg || !mg.complete || !mg.width) return;
  const offsetX = (cameraX * MIDGROUND_SPEED) | 0;
  ctx.drawImage(mg, -offsetX, 0);
}

function drawMgSprite(img, xWorld, cameraX, flipped) {
  if (!img || !img.complete || !img.width) return;
  const screenX = (xWorld - cameraX * MIDGROUND_SPEED) | 0;
  if (screenX + img.width < 0 || screenX > canvas.width) return;

  ctx.save();
  if (flipped) {
    ctx.translate(screenX + img.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0);
  } else {
    ctx.drawImage(img, screenX, 0);
  }
  ctx.restore();
}

function drawHint(text, xWorld, cameraX) {
  const screenX = (xWorld - cameraX * MIDGROUND_SPEED) | 0;
  ctx.save();
  ctx.font      = "9px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.textAlign = "center";
  ctx.fillText(text, screenX, 18);
  ctx.restore();
}

function drawPlayer(cameraX) {
  let sprite;
  if (chaseMode.stage === "freeze") {
    sprite = imgScPlayer;
  } else if (chaseMode.active && player.isMoving) {
    sprite = runFrames[frameIndex];
  } else if (chaseMode.active && !player.isMoving) {
    sprite = imgScPlayer;
  } else if (player.isMoving) {
    sprite = (nightMode.active ? nightWalkFrames : walkFrames)[frameIndex];
  } else {
    sprite = nightMode.active ? imgNightIdle : imgIdle;
  }

  if (!sprite || !sprite.complete) return;

  const w     = sprite.width;
  const h     = sprite.height;
  const drawX = (player.x - w / 2 - cameraX + player.offsetX) | 0;
  const drawY = (player.y - h     + player.offsetY)             | 0;

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

function drawImposter(xWorld, cameraX) {
  const sprite = getImposterSprite();
  if (!sprite || !sprite.complete || !sprite.width) return;
  const w       = sprite.width;
  const h       = sprite.height;
  const screenX = (xWorld - cameraX * MIDGROUND_SPEED) | 0;
  if (screenX + w < 0 || screenX > canvas.width + 20) return;
  const drawY   = (player.y - h) | 0;

  ctx.save();
  if (chaseMode.imposterFacing === "left") {
    ctx.translate(screenX + w, drawY);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, 0, 0);
  } else {
    ctx.drawImage(sprite, screenX, drawY);
  }
  ctx.restore();
}


// ── Room renderers ────────────────────────────────────────────────────────────

function renderRoom1() {
  const cam  = room1.cameraX;
  const door = room1.door;

  drawBackground(cam);
  drawMidground(cam);
  drawMgSprite(door.img(), door.xWorld, cam, false);

  if (!door.isOpen && playerNear(door.centre, door.range)) {
    drawHint("[E]", door.xWorld + (imgDoorClosed.width || 0) / 2, cam);
  }

  drawPlayer(cam);
}

function renderRoom2() {
  const cam    = room2.cameraX;
  const drawer = room2.drawer;
  const dLeft  = room2.doorLeft;
  const dRight = room2.doorRight;
  const ks     = room2.keyShelf;

  drawBackground(cam);
  drawMidground(cam);

  drawMgSprite(dLeft.img(), dLeft.xWorld, cam, true);
  if (!dLeft.isOpen && playerNear(dLeft.centre, dLeft.range)) {
    drawHint("[E]", dLeft.xWorld + (imgDoorClosed.width || 0) / 2, cam);
  }

  drawMgSprite(dRight.img(), dRight.xWorld, cam, false);
  if (playerNear(dRight.centre, dRight.range)) {
    const label = dRight.isOpen ? "[Enter] Go" : (inventory.hasKey ? "[E] Unlock" : "[E]");
    drawHint(label, dRight.xWorld + (imgDoorClosed.width || 0) / 2, cam);
  }

  for (const prop of room2.props) {
    drawMgSprite(prop.img(), prop.xWorld, cam, false);
  }

  if (!ks.keyPickedUp && playerNear(ks.centre, ks.range)) {
    drawHint("[E] Check", ks.xWorld + 175, cam);
  }

  drawMgSprite(drawer.img(), drawer.xWorld, cam, false);
  if (playerNear(drawer.centre, drawer.range)) {
    drawHint(drawer.isOpen ? "[E] Close" : "[E] Open", drawer.xWorld + (imgDrawerClosed.width || 0) / 2, cam);
  }

  drawPlayer(cam);

  if (playerNear(morseShelf2.centre, morseShelf2.range)) {
    drawHint("[E]", morseShelf2.centre * MIDGROUND_SPEED, cam);
  }
  drawMorseOverlay(morseShelf2.visible);
}

function renderRoom3() {
  const cam    = room3.cameraX;
  const drawer = room3.drawer;
  const dLeft  = room3.doorLeft;
  const dRight = room3.doorRight;

  drawBackground(cam);
  drawMidground(cam);

  drawMgSprite(dLeft.img(), dLeft.xWorld, cam, true);
  if (!dLeft.isOpen && playerNear(dLeft.centre, dLeft.range)) {
    drawHint("[E]", dLeft.xWorld + (imgDoorClosed.width || 0) / 2, cam);
  }

  drawMgSprite(dRight.img(), dRight.xWorld, cam, false);
  if (playerNear(dRight.centre, dRight.range)) {
    drawHint(padlock.open ? "[Enter] Go" : "[E] Padlock", dRight.xWorld + (imgDoorClosed.width || 0) / 2, cam);
  }

  for (const prop of room3.props) {
    drawMgSprite(prop.img(), prop.xWorld, cam, false);
  }

  drawMgSprite(drawer.img(), drawer.xWorld, cam, false);
  if (playerNear(drawer.centre, drawer.range)) {
    drawHint(drawer.isOpen ? "[E] Read note" : "[E] Open", drawer.xWorld + (imgDrawerClosed.width || 0) / 2, cam);
  }

  if (playerNear(morseShelf3.centre, morseShelf3.range)) {
    drawHint("[!]", morseShelf3.xWorld + 60, cam);
  }

  drawPlayer(cam);

  drawMorseOverlay(playerNear(morseShelf3.centre, morseShelf3.range));
  drawDrawerNoteOverlay();
  drawPadlockOverlay();
}

function renderRoom4() {
  const cam   = room4.cameraX;
  const dLeft  = room4.doorLeft;
  const dRight = room4.doorRight;

  drawBackground(cam);
  drawMidground(cam);

  drawMgSprite(dLeft.img(), dLeft.xWorld, cam, true);
  if (!dLeft.isOpen && playerNear(dLeft.centre, dLeft.range)) {
    drawHint("[E]", dLeft.xWorld + (imgNightDoorClosed.width || imgDoorClosed.width || 0) / 2, cam);
  }

  drawMgSprite(dRight.img(), dRight.xWorld, cam, false);
  if (playerNear(dRight.centre, dRight.range)) {
    drawHint(dRight.isOpen ? "[Enter] Go" : "[E]", dRight.xWorld + (imgNightDoorClosed.width || imgDoorClosed.width || 0) / 2, cam);
  }

  for (const prop of room4.props) {
    drawMgSprite(prop.img(), prop.xWorld, cam, false);
  }

  drawPlayer(cam);
}

function renderRoom5() {
  const cam   = room5.cameraX;
  const dLeft  = room5.doorLeft;
  const dRight = room5.doorRight;
  const dw     = imgNightDoorClosed.width || imgDoorClosed.width || 0;

  drawBackground(cam);
  drawMidground(cam);

  drawMgSprite(dLeft.img(), dLeft.xWorld, cam, true);
  if (!brDoorTriggered && !dLeft.isOpen && playerNear(dLeft.centre, dLeft.range)) {
    drawHint("[E]", dLeft.xWorld + dw / 2, cam);
  }

  drawMgSprite(dRight.img(), dRight.xWorld, cam, false);
  if (playerNear(dRight.centre, dRight.range)) {
    drawHint(dRight.isOpen ? "[Enter] Go" : "[E]", dRight.xWorld + dw / 2, cam);
  }

  for (const prop of room5.props) {
    drawMgSprite(prop.img(), prop.xWorld, cam, false);
  }

  if (chaseMode.stage === "cornered" || chaseMode.stage === "standoff") {
    drawImposter(chaseMode.imposterX, cam);
  }

  drawPlayer(cam);
}

function renderRoom6() {
  const cam   = room6.cameraX;
  const dLeft  = room6.doorLeft;
  const dRight = room6.doorRight;
  const dw     = imgNightDoorClosed.width || imgDoorClosed.width || 0;

  drawBackground(cam);
  drawMidground(cam);

  drawMgSprite(dLeft.img(), dLeft.xWorld, cam, true);
  if (!dLeft.isOpen && playerNear(dLeft.centre, dLeft.range)) {
    drawHint("[E]", dLeft.xWorld + dw / 2, cam);
  }

  drawMgSprite(penta(), room6.pentagram.xWorld, cam, false);

  drawMgSprite(dRight.img(), dRight.xWorld, cam, false);
  if (playerNear(dRight.centre, dRight.range)) {
    drawHint(dRight.isOpen ? "[Enter] Go →7" : "[E]", dRight.xWorld + dw / 2, cam);
  }

  for (const prop of room6.props) {
    drawMgSprite(prop.img(), prop.xWorld, cam, false);
  }

  drawPlayer(cam);
}

function renderRoom7() {
  const cam   = room7.cameraX;
  const dLeft  = room7.doorLeft;

  drawBackground(cam);
  drawMidground(cam);

  drawMgSprite(dLeft.img(), dLeft.xWorld, cam, true);

  for (const prop of room7.props) {
    drawMgSprite(prop.img(), prop.xWorld, cam, false);
  }

  drawImposter(chaseMode.imposterX, cam);

  drawPlayer(cam);
}


// ── Special full-screen overlays ──────────────────────────────────────────────

function renderCaughtScreen() {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function renderWinScreen() {
  // Black base — camera blink and then video plays on top
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Run the camera shutter blink transition
  updateCameraBlink();

  // Once the video is live, draw glitch/nausea effects onto the overlay canvas
  if (cameraBlink.onVideo) {
    drawOverlayChaseEffects();
  }
}


// ── Glitch / nausea effects over the video (overlay canvas) ──────────────────

// Draws the glitch/nausea effects onto the fixed full-screen overlay canvas.
// We can't getImageData from a cross-origin video element, so instead we layer
// semi-transparent colour bands, scanlines, chromatic edge flashes, and a
// vignette — all drawn on the transparent overlay canvas that sits above the video.
function drawOverlayChaseEffects() {
  const W = overlayCanvas.width;
  const H = overlayCanvas.height;
  overlayCtx.clearRect(0, 0, W, H);

  nauseaT += 0.04;

  // ── Nausea sine warp — dark edge bands that shift horizontally ────────────
  overlayCtx.save();
  const strips = 8;
  const stripH = Math.ceil(H / strips);
  for (let i = 0; i < strips; i++) {
    const shift = Math.sin(nauseaT * 1.1 + i * 0.9) * 3;
    if (Math.abs(shift) < 0.5) continue;
    overlayCtx.fillStyle = `rgba(0,0,0,${0.08 + Math.abs(shift) * 0.02})`;
    overlayCtx.fillRect(
      shift > 0 ? 0 : W + shift,
      i * stripH,
      Math.abs(shift),
      stripH
    );
  }
  overlayCtx.restore();

  // ── Occasional glitch slice — coloured band flash ─────────────────────────
  if (glitchTimer > 0) {
    glitchTimer--;
    overlayCtx.save();
    overlayCtx.globalAlpha = 0.55;
    overlayCtx.fillStyle = Math.random() < 0.5
      ? "rgba(255,0,50,0.4)"
      : "rgba(0,200,255,0.3)";
    overlayCtx.fillRect(
      glitchOffset < 0 ? 0 : W - Math.abs(glitchOffset),
      glitchY,
      Math.abs(glitchOffset) + 8,
      glitchH
    );
    overlayCtx.restore();
  } else if (Math.random() < 0.02) {
    glitchTimer  = 2 + Math.floor(Math.random() * 5);
    glitchY      = Math.floor(Math.random() * (H - 8));
    glitchH      = 2 + Math.floor(Math.random() * 10);
    glitchOffset = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.floor(Math.random() * 12));
  }

  // ── CRT scanlines ─────────────────────────────────────────────────────────
  overlayCtx.save();
  overlayCtx.globalAlpha = 0.06 + Math.random() * 0.04;
  overlayCtx.fillStyle   = "rgba(0,0,0,1)";
  for (let y = 0; y < H; y += 3) {
    overlayCtx.fillRect(0, y, W, 1);
  }
  overlayCtx.restore();

  // ── Vignette ──────────────────────────────────────────────────────────────
  overlayCtx.save();
  const vig = overlayCtx.createRadialGradient(W/2, H/2, H * 0.2, W/2, H/2, H * 0.85);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.5)");
  overlayCtx.fillStyle = vig;
  overlayCtx.fillRect(0, 0, W, H);
  overlayCtx.restore();

  // ── Faint red tint ────────────────────────────────────────────────────────
  overlayCtx.save();
  overlayCtx.fillStyle = "rgba(80,0,0,0.08)";
  overlayCtx.fillRect(0, 0, W, H);
  overlayCtx.restore();
}


// ── Glitch / nausea effect (game canvas, during chase) ───────────────────────

let glitchTimer    = 0;
let glitchOffset   = 0;
let glitchY        = 0;
let glitchH        = 0;
let nauseaT        = 0;
let chaseEffectAlpha = 0;

const CHASE_EFFECT_FADE_FRAMES = 60;

function drawChaseEffects() {
  const inChase = chaseMode.active || chaseMode.stage === "freeze" ||
                  chaseMode.stage === "cornered" || chaseMode.stage === "standoff";

  if (!inChase) {
    chaseEffectAlpha = 0;
    return;
  }

  chaseEffectAlpha = Math.min(1, chaseEffectAlpha + 1 / CHASE_EFFECT_FADE_FRAMES);
  const a = chaseEffectAlpha;

  nauseaT += 0.04;

  const W = canvas.width;
  const H = canvas.height;

  // ── Colour-channel shift ──────────────────────────────────────────────────
  const snap = ctx.getImageData(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = 0.08 * a;
  ctx.globalCompositeOperation = "screen";

  ctx.putImageData(snap, 2, 0);
  ctx.fillStyle = `rgba(255,0,0,${0.15 * a})`;
  ctx.fillRect(0, 0, W, H);

  ctx.putImageData(snap, -2, 0);
  ctx.fillStyle = `rgba(0,0,255,${0.15 * a})`;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();

  ctx.putImageData(snap, 0, 0);

  // ── Nausea sine warp ──────────────────────────────────────────────────────
  ctx.save();
  ctx.globalAlpha = 0.55;
  const strips = 6;
  const stripH = Math.ceil(H / strips);
  for (let i = 0; i < strips; i++) {
    const sy    = i * stripH;
    const sh    = Math.min(stripH, H - sy);
    const shift = Math.sin(nauseaT * 1.1 + i * 0.9) * 1.2 * a;
    if (Math.abs(shift) < 0.3) continue;
    const slice = ctx.getImageData(0, sy, W, sh);
    ctx.putImageData(slice, Math.round(shift), sy);
  }
  ctx.restore();

  // ── Occasional glitch slice ───────────────────────────────────────────────
  if (a > 0.3) {
    if (glitchTimer > 0) {
      glitchTimer--;
      const slice = ctx.getImageData(0, glitchY, W, glitchH);
      ctx.putImageData(slice, glitchOffset, glitchY);
    } else if (Math.random() < 0.015 * a) {
      glitchTimer  = 2 + Math.floor(Math.random() * 4);
      glitchY      = Math.floor(Math.random() * (H - 8));
      glitchH      = 2 + Math.floor(Math.random() * 6);
      glitchOffset = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.floor(Math.random() * 8));
    }
  }

  // ── Vignette ──────────────────────────────────────────────────────────────
  ctx.save();
  const vigAlpha = 0.45 * a;
  const vig = ctx.createRadialGradient(W/2, H/2, H * 0.2, W/2, H/2, H * 0.85);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, `rgba(0,0,0,${vigAlpha})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // ── Faint red tint ────────────────────────────────────────────────────────
  ctx.save();
  ctx.fillStyle = `rgba(80,0,0,${0.07 * a})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}


// ── Main render ───────────────────────────────────────────────────────────────

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (chaseMode.stage === "caught") {
    renderCaughtScreen();
    return;
  }
  if (chaseMode.stage === "win") {
    renderWinScreen();
    return;
  }

  if      (currentRoom.id === 1) renderRoom1();
  else if (currentRoom.id === 2) renderRoom2();
  else if (currentRoom.id === 3) renderRoom3();
  else if (currentRoom.id === 4) renderRoom4();
  else if (currentRoom.id === 5) renderRoom5();
  else if (currentRoom.id === 6) renderRoom6();
  else if (currentRoom.id === 7) renderRoom7();

  drawChaseEffects();
  drawHUD();
  drawFade();
}


// ── Loop ─────────────────────────────────────────────────────────────────────

function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}

loop();