(() => {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const highScoreEl = document.getElementById("high-score");
  const livesEl = document.getElementById("lives");
  const waveEl = document.getElementById("wave");

  const W = canvas.width;
  const H = canvas.height;
  const HIGH_SCORE_KEY = "shooting-high-score";

  // 敵の種類: hp=耐久力, points=得点, shoots=弾を撃つか
  const ENEMY_TYPES = {
    small: { r: 14, hp: 1, speed: 2.2, points: 100, color: "#ff6b6b", shoots: false },
    shooter: { r: 18, hp: 3, speed: 1.4, points: 300, color: "#ffa94d", shoots: true },
    big: { r: 28, hp: 10, speed: 0.8, points: 1000, color: "#cc5de8", shoots: true },
    dasher: { r: 16, hp: 2, speed: 1.6, points: 500, color: "#69db7c", shoots: false },
  };

  const player = { x: W / 2, y: H - 80, r: 14, speed: 5, cooldown: 0, invincible: 0 };
  let bullets = [];
  let enemyBullets = [];
  let enemies = [];
  let particles = [];
  const stars = Array.from({ length: 80 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    speed: 0.5 + Math.random() * 2,
  }));

  let score = 0;
  let highScore = loadHighScore();
  let lives = 3;
  let wave = 1;
  let waveTimer = 0;
  let spawnTimer = 0;
  // title: タイトル / playing: プレイ中 / paused: 一時停止 / over: ゲームオーバー
  let state = "title";

  const keys = {};
  let touchTarget = null;

  function loadHighScore() {
    try {
      return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  function saveHighScore() {
    try {
      localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
    } catch {
      // 保存できない環境では何もしない
    }
  }

  function updateStatus() {
    scoreEl.textContent = score;
    highScoreEl.textContent = highScore;
    livesEl.textContent = lives;
    waveEl.textContent = wave;
  }

  function newGame() {
    player.x = W / 2;
    player.y = H - 80;
    player.cooldown = 0;
    player.invincible = 120;
    bullets = [];
    enemyBullets = [];
    enemies = [];
    particles = [];
    score = 0;
    lives = 3;
    wave = 1;
    waveTimer = 0;
    spawnTimer = 0;
    state = "playing";
    updateStatus();
  }

  function spawnEnemy() {
    const roll = Math.random();
    let type = "small";
    if (wave >= 3 && roll < 0.08) type = "big";
    else if (wave >= 2 && roll < 0.2) type = "dasher";
    else if (wave >= 2 && roll < 0.45) type = "shooter";

    const t = ENEMY_TYPES[type];
    enemies.push({
      ...t,
      type,
      x: t.r + Math.random() * (W - t.r * 2),
      y: -t.r,
      speed: t.speed + wave * 0.15,
      phase: Math.random() * Math.PI * 2,
      fireTimer: 60 + Math.random() * 90,
      flash: 0,
      // 以下は突進型だけが使う
      mode: "enter",
      stopY: 60 + Math.random() * 120,
      aimTimer: 0,
      angle: Math.PI / 2,
      dx: 0,
      dy: 0,
    });
  }

  // 突進型: 降りてくる → 止まって自機を狙う → 狙った方向へ一直線に突っ込む
  function updateDasher(e) {
    if (e.mode === "enter") {
      e.y += e.speed;
      if (e.y >= e.stopY) {
        e.mode = "aim";
        e.aimTimer = 50;
      }
    } else if (e.mode === "aim") {
      e.angle = Math.atan2(player.y - e.y, player.x - e.x);
      e.aimTimer--;
      if (e.aimTimer <= 0) {
        const speed = 7 + wave * 0.3;
        e.dx = Math.cos(e.angle) * speed;
        e.dy = Math.sin(e.angle) * speed;
        e.mode = "dash";
      }
    } else {
      e.x += e.dx;
      e.y += e.dy;
    }
  }

  function shoot() {
    bullets.push({ x: player.x, y: player.y - player.r, dx: 0, dy: -10 });
    // ウェーブ4以降は3方向に撃てる
    if (wave >= 4) {
      bullets.push({ x: player.x, y: player.y - player.r, dx: -2, dy: -9.5 });
      bullets.push({ x: player.x, y: player.y - player.r, dx: 2, dy: -9.5 });
    }
    player.cooldown = 9;
  }

  function explode(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      particles.push({
        x,
        y,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        life: 30 + Math.random() * 20,
        color,
      });
    }
  }

  function hitPlayer() {
    if (player.invincible > 0) return;
    explode(player.x, player.y, "#7fdbff", 40);
    lives--;
    updateStatus();
    if (lives <= 0) {
      state = "over";
      if (score > highScore) {
        highScore = score;
        saveHighScore();
        updateStatus();
      }
      return;
    }
    player.invincible = 120;
    enemyBullets = [];
  }

  function circlesHit(a, ar, b, br) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy < (ar + br) * (ar + br);
  }

  function updateStars() {
    for (const s of stars) {
      s.y += s.speed;
      if (s.y > H) {
        s.y = 0;
        s.x = Math.random() * W;
      }
    }
  }

  function updatePlayer() {
    let mx = 0;
    let my = 0;
    if (keys.ArrowLeft || keys.a) mx -= 1;
    if (keys.ArrowRight || keys.d) mx += 1;
    if (keys.ArrowUp || keys.w) my -= 1;
    if (keys.ArrowDown || keys.s) my += 1;
    if (mx && my) {
      mx *= Math.SQRT1_2;
      my *= Math.SQRT1_2;
    }
    player.x += mx * player.speed;
    player.y += my * player.speed;

    // タッチ操作では指の位置へ近づける
    if (touchTarget) {
      player.x += (touchTarget.x - player.x) * 0.25;
      player.y += (touchTarget.y - player.y) * 0.25;
    }

    player.x = Math.max(player.r, Math.min(W - player.r, player.x));
    player.y = Math.max(player.r, Math.min(H - player.r, player.y));

    if (player.cooldown > 0) player.cooldown--;
    if (player.invincible > 0) player.invincible--;
    if ((keys[" "] || touchTarget) && player.cooldown === 0) shoot();
  }

  function updateEnemies() {
    // 時間経過でウェーブが進む
    waveTimer++;
    if (waveTimer > 60 * 20) {
      wave++;
      waveTimer = 0;
      updateStatus();
    }

    spawnTimer--;
    if (spawnTimer <= 0) {
      spawnEnemy();
      spawnTimer = Math.max(15, 60 - wave * 5);
    }

    for (const e of enemies) {
      if (e.type === "dasher") {
        updateDasher(e);
      } else {
        e.phase += 0.03;
        e.y += e.speed;
        e.x += Math.sin(e.phase) * 1.2;
      }
      if (e.flash > 0) e.flash--;

      if (e.shoots) {
        e.fireTimer--;
        if (e.fireTimer <= 0 && e.y > 0 && e.y < H * 0.7) {
          const angle = Math.atan2(player.y - e.y, player.x - e.x);
          const speed = 3 + wave * 0.2;
          enemyBullets.push({ x: e.x, y: e.y, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed });
          e.fireTimer = Math.max(40, 120 - wave * 8);
        }
      }

      if (circlesHit(e, e.r, player, player.r * 0.7)) {
        e.hp = 0;
        explode(e.x, e.y, e.color, 20);
        hitPlayer();
      }
    }
  }

  function updateBullets() {
    for (const b of bullets) {
      b.x += b.dx;
      b.y += b.dy;
      for (const e of enemies) {
        if (e.hp <= 0 || !circlesHit(b, 3, e, e.r)) continue;
        b.dead = true;
        e.hp--;
        e.flash = 4;
        if (e.hp <= 0) {
          score += e.points;
          explode(e.x, e.y, e.color, e.type === "big" ? 50 : 20);
          updateStatus();
        }
        break;
      }
    }

    for (const b of enemyBullets) {
      b.x += b.dx;
      b.y += b.dy;
      if (circlesHit(b, 4, player, player.r * 0.5)) {
        b.dead = true;
        hitPlayer();
      }
    }

    for (const p of particles) {
      p.x += p.dx;
      p.y += p.dy;
      p.dx *= 0.95;
      p.dy *= 0.95;
      p.life--;
    }

    const inside = (o) => !o.dead && o.x > -40 && o.x < W + 40 && o.y > -40 && o.y < H + 40;
    bullets = bullets.filter(inside);
    enemyBullets = enemyBullets.filter(inside);
    // 突進型は横や上にも飛んでいくので、画面の外に出たら消す
    enemies = enemies.filter(
      (e) => e.hp > 0 && e.y < H + e.r && e.y > -e.r * 3 && e.x > -e.r && e.x < W + e.r
    );
    particles = particles.filter((p) => p.life > 0);
  }

  function update() {
    updateStars();
    if (state !== "playing") return;
    updatePlayer();
    updateEnemies();
    updateBullets();
  }

  function drawShip(x, y, r) {
    ctx.fillStyle = "#7fdbff";
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.lineTo(x, y + r * 0.5);
    ctx.lineTo(x - r, y + r);
    ctx.closePath();
    ctx.fill();

    // エンジンの炎
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.moveTo(x - r * 0.3, y + r * 0.7);
    ctx.lineTo(x, y + r * (1.2 + Math.random() * 0.5));
    ctx.lineTo(x + r * 0.3, y + r * 0.7);
    ctx.closePath();
    ctx.fill();
  }

  function drawEnemy(e) {
    ctx.fillStyle = e.flash > 0 ? "#fff" : e.color;
    ctx.beginPath();
    if (e.type === "small") {
      ctx.moveTo(e.x, e.y + e.r);
      ctx.lineTo(e.x + e.r, e.y - e.r);
      ctx.lineTo(e.x - e.r, e.y - e.r);
      ctx.closePath();
    } else if (e.type === "shooter") {
      ctx.moveTo(e.x, e.y + e.r);
      ctx.lineTo(e.x + e.r, e.y);
      ctx.lineTo(e.x, e.y - e.r);
      ctx.lineTo(e.x - e.r, e.y);
      ctx.closePath();
    } else if (e.type === "dasher") {
      // 狙っている間は突進する方向に予告線を出す
      if (e.mode === "aim") {
        ctx.strokeStyle = "rgba(105, 219, 124, 0.45)";
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(e.angle) * H, e.y + Math.sin(e.angle) * H);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
      }
      // 進む方向に向けた矢じり形
      const cos = Math.cos(e.angle);
      const sin = Math.sin(e.angle);
      const point = (f, s) => ctx.lineTo(e.x + cos * f - sin * s, e.y + sin * f + cos * s);
      point(e.r, 0);
      point(-e.r, e.r * 0.8);
      point(-e.r * 0.4, 0);
      point(-e.r, -e.r * 0.8);
      ctx.closePath();
    } else {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        ctx.lineTo(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r);
      }
      ctx.closePath();
    }
    ctx.fill();

    if (e.type === "big") {
      const ratio = e.hp / ENEMY_TYPES.big.hp;
      ctx.fillStyle = "#333";
      ctx.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2, 4);
      ctx.fillStyle = "#69db7c";
      ctx.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2 * ratio, 4);
    }
  }

  function drawMessage(title, sub) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, H / 2 - 70, W, 140);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "bold 34px system-ui, sans-serif";
    ctx.fillText(title, W / 2, H / 2 - 8);
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText(sub, W / 2, H / 2 + 30);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    for (const s of stars) {
      ctx.fillStyle = `rgba(255, 255, 255, ${s.speed / 3})`;
      ctx.fillRect(s.x, s.y, 2, 2);
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life / 30);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#fff59d";
    for (const b of bullets) ctx.fillRect(b.x - 2, b.y - 8, 4, 12);

    ctx.fillStyle = "#ff8787";
    for (const b of enemyBullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const e of enemies) drawEnemy(e);

    // 無敵中は点滅させる
    const blink = player.invincible > 0 && Math.floor(player.invincible / 6) % 2 === 0;
    if (state !== "over" && state !== "title" && !blink) drawShip(player.x, player.y, player.r);

    if (state === "title") drawMessage("シューティング", "スペース / タップでスタート");
    if (state === "paused") drawMessage("一時停止", "P で再開");
    if (state === "over") drawMessage("ゲームオーバー", `スコア ${score}　スペース / タップでもう一度`);
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  function toCanvasPoint(touch) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((touch.clientX - rect.left) / rect.width) * W,
      // 指で自機が隠れないよう少し上に置く
      y: ((touch.clientY - rect.top) / rect.height) * H - 50,
    };
  }

  document.addEventListener("keydown", (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(key)) e.preventDefault();

    if (key === " " && (state === "title" || state === "over")) {
      newGame();
      return;
    }
    if (key === "p") {
      if (state === "playing") state = "paused";
      else if (state === "paused") state = "playing";
    }
    keys[key] = true;
  });
  document.addEventListener("keyup", (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys[key] = false;
  });
  window.addEventListener("blur", () => {
    for (const k in keys) keys[k] = false;
    if (state === "playing") state = "paused";
  });

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (state === "title" || state === "over") newGame();
    touchTarget = toCanvasPoint(e.touches[0]);
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    touchTarget = toCanvasPoint(e.touches[0]);
  }, { passive: false });
  canvas.addEventListener("touchend", () => {
    touchTarget = null;
  });

  updateStatus();
  loop();
})();
