/* global window */
window.SkeritZones = (function () {
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

  function pointInZone(x, y, zone) {
    if (zone.polygon && zone.polygon.length >= 3) {
      return pointInPolygon(x, y, zone.polygon);
    }
    const b = zone.bounds;
    return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  }

  function getPlayerZone(layout, zoneId) {
    if (!layout?.zones) return null;
    return layout.zones.find((z) => z.id === zoneId) || layout.zones[zoneId];
  }

  function zoneToClipPath(zone, w, h) {
    if (zone.polygon && zone.polygon.length >= 3) {
      const pts = zone.polygon.map((p) => `${(p.x / w) * 100}% ${(p.y / h) * 100}%`);
      return `polygon(${pts.join(', ')})`;
    }
    const b = zone.bounds;
    const top = (b.y0 / h) * 100;
    const right = ((w - b.x1) / w) * 100;
    const bottom = ((h - b.y1) / h) * 100;
    const left = (b.x0 / w) * 100;
    return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
  }

  function applyZoneViewport(element, zone, w, h) {
    if (!element || !zone) return;
    const b = zone.bounds;
    const left = b.x0 / w;
    const top = b.y0 / h;
    const zoneW = (b.x1 - b.x0) / w;
    const zoneH = (b.y1 - b.y0) / h;

    element.style.clipPath = zoneToClipPath(zone, w, h);
    element.style.transformOrigin = `${left * 100}% ${top * 100}%`;
    element.style.transform = `scale(${1 / zoneW}, ${1 / zoneH})`;
    element.classList.add('zone-cropped');
  }

  function clearZoneViewport(element) {
    if (!element) return;
    element.style.clipPath = '';
    element.style.transform = '';
    element.style.transformOrigin = '';
    element.classList.remove('zone-cropped');
  }

  function drawScissorsCut(ctx, layout, progress, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(20,20,30,0.92)';
    ctx.fillRect(0, 0, w, h);

    if (!layout?.zones) return;

    layout.zones.forEach((zone, i) => {
      const delay = i * 0.15;
      const localP = Math.max(0, Math.min(1, (progress - delay) / (1 - delay * 0.5)));
      if (localP <= 0) return;

      ctx.save();
      ctx.beginPath();
      if (zone.polygon) {
        zone.polygon.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
      } else {
        const b = zone.bounds;
        ctx.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      }
      ctx.clip();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${localP})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      if (localP > 0.3) {
        ctx.save();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.setLineDash([6, 4]);
        if (zone.polygon) {
          ctx.beginPath();
          zone.polygon.forEach((p, idx) => {
            if (idx === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();
      }
    });
  }

  return {
    pointInPolygon,
    pointInZone,
    getPlayerZone,
    zoneToClipPath,
    applyZoneViewport,
    clearZoneViewport,
    drawScissorsCut
  };
})();
