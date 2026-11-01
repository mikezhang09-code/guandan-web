/* 掼蛋规则引擎的无头自对战检查 (对照 HEAD 与工作区两份 guandan.html)。
   用法: node tools/simulate_guandan.js [局数]
   检查项: 牌张守恒、AI 出牌合法性(牌在手里/牌型成立/压得过上家)、一局能不能正常打完、
   以及百搭(逢人配)实际被用上的频率 —— 旧版 genMoves 完全不会用百搭组牌。 */
const fs = require('fs');
const vm = require('vm');
const cp = require('child_process');

const games = Math.max(1, Number(process.argv[2] || 100));

function sourceFrom(ref) {
  if (ref === 'HEAD') return cp.execFileSync('git', ['show', 'HEAD:guandan.html'], {encoding: 'utf8'});
  return fs.readFileSync('guandan.html', 'utf8');
}

function gameScript(html) {
  const blocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .filter(block => block.includes('function newGame'));
  if (blocks.length !== 1) throw new Error('Could not locate Guandan inline script');
  return blocks[0];
}

function fakeElement() {
  const element = {
    classList: {add() {}, remove() {}, toggle() {}},
    style: {}, dataset: {}, children: [],
    appendChild() {}, remove() {}, focus() {},
    querySelector() { return fakeElement(); },
    querySelectorAll() { return []; },
    addEventListener() {}, setAttribute() {}
  };
  return new Proxy(element, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'value' || key === 'textContent' || key === 'innerHTML') return '';
      if (key === 'length') return 0;
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; }
  });
}

function fakeAudioContext() {
  const node = () => ({
    connect() {}, start() {}, stop() {},
    frequency: {setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}},
    gain: {setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}},
    getChannelData() { return new Float32Array(1); },
    playbackRate: {value: 1}
  });
  return class {
    constructor() { this.destination = {}; }
    get currentTime() { return 0; }
    get sampleRate() { return 48000; }
    createOscillator() { return node(); }
    createGain() { return node(); }
    createBiquadFilter() { return node(); }
    createBufferSource() { return node(); }
    createBuffer() { return node(); }
  };
}

function makeContext(seed) {
  let state = seed >>> 0 || 1;
  const math = Object.create(Math);
  math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const document = {
    getElementById() { return fakeElement(); },
    createElement() { return fakeElement(); },
    querySelectorAll() { return []; },
    body: fakeElement(), documentElement: fakeElement()
  };
  const context = {
    console, Math: math, document,
    window: {open() {}, addEventListener() {}},
    localStorage: {getItem() { return null; }, setItem() {}},
    Audio: class { play() { return Promise.resolve(); } },
    AudioContext: fakeAudioContext(), webkitAudioContext: fakeAudioContext(),
    Theme: {get() { return 'A'; }, toggle() {}},
    Orient: {pref() { return 'auto'; }, cycle() {}},
    setTimeout() { return 0; }, clearTimeout() {}, requestAnimationFrame() {}
  };
  context.globalThis = context;
  return vm.createContext(context);
}

const driver = `
  step=()=>{}; renderAll=()=>{}; renderHand=()=>{}; updateButtons=()=>{}; showOverlay=()=>{};
  function simulateOne(){
    uid=0; teamLevels=[2,2]; aFails=[0,0]; gameOver=false; prevOrder=null;
    currentLevel = 2 + Math.floor(Math.random()*13);
    const deck=shuffle(makeDeck());
    const total=deck.length;
    players=[0,1,2,3].map(i=>({idx:i,hand:[],finished:false,lastShown:null}));
    deck.forEach((c,i)=>players[i%4].hand.push(c));
    players.forEach(p=>sortHand(p.hand));
    lastPlay=null; passed.clear(); finishedOrder=[]; selected.clear(); returnMode=null;
    currentPlayer=Math.floor(Math.random()*4);
    let turns=0, errors=0, info='', passes=0, plays=0, wildsPlayed=0, wildCombos=0, bombs=0, flushes=0;
    const seen=new Set();
    while(turns<4000){
      if(finishedOrder.length>=2 && team(finishedOrder[0].idx)===team(finishedOrder[1].idx)) break;
      const active=players.filter(p=>!p.finished);
      if(active.length<=1) break;
      if(players[currentPlayer].finished){ currentPlayer=nextActive(currentPlayer); turns++; continue; }
      const seat=currentPlayer, req=lastPlay?lastPlay.desc:null;
      const handIds=new Set(players[seat].hand.map(c=>c.id));
      const mv=aiMove(seat);
      if(mv){
        const ids=mv.cards.map(c=>c.id);
        if(new Set(ids).size!==ids.length){ errors++; info=info||'duplicate cards in play'; }
        if(ids.some(id=>!handIds.has(id))){ errors++; info=info||'played a card not in hand'; }
        const d=choosePlay(evaluateSelection(mv.cards,currentLevel), req);
        if(!d){ errors++; info=info||('illegal play: seat '+seat+' n='+mv.cards.length+' req='+(req?req.type+req.len+'@'+req.value:'-')); }
        ids.forEach(id=>{ if(seen.has(id)) { errors++; info=info||'card played twice'; } seen.add(id); });
        plays++; wildsPlayed+=mv.cards.filter(c=>isWild(c,currentLevel)).length;
        if(mv.cards.length>1 && mv.cards.some(c=>isWild(c,currentLevel))) wildCombos++;
        if(mv.desc.category==='bomb') bombs++;
        if(mv.desc.type==='straightflush') flushes++;
        applyPlay(seat,mv.cards,mv.desc);
      } else {
        if(!req){ errors++; info=info||'AI passed while holding the lead'; }
        passes++; applyPass(seat);
      }
      if(lastPlay){
        const others=players.filter(p=>!p.finished && p.idx!==lastPlay.player);
        if(others.every(p=>passed.has(p.idx))){
          let leader=lastPlay.player;
          if(players[leader].finished){ const mate=(leader+2)%4; leader=players[mate].finished?nextActive(leader):mate; }
          lastPlay=null; passed.clear(); players.forEach(p=>p.lastShown=null);
          currentPlayer=leader; turns++; continue;
        }
      }
      currentPlayer=nextActive(currentPlayer); turns++;
    }
    const remaining=players.reduce((n,p)=>n+p.hand.length,0);
    const conserved = remaining + seen.size === total;
    return {finished:finishedOrder.length>=2, errors, info, turns, plays, passes,
            wildsPlayed, wildCombos, bombs, flushes, remaining, conserved, stalled:turns>=4000};
  }
  this.__result=simulateOne();
`;

function runOne(ref, seed) {
  const context = makeContext(seed);
  new vm.Script(`${gameScript(sourceFrom(ref))}\n${driver}`, {filename: `guandan-${ref}.html`}).runInContext(context);
  return context.__result;
}

function summarize(ref) {
  const results = [];
  for (let i = 0; i < games; i++) results.push(runOne(ref, 0x9e3779b9 + i * 1013904223));
  const sum = key => results.reduce((total, r) => total + r[key], 0);
  return {
    ref, games,
    finishedRate: results.filter(r => r.finished).length / games,
    conservedRate: results.filter(r => r.conserved).length / games,
    stalled: results.filter(r => r.stalled).length,
    errors: sum('errors'),
    firstError: (results.find(r => r.info) || {}).info || '',
    playsAverage: sum('plays') / games,
    passesAverage: sum('passes') / games,
    wildsPlayedAverage: sum('wildsPlayed') / games,
    wildComboAverage: sum('wildCombos') / games,
    bombsAverage: sum('bombs') / games,
    straightFlushesAverage: sum('flushes') / games,
    remainingAverage: sum('remaining') / games
  };
}

console.log(JSON.stringify({baseline: summarize('HEAD'), current: summarize('WORKTREE')}, null, 2));
