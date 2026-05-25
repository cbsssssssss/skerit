/** Split-layout generator for cooperative mode (shared server/client logic). */

function pickWeighted(items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function rectZone(id, x0, y0, x1, y1) {
  return {
    id,
    type: 'rect',
    bounds: { x0, y0, x1, y1 },
    polygon: [
      { x: x0, y: y0 }, { x: x1, y: y0 },
      { x: x1, y: y1 }, { x: x0, y: y1 }
    ]
  };
}

function polyZone(id, polygon) {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  return {
    id,
    type: 'poly',
    bounds: {
      x0: Math.min(...xs),
      y0: Math.min(...ys),
      x1: Math.max(...xs),
      y1: Math.max(...ys)
    },
    polygon
  };
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function wavyVerticalZones(w, h, count) {
  const zones = [];
  const seg = w / count;
  for (let i = 0; i < count; i++) {
    const xStart = i * seg;
    const xEnd = (i + 1) * seg;
    const leftWave = [];
    const rightWave = [];
    const steps = 12;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const y = t * h;
      const wobbleL = Math.sin(t * Math.PI * 4 + i) * 18;
      const wobbleR = Math.sin(t * Math.PI * 4 + i + 1) * 18;
      leftWave.push({ x: xStart + (i === 0 ? 0 : wobbleL), y });
      rightWave.push({ x: xEnd + (i === count - 1 ? 0 : wobbleR), y });
    }
    const poly = [
      ...leftWave,
      ...rightWave.reverse()
    ];
    zones.push(polyZone(i, poly));
  }
  return zones;
}

function randomBlobZones(w, h, count) {
  const seeds = [];
  for (let i = 0; i < count; i++) {
    seeds.push({
      x: (0.15 + Math.random() * 0.7) * w,
      y: (0.15 + Math.random() * 0.7) * h
    });
  }
  const zones = [];
  const grid = 24;
  for (let i = 0; i < count; i++) {
    const cellPolys = [];
    const cellW = w / grid;
    const cellH = h / grid;
    for (let gx = 0; gx < grid; gx++) {
      for (let gy = 0; gy < grid; gy++) {
        const cx = (gx + 0.5) * cellW;
        const cy = (gy + 0.5) * cellH;
        let best = 0;
        let bestD = Infinity;
        seeds.forEach((s, si) => {
          const d = (s.x - cx) ** 2 + (s.y - cy) ** 2;
          if (d < bestD) {
            bestD = d;
            best = si;
          }
        });
        if (best === i) {
          cellPolys.push({ x: cx, y: cy });
        }
      }
    }
    if (cellPolys.length < 3) {
      zones.push(rectZone(i, (w / count) * i, 0, (w / count) * (i + 1), h));
    } else {
      const xs = cellPolys.map((p) => p.x);
      const ys = cellPolys.map((p) => p.y);
      zones.push(polyZone(i, [
        { x: Math.min(...xs) - 8, y: Math.min(...ys) - 8 },
        { x: Math.max(...xs) + 8, y: Math.min(...ys) - 8 },
        { x: Math.max(...xs) + 8, y: Math.max(...ys) + 8 },
        { x: Math.min(...xs) - 8, y: Math.max(...ys) + 8 }
      ]));
    }
  }
  return zones;
}

function generateSplitLayout(drawerCount, width = 800, height = 500) {
  const w = width;
  const h = height;
  const n = Math.min(Math.max(drawerCount, 2), 4);
  const useSpecial = Math.random() < 0.08;

  if (useSpecial) {
    const special = pickWeighted([
      { weight: 1, value: 'wavy' },
      { weight: 1, value: 'random' }
    ]);
    const zones = special === 'wavy'
      ? wavyVerticalZones(w, h, n)
      : randomBlobZones(w, h, n);
    const dividers = computeDividerLines(special, w, h, zones);
    return { patternId: special, zones, width: w, height: h, dividers };
  }

  let patternId;
  let zones;

  if (n === 2) {
    patternId = pickWeighted([
      { weight: 1, value: 'split-v' },
      { weight: 1, value: 'split-h' }
    ]);
    zones = patternId === 'split-v'
      ? [rectZone(0, 0, 0, w / 2, h), rectZone(1, w / 2, 0, w, h)]
      : [rectZone(0, 0, 0, w, h / 2), rectZone(1, 0, h / 2, w, h)];
  } else if (n === 3) {
    patternId = pickWeighted([
      { weight: 1, value: 'thirds-v' },
      { weight: 1, value: 'thirds-h' },
      { weight: 1, value: 'tri-diagonal' }
    ]);
    if (patternId === 'thirds-v') {
      zones = [
        rectZone(0, 0, 0, w / 3, h),
        rectZone(1, w / 3, 0, (2 * w) / 3, h),
        rectZone(2, (2 * w) / 3, 0, w, h)
      ];
    } else if (patternId === 'thirds-h') {
      zones = [
        rectZone(0, 0, 0, w, h / 3),
        rectZone(1, 0, h / 3, w, (2 * h) / 3),
        rectZone(2, 0, (2 * h) / 3, w, h)
      ];
    } else {
      const cx = w / 2;
      const cy = h / 2;
      zones = [
        polyZone(0, [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: cx, y: cy }]),
        polyZone(1, [{ x: w, y: 0 }, { x: w, y: h }, { x: cx, y: cy }]),
        polyZone(2, [{ x: 0, y: 0 }, { x: 0, y: h }, { x: cx, y: cy }])
      ];
    }
  } else {
    patternId = pickWeighted([
      { weight: 1, value: 'quarters-v' },
      { weight: 1, value: 'quarters-h' },
      { weight: 1, value: 'grid-2x2' }
    ]);
    if (patternId === 'quarters-v') {
      const q = w / 4;
      zones = [
        rectZone(0, 0, 0, q, h),
        rectZone(1, q, 0, q * 2, h),
        rectZone(2, q * 2, 0, q * 3, h),
        rectZone(3, q * 3, 0, w, h)
      ];
    } else if (patternId === 'quarters-h') {
      const q = h / 4;
      zones = [
        rectZone(0, 0, 0, w, q),
        rectZone(1, 0, q, w, q * 2),
        rectZone(2, 0, q * 2, w, q * 3),
        rectZone(3, 0, q * 3, w, h)
      ];
    } else {
      const hw = w / 2;
      const hh = h / 2;
      zones = [
        rectZone(0, 0, 0, hw, hh),
        rectZone(1, hw, 0, w, hh),
        rectZone(2, 0, hh, hw, h),
        rectZone(3, hw, hh, w, h)
      ];
    }
  }

  const dividers = computeDividerLines(patternId, w, h, zones);
  return { patternId, zones, width: w, height: h, dividers };
}

function line(x0, y0, x1, y1) {
  return { x0, y0, x1, y1 };
}

function computeDividerLines(patternId, w, h, zones) {
  const cx = w / 2;
  const cy = h / 2;

  switch (patternId) {
    case 'split-v':
      return [line(w / 2, 0, w / 2, h)];
    case 'split-h':
      return [line(0, h / 2, w, h / 2)];
    case 'thirds-v':
      return [line(w / 3, 0, w / 3, h), line((2 * w) / 3, 0, (2 * w) / 3, h)];
    case 'thirds-h':
      return [line(0, h / 3, w, h / 3), line(0, (2 * h) / 3, w, (2 * h) / 3)];
    case 'tri-diagonal':
      return [
        line(cx, cy, w, 0),
        line(cx, cy, w, h),
        line(cx, cy, 0, h)
      ];
    case 'quarters-v': {
      const q = w / 4;
      return [line(q, 0, q, h), line(q * 2, 0, q * 2, h), line(q * 3, 0, q * 3, h)];
    }
    case 'quarters-h': {
      const q = h / 4;
      return [line(0, q, w, q), line(0, q * 2, w, q * 2), line(0, q * 3, w, q * 3)];
    }
    case 'grid-2x2':
      return [line(w / 2, 0, w / 2, h), line(0, h / 2, w, h / 2)];
    case 'wavy': {
      const cuts = [];
      const n = zones.length;
      for (let i = 1; i < n; i++) {
        cuts.push(line((w / n) * i, 0, (w / n) * i, h));
      }
      return cuts;
    }
    case 'random':
      return computeDividerLines('grid-2x2', w, h, zones);
    default:
      if (zones.length === 2) return computeDividerLines('split-v', w, h, zones);
      if (zones.length === 3) return computeDividerLines('thirds-v', w, h, zones);
      return computeDividerLines('grid-2x2', w, h, zones);
  }
}

function pointInZone(x, y, zone, width, height) {
  if (zone.polygon && zone.polygon.length >= 3) {
    return pointInPolygon(x, y, zone.polygon);
  }
  const b = zone.bounds;
  return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
}

function assignDrawerRoles(players, drawerCount, layout) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const drawers = shuffled.slice(0, drawerCount);
  const drawerIds = new Set(drawers.map((p) => p.id));

  players.forEach((p) => {
    p.isDrawer = drawerIds.has(p.id);
    p.isGuesser = !p.isDrawer;
    p.guessed = false;
    p.zone = null;
  });

  drawers.forEach((p, i) => {
    p.zone = layout.zones[i] ? layout.zones[i].id : i;
  });

  return { drawers, guessers: players.filter((p) => p.isGuesser) };
}

module.exports = {
  generateSplitLayout,
  computeDividerLines,
  pointInZone,
  pointInPolygon,
  assignDrawerRoles
};
