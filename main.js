const TAU = Math.PI * 2;

const randomBetween = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

class OrbitDodger {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.scoreNode = document.querySelector("#orbitScore");
    this.levelNode = document.querySelector("#orbitLevel");
    this.nearMissNode = document.querySelector("#nearMisses");
    this.streakNode = document.querySelector("#orbStreak");
    this.statusNode = document.querySelector("#orbitStatus");
    this.pauseButton = document.querySelector("#pauseGame");
    this.restartButton = document.querySelector("#restartGame");

    this.pauseButton.addEventListener("click", () => this.togglePause());
    this.restartButton.addEventListener("click", () => this.reset());
    this.canvas.addEventListener("click", () => this.switchOrbit());
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space") {
        event.preventDefault();
        this.switchOrbit();
      } else if (event.code === "KeyP") {
        this.togglePause();
      } else if (event.code === "KeyH") {
        this.showHelp = !this.showHelp;
      }
    });

    this.reset();
    requestAnimationFrame((time) => this.tick(time));
  }

  reset() {
    this.center = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    this.angle = -Math.PI / 2;
    this.orbitIndex = 0;
    this.orbitRadii = [88, 132];
    this.score = 0;
    this.level = 1;
    this.nearMisses = 0;
    this.orbStreak = 0;
    this.spawnTimer = 0;
    this.orbTimer = 1.2;
    this.asteroids = [];
    this.orbs = [];
    this.particles = [];
    this.impactFlash = 0;
    this.nearMissPulse = 0;
    this.orbitSwapPulse = 0;
    this.gameOver = false;
    this.paused = false;
    this.showHelp = true;
    this.lastTime = undefined;
    this.pauseButton.textContent = "Pause";
    this.statusNode.textContent = "Space/click swaps orbit. P pauses. H toggles help.";
    this.syncStats();
  }

  switchOrbit() {
    if (this.gameOver) {
      this.reset();
      return;
    }

    if (this.paused) return;

    this.orbitIndex = this.orbitIndex === 0 ? 1 : 0;
    this.showHelp = false;
    this.orbitSwapPulse = 0.35;
    this.emitParticles(this.getSatellitePosition(), "#57d8ff", 10, 70);
  }

  togglePause() {
    if (this.gameOver) return;

    this.paused = !this.paused;
    this.pauseButton.textContent = this.paused ? "Resume" : "Pause";
    this.statusNode.textContent = this.paused
      ? "Paused. Press P or Resume when ready."
      : "Space/click swaps orbit. P pauses. H toggles help.";
  }

  syncStats() {
    this.scoreNode.textContent = Math.floor(this.score).toString();
    this.levelNode.textContent = this.level.toString();
    this.nearMissNode.textContent = this.nearMisses.toString();
    this.streakNode.textContent = this.orbStreak.toString();
  }

  tick(time) {
    const dt = Math.min((time - (this.lastTime ?? time)) / 1000, 0.033);
    this.lastTime = time;

    if (!this.gameOver && !this.paused) {
      this.update(dt);
    }

    if (!this.paused) {
      this.updateParticles(dt);
    }

    this.draw();
    requestAnimationFrame((nextTime) => this.tick(nextTime));
  }

  update(dt) {
    const nextLevel = Math.min(9, 1 + Math.floor(this.score / 250));
    if (nextLevel > this.level) {
      this.level = nextLevel;
      this.statusNode.textContent = `Level ${this.level}: asteroid traffic is getting tighter.`;
      this.emitParticles(this.center, "#a98bff", 22, 95);
    }

    this.angle = (this.angle + dt * (1.78 + this.level * 0.08)) % TAU;
    this.score += dt * (9 + this.level * 1.8);
    this.spawnTimer -= dt;
    this.orbTimer -= dt;
    this.impactFlash = Math.max(0, this.impactFlash - dt * 1.8);
    this.nearMissPulse = Math.max(0, this.nearMissPulse - dt * 2.8);
    this.orbitSwapPulse = Math.max(0, this.orbitSwapPulse - dt * 2.4);

    if (this.spawnTimer <= 0) {
      this.spawnAsteroid();
      this.spawnTimer = randomBetween(Math.max(0.28, 0.64 - this.level * 0.035), Math.max(0.44, 1.06 - this.level * 0.055));
    }

    if (this.orbTimer <= 0) {
      this.spawnOrb();
      this.orbTimer = randomBetween(1.8, 3.15);
    }

    const satellite = this.getSatellitePosition();

    this.asteroids.forEach((asteroid) => {
      asteroid.angle = (asteroid.angle + asteroid.speed * dt) % TAU;
      asteroid.rotation += asteroid.spin * dt;
      asteroid.life += dt;
      const asteroidPosition = this.pointOnOrbit(asteroid.angle, this.orbitRadii[asteroid.orbit]);
      const distance = Math.hypot(satellite.x - asteroidPosition.x, satellite.y - asteroidPosition.y);

      if (distance < asteroid.size + 8) {
        this.triggerCollision(asteroidPosition);
      } else if (!asteroid.countedNearMiss && distance < asteroid.size + 24 && asteroid.orbit === this.orbitIndex) {
        asteroid.countedNearMiss = true;
        this.nearMisses += 1;
        this.score += 24 + this.level * 4;
        this.nearMissPulse = 0.45;
        this.statusNode.textContent = "Near miss! Thread the gap for a score bonus.";
        this.emitParticles(asteroidPosition, "#ffbf69", 8, 55);
      }
    });

    this.orbs.forEach((orb) => {
      orb.angle = (orb.angle + orb.speed * dt) % TAU;
      const orbPosition = this.pointOnOrbit(orb.angle, this.orbitRadii[orb.orbit]);
      const distance = Math.hypot(satellite.x - orbPosition.x, satellite.y - orbPosition.y);
      if (distance < 20 && orb.orbit === this.orbitIndex) {
        orb.collected = true;
        this.orbStreak += 1;
        this.score += 70 + Math.min(this.orbStreak, 6) * 15;
        this.statusNode.textContent = `Orb collected! Streak x${this.orbStreak}.`;
        this.emitParticles(orbPosition, "#75f0a4", 18, 90);
      }
    });

    this.asteroids = this.asteroids.filter((asteroid) => asteroid.life < 6);
    this.orbs = this.orbs.filter((orb) => !orb.collected);
    this.syncStats();
  }

  spawnAsteroid() {
    const speed = randomBetween(0.46 + this.level * 0.045, 0.84 + this.level * 0.06);
    this.asteroids.push({
      angle: randomBetween(0, TAU),
      orbit: Math.random() > 0.5 ? 1 : 0,
      speed: speed * (Math.random() > 0.18 ? -1 : 1),
      size: randomBetween(10, 14 + this.level * 0.5),
      spin: randomBetween(-2.2, 2.2),
      rotation: randomBetween(0, TAU),
      life: 0,
      countedNearMiss: false,
    });
  }

  spawnOrb() {
    this.orbs.push({
      angle: randomBetween(0, TAU),
      orbit: Math.random() > 0.5 ? 1 : 0,
      speed: randomBetween(0.25, 0.5),
      collected: false,
    });
  }

  triggerCollision(point) {
    if (this.gameOver) return;

    this.gameOver = true;
    this.paused = false;
    this.pauseButton.textContent = "Pause";
    this.impactFlash = 1;
    this.orbStreak = 0;
    this.statusNode.textContent = `Collision at level ${this.level}. Press Space or Restart to launch again.`;
    this.emitParticles(point, "#ff6b8b", 46, 170);
    this.syncStats();
  }

  emitParticles(origin, color, amount, speed) {
    for (let i = 0; i < amount; i += 1) {
      const angle = randomBetween(0, TAU);
      const velocity = randomBetween(speed * 0.35, speed);
      this.particles.push({
        x: origin.x,
        y: origin.y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: randomBetween(0.35, 0.75),
        maxLife: 0.75,
        size: randomBetween(1.5, 4),
        color,
      });
    }
  }

  updateParticles(dt) {
    this.particles.forEach((particle) => {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.98;
      particle.vy *= 0.98;
      particle.life -= dt;
    });
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  getSatellitePosition() {
    return this.pointOnOrbit(this.angle, this.orbitRadii[this.orbitIndex]);
  }

  pointOnOrbit(angle, radius) {
    return {
      x: this.center.x + Math.cos(angle) * radius,
      y: this.center.y + Math.sin(angle) * radius,
    };
  }

  draw() {
    const ctx = this.ctx;
    const shake = this.impactFlash > 0 ? Math.sin(performance.now() * 0.07) * this.impactFlash * 7 : 0;

    ctx.save();
    ctx.translate(shake, -shake * 0.45);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawSpace();

    this.orbitRadii.forEach((radius, index) => {
      ctx.beginPath();
      ctx.arc(this.center.x, this.center.y, radius, 0, TAU);
      const isActive = index === this.orbitIndex;
      ctx.strokeStyle = isActive ? "rgba(87, 216, 255, 0.78)" : "rgba(255,255,255,0.16)";
      ctx.lineWidth = isActive ? 3 + this.orbitSwapPulse * 4 : 1;
      ctx.stroke();
    });

    if (this.nearMissPulse > 0) {
      ctx.strokeStyle = `rgba(255, 191, 105, ${this.nearMissPulse})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(this.center.x, this.center.y, this.orbitRadii[this.orbitIndex] + 9, 0, TAU);
      ctx.stroke();
    }

    const planetGradient = ctx.createRadialGradient(
      this.center.x - 12,
      this.center.y - 16,
      8,
      this.center.x,
      this.center.y,
      48,
    );
    planetGradient.addColorStop(0, "#8ff7ff");
    planetGradient.addColorStop(0.45, "#3a8cff");
    planetGradient.addColorStop(1, "#15245b");
    ctx.fillStyle = planetGradient;
    ctx.beginPath();
    ctx.arc(this.center.x, this.center.y, 46, 0, TAU);
    ctx.fill();

    this.orbs.forEach((orb) => {
      const point = this.pointOnOrbit(orb.angle, this.orbitRadii[orb.orbit]);
      ctx.fillStyle = "#75f0a4";
      ctx.shadowColor = "#75f0a4";
      ctx.shadowBlur = 12 + Math.sin(performance.now() * 0.008) * 5;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 7, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(117, 240, 164, 0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 11, 0, TAU);
      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    this.asteroids.forEach((asteroid) => {
      const point = this.pointOnOrbit(asteroid.angle, this.orbitRadii[asteroid.orbit]);
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(asteroid.rotation);
      ctx.fillStyle = "#ffbf69";
      ctx.beginPath();
      ctx.moveTo(asteroid.size, 0);
      ctx.lineTo(asteroid.size * 0.18, asteroid.size * 0.92);
      ctx.lineTo(-asteroid.size, asteroid.size * 0.42);
      ctx.lineTo(-asteroid.size * 0.68, -asteroid.size * 0.82);
      ctx.lineTo(asteroid.size * 0.58, -asteroid.size);
      ctx.closePath();
      ctx.fill();
      if (asteroid.countedNearMiss) {
        ctx.strokeStyle = "rgba(255, 191, 105, 0.75)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    });

    this.particles.forEach((particle) => {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    const satellite = this.getSatellitePosition();
    ctx.save();
    ctx.translate(satellite.x, satellite.y);
    ctx.rotate(this.angle + Math.PI / 2);
    ctx.fillStyle = this.gameOver ? "#ff6b8b" : "#edf4ff";
    ctx.fillRect(-9, -7, 18, 14);
    ctx.fillStyle = "#57d8ff";
    ctx.fillRect(-15, -3, 6, 6);
    ctx.fillRect(9, -3, 6, 6);
    ctx.restore();

    this.drawHud();
    ctx.restore();

    if (this.impactFlash > 0) {
      ctx.fillStyle = `rgba(255, 107, 139, ${this.impactFlash * 0.28})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    if (this.paused || this.showHelp) {
      this.drawHelpOverlay(this.paused ? "Paused" : "Orbit controls");
    }

    if (this.gameOver) {
      ctx.fillStyle = "rgba(8, 11, 22, 0.68)";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = "#edf4ff";
      ctx.font = "800 28px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Orbit lost", this.center.x, this.center.y - 8);
      ctx.font = "500 15px system-ui";
      ctx.fillText("Press Space or Restart to launch again", this.center.x, this.center.y + 22);
    }
  }

  drawHud() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(8, 11, 22, 0.58)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(16, 14, 148, 54, 16);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#edf4ff";
    ctx.font = "800 15px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(`Level ${this.level}`, 30, 36);
    ctx.fillStyle = "#9fb0cc";
    ctx.font = "600 12px system-ui";
    ctx.fillText(`Streak x${this.orbStreak}  |  H for help`, 30, 55);
  }

  drawHelpOverlay(title) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(8, 11, 22, 0.78)";
    ctx.fillRect(42, 78, this.canvas.width - 84, 190);
    ctx.strokeStyle = "rgba(87, 216, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(42.5, 78.5, this.canvas.width - 85, 189);
    ctx.fillStyle = "#edf4ff";
    ctx.font = "800 24px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(title, this.center.x, 116);
    ctx.font = "600 14px system-ui";
    ctx.fillStyle = "#9fb0cc";
    ctx.fillText("Space or click: swap orbit", this.center.x, 152);
    ctx.fillText("Collect green orbs to build streak bonuses", this.center.x, 178);
    ctx.fillText("Near misses score bonus points, but collisions end the run", this.center.x, 204);
    ctx.fillText("P: pause/resume  |  H: hide/show this guide", this.center.x, 230);
  }

  drawSpace() {
    const ctx = this.ctx;
    ctx.fillStyle = "#07111f";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (let i = 0; i < 42; i += 1) {
      const x = (i * 97) % this.canvas.width;
      const y = (i * 53) % this.canvas.height;
      ctx.fillRect(x, y, 1.4, 1.4);
    }
  }
}

class SlackMoodPulse {
  constructor() {
    this.emojiCloud = document.querySelector("#emojiCloud");
    this.channelSelect = document.querySelector("#testChannel");
    this.title = document.querySelector("#pulseTitle");
    this.summary = document.querySelector("#pulseSummary");
    this.insights = document.querySelector("#pulseInsights");
    this.score = document.querySelector("#pulseScore");
    this.scope = document.querySelector("#pulseScope");
    this.preview = document.querySelector("#messagePreview");
    this.privacy = document.querySelector("#privacyNote");
    this.channelProfiles = {
      "agent-lab": {
        name: "#agent-lab",
        focus: "prototype chatter",
        members: 12,
        range: [2, 16],
        scoreShift: 2,
        scope: "Reactions + public thread counts",
        action: "summarize blockers without quoting private message text",
        privacy: "Local dry run only: no Slack token, no network call, no member names, and no message bodies leave the browser.",
      },
      "release-room": {
        name: "#release-room",
        focus: "release readiness",
        members: 8,
        range: [3, 13],
        scoreShift: -3,
        scope: "Reactions + checklist signals",
        action: "flag launch risks and ask for one owner per open checklist item",
        privacy: "Test scope is limited to synthetic release signals; production automations would need explicit channel approval.",
      },
      "support-triage": {
        name: "#support-triage",
        focus: "customer support load",
        members: 10,
        range: [4, 18],
        scoreShift: -7,
        scope: "Reactions + queue labels",
        action: "suggest pairing on high-friction tickets while keeping customer details out",
        privacy: "Preview uses fake ticket pressure only; customer names, messages, and account details are intentionally excluded.",
      },
    };

    document.querySelector("#refreshPulse").addEventListener("click", () => this.refresh());
    this.channelSelect.addEventListener("change", () => this.refresh());
    this.refresh();
  }

  refresh() {
    const profile = this.channelProfiles[this.channelSelect.value];
    const baseReactions = [
      { emoji: "🎉", label: "celebration", weight: 1.15 },
      { emoji: "🚀", label: "shipping", weight: 1 },
      { emoji: "👀", label: "review", weight: 0.8 },
      { emoji: "☕", label: "needs coffee", weight: 0.75 },
      { emoji: "🧠", label: "deep focus", weight: 0.9 },
      { emoji: "✅", label: "unblocked", weight: 1.1 },
      { emoji: "🔥", label: "high energy", weight: 1 },
      { emoji: "🛟", label: "support needed", weight: 0.65 },
      { emoji: "💡", label: "ideas", weight: 0.85 },
      { emoji: "🙌", label: "kudos", weight: 1.1 },
    ].map((reaction) => ({
      ...reaction,
      count: Math.floor(randomBetween(...profile.range) * reaction.weight),
    }));

    const reactions = this.tuneReactions(baseReactions, profile);
    const top = [...reactions].sort((a, b) => b.count - a.count).slice(0, 3);
    const total = reactions.reduce((sum, reaction) => sum + reaction.count, 0);
    const support = reactions.find((reaction) => reaction.label === "support needed").count;
    const coffee = reactions.find((reaction) => reaction.label === "needs coffee").count;
    const review = reactions.find((reaction) => reaction.label === "review").count;
    const positive = reactions
      .filter((reaction) => ["celebration", "shipping", "unblocked", "high energy", "ideas", "kudos"].includes(reaction.label))
      .reduce((sum, reaction) => sum + reaction.count, 0);
    const moodScore = clamp(Math.round(60 + (positive / total) * 42 - ((support + coffee + review) / total) * 24 + profile.scoreShift), 35, 96);
    const weather =
      support > 11
        ? "Cloudy with a chance of pairing"
        : coffee > 10
          ? "Caffeinated and curious"
          : review > 10
            ? "Focused review window"
            : "Bright with shipping momentum";
    const topSignals = top.map((reaction) => `${reaction.emoji} ${reaction.label}`).join(", ");

    this.emojiCloud.innerHTML = reactions
      .map(
        (reaction) =>
          `<span class="emoji-pill"><span>${reaction.emoji}</span><strong>${reaction.count}</strong></span>`,
      )
      .join("");

    this.title.textContent = `Team weather: ${weather}`;
    this.summary.textContent = `Sampled ${total} pretend reactions from ${profile.name} across ${profile.members} fake teammates. Top signals: ${topSignals}.`;
    this.score.textContent = `${moodScore}%`;
    this.scope.textContent = profile.scope;
    this.insights.innerHTML = [
      `Generated report: ${profile.focus} looks ${weather.toLowerCase()} with a ${moodScore}% confidence pulse.`,
      `Suggested agent action: ${profile.action}.`,
      `Scope guard: aggregate reactions only; avoid names, direct messages, and raw message quotes.`,
      `Safe mode: this demo is local-only and does not connect to Slack.`,
    ]
      .map((item) => `<li>${item}</li>`)
      .join("");
    this.preview.textContent = `:bar_chart: ${profile.name} safe mood pulse: ${weather}. Top signals were ${topSignals}. Next step: ${profile.action}.`;
    this.privacy.textContent = profile.privacy;
  }

  tuneReactions(reactions, profile) {
    const channelBoosts = {
      "#agent-lab": { ideas: 3, "high energy": 2, kudos: 2 },
      "#release-room": { review: 4, shipping: 3, unblocked: 2, "support needed": 2 },
      "#support-triage": { "support needed": 5, "needs coffee": 3, "deep focus": 2, kudos: 1 },
    };
    const boosts = channelBoosts[profile.name] ?? {};

    return reactions.map((reaction) => ({
      ...reaction,
      count: reaction.count + (boosts[reaction.label] ?? 0),
    }));
  }
}

class PixelAquarium {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.status = document.querySelector("#aquariumStatus");
    this.modeNode = document.querySelector("#aquariumMode");
    this.pearlNode = document.querySelector("#pearlCount");
    this.modeButton = document.querySelector("#toggleSchool");
    this.forageButton = document.querySelector("#toggleForage");
    this.mode = "free";
    this.pearlGoal = 8;
    this.pearlCount = 0;
    this.pointerBurst = { x: canvas.width / 2, y: canvas.height / 2, power: 0 };
    this.fish = Array.from({ length: 22 }, (_, index) => this.createFish(index));
    this.bubbles = Array.from({ length: 34 }, () => this.createBubble(true));
    this.pearls = Array.from({ length: 5 }, () => this.createPearl());
    this.sparkles = [];

    this.modeButton.addEventListener("click", () => {
      this.setMode(this.mode === "school" ? "free" : "school");
    });

    this.forageButton.addEventListener("click", () => {
      this.setMode(this.mode === "forage" ? "free" : "forage");
    });

    this.canvas.addEventListener("click", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointerBurst = {
        x: ((event.clientX - rect.left) / rect.width) * this.canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * this.canvas.height,
        power: 1,
      };
      this.spawnBubbleBurst(this.pointerBurst.x, this.pointerBurst.y);
      this.status.textContent = "Bubble ping sent. Fish scatter, then regroup with boid rules.";
    });

    window.addEventListener("keydown", (event) => {
      const tagName = event.target?.tagName;
      if (tagName === "INPUT" || tagName === "SELECT" || tagName === "TEXTAREA") return;

      if (event.code === "KeyS") {
        this.setMode(this.mode === "school" ? "free" : "school");
      }
      if (event.code === "KeyF") {
        this.setMode(this.mode === "forage" ? "free" : "forage");
      }
    });

    this.syncStats();
    requestAnimationFrame((time) => this.tick(time));
  }

  createFish(index) {
    const colors = ["#57d8ff", "#a98bff", "#75f0a4", "#ffbf69", "#ff6b8b"];
    return {
      x: randomBetween(40, this.canvas.width - 40),
      y: randomBetween(55, this.canvas.height - 55),
      vx: randomBetween(-45, 45),
      vy: randomBetween(-28, 28),
      color: colors[index % colors.length],
      label: ["plan", "code", "test", "ship"][index % 4],
      size: randomBetween(0.86, 1.16),
      wiggle: randomBetween(0, TAU),
      target: this.schoolTarget(index),
    };
  }

  createBubble(randomY = false) {
    return {
      x: randomBetween(15, this.canvas.width - 15),
      y: randomY ? randomBetween(0, this.canvas.height) : this.canvas.height + 12,
      size: randomBetween(2, 6),
      speed: randomBetween(14, 38),
      wobble: randomBetween(0, TAU),
    };
  }

  createPearl() {
    return {
      x: randomBetween(44, this.canvas.width - 44),
      y: randomBetween(64, this.canvas.height - 86),
      size: randomBetween(4, 7),
      shimmer: randomBetween(0, TAU),
    };
  }

  schoolTarget(index) {
    const textPoints = [
      [80, 110],
      [80, 150],
      [80, 190],
      [122, 110],
      [122, 150],
      [122, 190],
      [176, 110],
      [176, 150],
      [176, 190],
      [230, 110],
      [230, 150],
      [230, 190],
      [292, 110],
      [292, 150],
      [292, 190],
      [356, 110],
      [356, 150],
      [420, 190],
      [420, 150],
      [462, 110],
      [462, 150],
      [462, 190],
    ];
    const [x, y] = textPoints[index % textPoints.length];
    return { x, y };
  }

  setMode(mode) {
    this.mode = mode;
    const modeNames = {
      free: "Free swim",
      school: "Schooling",
      forage: "Forage",
    };
    const statusText = {
      free: "Free swim: click the tank to scatter agents. Press S or F for modes.",
      school: "Schooling mode: agents form PARALLEL while still avoiding crowding.",
      forage: "Forage mode: agents hunt pearls for the treasure chest. Collect 8.",
    };

    this.modeButton.setAttribute("aria-pressed", String(mode === "school"));
    this.forageButton.setAttribute("aria-pressed", String(mode === "forage"));
    this.modeNode.textContent = modeNames[mode];
    this.status.textContent = statusText[mode];
  }

  syncStats() {
    this.pearlNode.textContent = `${Math.min(this.pearlCount, this.pearlGoal)}/${this.pearlGoal}`;
  }

  tick(time) {
    const dt = Math.min((time - (this.lastTime ?? time)) / 1000, 0.033);
    this.lastTime = time;
    this.update(dt);
    this.draw();
    requestAnimationFrame((nextTime) => this.tick(nextTime));
  }

  update(dt) {
    this.pointerBurst.power = Math.max(0, this.pointerBurst.power - dt * 1.6);
    this.sparkles = this.sparkles
      .map((sparkle) => ({
        ...sparkle,
        x: sparkle.x + sparkle.vx * dt,
        y: sparkle.y + sparkle.vy * dt,
        life: sparkle.life - dt,
      }))
      .filter((sparkle) => sparkle.life > 0);

    this.fish.forEach((fish, index) => {
      const flock = this.getFlockSteering(fish, index);
      fish.vx += flock.x * dt;
      fish.vy += flock.y * dt;

      if (this.mode === "school") {
        fish.vx += (fish.target.x - fish.x) * dt * 0.9;
        fish.vy += (fish.target.y - fish.y) * dt * 0.9;
      } else if (this.mode === "forage") {
        const nearest = this.nearestPearl(fish);
        if (nearest) {
          const angle = Math.atan2(nearest.pearl.y - fish.y, nearest.pearl.x - fish.x);
          const pull = clamp(130 - nearest.distance, 32, 130);
          fish.vx += Math.cos(angle) * pull * dt;
          fish.vy += Math.sin(angle) * pull * dt;
        }
      } else {
        fish.vx += Math.sin((fish.y + performance.now() * 0.02 + fish.wiggle) * 0.02) * dt * 12;
        fish.vy += Math.cos((fish.x + performance.now() * 0.017 + fish.wiggle) * 0.02) * dt * 7;
      }

      const burstDistance = Math.hypot(fish.x - this.pointerBurst.x, fish.y - this.pointerBurst.y);
      if (this.pointerBurst.power > 0 && burstDistance < 150) {
        const force = ((150 - burstDistance) / 150) * this.pointerBurst.power * 180;
        fish.vx += ((fish.x - this.pointerBurst.x) / Math.max(burstDistance, 1)) * force * dt;
        fish.vy += ((fish.y - this.pointerBurst.y) / Math.max(burstDistance, 1)) * force * dt;
      }

      const maxSpeed = this.mode === "forage" ? 96 : 82;
      const speed = Math.hypot(fish.vx, fish.vy);
      if (speed > maxSpeed) {
        fish.vx = (fish.vx / speed) * maxSpeed;
        fish.vy = (fish.vy / speed) * maxSpeed;
      }
      fish.vx *= 0.997;
      fish.vy *= 0.997;
      fish.x += fish.vx * dt;
      fish.y += fish.vy * dt;

      if (fish.x < 24 || fish.x > this.canvas.width - 24) fish.vx *= -1;
      if (fish.y < 30 || fish.y > this.canvas.height - 30) fish.vy *= -1;
      fish.x = clamp(fish.x, 24, this.canvas.width - 24);
      fish.y = clamp(fish.y, 30, this.canvas.height - 30);

      const pearlIndex = this.pearls.findIndex((pearl) => Math.hypot(fish.x - pearl.x, fish.y - pearl.y) < 18 + pearl.size);
      if (pearlIndex !== -1) {
        this.collectPearl(pearlIndex, fish.x, fish.y);
      }
    });

    this.bubbles.forEach((bubble, index) => {
      bubble.y -= bubble.speed * dt;
      bubble.x += Math.sin((bubble.y + index * 21 + bubble.wobble) * 0.04) * dt * 9;
      if (bubble.y < -10) {
        this.bubbles[index] = this.createBubble();
      }
    });

    this.pearls.forEach((pearl) => {
      pearl.shimmer = (pearl.shimmer + dt * 3) % TAU;
    });
    this.syncStats();
  }

  getFlockSteering(fish, index) {
    const steering = { x: 0, y: 0 };
    const cohesion = { x: 0, y: 0 };
    const alignment = { x: 0, y: 0 };
    const separation = { x: 0, y: 0 };
    let neighbors = 0;

    this.fish.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      const dx = other.x - fish.x;
      const dy = other.y - fish.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 82) return;

      neighbors += 1;
      cohesion.x += other.x;
      cohesion.y += other.y;
      alignment.x += other.vx;
      alignment.y += other.vy;

      if (distance < 34) {
        const strength = (34 - distance) / 34;
        separation.x -= (dx / Math.max(distance, 1)) * strength;
        separation.y -= (dy / Math.max(distance, 1)) * strength;
      }
    });

    if (neighbors === 0) return steering;

    cohesion.x = cohesion.x / neighbors - fish.x;
    cohesion.y = cohesion.y / neighbors - fish.y;
    alignment.x = alignment.x / neighbors - fish.vx;
    alignment.y = alignment.y / neighbors - fish.vy;

    steering.x = cohesion.x * 0.16 + alignment.x * 0.32 + separation.x * 95;
    steering.y = cohesion.y * 0.16 + alignment.y * 0.32 + separation.y * 95;
    return steering;
  }

  nearestPearl(fish) {
    return this.pearls.reduce((nearest, pearl) => {
      const distance = Math.hypot(fish.x - pearl.x, fish.y - pearl.y);
      if (!nearest || distance < nearest.distance) {
        return { pearl, distance };
      }
      return nearest;
    }, undefined);
  }

  collectPearl(index, x, y) {
    this.pearlCount += 1;
    this.pearls[index] = this.createPearl();
    this.sparkles.push(...Array.from({ length: 12 }, () => ({
      x,
      y,
      vx: randomBetween(-34, 34),
      vy: randomBetween(-38, 18),
      life: randomBetween(0.35, 0.75),
      size: randomBetween(1.5, 3.5),
    })));

    if (this.pearlCount >= this.pearlGoal) {
      this.status.textContent = "Treasure objective complete. The chest is glowing, but pearls keep spawning.";
    } else {
      this.status.textContent = `Pearl secured. ${this.pearlGoal - this.pearlCount} more for the treasure chest.`;
    }
  }

  spawnBubbleBurst(x, y) {
    const burst = Array.from({ length: 8 }, () => ({
      x: x + randomBetween(-12, 12),
      y: y + randomBetween(-12, 12),
      size: randomBetween(2, 5),
      speed: randomBetween(34, 70),
      wobble: randomBetween(0, TAU),
    }));
    this.bubbles = [...this.bubbles, ...burst].slice(-52);
  }

  draw() {
    const ctx = this.ctx;
    const now = performance.now() * 0.001;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    gradient.addColorStop(0, "#08233c");
    gradient.addColorStop(1, "#04101e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawCaustics(now);
    this.drawSand();
    this.drawTreasure(now);
    this.drawSeaweed();
    this.pearls.forEach((pearl) => this.drawPearl(pearl));
    this.bubbles.forEach((bubble) => {
      ctx.strokeStyle = "rgba(237, 244, 255, 0.45)";
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.size, 0, TAU);
      ctx.stroke();
    });
    this.sparkles.forEach((sparkle) => this.drawSparkle(sparkle));

    this.fish.forEach((fish) => this.drawFish(fish));

    if (this.mode === "school") {
      ctx.fillStyle = "rgba(237, 244, 255, 0.18)";
      ctx.font = "900 48px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("PARALLEL", this.canvas.width / 2, 290);
    }

    this.drawModeBadge();
  }

  drawCaustics(now) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "#57d8ff";
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      const y = 34 + i * 28;
      ctx.beginPath();
      for (let x = -20; x <= this.canvas.width + 20; x += 22) {
        const waveY = y + Math.sin(now * 1.4 + i + x * 0.035) * 5;
        if (x === -20) {
          ctx.moveTo(x, waveY);
        } else {
          ctx.lineTo(x, waveY);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSand() {
    const ctx = this.ctx;
    ctx.fillStyle = "#0f2438";
    ctx.beginPath();
    ctx.moveTo(0, this.canvas.height - 42);
    ctx.bezierCurveTo(130, this.canvas.height - 62, 274, this.canvas.height - 20, this.canvas.width, this.canvas.height - 48);
    ctx.lineTo(this.canvas.width, this.canvas.height);
    ctx.lineTo(0, this.canvas.height);
    ctx.closePath();
    ctx.fill();
  }

  drawTreasure(now) {
    const ctx = this.ctx;
    const x = this.canvas.width - 118;
    const y = this.canvas.height - 64;
    const completeGlow = this.pearlCount >= this.pearlGoal ? 0.45 + Math.sin(now * 5) * 0.16 : 0.18;

    ctx.save();
    ctx.shadowColor = "#ffbf69";
    ctx.shadowBlur = 22 * completeGlow;
    ctx.fillStyle = "#6b351d";
    ctx.fillRect(x, y + 16, 72, 34);
    ctx.fillStyle = "#9a5427";
    ctx.beginPath();
    ctx.arc(x + 36, y + 18, 36, Math.PI, 0);
    ctx.lineTo(x + 72, y + 18);
    ctx.lineTo(x, y + 18);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffbf69";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 36, y - 15 * completeGlow + 18);
    ctx.lineTo(x + 36, y + 50);
    ctx.stroke();
    ctx.fillStyle = "#ffbf69";
    ctx.fillRect(x + 27, y + 28, 18, 12);
    ctx.restore();
  }

  drawSeaweed() {
    const ctx = this.ctx;
    for (let i = 0; i < 9; i += 1) {
      const x = 30 + i * 58;
      ctx.strokeStyle = i % 2 ? "rgba(117, 240, 164, 0.6)" : "rgba(87, 216, 255, 0.45)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, this.canvas.height);
      ctx.quadraticCurveTo(x + Math.sin(performance.now() * 0.001 + i) * 16, 290, x + 8, 248);
      ctx.stroke();
    }
  }

  drawPearl(pearl) {
    const ctx = this.ctx;
    const glow = 0.5 + Math.sin(pearl.shimmer) * 0.35;
    ctx.save();
    ctx.shadowColor = "#edf4ff";
    ctx.shadowBlur = 12 + glow * 12;
    ctx.fillStyle = "#edf4ff";
    ctx.beginPath();
    ctx.arc(pearl.x, pearl.y, pearl.size, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(87, 216, 255, 0.8)";
    ctx.beginPath();
    ctx.arc(pearl.x - pearl.size * 0.3, pearl.y - pearl.size * 0.25, pearl.size * 0.28, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawSparkle(sparkle) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = clamp(sparkle.life / 0.75, 0, 1);
    ctx.fillStyle = "#ffbf69";
    ctx.fillRect(sparkle.x, sparkle.y, sparkle.size, sparkle.size);
    ctx.restore();
  }

  drawFish(fish) {
    const ctx = this.ctx;
    const facing = fish.vx >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(fish.x, fish.y);
    ctx.scale(facing * fish.size, fish.size);
    ctx.fillStyle = fish.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 10, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(237, 244, 255, 0.35)";
    ctx.beginPath();
    ctx.ellipse(-2, 1, 7, 3, -0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = fish.color;
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    ctx.lineTo(-28, -10);
    ctx.lineTo(-28, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#07111f";
    ctx.beginPath();
    ctx.arc(8, -3, 2.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#07111f";
    ctx.font = "900 10px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(fish.label, 0, 4);
    ctx.restore();
  }

  drawModeBadge() {
    const ctx = this.ctx;
    const remaining = Math.max(this.pearlGoal - this.pearlCount, 0);
    const label = this.mode === "forage" ? `Pearl hunt: ${remaining} left` : "Keys: S school, F forage";
    ctx.save();
    ctx.fillStyle = "rgba(4, 16, 30, 0.62)";
    ctx.fillRect(14, 14, 190, 28);
    ctx.fillStyle = "#edf4ff";
    ctx.font = "800 12px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(label, 26, 33);
    ctx.restore();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new OrbitDodger(document.querySelector("#orbitCanvas"));
  new SlackMoodPulse();
  new PixelAquarium(document.querySelector("#aquariumCanvas"));
});
