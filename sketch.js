// GLOBALS
// =========================
let turn = 1;
let phase = "move";
let phaseStartTime = 0;
let hasFired = false;
let turnWaitStart = null;
let bullets = [];
let explosions = [];
let winTime = null; // time of death
let damPolygons = [];

let selectedMap = 0; // 0 = none, 1 = Lighthouse, 2 = Dam
let Lighthouse = 1;
let Dam = 2;

let hasSpawned = false;

// Power-ups
let speedBoost;
let healPower;
let multiShotPower;
let activePowerUp = null;
let spawnTimer = 0;
let spawnDelay = 0;
let healCrateImg;
let multiShotImg;
let windTimer = 0;
let windStrength = 0;

// Assets
let music, img, img1, img2, img8, img9, img13, img14;

// Initial state
let gameState = "title"; // "title", "mapSelect", "boatSelect", "game", "winner", "credits"

let isMuted = false;
let selectedBoatP1 = 0;
let selectedBoatP2 = 0;
let boatNames = ["MORTAR", "GUN"];
let enterPressed = false;
let spacePressed = false;
let gameStarted = false;

let boat1, boat2;

// Birds for sky
let birds = [];

// scaling for 1200x800 vs original 800 width
const BASE_WIDTH = 800;
let scaleX = 1;

// Screen shake
let shakeMag = 0;
let shakeTime = 0;

// Winner
let winner = null;

//fix title screen translation
let backPressed = false;

//wind indicator animation
let windIndicatorAnimStartTime = 0;
const windIndicatorAnimDuration = 2000;
let isAnimatingWindIndicator = false;
const windIndicatorStart = { x: 0, y: 0, scale: 3 };
const windIndicatorEnd = { x: 0, y: 100, scale: 1 };

const LH_CENTER_X = 600;
const LH_CENTER_Y = 550; 
const LH_SAFE_GAP = 120;

// PRELOAD
// =========================
function preload() {
  healCrateImg = loadImage("healcrate.png");
  multiShotImg = loadImage("multishot.png");
  music = loadSound("backgroundBeat.mp3");
  img = loadImage("BoatGame.png");
  img1 = loadImage("Redboat.png");
  img2 = loadImage("Blueboat.png");
  img8 = loadImage("mortarword.png");
  img9 = loadImage("gunword.png");
  img13 = loadImage("player1.png");
  img14 = loadImage("player2.png");
  img15 = loadImage("lighthouse.png");
}

// EXPLOSION + SHAKE
// =========================
class ExplosionParticle {
  constructor(x, y, size, life, col) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.life = life;
    this.maxLife = life;
    this.col = col;
    this.vx = random(-2, 2);
    this.vy = random(-2, 2);
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
  }
  draw() {
    let a = map(this.life, 0, this.maxLife, 0, 255);
    noStroke();
    fill(this.col[0], this.col[1], this.col[2], a);
    ellipse(this.x, this.y, this.size, this.size);
  }
  get dead() {
    return this.life <= 0;
  }
}

function spawnExplosion(x, y, type = "small") {
  let count = type === "big" ? 45 : 20;
  let baseSize = type === "big" ? 40 : 20;
  let col = type === "big" ? [255, 120, 50] : [255, 200, 60];

  for (let i = 0; i < count; i++) {
    explosions.push(
      new ExplosionParticle(
        x,
        y,
        random(baseSize * 0.4, baseSize),
        random(25, 60),
        col
      )
    );
  }

  if (type === "big") {
    shakeMag = 12;
    shakeTime = 350;
  }
}

function applyScreenShake() {
  if (shakeTime > 0) {
    shakeTime -= deltaTime;
    let dx = random(-shakeMag, shakeMag);
    let dy = random(-shakeMag, shakeMag);
    translate(dx, dy);
  }
}

function updateAndDrawExplosions() {
  for (let i = explosions.length - 1; i >= 0; i--) {
    let e = explosions[i];
    e.update();
    e.draw();
    if (e.dead) explosions.splice(i, 1);
  }
}

// BULLET CLASS
// =========================
class Bullet {
  constructor(x, y, vx, vy, owner, radius = 10, col = [0, 0, 0]) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.xAcc = -0.007;
    this.yAcc = 0.09;
    this.owner = owner;
    this.r = radius;
    this.col = col;
  }
  update() {
    this.vx += this.xAcc + windStrength;
    this.vx += this.xAcc;
    this.x += this.vx;
    this.vy += this.yAcc;
    this.y += this.vy;
  }
  draw() {
    noStroke();
    fill(this.col[0], this.col[1], this.col[2]);
    ellipse(this.x, this.y, this.r, this.r);
  }
}

// =========================
// GUN CLASS
// =========================
class Gun {
  constructor(boat) {
    this.boat = boat;
    this.recoil = 0;
    this.recoilVel = 0;
    this.barrelLength = 75;
    this.multiShotActive = false;
    this.angle = 0;
  }

  update() {
    this.angle = degrees(atan2(mouseY - this.boat.y, mouseX - this.boat.x));
    this.recoil += this.recoilVel;
    this.recoilVel *= 0.8;
    this.recoil = lerp(this.recoil, 0, 0.1);
  }

  fire() {
    const FIXED_RECOIL = -10;
    this.recoilVel = FIXED_RECOIL;

    const angleRad = radians(this.angle);
    const speed = 10;

    const isRight = this.boat.isRightSide;
    const pivotOffsetX = (isRight ? -60 : 45) * this.boat.s;
    const pivotOffsetY = -35 * this.boat.s;

    const startX =
      this.boat.x +
      pivotOffsetX +
      cos(angleRad) * this.barrelLength * this.boat.s;
    const startY =
      this.boat.y +
      pivotOffsetY +
      sin(angleRad) * this.barrelLength * this.boat.s;

    const owner = this.boat === boat1 ? 1 : 2;

    const spawnBullet = (ang) => {
      let vx = cos(ang) * speed;
      let vy = sin(ang) * speed;
      bullets.push(new Bullet(startX, startY, vx, vy, owner, 12, [40, 40, 40]));
    };

    if (this.multiShotActive) {
      for (let i = -2; i <= 2; i++) {
        spawnBullet(angleRad + radians(i * 6));
      }
      this.multiShotActive = false;
    } else {
      spawnBullet(angleRad);
    }
  }

  draw() {
    let isRight = this.boat.isRightSide;
    let mountX = isRight ? -65 : 40;
    let pivotX = isRight ? -60 : 45;
    rectMode(CORNER);

    fill(60, 80, 120, 220);
    rect(mountX, -25, 25, 45, 6);

    push();
    translate(pivotX, -35);
    rotate(radians(this.angle));
    fill(100, 100, 100);
    rect(this.recoil, -10, this.barrelLength, 30, 6);
    pop();
  }
}

// MORTAR CLASS
// =========================
class Mortar extends Gun {
  constructor(boat) {
    super(boat);
    this.barrelLength = 70;
  }

  fire() {
    const FIXED_RECOIL = -12;
    this.recoilVel = FIXED_RECOIL;

    const angleRad = radians(this.angle);
    const speed = 14; // more range

    const isRight = this.boat.isRightSide;
    const pivotOffsetX = (isRight ? -60 : 45) * this.boat.s;
    const pivotOffsetY = -35 * this.boat.s;

    const startX =
      this.boat.x +
      pivotOffsetX +
      cos(angleRad) * this.barrelLength * this.boat.s;
    const startY =
      this.boat.y +
      pivotOffsetY +
      sin(angleRad) * this.barrelLength * this.boat.s;

    const owner = this.boat === boat1 ? 1 : 2;

    const spawnShell = (ang) => {
      let vx = cos(ang) * speed;
      let vy = sin(ang) * speed;
      let shell = new Bullet(startX, startY, vx, vy, owner, 26, [60, 60, 60]);
      shell.xAcc = 0;
      shell.yAcc = 0.14;
      bullets.push(shell);
    };

    if (this.multiShotActive) {
      for (let i = -2; i <= 2; i++) {
        spawnShell(angleRad + radians(i * 5));
      }
      this.multiShotActive = false;
    } else {
      spawnShell(angleRad);
    }
  }

  draw() {
    let isRight = this.boat.isRightSide;
    let mountX = isRight ? -50 : 20;
    let pivotX = isRight ? -45 : 25;

    fill(150, 160, 175);
    rect(mountX - 10, -30, 80, 40, 6);

    push();
    translate(pivotX, -35);
    rotate(radians(this.angle));
    fill(90);
    rect(this.recoil, -10, this.barrelLength, 25, 6);
    pop();
  }
}

// BOAT CLASS
// =========================
class Boats {
  constructor(x, y, s) {
    this.x = x;
    this.y = y;
    this.s = s;

    this.angle = 0;
    this.waveTime = 2000;
    this.amp = 2.5;
    this.period = 90;

    this.leftBound = 50;
    this.rightBound = width - 50;

    this.isRightSide = false;
    this.isMortarBoat = false;

    this.maxHealth = 100;
    this.health = 100;
    this.dead = false;

    this.baseSpeed = 1.5;
    this.speed = this.baseSpeed;

    this.maxGas = 100;
    this.gas = this.maxGas;
    this.gasUse = 0.35;

    this.invincible = false;

    this.gun = new Gun(this);
  }

  makeMortar() {
    this.isMortarBoat = true;
    this.gun = new Mortar(this);
    this.maxHealth = 120;
    this.health = 120;

    this.baseSpeed = 0.5;
    this.speed = this.baseSpeed;

    this.maxGas = 50;
    this.gas = 50;
  }

  regenGas() {
    this.gas = min(this.gas + 15, this.maxGas);
  }

  updateBoat() {
    if (this.dead) return;

    this.angle =
      sin(((frameCount + this.waveTime) / this.period) * TWO_PI) * this.amp;

    if (
      gameState === "game" &&
      phase === "move" &&
      ((turn === 1 && this === boat1) || (turn === 2 && this === boat2))
    ) {
      // Player 1 controls (A/D keys)
      if (this === boat1) {
        if ((keyIsDown(65) || keyIsDown(97)) && this.gas > 0) {
          // 'A' or 'a'
          this.x -= this.speed;
          this.gas = max(this.gas - this.gasUse, 0);
        }
        if ((keyIsDown(68) || keyIsDown(100)) && this.gas > 0) {
          // 'D' or 'd'
          this.x += this.speed;
          this.gas = max(this.gas - this.gasUse, 0);
        }
      }

      // Player 2 controls (Arrow keys)
      if (this === boat2) {
        if (keyIsDown(LEFT_ARROW) && this.gas > 0) {
          this.x -= this.speed;
          this.gas = max(this.gas - this.gasUse, 0);
        }
        if (keyIsDown(RIGHT_ARROW) && this.gas > 0) {
          this.x += this.speed;
          this.gas = max(this.gas - this.gasUse, 0);
        }
      }
    }

    this.x = constrain(this.x, this.leftBound, this.rightBound);
  }

  takeDamage(amount, killerId) {
    if (this.invincible || this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.die(killerId);
    }
  }

  heal(amount) {
    if (this.dead) return;
    this.health = min(this.health + amount, this.maxHealth);
  }

  die(killerId) {
    this.dead = true;
    spawnExplosion(this.x, this.y - 40, "big");
    winner = killerId;
    winTime = millis();
  }

  drawTrajectoryArc() {
    if (!this.isMortarBoat) return; // only mortar uses arc

    if (this.dead) return;
    if (gameState !== "game" || phase !== "fire") return;
    let isActive =
      (turn === 1 && this === boat1) || (turn === 2 && this === boat2);
    if (!isActive) return;

    let angleRad = radians(this.gun.angle);
    let steps = 45;

    let speed = this.isMortarBoat ? 14 : 8;
    let xVel = cos(angleRad) * speed;
    let yVel = sin(angleRad) * speed;
    let xAcc = this.isMortarBoat ? 0 : -0.007;
    let yAcc = this.isMortarBoat ? 0.14 : 0.09;

    let isRight = this.isRightSide;
    let pivotOffsetX = (isRight ? -60 : 45) * this.s;
    let pivotOffsetY = -35 * this.s;
    let px = this.x + pivotOffsetX;
    let py = this.y + pivotOffsetY;

    stroke(this.isMortarBoat ? "orange" : "white");
    strokeWeight(2);
    noFill();
    beginShape();
    for (let i = 0; i < steps; i++) {
      xVel += xAcc + windStrength;
      xVel += xAcc;
      yVel += yAcc;
      px += xVel;
      py += yVel;
      if (i < steps / 2) vertex(px, py); // half arc
    }
    endShape();
  }

  drawBoat() {
    if (this.dead) return;

    // Trajectory indicator
    if (
      !this.isMortarBoat &&
      gameState === "game" &&
      phase === "fire" &&
      ((turn === 1 && this === boat1) || (turn === 2 && this === boat2))
    ) {
      let pivotOffsetX = (this.isRightSide ? -60 : 45) * this.s;
      let pivotOffsetY = -35 * this.s;
      let baseX = this.x + pivotOffsetX;
      let baseY = this.y + pivotOffsetY;

      fill(255, 0, 0);
      noStroke();
      triangle(baseX - 5, baseY, baseX + 5, baseY, mouseX, mouseY);
    }

    // Mortar arc
    this.drawTrajectoryArc();

    push();
    translate(this.x, this.y);
    scale(this.s);
    rotate(radians(this.angle));
    noStroke();

    if (this.isMortarBoat) {
      // Mortar Ship Design
      // =========================

      // MAIN HULL
      fill(135, 150, 165);
      beginShape();
      vertex(-200, 22); // stern top
      vertex(200, 22); // bow top
      vertex(170, 50); // bow waterline
      vertex(-170, 50); // stern waterline
      endShape(CLOSE);

      // HULL STRIPE
      fill(110, 125, 140);
      rectMode(CORNER);
      rect(-190, 22, 380, 10);

      // FLAT DECK
      fill(160, 175, 190);
      rect(-170, 0, 340, 22, 6);

      // FORWARD DECK
      fill(175, 190, 205);
      quad(-170, 0, 170, 0, 150, -10, -150, -10);

      //  Command Center Building
      fill(190, 200, 215);
      beginShape();
      vertex(-70, -10);
      vertex(80, -10);
      vertex(100, -90);
      vertex(-50, -90);
      endShape(CLOSE);

      // BRIDGE TOP
      fill(205, 215, 230);
      rect(-25, -100, 70, 18, 4);

      // BRIDGE WINDOWS
      fill(55, 75, 110);
      let winY = -93;
      let startX = -10;
      for (let i = 0; i < 3; i++) {
        rect(startX + i * 18, winY, 12, 6, 2);
      }

      // SIDE PANELS / HATCHES
      fill(165, 180, 195);
      rect(-60, -55, 20, 14, 3);
      rect(-30, -52, 18, 12, 3);
      rect(5, -50, 16, 12, 3);

      // TURRET PLATFORM
      fill(170, 180, 195);
      rect(-55, -20, 110, 28, 6);

      //  DECK BOXES
      rect(-145, -8, 40, 18, 4);
      rect(115, -8, 40, 18, 4);

      //  RAILING
      stroke(90, 100, 115);
      strokeWeight(2);
      line(-160, 2, 160, 2);
      for (let x = -150; x <= 150; x += 30) {
        line(x, 2, x, -6);
      }
      noStroke();
    } else {
      // GUN BOAT DESIGN
      // =========================================
      rectMode(CORNER);

      // MAIN HULL
      fill(145, 160, 175);
      beginShape();
      vertex(-200, 26); // stern top
      vertex(190, 26); // bow top
      vertex(165, 50); // bow waterline
      vertex(-170, 50); // stern waterline
      endShape(CLOSE);

      // LOWER HULL STRIPE
      fill(120, 135, 150);
      rect(-195, 26, 380, 8);

      // DECK
      fill(165, 180, 195);
      rect(-175, 5, 350, 22, 6);

      // FORWARD DECK
      fill(180, 195, 210);
      quad(-175, 5, 175, 5, 150, -5, -150, -5);

      // TOWER
      fill(190, 200, 215);
      // lower block
      rect(-40, -10, 120, 40, 6);
      // upper block
      rect(-10, -45, 70, 35, 6);
      // bridge cap
      rect(5, -65, 40, 18, 4);

      // MAST
      fill(160, 175, 190);
      rect(22, -100, 10, 35, 4);
      rect(18, -115, 18, 10, 3);

      // BRIDGE WINDOWS
      fill(55, 75, 110);
      let winY = -38;
      let startX = 0;
      for (let i = 0; i < 3; i++) {
        rect(startX + i * 16, winY, 12, 6, 2);
      }

      // SIDE DETAILS
      fill(175, 185, 200);
      rect(-150, 10, 35, 16, 3);
      rect(-115, 12, 30, 14, 3);
      rect(-80, 14, 28, 12, 3);
      rect(110, 12, 32, 14, 3);
      rect(140, 10, 30, 16, 3);

      // MAIN TURRET PLATFORM (this is where your Gun pivot visually sits)
      // pivotOffsetX is around ±60, pivotOffsetY ~ -35 (in boat-local space),
      // so this platform is centered under that area.
      fill(180, 190, 205);
      rect(-75, -18, 120, 26, 6);

      // AFT DECK BOXES
      rect(-165, -2, 45, 18, 4);
      rect(125, -2, 45, 18, 4);

      // SIMPLE RAILING ALONG DECK EDGE
      stroke(90, 100, 115);
      strokeWeight(2);
      line(-170, 8, 170, 8);
      for (let x = -160; x <= 160; x += 28) {
        line(x, 8, x, 0);
      }
      noStroke();
    }
    this.gun.draw();
    pop();
  }
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    let xi = poly[i].x, yi = poly[i].y;
    let xj = poly[j].x, yj = poly[j].y;
    let intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.00001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function bulletDamCollision(x, y) {
  for (let poly of damPolygons) {
    if (pointInPolygon(x, y, poly)) {
      return true;
    }
  }
  return false;
}
// =========================
// POWER CLASS
// =========================
class Power {
  constructor(name, duration, effect) {
    this.name = name;
    this.duration = duration;
    this.effect = effect;
    this.timer = 0;
    this.active = false;
    this.target = null;
  }

  activate(player) {
    // Multi-Shot is a "one use" buff, not timed
    if (this.name === "Multi-Shot") {
      player.gun.multiShotActive = true;
      this.active = false;
      this.target = null;
      return;
    }

    this.timer = this.duration;
    this.active = true;
    this.target = player;
  }

  update() {
    // Multi-Shot has no timer, just waits until the gun uses it
    if (this.name === "Multi-Shot") return;

    if (this.active && this.timer > 0 && this.target) {
      this.effect(this.target);
      this.timer--;
    } else if (this.active && this.timer <= 0 && this.target) {
      this.reset(this.target);
      this.active = false;
      this.target = null;
    }
  }

  reset(player) {
    if (this.name === "Speed Boost") {
      player.speed = player.baseSpeed;
    } else if (this.name === "Multi-Shot") {
      player.gun.multiShotActive = false;
    }
    // Heal no reset needed
  }
}

/* ---------------------------------
        DARK SKY GRADIENT
----------------------------------*/
function drawSkyGradient() {
  noStroke();
  for (let y = 0; y < height; y++) {
    let c = lerpColor(color(10, 20, 35), color(20, 35, 55), y / height);
    stroke(c);
    line(0, y, width, y);
  }
}

/* ---------------------------------
      BOAT GAME CLOUD STYLE
----------------------------------*/
function drawBackgroundClouds() {
  drawCloud(80, 100);
  drawCloud(350, 120);
  drawCloud(600, 90);
  drawCloud(70, 300);
  drawCloud(650, 360);
  drawCloud(400, 420);
}

function drawCloud(x, y) {
  push();
  translate(x, y);
  noStroke();

  fill(80, 80, 90, 120);
  ellipse(0, 0, 90, 70);
  fill(80, 80, 90, 90);
  ellipse(35, -25, 90, 65);
  fill(80, 80, 90, 110);
  ellipse(70, 5, 90, 70);

  pop();
}

/* ---------------------------------
            BIRDS
----------------------------------*/
function drawBirds() {
  stroke(220);
  strokeWeight(3);
  noFill();

  for (let b of birds) {
    arc(b.x, b.y, b.size, b.size / 2, PI, TWO_PI);
    arc(b.x + b.size * 0.6, b.y, b.size, b.size / 2, PI, TWO_PI);

    b.x += b.speed;

    if (b.x > width + 40) {
      b.x = -40;
      b.y = random(80, 260);
      b.size = random(18, 32);
      b.speed = random(1, 2);
    }
  }
}

/* ---------------------------------
              WAVES
----------------------------------*/
function drawWaves() {
  noStroke();

  fill(15, 140, 255, 200);
  drawSingleWave(0.05, 12, height - 45);

  fill(0, 110, 255, 255);
  drawSingleWave(0.08, 14, height - 35);
}

function drawSingleWave(speed, waveHeight, yBase) {
  beginShape();
  vertex(0, height);
  vertex(0, yBase);

  for (let x = 0; x <= width; x += 20) {
    let y = yBase + sin(frameCount * speed + x * 0.06) * waveHeight;
    vertex(x, y);
  }

  vertex(width, yBase);
  vertex(width, height);
  endShape(CLOSE);
}
function createDamPolygons() {
  let polygons = [];
  
  // Use scaleX to match the visual dam position
  const sx = scaleX;

  // Rectangle front - NOW SCALED
  polygons.push([
    { x: 440 * sx, y: 540 },
    { x: 840 * sx, y: 540 },
    { x: 840 * sx, y: 940 },
    { x: 440 * sx, y: 940 },
  ]);

  // Bottom-right triangle - NOW SCALED
  polygons.push([
    { x: 440 * sx, y: 540 },
    { x: 440 * sx, y: 800 },
    { x: 400 * sx, y: 800 },
  ]);

  // Bottom-left triangle - NOW SCALED
  polygons.push([
    { x: 413 * sx, y: 745 },
    { x: 413 * sx, y: 800 },
    { x: 367 * sx, y: 800 },
  ]);

  // Curved left wall - NOW SCALED
  let damCurve = [];
  let cx = 360 * sx;  // SCALED center X
  let cy = 500;
  let rx = 80 * sx;   // SCALED radius X
  let ry = 300;
  for (let t = 0; t <= 1; t += 0.1) {
    let angle = t * (PI / 2);
    let px = cx + cos(angle) * rx;
    let py = cy + sin(angle) * ry;
    damCurve.push({ x: px, y: py });
  }
  damCurve.push({ x: 360 * sx, y: 800 });  // SCALED
  polygons.push(damCurve);

  return polygons;
}
// =========================
// SETUP
// =========================
function setup() {
  createCanvas(1200, 800);
  angleMode(RADIANS);

  scaleX = width / BASE_WIDTH;
  damPolygons = createDamPolygons();

  boat1 = new Boats(width / 4, 745, 0.5);
  boat2 = new Boats((3 * width) / 4, 745, 0.5);
  speedBoost = new Power(
    "Speed Boost",
    300,
    (p) => (p.speed = p.baseSpeed + 1)
  );
  healPower = new Power("Heal", 180, (p) => p.heal(0.3));
  multiShotPower = new Power(
    "Multi-Shot",
    1,
    (p) => (p.gun.multiShotActive = true)
  );

  textAlign(CENTER, CENTER);
  textSize(60);
  textFont("Comic Sans MS");

  // birds
  for (let i = 0; i < 10; i++) {
    birds.push({
      x: random(width),
      y: random(50, 300),
      speed: random(1, 3),
      size: random(15, 30),
    });
  }

  // Lighthouse birds
  for (let i = 0; i < 10; i++) {
    birds.push({
      x: random(width),
      y: random(80, 260),
      speed: random(1, 2),
      size: random(18, 32),
    });
  }

  music.loop();
  music.setVolume(0.4);

  phaseStartTime = millis();
}
// =========================
// DRAW
// =========================
function draw() {
  // Winner screen transition
  if (winner !== null && gameState !== "winner" && winTime !== null) {
    if (millis() - winTime >= 2000) {
      gameState = "winner";
    }
  }

  if (gameState === "winner") {
    drawWinnerScreen();
    updateAndDrawExplosions();
    return;
  }
  
  if (gameState === "title") {
    drawTitleScreen();
    updateAndDrawExplosions();
    return;
  }
  
  if (gameState === "HTP") {
    drawHTPScreen();
    updateAndDrawExplosions();
    return;
  }

  if (gameState === "mapSelect") {
    drawMapSelect();
    return;
  }

  if (gameState === "boatSelect") {
    drawBoatSelect();
    updateAndDrawExplosions();
    return;
  }

  if (gameState === "credits") {
    drawCreditScreen();
    updateAndDrawExplosions();
    return;
  }

// GAME STATE - THE ACTUAL GAMEPLAY
if (gameState === "game") {
  // Spawn boats based on selected map
  if (!hasSpawned) {
    if (selectedMap === Lighthouse) {
      spawnBoatsLighthouseMap();
    } else if (selectedMap === Dam) {
      randomizeBoatSpawns();
    }
  }

  // Draw background based on map
  if (selectedMap === Lighthouse) {
    drawLighthouseMap();
    boatLighthouseCollision(boat1);
    boatLighthouseCollision(boat2);
  } else if (selectedMap === Dam) {
    drawDarkSky();
    push();
    applyScreenShake();
    drawMapBackground();
    drawBirds();
    drawActivePowerUp();
    pop();
  }

  // Check boat collisions based on map
  if (selectedMap === Lighthouse) {
    boatLighthouseCollision(boat1);
    boatLighthouseCollision(boat2);
  }
    
    // Phase timing
    let elapsed = millis() - phaseStartTime;
    if (phase === "move" && elapsed > 10000) {
      phase = "fire";
      hasFired = false;
      phaseStartTime = millis();
    } else if (phase === "fire" && elapsed > 10000 && bullets.length === 0) {
      nextTurn();
    }

// Update active boat
if (phase === "move") {
  let activeBoat = turn === 1 ? boat1 : boat2;
  activeBoat.updateBoat();
} else if (phase === "fire") {
  let activeBoat = turn === 1 ? boat1 : boat2;
  activeBoat.gun.update();
}

    // Draw boats
    boat1.drawBoat();
    boat2.drawBoat();

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
    let b = bullets[i];
    b.update();
    b.draw();

// Map collision
    if (selectedMap === Dam && bulletDamCollision(b.x, b.y, b.r)) {
  let shooter = b.owner === 1 ? boat1 : boat2;
  spawnExplosion(b.x, b.y, shooter.isMortarBoat ? "big" : "small");
  bullets.splice(i, 1);
      continue;
    }

    if (selectedMap === Lighthouse && bulletLighthouseCollision(b.x, b.y)) {
      let shooter = b.owner === 1 ? boat1 : boat2;
      spawnExplosion(b.x, b.y, shooter.isMortarBoat ? "big" : "small");
      bullets.splice(i, 1);
      continue;
    }


      // Boat collision
      let shooter = b.owner === 1 ? boat1 : boat2;
      let target = b.owner === 1 ? boat2 : boat1;

      if (!target.dead && dist(b.x, b.y, target.x, target.y) < 55) {
        let dmg = shooter.isMortarBoat ? 50 : 40;
        target.takeDamage(dmg, b.owner);
        spawnExplosion(b.x, b.y, shooter.isMortarBoat ? "big" : "small");
        bullets.splice(i, 1);
        continue;
      }

      // Out of bounds
      if (b.x < 0 || b.x > width || b.y > height) {
        bullets.splice(i, 1);
      }
    }
}
    // Powerups
    speedBoost.update();
    healPower.update();
    multiShotPower.update();
    checkActivePickup(boat1);
    checkActivePickup(boat2);
    handlePowerUpSpawning();

    // Explosions and HUD
    updateAndDrawExplosions();
    drawHUD();
    drawWindIndicator();

    // Phase indicator
    fill(255);
    textSize(24);
    textAlign(CENTER, TOP);
    textFont("monospace");
    text(`Player ${turn}'s ${phase} phase`, width / 2, 10);
}
function drawMapSelect() {
  push();
  // Ensure rectangles are drawn using CORNER mode so the computed
  // (x - w/2, y - h/2) coordinates match their visual placement.
  rectMode(CORNER);
  textFont("monospace")

   for (let y = 0; y < height; y++) {
    let g = lerp(128, 255, y / height);
    let b = lerp(240, 255, y / height);
    stroke(0, g, b);
    line(0, y, width, y);
  }
  drawDarkSky();
push()
  drawingContext.shadowBlur = 10;
  drawingContext.shadowColor = color(200);
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(52);
  text("Select a Map", width / 2, 120);
pop()
  let buttonW = 320;
  let buttonH = 160;

  // LIGHTHOUSE BUTTON
  let lx = width / 4;
  let ly = 360;

  let lighthouseHover =
    mouseX > lx - buttonW / 2 &&
    mouseX < lx + buttonW / 2 &&
    mouseY > ly - buttonH / 2 &&
    mouseY < ly + buttonH / 2;

  fill(lighthouseHover ? 'white' : 'grey');
  rect(lx - buttonW / 2, ly - buttonH / 2, buttonW, buttonH, 20);

  fill(20);
  textSize(32);
  text("Lighthouse", lx, ly);

  if (lighthouseHover && mouseIsPressed) {
    selectedMap = Lighthouse;
    gameState = "boatSelect";
  }

  // DAM BUTTON
  let dx = (3 * width) / 4;
  let dy = 360;

  let damHover =
    mouseX > dx - buttonW / 2 &&
    mouseX < dx + buttonW / 2 &&
    mouseY > dy - buttonH / 2 &&
    mouseY < dy + buttonH / 2;

  fill(damHover ? 'white' : 'grey');
  rect(dx - buttonW / 2, dy - buttonH / 2, buttonW, buttonH, 20);

  fill(20);
  textSize(32);
  text("Dam", dx, dy);

  if (damHover && mouseIsPressed) {
    selectedMap = Dam;
    gameState = "boatSelect";
  }

  pop();
}

function drawTitleWave(speed, waveHeight, yBase) {
  noStroke();
  beginShape();
  vertex(0, height);
  vertex(0, yBase);
  for (let x = 0; x <= width; x += 20) {
    let y = yBase + sin(frameCount * speed + (x / 100) * TWO_PI) * waveHeight;
    vertex(x, y);
  }
  vertex(width, yBase);
  vertex(width, height);
  endShape(CLOSE);
}

function drawTitleWaves() {
  push();
  noStroke();
  fill(0, 100, 255, 200);
  let floatSpeed = 0.025;
  let waveHeight = 5;
  let redBoat = 460 + sin(frameCount * floatSpeed) * waveHeight;
  let blueBoat = 460 + sin(frameCount * floatSpeed + PI) * waveHeight;
  drawTitleWave(0.05, 20, height - 120);
  push();
  translate(0, -100);
  image(img1, -20, redBoat, 500, 400);
  pop();
  push();
  translate(-150, -100);
  image(img2, width - 285, blueBoat, 500, 400);
  pop();
  fill(0, 150, 255, 180);
  drawTitleWave(0.08, 10, height - 110);
  pop();
}

function drawButton(x, y, w, h) {
  return mouseX > x && mouseX < x + w && mouseY < y + h && mouseY > y;
}

function drawCreditsButton() {
  let d = dist(mouseX, mouseY, 225, 600);
  if (d < 75) {
    fill("white"); // hover color
    cursor(HAND);
  } else {
    fill("gray"); // normal color
    cursor(ARROW);
  }
  noStroke();
  ellipse(225, 600, 150);
  fill(0);
  textSize(28);
  textAlign(CENTER, CENTER);
  textFont("monospace");
  text("CREDITS", 225, 600);
}

function drawTitleScreen() {
  push();
  drawDarkSky();
  drawCloud(80 * scaleX, 100);
  drawCloud(350 * scaleX, 120);
  drawCloud(600 * scaleX, 90);
  drawCloud(70 * scaleX, 320);
  drawCloud(670 * scaleX, 370);
  drawCloud(400 * scaleX, 400);

  push();
  imageMode(CENTER);
  image(img, width / 2 + 15, 250, 800, 600);
  pop();
  push();
  drawTitleWaves();
  pop();
  if (keyIsDown(74)) {
    // 74 is 'J'
    winner = 1; // arbitrary winner
    winTime = millis(); // start the winner screen timer
    gameState = "winner";
  }
  push();
  rectMode(CENTER);
  if (drawButton(width / 2 - 150, 435, 300, 80)) {
    fill("white");
    cursor(HAND);
  } else {
    fill("gray");
    cursor(ARROW);
  }
  rect(width / 2, 475, 300, 80, 80);
  textSize(60);
  textAlign(CENTER, CENTER);
  fill(0);
  textFont("monospace");
  text("PLAY ▶", width / 2, 480);

  if (drawButton(width / 2 - 150, 585, 300, 80)) {
    fill("white");
    cursor(HAND);
  } else {
    fill("gray");
    cursor(ARROW);
  }
  rect(width / 2, 625, 300, 80, 80);
  textSize(40);
  fill(0);
  textAlign(CENTER, CENTER);
  textFont("monospace");
  text("How to Play", width / 2, 625);
  pop();

  textSize(40);
  if (isMuted) {
    text("🔇", width - 50, 50);
    cursor(HAND);
  } else {
    text("🔊", width - 50, 50);
    cursor(ARROW);
  }

  drawCreditsButton();
  pop();
}

// =========================
// HUD
// =========================
function drawHUD() {
  rectMode(CORNER); // eset for health/gas bars
  textAlign(LEFT, TOP); // make sure labels line up

  let leftBoat, rightBoat;
  let leftLabel, rightLabel;

  if (boat1.x < boat2.x) {
    leftBoat = boat1;
    rightBoat = boat2;
  } else {
    leftBoat = boat2;
    rightBoat = boat1;
  }

  leftLabel = leftBoat === boat1 ? "Player 1" : "Player 2";
  rightLabel = rightBoat === boat1 ? "Player 1" : "Player 2";

  drawPlayerHUD(leftLabel, leftBoat, 40, 40);
  drawPlayerHUD(rightLabel, rightBoat, width - 290, 40);
}
function drawWindIndicator() {
  push();
  let hudX = width / 2;
  let hudY = 100;
  let animProgress = 0;
  if (isAnimatingWindIndicator) {
    let elapsed = millis() - windIndicatorAnimStartTime;
    let duration = 1000; // 1 second animation
    animProgress = constrain(elapsed / duration, 0, 1);
  } else {
    animProgress = 1;
  }
  let startX = width / 2;
  let startY = height / 2;
  let endX = hudX;
  let endY = hudY;
  let cloudX = lerp(startX, endX, animProgress);
  let cloudY = lerp(startY, endY, animProgress);
  let startScale = 2.5; // large in center
  let endScale = 0.7; // HUD size
  let cloudScale = lerp(startScale, endScale, animProgress);
  translate(cloudX, cloudY);
  let displayWind = Math.abs(windStrength) * 1000;
  if (displayWind > 50) displayWind = 50;
  drawStylizedCloud(0, 0, cloudScale);
  push();
  let arrowSize = 20 * cloudScale;
  let arrowDistance = 50 * cloudScale; // distance from cloud scales too
  let arrowX = windStrength >= 0 ? arrowDistance : -arrowDistance;
  translate(arrowX, 0);
  let angle = windStrength >= 0 ? 0 : PI;
  rotate(angle);
  fill(255);
  noStroke();
  beginShape();
  vertex(0, -arrowSize / 2);
  vertex(arrowSize, 0);
  vertex(0, arrowSize / 2);
  endShape(CLOSE);
  pop();
  push();
  let textDistance = 25 * cloudScale; // distance below cloud scales
  scale(cloudScale); // scale text
  fill(255);
  textSize(16);
  textAlign(CENTER, TOP);
  text(`${displayWind.toFixed(0)} mph`, 0, textDistance / cloudScale);
  pop();

  pop();
}

function drawStylizedCloud(x, y, scaleFactor = 0.7) {
  push();
  translate(x, y);
  scale(scaleFactor);
  noStroke();
  fill(255);
  ellipse(0, 0, 60, 40);
  ellipse(-25, 5, 45, 30);
  ellipse(25, 10, 50, 35);
  fill(200, 200, 200, 80);
  ellipse(-15, 15, 55, 35);
  fill(255, 255, 255, 150);
  ellipse(20, -10, 35, 25);
  pop();
}

function drawPlayerHUD(label, boat, x, y) {
  fill(255);
  textSize(20);
  textAlign(LEFT, TOP);
  textFont("monospace");
  text(label, x, y);

  let barW = 250;
  let barH = 18;

  // health
  let hRatio = boat.health / boat.maxHealth;
  hRatio = constrain(hRatio, 0, 1);
  fill(0, 220, 50);
  rect(x, y + 28, barW * hRatio, barH, 5);
  noFill();
  stroke(255);
  rect(x, y + 28, barW, barH, 5);
  noStroke();

  // gas
  let gRatio = boat.gas / boat.maxGas;
  gRatio = constrain(gRatio, 0, 1);
  fill(220, 40, 40);
  rect(x, y + 28 + barH + 6, barW * gRatio, 10, 5);
  noFill();
  stroke(255);
  rect(x, y + 28 + barH + 6, barW, 10, 5);
  noStroke();
}

function drawLighthouseMap() {
  drawLighthouseSky();
  drawLighthouseClouds();
  drawLighthouseBirds();

  // Draw lighthouse building
  push();
  imageMode(CENTER);
  image(img15,600, 550, 480, 670);
  pop();

  drawLighthouseWaves();
}

function drawLighthouseSky() {
  noStroke();
  for (let y = 0; y < height; y++) {
    let c = lerpColor(color(10, 20, 35), color(20, 35, 55), y / height);
    stroke(c);
    line(0, y, width, y);
  }
}

function drawLighthouseClouds() {
  drawLighthouseCloud(80, 100);
  drawLighthouseCloud(350, 120);
  drawLighthouseCloud(600, 90);
  drawLighthouseCloud(70, 300);
  drawLighthouseCloud(650, 360);
  drawLighthouseCloud(400, 420);
}

function drawLighthouseCloud(x, y) {
  push();
  translate(x, y);
  noStroke();
  fill(80, 80, 90, 120);
  ellipse(0, 0, 90, 70);
  fill(80, 80, 90, 90);
  ellipse(35, -25, 90, 65);
  fill(80, 80, 90, 110);
  ellipse(70, 5, 90, 70);
  pop();
}

function drawLighthouseBirds() {
  stroke(220);
  strokeWeight(3);
  noFill();

  for (let b of birds) {
    arc(b.x, b.y, b.size, b.size / 2, PI, TWO_PI);
    arc(b.x + b.size * 0.6, b.y, b.size, b.size / 2, PI, TWO_PI);

    b.x += b.speed;

    if (b.x > width + 40) {
      b.x = -40;
      b.y = random(80, 260);
      b.size = random(18, 32);
      b.speed = random(1, 2);
    }
  }
}

function drawLighthouseWaves() {
  noStroke();

  fill(15, 140, 255, 200);
  lighthouseWave(0.05, 12, height - 45);

  fill(0, 110, 255, 255);
  lighthouseWave(0.08, 14, height - 35);
}

function lighthouseWave(speed, waveHeight, yBase) {
  beginShape();
  vertex(0, height);
  vertex(0, yBase);

  for (let x = 0; x <= width; x += 20) {
    let y = yBase + sin(frameCount * speed + x * 0.06) * waveHeight;
    vertex(x, y);
  }

  vertex(width, yBase);
  vertex(width, height);
  endShape(CLOSE);
}

function drawDamMap() {
  drawDarkSky();
  drawCloud(80 * scaleX, 200);
  drawCloud(350 * scaleX, 120);
  drawCloud(600 * scaleX, 190);
  drawCloud(380 * scaleX, 300);

  // TOP reservoir waves (above dam)
  drawDamWaves(290, 285);

  // LEFT bottom pool (solid water under the dam)
  noStroke();
  fill(5, 8, 20);
  rect(0, 400, 360 * scaleX, 400);

  // Dam geometry
  fill("#9E9E9E");
  strokeWeight(10);
  stroke("#9E9E9E");
  arc(360 * scaleX, 500, 160 * scaleX, 600, 0, PI / 2);

  // BOTTOM waves
  drawDamWaves(45, 40);

  fill("#9E9E9E");
  noStroke();
  rect(440 * scaleX, 540, 400 * scaleX, 400);
  triangle(440 * scaleX, 540, 440 * scaleX, 800, 400 * scaleX, 800);
  triangle(413 * scaleX, 745, 413 * scaleX, 800, 367 * scaleX, 800);

  fill("#8A8A8A");
  quad(440 * scaleX, 540, 440 * scaleX, 800, 400 * scaleX, 800, 400 * scaleX, 560);

  stroke("#BDBDBD");
  strokeWeight(1);
  for (let y = 560; y < 900; y += 20) {
    line(440 * scaleX, y, 840 * scaleX, y);
  }

  stroke("#6D6D6D");
  strokeWeight(3);
  line(440 * scaleX, 540, 840 * scaleX, 540);
  for (let x = 440 * scaleX; x <= 840 * scaleX; x += 40 * scaleX) {
    line(x, 540, x, 520);
  }

  noFill();
  strokeWeight(10);
  stroke("#9E9E9E");
  arc(360 * scaleX, 500, 160 * scaleX, 600, 0, PI / 2);
}

// =========================
// SKY / MAP
// =========================
function drawDarkSky() {
  for (let y = 0; y < height; y++) {
    let c = lerpColor(color(20, 30, 40), color(5, 8, 12), y / height);
    stroke(c);
    line(0, y, width, y);
  }
}

function drawCloud(xPos, yPos) {
  push();
  translate(xPos, yPos);
  noStroke();
  fill(60, 60, 70, 190);
  ellipse(0, 0, 80, 60);
  ellipse(30, -30, 90, 70);
  ellipse(70, 10, 100, 70);
  pop();
}

function drawBirds() {
  stroke(220);
  strokeWeight(2);
  noFill();

  for (let b of birds) {
    arc(b.x, b.y, b.size, b.size / 2, PI, TWO_PI);
    arc(b.x + b.size * 0.6, b.y, b.size, b.size / 2, PI, TWO_PI);

    b.x += b.speed;
    if (b.x > width + 50) {
      b.x = -30;
      b.y = random(50, 300);
      b.size = random(10, 35);
      b.speed = random(1, 2);
    }
  }
}

function drawMapBackground() {
  // Original bright sky + water look
  background(5, 8, 20);

  // Clouds
  drawCloud(80 * scaleX, 200);
  drawCloud(350 * scaleX, 120);
  drawCloud(600 * scaleX, 190);
  drawCloud(380 * scaleX, 300);

  // TOP reservoir waves (above dam)
  drawDamWaves(290, 285);

  // LEFT bottom pool (solid water under the dam)
  noStroke();
  fill(5, 8, 20);
  rect(0, 400, 360 * scaleX, 400); // left pool

  // Dam geometry
  fill("#9E9E9E");
  strokeWeight(10);
  stroke("#9E9E9E");
  // dam curve
  arc(360 * scaleX, 500, 160 * scaleX, 600, 0, PI / 2);

  // BOTTOM waves (in the foreground water)
  drawDamWaves(45, 40);

  fill("#9E9E9E");
  noStroke();
  // dam front face
  rect(440 * scaleX, 540, 400 * scaleX, 400);
  triangle(440 * scaleX, 540, 440 * scaleX, 800, 400 * scaleX, 800);
  triangle(413 * scaleX, 745, 413 * scaleX, 800, 367 * scaleX, 800);

  fill("#8A8A8A");
  quad(
    440 * scaleX,
    540,
    440 * scaleX,
    800,
    400 * scaleX,
    800,
    400 * scaleX,
    560
  );

  stroke("#BDBDBD");
  strokeWeight(1);
  for (let y = 560; y < 900; y += 20) {
    line(440 * scaleX, y, 840 * scaleX, y);
  }

  stroke("#6D6D6D");
  strokeWeight(3);
  line(440 * scaleX, 540, 840 * scaleX, 540);
  for (let x = 440 * scaleX; x <= 840 * scaleX; x += 40 * scaleX) {
    line(x, 540, x, 520);
  }

  // outer curve edge again for crisp border
  noFill();
  strokeWeight(10);
  stroke("#9E9E9E");
  arc(360 * scaleX, 500, 160 * scaleX, 600, 0, PI / 2);
}

function drawDamWaves(y1, y2) {
  noStroke();
  fill(0, 100, 255, 200);
  drawSingleWave(0.05, 10, height - y1);
  fill(0, 150, 255, 180);
  drawSingleWave(0.08, 10, height - y2);
}

function drawSingleWave(speed, waveHeight, yBase) {
  beginShape();
  vertex(0, height);
  vertex(0, yBase);
  for (let x = 0; x <= width; x += 20) {
    let y = yBase + sin(frameCount * speed + (x / 100) * TWO_PI) * waveHeight;
    vertex(x, y);
  }
  vertex(width, yBase);
  vertex(width, height);
  endShape(CLOSE);
}

// =========================
// POWER-UP SYSTEM
// =========================
function getRandomWaterPosition() {
  let zone = random(["bottomPool", "topReservoir"]);
  if (zone === "bottomPool") {
    return {
      x: random(80 * scaleX, 280 * scaleX),
      y: 730,
    };
  } else {
    return {
      x: random(480 * scaleX, 780 * scaleX),
      y: random(470, 515),
    };
  }
}

function spawnRandomPowerUp() {
  const types = ["Speed Boost", "Heal", "Multi-Shot"];
  const type = random(types);
  const pos = getRandomWaterPosition();
  activePowerUp = { x: pos.x, y: pos.y, type, active: true };
}

function drawActivePowerUp() {
  if (!activePowerUp || !activePowerUp.active) return;

  if (activePowerUp.type === "Speed Boost") {
    fill("gold");
    push();
    translate(activePowerUp.x, activePowerUp.y);
    beginShape();
    stroke(0);
    strokeWeight(2);
    translate(-10, -10);
    scale(0.8, 0.8);
    vertex(0, 0);
    vertex(-10, 20);
    vertex(0, 20);
    vertex(-10, 40);
    vertex(15, 15);
    vertex(5, 15);
    vertex(20, -5);
    vertex(0, 0);
    endShape();
    pop();
  } else if (activePowerUp.type === "Heal") {
    imageMode(CENTER);
    image(healCrateImg, activePowerUp.x, activePowerUp.y, 50, 50);
  } else if (activePowerUp.type === "Multi-Shot") {
    imageMode(CENTER);
    image(multiShotImg, activePowerUp.x, activePowerUp.y, 60, 60);
  }
}

function checkActivePickup(player) {
  if (!activePowerUp || !activePowerUp.active) return;

  let d = dist(player.x, player.y, activePowerUp.x, activePowerUp.y);
  if (d < 60) {
    if (activePowerUp.type === "Speed Boost") {
      speedBoost.activate(player);
    } else if (activePowerUp.type === "Heal") {
      healPower.activate(player);
    } else if (activePowerUp.type === "Multi-Shot") {
      multiShotPower.activate(player);
    }
    activePowerUp.active = false;
    spawnTimer = 0;
  }
}

function handlePowerUpSpawning() {
  if (!activePowerUp || !activePowerUp.active) {
    if (spawnTimer <= 0) {
      spawnDelay = int(random(180, 480));
      spawnTimer = spawnDelay;
    } else {
      spawnTimer--;
      if (spawnTimer === 0) spawnRandomPowerUp();
    }
  }
}

// =========================
// COLLISIONS
// =========================
function bulletHitsBoat(b, boat) {
  let halfW = 120 * boat.s;
  let topY = boat.y - 90 * boat.s;
  let bottomY = boat.y + 45 * boat.s;
  return (
    b.x > boat.x - halfW && b.x < boat.x + halfW && b.y > topY && b.y < bottomY
  );
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    let xi = poly[i].x, yi = poly[i].y;
    let xj = poly[j].x, yj = poly[j].y;
    let intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.00001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function createDamPolygons() {
  const sx = scaleX || 1;

  const polygons = [];

  // front rectangle (the dam face)
  polygons.push([
    { x: 440 * sx, y: 540 },
    { x: 840 * sx, y: 540 },
    { x: 840 * sx, y: 940 },
    { x: 440 * sx, y: 940 },
  ]);

  // bottom-right triangle
  polygons.push([
    { x: 440 * sx, y: 540 },
    { x: 440 * sx, y: 800 },
    { x: 400 * sx, y: 800 },
  ]);

  // bottom-left triangle
  polygons.push([
    { x: 413 * sx, y: 745 },
    { x: 413 * sx, y: 800 },
    { x: 367 * sx, y: 800 },
  ]);

  // curved left wall (approximate the quarter-ellipse used by arc())
  const cx = 360 * sx;
  const cy = 500;
  const rx = 80 * sx;  // arc width = 160*sx -> rx = 80*sx
  const ry = 300;      // arc height = 600 -> ry = 300

  // sample the quarter-ellipse from angle 0 -> PI/2 (same orientation as the arc used for drawing)
  const arcPts = [];
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (PI / 2);
    const px = cx + cos(a) * rx;
    const py = cy + sin(a) * ry;
    arcPts.push({ x: px, y: py });
  }
  // close the curved polygon by adding the bottom points that connect to the triangles
  arcPts.push({ x: 360 * sx, y: 800 });
  arcPts.push({ x: 367 * sx, y: 800 });

  polygons.push(arcPts);

  return polygons;
}


function bulletLighthouseCollision(x, y) {
  const centerX = LH_CENTER_X;

  // MAIN BODY (quad) - adjusted for centered lighthouse
  const mainBody = [
    { x: centerX - 75, y: 730 },
    { x: centerX + 75, y: 730 },
    { x: centerX + 75, y: 360 },
    { x: centerX - 75, y: 360 },
  ];

  // ROOF TRIANGLE
  const roof = [
    { x: centerX + 75, y: 360 },
    { x: centerX - 75, y: 360 },
    { x: centerX, y: 300 },
  ];

  // WINDOW ELLIPSE
  const dxWindow = x - centerX;
  const dyWindow = y - 286;
  const rxWindow = 10;
  const ryWindow = 12;
  const windowHit =
    (dxWindow * dxWindow) / (rxWindow * rxWindow) +
    (dyWindow * dyWindow) / (ryWindow * ryWindow) <= 1;

  // ROCK BASE ELLIPSE
  const dxRock = x - centerX;
  const dyRock = y - 800;
  const rxRock = 100;
  const ryRock = 95;
  const rockHit =
    (dxRock * dxRock) / (rxRock * rxRock) + (dyRock * dyRock) / (ryRock * ryRock) <= 1;

  if (pointInPolygon(x, y, mainBody)) return true;
  if (pointInPolygon(x, y, roof)) return true;
  if (windowHit) return true;
  if (rockHit) return true;

  return false;
}

function boatLighthouseCollision(boat) {
  if (!boat || boat.dead) return;

  const centerX = LH_CENTER_X;

  const mainBody = [
    { x: centerX - 75, y: 730 },
    { x: centerX + 75, y: 730 },
    { x: centerX + 75, y: 360 },
    { x: centerX - 75, y: 360 },
  ];
  
  const roof = [
    { x: centerX + 75, y: 360 },
    { x: centerX - 75, y: 360 },
    { x: centerX, y: 300 },
  ];

  const testX = boat.x;
  const testY = boat.y - 20 * boat.s;

  // Window collision
  const dxWindow = testX - centerX;
  const dyWindow = testY - 286;
  const rxWindow = 10;
  const ryWindow = 12;
  const windowHit =
    (dxWindow * dxWindow) / (rxWindow * rxWindow) +
    (dyWindow * dyWindow) / (ryWindow * ryWindow) <= 1;

  // Rock base collision
  const dxRock = testX - centerX;
  const dyRock = testY - 800;
  const rxRock = 100;
  const ryRock = 95;
  const rockHit =
    (dxRock * dxRock) / (rxRock * rxRock) + (dyRock * dyRock) / (ryRock * ryRock) <= 1;

  const insidePoly = pointInPolygon(testX, testY, mainBody) || pointInPolygon(testX, testY, roof);

  if (insidePoly || windowHit || rockHit) {
    const safeGap = LH_SAFE_GAP;
    if (boat.isRightSide) {
      const minX = centerX + safeGap;
      if (boat.x < minX) boat.x = minX;
      boat.leftBound = max(boat.leftBound, minX);
    } else {
      const maxX = centerX - safeGap;
      if (boat.x > maxX) boat.x = maxX;
      boat.rightBound = min(boat.rightBound, maxX);
    }
    boat.x = constrain(boat.x, boat.leftBound, boat.rightBound);
  }
}

function bulletDamCollision(x, y, r = 0) {
  if (!damPolygons || damPolygons.length === 0) return false;

  // Build a set of sample points for the bullet circle: center + 4 cardinal points
  const checks = [{ x: x, y: y }];
  if (r > 0) {
    checks.push({ x: x - r, y: y });
    checks.push({ x: x + r, y: y });
    checks.push({ x: x, y: y - r });
    checks.push({ x: x, y: y + r });
  }

  for (let poly of damPolygons) {
    for (let p of checks) {
      if (pointInPolygon(p.x, p.y, poly)) {
        return true;
      }
    }
  }
  return false;
}

function randomizeBoatSpawns() {
  const bottom = {
    x: 150 * scaleX,
    y: 745,
    leftBound: 70 * scaleX,
    rightBound: 340 * scaleX,
  };

  const top = {
    x: 620 * scaleX,
    y: 505,
    leftBound: 500 * scaleX,
    rightBound: 780 * scaleX,
  };

  if (random() < 0.5) {  // lowercase random()
    boat1.x = bottom.x;
    boat1.y = bottom.y;
    boat1.leftBound = bottom.leftBound;
    boat1.rightBound = bottom.rightBound;
    boat1.isRightSide = false;

    boat2.x = top.x;
    boat2.y = top.y;
    boat2.leftBound = top.leftBound;
    boat2.rightBound = top.rightBound;
    boat2.isRightSide = true;
  } else {
    boat1.x = top.x;
    boat1.y = top.y;
    boat1.leftBound = top.leftBound;
    boat1.rightBound = top.rightBound;
    boat1.isRightSide = true;

    boat2.x = bottom.x;
    boat2.y = bottom.y;
    boat2.leftBound = bottom.leftBound;
    boat2.rightBound = bottom.rightBound;
    boat2.isRightSide = false;
  }

  hasSpawned = true;
}

function spawnBoatsLighthouseMap() {
  const lighthouseX = LH_CENTER_X;  // Use actual center (600 for 1200px canvas)
  const groundY = 745;

  // LEFT SIDE BOAT
  boat1.x = 250;  // Fixed position left of lighthouse
  boat1.y = groundY;
  boat1.leftBound = 50;
  boat1.rightBound = lighthouseX - LH_SAFE_GAP;
  boat1.isRightSide = false;

  // RIGHT SIDE BOAT
  boat2.x = 950;  // Fixed position right of lighthouse
  boat2.y = groundY;
  boat2.leftBound = lighthouseX + LH_SAFE_GAP;
  boat2.rightBound = width - 50;
  boat2.isRightSide = true;

  hasSpawned = true;
}

// =========================
// TURNS
// =========================
function nextTurn() {
  turn = turn === 1 ? 2 : 1;
  phase = "move";
  hasFired = false;
  turnWaitStart = null;
  phaseStartTime = millis();
  boat1.regenGas();
  boat2.regenGas();
  windStrength = random(-0.05, 0.05);

  //wind indicator animation
  windIndicatorAnimStartTime = millis();
  isAnimatingWindIndicator = true;
  windIndicatorStart.x = width / 2;
  windIndicatorStart.y = height / 2;
  windIndicatorEnd.x = width / 2;
  windIndicatorEnd.y = 100;
}
function drawBoatSelect() {
  push();
  rectMode(CENTER);
  imageMode(CENTER);
  if (spacePressed && enterPressed && !gameStarted) {
    configureBoatsFromSelection();
    gameStarted = true;
    gameState = "game";
    phase = "move";
    hasFired = false;
    hasSpawned = false;
    phaseStartTime = millis();
  }

  for (let y = 0; y < height; y++) {
    let g = lerp(128, 255, y / height);
    let b = lerp(240, 255, y / height);
    stroke(0, g, b);
    line(0, y, width, y);
  }
  drawDarkSky();
  noStroke();
  image(img13, width / 4, 75, 300, 200);
  image(img14, (3 * width) / 4, 75, 300, 200);

  let positions = [250, 550];
  let leftX = width / 4;
  let rightX = (3 * width) / 4;

  for (let i = 0; i < 2; i++) {
    push();
    if (i === selectedBoatP1) {
      fill(255, 255, 255, 180);
      stroke(255, 255, 0);
      strokeWeight(4);
    } else {
      fill(255, 255, 255, 100);
      noStroke();
    }
    rect(leftX, positions[i], 350, 100, 50);
    pop();
  }

  for (let i = 0; i < 2; i++) {
    push();
    if (i === selectedBoatP2) {
      fill(255, 255, 255, 180);
      stroke(255, 255, 0);
      strokeWeight(4);
    } else {
      fill(255, 255, 255, 100);
      noStroke();
    }
    rect(rightX, positions[i], 350, 100, 50);
    pop();
  }

  image(img8, width / 2, 150, 400, 400);
  push();
  translate(0, -40);
  image(img1, leftX, 250, 300, 200);
  pop();
  image(img9, width / 2, 400, 350, 350);
  push();
  translate(0, -40);
  image(img2, leftX, 550, 300, 200);
  pop();
  push();
  translate(0, -40);
  image(img1, rightX, 250, 300, 200);
  pop();
  push();
  translate(0, -40);
  image(img2, rightX, 550, 300, 200);
  pop();

  fill(255);
  textSize(25);
  textAlign(CENTER, CENTER);
  textFont("monospace");
  text("Press Space to Confirm", leftX, 650);
  text("Press Enter to Confirm", rightX, 650);

  pop();
}

// =========================
// WINNER SCREEN
// =========================
function drawWinnerScreen() {
  push();
  background(10, 14, 23);
  for (let i = 0; i < height; i++) {
    let c = lerpColor(color(10, 14, 23), color(20, 30, 45), i / height);
    stroke(c);
    line(0, i, width, i);
  }

  rectMode(CENTER);
  fill(255);
  rect(width / 2, height / 2, 300, 100, 5);
  rect(width / 2, height / 2 + 180, 300, 100, 5);

  textSize(80);
  textAlign(CENTER, CENTER);
  fill(255);
  textFont("monospace");
  text(`Player ${winner} Wins!`, width / 2, height / 2 - 240);
  textSize(30);
  push();
  translate(width / 2, height / 2);
  if (
    mouseX < width / 2 + 150 &&
    mouseX > width / 2 - 150 &&
    mouseY < height / 2 + 50 &&
    mouseY > height / 2 - 50
  ) {
    fill("white");
    scale(1.15);
    cursor(HAND);
    if (mouseIsPressed) {
      gameState = "title";
      winner = null;
      winTime = null;
    }
  } else {
    cursor(ARROW);
    fill("grey");
  }
  rectMode(CENTER);
  rect(0, 0, 300, 100, 5);
  fill(0);
  textAlign(CENTER, CENTER);
  textFont("monospace");
  text("Click to Restart", 0, 0);
  pop();

  // BUTTON 2: Credits
  push();
  translate(width / 2, height / 2 + 180);
  if (
    mouseX < width / 2 + 150 &&
    mouseX > width / 2 - 150 &&
    mouseY < height / 2 + 230 &&
    mouseY > height / 2 + 130
  ) {
    fill("white");
    scale(1.15);
    cursor(HAND);
    if (mouseIsPressed) {
      gameState = "credits";
      winner = null;
      winTime = null;
    }
  } else {
    cursor(ARROW);
    fill("grey");
  }
  rectMode(CENTER);
  rect(0, 0, 300, 100, 5);
  fill(0);
  textAlign(CENTER, CENTER);
  textFont("monospace");
  text("Credits", 0, 0);
  pop();
  pop();
}

// =========================
// INPUT
// =========================

function keyPressed() {
  if (gameState === "game") {
    if (phase === "fire" && !hasFired) {
      // Player 1 shoots with W key
      if (turn === 1 && (key === "w" || key === "W")) {
        boat1.gun.fire();
        hasFired = true;
      }
      // Player 2 shoots with UP arrow
      if (turn === 2 && keyCode === UP_ARROW) {
        boat2.gun.fire();
        hasFired = true;
      }
    }

    if (phase === "move" && keyCode === ENTER) {
      phase = "fire";
      hasFired = false;
      phaseStartTime = millis();
    }
  }

  if (gameState === "boatSelect") {
    if (key === "w" || key === "W") {
      selectedBoatP1--;
      if (selectedBoatP1 < 0) selectedBoatP1 = 1;
    }
    if (key === "s" || key === "S") {
      selectedBoatP1++;
      if (selectedBoatP1 > 1) selectedBoatP1 = 0;
    }
    if (keyCode === UP_ARROW) {
      selectedBoatP2--;
      if (selectedBoatP2 < 0) selectedBoatP2 = 1;
    }
    if (keyCode === DOWN_ARROW) {
      selectedBoatP2++;
      if (selectedBoatP2 > 1) selectedBoatP2 = 0;
    }
  }

  if (keyCode === 32) {
    spacePressed = true;
  }

  if (keyCode === ENTER) {
    enterPressed = true;
  }
}

function mousePressed() {
  // mute
  if (drawButton(width - 75, 25, 50, 75)) {
    if (music.isPlaying()) {
      music.pause();
      isMuted = true;
    } else {
      music.loop();
      music.setVolume(0.4);
      isMuted = false;
    }
  }
  let d = dist(mouseX, mouseY, 225, 600);
  if (d < 100) {
    gameState = "credits";
  }

  // play
  if (drawButton(width / 2 - 150, 435, 300, 80) && gameState === "title") {
    gameState = "mapSelect";
  }
  if (drawButton(width / 2 - 150, 585, 300, 80) && gameState === "title") {
    gameState = "HTP";
  }
  if (drawButton(75, 100, 100, 100) && gameState === "HTP") {
    gameState = "title";
  }

  if (drawButton(width / 2 - 100, 650, 200, 100) && gameState === "credits") {
    gameState = "title";
  }
}
// =========================
// HOW TO PLAY
// =========================
function drawHTPScreen() {
  background(10, 14, 23);
  for (let i = 0; i < height; i++) {
    let c = lerpColor(color(10, 14, 23), color(20, 30, 45), i / height);
    stroke(c);
    line(0, i, width, i);
  }

  fill(255);
  textAlign(CENTER, CENTER);
  textSize(64);
  textFont("monospace");
  text("HOW TO PLAY", width / 2, 75);

  rectMode(CENTER);
  fill(255);
  stroke(0);
  strokeWeight(2);
  // Instructions with player-specific controls
  fill(255);
  textSize(14);
  text("P.S. You can damage yourself!", width / 2, 275);
  textSize(18);
  text("PLAYER 1: Move with A/D • Shoot with W", width / 2, 200);
  text("PLAYER 2: Move with ←/→ • Shoot with ↑", width / 2, 225);

  text("Aim: Mouse/Touchpad  •  End Move Phase: ENTER", width / 2, 350);
  text("Each turn: Move phase (10s) → Fire phase (10s)", width / 2, 550);
  text("Collect powerups: SpeedBoost, Heal, Multi-Shot", width / 2, 750);

  if (drawButton(75, 100, 100, 100)) {
    fill("white");
    cursor(HAND);
  } else {
    fill("grey");
    cursor(ARROW);
  }
  push();

  rect(125, 150, 100, 100, 5);
  fill(0);
  textFont("monospace");
  text("Home", 125, 150);
  pop();
}
// =========================
// BOAT CONFIG
// =========================
function configureBoatsFromSelection() {
  setupBoatFromChoice(boat1, selectedBoatP1);
  setupBoatFromChoice(boat2, selectedBoatP2);
  
  hasSpawned = false;
}

function setupBoatFromChoice(boat, index) {
  boat.isMortarBoat = false;
  boat.maxHealth = 100;
  boat.health = 100;
  boat.baseSpeed = 1.5;
  boat.speed = boat.baseSpeed;
  boat.maxGas = 100;
  boat.gas = 100;
  boat.dead = false;
  boat.gun = new Gun(boat);

  const name = boatNames[index];
  if (name === "MORTAR") {
    boat.makeMortar();
  } else if (name === "HARPOON") {
    boat.gun = new Gun(boat); // placeholder
  }
}

// =========================
// BUTTON HELPER
// =========================
function drawCreditScreen() {
  push();
  background(10, 14, 23);
  for (let i = 0; i < height; i++) {
    let c = lerpColor(color(10, 14, 23), color(20, 30, 45), i / height);
    stroke(c);
    line(0, i, width, i);
  }
  rectMode(CENTER);
  textAlign(CENTER, CENTER);
  fill(255);
  push();
  drawingContext.shadowBlur = 10;
  drawingContext.shadowColor = color(200);

  textSize(64);
  textFont("monospace");
  text("Boat Game", width / 2, 75);

  textSize(36);
  text("Created By", width / 6, 175);
  text("Music By", width / 6, 525);
  text("Assets By", 1000, 175);
  textSize(28);

  text("Title Screen & In-Game Menus", width / 2, 150);
  text("Playable Maps", width / 2, 250);
  text("Boats, Explosions, and Powerups", width / 2, 350);
  text("Wind and Boat Mechanis", width / 2, 450);
  text("Boat Design and Physics", width / 2, 550);
  textSize(18);
  text("Samuel Griffith", width / 6, 225);
  text("Bennett Bliss", width / 6, 275);
  text("Evan Ellman", width / 6, 325);
  text("Jacob Caldwell", width / 6, 375);
  text("Stefan Cazangiu", width / 6, 425);
  text("Even Ellman", width / 6, 575);
  text("ChatGPT Image Generation", 1000, 225);
  text("Adobe Photo Editor", 1000, 275);
  textSize(18);
  text("Samuel Griffith", width / 2, 200);
  text("Stefan Cazangiu", width / 2, 300);
  text("Jacob Caldwell", width / 2, 400);
  text("Evan Ellman", width / 2, 500);
  text("Bennet Bliss", width / 2, 600);

  pop();
  textFont("monospace");
  if (drawButton(width / 2 - 100, 650, 200, 100)) {
    fill("white");
    cursor(HAND);
  } else {
    fill("grey");
    cursor(ARROW);
  }
  push();

  rect(width / 2, 700, 200, 100, 5);
  fill(0);
  textSize(36);
  text("Home", width / 2, 700);
  pop();
  pop();
}
