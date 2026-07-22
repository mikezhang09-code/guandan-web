const fs = require('fs');
const vm = require('vm');
const cp = require('child_process');

const games = Math.max(1, Number(process.argv[2] || 100));

function sourceFrom(ref) {
  if (ref === 'HEAD') return cp.execFileSync('git', ['show', 'HEAD:shengji.html'], {encoding: 'utf8'});
  return fs.readFileSync('shengji.html', 'utf8');
}

function gameScript(html) {
  const blocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .filter(block => block.includes('function newGame'));
  if (blocks.length !== 1) throw new Error('Could not locate Shengji inline script');
  return blocks[0];
}

function fakeElement() {
  const element = {
    classList: {add() {}, remove() {}, toggle() {}},
    style: {},
    dataset: {},
    children: [],
    appendChild() {},
    remove() {},
    querySelector() { return fakeElement(); },
    querySelectorAll() { return []; },
    addEventListener() {},
    setAttribute() {},
    getBoundingClientRect() { return {width: 0, height: 0}; }
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
    connect() {},
    start() {},
    stop() {},
    setTargetAtTime() {},
    frequency: {setValueAtTime() {}},
    gain: {setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}},
    playbackRate: {value: 1}
  });
  return class {
    constructor() { this.destination = {}; }
    get currentTime() { return 0; }
    createOscillator() { return node(); }
    createGain() { return node(); }
    createBiquadFilter() { return node(); }
    createBufferSource() { return node(); }
    createBuffer() { return {}; }
  };
}

function makeContext(seed) {
  let state = seed >>> 0;
  const math = Object.create(Math);
  math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const document = {
    getElementById() { return fakeElement(); },
    createElement() { return fakeElement(); },
    querySelectorAll() { return []; },
    body: fakeElement(),
    documentElement: fakeElement()
  };
  const bPlay = fakeElement();
  const bHint = fakeElement();
  const bSort = fakeElement();
  const bHelp = fakeElement();
  const context = {
    console,
    Math: math,
    document,
    bPlay,
    bHint,
    bSort,
    bHelp,
    window: {open() {}, addEventListener() {}},
    localStorage: {getItem() { return null; }, setItem() {}},
    Audio: class { play() { return Promise.resolve(); } },
    AudioContext: fakeAudioContext(),
    webkitAudioContext: fakeAudioContext(),
    Theme: {get() { return 'A'; }, toggle() {}},
    Orient: {pref() { return 'auto'; }, cycle() {}},
    setTimeout() { return 0; },
    clearTimeout() {},
    requestAnimationFrame() {}
  };
  context.globalThis = context;
  return vm.createContext(context);
}

function runOne(ref, seed) {
  const context = makeContext(seed);
  const source = `${gameScript(sourceFrom(ref))}\n` + `
    takeTurn=()=>{};
    startPlay=()=>{};
    function simulateOne(){
      uid=0; teamLevels=[2,2]; level=2;
      declarerSeat=Math.floor(Math.random()*4); declarerTeam=team(declarerSeat);
      trumpSuit=SUITS[Math.floor(Math.random()*SUITS.length)]; buildSeq();
      gameOver=false;
      dealPile=shuffle(makeDeck());
      players=[0,1,2,3].map(i=>({idx:i,hand:[],lastShown:null}));
      for(let i=0;i<100;i++) players[i%4].hand.push(dealPile[i]);
      players.forEach(p=>sortHand(p.hand));
      kitty=dealPile.slice(100); players[declarerSeat].hand.push(...kitty);
      sortHand(players[declarerSeat].hand);
      teamPoints=[0,0]; playedCards=[];
      voidGroups=[0,1,2,3].map(()=>new Set());
      phase='play'; trick=[]; lastTrickInfo=null;
      const buryInput=players[declarerSeat].hand.slice();
      aiBury();
      const buryKeys={}; buryInput.forEach(card=>{ const key=card.joker?card.joker:card.suit+'_'+card.rank; buryKeys[key]=(buryKeys[key]||0)+1; });
      const keptKeys={}; players[declarerSeat].hand.forEach(card=>{ const key=card.joker?card.joker:card.suit+'_'+card.rank; keptKeys[key]=(keptKeys[key]||0)+1; });
      const buryBrokenPairs=Object.keys(buryKeys).filter(key=>buryKeys[key]>=2&&(keptKeys[key]||0)<2).length;
      const buryPoints=kitty.reduce((sum,card)=>sum+pts(card),0);
      const buryTrumps=kitty.filter(isTrump).length;
      let lead=declarerSeat, tricks=0, errors=0, errorInfo='', missedRuffs=0, missedBeats=0, pointsWon=[0,0];
      while(tricks<120 && players.some(p=>p.hand.length)){
        trick=[]; trickOrder=[lead,(lead+1)%4,(lead+2)%4,(lead+3)%4]; turnPos=0;
        for(let position=0;position<4;position++){
          turnPos=position;
          const seat=trickOrder[turnPos];
          let ruffOpportunity=false;
          let beatOpportunity=false;
          let canBeatCurrent=()=>false;
          if(turnPos>0 && trick[0].combo && trick[0].combo.group!=='T'){
            const leadGroup=trick[0].combo.group;
            const hasLead=players[seat].hand.some(card=>inGroup(card,leadGroup));
            const currentWinner=trickWinner();
            const currentCombo=trick.find(item=>item.seat===currentWinner)?.combo;
            const currentPoints=trick.reduce((sum,item)=>sum+item.cards.reduce((subtotal,card)=>subtotal+pts(card),0),0);
            canBeatCurrent=cards=>{
              const combo=detectCombo(cards); if(!combo||!currentCombo||combo.size!==currentCombo.size) return false;
              if(combo.group==='T'&&currentCombo.group!=='T') return true;
              return combo.group===currentCombo.group&&combo.topVal>currentCombo.topVal;
            };
            const groupCards=players[seat].hand.filter(card=>inGroup(card,leadGroup));
            const candidates=hasLead
              ? trick[0].combo.type==='single' ? groupCards.map(card=>[card])
                : trick[0].combo.type==='pair' ? groupPairs(groupCards)
                : tractorsOf(groupCards,trick[0].cards.length)
              : trick[0].combo.type==='single' ? players[seat].hand.filter(isTrump).map(card=>[card])
                : trick[0].combo.type==='pair' ? groupPairs(players[seat].hand.filter(isTrump))
                : tractorsOf(players[seat].hand.filter(isTrump),trick[0].cards.length);
            const canBeat=team(currentWinner)!==team(seat) && currentPoints>0 && candidates.some(canBeatCurrent);
            beatOpportunity=canBeat;
            ruffOpportunity=!hasLead && canBeat;
          }
          const cards=turnPos===0 ? aiLead(seat) : aiFollow(seat);
          if(!cards || !cards.length) { errors++; errorInfo='empty cards at seat '+seat+' hand '+players[seat].hand.length; continue; }
          if(cards.some(card=>!card)){ errors++; errorInfo='undefined card at seat '+seat+' position '+turnPos; continue; }
          if(turnPos===0){
            const combo=detectCombo(cards);
            if(!combo && !validateThrow(cards).ok) errors++;
          } else if(!validateFollow(cards,players[seat].hand,trick[0].combo).ok) {
            errors++; errorInfo=errorInfo||'illegal follow at seat '+seat+' lead size '+trick[0].cards.length+' cards '+cards.length;
          }
          if(ruffOpportunity && !cards.every(isTrump)) missedRuffs++;
          if(beatOpportunity && !canBeatCurrent(cards)) missedBeats++;
          commit(seat,cards);
        }
        turnPos=4;
        if(trick.length!==4){ errors++; errorInfo=errorInfo||'trick length '+trick.length; break; }
        const winner=trickWinner();
        let points=0; trick.forEach(t=>t.cards.forEach(c=>points+=pts(c)));
        pointsWon[team(winner)]+=points;
        lead=winner; tricks++;
      }
      const defenderTeam=1-declarerTeam;
      return {completed:players.every(p=>p.hand.length===0),errors,errorInfo,tricks,missedRuffs,missedBeats,buryPoints,buryTrumps,buryBrokenPairs,points:pointsWon,remaining:players.reduce((n,p)=>n+p.hand.length,0),hands:players.map(p=>p.hand.length),declarerTeam,defenderPoints:pointsWon[defenderTeam],declarerPoints:pointsWon[declarerTeam]};
    }
    this.__simulationResult=simulateOne();
  `;
  new vm.Script(source, {filename: `shengji-${ref}.html`}).runInContext(context);
  return context.__simulationResult;
}

function summarize(ref) {
  const results=[];
  for(let i=0;i<games;i++) results.push(runOne(ref, 0x9e3779b9 + i * 1013904223));
  const completed=results.filter(result=>result.completed).length;
  const errors=results.reduce((sum,result)=>sum+result.errors,0);
  const tricks=results.reduce((sum,result)=>sum+result.tricks,0);
  const remaining=results.reduce((sum,result)=>sum+result.remaining,0);
  const points=results.reduce((sum,result)=>[sum[0]+result.points[0],sum[1]+result.points[1]],[0,0]);
  const defenderPoints=results.reduce((sum,result)=>sum+result.defenderPoints,0);
  const declarerPoints=results.reduce((sum,result)=>sum+result.declarerPoints,0);
  const missedRuffs=results.reduce((sum,result)=>sum+result.missedRuffs,0);
  const missedBeats=results.reduce((sum,result)=>sum+result.missedBeats,0);
  const buryPoints=results.reduce((sum,result)=>sum+result.buryPoints,0);
  const buryTrumps=results.reduce((sum,result)=>sum+result.buryTrumps,0);
  const buryBrokenPairs=results.reduce((sum,result)=>sum+result.buryBrokenPairs,0);
  const defenderBelow80=results.filter(result=>result.defenderPoints<80).length;
  return {ref,games,completed,completionRate:completed/games,errors,missedRuffs,missedRuffsAverage:missedRuffs/games,missedBeats,missedBeatsAverage:missedBeats/games,buryPointsAverage:buryPoints/games,buryTrumpsAverage:buryTrumps/games,buryBrokenPairsAverage:buryBrokenPairs/games,firstError:results.find(result=>result.errorInfo)?.errorInfo||'',firstHands:results.find(result=>result.errorInfo)?.hands||[],tricksAverage:tricks/games,remainingAverage:remaining/games,pointsAverage:points.map(value=>value/games),declarerPointsAverage:declarerPoints/games,defenderPointsAverage:defenderPoints/games,defenderBelow80Rate:defenderBelow80/games};
}

console.log(JSON.stringify({baseline:summarize('HEAD'),current:summarize('WORKTREE')}, null, 2));
