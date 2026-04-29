const TAU = Math.PI * 2;

const randomBetween = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

class OrbitDodger {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.scoreNode = document.querySelector("#orbitScore");
    this.nearMissNode = document.querySelector("#nearMisses");
    this.statusNode = document.querySelector("#orbitStatus");
    this.restartButton = document.querySelector("#restartGame");

    this.restartButton.addEventListener("click", () => this.reset());
    this.canvas.addEventListener("click", () => this.switchOrbit());
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space") {
        event.preventDefault();
        this.switchOrbit();
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
    this.nearMisses = 0;
    this.spawnTimer = 0;
    this.orbTimer = 1.2;
    this.asteroids = [];
    this.orbs = [];
    this.gameOver = false;
    this.lastTime = undefined;
    this.statusNode.textContent = "Press Space or click the canvas to switch orbit.";
    this.syncStats();
  }

  switchOrbit() {
    if (this.gameOver) {
      this.reset();
      return;
    }

    this.orbitIndex = this.orbitIndex === 0 ? 1 : 0;
  }

  syncStats() {
    this.scoreNode.textContent = Math.floor(this.score).toString();
    this.nearMissNode.textContent = this.nearMisses.toString();
  }

  tick(time) {
    const dt = Math.min((time - (this.lastTime ?? time)) / 1000, 0.033);
    this.lastTime = time;

    if (!this.gameOver) {
      this.update(dt);
    }

    this.draw();
    requestAnimationFrame((nextTime) => this.tick(nextTime));
  }

  update(dt) {
    this.angle = (this.angle + dt * 1.9) % TAU;
    this.score += dt * 9;
    this.spawnTimer -= dt;
    this.orbTimer -= dt;

    if (this.spawnTimer <= 0) {
      this.spawnAsteroid();
      this.spawnTimer = randomBetween(0.6, 1.05);
    }

    if (this.orbTimer <= 0) {
      this.spawnOrb();
      this.orbTimer = randomBetween(2, 3.2);
    }

    const satellite = this.getSatellitePosition();

    this.asteroids.forEach((asteroid) => {
      asteroid.angle = (asteroid.angle + asteroid.speed * dt) % TAU;
      asteroid.life += dt;
      const asteroidPosition = this.pointOnOrbit(asteroid.angle, this.orbitRadii[asteroid.orbit]);
      const distance = Math.hypot(satellite.x - asteroidPosition.x, satellite.y - asteroidPosition.y);

      if (distance < 18) {
        this.gameOver = true;
        this.statusNode.textContent = "Collision! Click Restart or press Space to try again.";
      } else if (!asteroid.countedNearMiss && distance < 34 && asteroid.orbit === this.orbitIndex) {
        asteroid.countedNearMiss = true;
        this.nearMisses += 1;
        this.score += 25;
      }
    });

    this.orbs.forEach((orb) => {
      orb.angle = (orb.angle + orb.speed * dt) % TAU;
      const orbPosition = this.pointOnOrbit(orb.angle, this.orbitRadii[orb.orbit]);
      const distance = Math.hypot(satellite.x - orbPosition.x, satellite.y - orbPosition.y);
      if (distance < 20 && orb.orbit === this.orbitIndex) {
        orb.collected = true;
        this.score += 75;
      }
    });

    this.asteroids = this.asteroids.filter((asteroid) => asteroid.life < 6);
    this.orbs = this.orbs.filter((orb) => !orb.collected);
    this.syncStats();
  }

  spawnAsteroid() {
    this.asteroids.push({
      angle: randomBetween(0, TAU),
      orbit: Math.random() > 0.5 ? 1 : 0,
      speed: randomBetween(-0.9, -0.55),
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
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawSpace();

    this.orbitRadii.forEach((radius, index) => {
      ctx.beginPath();
      ctx.arc(this.center.x, this.center.y, radius, 0, TAU);
      ctx.strokeStyle = index === this.orbitIndex ? "rgba(87, 216, 255, 0.75)" : "rgba(255,255,255,0.16)";
      ctx.lineWidth = index === this.orbitIndex ? 3 : 1;
      ctx.stroke();
    });

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
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 7, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    this.asteroids.forEach((asteroid) => {
      const point = this.pointOnOrbit(asteroid.angle, this.orbitRadii[asteroid.orbit]);
      ctx.fillStyle = "#ffbf69";
      ctx.beginPath();
      ctx.moveTo(point.x + 12, point.y);
      ctx.lineTo(point.x + 2, point.y + 11);
      ctx.lineTo(point.x - 12, point.y + 5);
      ctx.lineTo(point.x - 8, point.y - 10);
      ctx.lineTo(point.x + 7, point.y - 12);
      ctx.closePath();
      ctx.fill();
    });

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
    this.title = document.querySelector("#pulseTitle");
    this.summary = document.querySelector("#pulseSummary");
    this.insights = document.querySelector("#pulseInsights");
    document.querySelector("#refreshPulse").addEventListener("click", () => this.refresh());
    this.refresh();
  }

  refresh() {
    const reactions = [
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
      count: Math.floor(randomBetween(2, 16) * reaction.weight),
    }));

    const top = [...reactions].sort((a, b) => b.count - a.count).slice(0, 3);
    const total = reactions.reduce((sum, reaction) => sum + reaction.count, 0);
    const support = reactions.find((reaction) => reaction.label === "support needed").count;
    const coffee = reactions.find((reaction) => reaction.label === "needs coffee").count;
    const weather = support > 8 ? "Cloudy with a chance of pairing" : coffee > 8 ? "Caffeinated and curious" : "Bright with shipping momentum";

    this.emojiCloud.innerHTML = reactions
      .map(
        (reaction) =>
          `<span class="emoji-pill"><span>${reaction.emoji}</span><strong>${reaction.count}</strong></span>`,
      )
      .join("");

    this.title.textContent = `Team weather: ${weather}`;
    this.summary.textContent = `Sampled ${total} pretend reactions from #agent-lab. Top signal: ${top
      .map((reaction) => `${reaction.emoji} ${reaction.label}`)
      .join(", ")}.`;
    this.insights.innerHTML = [
      `Draft post: "Today's channel energy looks ${weather.toLowerCase()}. Keep the wins moving and pair on anything stuck."`,
      `Suggested agent action: summarize blockers without quoting private message text.`,
      `Safe mode: this demo is local-only and does not connect to Slack.`,
    ]
      .map((item) => `<li>${item}</li>`)
      .join("");
  }
}

class PixelAquarium {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.status = document.querySelector("#aquariumStatus");
    this.schooling = false;
    this.pointerBurst = { x: canvas.width / 2, y: canvas.height / 2, power: 0 };
    this.fish = Array.from({ length: 18 }, (_, index) => this.createFish(index));
    this.bubbles = Array.from({ length: 26 }, () => this.createBubble(true));

    document.querySelector("#toggleSchool").addEventListener("click", () => {
      this.schooling = !this.schooling;
      this.status.textContent = this.schooling
        ? "Schooling mode: agents are forming PARALLEL."
        : "Free swim mode: click the tank to scatter the agents.";
    });

    this.canvas.addEventListener("click", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointerBurst = {
        x: ((event.clientX - rect.left) / rect.width) * this.canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * this.canvas.height,
        power: 1,
      };
    });

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
      label: ["A", "B", "C"][index % 3],
      target: this.schoolTarget(index),
    };
  }

  createBubble(randomY = false) {
    return {
      x: randomBetween(15, this.canvas.width - 15),
      y: randomY ? randomBetween(0, this.canvas.height) : this.canvas.height + 12,
      size: randomBetween(2, 6),
      speed: randomBetween(14, 38),
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
    ];
    const [x, y] = textPoints[index % textPoints.length];
    return { x, y };
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

    this.fish.forEach((fish) => {
      if (this.schooling) {
        fish.vx += (fish.target.x - fish.x) * dt * 0.9;
        fish.vy += (fish.target.y - fish.y) * dt * 0.9;
      } else {
        fish.vx += Math.sin((fish.y + performance.now() * 0.02) * 0.02) * dt * 8;
      }

      const burstDistance = Math.hypot(fish.x - this.pointerBurst.x, fish.y - this.pointerBurst.y);
      if (this.pointerBurst.power > 0 && burstDistance < 150) {
        const force = ((150 - burstDistance) / 150) * this.pointerBurst.power * 180;
        fish.vx += ((fish.x - this.pointerBurst.x) / Math.max(burstDistance, 1)) * force * dt;
        fish.vy += ((fish.y - this.pointerBurst.y) / Math.max(burstDistance, 1)) * force * dt;
      }

      fish.vx = clamp(fish.vx, -85, 85);
      fish.vy = clamp(fish.vy, -65, 65);
      fish.x += fish.vx * dt;
      fish.y += fish.vy * dt;

      if (fish.x < 24 || fish.x > this.canvas.width - 24) fish.vx *= -1;
      if (fish.y < 30 || fish.y > this.canvas.height - 30) fish.vy *= -1;
      fish.x = clamp(fish.x, 24, this.canvas.width - 24);
      fish.y = clamp(fish.y, 30, this.canvas.height - 30);
    });

    this.bubbles.forEach((bubble, index) => {
      bubble.y -= bubble.speed * dt;
      bubble.x += Math.sin((bubble.y + index * 21) * 0.04) * dt * 9;
      if (bubble.y < -10) {
        this.bubbles[index] = this.createBubble();
      }
    });
  }

  draw() {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    gradient.addColorStop(0, "#08233c");
    gradient.addColorStop(1, "#04101e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawSeaweed();
    this.bubbles.forEach((bubble) => {
      ctx.strokeStyle = "rgba(237, 244, 255, 0.45)";
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.size, 0, TAU);
      ctx.stroke();
    });

    this.fish.forEach((fish) => this.drawFish(fish));

    if (this.schooling) {
      ctx.fillStyle = "rgba(237, 244, 255, 0.18)";
      ctx.font = "900 48px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("PARALLEL", this.canvas.width / 2, 290);
    }
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

  drawFish(fish) {
    const ctx = this.ctx;
    const facing = fish.vx >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(fish.x, fish.y);
    ctx.scale(facing, 1);
    ctx.fillStyle = fish.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 10, 0, 0, TAU);
    ctx.fill();
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
}

window.addEventListener("DOMContentLoaded", () => {
  new OrbitDodger(document.querySelector("#orbitCanvas"));
  new SlackMoodPulse();
  new PixelAquarium(document.querySelector("#aquariumCanvas"));
});
