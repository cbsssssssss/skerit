/* global window */
window.SkeritScissors = (function () {
  function drawScissors(ctx, x, y, angle, open) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const gap = open ? 0.35 : 0.08;

    ctx.fillStyle = '#ff6b9d';
    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.arc(-14, -8, 10, 0, Math.PI * 2);
    ctx.arc(-14, 8, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#c0c0c8';
    ctx.beginPath();
    ctx.moveTo(0, -gap * 20);
    ctx.lineTo(42, -32 - gap * 15);
    ctx.lineTo(48, -22);
    ctx.lineTo(8, -gap * 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, gap * 20);
    ctx.lineTo(42, 32 + gap * 15);
    ctx.lineTo(48, 22);
    ctx.lineTo(8, gap * 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function play(ctx, layout, w, h, onDone) {
    const dividers = layout.dividers || [];
    const perLine = 700;
    const duration = Math.max(1800, dividers.length * perLine);
    const start = performance.now();

    function frame(now) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#fffef8';
      ctx.fillRect(0, 0, w, h);

      const totalLines = dividers.length || 1;

      dividers.forEach((ln, lineIndex) => {
        const lineStart = (lineIndex / totalLines) * 0.85;
        const lineEnd = ((lineIndex + 1) / totalLines) * 0.85;
        const lineDuration = lineEnd - lineStart;
        const localT = Math.max(0, Math.min(1, (t - lineStart) / lineDuration));

        if (localT <= 0) return;

        const x = ln.x0 + (ln.x1 - ln.x0) * localT;
        const y = ln.y0 + (ln.y1 - ln.y0) * localT;
        const angle = Math.atan2(ln.y1 - ln.y0, ln.x1 - ln.x0) + Math.PI / 4;

        ctx.save();
        ctx.strokeStyle = 'rgba(43,43,43,0.75)';
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(ln.x0, ln.y0);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.restore();

        const open = Math.sin(now / 70 + lineIndex) > 0;
        drawScissors(ctx, x, y, angle, open);

        if (localT > 0.25 && localT < 0.45) {
          ctx.save();
          ctx.font = 'bold 24px Jua, sans-serif';
          ctx.fillStyle = '#ff6b9d';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.strokeText('싹둑!', x + 14, y - 20);
          ctx.fillText('싹둑!', x + 14, y - 20);
          ctx.restore();
        }
      });

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, w, h);
        if (onDone) onDone();
      }
    }

    requestAnimationFrame(frame);
  }

  return { play };
})();
