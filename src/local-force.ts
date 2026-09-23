// Allocation-free equivalent of a d3-force simulation with link, many-body,
// x and y forces. d3's quadtree visitor allocates per visited cell, which
// dominated layout time on the full archive.
export interface LocalForceOptions {
  /** Rest length for a link of the given concert weight. */
  distance: (weight: number) => number;
  charge: number;
  gravity: number;
  ticks: number;
  theta?: number;
  velocityDecay?: number;
}

export function simulateLocal(
  x: Float64Array,
  y: Float64Array,
  links: [source: number, target: number, weight: number][],
  options: LocalForceOptions,
) {
  const n = x.length;
  if (n < 2) return;
  const { charge, gravity, ticks } = options;
  const theta2 = (options.theta ?? 0.9) ** 2;
  const decay = 1 - (options.velocityDecay ?? 0.4);
  const vx = new Float64Array(n),
    vy = new Float64Array(n);
  // d3 forceLink defaults: strength 1 / min(degree), bias by relative degree.
  const degree = new Float64Array(n);
  for (const [a, b] of links) {
    degree[a]++;
    degree[b]++;
  }
  const m = links.length;
  const source = new Int32Array(m),
    target = new Int32Array(m),
    strength = new Float64Array(m),
    bias = new Float64Array(m),
    rest = new Float64Array(m);
  links.forEach(([a, b, w], i) => {
    rest[i] = options.distance(w);
    source[i] = a;
    target[i] = b;
    strength[i] = 1 / Math.min(degree[a], degree[b]);
    bias[i] = degree[a] / (degree[a] + degree[b]);
  });
  // Quadtree storage. Cells are created parent-first, so a reverse scan
  // accumulates children before parents.
  let capacity = 4 * n + 16;
  let child = new Int32Array(capacity * 4),
    point = new Int32Array(capacity),
    size = new Float64Array(capacity),
    mass = new Float64Array(capacity),
    massX = new Float64Array(capacity),
    massY = new Float64Array(capacity),
    left = new Float64Array(capacity),
    top = new Float64Array(capacity);
  const next = new Int32Array(n);
  let cells = 0;
  const grow = () => {
    capacity *= 2;
    const resize = <T extends Float64Array | Int32Array>(a: T, k = 1): T => {
      const b = new (a.constructor as new (length: number) => T)(capacity * k);
      b.set(a);
      return b;
    };
    child = resize(child, 4);
    point = resize(point);
    size = resize(size);
    mass = resize(mass);
    massX = resize(massX);
    massY = resize(massY);
    left = resize(left);
    top = resize(top);
  };
  const cell = (x0: number, y0: number, w: number) => {
    if (cells === capacity) grow();
    const c = cells++;
    child.fill(-1, c * 4, c * 4 + 4);
    point[c] = -1;
    left[c] = x0;
    top[c] = y0;
    size[c] = w;
    return c;
  };
  let alpha = 1;
  const alphaDecay = 1 - Math.pow(0.001, 1 / ticks);
  let stackBuffer = new Int32Array(capacity * 4);
  for (let tick = 0; tick < ticks; tick++) {
    alpha += -alpha * alphaDecay;
    // Links (iterations = 1), using velocity-projected positions like d3.
    for (let i = 0; i < m; i++) {
      const s = source[i],
        t = target[i];
      let dx = x[t] + vx[t] - x[s] - vx[s] || 1e-6,
        dy = y[t] + vy[t] - y[s] - vy[s] || 1e-6;
      let l = Math.sqrt(dx * dx + dy * dy);
      l = ((l - rest[i]) / l) * alpha * strength[i];
      dx *= l;
      dy *= l;
      vx[t] -= dx * bias[i];
      vy[t] -= dy * bias[i];
      vx[s] += dx * (1 - bias[i]);
      vy[s] += dy * (1 - bias[i]);
    }
    // Build quadtree.
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      if (x[i] < x0) x0 = x[i];
      if (x[i] > x1) x1 = x[i];
      if (y[i] < y0) y0 = y[i];
      if (y[i] > y1) y1 = y[i];
    }
    cells = 0;
    cell(x0, y0, Math.max(x1 - x0, y1 - y0, 1e-6) * 1.0001);
    for (let i = 0; i < n; i++) {
      next[i] = -1;
      let c = 0,
        depth = 0;
      while (true) {
        const half = size[c] / 2;
        const right = x[i] >= left[c] + half ? 1 : 0,
          bottom = y[i] >= top[c] + half ? 1 : 0;
        const leaf =
          child[c * 4] < 0 &&
          child[c * 4 + 1] < 0 &&
          child[c * 4 + 2] < 0 &&
          child[c * 4 + 3] < 0;
        if (leaf && point[c] < 0) {
          point[c] = i;
          break;
        }
        if (leaf) {
          const other = point[c];
          if (depth > 40 || (x[other] === x[i] && y[other] === y[i])) {
            next[i] = next[other];
            next[other] = i;
            break;
          }
          // Push the resident point one level down.
          point[c] = -1;
          const or = x[other] >= left[c] + half ? 1 : 0,
            ob = y[other] >= top[c] + half ? 1 : 0;
          const oc = cell(left[c] + or * half, top[c] + ob * half, half);
          point[oc] = other;
          child[c * 4 + ob * 2 + or] = oc;
        }
        const slot = c * 4 + bottom * 2 + right;
        if (child[slot] < 0) {
          const nc = cell(left[c] + right * half, top[c] + bottom * half, half);
          point[nc] = i;
          child[slot] = nc;
          break;
        }
        c = child[slot];
        depth++;
      }
    }
    for (let c = cells - 1; c >= 0; c--) {
      let w = 0,
        sx = 0,
        sy = 0;
      if (point[c] >= 0) {
        for (let p = point[c]; p >= 0; p = next[p]) {
          w++;
          sx += x[p];
          sy += y[p];
        }
      } else
        for (let k = 0; k < 4; k++) {
          const q = child[c * 4 + k];
          if (q < 0) continue;
          w += mass[q];
          sx += massX[q] * mass[q];
          sy += massY[q] * mass[q];
        }
      mass[c] = w;
      massX[c] = sx / w;
      massY[c] = sy / w;
    }
    if (stackBuffer.length < cells * 4) stackBuffer = new Int32Array(cells * 4);
    // Many-body repulsion, following d3's Barnes-Hut criterion.
    const strengthAlpha = charge * alpha;
    for (let i = 0; i < n; i++) {
      let sp = 0;
      stackBuffer[sp++] = 0;
      let fx = 0,
        fy = 0;
      while (sp) {
        const c = stackBuffer[--sp];
        const dx = massX[c] - x[i],
          dy = massY[c] - y[i];
        let l = dx * dx + dy * dy;
        const w = size[c];
        if (point[c] < 0) {
          if ((w * w) / theta2 < l) {
            if (l < 1) l = Math.sqrt(l);
            const f = (mass[c] * strengthAlpha) / l;
            fx += dx * f;
            fy += dy * f;
            continue;
          }
          for (let k = 0; k < 4; k++) {
            const q = child[c * 4 + k];
            if (q >= 0) stackBuffer[sp++] = q;
          }
          continue;
        }
        for (let p = point[c]; p >= 0; p = next[p]) {
          if (p === i) continue;
          let px = x[p] - x[i],
            py = y[p] - y[i];
          if (px === 0) px = ((i * 7919 + p) % 13) * 1e-6 - 6e-6;
          if (py === 0) py = ((p * 7919 + i) % 13) * 1e-6 - 6e-6;
          let d = px * px + py * py;
          if (d < 1) d = Math.sqrt(d);
          const f = strengthAlpha / d;
          fx += px * f;
          fy += py * f;
        }
      }
      vx[i] += fx - x[i] * gravity * alpha;
      vy[i] += fy - y[i] * gravity * alpha;
    }
    for (let i = 0; i < n; i++) {
      vx[i] *= decay;
      vy[i] *= decay;
      x[i] += vx[i];
      y[i] += vy[i];
    }
  }
}

// Positional collision relaxation on a uniform grid. Stops early once no
// pair of circles intersects.
export function separate(
  x: Float64Array,
  y: Float64Array,
  radius: Float64Array,
  iterations = 60,
) {
  const n = x.length;
  if (n < 2) return;
  let maxRadius = 0;
  for (let i = 0; i < n; i++) maxRadius = Math.max(maxRadius, radius[i]);
  const size = maxRadius * 2;
  const head = new Map<number, number>();
  const next = new Int32Array(n);
  const key = (cx: number, cy: number) => cx * 73856093 + cy * 19349663;
  for (let iteration = 0; iteration < iterations; iteration++) {
    head.clear();
    for (let i = 0; i < n; i++) {
      const k = key(Math.floor(x[i] / size), Math.floor(y[i] / size));
      next[i] = head.get(k) ?? -1;
      head.set(k, i);
    }
    let moved = false;
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(x[i] / size),
        cy = Math.floor(y[i] / size);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (
            let j = head.get(key(cx + dx, cy + dy)) ?? -1;
            j >= 0;
            j = next[j]
          ) {
            if (j <= i) continue;
            const r = radius[i] + radius[j];
            let px = x[j] - x[i],
              py = y[j] - y[i];
            let d2 = px * px + py * py;
            if (d2 >= r * r) continue;
            if (d2 === 0) {
              px = ((i * 7919 + j) % 13) * 1e-3 - 6e-3 || 1e-3;
              py = ((j * 7919 + i) % 11) * 1e-3 - 5e-3;
              d2 = px * px + py * py;
            }
            const d = Math.sqrt(d2);
            // Larger circles move less, as in d3's forceCollide.
            const push = ((r - d) / d) * 0.5,
              share =
                (radius[i] * radius[i]) /
                (radius[i] * radius[i] + radius[j] * radius[j]);
            x[i] -= px * push * (1 - share);
            y[i] -= py * push * (1 - share);
            x[j] += px * push * share;
            y[j] += py * push * share;
            moved = true;
          }
    }
    if (!moved) return;
  }
}
