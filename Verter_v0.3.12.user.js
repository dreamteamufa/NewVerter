// ==UserScript==
// @name         Verter_v0.3.12
// @version      0.3.12
// @description  Decision Engine + EMA3/9/15/50 + SQZ + RSI + ATR + scoring + expanded InfoPanel
// @match        https://pocketoption.com/*
// @run-at       document-idle
// ==/UserScript==

// [SSOT:APP:BEGIN]
const BUILD_NAME = 'Verter_v0.3.12';
const VER = '0.3.12';
const APP = Object.freeze({
  NAME: 'Verter_M1_BALRES',
  VERSION: '0.3.12',
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
    SQZ: { open: 0, win: 0, loss: 0, ret: 0, sumScore: 0, opensAt: [] },
    EMAChain: { open: 0, win: 0, loss: 0, ret: 0, sumScore: 0, opensAt: [] },
    RSIEMA: { open: 0, win: 0, loss: 0, ret: 0, sumScore: 0, opensAt: [] },
    MAMA: { open: 0, win: 0, loss: 0, ret: 0, sumScore: 0, opensAt: [] }
  };

  function sigKeyOf(sig){
    if(sig === 'EMA9/15' || sig === 'EMAChain') return 'EMAChain';
    if(sig === 'SQZ') return 'SQZ';
    if(sig === 'RSIEMA') return 'RSIEMA';
    if(sig === 'MAMA') return 'MAMA';
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

    const metricsWrap = document.createElement('div');
    metricsWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;min-width:420px;';
    right.appendChild(metricsWrap);

    const rightInfo = document.createElement('span');
    rightInfo.style.cssText = 'display:inline-block;';
    metricsWrap.appendChild(rightInfo);

    const cycleHistoryBox = document.createElement('div');
    cycleHistoryBox.style.cssText = 'font-family:monospace;font-size:11px;color:#ddd;white-space:pre;line-height:1.35;border-top:1px solid #222;padding-top:4px;';
    cycleHistoryBox.textContent = 'Cycle History:\n—';
    metricsWrap.appendChild(cycleHistoryBox);

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
    var sigReady=Object.create(null);
    var sigNeed=Object.create(null);
    var decisionState={
      last:null,
      filters:{payout:null, vol:null, cooldown:null},
      skips:{payout:0, low_vol:0, conflict:0, cooldown:0}
    };
    var lastHeaderTs=0;

    function setMode(t){ modeText=t||modeText; renderHeader(true); }
    function setSigReady(name,have,need){
      if(name){
        sigReady[name]=have||0;
        if(need!=null) sigNeed[name]=need;
        if(name==='RSI14' || name==='EMA50'){
          var combined=Math.min(sigReady.RSI14||0, sigReady.EMA50||0);
          sigReady.RSIEMA=combined;
          sigNeed.RSIEMA=50;
        }
      }
      renderHeader(false);
    }
    function incSigHit(){ /* compatibility no-op */ }

    function updateDecision(info){
      if(!info) return;
      if(info.last!=null) decisionState.last=info.last;
      if(info.filters){
        if(info.filters.payout!==undefined) decisionState.filters.payout=info.filters.payout;
        if(info.filters.vol!==undefined) decisionState.filters.vol=info.filters.vol;
        if(info.filters.cooldown!==undefined) decisionState.filters.cooldown=info.filters.cooldown;
      }
      if(info.skips){
        Object.keys(info.skips).forEach(function(k){
          var v=info.skips[k];
          if(typeof v==='number'){ decisionState.skips[k]=(decisionState.skips[k]||0)+v; }
        });
      }
      renderHeader(false);
    }

    function fmtOk(v){ if(v===true) return '<span style="color:#4caf50">OK</span>'; if(v===false) return '<span style="color:#f44336">NO</span>'; return '—'; }
    function fmtReady(name, fallbackNeed){
      var have=sigReady[name]||0;
      var need=sigNeed[name]!=null?sigNeed[name]:fallbackNeed;
      if(need==null || need<=0) return have+'/?';
      return Math.min(have, need)+'/'+need;
    }

    function renderHeader(force){
      var now=Date.now();
      if(!force && now-lastHeaderTs<900){ return; }
      lastHeaderTs=now;
      var ss=SessionStats.get();
      left.innerHTML =
        'Start: ' + (ss.startTime? new Date(ss.startTime).toLocaleTimeString():'—') +
        ' | Bal: ' + fmt2(ss.startBalance) + ' → ' + fmt2(ss.lastBalance) +
        ' | P/L: ' + fmt2(ss.profitTotal) +
        ' | Wager: ' + fmt2(ss.volumeTotal) +
        ' | Trades: ' + ss.tradesTotal + ' (W/L/R ' + ss.wins + '/' + ss.losses + '/' + ss.returns + ')' +
        ' | Win%: ' + (ss.tradesTotal? (ss.wins/ss.tradesTotal*100).toFixed(1):'0.0');

      SignalEngine.ensureSigStats();
      var sqzStats=SigStats.SQZ||{};
      var emaStats=SigStats.EMAChain||{};
      var rsiStats=SigStats.RSIEMA||{};
      var totalOpens=(sqzStats.open||0)+(emaStats.open||0)+(rsiStats.open||0)+(SigStats.MAMA?SigStats.MAMA.open||0:0);
      function share(stat){
        if(!stat || !stat.open) return '—';
        var denom=Math.max(1,totalOpens);
        return (Math.round((stat.open/denom)*1000)/10).toFixed(1)+'%';
      }
      function wr(stat){
        var wins=stat.win||0;
        var losses=stat.loss||0;
        var denom=wins+losses;
        if(denom<=0) return '—';
        return (Math.round((wins/denom)*1000)/10).toFixed(1)+'%';
      }
      function avgScore(stat){
        if(!stat || !stat.open) return '—';
        var avg=stat.sumScore?stat.sumScore/stat.open:0;
        if(!isFinite(avg)) return '—';
        return avg.toFixed(2);
      }

      var pauseBadge=(PauseCtl && PauseCtl.isArmed())
        ? ' <span style="color:#ffcc00">PAUSE '+PauseCtl.remainingFmt()+'</span>'
        : '';

      var signalsBlock =
        'Signals:&nbsp;EMAChain [ready '+fmtReady('EMA50',50)+' | WR '+wr(emaStats)+' | share '+share(emaStats)+' | avgScore '+avgScore(emaStats)+']<br>'+
        '&nbsp;&nbsp;&nbsp;&nbsp;SQZ [ready '+fmtReady('SQZ20',20)+' | WR '+wr(sqzStats)+' | share '+share(sqzStats)+' | avgScore '+avgScore(sqzStats)+']<br>'+
        '&nbsp;&nbsp;&nbsp;&nbsp;RSIEMA [ready '+fmtReady('RSIEMA',50)+' | WR '+wr(rsiStats)+' | share '+share(rsiStats)+' | avgScore '+avgScore(rsiStats)+']';

      var filters=decisionState.filters||{};
      var decisionLine='Decision: last='+(decisionState.last||'—');
      var filtersLine='Filters: payout='+fmtOk(filters.payout)+' vol='+fmtOk(filters.vol)+' cooldown='+fmtOk(filters.cooldown);
      var skips=decisionState.skips||{};
      var skipsLine='Skips: payout '+(skips.payout||0)+' | low_vol '+(skips.low_vol||0)+' | conflict '+(skips.conflict||0)+' | cooldown '+(skips.cooldown||0);

      rightInfo.innerHTML =
        'Mode: <b>'+modeText+'</b>'+pauseBadge+' | Verter v'+VER+'<br>'+signalsBlock+'<br>'+decisionLine+'<br>'+filtersLine+'<br>'+skipsLine;
    }

    function renderCycleHistory(){
      if(!cycleHistoryBox) return;
      var lines = ['Cycle History:'];
      var historyLines = [];
      try{
        if(typeof getCycleLog === 'function'){
          var log = getCycleLog();
          var history = log && Array.isArray(log.history) ? log.history : [];
          if(history.length){
            var slice = history.slice(0, 5);
            for(var i=0;i<slice.length;i++){
              var entry = slice[i] || {};
              var idStr = entry.id!=null ? ('#'+entry.id) : '#?';
              var arrStr = entry.arrayId!=null ? ('A'+entry.arrayId) : 'A?';
              var resStr = (entry.result || '—').toString().toUpperCase();
              if(resStr.length>8) resStr = resStr.slice(0,8);
              var resPad = resStr.padEnd(5, ' ');
              var pnlVal = (typeof entry.pnl === 'number' && isFinite(entry.pnl)) ? entry.pnl : null;
              var pnlStr = pnlVal!=null ? ((pnlVal>=0?'+':'')+Math.abs(pnlVal).toFixed(2)) : '—';
              var maxStep = (typeof entry.maxStep === 'number' && isFinite(entry.maxStep)) ? entry.maxStep : '—';
              var win = entry.win!=null ? entry.win : 0;
              var loss = entry.loss!=null ? entry.loss : 0;
              var ret = entry.ret!=null ? entry.ret : 0;
              var durMs = entry.durationMs;
              var durStr;
              if(typeof durMs === 'number' && isFinite(durMs) && durMs>0){
                var totalSec = Math.floor(durMs/1000);
                var m = Math.floor(totalSec/60);
                var s = totalSec%60;
                durStr = (m<10?'0':'')+m+':' + (s<10?'0':'')+s;
              }else{
                durStr = '00:00';
              }
              historyLines.push(idStr+' '+arrStr+' '+resPad+'P/L='+pnlStr+' maxStep='+maxStep+' W/L/R='+win+'/'+loss+'/'+ret+' dur='+durStr);
            }
          }
        }
      }catch(e){ historyLines = []; }
      if(!historyLines.length){ historyLines.push('—'); }
      cycleHistoryBox.textContent = lines.concat(historyLines).join('\n');
    }

    var unsubscribe=tickSource.subscribe(function(p,ts){ Candles.onTick(p,ts); schedule(); renderHeader(); },200);
    setInterval(renderCycleHistory, 1000);
    renderCycleHistory();
    function stop(){ try{unsubscribe&&unsubscribe();}catch(e){} try{cancelAnimationFrame(raf);}catch(e){} const r = box.getBoundingClientRect(); return {pos:{left:r.left,top:r.top}}; }

    function requestRender(){ renderHeader(); }
    console.log('[VERTER][BOOT] DockBox (chart+panel, drag) v'+VER);
    return { stop, getState:function(){return Candles.getState();}, setMode, setSigReady, incSigHit, requestRender, updateDecision };
  })();

  /* [END MOD:UI] */
  const UI = Object.freeze({ DockBox });

  // [BEGIN MOD:Signals]
  // ===== Signals, Indicators & Providers =====
  var SignalEngine=(function(){
    const state={
      ready:{},
      needs:{ EMA3:3, EMA9:9, EMA15:15, EMA50:50, RSI14:14, ATR14:14, SQZ20:20 },
      ema:{3:null,9:null,15:null,50:null},
      rsi:null,
      atr14:null,
      atrSeries:[],
      atrMedian20:null,
      squeeze:{on:null, prevOn:null, momentum:0, basis:null, bbWidth:null, kcWidth:null, pending:null, lastReleaseTs:0},
      price:null,
      candles:[],
      closes:[],
      candidates:[],
      lastUpdate:0
    };

    function ensureSigStats(){
      if(typeof SigStats==='object' && SigStats){
        ['SQZ','EMAChain','RSIEMA','MAMA'].forEach(function(name){
          if(!SigStats[name]){
            SigStats[name]={open:0,win:0,loss:0,ret:0,sumScore:0,opensAt:[]};
          }else{
            if(typeof SigStats[name].sumScore!=='number') SigStats[name].sumScore=SigStats[name].sumScore||0;
            if(!Array.isArray(SigStats[name].opensAt)) SigStats[name].opensAt=[];
          }
        });
      }
    }

    function setReady(name, have, need){
      state.ready[name]=have;
      if(need!=null) state.needs[name]=need;
      try{ DockBox.setSigReady(name, have, need); }catch(e){}
    }

    function ema(arr, period){
      if(arr.length<=0) return [];
      var k=2/(period+1);
      var out=[];
      var prev=arr[0];
      for(var i=0;i<arr.length;i++){
        if(i===0){ prev=arr[i]; }
        else{ prev=arr[i]*k + prev*(1-k); }
        out.push(prev);
      }
      return out;
    }

    function sma(arr,len){
      if(arr.length<len) return [];
      var out=[], sum=0;
      for(var i=0;i<arr.length;i++){
        sum+=arr[i];
        if(i>=len) sum-=arr[i-len];
        if(i>=len-1) out.push(sum/len);
      }
      return out;
    }

    function stdev(arr,len){
      if(arr.length<len) return [];
      var out=[], q=[], sum=0;
      for(var i=0;i<arr.length;i++){
        q.push(arr[i]);
        sum+=arr[i];
        if(q.length>len) sum-=q.shift();
        if(q.length===len){
          var mean=sum/len;
          var s=0;
          for(var j=0;j<q.length;j++){
            var diff=q[j]-mean;
            s+=diff*diff;
          }
          out.push(Math.sqrt(s/len));
        }
      }
      return out;
    }

    function linregSlope(arr,len){
      if(arr.length<len) return 0;
      var slice=arr.slice(-len);
      var n=slice.length;
      var sx=0, sy=0, sxx=0, sxy=0;
      for(var i=0;i<n;i++){
        var x=i+1;
        var y=slice[i];
        sx+=x;
        sy+=y;
        sxx+=x*x;
        sxy+=x*y;
      }
      var denom=n*sxx - sx*sx;
      if(denom===0) return 0;
      return (n*sxy - sx*sy)/denom;
    }

    function calcRSI(closes, period){
      if(closes.length<=period) return null;
      var gains=0, losses=0;
      for(var i=1;i<=period;i++){
        var diff=closes[i]-closes[i-1];
        if(diff>=0) gains+=diff; else losses-=diff;
      }
      var avgGain=gains/period;
      var avgLoss=losses/period;
      for(var j=period+1;j<closes.length;j++){
        var d=closes[j]-closes[j-1];
        var gain=d>0?d:0;
        var loss=d<0?-d:0;
        avgGain=((avgGain*(period-1))+gain)/period;
        avgLoss=((avgLoss*(period-1))+loss)/period;
      }
      if(avgLoss===0){
        return 100;
      }
      var rs=avgGain/avgLoss;
      return 100 - (100/(1+rs));
    }

    function calcTR(candle, prevClose){
      var high=candle.H;
      var low=candle.L;
      var close=candle.C;
      var tr=Math.max(high-low, Math.abs(high-prevClose), Math.abs(low-prevClose));
      return {tr:tr, close:close};
    }

    function calcATRSeries(candles, period){
      if(candles.length<2) return [];
      var trs=[];
      var prevClose=candles[0].C;
      for(var i=1;i<candles.length;i++){
        var res=calcTR(candles[i], prevClose);
        trs.push(res.tr);
        prevClose=res.close;
      }
      if(trs.length<period) return [];
      var out=[];
      var sum=0;
      for(var j=0;j<trs.length;j++){
        sum+=trs[j];
        if(j>=period) sum-=trs[j-period];
        if(j>=period-1){ out.push(sum/period); }
      }
      return out;
    }

    function median(arr){
      if(!arr.length) return null;
      var copy=arr.slice().sort(function(a,b){ return a-b; });
      var mid=Math.floor(copy.length/2);
      if(copy.length%2) return copy[mid];
      return (copy[mid-1]+copy[mid])/2;
    }

    function updateIndicators(){
      var st=DockBox.getState();
      var candles=st.candlesM1.slice(-260);
      if(st.cur){
        candles=candles.concat([{O:st.cur.O,H:st.cur.H,L:st.cur.L,C:st.cur.lastP}]);
      }
      if(!candles.length){
        state.candles=[];
        state.closes=[];
        state.price=null;
        return;
      }
      var closes=candles.map(function(c){ return c.C; });
      state.candles=candles;
      state.closes=closes;
      state.price=closes[closes.length-1];
      state.lastUpdate=Date.now();

      setReady('EMA3', Math.min(closes.length,3), 3);
      setReady('EMA9', Math.min(closes.length,9), 9);
      setReady('EMA15', Math.min(closes.length,15), 15);
      setReady('EMA50', Math.min(closes.length,50), 50);

      function lastVal(arr){ return arr.length ? arr[arr.length-1] : null; }
      state.ema[3]=lastVal(ema(closes,3));
      state.ema[9]=lastVal(ema(closes,9));
      state.ema[15]=lastVal(ema(closes,15));
      state.ema[50]=lastVal(ema(closes,50));

      setReady('RSI14', Math.min(closes.length,14), 14);
      state.rsi=calcRSI(closes,14);

      var atrSeries=calcATRSeries(candles,14);
      state.atrSeries=atrSeries;
      state.atr14=atrSeries.length?atrSeries[atrSeries.length-1]:null;
      var atrForMedian=atrSeries.slice(-20);
      state.atrMedian20=atrForMedian.length?median(atrForMedian):null;
      setReady('ATR14', Math.min(candles.length,14), 14);

      var squeezeInfo=null;
      if(closes.length>=20){
        var sma20=sma(closes,20);
        var std20=stdev(closes,20);
        var atr20Series=calcATRSeries(candles,20);
        if(sma20.length && std20.length && atr20Series.length){
          var basis=lastVal(sma20);
          var sd=lastVal(std20);
          var atr20=lastVal(atr20Series);
          var upperBB=basis + 2*sd;
          var lowerBB=basis - 2*sd;
          var rangeBB=upperBB - lowerBB;
          var rangeKC=3*atr20; // 1.5 * 2
          var upperKC=basis + 1.5*atr20;
          var lowerKC=basis - 1.5*atr20;
          var on=(rangeBB <= (upperKC - lowerKC));
          var momentum=linregSlope(closes,20);
          squeezeInfo={ on:on, momentum:momentum, basis:basis, bbWidth:rangeBB, kcWidth:(upperKC-lowerKC) };
        }
      }
      if(squeezeInfo){
        setReady('SQZ20', Math.min(closes.length,20), 20);
        var sq=state.squeeze;
        sq.prevOn = sq.on;
        sq.on = squeezeInfo.on;
        sq.momentum=squeezeInfo.momentum;
        sq.basis=squeezeInfo.basis;
        sq.bbWidth=squeezeInfo.bbWidth;
        sq.kcWidth=squeezeInfo.kcWidth;
        if(sq.prevOn===null) sq.prevOn=sq.on;
        if(sq.prevOn===true && sq.on===false){
          var side = sq.momentum>0 ? 'BUY' : (sq.momentum<0 ? 'SELL' : null);
          if(side){
            sq.pending={name:'SQZ', side:side, strength:0.65, tags:{momentum:sq.momentum, basis:sq.basis}};
            sq.lastReleaseTs=Date.now();
          }
        }
      }else{
        setReady('SQZ20', Math.min(closes.length,20), 20);
      }
    }

    function boolChain(side){
      var e3=state.ema[3], e9=state.ema[9], e15=state.ema[15], e50=state.ema[50];
      if([e3,e9,e15,e50].some(function(v){ return v==null; })) return false;
      if(side==='BUY') return e3>e9 && e9>e15 && e15>e50;
      if(side==='SELL') return e3<e9 && e9<e15 && e15<e50;
      return false;
    }

    function collectCandidates(){
      ensureSigStats();
      updateIndicators();
      var cfgSignals=(globalThis.__VERTER_CFG__ && globalThis.__VERTER_CFG__.signals) || {};
      var cands=[];
      var price=state.price;
      var ema50=state.ema[50];

      if(cfgSignals.useEMAChain!==false){
        if(boolChain('BUY')){
          cands.push({name:'EMAChain', side:'BUY', strength:0.60, tags:{ema3:state.ema[3], ema9:state.ema[9], ema15:state.ema[15], ema50:ema50}});
        }else if(boolChain('SELL')){
          cands.push({name:'EMAChain', side:'SELL', strength:0.60, tags:{ema3:state.ema[3], ema9:state.ema[9], ema15:state.ema[15], ema50:ema50}});
        }
      }

      if(cfgSignals.useSQZ!==false){
        var pending=state.squeeze.pending;
        if(pending){
          cands.push(pending);
          state.squeeze.pending=null;
        }
      }

      if(cfgSignals.useRSIEMA!==false){
        var rsi=state.rsi;
        if(rsi!=null && ema50!=null && price!=null){
          if(rsi>60 && price>ema50){
            cands.push({name:'RSIEMA', side:'BUY', strength:0.55, tags:{rsi:rsi, price:price, ema50:ema50}});
          }else if(rsi<40 && price<ema50){
            cands.push({name:'RSIEMA', side:'SELL', strength:0.55, tags:{rsi:rsi, price:price, ema50:ema50}});
          }
        }
      }

      if(cfgSignals.useMAMA){
        // Placeholder for future MAMA integration
      }

      state.candidates=cands;
      return cands;
    }

    function getState(){
      return {
        ready: Object.assign({}, state.ready),
        needs: Object.assign({}, state.needs),
        ema: Object.assign({}, state.ema),
        rsi: state.rsi,
        atr14: state.atr14,
        atrMedian20: state.atrMedian20,
        squeeze: Object.assign({}, state.squeeze),
        price: state.price,
        closes: state.closes.slice(),
        candles: state.candles.slice(),
        lastUpdate: state.lastUpdate,
        candidates: state.candidates.slice()
      };
    }

    var SIG={
      dump:function(){
        try{
          var ctx = (typeof DecisionEngine!=='undefined' && DecisionEngine && typeof DecisionEngine.buildCtx==='function') ? DecisionEngine.buildCtx() : null;
          var data=state.candidates.map(function(c){
            var scored=null;
            if(ctx && DecisionEngine && typeof DecisionEngine.scoreCandidate==='function'){
              scored=DecisionEngine.scoreCandidate(c, ctx);
            }
            return {
              name:c.name,
              side:c.side,
              strength:c.strength,
              score:scored && typeof scored.score==='number'?scored.score:null,
              parts:scored && scored.parts?scored.parts:null,
              tags:c.tags
            };
          });
          console.log('[SIG.dump]', data);
        }catch(e){ try{ console.log('[SIG.dump][ERR]', e); }catch(err){} }
      }
    };
    try{ globalThis.SIG = SIG; }catch(e){}

    return { collectCandidates, getState, ensureSigStats };
  })();

  /* [END MOD:Signals] */
  const Signals = Object.freeze({ collectCandidates: SignalEngine.collectCandidates, getState: SignalEngine.getState });

  // [BEGIN MOD:Decision]
  var DecisionEngine=(function(){
    const CFG={
      signals:{useEMAChain:true,useSQZ:true,useRSIEMA:true,useMAMA:false},
      thresholds:{scoreMin:0.70,payoutMin:0.90,cooldownSec:60},
      weights:{wSig:0.60,wTrend:0.20,wVol:0.10,wRSI:0.05,wSQZ:0.05,wCandle:0.10},
      sig:function(next){ if(next&&typeof next==='object'){ Object.assign(this.signals, next); try{ DockBox.requestRender(); }catch(e){} } return this.signals; },
      th:function(next){ if(next&&typeof next==='object'){ Object.assign(this.thresholds, next); try{ DockBox.requestRender(); }catch(e){} } return this.thresholds; },
      w:function(next){ if(next&&typeof next==='object'){ Object.assign(this.weights, next); try{ DockBox.requestRender(); }catch(e){} } return this.weights; }
    };
    try{ globalThis.__VERTER_CFG__=CFG; globalThis.CFG = CFG; }catch(e){}

    const state={
      lastDecision:null,
      lastConflict:null,
      skips:{payout:0, low_vol:0, cooldown:0, conflict:0},
      lastFilters:{payout:null, vol:null, cooldown:null},
      lastCtx:null,
      lastTradeTs:0
    };

    function boolSide(entry, side){
      if(entry==null) return false;
      if(typeof entry==='function') return !!entry(side);
      if(typeof entry==='object'){ return !!entry[side]; }
      return !!entry;
    }

    function analyzeCandles(candles){
      var res={boost:{BUY:0,SELL:0}, block:{BUY:false,SELL:false}};
      if(!Array.isArray(candles) || candles.length<3) return res;
      var closed=candles.slice();
      if(closed.length>1){ closed=closed.slice(0,-1); }
      if(closed.length<2) return res;
      var cur=closed[closed.length-1];
      var prev=closed[closed.length-2];
      function isBullishEngulf(p, c){
        if(!p||!c) return false;
        return p.C<p.O && c.C>c.O && c.O<=p.C && c.C>=p.O;
      }
      function isBearishEngulf(p, c){
        if(!p||!c) return false;
        return p.C>p.O && c.C<c.O && c.O>=p.C && c.C<=p.O;
      }
      if(isBullishEngulf(prev, cur)) res.boost.BUY=0.15;
      if(isBearishEngulf(prev, cur)) res.boost.SELL=0.15;

      var rangeLook=Math.min(50, closed.length);
      var recent=closed.slice(-rangeLook);
      var hi=-1e9, lo=1e9;
      for(var i=0;i<recent.length;i++){
        var c=recent[i];
        if(c.H>hi) hi=c.H;
        if(c.L<lo) lo=c.L;
      }
      var last=cur;
      var body=Math.abs(last.C-last.O);
      var upper=last.H-Math.max(last.C,last.O);
      var lower=Math.min(last.C,last.O)-last.L;
      var span=last.H-last.L;
      if(span>0){
        var bodyPct=body/span;
        var upperPct=upper/span;
        var lowerPct=lower/span;
        var range=Math.max(hi-lo, span);
        var tol=range*0.1;
        if(bodyPct<=0.25){
          if(lowerPct>=0.6 && Math.abs(last.L-lo)<=tol){
            res.block.SELL=true;
          }
          if(upperPct>=0.6 && Math.abs(last.H-hi)<=tol){
            res.block.BUY=true;
          }
        }
      }
      return res;
    }

    function buildCtxInternal(){
      var snap=SignalEngine.getState();
      var rsi=snap.rsi;
      var atr14=snap.atr14;
      var atrMedian=snap.atrMedian20;
      var trendMap={
        BUY: snap.ema && snap.ema[3]!=null && snap.ema[9]!=null && snap.ema[15]!=null && snap.ema[50]!=null && snap.ema[3]>snap.ema[9] && snap.ema[9]>snap.ema[15] && snap.ema[15]>snap.ema[50],
        SELL: snap.ema && snap.ema[3]!=null && snap.ema[9]!=null && snap.ema[15]!=null && snap.ema[50]!=null && snap.ema[3]<snap.ema[9] && snap.ema[9]<snap.ema[15] && snap.ema[15]<snap.ema[50]
      };
      var payoutRaw=readProfitPercent();
      var payoutOk=payoutRaw!=null ? (payoutRaw/100)>=CFG.thresholds.payoutMin : false;
      var volOk=(atr14!=null && atrMedian!=null) ? atr14>=atrMedian : false;
      var since = state.lastTradeTs? Math.floor((Date.now()-state.lastTradeTs)/1000):1e9;
      var cooldownOk=since>=CFG.thresholds.cooldownSec;
      var sqz=snap.squeeze||{};
      var sqzMap={
        BUY: sqz.on===false && sqz.momentum>0,
        SELL: sqz.on===false && sqz.momentum<0
      };
      var rsiMap={
        BUY: rsi!=null && rsi>=55,
        SELL: rsi!=null && rsi<=45
      };
      var candleInfo=analyzeCandles(snap.candles||[]);
      var filters={ payout:payoutOk, vol:volOk, cooldown:cooldownOk };
      var ctx={
        trendOk:trendMap,
        volOk:volOk,
        rsiOk:rsiMap,
        sqzOk:sqzMap,
        candleBoost:candleInfo.boost,
        candleBlock:candleInfo.block,
        atr14:atr14,
        atrMedian20:atrMedian,
        atrRatio:(atr14!=null && atrMedian!=null && atrMedian!==0)?(atr14/atrMedian):null,
        price:snap.price,
        rsi:rsi,
        squeeze:sqz,
        payout:payoutRaw,
        filters:filters,
        secsSinceLastTrade:since,
        snap:snap
      };
      state.lastFilters=filters;
      return ctx;
    }

    function candleBoostFor(ctx, side){
      if(!ctx || !ctx.candleBoost) return 0;
      if(typeof ctx.candleBoost==='object') return ctx.candleBoost[side]||0;
      return ctx.candleBoost||0;
    }

    function isBlocked(ctx, side){
      if(!ctx || !ctx.candleBlock) return false;
      if(typeof ctx.candleBlock==='object') return !!ctx.candleBlock[side];
      return !!ctx.candleBlock;
    }

    function scoreCandidate(c,ctx){
      const W=CFG.weights;
      const trend=boolSide(ctx.trendOk, c.side);
      const vol=!!ctx.volOk;
      const rsi=boolSide(ctx.rsiOk, c.side);
      const sqz=boolSide(ctx.sqzOk, c.side);
      const candle=candleBoostFor(ctx, c.side)||0;
      const score = W.wSig*c.strength + W.wTrend*(trend?1:0)
        + W.wVol*(vol?1:0) + W.wRSI*(rsi?1:0)
        + W.wSQZ*(sqz?1:0) + W.wCandle*(candle||0);
      return {
        score:score,
        parts:{
          trend:trend?1:0,
          vol:vol?1:0,
          rsi:rsi?(ctx.rsi!=null?ctx.rsi/100:1):0,
          sqz:sqz?(ctx.squeeze && ctx.squeeze.momentum?ctx.squeeze.momentum:1):0,
          candle:candle||0
        }
      };
    }

    function pickBest(cands,ctx){
      if(!Array.isArray(cands) || !cands.length){ state.lastConflict=null; return null; }
      var arr=cands.map(function(c){
        if(isBlocked(ctx, c.side)) return null;
        var res=scoreCandidate(c,ctx);
        return Object.assign({}, c, { score:res.score, parts:res.parts });
      }).filter(function(x){ return x && x.score>=CFG.thresholds.scoreMin; });
      arr.sort(function(a,b){ return b.score-a.score; });
      if(!arr.length){ state.lastConflict=null; return null; }
      var top=arr[0];
      var rival=arr.find(function(x){ return x.side!==top.side; });
      if(rival && Math.abs(top.score-rival.score)<0.03){
        var prio=['SQZ','EMAChain','RSIEMA','MAMA'];
        var topIdx=prio.indexOf(top.name);
        var rivalIdx=prio.indexOf(rival.name);
        if(rivalIdx!==-1 && rivalIdx<topIdx){
          state.lastConflict=null;
          return rival;
        }
        if(topIdx===rivalIdx){
          state.lastConflict={top:top,rival:rival,delta:Math.abs(top.score-rival.score)};
          return null;
        }
      }
      state.lastConflict=null;
      return top;
    }

    function updateFilters(filters){
      state.lastFilters=filters;
      try{ DockBox.updateDecision({ filters }); }catch(e){}
    }

    function noteDecision(decision, ctx){
      if(decision) state.lastDecision=decision;
      state.lastCtx=ctx;
      var display = decision || state.lastDecision || null;
      try{
        DockBox.updateDecision({ last: display ? (display.name+' '+display.side+' score='+display.score.toFixed(2)) : '—' });
      }catch(e){}
    }

    function noteSkip(reason){
      if(reason && state.skips.hasOwnProperty(reason)){
        state.skips[reason]++;
        try{ DockBox.updateDecision({ skips:{ [reason]:1 } }); }catch(e){}
      }
    }

    function noteTradeOpen(){ state.lastTradeTs=Date.now(); }

    function secsSinceLastTrade(){ return state.lastTradeTs? Math.floor((Date.now()-state.lastTradeTs)/1000):1e9; }

    function getLastConflict(){ return state.lastConflict; }

    return {
      CFG,
      buildCtx:buildCtxInternal,
      pickBest,
      scoreCandidate,
      updateFilters,
      noteDecision,
      noteSkip,
      noteTradeOpen,
      secsSinceLastTrade,
      getLastConflict
    };
  })();

  function buildCtx(){ return DecisionEngine.buildCtx(); }

  /* [END MOD:Decision] */

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
          try{
            SessionStats.onClose(type, null, bal, pending?pending.amount:null);
            // ===== MARTINGALE INTEGRATION (app5) :: step update + cycle check =====
            if (typeof MARTIN_ENABLED!=='undefined' && MARTIN_ENABLED){
              let cycleTerminated=false;
              const tradeStep = pending && typeof pending.step==='number' ? pending.step : null;
              try{ cl_noteClose(type, delta); }catch(e){}
              try{ cl_touchStep(tradeStep); }catch(e){}
              try{ CycleAcc.trades++; }catch(e){}
              if(type==='WIN'){
                try{ CycleAcc.won++; }catch(e){}
                try{ currentBetStep = step0(); }catch(e){}
              } else if(type==='LOSS'){
                try{ CycleAcc.loss++; }catch(e){}
                let pnl = null;
                try{
                  const snapLoss = SessionStats.snapshot();
                  if(snapLoss && typeof snapLoss.profitTotal === 'number'){ pnl = snapLoss.profitTotal; }
                }catch(e){}
                const nextBet = betValOf(currentBetStep);
                const willBreach = (typeof pnl === 'number') ? (pnl - nextBet) < limitLoss : false;
                if(!isMaxStep(currentBetStep)){
                  const idx = stepIdxOf(currentBetStep);
                  const next = idx>=0 ? betArray[idx+1] : null;
                  if(next && typeof next.step==='number'){ currentBetStep = next.step; }
                } else {
                  if(willBreach){
                    cycleEnd('lose');
                    cycleTerminated=true;
                  } else {
                    currentBetStep = step0();
                    const baseBet = betValOf(step0());
                    const pnlStr = (typeof pnl === 'number' && isFinite(pnl)) ? pnl.toFixed(2) : 'n/a';
                    try{ console.log('[MG][RESET] step=max reset-to-0; array=%d pnl=%s next=%s', currentBetArrayId, pnlStr, baseBet.toFixed(2)); }catch(e){}
                  }
                }
              } else {
                try{ CycleAcc.ret++; }catch(e){}
              }
              if(!cycleTerminated){
                try{
                  var ss=SessionStats.snapshot();
                  var nextBetChk = betValOf(currentBetStep);
                  if(ss && typeof ss.profitTotal==='number'){
                    if(ss.profitTotal>limitWin){ cycleEnd('win'); }
                    else if((ss.profitTotal - nextBetChk) < limitLoss){ cycleEnd('lose'); }
                  }
                }catch(e){}
              }
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

      var cands=SignalEngine.collectCandidates();
      var ctx=buildCtx();
      DecisionEngine.updateFilters(ctx.filters||{});
      if(!ctx.filters || ctx.filters.payout!==true){
        DecisionEngine.noteSkip('payout');
        DecisionEngine.noteDecision(null, ctx);
        console.log('[SKIP] reason=payout payout=%s thr=%s', fmt2(ctx.payout), fmt2(DecisionEngine.CFG.thresholds.payoutMin*100));
        return;
      }
      if(ctx.volOk!==true){
        DecisionEngine.noteSkip('low_vol');
        DecisionEngine.noteDecision(null, ctx);
        console.log('[SKIP] reason=low_vol atr=%s median=%s', fmt2(ctx.atr14), fmt2(ctx.atrMedian20));
        return;
      }
      if(!ctx.filters.cooldown){
        DecisionEngine.noteSkip('cooldown');
        DecisionEngine.noteDecision(null, ctx);
        console.log('[SKIP] reason=cooldown secs=%s', ctx.secsSinceLastTrade);
        return;
      }

      var best=DecisionEngine.pickBest(cands, ctx);
      if(!best){
        DecisionEngine.noteDecision(null, ctx);
        var conflict=DecisionEngine.getLastConflict && DecisionEngine.getLastConflict();
        if(conflict){
          DecisionEngine.noteSkip('conflict');
          console.log('[SKIP] reason=conflict top=%s rival=%s Δ=%s', conflict.top.name, conflict.rival.name, fmt2(conflict.delta));
        }
        return;
      }

      DecisionEngine.noteDecision(best, ctx);
      var sig=best.name;
      var side=best.side;
      if(!sig || !side) return;
      var parts=best.parts||{};
      function partVal(k){
        var v=parts[k];
        if(v==null) return '0';
        if(k==='trend' || k==='vol') return v ? '1' : '0';
        if(typeof v==='number') return parseFloat(Number(v).toFixed(2)).toString();
        return String(v);
      }
      var partsStr='{trend:'+partVal('trend')+' vol:'+partVal('vol')+' rsi:'+partVal('rsi')+' sqz:'+partVal('sqz')+' candle:'+partVal('candle')+'}';
      try{ console.log('[SIG:SELECT] name=%s side=%s score=%s parts=%s', sig, side, best.score.toFixed(2), partsStr); }catch(e){}
      var payout = readProfitPercent();
      var payoutFmt = payout!=null ? fmt2(payout) : '—';
      var payoutThr = Math.round(DecisionEngine.CFG.thresholds.payoutMin*100);

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
        var pendingRec = TradeBridge.arm(side, amount, { sig, score:best.score });
        if(pendingRec){
          pendingRec.sent = true;
          pendingRec.openedAt = Date.now();
        }
        var keyNonMg = sigKeyOf(sig);
        if(keyNonMg && SigStats && SigStats[keyNonMg]){
          SigStats[keyNonMg].open++;
          SigStats[keyNonMg].sumScore = (SigStats[keyNonMg].sumScore||0) + (best.score||0);
          if(pendingRec && pendingRec.openedAt!=null){ SigStats[keyNonMg].opensAt.push(pendingRec.openedAt); }
        }
        DecisionEngine.noteTradeOpen();
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
        var pendingRecMg = TradeBridge.arm(side, betVal, { sig, score:best.score });
        if(pendingRecMg){
          pendingRecMg.sent = true;
          pendingRecMg.openedAt = Date.now();
        }
        var keyMg = sigKeyOf(sig);
        if(keyMg && SigStats && SigStats[keyMg]){
          SigStats[keyMg].open++;
          SigStats[keyMg].sumScore = (SigStats[keyMg].sumScore||0) + (best.score||0);
          if(pendingRecMg && pendingRecMg.openedAt!=null){ SigStats[keyMg].opensAt.push(pendingRecMg.openedAt); }
        }
        DecisionEngine.noteTradeOpen();
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

function maxStepIdx(){ return Math.max(0, betArray.length - 1); }
function stepIdxOf(step){ return betArray.findIndex(o=>o.step===step); }
function isMaxStep(step){ const idx = stepIdxOf(step); return idx >= 0 && idx === maxStepIdx(); }
function betValOf(step){
  const idx = stepIdxOf(step);
  if(idx >= 0) return betArray[idx].value;
  return betArray.length ? betArray[0].value : 0;
}
function step0(){ return betArray.length ? betArray[0].step : 0; }
function getBetValue(step){ return betValOf(step); }

// Состояние MG
let currentBetStep = step0();
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

const CycleLog = { current: null, history: [] };
const CYCLE_LOG_MAX = 15;

function cl_start(id, arrayId, limits){
  let startProfit = null;
  try{
    const snap = SessionStats.snapshot();
    if(snap && typeof snap.profitTotal === 'number'){ startProfit = snap.profitTotal; }
  }catch(e){}
  CycleLog.current = {
    id,
    arrayId,
    limits: limits || null,
    startedAt: Date.now(),
    startProfit,
    pnl: 0,
    win: 0,
    loss: 0,
    ret: 0,
    maxStep: 0
  };
}
function cl_noteClose(type, pnlDelta){
  const cur = CycleLog.current;
  if(!cur) return;
  if(type === 'WIN') cur.win++;
  else if(type === 'LOSS') cur.loss++;
  else if(type === 'RET') cur.ret++;
  if(typeof pnlDelta === 'number' && isFinite(pnlDelta)){
    cur.pnl = r2((cur.pnl || 0) + pnlDelta);
  }
  cur.lastCloseAt = Date.now();
}
function cl_touchStep(step){
  if(typeof step !== 'number' || !isFinite(step)) return;
  if(step > maxStepInCycle){ maxStepInCycle = step; }
  if(CycleAcc.maxStep < maxStepInCycle){ CycleAcc.maxStep = maxStepInCycle; }
  const cur = CycleLog.current;
  if(cur){ if(typeof cur.maxStep !== 'number' || step > cur.maxStep){ cur.maxStep = step; } }
}
function cl_end(status){
  const now = Date.now();
  const cur = CycleLog.current;
  const entry = {
    id: cur ? cur.id : CycleAcc.id,
    arrayId: cur ? cur.arrayId : currentBetArrayId,
    result: (status || '').toUpperCase(),
    pnl: null,
    maxStep: Math.max(cur && typeof cur.maxStep === 'number' ? cur.maxStep : 0, CycleAcc.maxStep || 0),
    win: cur ? cur.win : CycleAcc.won,
    loss: cur ? cur.loss : CycleAcc.loss,
    ret: cur ? cur.ret : CycleAcc.ret,
    startedAt: cur ? cur.startedAt : null,
    endedAt: now,
    durationMs: cur && cur.startedAt ? Math.max(0, now - cur.startedAt) : 0
  };
  try{
    const snap = SessionStats.snapshot();
    if(snap && typeof snap.profitTotal === 'number'){
      const start = cur && typeof cur.startProfit === 'number' ? cur.startProfit : null;
      if(start != null){ entry.pnl = r2(snap.profitTotal - start); }
    }
  }catch(e){}
  if(entry.pnl == null){
    if(cur && typeof cur.pnl === 'number'){ entry.pnl = cur.pnl; }
    else if(CycleAcc.endBal != null && CycleAcc.startBal != null){ entry.pnl = r2(CycleAcc.endBal - CycleAcc.startBal); }
  }
  CycleLog.history.unshift(entry);
  if(CycleLog.history.length > CYCLE_LOG_MAX){ CycleLog.history = CycleLog.history.slice(0, CYCLE_LOG_MAX); }
  const durFmt = (function(ms){
    if(!isFinite(ms) || ms <= 0) return '00:00';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const mm = m < 10 ? '0' + m : String(m);
    const ss = s < 10 ? '0' + s : String(s);
    return mm + ':' + ss;
  })(entry.durationMs);
  const pnlStr = (typeof entry.pnl === 'number' && isFinite(entry.pnl)) ? ((entry.pnl>=0?'+':'')+Math.abs(entry.pnl).toFixed(2)) : '—';
  try{
    console.log('[CYCLE][STAT] id=%s array=%s result=%s pnl=%s maxStep=%s W/L/R=%s/%s/%s dur=%s',
      entry.id, entry.arrayId, entry.result, pnlStr, entry.maxStep, entry.win, entry.loss, entry.ret, durFmt);
  }catch(e){}
  CycleLog.current = null;
}
function getCycleLog(){ return CycleLog; }
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
  CycleAcc.maxStep=0; CycleAcc.startedAt=Date.now(); CycleAcc.betArray = currentBetArrayId;
  CycleAcc.startBal = ss.lastBalance!=null ? ss.lastBalance : (BalanceStable.getStable()||Balance.read()||null);
  maxStepInCycle=0; currentBetStep=step0();
  console.log('[CYCLE-START] #'+CycleAcc.id+' array='+currentBetArrayId+' limits=win:'+limitWin+'|loss:'+limitLoss+' step='+currentBetStep);
  try{ cl_start(CycleAcc.id, currentBetArrayId, { win: limitWin, loss: limitLoss }); }catch(e){}
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
  try{ cl_end(status); }catch(e){}
  CycleAcc.id++;
  setArrayById(status==='lose' ? (currentBetArrayId===1?2:(currentBetArrayId===2?3:1)) : 1);
  currentBetStep=step0(); maxStepInCycle=0; cycleStart();
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
const MG = Object.freeze({ MARTIN_ENABLED, getBetValue, setArrayById, cycleStart, cycleEnd, CycleAcc, getCycleLog, __mg_init__ });
