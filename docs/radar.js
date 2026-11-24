(() => {
  "use strict";
  const colors = ["#b3f76d", "#72e4ba", "#a7c7f2", "#ebb56d"];
  const names = ["Kick", "Snare", "Hi-hat", "Clap"];
  let canvas,
    bankBox,
    readout,
    ctx,
    observer,
    data,
    bank = 0,
    step = -1;
  const visible = [true, true, true, true];

  function mount(host, selectBank) {
    host.innerHTML =
      '<div class="radar-body"><div class="radar-display"><canvas role="img" aria-label="Rytmická mapa šestnácti kroků ve čtyřech stopách"></canvas></div><div class="radar-config"><div class="micro">BANKA PATTERNŮ</div><div class="bank-grid"></div><div class="radar-legend"></div><div class="radar-readout"></div></div></div>';
    canvas = host.querySelector("canvas");
    ctx = canvas.getContext("2d");
    bankBox = host.querySelector(".bank-grid");
    readout = host.querySelector(".radar-readout");
    for (let i = 0; i < 4; i++) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bank";
      button.setAttribute("aria-label", "Pattern " + "ABCD"[i]);
      button.innerHTML = "<b>" + "ABCD"[i] + '</b><span aria-hidden="true"></span>';
      button.addEventListener("click", () => selectBank(i));
      bankBox.append(button);
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.innerHTML = "<i></i>" + names[i];
      toggle.style.setProperty("--track", colors[i]);
      toggle.setAttribute("aria-pressed", "true");
      toggle.title = "Zobrazit nebo skrýt " + names[i] + " na radaru";
      toggle.addEventListener("click", () => {
        visible[i] = !visible[i];
        toggle.setAttribute("aria-pressed", String(visible[i]));
        draw();
      });
      host.querySelector(".radar-legend").append(toggle);
    }
    observer = new ResizeObserver(draw);
    observer.observe(canvas);
  }

  function update(patterns, index) {
    data = patterns;
    bank = index;
    [...bankBox.children].forEach((button, i) => {
      button.setAttribute("aria-pressed", String(i === bank));
      const drums = data.banks[i].drums;
      const bars = Array.from({ length: 16 }, (_, n) => {
        const count = drums.reduce((acc, row) => acc + Number(row[n]), 0);
        return '<i style="height:' + (2 + count * 3) + "px;opacity:" + (count ? 1 : 0.28) + '"></i>';
      });
      button.lastElementChild.innerHTML = bars.join("");
    });
    const hits = data.banks[bank].drums.join("").split("1").length - 1;
    readout.textContent = "16 kroků  /  " + hits + " úderů";
    draw();
  }

  function highlight(value) {
    if (step !== value) {
      step = value;
      draw();
    }
  }
  function draw() {
    if (!ctx || !canvas.clientWidth || !data) return;
    const w = canvas.clientWidth,
      h = canvas.clientHeight,
      dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const x = w / 2,
      y = h / 2,
      radius = Math.min(w * 0.39, h * 0.405);
    const angle = (s) => (s / 16) * Math.PI * 2 - Math.PI / 2;
    const line = (x1, y1, x2, y2, color, width = 1) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    const ring = (r, col) => {
      ctx.beginPath();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    };
    ctx.fillStyle = "#53674d";
    ctx.font = "9px 'IBM Plex Mono',monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let s = 0; s < 16; s++) {
      const a = angle(s),
        c = Math.cos(a),
        v = Math.sin(a);
      line(x + c * 8, y + v * 8, x + c * radius, y + v * radius, s % 4 === 0 ? "#42543d" : "#25382c");
      if (s % 4 === 0) {
        ctx.fillStyle = "#9bae96";
        ctx.fillText(String(s + 1).padStart(2, "0"), x + c * (radius + 13), y + v * (radius + 12));
      }
    }
    for (let n = 0; n < 96; n++) {
      const a = (n / 96) * Math.PI * 2,
        c = Math.cos(a),
        v = Math.sin(a);
      line(
        x + c * (radius + 1),
        y + v * (radius + 1),
        x + c * (radius + (n % 6 === 0 ? 6 : 3)),
        y + v * (radius + (n % 6 === 0 ? 6 : 3)),
        n % 6 === 0 ? "#739268" : "#354a34",
      );
    }
    for (let t = 0; t < 4; t++) ring(radius * (1 - t * 0.21), "#3e573b");
    ring(radius * 0.15, "#2e4130");
    if (step >= 0) {
      const a = angle(step);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, radius, a - 0.22, a + 0.04);
      ctx.fillStyle = "#a1f87420";
      ctx.fill();
      line(x, y, x + Math.cos(a) * radius, y + Math.sin(a) * radius, "#b4fb78", 1.5);
    }
    data.banks[bank].drums.forEach((row, t) => {
      if (!visible[t]) return;
      const r = radius * (1 - t * 0.21);
      const hits = Array.from(row, (on, i) => (on === "1" ? i : -1)).filter((i) => i >= 0);
      if (hits.length > 1) {
        ctx.beginPath();
        hits.forEach((s, j) => {
          const a = angle(s),
            px = x + Math.cos(a) * r,
            py = y + Math.sin(a) * r;
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.strokeStyle = colors[t] + "58";
        ctx.fillStyle = colors[t] + "09";
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
      }
      for (let s = 0; s < 16; s++) {
        if (row[s] !== "1") continue;
        const a = angle(s),
          px = x + Math.cos(a) * r,
          py = y + Math.sin(a) * r;
        ctx.fillStyle = colors[t];
        ctx.shadowColor = colors[t];
        ctx.shadowBlur = step === s ? 12 : 5;
        ctx.beginPath();
        ctx.arc(px, py, step === s ? 4.5 : 3.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (step === s) {
          ctx.strokeStyle = colors[t];
          ctx.beginPath();
          ctx.arc(px, py, 7, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    });
    line(x - 4, y, x + 4, y, "#a8f66d");
    line(x, y - 4, x, y + 4, "#a8f66d");
  }
  window.Radar = { mount, update, highlight, draw };
})();
