/* global window */
(function () {
  const canvas = document.getElementById('demo-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const SKETCHES = [
    { word: '고양이', paths: [[[120, 200], [180, 160], [240, 200]], [[200, 200], [200, 280]], [[160, 130], [170, 110]], [[230, 130], [240, 110]]] },
    { word: '집', paths: [[[200, 280], [200, 180], [320, 180]], [[140, 200], [200, 140], [260, 200]], [[220, 240], [220, 280], [260, 280], [260, 240], [220, 240]]] },
    { word: '해', paths: [[[280, 160], [320, 200], [360, 160], [320, 120], [280, 160]]] },
    { word: '나무', paths: [[[300, 300], [300, 200]], [[250, 220], [300, 150], [350, 220]]] }
  ];

  let sketchIdx = 0;
  let phase = 'draw';
  let frame = 0;
  let currentPaths = [];
  let pathProgress = 0;

  function clear() {
    ctx.fillStyle = '#fffef8';
    ctx.fillRect(0, 0, W, H);
  }

  function drawPartial(paths, progress) {
    clear();
    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let totalPts = 0;
    paths.forEach((p) => { totalPts += p.length; });
    let drawn = 0;
    const target = Math.floor(totalPts * progress);

    paths.forEach((path) => {
      if (drawn >= target) return;
      ctx.beginPath();
      path.forEach((pt, i) => {
        if (drawn >= target) return;
        if (i === 0) ctx.moveTo(pt[0], pt[1]);
        else ctx.lineTo(pt[0], pt[1]);
        drawn++;
      });
      ctx.stroke();
    });

    ctx.font = '28px Jua, sans-serif';
    ctx.fillStyle = 'rgba(255,107,157,0.7)';
    ctx.fillText(SKETCHES[sketchIdx].word, 24, 48);
  }

  function tick() {
    const sketch = SKETCHES[sketchIdx];

    if (phase === 'draw') {
      pathProgress += 0.02;
      drawPartial(sketch.paths, pathProgress);
      if (pathProgress >= 1) {
        phase = 'hold';
        frame = 0;
      }
    } else if (phase === 'hold') {
      drawPartial(sketch.paths, 1);
      frame++;
      if (frame > 90) phase = 'erase';
    } else {
      pathProgress -= 0.04;
      drawPartial(sketch.paths, Math.max(0, pathProgress));
      if (pathProgress <= 0) {
        sketchIdx = (sketchIdx + 1) % SKETCHES.length;
        phase = 'draw';
        pathProgress = 0;
      }
    }

    requestAnimationFrame(tick);
  }

  clear();
  tick();
})();
