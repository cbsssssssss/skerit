/* global io, SkeritZones, SkeritDraw, SkeritScissors */
(function () {
  const socket = io();

  const MODE_HINTS = {
    normal: '한 명이 그리고 나머지가 맞춰요!',
    telescope: '망원경으로 좁게 보이는 곳만 그릴 수 있어요! 🔭',
    coop: '2~4명이 조각을 맡아 그리고, 나머지는 맞춰요! ✂️'
  };

  const MODE_LABELS = {
    normal: '일반 모드',
    telescope: '망원경 모드 🔭',
    coop: '협동 모드 🤝'
  };

  const COLORS = ['#2b2b2b', '#e74c3c', '#3498db', '#27ae60', '#9b59b6', '#f39c12'];

  let selectedMode = 'normal';
  let room = null;
  let isHost = false;
  let myId = null;
  let canDraw = false;
  let isGuesser = false;
  let revealed = false;
  let myZone = null;
  let splitLayout = null;
  let drawColor = COLORS[0];
  let drawSize = 4;
  let timerInterval = null;
  let cursorPos = { x: 400, y: 250 };
  let paths = [];
  let secretWord = null;
  let redrawScheduled = false;

  let isDrawing = false;
  let currentPathId = null;
  let pendingPoints = [];
  let lastEmit = 0;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const screens = {
    lobby: $('#screen-lobby'),
    waiting: $('#screen-waiting'),
    game: $('#screen-game')
  };

  const canvas = $('#game-canvas');
  const maskCanvas = $('#mask-canvas');
  const overlayCanvas = $('#overlay-canvas');
  const cutCanvas = $('#cut-canvas');
  const canvasStack = $('#canvas-stack');
  const waitingCanvas = $('#waiting-canvas');
  const ctx = canvas.getContext('2d');
  const maskCtx = maskCanvas.getContext('2d');
  const overlayCtx = overlayCanvas.getContext('2d');
  const cutCtx = cutCanvas.getContext('2d');
  const waitCtx = waitingCanvas ? waitingCanvas.getContext('2d') : null;

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    screens[name].classList.add('active');
    if (name === 'waiting') drawWaitingBackdrop();
  }

  function drawWaitingBackdrop() {
    if (!waitCtx) return;
    const w = waitingCanvas.width;
    const h = waitingCanvas.height;
    waitCtx.fillStyle = '#fffef8';
    waitCtx.fillRect(0, 0, w, h);
    waitCtx.strokeStyle = 'rgba(43,43,43,0.15)';
    waitCtx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      waitCtx.beginPath();
      waitCtx.moveTo(0, (h / 8) * i);
      waitCtx.lineTo(w, (h / 8) * i + 20);
      waitCtx.stroke();
    }
    waitCtx.font = '48px Gamja Flower, Jua, sans-serif';
    waitCtx.fillStyle = 'rgba(255,107,157,0.25)';
    waitCtx.fillText('Skerit!', w / 2 - 80, h / 2);
  }

  function showError(msg) {
    const el = $('#lobby-error');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
  }

  function getName() {
    return ($('#player-name').value || '플레이어').trim().slice(0, 12) || '플레이어';
  }

  function getCode() {
    return $('#room-code').value.replace(/\D/g, '').slice(0, 6);
  }

  function getActiveChatLog() {
    return screens.waiting.classList.contains('active')
      ? $('#waiting-chat-log')
      : $('#chat-log');
  }

  function addChatMessage({ name, text, type }) {
    const log = getActiveChatLog();
    const div = document.createElement('div');
    div.className = `msg ${type || 'chat'}`;
    div.innerHTML = `<strong>${escapeHtml(name)}</strong>: ${escapeHtml(text)}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function addSystemMessage(text, className) {
    const log = getActiveChatLog();
    const div = document.createElement('div');
    div.className = `msg system ${className || ''}`;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  $$('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMode = btn.dataset.mode;
      $('#mode-hint').textContent = MODE_HINTS[selectedMode];
    });
  });

  $('#room-code').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  });

  $('#btn-create').addEventListener('click', () => {
    socket.emit('createRoom', { name: getName(), mode: selectedMode });
  });

  $('#btn-join').addEventListener('click', () => {
    const code = getCode();
    if (code.length !== 6) {
      showError('6자리 숫자 코드를 입력해 주세요!');
      return;
    }
    socket.emit('joinRoom', { code, name: getName() });
  });

  $('#btn-copy-code').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#display-code').textContent);
      $('#btn-copy-code').textContent = '✅';
      setTimeout(() => { $('#btn-copy-code').textContent = '복사'; }, 2000);
    } catch {
      showError('복사에 실패했어요.');
    }
  });

  $('#btn-leave-room').addEventListener('click', () => {
    socket.emit('leaveRoom');
  });

  socket.on('leftRoom', () => {
    room = null;
    showScreen('lobby');
  });

  $$('.mode-btn-host').forEach((btn) => {
    btn.addEventListener('click', () => {
      socket.emit('setMode', { mode: btn.dataset.mode });
    });
  });

  $$('.coop-count-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.coop-count-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      socket.emit('setCoopDrawers', { count: parseInt(btn.dataset.count, 10) });
    });
  });

  $('#btn-start').addEventListener('click', () => socket.emit('startGame'));

  // 커스텀 단어창 넓게 보기 토글 버튼 기능
  $('#btn-toggle-keyword-size')?.addEventListener('click', (e) => {
    const ta = $('#custom-keywords');
    if (!ta) return;
    
    ta.classList.toggle('expanded');
    if (ta.classList.contains('expanded')) {
      e.target.textContent = '↕ 원래대로 축소';
    } else {
      e.target.textContent = '↕ 넓게 보기';
    }
  });

  function sendWaitingChat() {
    const input = $('#waiting-chat-input');
    const text = input.value.trim();
    if (!text || !room) return;
    socket.emit('chat', { text });
    input.value = '';
  }

  $('#btn-waiting-send').addEventListener('click', sendWaitingChat);
  $('#waiting-chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendWaitingChat();
  });

  $('#btn-send').addEventListener('click', sendGameChat);
  $('#chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendGameChat();
  });

  function sendGameChat() {
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text || !room) return;
    const me = room.players.find((p) => p.id === myId);
    if (room.state === 'playing') {
      if (me?.isDrawer) socket.emit('chat', { text });
      else socket.emit('guess', { text });
    } else {
      socket.emit('chat', { text });
    }
    input.value = '';
  }

  $('#btn-clear').addEventListener('click', () => {
    socket.emit('clearZone');
    paths = paths.filter((p) => p.playerId !== myId);
    scheduleRedraw();
  });

  $('#btn-next-round').addEventListener('click', () => socket.emit('nextRound'));
  $('#btn-lobby').addEventListener('click', () => socket.emit('backToLobby'));

  function updateHostModeButtons(mode) {
    $$('.mode-btn-host').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    const coopEl = $('#coop-drawer-setting');
    if (coopEl) coopEl.classList.toggle('hidden', mode !== 'coop' || !isHost);
    const kwEl = $('#keyword-setting');
    if (kwEl) kwEl.classList.toggle('hidden', !isHost);
  }

  function syncKeywordUI() {
    if (!room || !isHost) return;
    const ta = $('#custom-keywords');
    
    // ★ 수정: 현재 마우스 커서가 텍스트박스 내부에서 타이핑 중(activeElement)일 때는 
    // 서버가 강제로 글자를 덮어씌워 쉼표나 띄어쓰기를 지워버리는 현상을 차단합니다.
    if (ta && document.activeElement !== ta) {
      ta.value = room.customWords ? room.customWords.join(', ') : '';
    }
    
    $$('.word-source-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.source === (room.wordSource || 'mixed'));
    });
  }

  let keywordDebounce = null;
  $('#custom-keywords')?.addEventListener('input', (e) => {
    if (!isHost) return;
    clearTimeout(keywordDebounce);
    keywordDebounce = setTimeout(() => {
      socket.emit('setCustomWords', { text: e.target.value });
    }, 400);
  });

  $$('.word-source-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isHost) return;
      $$('.word-source-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      socket.emit('setWordSource', { source: btn.dataset.source });
    });
  });

  function renderPlayerList(listEl, players) {
    listEl.innerHTML = '';
    players.forEach((p) => {
      const li = document.createElement('li');
      if (p.id === room.hostId) li.classList.add('host');
      if (p.isDrawer) li.classList.add('drawer');
      if (p.isGuesser) li.classList.add('guesser');
      if (p.guessed) li.classList.add('guessed');
      let label = `${p.name} (${p.score || 0}점)`;
      if (room.mode === 'coop' && p.isDrawer && p.zone != null) {
        label += ` · 조각 ${Number(p.zone) + 1}`;
      }
      li.textContent = label;
      listEl.appendChild(li);
    });
  }

  function enterWaiting(data) {
    room = data.room;
    isHost = data.isHost;
    myId = socket.id;
    showScreen('waiting');
    $('#display-code').textContent = room.code;
    $('#waiting-mode').textContent = MODE_LABELS[room.mode] || room.mode;
    updateHostModeButtons(room.mode);
    renderPlayerList($('#player-list'), room.players);
    $('#host-controls').classList.toggle('hidden', !isHost);
    $('#waiting-hint').classList.toggle('hidden', isHost);
    $('#waiting-chat-log').innerHTML = '';
    syncKeywordUI();
  }

  function applyDrawerViewport() {
    canvasStack.classList.remove('zone-cropped');
    if (room && room.mode === 'coop' && !revealed && canDraw && myZone != null && splitLayout) {
      canvasStack.classList.add('zone-cropped');
    }
    scheduleRedraw();
  }

  function updateRoleBadge() {
    const badge = $('#role-badge');
    if (!room || room.state !== 'playing' || revealed) {
      badge.classList.add('hidden');
      return;
    }
    badge.classList.remove('hidden', 'drawer', 'guesser');
    if (canDraw) {
      badge.textContent = room.mode === 'coop' ? '✏️ 그리는 역할' : '✏️ 그리는 사람';
      badge.classList.add('drawer');
    } else {
      badge.textContent = '🔍 맞추는 역할';
      badge.classList.add('guesser');
    }
  }

  function showRoleSplash() {
    const splash = $('#role-splash');
    if (!splash) return;
    let text = '';
    if (canDraw) {
      text = room.mode === 'coop' ? '✏️ 그리는 역할!' : '✏️ 그리는 사람!';
    } else {
      text = '🔍 맞추는 역할!';
    }
    splash.textContent = text;
    splash.classList.remove('hidden', 'fade-out');
    setTimeout(() => splash.classList.add('fade-out'), 1600);
    setTimeout(() => splash.classList.add('hidden'), 2800);
  }

  function updateWordDisplay() {
    const banner = $('#word-banner');
    const el = $('#secret-word');

    if (revealed) {
      banner.classList.add('hidden');
      return;
    }

    if (isGuesser || !canDraw) {
      banner.classList.add('hidden');
      return;
    }

    banner.classList.remove('hidden');

    el.textContent = secretWord || '???';
  }

  function getVisiblePaths() {
    if (revealed) return paths;
    if (room.mode === 'coop' && canDraw) {
      return paths.filter((p) => p.playerId === myId);
    }
    return paths;
  }

  function scheduleRedraw() {
    if (redrawScheduled) return;
    redrawScheduled = true;
    requestAnimationFrame(() => {
      redrawScheduled = false;
      redrawCanvas();
    });
  }

  function redrawCanvas() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    const visible = getVisiblePaths();

    // 협동 모드에서 그리는 사람일 때: 이미지처럼 내 구역만 남기고 나머지는 가림막으로 덮음
    if (room && room.mode === 'coop' && canDraw && myZone != null && splitLayout && !revealed) {
      ctx.save();
      // 1. 할당된 다각형 내부에만 선이 그려지도록 Clip 설정
      SkeritDraw.clipToZone(ctx, splitLayout, myZone);
      SkeritDraw.drawAllPaths(ctx, visible);
      ctx.restore();
      
      // 2. 가림막 연산: 전체를 회색 질감으로 채운 뒤, 내 분할 영역만 투명하게 구멍을 뚫어 줌 (Destination-Out)
      ctx.save();
      // 별도의 가상 임시 캔버스를 쓰지 않고 안전하게 덮기 위해 마스크 컨텍스트와 조합하거나 
      // 아래와 같이 클리핑 반전 영역 처리를 안전하게 실행합니다.
      const zone = SkeritZones.getPlayerZone(splitLayout, myZone);
      if (zone) {
        // 백그라운드 버퍼에 외곽을 먼저 채우기 위해 전체 캔버스를 다 가림
        // 맞추는 사람에게 영향을 주지 않기 위해 드로잉 버퍼만 분리
        maskCtx.clearRect(0, 0, w, h);
        maskCtx.fillStyle = '#f5f0e0'; // 이미지에 나온 비활성 구역 종이 색상
        maskCtx.fillRect(0, 0, w, h);
        
        // 내 구역만 도려내기
        maskCtx.save();
        maskCtx.globalCompositeOperation = 'destination-out';
        maskCtx.beginPath();
        if (zone.polygon && zone.polygon.length >= 3) {
          zone.polygon.forEach((p, i) => {
            if (i === 0) maskCtx.moveTo(p.x, p.y);
            else maskCtx.lineTo(p.x, p.y);
          });
        } else if (zone.bounds) {
          const b = zone.bounds;
          maskCtx.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
        }
        maskCtx.closePath();
        maskCtx.fill();
        maskCtx.restore();
      }
    } else {
      // 일반 모드 또는 맞추는 사람은 이미지처럼 전체 캔버스 뷰를 깨끗하게 다 감상함
      SkeritDraw.drawAllPaths(ctx, visible);
    }

    applyMasks();
    overlayCtx.clearRect(0, 0, w, h);
  }

  function applyMasks() {
    const w = canvas.width;
    const h = canvas.height;
    
    // 일반적인 상황에서는 마스크 캔버스를 초기화
    // 단, 협동모드 그리는 사람은 위에서 계산한 구역 가림막 화면을 그대로 띄워야 하므로 초기화 예외 처리
    if (room && room.mode === 'coop' && canDraw && !revealed) {
      // 위 redrawCanvas에서 처리한 maskCtx 내용을 유지함
    } else {
      maskCtx.clearRect(0, 0, w, h);
    }

    if (revealed) return;

    // 망원경 모드일 때: 그리는 사람이 아닌 "맞추는 사람"들의 화면에만 망원경을 씌움
    if (room && room.mode === 'telescope' && !canDraw) {
      SkeritDraw.drawTelescopeMask(maskCtx, cursorPos, w, h);
    }
  }

  function getCanvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;

    // 브라우저 화면 크기 대비 실제 Canvas 해상도(800x500) 비율 반영
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // 확대를 하지 않으므로 캔버스 내에서의 좌표는 마우스 상대 위치와 항시 일치합니다.
    return {
      x: (cx - rect.left) * scaleX,
      y: (cy - rect.top) * scaleY
    };
  }

  function pointInDrawZone(x, y) {
    if (room.mode !== 'coop' || revealed) return true;
    if (!canDraw || myZone == null || !splitLayout) return false;
    const zone = SkeritZones.getPlayerZone(splitLayout, myZone);
    return zone ? SkeritZones.pointInZone(x, y, zone) : false;
  }

  function mergeRemotePath(data) {
    let existing = paths.find(
      (p) => p.pathId === data.pathId && p.playerId === data.playerId
    );
    if (existing) {
      existing.points = SkeritDraw.appendPathPoints(existing.points, data.points);
    } else {
      paths.push({
        pathId: data.pathId,
        playerId: data.playerId,
        color: data.color,
        size: data.size,
        points: [...data.points]
      });
    }
    scheduleRedraw();
  }

  function flushDrawEmit(force) {
    if (pendingPoints.length === 0) return;
    const now = Date.now();
    if (!force && now - lastEmit < 16) return;

    const batch = [...pendingPoints];
    pendingPoints = [];
    lastEmit = now;

    socket.emit('drawPath', {
      pathId: currentPathId,
      points: batch,
      color: drawColor,
      size: drawSize,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    });

    const local = paths.find((p) => p.pathId === currentPathId && p.playerId === myId);
    if (local) {
      local.points = SkeritDraw.appendPathPoints(local.points, batch);
    }
  }

  function endStroke() {
    if (isDrawing) {
      flushDrawEmit(true);
      socket.emit('drawPathEnd', { pathId: currentPathId });
    }
    isDrawing = false;
    currentPathId = null;
    pendingPoints = [];
  }

  function onDrawStart(e) {
    if (!canDraw || revealed) return;
    e.preventDefault();
    const p = getCanvasPoint(e);
    if (!pointInDrawZone(p.x, p.y)) return;

    isDrawing = true;
    currentPathId = `${myId}-${Date.now()}`;
    pendingPoints = [{ x: p.x, y: p.y }];
    cursorPos = p;

    paths.push({
      pathId: currentPathId,
      playerId: myId,
      color: drawColor,
      size: drawSize,
      points: [{ x: p.x, y: p.y }]
    });
    scheduleRedraw();
  }

  function onDrawMove(e) {
    const p = getCanvasPoint(e);
    
    // 1. 내가 그리는 사람이든 맞추는 사람이든 상관없이 내 화면 안에서의 이동 좌표는 상시 동기화
    cursorPos = p;

    // 2. 만약 망원경 모드라면 마우스를 클릭하지 않은 단순 오버 상태에서도 시야를 즉각 갱신
    if (room && room.mode === 'telescope') {
      applyMasks();
    }

    if (!isDrawing || !canDraw || revealed) return;
    if (!pointInDrawZone(p.x, p.y)) { endStroke(); return; }

    pendingPoints.push({ x: p.x, y: p.y });

    const local = paths.find((pth) => pth.pathId === currentPathId && pth.playerId === myId);
    if (local) {
      local.points.push(p);
    }

    flushDrawEmit(false);
    scheduleRedraw();
  }

  // ★ 중요 추가: 마우스를 클릭하지 않고 캔버스 위를 그냥 휘저을 때도 맞추는 사람의 망원경이 따라오도록 연동
  canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) {
      const p = getCanvasPoint(e);
      cursorPos = p;
      if (room && room.mode === 'telescope' && !canDraw) {
        applyMasks(); // 맞추는 사람의 실시간 시야 이동 렌더링
      }
    }
  });

  function onDrawEnd() {
    endStroke();
    scheduleRedraw();
  }

  canvas.addEventListener('mousedown', onDrawStart);
  canvas.addEventListener('mousemove', onDrawMove);
  canvas.addEventListener('mouseup', onDrawEnd);
  canvas.addEventListener('mouseleave', onDrawEnd);
  canvas.addEventListener('touchstart', onDrawStart, { passive: false });
  canvas.addEventListener('touchmove', onDrawMove, { passive: false });
  canvas.addEventListener('touchend', onDrawEnd);

  function playScissorsAnimation(layout, callback) {
    canvasStack.classList.add('cutting');
    SkeritScissors.play(cutCtx, layout, canvas.width, canvas.height, () => {
      canvasStack.classList.remove('cutting');
      callback();
    });
  }

  function startTimer(seconds) {
    clearInterval(timerInterval);
    let left = seconds;
    const el = $('#timer');
    const tick = () => {
      el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      if (left <= 0) clearInterval(timerInterval);
      left -= 1;
    };
    tick();
    timerInterval = setInterval(tick, 1000);
  }

  function setupGameUI() {
    const me = room.players.find((p) => p.id === myId);
    canDraw = !!(me && me.isDrawer);
    isGuesser = !!(me && me.isGuesser);
    revealed = room.revealed || room.state === 'revealed';
    myZone = me?.zone ?? null;
    splitLayout = room.splitLayout || splitLayout;

    $('#game-mode-label').textContent = MODE_LABELS[room.mode] || room.mode;
    $('#btn-clear').classList.toggle('hidden', !canDraw);
    canvasStack.classList.toggle('revealed', revealed);
    canvasStack.classList.toggle('no-draw', !canDraw || revealed);

    applyDrawerViewport();
    updateWordDisplay();
    updateRoleBadge();
    renderPlayerList($('#game-player-list'), room.players);
    $('#host-round-controls').classList.toggle('hidden', !isHost || !revealed);
    $('#reveal-panel').classList.toggle('hidden', !revealed);
  }

  function startRound(data) {
    room = data.room;
    splitLayout = data.splitLayout || room.splitLayout;
    revealed = false;
    paths = [];
    const mePre = data.room.players.find((p) => p.id === myId);
    if (!mePre?.isDrawer) secretWord = null;

    showScreen('game');
    $('#chat-log').innerHTML = '';
    $('#reveal-panel').classList.add('hidden');

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    cutCtx.clearRect(0, 0, cutCanvas.width, cutCanvas.height);

    setupGameUI();
    addSystemMessage('새 라운드가 시작됐어요!');

    const afterCut = () => {
      setupGameUI();
      redrawCanvas();
      showRoleSplash();
      startTimer(data.timeLeft || 90);
    };

    if (room.mode === 'coop' && splitLayout) {
      addSystemMessage('✂️ 가위가 분할선을 따라 자르는 중…');
      playScissorsAnimation(splitLayout, afterCut);
    } else {
      afterCut();
    }
  }

  // ── 기존 소켓 서버 수신 이벤트 관리 규격 ──
  socket.on('roomJoined', enterWaiting);

  socket.on('roomUpdate', (r) => {
    room = r;
    if (screens.waiting.classList.contains('active')) {
      renderPlayerList($('#player-list'), room.players);
      $('#waiting-mode').textContent = MODE_LABELS[room.mode] || room.mode;
      updateHostModeButtons(room.mode);
      syncKeywordUI();
    }
    if (screens.game.classList.contains('active')) setupGameUI();
  });

  socket.on('hostChanged', ({ hostId }) => {
    room.hostId = hostId;
    isHost = hostId === myId;
    if (screens.waiting.classList.contains('active')) {
      $('#host-controls').classList.toggle('hidden', !isHost);
      $('#waiting-hint').classList.toggle('hidden', isHost);
      updateHostModeButtons(room.mode);
    }
    addSystemMessage(isHost ? '당신이 새 방장이 됐어요!' : '방장이 바뀌었어요.');
  });

  socket.on('errorMsg', ({ message }) => {
    if (screens.lobby.classList.contains('active')) showError(message);
    else addSystemMessage(message);
  });

  // ★ 중요: 10초 투표 가림막을 걷어내는 가장 이상적인 타이밍
  socket.on('roundStart', (data) => {
    // 1. 투표(선택)창 오버레이를 완전히 닫아 캔버스를 노출시킵니다.
    const overlay = $('#selection-overlay');
    if (overlay) overlay.classList.add('hidden');
    
    // 2. 원래 제공되던 진짜 게임 시작 셋업 함수 실행
    startRound(data);
  });

  socket.on('yourWord', ({ word }) => {
    secretWord = word;
    updateWordDisplay();
  });

  socket.on('drawPath', (data) => {
    if (data.playerId === myId) return;
    mergeRemotePath(data);
  });

  socket.on('clearPlayer', ({ playerId }) => {
    paths = paths.filter((p) => p.playerId !== playerId);
    scheduleRedraw();
  });

  socket.on('chatMessage', (msg) => addChatMessage(msg));

  socket.on('correctGuess', ({ name, room: r }) => {
    room = r;
    addSystemMessage(`${name}님이 정답! 🎉`, 'correct');
    setupGameUI();
  });

  socket.on('playerGuessed', ({ name, room: r }) => {
    room = r;
    addSystemMessage(`${name}님이 정답! ✅`, 'correct');
    setupGameUI();
  });

  socket.on('roundEnd', ({ word, room: r, paths: allPaths }) => {
    room = r;
    revealed = true;
    secretWord = word;
    paths = allPaths || paths;
    clearInterval(timerInterval);
    SkeritZones.clearZoneViewport(canvasStack);
    setupGameUI();
    scheduleRedraw();
    $('#reveal-word').textContent = word;
    $('#secret-word').textContent = word;
    $('#word-banner').classList.remove('hidden');
    $('#reveal-panel').classList.remove('hidden');
    addSystemMessage(`라운드 종료! 정답은 「${word}」`, 'correct');
  });

  socket.on('backToLobby', (r) => {
    room = r;
    revealed = false;
    secretWord = null;
    paths = [];
    splitLayout = null;
    clearInterval(timerInterval);
    showScreen('waiting');
    renderPlayerList($('#player-list'), room.players);
    $('#host-controls').classList.toggle('hidden', !isHost);
    updateHostModeButtons(room.mode);
  });

  // 서버로부터 그리는 사람의 실시간 커서 위치를 전달받아 맞추는 사람의 망원경 시야를 동기화
  socket.on('remoteCursorMove', (pos) => {
    if (room && room.mode === 'telescope' && !canDraw) {
      cursorPos = pos;
      applyMasks();
    }
  });

  // ── ★ 추가: 서버로부터 단어 선택 화면 시작 명령을 받았을 때의 신규 소켓 리스너 연동 ──
  socket.on('startSelection', (data) => {
    showScreen('game'); // 캔버스 화면 레이아웃으로 즉각 강제 이동
    
    const overlay = $('#selection-overlay');
    if (overlay) overlay.classList.remove('hidden'); // 10초 투표 배경막 열기
    
    // 플레이어가 그리는 사람/맞추는 사람인지 상태 최신화 수집
    const me = room.players.find((p) => p.id === myId);
    canDraw = !!(me && me.isDrawer);

    if (canDraw) {
      // 나는 그리는 사람: 단어 5개 카드 칩 동적 렌더링 활성화
      $('#selection-drawer-view')?.classList.remove('hidden');
      $('#selection-guesser-view')?.classList.add('hidden');
      
      const wrap = $('#word-cards-wrap');
      if (wrap) {
        wrap.innerHTML = '';
        data.words.forEach((word, index) => {
          const card = document.createElement('div');
          card.className = 'word-card';
          card.dataset.index = index;
          card.innerHTML = `<span class="word-text">${word}</span><div class="voters" id="voters-${index}"></div>`;
          
          card.addEventListener('click', () => {
            socket.emit('voteWord', index);
            // 내가 누른 카드를 식별하기 편하게 시각 액센트 부여
            $$('.word-card').forEach(c => c.classList.remove('voted'));
            card.classList.add('voted');
          });
          wrap.appendChild(card);
        });
      }
    } else {
      // 나는 맞추는 사람: 그리는 동안 '출제중...' 샌드박스 대기 뷰 노출
      $('#selection-drawer-view')?.classList.add('hidden');
      $('#selection-guesser-view')?.classList.remove('hidden');
    }
  });

  // 1초마다 남은 10초 투표 카운트다운 타이머 렌더링
  socket.on('selectionTimer', (time) => {
    const t = $('#selection-timer-display');
    if (t) t.textContent = time;
  });

  // 협동 모드용: 실시간 투표 변동 상황 닉네임 라벨 매칭
  socket.on('voteUpdate', (votes) => {
    $$('.voters').forEach(v => v.innerHTML = ''); 
    
    Object.keys(votes).forEach(socketId => {
      const idx = votes[socketId];
      if (room && room.players) {
        const player = room.players.find(p => p.id === socketId);
        if (player) {
          const chip = document.createElement('span');
          chip.className = 'voter-chip';
          chip.textContent = player.name;
          $(`#voters-${idx}`)?.appendChild(chip);
        }
      }
    });
  });

  // ── 컬러 바 및 드로잉 기본 컨텍스트 설정 ──
  const colorBar = $('#color-bar');
  if (colorBar) {
    COLORS.forEach((c, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `color-dot wiggle-hover${i === 0 ? ' active' : ''}`;
      dot.style.background = c;
      dot.addEventListener('click', () => {
        drawColor = c;
        $$('.color-dot').forEach((d) => d.classList.remove('active'));
        dot.classList.add('active');
      });
      colorBar.appendChild(dot);
    });
  }

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawWaitingBackdrop();
})(); // 즉시 실행 함수 스크립트 마감 블록 위치 고정