const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const {
  generateSplitLayout,
  pointInZone,
  assignDrawerRoles
} = require('./zones');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const WORDS = [
  '고양이', '강아지', '비행기', '피자', '우산', '자전거', '해변', '로켓',
  '기타', '눈사람', '호랑이', '코끼리', '치킨', '햄버거', '선글라스', '우주',
  '공룡', '펭귄', '번개', '무지개', '시계', '책', '전화', '컴퓨터',
  '꽃', '나무', '집', '자동차', '배', '물고기', '곰', '토끼',
  '축구', '농구', '피아노', '마이크', '카메라', '선물', '케이크', '아이스크림',
  '달', '태양', '별', '구름', '비', '눈', '산', '강',
  '의사', '요리사', '왕', '해적', '닌자', '로봇', '유령', '드래곤', '사과', '바나나', '여우', '돌고래', '스마트폰', '사막', '지갑', '반지',
'선풍기', '그림자', '모래성', '초콜릿', '열쇠', '장미', '여권', '신문',
'텀블러', '지도', '양초', '소파', '신호등', '달력', '베개', '망원경',
'깃발', '가위', '신발장', '우체통', '이어폰', '책상', '액체', '단풍잎',
'축구공', '목걸이', '나침반', '주전자', '손수건', '풍선', '유리창', '도토리',
'계산기', '향수', '자석', '노트북', '영수증', '스탠드', '도장', '화분',
'보틀', '앨범', '스웨터', '담요', '단추', '마우스', '클립', '계단',
'티켓', '행성', '칫솔', '국기', '모닥불', '벽돌', '스피커', '인형',
'분수', '보름달', '나비', '안경', '가방', '가로등', '모자', '수박',
'일기장', '빌딩', '고래', '원숭이', '기린', '사자', '매', '수달',
'안개', '낙엽', '미끄럼틀', '그네', '텐트', '배낭', '캠핑카', '장화',
'연날리기', '기차', '지하철', '버스', '택시', '오토바이', '소방차', '경찰차',
'앰뷸런스', '우유', '빵', '치즈', '달걀', '샐러드', '샌드위치', '커피', '액자', '거울', '칠판', '분필', '지우개', '필통', '공책', '연필깎이',
'형광펜', '스티커', '클레이', '물감', '붓', '스케치북', '색종이', '가위',
'풀', '테이프', '스테이플러', '펀치', '클립', '포스트잇', '독서대', '북엔드',
'바둑', '체스', '큐브', '퍼즐', '요요', '팽이', '스케이트보드', '인라인',
'킥보드', '자전거', '헬멧', '보호대', '줄넘기', '훌라후프', '아령', '매트',
'수영모', '물안경', '튜브', '구명조끼', '오리발', '서핑보드', '낚싯대', '아이스박스',
'돗자리', '파라솔', '썬크림', '모기향', '캠핑의자', '코펠', '버너', '해먹',
'랜턴', '나침반', '만보기', '스마트워치', '보조배터리', '충전기', 'USB', '외장하드',
'마우스패드', '키보드', '모니터', '본체', '멀티탭', '공기청정기', '가습기', '제습기',
'청소기', '로봇청소기', '빗자루', '쓰레받기', '휴지통', '걸레', '분무기', '세제',
'섬유유연제', '빨래집게', '빨래건조대', '다리미', '다리미판', '옷걸이', '바지걸이', '수납함',
'리모컨', '셋톱박스', '공유기', '안테나', '빔프로젝터', '스크린', '블루투스스피커', '헤드폰'
];

const MODES = ['normal', 'telescope', 'coop'];
const ROUND_TIME = 90;
const MAX_PLAYERS = 8;
const COOP_DRAWER_MIN = 2;
const COOP_DRAWER_MAX = 4;

const rooms = new Map();

function randomCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(code));
  return code;
}

function pickWordFromDefaults() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function pickWordForRoom(room) {
  const custom = (room.customWords || []).filter((w) => w && w.trim());
  const source = room.wordSource || 'mixed';

  if (custom.length === 0) return pickWordFromDefaults();

  if (source === 'customOnly') {
    return custom[Math.floor(Math.random() * custom.length)];
  }

  const pool = [...WORDS, ...custom];
  return pool[Math.floor(Math.random() * pool.length)];
}

function createRoom(hostSocket, playerName, mode) {
  const code = randomCode();
  const room = {
    code,
    mode: MODES.includes(mode) ? mode : (mode === 'realname' ? 'telescope' : 'normal'),
    hostId: hostSocket.id,
    players: [],
    paths: [],
    state: 'lobby',
    word: null,
    drawerIndex: 0,
    roundEnd: null,
    canvasSize: { width: 800, height: 500 },
    revealed: false,
    roundTimer: null,
    splitLayout: null,
    coopDrawerCount: null,
    customWords: [],
    wordSource: 'mixed'
  };
  rooms.set(code, room);
  return room;
}

function getRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.id === socketId)) return room;
  }
  return null;
}

function getZoneForPlayer(room, player) {
  if (!room.splitLayout || player.zone == null) return null;
  return room.splitLayout.zones.find((z) => z.id === player.zone)
    || room.splitLayout.zones[player.zone];
}

function roomPayload(room) {
  return {
    code: room.code,
    mode: room.mode,
    hostId: room.hostId,
    state: room.state,
    revealed: room.revealed,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      zone: p.zone,
      guessed: p.guessed,
      score: p.score,
      isDrawer: p.isDrawer,
      isGuesser: p.isGuesser
    })),
    drawerIndex: room.drawerIndex,
    canvasSize: room.canvasSize,
    splitLayout: room.splitLayout,
    coopDrawerCount: room.coopDrawerCount,
    customWords: room.customWords || [],
    wordSource: room.wordSource || 'mixed'
  };
}

function resolveCoopDrawerCount(room) {
  const maxDrawers = Math.min(COOP_DRAWER_MAX, room.players.length - 1);
  const minDrawers = Math.min(COOP_DRAWER_MIN, maxDrawers);
  if (maxDrawers < minDrawers) return minDrawers;

  if (room.coopDrawerCount != null) {
    return Math.min(Math.max(room.coopDrawerCount, minDrawers), maxDrawers);
  }
  return minDrawers + Math.floor(Math.random() * (maxDrawers - minDrawers + 1));
}

function startRound(room) {
  room.paths = [];
  room.revealed = false;
  room.state = 'playing';
  room.word = pickWordForRoom(room);
  room.splitLayout = null;

  room.players.forEach((p) => {
    p.guessed = false;
    p.score = p.score || 0;
    p.isDrawer = false;
    p.isGuesser = false;
    p.zone = null;
  });

  if (room.mode === 'coop') {
    const drawerCount = resolveCoopDrawerCount(room);
    room.splitLayout = generateSplitLayout(
      drawerCount,
      room.canvasSize.width,
      room.canvasSize.height
    );
    assignDrawerRoles(room.players, drawerCount, room.splitLayout);

  } else {
    room.players.forEach((p, i) => {
      p.isDrawer = i === room.drawerIndex;
      p.isGuesser = !p.isDrawer;
    });
  }

  room.roundEnd = Date.now() + ROUND_TIME * 1000;
  if (room.roundTimer) clearTimeout(room.roundTimer);
  room.roundTimer = setTimeout(() => endRound(room, 'timeout'), ROUND_TIME * 1000);

  room.players.filter((p) => p.isDrawer).forEach((p) => {
    io.to(p.id).emit('yourWord', { word: room.word });
  });

  io.to(room.code).emit('roundStart', {
    room: roomPayload(room),
    timeLeft: ROUND_TIME,
    splitLayout: room.splitLayout
  });
}

function endRound(room, reason) {
  if (room.state !== 'playing') return;
  room.state = 'revealed';
  room.revealed = true;
  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }

  io.to(room.code).emit('roundEnd', {
    reason,
    word: room.word,
    room: roomPayload(room),
    paths: room.paths
  });
}

function checkCoopWin(room) {
  const guessers = room.players.filter((p) => p.isGuesser);
  if (guessers.length === 0) return;
  if (guessers.every((p) => p.guessed)) endRound(room, 'allGuessed');
}

function checkNormalWin(room, guesserId) {
  const drawer = room.players.find((p) => p.isDrawer);
  if (!drawer || guesserId === drawer.id) return;
  endRound(room, 'correct');
}

function transferHost(room, leavingId) {
  if (room.hostId !== leavingId) return;
  const remaining = room.players.filter((p) => p.id !== leavingId);
  if (remaining.length > 0) {
    room.hostId = remaining[0].id;
    io.to(room.code).emit('hostChanged', { hostId: room.hostId });
  }
}

function validateDrawPoint(room, player, x, y, w, h) {
  if (room.mode !== 'coop') return true;
  const zone = getZoneForPlayer(room, player);
  if (!zone) return false;
  return pointInZone(x, y, zone, w, h);
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ name, mode }) => {
    const playerName = (name || '플레이어').trim().slice(0, 12) || '플레이어';
    const room = createRoom(socket, playerName, mode);
    const player = {
      id: socket.id,
      name: playerName,
      score: 0,
      guessed: false,
      isDrawer: false,
      isGuesser: false,
      zone: null
    };
    room.players.push(player);
    socket.join(room.code);
    socket.emit('roomJoined', { room: roomPayload(room), isHost: true });
  });

  socket.on('joinRoom', ({ code, name }) => {
    const room = rooms.get(String(code).trim());
    if (!room) {
      socket.emit('errorMsg', { message: '방을 찾을 수 없어요!' });
      return;
    }
    if (room.players.length >= MAX_PLAYERS) {
      socket.emit('errorMsg', { message: '방이 가득 찼어요!' });
      return;
    }
    if (room.state !== 'lobby') {
      socket.emit('errorMsg', { message: '게임이 이미 진행 중이에요!' });
      return;
    }
    const playerName = (name || '플레이어').trim().slice(0, 12) || '플레이어';
    room.players.push({
      id: socket.id,
      name: playerName,
      score: 0,
      guessed: false,
      isDrawer: false,
      isGuesser: false,
      zone: null
    });
    socket.join(room.code);
    socket.emit('roomJoined', { room: roomPayload(room), isHost: false });
    io.to(room.code).emit('roomUpdate', roomPayload(room));
  });

  socket.on('setMode', ({ mode }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    if (MODES.includes(mode)) {
      room.mode = mode;
      io.to(room.code).emit('roomUpdate', roomPayload(room));
    }
  });

  // ==========================================
  // 2. 투표 이벤트 수신부 (io.on('connection') 내부)
  // ==========================================
  socket.on('voteWord', (index) => {
    const room = rooms[socket.roomCode];
    if (!room || room.state !== 'selecting') return;

    room.votes[socket.id] = index;
    const drawers = room.players.filter(p => p.canDraw);
    
    if (room.mode === 'coop') {
      // [협동 모드] 실시간 닉네임 마킹을 위해 투표 현황을 뿌려줌
      io.to(room.code).emit('voteUpdate', room.votes);
      
      // 만약 그리는 사람 전원이 빠짐없이 투표했다면 만장일치 여부 검사
      const votedDrawers = drawers.filter(d => room.votes[d.id] !== undefined);
      if (votedDrawers.length === drawers.length) {
        const firstVote = room.votes[drawers[0].id];
        const allSame = votedDrawers.every(d => room.votes[d.id] === firstVote);
        if (allSame) {
          // 전원 일치 시 타이머 0초 취급하고 즉시 시작
          finalizeWordSelection(room, firstVote);
        }
      }
    } else {
      // [일반/망원경 모드] 그리는 사람이 1명이므로 누르는 즉시 타이머 스킵 후 확정!
      finalizeWordSelection(room, index);
    }
  });

  socket.on('setCustomWords', ({ text }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    const words = String(text || '')
      .split(',')
      .map((w) => w.trim())
      .filter((w) => w.length > 0 && w.length <= 20)
      .slice(0, 50);
    room.customWords = words;
    io.to(room.code).emit('roomUpdate', roomPayload(room));
  });

  socket.on('setWordSource', ({ source }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    if (source === 'customOnly' || source === 'mixed') {
      room.wordSource = source;
      io.to(room.code).emit('roomUpdate', roomPayload(room));
    }
  });

  socket.on('setCoopDrawers', ({ count }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    const n = parseInt(count, 10);
    if (n >= COOP_DRAWER_MIN && n <= COOP_DRAWER_MAX) {
      room.coopDrawerCount = n;
      io.to(room.code).emit('roomUpdate', roomPayload(room));
    }
  });

  socket.on('startGame', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) {
      socket.emit('errorMsg', { message: '최소 2명이 필요해요!' });
      return;
    }
    if (room.mode === 'coop' && room.players.length < 3) {
      socket.emit('errorMsg', { message: '협동 모드는 최소 3명(그리는 2명 + 맞추는 1명)이 필요해요!' });
      return;
    }
    room.drawerIndex = 0;
    startRound(room);
  });

  socket.on('drawPath', (data) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.state !== 'playing' || room.revealed) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player?.isDrawer) return;

    const w = data.canvasWidth || room.canvasSize.width;
    const h = data.canvasHeight || room.canvasSize.height;
    const points = (data.points || []).filter((pt) =>
      validateDrawPoint(room, player, pt.x, pt.y, w, h)
    );
    if (points.length === 0) return;

    const pathData = {
      pathId: data.pathId,
      playerId: socket.id,
      color: data.color || '#2b2b2b',
      size: data.size || 4,
      points,
      zone: player.zone
    };

    let existing = room.paths.find(
      (p) => p.pathId === pathData.pathId && p.playerId === socket.id
    );
    if (existing) {
      existing.points.push(...points);
    } else {
      room.paths.push({ ...pathData, points: [...points] });
      existing = room.paths[room.paths.length - 1];
    }

    socket.to(room.code).emit('drawPath', pathData);
  });

  socket.on('drawPathEnd', ({ pathId }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    socket.to(room.code).emit('drawPathEnd', { pathId, playerId: socket.id });
  });

  socket.on('clearZone', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.state !== 'playing') return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player?.isDrawer) return;

    room.paths = room.paths.filter((p) => p.playerId !== socket.id);
    io.to(room.code).emit('clearPlayer', { playerId: socket.id });
  });

  socket.on('guess', ({ text }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.state !== 'playing') return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;
    if (player.isDrawer) return;

    const guess = (text || '').trim();
    if (!guess) return;

    /*io.to(room.code).emit('chatMessage', {
      name: player.name,
      text: guess,
      type: 'guess'
    });*/

    const normalizedGuess = guess.replace(/\s/g, '');
    const normalizedWord = (room.word || '').replace(/\s/g, '');
    if (normalizedGuess !== normalizedWord) return;

    if (room.mode === 'coop') {
      if (player.guessed) return;
      player.guessed = true;
      player.score = (player.score || 0) + 10;
      io.to(room.code).emit('playerGuessed', {
        playerId: socket.id,
        name: player.name,
        room: roomPayload(room)
      });
      checkCoopWin(room);
    } else {
      player.score = (player.score || 0) + 10;
      const drawer = room.players.find((p) => p.isDrawer);
      if (drawer) drawer.score = (drawer.score || 0) + 5;
      io.to(room.code).emit('correctGuess', {
        playerId: socket.id,
        name: player.name,
        room: roomPayload(room)
      });
      checkNormalWin(room, socket.id);
    }
  });

  socket.on('chat', ({ text }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;
    const msg = (text || '').trim().slice(0, 200);
    if (!msg) return;
    io.to(room.code).emit('chatMessage', {
      name: player.name,
      text: msg,
      type: 'chat'
    });
  });

  socket.on('nextRound', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.state !== 'revealed') return;
    room.drawerIndex = (room.drawerIndex + 1) % room.players.length;
    startRound(room);
  });

  socket.on('leaveRoom', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    socket.leave(room.code);
    const idx = room.players.findIndex((p) => p.id === socket.id);
    if (idx !== -1) room.players.splice(idx, 1);

    if (room.players.length === 0) {
      if (room.roundTimer) clearTimeout(room.roundTimer);
      rooms.delete(room.code);
    } else {
      transferHost(room, socket.id);
      io.to(room.code).emit('roomUpdate', roomPayload(room));
    }
    socket.emit('leftRoom');
  });

  socket.on('backToLobby', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id) return;
    room.state = 'lobby';
    room.revealed = false;
    room.paths = [];
    room.splitLayout = null;
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    io.to(room.code).emit('backToLobby', roomPayload(room));
  });

  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const idx = room.players.findIndex((p) => p.id === socket.id);
    if (idx === -1) return;
    room.players.splice(idx, 1);

    if (room.players.length === 0) {
      if (room.roundTimer) clearTimeout(room.roundTimer);
      rooms.delete(room.code);
      return;
    }

    transferHost(room, socket.id);
    io.to(room.code).emit('roomUpdate', roomPayload(room));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Skerit! server running on http://localhost:${PORT}`);
});

// 서버 어딘가에 배열 요소를 무작위로 섞어주는 유틸리티 함수가 없다면 추가해 줍니다.
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ==========================================
// 1. 기존 게임 시작 지점에서 호출할 새 함수
// ==========================================
function startWordSelection(room) {
  room.state = 'selecting';
  room.votes = {}; // { socketId: 투표한 카드 인덱스 }
  room.selectionTimer = 10;
  
  // 전체 제시어 풀(기본단어 + 커스텀)을 합친 뒤 섞어서 5개만 추출합니다.
  let pool = room.wordSource === 'customOnly' && room.customWords && room.customWords.length >= 5 
    ? [...room.customWords] 
    : [...(room.customWords || []), '사과', '우주선', '눈사람', '자전거', '피자', '컴퓨터', '고양이', '기차']; // 실제 서버 단어 배열로 대체하세요
    
  shuffleArray(pool);
  room.selectionWords = pool.slice(0, 5); // 딱 5개!

  // 클라이언트에게 선택 화면을 띄우라고 5개 단어를 보냅니다.
  io.to(room.code).emit('startSelection', { words: room.selectionWords });

  // 10초 타이머 카운트다운 시작
  clearInterval(room.interval);
  room.interval = setInterval(() => {
    room.selectionTimer--;
    io.to(room.code).emit('selectionTimer', room.selectionTimer);
    
    if (room.selectionTimer <= 0) {
      finalizeWordSelection(room); // 시간 초과 시 정산
    }
  }, 1000);
}

// ==========================================
// 3. 투표 정산 및 실제 게임 캔버스 시작
// ==========================================
function finalizeWordSelection(room, forcedIndex = null) {
  clearInterval(room.interval); 
  room.state = 'playing';

  let selectedIndex = 0;

  if (forcedIndex !== null) {
    selectedIndex = forcedIndex; // 만장일치이거나 1인 모드일 때 스킵된 값
  } else {
    // 타이머가 0이 되어 강제 정산될 때의 다수결 로직
    const counts = {};
    Object.values(room.votes).forEach(idx => {
      counts[idx] = (counts[idx] || 0) + 1;
    });

    let maxVotes = 0;
    let candidates = [];
    
    for (let i = 0; i < 5; i++) {
      const c = counts[i] || 0;
      if (c > maxVotes) {
        maxVotes = c;
        candidates = [i];
      } else if (c === maxVotes) {
        candidates.push(i);
      }
    }

    // 아무도 투표 안 했으면 전체 랜덤, 동점표가 있으면 1등 후보들 중 랜덤
    if (maxVotes === 0) {
      selectedIndex = Math.floor(Math.random() * 5);
    } else {
      shuffleArray(candidates);
      selectedIndex = candidates[0];
    }
  }

  // 뽑힌 최종 단어를 라운드 정답으로 세팅!
  room.secretWord = room.selectionWords[selectedIndex];
  
  // ★ 중요: 이제 원래 타이머 90초를 맞추고, io.emit('roundStarted')를 날리던 
  // 기존 진짜 게임 시작 로직 함수를 여기서 호출해 주시면 됩니다.
  startActualRound(room); 
}