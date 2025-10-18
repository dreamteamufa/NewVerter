// ==UserScript==
// @name         Verter_v0.3.9
// @version      0.3.9
// @description  Auto-trade + Signals (EMA9/15, SQZ) + BalanceStable + DockBox + Stats + One-At-A-Time Gate + PCS-8 v3.1 + Pause Control (UI fix + usability)
// @match        https://pocketoption.com/*
// @run-at       document-idle
// ==/UserScript==

// [SSOT:APP:BEGIN]
const BUILD_NAME = 'Verter_v0.3.9';
const VER = '0.3.9';
const APP = Object.freeze({
  NAME: 'Verter_M1_BALRES',
  VERSION: '0.3.9',
  FLAVOR: 'MG_from_app5_CAN_CHS'
});
// [SSOT:APP:END]

// ===== Build Meta =====

// Boot banner
try{ if(typeof DockBox!=='undefined' && DockBox?.setTitle){ DockBox.setTitle('Verter v'+VER); } }catch(e){}


// [BEGIN MOD:PauseCtl]
// ===== Pause Controller =====
var PauseCtl=(function(){
  const KEY_PREFIX='verter.pause.';
  const KEY_AUTO=KEY_PREFIX+'autoOnLosses';
  const KEY_DURATION=KEY_PREFIX+'durationMin';
  const KEY_MANUAL=KEY_PREFIX+'manualDurationMin';
  const LEGACY_KEY='verter.pause.v1';
  let cfg={autoOnLosses:3, durationMin:3, manualDurationMin:5};
  let st={until:0, lossCount:0, pending:{until:0, reason:null}};

  function readInt(key){
    try{
      const raw=localStorage.getItem(key);
      if(raw==null) return null;
      const num=parseInt(raw,10);
      return isFinite(num)?num:null;
    }catch(e){ return null; }
  }

  try{
    const legacy=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null');
    if(legacy && typeof legacy==='object'){
      if(typeof legacy.autoOnLosses==='number') cfg.autoOnLosses=Math.max(1, legacy.autoOnLosses|0);
      if(typeof legacy.durationMin==='number') cfg.durationMin=Math.max(1, legacy.durationMin|0);
      if(typeof legacy.manualDurationMin==='number') cfg.manualDurationMin=Math.max(1, legacy.manualDurationMin|0);
    }
  }catch(e){}

  const savedAuto=readInt(KEY_AUTO); if(savedAuto!=null) cfg.autoOnLosses=Math.max(1, savedAuto|0);
  const savedDuration=readInt(KEY_DURATION); if(savedDuration!=null) cfg.durationMin=Math.max(1, savedDuration|0);
  const savedManual=readInt(KEY_MANUAL); if(savedManual!=null) cfg.manualDurationMin=Math.max(1, savedManual|0);

  function save(key,val){ try{ localStorage.setItem(key, String(val)); }catch(e){} }
  function now(){ return Date.now(); }
  function _formatRemaining(){
    const ms=st.until>0?Math.max(0, st.until-now()):0;
    const totalSec=Math.max(0, Math.ceil(ms/1000));
    const m=Math.floor(totalSec/60);
    const s=totalSec%60;
    const mm=m<10?'0'+m:String(m);
    const ss=s<10?'0'+s:String(s);
    return mm+':'+ss;
  }
  function _setPending(reason){
    st.pending.until=st.until>0?st.until:0;
    st.pending.reason=reason||null;
  }
  function _ensureFresh(){
    if(st.until>0 && now()>=st.until){
      st.until=0;
      _setPending(null);
      return true;
    }
    return false;
  }
  function _updateMode(){
    try{
      if(typeof DockBox!=='undefined' && DockBox?.setMode){
        if(st.until>0 && now()<st.until){
          const rem=_formatRemaining();
          DockBox.setMode('PAUSE '+rem);
        }else{
          DockBox.setMode('IDLE');
        }
      }
    }catch(e){}
  }
  function isActive(){
    const expired=_ensureFresh();
    if(expired) _updateMode();
    if(st.until>0 && now()<st.until){
      _updateMode();
      return true;
    }
    return false;
  }
  function isArmed(){
    _ensureFresh();
    return st.until>0 && now()<st.until;
  }
  function remainingMs(){
    const expired=_ensureFresh();
    if(expired) _updateMode();
    return st.until>0?Math.max(0, st.until-now()):0;
  }
  function remainingFmt(){
    const expired=_ensureFresh();
    if(expired) _updateMode();
    return _formatRemaining();
  }
  function start(min, reason){
    const dur=Math.max(1, Math.floor(min || cfg.manualDurationMin || cfg.durationMin));
    st.until=now()+dur*60000;
    _setPending(reason||'manual');
    _updateMode();
    try{ console.log('[PAUSE] start '+dur+'min reason='+(reason||'manual')); }catch(e){}
  }
  function stop(){
    st.until=0;
    _setPending(null);
    _updateMode();
    try{ console.log('[PAUSE] stop'); }catch(e){}
  }
  function startAuto(){
    start(cfg.durationMin, 'auto');
    st.lossCount=0;
    try{ console.log('[PAUSE] start auto '+cfg.durationMin+'min after '+cfg.autoOnLosses+' losses'); }catch(e){}
  }
  function noteResult(type){
    if(type==='LOSS'){
      st.lossCount++;
      if(st.lossCount>=cfg.autoOnLosses){
        startAuto();
      }
    }else if(type==='WIN'){
      st.lossCount=0;
    }
  }
  function setAutoLosses(n){
    cfg.autoOnLosses=Math.max(1, Math.floor(+n||0)||1);
    save(KEY_AUTO, cfg.autoOnLosses);
  }
  function setDurationMin(n){
    cfg.durationMin=Math.max(1, Math.floor(+n||0)||1);
    save(KEY_DURATION, cfg.durationMin);
  }
  function setManualDurationMin(n){
    cfg.manualDurationMin=Math.max(1, Math.floor(+n||0)||1);
    save(KEY_MANUAL, cfg.manualDurationMin);
  }
  document.addEventListener('keydown', function(e){
    if(!e.altKey) return;
    if(e.key==='p' || e.key==='P'){
      const v=prompt('Минуты для автопаузы после '+cfg.autoOnLosses+' LOSS подряд:', String(cfg.durationMin));
      if(v!=null){ setDurationMin(v); try{ console.log('[PAUSE] auto duration set to', cfg.durationMin, 'min'); }catch(err){} }
    }
    if(e.key==='o' || e.key==='O'){
      start(cfg.manualDurationMin, 'manual');
    }
  });
  return {
    isActive,
    isArmed,
    remainingFmt,
    start,
    startAuto,
    stop,
    noteResult,
    setAutoLosses,
    setDurationMin,
    setManualDurationMin,
    cfg,
    state:function(){ return st; }
  };
})();

/* [END MOD:PauseCtl] */


(function () {
  if (window.__verterBoot) { console.log('[VERTER] already armed'); return; }
  window.__verterBoot = true;

  console.log('[VERTER][BOOT] %s ready', BUILD_NAME);

  /* VER moved to APP.VERSION */
  const DEBUG = false;

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

  const SigStats = {
    SQZ: { open: 0, win: 0, loss: 0, ret: 0, opensAt: [] },
    EMA915: { open: 0, win: 0, loss: 0, ret: 0, opensAt: [] }
  };

  function sigKeyOf(sig){
    if(sig === 'EMA9/15') return 'EMA915';
    if(sig === 'SQZ') return 'SQZ';
    return null;
  }

  // [BEGIN MOD:DataFeed]
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
        try{
          if(PauseCtl && PauseCtl.isActive()){
            // Обновляем режим, но НЕ выходим
            try{ if(typeof DockBox!=='undefined' && DockBox?.setMode){ DockBox.setMode('PAUSE '+PauseCtl.remainingFmt()); } }catch(e){}
          }
          var p=readTooltip();
          if(p==null) return;
          if(last===null || p!==last){ last=p; cb(p, Date.now()); }
        }catch(e){}
      }, Math.max(100, period|0));
      return function(){ clearInterval(iv); };
    }
    return { subscribe };
  })();

  /* [END MOD:DataFeed] */
  const DataFeed = Object.freeze({ Balance, BalanceStable, tickSource });

  // [BEGIN MOD:Candles]
  const CandleState={ticks:[],candlesM1:[],cur:null,m5:{cur:null,candles:[]}};
  function updateM5FromClosed(m1){
    var m5=CandleState.m5;
    var key=Math.floor(m1.tOpen/300000);
    if(!m5.cur||m5.cur.key!==key){
      if(m5.cur){
        m5.cur.C=m5.cur.lastP;
        m5.candles.push({tOpen:m5.cur.tOpen,O:m5.cur.O,H:m5.cur.H,L:m5.cur.L,C:m5.cur.C});
        if(m5.candles.length>600) m5.candles=m5.candles.slice(-600);
      }
      m5.cur={key:key,tOpen:key*300000,O:m1.O,H:m1.H,L:m1.L,C:m1.C,lastP:m1.C};
    }else{
      if(m1.H>m5.cur.H) m5.cur.H=m1.H;
      if(m1.L<m5.cur.L) m5.cur.L=m1.L;
      m5.cur.C=m1.C;
      m5.cur.lastP=m1.C;
    }
  }
  function candlesOnTick(p,ts){
    var t=ts||Date.now();
    CandleState.ticks.push({t:t,p:p}); if(CandleState.ticks.length>5000) CandleState.ticks=CandleState.ticks.slice(-5000);
    var mKey=Math.floor(t/60000);
    if(!CandleState.cur||CandleState.cur.mKey!==mKey){
      if(CandleState.cur){
        CandleState.cur.C=CandleState.cur.lastP;
        CandleState.candlesM1.push({tOpen:CandleState.cur.tOpen,O:CandleState.cur.O,H:CandleState.cur.H,L:CandleState.cur.L,C:CandleState.cur.C});
        updateM5FromClosed(CandleState.cur);
        if(CandleState.candlesM1.length>600) CandleState.candlesM1=CandleState.candlesM1.slice(-600);
        console.log('[M1][CLOSE]', new Date(CandleState.cur.tOpen).toISOString(), CandleState.cur);
      }
      CandleState.cur={mKey:mKey,tOpen:mKey*60000,O:p,H:p,L:p,C:p,lastP:p};
    }else{
      if(p>CandleState.cur.H) CandleState.cur.H=p;
      if(p<CandleState.cur.L) CandleState.cur.L=p;
      CandleState.cur.lastP=p;
    }
    if(CandleState.m5 && CandleState.m5.cur && CandleState.cur){
      var curKey=Math.floor(CandleState.cur.tOpen/300000);
      if(CandleState.m5.cur.key===curKey){ CandleState.m5.cur.lastP=CandleState.cur.lastP; }
    }
  }
  function getCandlesState(){ return CandleState; }
  /* [END MOD:Candles] */
  const Candles = Object.freeze({ onTick: candlesOnTick, getState: getCandlesState });

  // [BEGIN MOD:UI]
  // ===== DockBox (панель+график, +50%, drag) =====
  var DockBox=(function(){
    var box=document.createElement('div');
    box.style.cssText='position:fixed;z-index:999999;right:12px;bottom:12px;width:960px;height:420px;background:#111;color:#ddd;font:13px monospace;border:1px solid #333;border-radius:6px;display:flex;flex-direction:column;user-select:none';
    var bar=document.createElement('div'); bar.className='verter-dock-header';
    bar.style.cssText='padding:6px 8px;border-bottom:1px solid #222;display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:move;flex-wrap:wrap';
    var left=document.createElement('div'); left.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    var right=document.createElement('div'); right.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    bar.appendChild(left); bar.appendChild(right);

    // [BEGIN MOD:PauseUI]
    const paWrap = document.createElement('span');
    paWrap.style.cssText = 'display:inline-flex;gap:8px;align-items:center;font:12px monospace;color:#ddd;user-select:text;';

    const inpLoss = document.createElement('input');
    inpLoss.type = 'number';
    inpLoss.min = '1';

    const inpAutoMin = document.createElement('input');
    inpAutoMin.type = 'number';
    inpAutoMin.min = '1';

    const inpManualMin = document.createElement('input');
    inpManualMin.type = 'number';
    inpManualMin.min = '1';

    const btnStart = document.createElement('button');
    btnStart.textContent = 'Pause';
    const btnStop = document.createElement('button');
    btnStop.textContent = 'Resume';

    [inpLoss, inpAutoMin, inpManualMin, btnStart, btnStop].forEach(el=>{
      ['mousedown','click'].forEach(evt=>{
        el.addEventListener(evt, ev=>ev.stopPropagation());
      });
    });

    const baseInputCSS = 'width:56px;height:24px;padding:2px 6px;margin:0;'+
      'background:#1b1b1b;color:#eee;border:1px solid #555;border-radius:4px;'+
      'outline:none;user-select:text;font:12px monospace;';
    [inpLoss, inpAutoMin, inpManualMin].forEach(i=>{
      i.style.cssText = baseInputCSS;
      i.step = '1';
    });

    const baseBtnCSS = 'height:26px;padding:2px 10px;background:#2a2a2a;color:#eee;'+
      'border:1px solid #666;border-radius:6px;cursor:pointer;font:12px monospace;';
    btnStart.style.cssText = baseBtnCSS;
    btnStop.style.cssText  = baseBtnCSS;

    btnStart.onmouseenter = btnStop.onmouseenter = e=>{ e.currentTarget.style.background = '#3a3a3a'; };
    btnStart.onmouseleave = btnStop.onmouseleave = e=>{ e.currentTarget.style.background = '#2a2a2a'; };

    paWrap.append('Losses:', inpLoss, 'Auto(min):', inpAutoMin, 'Manual:', inpManualMin, btnStart, btnStop);
    right.appendChild(paWrap);

    const rightInfo = document.createElement('span');
    rightInfo.style.cssText = 'display:inline-block;min-width:420px;';
    right.appendChild(rightInfo);

    inpLoss.value = PauseCtl?.cfg?.autoOnLosses ?? 3;
    inpAutoMin.value = PauseCtl?.cfg?.durationMin ?? 3;
    inpManualMin.value = PauseCtl?.cfg?.manualDurationMin ?? 5;

    inpLoss.addEventListener('input', function(){
      const val = Math.max(1, (+inpLoss.value)||1);
      PauseCtl.setAutoLosses(val);
      if(String(val)!==inpLoss.value){ inpLoss.value = val; }
    });
    inpAutoMin.addEventListener('input', function(){
      const val = Math.max(1, (+inpAutoMin.value)||1);
      PauseCtl.setDurationMin(val);
      if(String(val)!==inpAutoMin.value){ inpAutoMin.value = val; }
    });
    inpManualMin.addEventListener('input', function(){
      const val = Math.max(1, (+inpManualMin.value)||1);
      PauseCtl.setManualDurationMin(val);
      if(String(val)!==inpManualMin.value){ inpManualMin.value = val; }
    });

    btnStart.addEventListener('click', function(){ PauseCtl.start(+inpManualMin.value || PauseCtl.cfg.manualDurationMin, 'manual-ui'); });
    btnStop.addEventListener('click', function(){ PauseCtl.stop(); });
    // [END MOD:PauseUI]
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
        const t = e.target;
        if(t && t.closest && t.closest('input,button,select,textarea,label,[contenteditable="true"]')){
          return;
        }
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

    var raf=0,need=false; function schedule(){ if(need) return; need=true; raf=requestAnimationFrame(function(){ need=false; draw(); }); }
    function draw(){
      fit(); var W=cv.width,H=cv.height;
      var state=Candles.getState();
      var data=state.candlesM1.slice(-120); if(state.cur) data=data.concat([{O:state.cur.O,H:state.cur.H,L:state.cur.L,C:state.cur.lastP}]);
      const baseAlpha = (PauseCtl && PauseCtl.isActive()) ? 0.5 : 1;
      ctx.clearRect(0,0,W,H); if(!data.length) return;
      var hi=-1e9,lo=1e9; for(var i=0;i<data.length;i++){ hi=Math.max(hi,data[i].H); lo=Math.min(lo,data[i].L); }
      var span=(hi-lo)||1;
      ctx.globalAlpha=0.25*baseAlpha; ctx.strokeStyle='#666'; ctx.lineWidth=1;
      for(var g=1;g<4;g++){ var y=(H/4*g)|0; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
      ctx.globalAlpha=1*baseAlpha; var n=data.length,bw=Math.max(3,Math.floor(W/n)-3),gap=2; ctx.lineWidth=1; ctx.strokeStyle='#bbb';
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
    var sigStats={ready:{EMA915:0,SQZ:0}, need:{EMA915:15,SQZ:20}, hits:{EMA915:0,SQZ:0}};
    function setMode(t){ modeText=t||modeText; renderHeader(); }
    function setSigReady(name,have){ if(name in sigStats.ready){ sigStats.ready[name]=have; renderHeader(); } }
    function incSigHit(name){ if(name in sigStats.hits){ sigStats.hits[name]=(sigStats.hits[name]||0)+1; renderHeader(); } }

    function renderHeader(){
      var ss=SessionStats.get();
      left.innerHTML =
        'Start: ' + (ss.startTime? new Date(ss.startTime).toLocaleTimeString():'—') +
        ' | Bal: ' + fmt2(ss.startBalance) + ' → ' + fmt2(ss.lastBalance) +
        ' | P/L: ' + fmt2(ss.profitTotal) +
        ' | Wager: ' + fmt2(ss.volumeTotal) +
        ' | Trades: ' + ss.tradesTotal + ' (W/L/R ' + ss.wins + '/' + ss.losses + '/' + ss.returns + ')' +
        ' | Win%: ' + (ss.tradesTotal? (ss.wins/ss.tradesTotal*100).toFixed(1):'0.0'); // keep concise

      var sqzStats = SigStats.SQZ;
      var emaStats = SigStats.EMA915;
      var totalOpens = (sqzStats.open||0) + (emaStats.open||0);
      function share(stat){
        var denom = Math.max(1, totalOpens);
        if(!stat || typeof stat.open!=='number') return '—';
        return Math.round((stat.open/denom)*100) + '%';
      }
      function wr(stat){
        var denom = (stat.win||0) + (stat.loss||0);
        if(denom<=0) return '—';
        return (Math.round((stat.win/denom)*1000)/10).toFixed(1) + '%';
      }
      function medInt(stat){
        var times=stat.opensAt||[];
        if(!times || times.length<2) return '—';
        var intervals=[];
        for(var i=1;i<times.length;i++){ var diff=times[i]-times[i-1]; if(diff>0) intervals.push(diff); }
        if(!intervals.length) return '—';
        intervals.sort(function(a,b){ return a-b; });
        var mid=Math.floor(intervals.length/2);
        var med=intervals.length%2?intervals[mid]:Math.round((intervals[mid-1]+intervals[mid])/2);
        if(!med || !isFinite(med) || med<=0) return '—';
        var m=Math.floor(med/60000);
        var s=Math.round((med%60000)/1000);
        if(s===60){ m+=1; s=0; }
        return m+':' + (s<10?'0':'')+s;
      }
      var pauseBadge = (PauseCtl && PauseCtl.isArmed())
        ? ' <span style="color:#ffcc00">PAUSE '+PauseCtl.remainingFmt()+'</span>'
        : '';
      var sigCfg = (typeof SignalEngine!=='undefined' && SignalEngine && typeof SignalEngine.getCfg==='function') ? SignalEngine.getCfg() : null;
      var sigLine =
        'Signals: '+
        'E9/15 ['+sigStats.ready.EMA915+'/'+sigStats.need.EMA915+', hits '+(sigStats.hits.EMA915||0)+
        ' | F:τ='+(sigCfg?sigCfg.TAU:'?')+' k='+(sigCfg?sigCfg.K:'?')+' '+(sigCfg && sigCfg.EMA915_USE_SLOPE?'on':'off')+'] | '+
        'SQZ ['+sigStats.ready.SQZ+'/'+sigStats.need.SQZ+', hits '+(sigStats.hits.SQZ||0)+']'+
        ' | Mode: <b>'+modeText+'</b>'+pauseBadge+
        ' | Verter v'+VER;
      var metricsLine1 = 'SIG: SQZ o/w/l='+ (sqzStats.open||0)+'/'+(sqzStats.win||0)+'/'+(sqzStats.loss||0)+
        ' WR='+wr(sqzStats)+' share='+share(sqzStats)+' medInt='+medInt(sqzStats);
      var metricsLine2 = '&nbsp;&nbsp;&nbsp;&nbsp;9/15 o/w/l='+ (emaStats.open||0)+'/'+(emaStats.win||0)+'/'+(emaStats.loss||0)+
        ' WR='+wr(emaStats)+' share='+share(emaStats)+' medInt='+medInt(emaStats);
      rightInfo.innerHTML = sigLine + '<br>' + metricsLine1 + '<br>' + metricsLine2;
    }

    var unsubscribe=tickSource.subscribe(function(p,ts){ Candles.onTick(p,ts); schedule(); renderHeader(); },200);
    function stop(){ try{unsubscribe&&unsubscribe();}catch(e){} try{cancelAnimationFrame(raf);}catch(e){} const r = box.getBoundingClientRect(); return {pos:{left:r.left,top:r.top}}; }

    function requestRender(){ renderHeader(); }
    console.log('[VERTER][BOOT] DockBox (chart+panel, drag) v'+VER);
    return { stop, getState:function(){return Candles.getState();}, setMode, setSigReady, incSigHit, requestRender };
  })();

  /* [END MOD:UI] */
  const UI = Object.freeze({ DockBox });

  // [BEGIN MOD:Signals]
  // ===== Signals (EMA9/15, TTM Squeeze) =====
  var SignalEngine=(function(){
    var lastSqzOn=null;
    const SIGCFG = Object.seal({
      EMA915_USE_SLOPE: true,
      TAU: 0.00015,
      K: 3
    });
    function ema(arr,period){ if(arr.length<period) return []; var k=2/(period+1), out=[], prev=arr[0];
      for(var i=0;i<arr.length;i++){ prev=(i===0)?arr[i]:(arr[i]*k + prev*(1-k)); out.push(prev); } return out; }
    function emaGapRatio(p9,p15,price){
      var denom = Math.abs(price);
      if(!isFinite(denom) || denom<=0){
        denom = Math.max(Math.abs(p9), Math.abs(p15), 1);
      }
      return Math.abs(p9-p15)/denom;
    }
    function slopeK(series,k){
      var n=series.length;
      if(n>k){
        return (series[n-1]-series[n-1-k])/k;
      }
      return 0;
    }
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

      DockBox.setSigReady('EMA915', Math.min(closes.length, 15));
      DockBox.setSigReady('SQZ', Math.min(closes.length, 20));

      var okEMA915=null, sqz=null, sideRaw=null;
      if(closes.length>=15){
        var eF=ema(closes,9), eS=ema(closes,15);
        if(eF.length && eS.length){
          var lastFast=eF[eF.length-1], lastSlow=eS[eS.length-1];
          if(lastFast>lastSlow) sideRaw='BUY';
          else if(lastFast<lastSlow) sideRaw='SELL';
        }
        if(sideRaw){
          var lastPrice = closes[closes.length-1];
          var gap = emaGapRatio(lastFast, lastSlow, lastPrice);
          var slopeVal = slopeK(eF, SIGCFG.K);
          var passed=true;
          var filterResult='PASS';
          if(gap<=SIGCFG.TAU){
            console.log('[SIG:EMA9/15][SKIP] reason=tau gap=%s τ=%s', gap.toFixed(7), SIGCFG.TAU);
            passed=false;
            filterResult='FAIL(tau)';
          }else if(SIGCFG.EMA915_USE_SLOPE){
            if((sideRaw==='BUY' && slopeVal<=0) || (sideRaw==='SELL' && slopeVal>=0)){
              console.log('[SIG:EMA9/15][SKIP] reason=slope k=%d val=%s side=%s', SIGCFG.K, slopeVal.toFixed(7), sideRaw);
              passed=false;
              filterResult='FAIL(slope)';
            }
          }
          if(DEBUG){
            console.log('[EMA9/15 filter] gap=%s τ=%s slope=%s k=%d result=%s', gap.toFixed(7), SIGCFG.TAU, slopeVal.toFixed(7), SIGCFG.K, filterResult);
          }
          if(passed){
            okEMA915={side:sideRaw,sig:'EMA9/15'};
          }
        }
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
            if(side){ sqz={side:side,sig:'SQZ'}; }
          }
          lastSqzOn=on;
        }
      }
      var pick = sqz || okEMA915 || null;
      if(pick){ DockBox.incSigHit(pick.sig==='EMA9/15'?'EMA915':'SQZ'); }
      return {best:pick, logs:[]};
    }
    function getCfg(){ return SIGCFG; }
    const Sig = {
      set:function(p){
        if(p && typeof p==='object'){
          if(p.TAU!=null){
            var nextTau=+p.TAU;
            if(isFinite(nextTau) && nextTau>0) SIGCFG.TAU=nextTau;
          }
          if(p.k!=null){
            var nextK=+p.k;
            if(isFinite(nextK) && nextK>0) SIGCFG.K=nextK;
          }
          if(p.useSlope!=null) SIGCFG.EMA915_USE_SLOPE=!!p.useSlope;
        }
        try{
          if(typeof DockBox!=='undefined' && DockBox?.requestRender){ DockBox.requestRender(); }
        }catch(e){}
      },
      info:function(){
        try{
          console.log('[SIGCFG]', JSON.stringify(SIGCFG));
        }catch(e){}
      }
    };
    try{ globalThis.__VERTER_SIG__ = Sig; }catch(e){}
    return { evalAll, getCfg, Sig };
  })();

  /* [END MOD:Signals] */
  const Signals = Object.freeze({ evalAll: SignalEngine.evalAll });

  // [BEGIN MOD:TradeIO]
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

  function pressKey(code){ try{ return document.dispatchEvent(new KeyboardEvent('keyup',{ keyCode:code, shiftKey:true, bubbles:true, cancelable:true })); }catch(e){ return false; } }
  function increaseBet(){ return pressKey(68); } // Shift+D
  function decreaseBet(){ return pressKey(65); } // Shift+A
  function buy(){ return pressKey(87); }        // Shift+W
  function sell(){ return pressKey(83); }       // Shift+S

  function readProfitPercent(){
    try{
      var n = document.getElementsByClassName('value__val-start')[0];
      var s = n && (n.innerText||n.textContent)||'';
      var m = s.match(/\d+/);
      return m?parseInt(m[0],10):null;
    }catch(e){ return null; }
  }

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

  /* [END MOD:TradeIO] */
  const TradeIO = Object.freeze({ HotkeyDriver, readStake, readProfitPercent, smartBet, buy, sell });

  // ===== Trade gate: одна ставка за раз =====
  var TradeGate = { busy:false, tOpen:0 };
  setInterval(function(){
    if (TradeGate.busy && Date.now()-TradeGate.tOpen > 120000){
      console.warn('[TRADE][GUARD] force-unlock after 120s without DOM close');
      TradeGate.busy=false; TradeGate.tOpen=0; DockBox.setMode('IDLE');
    }
  }, 5000);

  // [BEGIN MOD:ResultObserver]
  // ===== Legacy Trades Observer (logic unchanged; added guards+dedupe only) =====
  window.betHistory = window.betHistory || [];
  function bootLegacyObserver(){
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
  }
  bootLegacyObserver();

  /* [END MOD:ResultObserver] */
  const ResultObserver = Object.freeze({ boot: bootLegacyObserver });

  // [BEGIN MOD:Bridge]
  // ===== Bridge: перехват присвоения .won для подсчётов =====
  var pendingStepForLog=null;

  var TradeBridge=(function(){
    var pending=null; // {id, side, amount, step, tOpen, pre, sig, sent, openedAt}
    function arm(side, amount, meta){
      const rec = {};
      Object.defineProperty(rec,'won',{
        set:function(v){
          var type = v==='won'?'WIN':(v==='lost'?'LOSS':'RET');
          try{ PauseCtl.noteResult(type); }catch(e){}
          var bal = BalanceStable.getStable() || Balance.read() || null;
          var delta = null;
          if(pending && pending.pre!=null && bal!=null){ delta = r2(bal - pending.pre); }
          var wagerVal = pending ? pending.amount : null;
          var stepVal = pending && pending.step!=null ? pending.step : '—';
          var sigKey = pending ? sigKeyOf(pending.sig) : null;
          if(pending && pending.sent && sigKey && SigStats && SigStats[sigKey]){
            if(type==='WIN') SigStats[sigKey].win++;
            else if(type==='LOSS') SigStats[sigKey].loss++;
            else SigStats[sigKey].ret++;
          }
          console.log('[TRADE-CLOSE] result='+type+' delta='+ (delta!=null?fmt2(delta):'—') +' wager='+fmt2(wagerVal)+' step='+stepVal);
          try{ SessionStats.onClose(type, null, bal, pending?pending.amount:null);
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
      var sigMeta = meta && meta.sig ? meta.sig : null;
      pending = pending || {
        id: null,
        side: null,
        amount: null,
        step: null,
        tOpen: null,
        pre: null,
        sig: null,
        sent: false,
        openedAt: null
      };
      pending.id = null;
      pending.side = side;
      pending.amount = amount;
      pending.step = pendingStepForLog;
      pending.tOpen = now();
      pending.pre = BalanceStable.getStable()||Balance.read()||null;
      pending.sig = sigMeta;
      pending.sent = pending.sent === true ? true : false;
      if(pending.sent !== true){ pending.openedAt = null; }
      pendingStepForLog=null;
      return pending;
    }
    return { arm };
  })();

  /* [END MOD:Bridge] */
  const Bridge = Object.freeze({ TradeBridge });

  // [BEGIN MOD:Controller]
  // ===== TradeController (без дедлайна; ждём DOM; семафор) =====
  (function(){
    if(!Balance.getTarget()){ Balance.boot(); }
    var st={mode:'IDLE'};
    setInterval(function(){
      if(st.mode!=='IDLE') return;
      if(TradeGate.busy) return;
      if(PauseCtl && PauseCtl.isActive()){
        console.log('[PAUSE][BLOCK] trading paused, remaining='+PauseCtl.remainingFmt());
        if(DockBox?.setMode) DockBox.setMode('PAUSE '+PauseCtl.remainingFmt());
        return;
      }

      var res=SignalEngine.evalAll();
      var best=res && res.best;
      var sig = best && best.sig ? best.sig : null;
      if(!best || !sig) return;
      if(sig){ try{ console.log('[SIG:%s]', sig); }catch(e){} }
      var side=best.side;
      if(!side) return;
      var payout = readProfitPercent();

      var payoutFmt = payout!=null ? fmt2(payout) : '—';
      var payoutThr = 90;

      if(typeof MARTIN_ENABLED==='undefined' || !MARTIN_ENABLED){
        var amount=readStake();
        pendingStepForLog=0;
        TradeGate.busy=true; TradeGate.tOpen=Date.now(); DockBox.setMode('OPENED');
        if(DEBUG) console.log('[TRG]['+side+'] amt='+fmt2(amount));
        if(payout!=null && payout<payoutThr){
          console.log('[OPEN][SKIP] reason=payout<thr sig=%s step=%d payout=%s', sig, pendingStepForLog, payoutFmt);
          TradeGate.busy=false; TradeGate.tOpen=0; DockBox.setMode('IDLE');
          pendingStepForLog=null;
          return;
        }
        var sent = HotkeyDriver.trade(side);
        if(!sent){
          console.log('[OPEN][SKIP] reason=hotkey-false sig=%s step=%d payout=%s', sig, pendingStepForLog, payoutFmt);
          TradeGate.busy=false; TradeGate.tOpen=0; DockBox.setMode('IDLE');
          pendingStepForLog=null;
          return;
        }
        var pendingRec = TradeBridge.arm(side, amount, { sig });
        if(pendingRec){
          pendingRec.sent = true;
          pendingRec.openedAt = Date.now();
        }
        var keyNonMg = sigKeyOf(sig);
        if(keyNonMg && SigStats && SigStats[keyNonMg]){
          SigStats[keyNonMg].open++;
          if(pendingRec && pendingRec.openedAt!=null){ SigStats[keyNonMg].opensAt.push(pendingRec.openedAt); }
        }
        console.log('[TRADE-OPEN] sig=%s side=%s step=%d bet=%s payout=%s', sig, side, pendingStepForLog, fmt2(amount), payoutFmt);
      } else {
        var betRec = null;
        var betVal = null;
        try{
          var ss=SessionStats.snapshot();
          var activeBetArray = betArray;
          for(var i=0;i<activeBetArray.length;i++){ if(activeBetArray[i].step===currentBetStep){ betRec=activeBetArray[i]; break; } }
          if(!betRec && activeBetArray.length){ betRec = activeBetArray[Math.min(currentBetStep, activeBetArray.length-1)]; }
          betVal = betRec ? betRec.value : getBetValue(currentBetStep);
          if(typeof ss.profitTotal==='number'){
            if(ss.profitTotal>limitWin){ cycleEnd('win'); }
            else if(ss.profitTotal - betVal < limitLoss){ cycleEnd('lose'); }
          }
        } catch(e){}
        if(betVal==null){ betVal = getBetValue(currentBetStep); }
        var stepForLog = (betRec && betRec.step!=null) ? betRec.step : currentBetStep;
        pendingStepForLog=stepForLog;
        TradeGate.busy=true; TradeGate.tOpen=Date.now(); DockBox.setMode('OPENED');
        if(DEBUG) console.log('[TRG]['+side+'] step='+stepForLog+' bet='+betVal+' array='+currentBetArrayId);
        if(payout!=null && payout<payoutThr){
          console.log('[OPEN][SKIP] reason=payout<thr sig=%s step=%d payout=%s', sig, stepForLog, payoutFmt);
          TradeGate.busy=false; TradeGate.tOpen=0; DockBox.setMode('IDLE');
          pendingStepForLog=null;
          return;
        }
        const ok = smartBet(stepForLog, side);
        if(!ok){
          console.log('[OPEN][SKIP] reason=smartBet-false sig=%s step=%d', sig, stepForLog);
          TradeGate.busy=false; TradeGate.tOpen=0; DockBox.setMode('IDLE');
          pendingStepForLog=null;
          return;
        }
        var pendingRecMg = TradeBridge.arm(side, betVal, { sig });
        if(pendingRecMg){
          pendingRecMg.sent = true;
          pendingRecMg.openedAt = Date.now();
        }
        var keyMg = sigKeyOf(sig);
        if(keyMg && SigStats && SigStats[keyMg]){
          SigStats[keyMg].open++;
          if(pendingRecMg && pendingRecMg.openedAt!=null){ SigStats[keyMg].opensAt.push(pendingRecMg.openedAt); }
        }
        console.log('[TRADE-OPEN] sig=%s side=%s step=%d bet=%s payout=%s', sig, side, stepForLog, fmt2(betVal), payoutFmt);
      }
    }, 1000);

    console.log('[TRD][BOOT] auto-trade ON, CLOSE via legacy Trades observer only, gate=ON');
  })();

  /* [END MOD:Controller] */
  const Controller = Object.freeze({});

  // ===== Boot last =====
  if(!Balance.getTarget()){ Balance.boot(); }

  // ===== Global stop =====
  window.__verterStopAll=function(){
    console.log('[VERTER] stopped');
    return {};
  };
})();

// [BEGIN MOD:MG]
// ===== MARTINGALE INTEGRATION (app5) :: CONFIG & STATE =====
const MARTIN_ENABLED = true; // переключатель интеграции

// Массивы ставок
const betArray1 = [
  {step: 0, value: 3,   pressCount: 2},
  {step: 1, value: 9,   pressCount: 8},
  {step: 2, value: 30,  pressCount: 13},
  {step: 3, value: 90,  pressCount: 21}
];
const betArray2 = [
  {step: 0, value: 9,   pressCount: 8},
  {step: 1, value: 30,  pressCount: 13},
  {step: 2, value: 90,  pressCount: 21},
  {step: 3, value: 250, pressCount: 25}
];
const betArray3 = [
  {step: 0, value: 30,  pressCount: 13},
  {step: 1, value: 90,  pressCount: 21},
  {step: 2, value: 250, pressCount: 25},
  {step: 3, value: 500, pressCount: 28}
];
let betArray = betArray1;

// Лимиты цикла
const limitWin1 = 50,  limitLoss1 = -135;
const limitWin2 = 150, limitLoss2 = -380;
const limitWin3 = 550, limitLoss3 = -870;
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

/* [END MOD:MG] */
const MG = Object.freeze({ MARTIN_ENABLED, getBetValue, setArrayById, cycleStart, cycleEnd, CycleAcc, __mg_init__ });
