/* global window, SkeritZones */
window.SkeritDraw = (function () {
  const RADIUS_TELESCOPE = 55;

  function catmullRomPath(ctx, points, color, size) {
    if (!points || points.length === 0) return;
    ctx.strokeStyle = color || '#2b2b2b';
    ctx.lineWidth = size || 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      return;
    }

    if (points.length === 2) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
    ctx.stroke();
  }

  function smoothPath(ctx, points, color, size) {
    catmullRomPath(ctx, points, color, size);
  }

  function drawAllPaths(ctx, paths) {
    paths.forEach((path) => {
      if (path.points && path.points.length > 0) {
        catmullRomPath(ctx, path.points, path.color, path.size);
      }
    });
  }

  function appendPathPoints(existing, newPoints) {
    if (!existing || existing.length === 0) return [...newPoints];
    const out = [...existing];
    const last = out[out.length - 1];
    const first = newPoints[0];
    if (Math.hypot(last.x - first.x, last.y - first.y) < 3) {
      out.push(...newPoints.slice(1));
    } else {
      out.push(...newPoints);
    }
    return out;
  }

  function clipToZone(ctx, layout, zoneId) {
    const zone = SkeritZones.getPlayerZone(layout, zoneId);
    if (!zone) return;
    ctx.beginPath();
    if (zone.polygon && zone.polygon.length >= 3) {
      zone.polygon.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
    } else if (zone.bounds) {
      const b = zone.bounds;
      ctx.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    }
    ctx.clip();
  }

  function drawTelescopeMask(maskCtx, cursor, w, h) {
    const x = cursor.x;
    const y = cursor.y;
    const r = RADIUS_TELESCOPE;

    maskCtx.clearRect(0, 0, w, h);
    maskCtx.fillStyle = '#080810';
    maskCtx.fillRect(0, 0, w, h);

    maskCtx.save();
    maskCtx.globalCompositeOperation = 'destination-out';
    maskCtx.beginPath();
    maskCtx.arc(x, y, r, 0, Math.PI * 2);
    maskCtx.fill();
    maskCtx.restore();

    maskCtx.save();
    maskCtx.strokeStyle = '#2a2a35';
    maskCtx.lineWidth = 7;
    maskCtx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      const wobble = Math.sin(a * 8) * 4;
      const px = x + Math.cos(a) * (r + wobble);
      const py = y + Math.sin(a) * (r + wobble);
      if (a === 0) maskCtx.moveTo(px, py);
      else maskCtx.lineTo(px, py);
    }
    maskCtx.closePath();
    maskCtx.stroke();
    maskCtx.restore();
  }

  return {
    RADIUS_TELESCOPE,
    smoothPath,
    catmullRomPath,
    drawAllPaths,
    appendPathPoints,
    clipToZone,
    drawTelescopeMask
  };
})();
