// ==UserScript==
// @name         Verter_v0.4.0
// @description  Auto-trade + Signals (EMA3/9, EMA9/15, SQZ) + CLOSE via legacy Trades observer (guard+dedupe) + BalanceStable(2s) + DockBox (+50%) + Stats (Wager on DOM close) + One-At-A-Time Gate + PCS-8 v3.1 (Colon-Zero Lock) + Cycles history UI
// @version      0.4.0
// @match        https://pocketoption.com/*
// @run-at       document-idle
// ==/UserScript==

// ===== Build Meta =====
const APP = Object.freeze({
  NAME: 'Verter_M1_BALRES',
  VERSION: '0.4.0',
  FLAVOR: 'MG_from_app5_CAN_CHS'
});
const VER = '0.4.0';
const BUILD_NAME = `${APP.NAME}_v${APP.VERSION}${APP.FLAVOR ? '_(' + APP.FLAVOR + ')' : ''}`;

// Boot banner
try{ console.log('[VERTER][BOOT] v'+VER, BUILD_NAME); }catch(e){}
try{ if(typeof DockBox!=='undefined' && DockBox?.setTitle){ DockBox.setTitle('Verter v'+VER); } }catch(e){}


// ===== Pause Controller =====
var PauseCtl=(function(){
  const KEY='verter.pause.v1';
  let cfg={autoOnLosses:3, durationMin:3, manualDurationMin:5};
  let st={until:0, lossStreak:0};

  try{ const saved=JSON.parse(localStorage.getItem(KEY)||'null'); if(saved) cfg={...cfg, ...saved}; }catch(e){}
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(cfg)); }catch(e){} }

  function now(){ return Date.now(); }
  function _updateMode(){
    try{
      if(typeof DockBox!=='undefined' && DockBox?.setMode){
        if(st.until && now()<st.until){
          const ms=remainingMs(); const m=Math.floor(ms/60000), s=Math.floor((ms%60000)/1000);
          DockBox.setMode('PAUSE '+m+'m '+(s<10?'0':'')+s+'s');
        }else{
          DockBox.setMode('IDLE');
        }
      }
    }catch(e){}
  }
  function isActive(){
    if(st.until && now()<st.until){ _updateMode(); return true; }
    if(st.until && now()>=st.until){ st.until=0; _updateMode(); }
    return st.until>0 && now()<st.until;
  }
  function remainingMs(){ return st.until>0 ? Math.max(0, st.until-now()) : 0; }
  function remainingFmt(){
    const ms=remainingMs(); const m=Math.floor(ms/60000), s=Math.floor((ms%60000)/1000);
    return (m+'m '+(s<10?'0':'')+s+'s');
  }
  function start(min, reason){
    const dur = Math.max(1, Math.floor(min||cfg.durationMin));
    st.until = now() + dur*60000;
    _updateMode();
    try{ console.log('[PAUSE] start '+dur+'m, reason='+ (reason||'manual') +', until=', new Date(st.until).toLocaleTimeString()); }catch(e){}
  }
  function startAuto(){ start(cfg.durationMin, '3-losses'); st.lossStreak = 0; }
  function noteResult(type){
    if(type==='LOSS'){ st.lossStreak++; }
    else if(type==='WIN'){ st.lossStreak=0; }
    if(st.lossStreak>=cfg.autoOnLosses){ startAuto(); }
  }
  function setAutoLosses(n){ cfg.autoOnLosses=Math.max(1, +n|0); save(); }
  function setDurationMin(n){ cfg.durationMin=Math.max(1, +n|0); save(); }
  function setManualDurationMin(n){ cfg.manualDurationMin=Math.max(1, +n|0); save(); }
  document.addEventListener('keydown', function(e){
    if(!e.altKey) return;
    if(e.key==='p' || e.key==='P'){
      const v = prompt('Минуты для автопаузы после '+cfg.autoOnLosses+' LOSS подряд:', String(cfg.durationMin));
      if(v!=null){ setDurationMin(v); try{ console.log('[PAUSE] auto duration set to', cfg.durationMin, 'min'); }catch(e){} }
    }
    if(e.key==='o' || e.key==='O'){ start(cfg.manualDurationMin, 'manual'); }
  });
  return { isActive, remainingFmt, start, startAuto, noteResult,
           setAutoLosses, setDurationMin, setManualDurationMin, cfg, state:()=>st };
})();


(function () {
  if (window.__verterBoot) { console.log('[VERTER] already armed'); return; }
  window.__verterBoot = true;

  /* VER moved to APP.VERSION */
  const DEBUG = false;

  // [BEGIN BLOCK:CYCLES:STATE]
  let vx_cyclesHistoryDiv = null;
  let vx_maxStepLabel = null;
  function vx_makeCycleTile(status, profit, maxStep, ts){
    const el = document.createElement('div');
    el.className = 'vx-cycle ' + (status==='win'?'vx-win':'vx-lose');
    el.title = `[${status}] profit=${profit} maxStep=${maxStep} @${new Date(ts).toLocaleString()}`;
    el.textContent = `${status.toUpperCase()} • P=${profit} • S=${maxStep}`;
    return el;
  }
  // /* [END BLOCK:CYCLES:STATE] */

  // [BEGIN BLOCK:CYCLES:UI]
  function vx_cyclesUiBoot(){
    if (document.getElementById('vx-cycles-root')) return;
    const root = document.createElement('div');
    root.id = 'vx-cycles-root';
    Object.assign(root.style, {position:'fixed', right:'8px', bottom:'8px', zIndex:'2147483647',
      font:'12px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial', padding:'8px',
      background:'rgba(0,0,0,0.6)', color:'#fff', borderRadius:'6px', maxWidth:'280px'});
    root.innerHTML = `
      <div style="margin-bottom:6px;opacity:.9">Verter_v0.4.0 • Cycles</div>
      <div style="margin-bottom:6px">Max Step in Cycle: <span id="vx-maxstep">0</span></div>
      <div>Cycles history:</div>
      <div id="vx-cycles-history" style="display:flex;flex-direction:column;gap:4px;margin-top:4px;"></div>
      <style>
        #vx-cycles-root .vx-cycle{padding:4px 6px;border-radius:4px}
        #vx-cycles-root .vx-win{background:rgba(46,204,113,.25)}
        #vx-cycles-root .vx-lose{background:rgba(231,76,60,.25)}
      </style>
    `;
    document.body.appendChild(root);
    vx_cyclesHistoryDiv = root.querySelector('#vx-cycles-history');
    vx_maxStepLabel = root.querySelector('#vx-maxstep');
  }
  // /* [END BLOCK:CYCLES:UI] */

  // [BEGIN BLOCK:CYCLES:RENDER]
  function vx_renderCycleEnd(status){
    try{
      const ss = (typeof SessionStats!=='undefined' && SessionStats && SessionStats.get && SessionStats.get()) || null;
      const last = ss && Array.isArray(ss.cycles) && ss.cycles.length ? ss.cycles[ss.cycles.length-1] : null;
      if (!vx_cyclesHistoryDiv || !last) return;
      const tile = vx_makeCycleTile(status, last && (last.profit??last.pnl??0), last && (last.maxStep??0), Date.now());
      vx_cyclesHistoryDiv.prepend(tile);
    }catch(e){}
  }
  // /* [END BLOCK:CYCLES:RENDER] */

  // ===== Utils =====
  function now(){ return Date.now(); }
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function r2(x){ return Math.round(x*100)/100; }
  function fmt2(x){ return (x==null||isNaN(x))?'—':(+x).toFixed(2); }
  function normMoney(s){
    if(!s) return null;
    s=String(s).replace(/[\s\u00A0]/g,'').replace(/[A-Za-z$€£¥₽₴₺₹₩₦฿₿]/g,'').replace(/[^0-9,.\-]/g,'');
    if(/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) s=s.replace(/,/g,'');
    else if(/^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(s)){ s=s.replace(/\./g,'').replace(/,/g,'.'); }
    else { var c=(s.match(/,/g)||[]).length,d=(s.match(/\./g)||[]).length; if(c&&!d){ var last=s.split(',').pop(); s=(last.length===3)?s.replace(/,/g,''):s.replace(/,/g,'.'); } }
    var n=parseFloat(s); return isNaN(n)?null:r2(n);
  }

  // ===== SessionStats =====
  var SessionStats=(function(){
    var s={startTime:null,startBalance:null,lastBalance:null,tradesTotal:0,wins:0,losses:0,returns:0,
           volumeTotal:0,volumeByType:{WIN:0,LOSS:0,RET:0},profitTotal:0,cycles:[]};
    function ensureInit(v){ if(s.startBalance==null && v!=null){ s.startBalance=v; s.startTime=Date.now(); } }
    function onBalance(v){ if(v==null) return; ensureInit(v); s.lastBalance=v;
      if(s.startBalance!=null && s.lastBalance!=null) s.profitTotal=r2(s.lastBalance-s.startBalance); }
    function onClose(type, pnl, finalBal, amount){
      if(type==='WIN') s.wins++; else if(type==='LOSS') s.losses++; else if(type==='RET') s.returns++;
      s.tradesTotal++;
      if(amount!=null) s.volumeTotal=r2(s.volumeTotal+amount);
      if(type&&amount!=null) s.volumeByType[type]=r2((s.volumeByType[type]||0)+amount);
      if(finalBal!=null) s.lastBalance=finalBal;
      if(s.startBalance!=null && s.lastBalance!=null) s.profitTotal=r2(s.lastBalance-s.startBalance);
    }
    function snapshot(){
      var winPct=s.tradesTotal? Math.round((s.wins/s.tradesTotal*1000))/10:0;
      return { ...s, winPct };
    }
    return { onBalance,onClose,snapshot,get:()=>s };
  })();

  // ===== Balance feeder + Stable(2s) =====
  var Balance=(function(){
    var target=null;
    function find(){
      return document.querySelector('.balance-info-block__balance .js-balance-demo')
          || document.querySelector('span.js-balance-demo')
          || document.querySelector('[class*="balance"] [class*="js-balance"]')
          || document.body;
    }
    function read(){
      var raw=(target && (target.textContent||target.getAttribute?.('data-hd-show'))) || '';
      return normMoney(raw);
    }
    function boot(){
      target=find();
      if(!target || target===document.body){ console.warn('[BAL] target not found'); return; }
      var obs=new MutationObserver(()=>BalanceStable.feed());
      obs.observe(target,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-hd-show']});
      setTimeout(()=>{ try{BalanceStable.feed();}catch(e){} },0);
      console.log('[BAL][BOOT] feeder→2s stable');
      return ()=>{ try{obs.disconnect();}catch(e){} };
    }
    return { boot, read, getTarget:()=>target };
  })();

  var BalanceStable=(function(){
    var t=null, stable=null, cbs=[];
    function feed(){ if(t) return; t=setTimeout(function(){ t=null; var v=null; try{ v=Balance.read(); }catch(e){} if(v==null) return;
      var prev=stable; stable=v;
      try{
        SessionStats.onBalance(stable);
        if(prev!=null && prev!==stable){ console.log('[BAL][COMMIT]', prev.toFixed(2),'→',stable.toFixed(2)); }
        else if(prev==null){ console.log('[BAL][COMMIT]', stable.toFixed(2)); }
      }catch(e){}
      for(var i=0;i<cbs.length;i++){ try{ cbs[i](stable, Date.now()); }catch(_e){} }
    },2000); }
    function onStable(cb){ if(typeof cb==='function') cbs.push(cb); }
    function getStable(){ return stable; }
    return { feed, onStable, getStable };
  })();

  // ===== Tick source (tooltip probe) =====
  var tickSource=(function(){
    function readTooltip(){
      var rx=/(\d+\.\d{3,6})/g, roots=document.querySelectorAll('[role="tooltip"],[class*="tooltip"],[class*="tippy"],[class*="popper"]'), cand=[];
      for(var i=0;i<roots.length;i++){ var t=roots[i].textContent||''; var m; while((m=rx.exec(t))){ var v=parseFloat(m[1]); if(isFinite(v)) cand.push(v); } }
      if(!cand.length) return null;
      for(var j=cand.length-1;j>=0;j--){ var v=cand[j]; if(v>0.0001 && v<100000) return v; }
      return null;
    }
    function subscribe(cb, period){
      var last=null;
      var iv=setInterval(function(){ 
    if(PauseCtl && PauseCtl.isActive()){ try{ if(typeof DockBox!=='undefined' && DockBox?.setMode){ DockBox.setMode('PAUSE '+PauseCtl.remainingFmt()); } }catch(e){} return; }
try{ var p=readTooltip(); if(p==null) return; if(last===null || p!==last){ last=p; cb(p, Date.now()); } }catch(e){} }, Math.max(100,period|0));
      return function(){ clearInterval(iv); };
    }
    return { subscribe };
  })();

  // ===== DockBox (панель+график, +50%, drag) =====
  var DockBox=(function(){
    var state={ticks:[],candlesM1:[],cur:null};
    var box=document.createElement('div');
    box.style.cssText='position:fixed;z-index:999999;right:12px;bottom:12px;width:960px;height:420px;background:#111;color:#ddd;font:13px monospace;border:1px solid #333;border-radius:6px;display:flex;flex-direction:column;user-select:none';
    var bar=document.createElement('div'); bar.className='verter-dock-header';
    bar.style.cssText='padding:6px 8px;border-bottom:1px solid #222;display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:move;flex-wrap:wrap';
    var left=document.createElement('div'); left.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    var right=document.createElement('div'); right.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    bar.appendChild(left); bar.appendChild(right);
    var cv=document.createElement('canvas'); cv.style.flex='1'; cv.style.display='block';
    box.appendChild(bar); box.appendChild(cv); document.body.appendChild(box);
    var ctx=cv.getContext('2d');

    (function restorePos(){
      try{
        const s = JSON.parse(localStorage.getItem('verter.dock.pos')||'null');
        if(s && typeof s.left==='number' && typeof s.top==='number'){
          box.style.right = box.style.bottom = '';
          box.style.left = s.left+'px'; box.style.top  = s.top +'px';
        }
      }catch(e){}
    })();
    (function makeDraggable(){
      let dragging=false, sx=0, sy=0, bx=0, by=0;
      function onDown(e){
        dragging=true;
        const r = box.getBoundingClientRect();
        sx=e.clientX; sy=e.clientY; bx=r.left; by=r.top;
        box.style.right = box.style.bottom = '';
        box.style.left  = bx+'px'; box.style.top = by+'px';
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp, {once:true});
        e.preventDefault();
      }
      function onMove(e){
        if(!dragging) return;
        const dx=e.clientX-sx, dy=e.clientY-sy;
        const vw=window.innerWidth, vh=window.innerHeight;
        const rect=box.getBoundingClientRect(), w=rect.width, h=rect.height;
        const nx=clamp(bx+dx,0,vw-w), ny=clamp(by+dy,0,vh-h);
        box.style.left=nx+'px'; box.style.top=ny+'px';
      }
      function onUp(){
        dragging=false;
        try{
          const r=box.getBoundingClientRect();
          localStorage.setItem('verter.dock.pos', JSON.stringify({left:Math.round(r.left), top:Math.round(r.top)}));
        }catch(e){}
        window.removeEventListener('mousemove', onMove);
      }
      bar.addEventListener('mousedown', onDown);
    })();
    document.addEventListener('keydown', function(e){
      if(e.altKey && (e.key==='i'||e.key==='I')){ box.style.display = (box.style.display==='none')?'flex':'none'; }
      if(e.altKey && (e.key==='r'||e.key==='R')){
        localStorage.removeItem('verter.dock.pos');
        box.style.left = box.style.top = ''; box.style.right = '12px'; box.style.bottom = '12px';
      }
    });

    function fit(){
      var r=box.getBoundingClientRect(), head=bar.getBoundingClientRect().height|0;
      var w=Math.max(480,(r.width|0)), h=Math.max(240,((r.height-head)|0));
      if(cv.width!==w || cv.height!==h){ cv.width=w; cv.height=h; }
    }
    window.addEventListener('resize', function(){ fit(); schedule(); });
    fit();

    function onTick(p,ts){
      var t=ts||Date.now();
      state.ticks.push({t:t,p:p}); if(state.ticks.length>5000) state.ticks=state.ticks.slice(-5000);
      var mKey=Math.floor(t/60000);
      if(!state.cur||state.cur.mKey!==mKey){
        if(state.cur){
          state.cur.C=state.cur.lastP;
          state.candlesM1.push({tOpen:state.cur.tOpen,O:state.cur.O,H:state.cur.H,L:state.cur.L,C:state.cur.C});
          if(state.candlesM1.length>600) state.candlesM1=state.candlesM1.slice(-600);
          console.log('[M1][CLOSE]', new Date(state.cur.tOpen).toISOString(), state.cur);
        }
        state.cur={mKey:mKey,tOpen:mKey*60000,O:p,H:p,L:p,C:p,lastP:p};
      }else{
        if(p>state.cur.H) state.cur.H=p;
        if(p<state.cur.L) state.cur.L=p;
        state.cur.lastP=p;
      }
      schedule(); renderHeader();
    }

    var raf=0,need=false; function schedule(){ if(need) return; need=true; raf=requestAnimationFrame(function(){ need=false; draw(); }); }
    function draw(){
      fit(); var W=cv.width,H=cv.height;
      var data=state.candlesM1.slice(-120); if(state.cur) data=data.concat([{O:state.cur.O,H:state.cur.H,L:state.cur.L,C:state.cur.lastP}]);
      ctx.clearRect(0,0,W,H); if(!data.length) return;
      var hi=-1e9,lo=1e9; for(var i=0;i<data.length;i++){ hi=Math.max(hi,data[i].H); lo=Math.min(lo,data[i].L); }
      var span=(hi-lo)||1;
      ctx.globalAlpha=.25; ctx.strokeStyle='#666'; ctx.lineWidth=1;
      for(var g=1;g<4;g++){ var y=(H/4*g)|0; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
      ctx.globalAlpha=1; var n=data.length,bw=Math.max(3,Math.floor(W/n)-3),gap=2; ctx.lineWidth=1; ctx.strokeStyle='#bbb';
      for(var j=0;j<n;j++){
        var c=data[j],x=j*(bw+gap)+1;
        var yH=H-((c.H-lo)/span*H),yL=H-((c.L-lo)/span*H),yO=H-((c.O-lo)/span*H),yC=H-((c.C-lo)/span*H);
        ctx.beginPath(); ctx.moveTo(x+bw/2,yH); ctx.lineTo(x+bw/2,yL); ctx.stroke();
        var yTop=Math.min(yO,yC),yBot=Math.max(yO,yC),live=(j===n-1&&!!state.cur);
        ctx.fillStyle=(c.C>=c.O)?(live?'rgba(46,139,87,.7)':'#2e8b57'):(live?'rgba(170,58,58,.7)':'#aa3a3a');
        ctx.fillRect(x,yTop,bw,Math.max(1,yBot-yTop));
      }
    }

    var modeText='IDLE';
    var sigStats={ready:{E39:0,E915:0,SQZ:0}, need:{E39:9,E915:15,SQZ:20}, hits:{E39:0,E915:0,SQZ:0}};
    function setMode(t){ modeText=t||modeText; renderHeader(); }
    function setSigReady(name,have){ sigStats.ready[name]=have; renderHeader(); }
    function incSigHit(name){ sigStats.hits[name]=(sigStats.hits[name]||0)+1; renderHeader(); }

    function renderHeader(){
      var ss=SessionStats.get();
      left.innerHTML =
        'Start: ' + (ss.startTime? new Date(ss.startTime).toLocaleTimeString():'—') +
        ' | Bal: ' + fmt2(ss.startBalance) + ' → ' + fmt2(ss.lastBalance) +
        ' | P/L: ' + fmt2(ss.profitTotal) +
        ' | Wager: ' + fmt2(ss.volumeTotal) +
        ' | Trades: ' + ss.tradesTotal + ' (W/L/R ' + ss.wins + '/' + ss.losses + '/' + ss.returns + ')' +
        ' | Win%: ' + (ss.tradesTotal? (ss.wins/ss.tradesTotal*100).toFixed(1):'0.0'); // keep concise

      right.innerHTML =
        'Signals: '+
        'E3/9 ['+sigStats.ready.E39+'/'+sigStats.need.E39+', hits '+(sigStats.hits.E39||0)+'] | '+
        'E9/15 ['+sigStats.ready.E915+'/'+sigStats.need.E915+', hits '+(sigStats.hits.E915||0)+'] | '+
        'SQZ ['+sigStats.ready.SQZ+'/'+sigStats.need.SQZ+', hits '+(sigStats.hits.SQZ||0)+']'+
        ' | Mode: <b>'+modeText+'</b>'+
        ' | Verter v'+VER;
    }

    var unsubscribe=tickSource.subscribe(function(p,ts){ onTick(p,ts); },200);
    function stop(){ try{unsubscribe&&unsubscribe();}catch(e){} try{cancelAnimationFrame(raf);}catch(e){} const r = box.getBoundingClientRect(); return {pos:{left:r.left,top:r.top}}; }

    console.log('[VERTER][BOOT] DockBox (chart+panel, drag) v'+VER);
    return { stop, getState:function(){return state;}, setMode, setSigReady, incSigHit };
  })();

  // ===== Signals (EMA3/9, EMA9/15, TTM Squeeze) =====
  var SignalEngine=(function(){
    var lastSqzOn=null;
    function ema(arr,period){ if(arr.length<period) return []; var k=2/(period+1), out=[], prev=arr[0];
      for(var i=0;i<arr.length;i++){ prev=(i===0)?arr[i]:(arr[i]*k + prev*(1-k)); out.push(prev); } return out; }
    function sma(arr,len){ if(arr.length<len) return []; var out=[], sum=0; for(var i=0;i<arr.length;i++){ sum+=arr[i]; if(i>=len) sum-=arr[i-len]; if(i>=len-1) out.push(sum/len); } return out; }
    function stdev(arr,len){
      if(arr.length<len) return []; var out=[], q=[], sum=0;
      for(var i=0;i<arr.length;i++){ q.push(arr[i]); sum+=arr[i]; if(q.length>len) sum-=q.shift();
        if(q.length===len){ var mean=sum/len, s=0; for(var k=0;k<q.length;k++) s+=(q[k]-mean)*(q[k]-mean); out.push(Math.sqrt(s/len)); } }
      return out;
    }
    function atr(candles,len){ if(candles.length<2) return 0; var n=Math.min(len, candles.length-1), sum=0, prevC=candles[candles.length-n-1].C;
      for(var i=candles.length-n;i<candles.length;i++){ var c=candles[i], tr=Math.max(c.H-c.L, Math.abs(c.H-prevC), Math.abs(c.L-prevC)); sum+=tr; prevC=c.C; }
      return sum/Math.max(1,n);
    }
    function linregSlope(arr,len){
      if(arr.length<len) return 0; var a=arr.slice(-len), n=a.length, sx=0, sy=0, sxx=0, sxy=0;
      for(var i=0;i<n;i++){ var x=i+1,y=a[i]; sx+=x; sy+=y; sxx+=x*x; sxy+=x*y; }
      var denom = n*sxx - sx*sx; if(denom===0) return 0;
      return (n*sxy - sx*sy)/denom;
    }
    function evalAll(){
      var st=DockBox.getState(); var data=st.candlesM1.slice(-120);
      if(st.cur) data=data.concat([{O:st.cur.O,H:st.cur.H,L:st.cur.L,C:st.cur.lastP}]);
      if(!data.length) return {best:null, logs:[]};
      var closes=data.map(function(c){return c.C;});

      DockBox.setSigReady('E39', Math.min(closes.length, 9));
      DockBox.setSigReady('E915', Math.min(closes.length, 15));
      DockBox.setSigReady('SQZ', Math.min(closes.length, 20));

      var okE39=null, okE915=null, sqz=null;
      if(closes.length>=9){
        var e3=ema(closes,3), e9=ema(closes,9);
        if(e3[e3.length-1]>e9[e9.length-1]) okE39={side:'BUY',src:'E39'};
        else if(e3[e3.length-1]<e9[e9.length-1]) okE39={side:'SELL',src:'E39'};
      }
      if(closes.length>=15){
        var eF=ema(closes,9), eS=ema(closes,15);
        if(eF[eF.length-1]>eS[eS.length-1]) okE915={side:'BUY',src:'E915'};
        else if(eF[eF.length-1]<eS[eS.length-1]) okE915={side:'SELL',src:'E915'};
      }
      if(closes.length>=20){
        var len=20, sma20=sma(closes,len), std20=stdev(closes,len);
        if(sma20.length && std20.length){
          var m=sma20[sma20.length-1], sd=std20[sma20.length-1];
          var upperBB = m + 2.0*sd, lowerBB = m - 2.0*sd;
          var atr20 = atr(data.slice(-len), len);
          var rangeKC = 1.5*atr20;
          var upperKC = m + rangeKC, lowerKC = m - rangeKC;
          var on = (upperBB - lowerBB) < (upperKC - lowerKC);
          var slope = linregSlope(closes, len);
          if(lastSqzOn===null) lastSqzOn=on;
          if(lastSqzOn===true && on===false){
            var side = slope>0 ? 'BUY' : (slope<0 ? 'SELL' : null);
            if(side){ sqz={side:side,src:'SQZ'}; }
          }
          lastSqzOn=on;
        }
      }
      var pick = sqz || okE915 || okE39 || null;
      if(pick){ DockBox.incSigHit(pick.src); }
      return {best:pick, logs:[]};
    }
    return { evalAll };
  })();

  // ===== Hotkey Driver (Shift+W/S only) =====
  var HotkeyDriver=(function(){
    function hotkey(side){
      try{
        var keyCode = side==='BUY' ? 87 : 83; // W / S
        var ev = new KeyboardEvent('keyup', { keyCode:keyCode, which:keyCode, key:(side==='BUY'?'w':'s'), shiftKey:true, bubbles:true, cancelable:true });
        return document.dispatchEvent(ev);
      }catch(e){ return false; }
    }
    function trade(side){ try{ document.body.click(); }catch(e){} return hotkey(side); }
    return { trade };
  })();

  // ===== Stake reader =====
  function readStake(){
    var cand = document.querySelector('input[type="text"][inputmode="decimal"], input[type="number"], input[name*="amount"], [class*="deal-amount"] input');
    var v=null; if(cand){ v = normMoney(cand.value || cand.getAttribute('value') || cand.getAttribute('placeholder')); }
    if(v==null){ var n = document.querySelector('[class*="amount"], [class*="stake"], [class*="sum"]'); v = normMoney(n && n.textContent); }
    return v!=null?v:null;
  }

  // ===== Trade gate: одна ставка за раз =====
  var TradeGate = { busy:false, tOpen:0 };
  setInterval(function(){
    if (TradeGate.busy && Date.now()-TradeGate.tOpen > 120000){
      console.warn('[TRADE][GUARD] force-unlock after 120s without DOM close');
      TradeGate.busy=false; TradeGate.tOpen=0; DockBox.setMode('IDLE');
    }
  }, 5000);

  // ===== Legacy Trades Observer (logic unchanged; added guards+dedupe only) =====
  window.betHistory = window.betHistory || [];
  (function bootLegacyObserver(){
    let targetDiv = document.getElementsByClassName("scrollbar-container deals-list ps")[0];
    if(!targetDiv){
      console.warn('[TRADES] legacy target not found at boot; will retry');
      let tries=0; let iv=setInterval(function(){
        targetDiv = document.getElementsByClassName("scrollbar-container deals-list ps")[0];
        if(targetDiv || ++tries>60){ clearInterval(iv); if(targetDiv) attach(targetDiv); }
      },1000);
    } else attach(targetDiv);

    function attach(target){
      const recent = new Set();
      function remember(key){
        recent.add(key);
        if(recent.size>32){ const it=recent.values(); recent.delete(it.next().value); }
      }
      let observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          if(!mutation.addedNodes || !mutation.addedNodes.length) return;
          const node = mutation.addedNodes[0];
          if(!node || node.nodeType!==1) return; // only ELEMENT_NODE

          // антидубль по содержимому строки
          const key = (node.textContent||'').slice(0,256);
          if(key && recent.has(key)) return;

          try{
            // ОРИГИНАЛЬНАЯ ЛОГИКА: читаем два индикатора price-up
            function hasClass(element, className) {
              return !!(element && element.classList && element.classList.contains(className));
            }
            // строго тот же путь в DOM, но под try/catch
            let newDeal = node;
            let centerDiv = newDeal.childNodes[0].children[0].children[1].children[1];
            let lastDiv   = newDeal.childNodes[0].children[0].children[1].children[2];

            let centerUp = hasClass(centerDiv, 'price-up');
            let lastUp   = hasClass(lastDiv,   'price-up');

            let tradeStatus;
            if (centerUp && lastUp) tradeStatus = 'won';
            else if (centerUp && !lastUp) tradeStatus = 'returned';
            else tradeStatus = 'lost';

            if (window.betHistory.length > 0){
              // перехват setter'а произойдёт в TradeBridge.arm()
              window.betHistory[window.betHistory.length - 1].won = tradeStatus;
            }
            console.log('Bet status: ',tradeStatus);
            remember(key);
          }catch(e){
            if(DEBUG) console.warn('[TRADES][PARSE][SKIP]', e&&e.message);
          }
        });
      });
      observer.observe(target, { childList:true });
      console.log('[TRADES][BOOT] legacy observer attached');
    }
  })();

  // ===== Bridge: перехват присвоения .won для подсчётов =====
  var TradeBridge=(function(){
    var pending=null; // {side, amount, tOpen, pre}
    function arm(side, amount){
      const rec = {};
      Object.defineProperty(rec,'won',{
        set:function(v){
          var type = v==='won'?'WIN':(v==='lost'?'LOSS':'RET');
          try{ PauseCtl.noteResult(type); }catch(e){}
var bal = BalanceStable.getStable() || Balance.read() || null;
          console.log('[TRADES][CLOSED][DOM]', type, 'amt=', fmt2(pending&&pending.amount||amount));
          try{ SessionStats.onClose(type, null, bal, pending&&pending.amount||amount); 
          // ===== MARTINGALE INTEGRATION (app5) :: step update + cycle check =====
          if (typeof MARTIN_ENABLED!=='undefined' && MARTIN_ENABLED){
            try{ CycleAcc.trades++; }catch(e){}
            if(type==='WIN'){ try{ CycleAcc.won++; }catch(e){} try{ currentBetStep = 0; }catch(e){} }
            else if(type==='LOSS'){ try{ CycleAcc.loss++; }catch(e){} try{ currentBetStep = Math.min(currentBetStep+1, betArray.length-1); }catch(e){} }
            else { try{ CycleAcc.ret++; }catch(e){} }
            try{
              if(currentBetStep>maxStepInCycle){ maxStepInCycle=currentBetStep; }
              if(CycleAcc.maxStep<maxStepInCycle){ CycleAcc.maxStep=maxStepInCycle; }
              var ss=SessionStats.snapshot();
              var nextBet = getBetValue(currentBetStep);
              if(typeof ss.profitTotal==='number'){
                if(ss.profitTotal>limitWin){ cycleEnd('win'); }
                else if(ss.profitTotal - nextBet < limitLoss){ cycleEnd('lose'); }
              }
            }catch(e){}
          }
}catch(e){}
          pending=null;
          TradeGate.busy=false; TradeGate.tOpen=0;
          DockBox.setMode('IDLE');
          var ss=SessionStats.snapshot();
          console.log('[SES] trades='+ss.tradesTotal+' W/L/R='+ss.wins+'/'+ss.losses+'/'+ss.returns+' Wager='+fmt2(ss.volumeTotal)+' P/L='+fmt2(ss.profitTotal));
        },
        enumerable:true, configurable:true
      });
      window.betHistory.push(rec);
      pending = { side: side, amount: amount, tOpen: now(), pre: BalanceStable.getStable()||Balance.read()||null };
    }
    return { arm };
  })();

  // ===== TradeController (без дедлайна; ждём DOM; семафор) =====
  (function(){
    if(!Balance.getTarget()){ Balance.boot(); }
    var st={mode:'IDLE'};
    setInterval(function(){
      if(st.mode!=='IDLE') return;
      if(TradeGate.busy) return;

      var res=SignalEngine.evalAll(); 
if(!res || !res.best) return; 
var side=res.best.side, amount=readStake();

if(typeof MARTIN_ENABLED==='undefined' || !MARTIN_ENABLED){
  TradeGate.busy=true; TradeGate.tOpen=Date.now(); DockBox.setMode('OPENED');
  if(DEBUG) console.log('[TRG]['+side+'] amt='+fmt2(amount));
  TradeBridge.arm(side, amount);
  var sent = HotkeyDriver.trade(side);
  if(!sent) console.warn('[OPEN][WARN] hotkey not delivered');
} else {
  try{
    var ss=SessionStats.snapshot();
    var betVal = getBetValue(currentBetStep);
    if(typeof ss.profitTotal==='number'){
      if(ss.profitTotal>limitWin){ cycleEnd('win'); }
      else if(ss.profitTotal - betVal < limitLoss){ cycleEnd('lose'); }
    }
  } catch(e){}
  TradeGate.busy=true; TradeGate.tOpen=Date.now(); DockBox.setMode('OPENED');
  if(DEBUG) console.log('[TRG]['+side+'] step='+currentBetStep+' bet='+betVal+' array='+currentBetArrayId);
  TradeBridge.arm(side, amount);
  if(!smartBet(currentBetStep, side)){
    TradeGate.busy=false; TradeGate.tOpen=0; DockBox.setMode('IDLE');
  }
}
    }, 1000);

    console.log('[TRD][BOOT] auto-trade ON, CLOSE via legacy Trades observer only, gate=ON');
  })();

  // [BEGIN BLOCK:CYCLES:HOOK]
  (function(){
    // UI старт после основного boot
    try{ vx_cyclesUiBoot(); }catch(e){}

    // Хук на обновление шага при закрытии сделки (если есть мост закрытий)
    try{
      const _SessionStats_onClose = SessionStats.onClose;
      SessionStats.onClose = function(type, ...rest){
        const r = _SessionStats_onClose.apply(this, [type, ...rest]);
        try{
          if (vx_maxStepLabel && typeof window!=='undefined'){
            // ожидается, что где-то в коде поддерживается current max step
            const cur = (window.maxStepInCycle!==undefined ? window.maxStepInCycle : (window.currentBetStep||0));
            vx_maxStepLabel.textContent = String(cur|0);
          }
        }catch(e){}
        return r;
      };
    }catch(e){}

    // Хук завершения цикла
    try{
      const _cycleEnd = cycleEnd;
      cycleEnd = function(status){
        _cycleEnd(status);
        try{ vx_renderCycleEnd(status); }catch(e){}
      };
    }catch(e){}
  })();
  // /* [END BLOCK:CYCLES:HOOK] */

  // ===== Boot last =====
  if(!Balance.getTarget()){ Balance.boot(); }
  console.log('[VERTER][BOOT]', VER);

  // ===== Global stop =====
  window.__verterStopAll=function(){
    console.log('[VERTER] stopped');
    return {};
  };
})();

// ===== MARTINGALE INTEGRATION (app5) :: CONFIG & STATE =====
const MARTIN_ENABLED = true; // переключатель интеграции

// Массивы ставок
const betArray1 = [
  {step:0, value:1,   pressCount:0},
  {step:1, value:3,   pressCount:2},
  {step:2, value:8,   pressCount:7},
  {step:3, value:20,  pressCount:11},
  {step:4, value:40,  pressCount:15},
  {step:5, value:90,  pressCount:21},
  {step:6, value:200, pressCount:24},
  {step:7, value:400, pressCount:27},
  {step:8, value:900, pressCount:33}
];
const betArray2 = [...betArray1];
const betArray3 = [...betArray1];
let betArray = betArray1;

// Лимиты цикла
const limitWin1 = 50,  limitLoss1 = -50;
const limitWin2 = 100, limitLoss2 = -100;
const limitWin3 = 150, limitLoss3 = -150;
let limitWin = limitWin1, limitLoss = limitLoss1;

// Состояние MG
let currentBetStep = 0;
let currentBetArrayId = 1; // 1|2|3
let maxStepInCycle = 0;

// Учёт цикла
let CycleAcc = {
  id: 1,
  trades: 0, won: 0, loss: 0, ret: 0,
  maxStep: 0, betArray: 1,
  startedAt: Date.now(),
  startBal: null,
  endBal: null
};

function getBetValue(step){
  for(let i=0;i<betArray.length;i++) if(betArray[i].step===step) return betArray[i].value;
  return betArray[0].value;
}
function setArrayById(id){
  currentBetArrayId = id;
  if(id===1){ betArray=betArray1; limitWin=limitWin1; limitLoss=limitLoss1; }
  else if(id===2){ betArray=betArray2; limitWin=limitWin2; limitLoss=limitLoss2; }
  else { betArray=betArray3; limitWin=limitWin3; limitLoss=limitLoss3; }
  CycleAcc.betArray = id;
}
function cycleStart(){
  const ss = SessionStats.snapshot();
  CycleAcc.trades=0; CycleAcc.won=0; CycleAcc.loss=0; CycleAcc.ret=0;
  CycleAcc.maxStep=0; CycleAcc.startedAt=Date.now();
  CycleAcc.startBal = ss.lastBalance!=null ? ss.lastBalance : (BalanceStable.getStable()||Balance.read()||null);
  maxStepInCycle=0; currentBetStep=0;
  console.log('[CYCLE-START] #'+CycleAcc.id+' array='+currentBetArrayId+' limits=win:'+limitWin+'|loss:'+limitLoss+' step=0');
}
function cycleEnd(status){
  const ss = SessionStats.snapshot();
  CycleAcc.endBal = ss.lastBalance!=null ? ss.lastBalance : (BalanceStable.getStable()||Balance.read()||null);
  const profit = typeof ss.profitTotal==='number'
    ? ss.profitTotal
    : (CycleAcc.endBal!=null && CycleAcc.startBal!=null ? Math.round((CycleAcc.endBal-CycleAcc.startBal)*100)/100 : null);
  console.log('[CYCLE-END] #'+CycleAcc.id+' status='+status+' profit='+profit+' maxStep='+CycleAcc.maxStep+' array='+currentBetArrayId+' trades='+CycleAcc.trades+' W/L/R='+CycleAcc.won+'/'+CycleAcc.loss+'/'+CycleAcc.ret+' startBal='+CycleAcc.startBal+' endBal='+CycleAcc.endBal);
  try {
    var S=SessionStats.get();
    (S.cycles||(S.cycles=[])).push({ id:CycleAcc.id, status, profit, maxStep:CycleAcc.maxStep, trades:CycleAcc.trades, won:CycleAcc.won, loss:CycleAcc.loss, ret:CycleAcc.ret, betArray:currentBetArrayId, startBal:CycleAcc.startBal, endBal:CycleAcc.endBal, startedAt:CycleAcc.startedAt, endedAt:Date.now() });
  } catch(e){}
  CycleAcc.id++;
  setArrayById(status==='lose' ? (currentBetArrayId===1?2:(currentBetArrayId===2?3:1)) : 1);
  currentBetStep=0; maxStepInCycle=0; cycleStart();
}

// Хоткеи
function pressKey(code){ try{ return document.dispatchEvent(new KeyboardEvent('keyup',{ keyCode:code, shiftKey:true, bubbles:true, cancelable:true })); }catch(e){ return false; } }
function increaseBet(){ return pressKey(68); } // Shift+D
function decreaseBet(){ return pressKey(65); } // Shift+A
function buy(){ return pressKey(87); }        // Shift+W
function sell(){ return pressKey(83); }       // Shift+S

// Доходность %, мягкий фолбэк
function readProfitPercent(){
  try{
    var n = document.getElementsByClassName('value__val-start')[0];
    var s = n && (n.innerText||n.textContent)||'';
    var m = s.match(/\\d+/);
    return m?parseInt(m[0],10):null;
  }catch(e){ return null; }
}

// Установка суммы и открытие
function smartBet(step, side){
  const p = readProfitPercent();
  if(p!=null && p<90){
    console.log('%c BET IS NOT RECOMMENDED. Aborting mission! ', 'background: #B90000; color: #ffffff');
    return false;
  }
  let steps=0; for(let i=0;i<betArray.length;i++){ if(step===betArray[i].step){ steps=betArray[i].pressCount; break; } }
  for(let i=0;i<30;i++){ setTimeout(decreaseBet, i); }
  setTimeout(function(){ for(let i=0;i<steps;i++){ setTimeout(increaseBet, i); } }, 50);
  setTimeout(function(){ side==='BUY'?buy():sell(); }, 100);
  return true;
}

// Инициализация
function __mg_init__(){
  if(typeof MARTIN_ENABLED==='undefined' || !MARTIN_ENABLED) return;
  if(!(typeof SessionStats!=='undefined' && SessionStats && typeof SessionStats.snapshot==='function')){
    setTimeout(__mg_init__, 250);
    return;
  }
  try{ setArrayById(1); cycleStart(); }catch(e){ setTimeout(__mg_init__, 250); }
}
__mg_init__();
/* [BuildReport]
BaseSHA256=cb6d50570c10c8b2b4fddff75354b7bd5afe72fca2c8cb199ec65bede053d1ac
SourceCyclesSHA256=af2a2e41f7f5a2004b58a333c3ff63b852a15d108ffb12b3e6a6b92cd1fd0b7e
Header=OK
SSOT_VER=OK
InsertOnly=OK
Syntax=OK
Markers=OK
Readonly=OK
UniqSet=OK
OldName=OK
UI_Cycles=OK
Hooks=OK
Result=PASS
*/

