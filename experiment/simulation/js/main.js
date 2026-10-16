//Your JavaScript goes in here
/* ================= Physical model ================= */
// kV per metre of arcing distance, positive 1.2/50 impulse (illustrative values)
const K = { porcelain: 540, polymeric: 555 };
// relative change of U50 with surface condition (impulse is only weakly affected)
const COND = {
  porcelain: { dry: 1.00, wet: 0.97, pollute: 0.95 },
  polymeric: { dry: 1.00, wet: 0.99, pollute: 0.985 }   // hydrophobic surface
};
const NEG = { porcelain: 1.10, polymeric: 1.08 };       // negative polarity factor
const SIGMA = 0.03;                                     // 3 % standard deviation

function U50(type, arc_mm, pol, cond) {
  let u = K[type] * (arc_mm / 1000) * COND[type][cond];
  if (pol < 0) u *= NEG[type];
  return u;
}

function erf(x) {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
function Pfo(V, u50) { return 0.5 * (1 + erf((V - u50) / (SIGMA * u50 * Math.SQRT2))); }

/* 1.2/50 us double-exponential impulse */
const T1 = 68.2, T2 = 0.405;
let kNorm = 1;
(function () {
  let m = 0;
  for (let t = 0; t < 10; t += 0.005) m = Math.max(m, Math.exp(-t / T1) - Math.exp(-t / T2));
  kNorm = 1 / m;
})();
function vt(t, Vp) { return t < 0 ? 0 : Vp * kNorm * (Math.exp(-t / T1) - Math.exp(-t / T2)); }

/* ================= State ================= */
let shots = [], n = 0;
const $ = id => document.getElementById(id);
const wave = $('wave'), wc = wave.getContext('2d');
const pcv = $('pcv'), pc = pcv.getContext('2d');

function params() {
  return { type: $('type').value, arc: +$('arc').value, pol: +$('pol').value,
           cond: $('cond').value, V: +$('volt').value };
}

/* ================= One impulse shot ================= */
function fire(V, p) {
  const u50 = U50(p.type, p.arc, p.pol, p.cond);
  const flash = Math.random() < Pfo(V, u50);
  let tc = null;
  if (flash) {
    const ratio = Math.max(V / u50, 0.8);
    if (ratio > 1.15) tc = Math.max(0.6, 1.6 / (ratio - 0.9) * (0.8 + 0.4 * Math.random())); // front-chopped
    else tc = 3 + (1.15 - ratio) * 60 * Math.random() + 2 * Math.random();                   // tail-chopped
  }
  n++;
  const s = { n, type: p.type, pol: p.pol, cond: p.cond, V, flash, tc };
  shots.push(s);
  addRow(s);
  return { flash, tc, u50 };
}

function addRow(s) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${s.n}</td><td>${s.type}</td><td>${s.pol > 0 ? '+' : '-'}</td><td>${s.cond}</td>
    <td>${s.V.toFixed(1)}</td><td class="${s.flash ? 'FO' : 'WS'}">${s.flash ? 'Flashover' : 'Withstand'}</td>
    <td>${s.flash ? s.tc.toFixed(2) : '-'}</td>`;
  $('tbl').tBodies[0].appendChild(tr);
}

/* ================= Drawing ================= */
function drawWave(V, res) {
  const W = wave.width, H = wave.height, m = { l: 55, r: 15, t: 15, b: 35 };
  wc.clearRect(0, 0, W, H);
  const tmax = 100, vmax = Math.max(1000, V * 1.1);
  const X = t => m.l + (W - m.l - m.r) * t / tmax;
  const Y = v => H - m.b - (H - m.t - m.b) * v / vmax;
  wc.strokeStyle = '#ddd'; wc.fillStyle = '#333'; wc.font = '11px Arial'; wc.lineWidth = 1;
  for (let t = 0; t <= tmax; t += 20) { wc.beginPath(); wc.moveTo(X(t), m.t); wc.lineTo(X(t), H - m.b); wc.stroke(); wc.fillText(t, X(t) - 8, H - m.b + 14); }
  for (let v = 0; v <= vmax; v += 200) { wc.beginPath(); wc.moveTo(m.l, Y(v)); wc.lineTo(W - m.r, Y(v)); wc.stroke(); wc.fillText(v, 12, Y(v) + 4); }
  wc.fillText('time (\u00b5s)', W / 2 - 20, H - 6);
  wc.save(); wc.translate(12, H / 2); wc.rotate(-Math.PI / 2); wc.fillText('kV', 0, 0); wc.restore();

  // reference standard wave (dashed)
  wc.setLineDash([4, 3]); wc.strokeStyle = '#999'; wc.beginPath();
  for (let t = 0; t <= tmax; t += 0.2) { const y = Y(vt(t, V)); t ? wc.lineTo(X(t), y) : wc.moveTo(X(t), y); }
  wc.stroke(); wc.setLineDash([]);

  // actual recorded wave
  wc.strokeStyle = res && res.flash ? '#c00' : '#0a6'; wc.lineWidth = 2; wc.beginPath();
  const tend = res && res.flash ? res.tc : tmax;
  for (let t = 0; t <= tend; t += 0.1) { const y = Y(vt(t, V)); t ? wc.lineTo(X(t), y) : wc.moveTo(X(t), y); }
  if (res && res.flash) {
    wc.lineTo(X(tend + 0.4), Y(0));
    for (let t = tend + 0.4; t <= tmax; t += 0.5) wc.lineTo(X(t), Y(0) + (t < tend + 5 ? -8 * Math.exp(-(t - tend)) : 0));
  }
  wc.stroke(); wc.lineWidth = 1;
  if (res && res.flash) { wc.fillStyle = '#c00'; wc.fillText('Chopped at ' + res.tc.toFixed(2) + ' \u00b5s', X(tend) + 8, Y(vt(tend, V)) - 6); }
}

function drawProb(p) {
  const W = pcv.width, H = pcv.height, m = { l: 55, r: 15, t: 15, b: 35 };
  pc.clearRect(0, 0, W, H);
  const u = U50(p.type, p.arc, p.pol, p.cond), vmin = u * 0.8, vmax = u * 1.2;
  const X = v => m.l + (W - m.l - m.r) * (v - vmin) / (vmax - vmin);
  const Y = q => H - m.b - (H - m.t - m.b) * q;
  pc.strokeStyle = '#ddd'; pc.fillStyle = '#333'; pc.font = '11px Arial';
  for (let q = 0; q <= 1.001; q += 0.25) { pc.beginPath(); pc.moveTo(m.l, Y(q)); pc.lineTo(W - m.r, Y(q)); pc.stroke(); pc.fillText((q * 100).toFixed(0) + '%', 10, Y(q) + 4); }
  for (let i = 0; i <= 4; i++) { const v = vmin + (vmax - vmin) * i / 4; pc.fillText(v.toFixed(0), X(v) - 10, H - m.b + 14); }
  pc.fillText('Applied peak voltage (kV)', W / 2 - 60, H - 6);

  // both insulators plotted for comparison
  const draw = (type, col, ty) => {
    const uu = U50(type, p.arc, p.pol, p.cond);
    pc.strokeStyle = col; pc.lineWidth = 2; pc.beginPath();
    const dv = (vmax - vmin) / 200;
    for (let v = vmin; v <= vmax; v += dv) { const y = Y(Pfo(v, uu)); v === vmin ? pc.moveTo(X(v), y) : pc.lineTo(X(v), y); }
    pc.stroke(); pc.lineWidth = 1; pc.fillStyle = col;
    pc.fillText(type + '  U50 = ' + uu.toFixed(1) + ' kV', m.l + 8, ty);
  };
  draw('porcelain', '#b5651d', m.t + 12);
  draw('polymeric', '#1f6fb5', m.t + 26);

  // recorded shots
  shots.filter(s => s.type === p.type && s.pol === p.pol && s.cond === p.cond).forEach(s => {
    if (s.V < vmin || s.V > vmax) return;
    pc.fillStyle = s.flash ? '#c00' : '#0a6';
    pc.beginPath(); pc.arc(X(s.V), Y(s.flash ? 1 : 0), 3.5, 0, 7); pc.fill();
  });
}

/* ================= Button actions ================= */
$('volt').oninput = () => { $('vlbl').textContent = $('volt').value; };

$('shot').onclick = () => {
  const p = params(), r = fire(p.V, p);
  drawWave(p.V, r); drawProb(p);
  $('status').innerHTML = r.flash ? '<span class="FO">FLASHOVER occurred</span>'
                                  : '<span class="WS">Withstood (no flashover)</span>';
};

// Up-and-down method: 20 shots, step = 3 % of U50
$('uad').onclick = () => {
  const p = params(), u50 = U50(p.type, p.arc, p.pol, p.cond);
  let V = u50; const step = 0.03 * u50, levels = [];
  for (let i = 0; i < 20; i++) {
    const r = fire(V, p); levels.push(V);
    V += r.flash ? -step : step;
  }
  const est = levels.reduce((a, b) => a + b, 0) / levels.length;
  const sd = Math.sqrt(levels.reduce((a, b) => a + (b - est) ** 2, 0) / (levels.length - 1));
  const last = shots[shots.length - 1];
  drawWave(last.V, { flash: last.flash, tc: last.tc }); drawProb(p);
  $('summary').innerHTML = `<b>Up-and-down result (${p.type}, ${p.pol > 0 ? '+' : '-'}, ${p.cond}):</b>
    U<sub>50</sub> (measured) = <b>${est.toFixed(1)} kV</b>, s = ${sd.toFixed(1)} kV
    (${(100 * sd / est).toFixed(1)} %), model value = ${u50.toFixed(1)} kV`;
};

// 50 shots at each of 7 levels around U50
$('prob').onclick = () => {
  const p = params(), u = U50(p.type, p.arc, p.pol, p.cond);
  let txt = '<b>Flashover frequency (50 shots per level):</b><br>';
  for (let k = -3; k <= 3; k++) {
    const V = u * (1 + 0.03 * k); let f = 0;
    for (let i = 0; i < 50; i++) if (fire(V, p).flash) f++;
    txt += `${V.toFixed(0)} kV : ${f * 2} %<br>`;
  }
  drawProb(p); $('summary').innerHTML = txt;
};

$('reset').onclick = () => {
  shots = []; n = 0; $('tbl').tBodies[0].innerHTML = ''; $('summary').innerHTML = ''; $('status').innerHTML = '';
  drawWave(+$('volt').value, null); drawProb(params());
};
['type', 'arc', 'pol', 'cond'].forEach(id => $(id).onchange = () => drawProb(params()));

drawWave(500, null); drawProb(params());