// ==UserScript==
// @name        app102-0.1.5
// @namespace   http://tampermonkey.net/
// @version     0.1.5
// @description Quantized candles from minute-zero; smooth RAF chart; in-panel layout; visible TF black button
// @match       https://pocketoption.com/*
// @run-at      document-idle
// ==/UserScript==

// const mode = 'REAL';
const mode = 'DEMO';

const allowedWinPercent = 85;

const appversion = "Terminator ver. 102 sqzMom";
const reverse = false; // Change to true for reverse mode
const antiMartingale = false; // Change to true for anti-martingale mode
// const webhookUrl = 'https://script.google.com/macros/s/AKfycbyz--BcEvGJq05MN5m9a6uGiUUhYe8WrpxOKMWE6qstfj15j9L8ahnK7DaVWaSbPAPG/exec'; //A1
const webhookUrl = 'https://script.google.com/macros/s/AKfycbyWTd02Yqc5rg3PAJCl9WgXb8UwRBNGtpolCCH89uTVp-ejNHaUgRhgi4xCrIVMeRjM/exec'; //M2
// const webhookUrl = 'https://script.google.com/macros/s/AKfycbyg_EJGKWqDAVhQDam8UKOt9wD7T8PXoBevnwcShqMo7cWLysV-tPfPyrchZIm52r-a/exec'; //O3
class SqueezeMomentumIndicator {
    constructor(length = 20, mult = 2.0, lengthKC = 20, multKC = 1.5, useTrueRange = true) {
        this.length = length;
        this.mult = mult;
        this.lengthKC = lengthKC;
        this.multKC = multKC;
        this.useTrueRange = useTrueRange;
        this.data = [];
    }

    update(price) {
        // Assume high and low are the same as the closing price
        const bar = { high: price, low: price, close: price };
        this.data.push(bar);

        if (this.data.length > this.lengthKC) {
            this.data.shift();
        }

        if (this.data.length === this.lengthKC) {
            return this.calculate();
        }

        return null;
    }

    calculate() {
        const source = this.data.map(b => b.close);
        const highs = this.data.map(b => b.high);
        const lows = this.data.map(b => b.low);

        // Calculate Bollinger Bands
        const basis = this.sma(source, this.length);
        const dev = this.mult * this.stdev(source, this.length);
        const upperBB = basis + dev;
        const lowerBB = basis - dev;

        // Calculate Keltner Channels
        const ma = this.sma(source, this.lengthKC);
        const range = this.useTrueRange ? this.trueRange() : highs.map((h, i) => h - lows[i]);
        const rangema = this.sma(range, this.lengthKC);
        const upperKC = ma + rangema * this.multKC;
        const lowerKC = ma - rangema * this.multKC;

        // Squeeze Conditions
        const sqzOn = (lowerBB > lowerKC) && (upperBB < upperKC);
        const sqzOff = (lowerBB < lowerKC) && (upperBB > upperKC);
        const noSqz = !sqzOn && !sqzOff;

        // Calculate Momentum Value
        const highestHigh = Math.max(...highs);
        const lowestLow = Math.min(...lows);
        const avgHL = (highestHigh + lowestLow) / 2;
        const smaClose = this.sma(source, this.lengthKC);
        const val = this.linreg(source.map((s, i) => s - (avgHL + smaClose) / 2), this.lengthKC, 0);

        // Determine Colors
        const bcolor = val > 0 
            ? (val > (this.lastVal || 0) ? '#32CD32' : '#008000')
            : (val < (this.lastVal || 0) ? '#DD0000' : '#800000');

        const scolor = noSqz ? '#0080FF' : sqzOn ? '#FF8000' : '#AAAAAA';

        this.lastVal = val;

        return {
            value: val,
            bcolor,
            scolor,
            sqzOn,
            sqzOff,
            noSqz
        };
    }

    sma(data, period) {
        const sum = data.slice(-period).reduce((a, b) => a + b, 0);
        return sum / period;
    }

    stdev(data, period) {
        const avg = this.sma(data, period);
        const variance = data.slice(-period).reduce((a, b) => a + Math.pow(b - avg, 2), 0) / period;
        return Math.sqrt(variance);
    }

    trueRange() {
        const tr = [];
        for (let i = 1; i < this.data.length; i++) {
            const prevClose = this.data[i - 1].close;
            const high = this.data[i].high;
            const low = this.data[i].low;
            tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
        }
        return tr;
    }

    linreg(data, period, offset) {
        const x = Array.from({ length: period }, (_, i) => i + 1);
        const y = data.slice(-period);
        const n = period;
        const xSum = x.reduce((a, b) => a + b, 0);
        const ySum = y.reduce((a, b) => a + b, 0);
        const xySum = x.map((xi, i) => xi * y[i]).reduce((a, b) => a + b, 0);
        const xSqrSum = x.map(xi => xi * xi).reduce((a, b) => a + b, 0);
        const slope = (n * xySum - xSum * ySum) / (n * xSqrSum - xSum * xSum);
        const intercept = (ySum - slope * xSum) / n;
        return slope * (period + offset) + intercept;
    }
}

// Initialize the SqueezeMomentumIndicator
const squeezeMomentumIndicator = new SqueezeMomentumIndicator();

let humanTime = (time) => {
    let h = (new Date(time).getHours()).toString();
    if (h < 10){
        h = '0'+h;
    }
    let m = (new Date(time).getMinutes()).toString();
    if (m < 10){
        m = '0'+m;
    }
    let s = (new Date(time).getSeconds()).toString();
    if (s < 10){
        s = '0'+s;
    }
    let humanTime = h +':'+ m+':'+ s;
    return humanTime;
}

let time = Date.now();
let hTime = humanTime(time);
let startTime = hTime;

let maxStepInCycle = 0;

//SQUEEZE MOMENTUM
let dynamicSqeezeBar;
let momentumMultiplier = 2;
let sqzScaleFactor = 1;
let sqzMomScaleFactorY = 1;
let closeStack = [];
let lowStack = [];
let highStack = [];
let trStack = [];
const lbStack = [];
let sqzMaxArray = [];
let absMax = 0;
let sqzMomArray = [];
let sqzMomHistory = [];

let sqzMomParams;

let lastPrice;

// MESA calc values
const mesaPeriodStack = [];
const phaseStack = [];
const mamaStack = [];
const famaStack = [];
const detrenderStack = [];
const i1Stack = [];
const q1Stack = [];
const jiStack = [];
const jqStack = [];
const i2Stack = [];
const q2Stack = [];
const reStack = [];
const imStack = [];
const valueStack = [];
const smoothStack = [];

let mamafama;

let mamaArray = [];
let famaArray = [];
let mesaArray = [];

let cyclesToPlay = 10;
let cyclesStats = [];

let tradingAllowed = true;

const limitWin1 = 10;
const limitLoss1 = -30;
 
const limitWin2 = 50;
const limitLoss2 = -70;
 
const limitWin3 = 120;
const limitLoss3 = -170;
 
let limitWin = limitWin1;
let limitLoss = limitLoss1;
 
let globalTrend; 
let globalBets = []; 
let firstPriceTrendArray = []; 
 
const betArray1 = [
    {step: 0, value: 1, pressCount: 0},
    {step: 1, value: 3, pressCount: 2}, 
    {step: 2, value: 8, pressCount: 7}, 
    {step: 3, value: 20, pressCount: 11}  
]; 
const betArray2 = [ 
    {step: 0, value: 3, pressCount: 2}, 
    {step: 1, value: 8, pressCount: 7}, 
    {step: 2, value: 20, pressCount: 11}, 
    {step: 3, value: 45, pressCount: 16} 
]; 
const betArray3 = [ 
    {step: 0, value: 8, pressCount: 7}, 
    {step: 1, value: 20, pressCount: 11}, 
    {step: 2, value: 45, pressCount: 16},
    {step: 3, value: 90, pressCount: 21}
];

let betArray = betArray1;
let betHistory = [];
let priceTrendHistory = [];
let priceTrend;
let priceHistory = [];
let currentBalance;
let currentProfit = 0;
let profitDiv;
let profitPercentDivAdvisor;
let timeDiv;
let wonDiv;
let wagerDiv;
let totalWager = 0;
let historyDiv;
let cyclesDiv;
let cyclesHistoryDiv;
let totalProfitDiv;
let historyBetDiv;
let sqzDiv;
let trendDiv;
let globalTrendDiv;
let tradeDirectionDiv;
let globalPrice;

// [BEGIN BLOCK:CANDLE_BUILDER_V2]
/**
 * Построение OHLC строго по квантам, выровненным на начало минуты.
 * Все ТФ (5s, 10s, 15s, 30s, 1m, 5m) стартуют от t % 60000 === 0.
 */
const MTC = (() => {
  const TF = { '5s':5000, '10s':10000, '15s':15000, '30s':30000, '1m':60000, '5m':300000 };
  const frames = { '5s':[], '10s':[], '15s':[], '30s':[], '1m':[], '5m':[] };
  const cur = {}; // текущие незакрытые бары по каждому ТФ {label:{t,O,H,L,C}}

  // helper: ближайшая левая граница кванта, выровненная на начало минуты
  function quantStart(now, period){
    const min0 = Math.floor(now/60000)*60000;
    const dt = (now - min0) % period;
    return now - dt;
  }

  // инициализируем текущие бары на первой валидной цене
  let seeded = false;
  function seedIfNeeded(now, price){
    if (seeded || !Number.isFinite(price)) return;
    Object.entries(TF).forEach(([label,period]) => {
      const t0 = quantStart(now, period);
      cur[label] = { t:t0, O:price, H:price, L:price, C:price };
    });
    seeded = true;
  }

  // поступление «тика» цены
  function onTick(now, price){
    if (!Number.isFinite(price)) return;
    seedIfNeeded(now, price);
    if (!seeded) return;

    let closed = false;

    Object.entries(TF).forEach(([label,period]) => {
      const tSlot = quantStart(now, period);
      let bar = cur[label];

      // новая ячейка времени — закрыть предыдущую и открыть новую на границе
      if (tSlot > bar.t){
        // push закрытый бар
        frames[label].push({ t: bar.t + period, O:bar.O, H:bar.H, L:bar.L, C:bar.C });
        if (frames[label].length > 600) frames[label].splice(0, frames[label].length - 600);
        // открыть новый бар на границе кванта
        cur[label] = { t: tSlot, O:price, H:price, L:price, C:price };
        closed = true;
      }else{
        // обновление текущего бара
        bar.H = Math.max(bar.H, price);
        bar.L = Math.min(bar.L, price);
        bar.C = price;
      }
    });

    // хук перерисовки: по каждому тику и при закрытии бара
    try { window.__MTC_scheduleDraw && window.__MTC_scheduleDraw(closed); } catch(_) {}
    // лог на уровне закрытия бара
    if (closed){
      Object.keys(TF).forEach(label => {
        const arr = frames[label];
        if (arr.length){
          const last = arr[arr.length - 1];
          console.log(`[CANDLE][${label}] O=${last.O} H=${last.H} L=${last.L} C=${last.C} t=${new Date(last.t).toISOString()}`);
        }
      });
    }
  }

  // публичное API
  return { TF, frames, cur, onTick };
})();
// [END BLOCK:CANDLE_BUILDER_V2]

// [BEGIN BLOCK:CANDLE_BUILDER]
const candleStore = {
  ticks: [],
  frames: { '5s': [], '10s': [], '15s': [], '30s': [], '1m': [], '5m': [] }
};

function startCandleBuilder(){
  setInterval(() => {
    const now = Date.now();
    candleStore.ticks.push({ t: now, p: globalPrice });
    const cutoff = now - 360000; // keep 6 min
    candleStore.ticks = candleStore.ticks.filter(x => x.t >= cutoff);
  }, 1000);

  buildFrame('5s',  5000);
  buildFrame('10s', 10000);
  buildFrame('15s', 15000);
  buildFrame('30s', 30000);
  buildFrame('1m',  60000);
  buildFrame('5m', 300000);
}

function buildFrame(label, periodMs){
  setInterval(() => {
    const now = Date.now();
    const from = now - periodMs;
    const arr = candleStore.ticks.filter(x => x.t >= from);
    if (arr.length){
      const O = arr[0].p;
      const H = Math.max(...arr.map(x => x.p));
      const L = Math.min(...arr.map(x => x.p));
      const C = arr[arr.length - 1].p;
      candleStore.frames[label].push({ t: now, O, H, L, C });
      if (candleStore.frames[label].length > 600)
        candleStore.frames[label].splice(0, candleStore.frames[label].length - 600);
      console.log(`[CANDLE][${label}] O=${O} H=${H} L=${L} C=${C}`);
    }
  }, periodMs);
}

startCandleBuilder();
// [END BLOCK:CANDLE_BUILDER]

let updateStartPrice = false;
let firstTradeBlock = false;
let targetElement2;
let graphContainer;
let mamaBar;
let famaBar;

let balanceDiv;

const percentProfitDiv = document.getElementsByClassName("value__val-start")[0];
if (mode == 'REAL'){
    balanceDiv = document.getElementsByClassName("js-hd js-balance-real-USD")[0];
} else {
    balanceDiv = document.getElementsByClassName("js-hd js-balance-demo")[0];
}
const symbolDiv = document.getElementsByClassName("current-symbol")[0];
let symbolName = symbolDiv.textContent.replace("/", " ");

const betTimeDiv = document.getElementsByClassName("value__val")[0];
let betTime = betTimeDiv.textContent;

let priceString = balanceDiv.innerHTML;
priceString = priceString.split(',').join('');

let startBalance = parseFloat(priceString);
let prevBalance = startBalance;
console.log('Start Balance: ',startBalance);

const redColor = '#B90000';
const greenColor = '#009500';

const winCycle = document.createElement("div");
winCycle.style.backgroundColor = greenColor;
winCycle.style.padding = "5px";
winCycle.style.margin = "15px 10px 0 0";
winCycle.style.display = "inline-block";
winCycle.style.borderRadius = "3px";

const loseCycle = document.createElement("div");
loseCycle.style.backgroundColor = redColor;
loseCycle.style.padding = "5px";
loseCycle.style.margin = "15px 10px 0 0";
loseCycle.style.display = "inline-block";
loseCycle.style.borderRadius = "3px";

const targetElem = document.getElementsByClassName("tooltip-text");
const textToSearch = "Winnings amount you receive";
for (i = 0; i< targetElem.length;i++){
    let textContent = targetElem[i].textContent || targetElem[i].innerText;
    if (textContent.includes(textToSearch)){
        targetElement2 = document.getElementsByClassName("tooltip-text")[i];
    }
}
const buyButton = document.getElementsByClassName("btn btn-call")[0];
let text = targetElement2.innerHTML;
let startPrice = parseFloat(text.match(/\d+.\d+(?=\ a)/g)[0]);
priceHistory.push(startPrice);
console.log('Start Price: ',startPrice);

let lastMin = startPrice;
let lastMax = startPrice;
let multiplyFactorMesa = 100 / startPrice;
let multiplyFactorSqzMom = 50 / startPrice;

let betInput = document.getElementsByClassName("call-put-block__in")[0].querySelector("input");
let betDivContent = document.getElementsByClassName("call-put-block__in")[0].querySelector("input").value;
let betValue = parseFloat(betDivContent);

let maxStepDiv;


// create an observer instance
let targetDiv = document.getElementsByClassName("scrollbar-container deals-list ps")[0];
let observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {

        let newDeal = mutation.addedNodes[0];

        // console.log('mutation: ',mutation,' NewDeal: ',newDeal);

        function hasClass(element, className) {
            return (' ' + element.className + ' ').indexOf(' ' + className+ ' ') > -1;
        }

        let centerUp;
        let centerDiv = newDeal.childNodes[0].children[0].children[1].children[1];
        if (hasClass(centerDiv, 'price-up')){
            centerUp = true;
        } else {
            centerUp = false;
        }

        let lastUp;
        let lastDiv = newDeal.childNodes[0].children[0].children[1].children[2];
        if (hasClass(lastDiv, 'price-up')){
            lastUp = true;
        } else {
            lastUp = false;
        }

        let betProfit = parseFloat(lastDiv.textContent.replace(/[^\d.-]/g, ''));

        let tradeStatus;
        if (centerUp && lastUp){
            tradeStatus = 'won';            
        } else if (centerUp && !lastUp) {
            tradeStatus = 'returned';
        } else if (!centerUp && !lastUp) {
            tradeStatus = 'lost';
        }
        if (betHistory.length > 0) {
            betHistory[betHistory.length - 1].won = tradeStatus;
            betHistory[betHistory.length - 1].profit = betProfit;
        }

        symbolName = symbolDiv.textContent.replace("/", " ");
        tradingSymbolDiv.innerHTML = symbolName;
        betTime = betTimeDiv.textContent;
        let timeParts = betTime.split(':');
        let seconds = parseInt(timeParts[0]) * 3600 + parseInt(timeParts[1]) * 60 + parseInt(timeParts[2]);

        let totalBalance = prevBalance + betProfit;

        // logTradeToGoogleSheets(appversion, symbolName, openTime, betTime, openPrice, closePrice, betAmount, betStatus, betProfit);
        logTradeToGoogleSheets(
            appversion,
            symbolName,
            betHistory[betHistory.length - 1].time,
            seconds,
            betHistory[betHistory.length - 1].openPrice,
            globalPrice,
            betHistory[betHistory.length - 1].betValue,
            tradeStatus,
            betProfit,
            totalBalance
        );

        // console.log('Bet status: ',tradeStatus);

        if (startPrice < globalPrice) {
            priceTrend = 'up';
        } else if (startPrice == globalPrice){
            priceTrend = 'flat';
        } else {
            priceTrend = 'down';
        }
        
        priceTrendHistory.push(priceTrend);
        // console.log('price Trend: ',priceTrend, 'Start price: ',startPrice);

        //Retrieveing Global Trend (last 10 trends)
        // let last10Elements = takeRight(priceTrendHistory, 10);
        // console.log('Last 10 Price Trend: ', last10Elements);

        let last3Elements = takeRight(priceTrendHistory, 3);
        // console.log('Last 3 Price Trend: ', last3Elements);

        let upCounter = 0;
        let downCounter = 0;
        for (let i=0; i<last3Elements.length; i++) {
            if (last3Elements[i] === 'up') upCounter++;
            if (last3Elements[i] === 'down') downCounter++;
        }
        if (upCounter > downCounter) {
            globalTrend = 'up';
        } else if (upCounter < downCounter) {
            globalTrend = 'down';
        } else if (upCounter === downCounter) {
            globalTrend = 'flat';
        }
        // console.log('Global Trend: ', globalTrend);        

        makeBet(priceTrend, tradeStatus, globalTrend);
        
        startPrice = globalPrice;
        priceHistory.push(startPrice);

    });
});
// configuration of the observer:
let config = { attributes: false, childList: true, characterData: false };
// pass in the target node, as well as the observer options
observer.observe(targetDiv, config);
// later, you can stop observing
// observer.disconnect();

let buy = () => document.dispatchEvent(new KeyboardEvent('keyup', {keyCode: 87, shiftKey: true}));
let sell = () => document.dispatchEvent(new KeyboardEvent('keyup', {keyCode: 83, shiftKey: true}));
let decreaseBet = () => document.dispatchEvent(new KeyboardEvent('keyup', {keyCode: 65, shiftKey: true}));
let increaseBet = () => document.dispatchEvent(new KeyboardEvent('keyup', {keyCode: 68, shiftKey: true}));
let setValue = v => document.getElementsByClassName("call-put-block__in")[0].querySelector("input").value = v; // todo: after that press ENTER event?


let updateMinMax = () => {
    if (globalPrice > lastMax) {
        lastMax = globalPrice;
    }
    if (globalPrice < lastMin) {
        lastMin = globalPrice;
    }
}

let queryPrice = () => {
    let text = targetElement2.innerHTML;
    globalPrice = parseFloat(text.match(/\d+.\d+(?=\ a)/g)[0]);
    // console.log(globalPrice);

    // [BEGIN BLOCK:CANDLE_BUILDER_V2_HOOK]
    try { MTC.onTick(Date.now(), globalPrice); } catch(_){ }
    // [END BLOCK:CANDLE_BUILDER_V2_HOOK]

    updateMinMax();

    const ONLY_ON_UPDATE  = true;

    if (lastPrice !== globalPrice || !ONLY_ON_UPDATE) {
        lastPrice = globalPrice;
        sqzMomParams = squeezeMomentumIndicator.update(globalPrice);

        if (sqzMomParams) { // Check if sqzMomParams is not null
            sqzMomArray.push(sqzMomParams.value);
            // console.log('sqzMOM: ', sqzMomParams);

            mamafama = updateMESA(globalPrice);
            // console.log('mesa: ',mamafama);
            mamaArray.push(mamafama.mama);
            famaArray.push(mamafama.fama);
        }
    }

    // Detect balance change
    currentBalance = parseFloat(balanceDiv.innerHTML.split(',').join(''));
    currentProfit = Math.round((currentBalance-startBalance) * 100) / 100;
    profitDiv.innerHTML = currentProfit;
    if (currentProfit > 0){
        profitDiv.style.background = '#009500';
    } else {
        profitDiv.style.background = '#B90000';
    }
    
    //first automatic bet
    let time = Date.now();
    let hTime = humanTime(time);
    timeDiv.innerHTML = hTime;

    currentProfitPercent = parseInt(percentProfitDiv.innerHTML);
    profitPercentDivAdvisor.innerHTML = currentProfitPercent;

    if (currentProfitPercent < allowedWinPercent) {
        // console.log('%c BET IS NOT RECOMMENDED. Aborting mission! ', 'background: #B90000; color: #ffffff');
        profitPercentDivAdvisor.style.background = '#B90000';
        profitPercentDivAdvisor.style.color = "#ffffff";
        profitPercentDivAdvisor.innerHTML = 'win % is low! ABORT!!! => '+currentProfitPercent;
        firstTradeBlock = false;
        return;
    }

    // if (parseInt(hTime.slice(-1)) == 0 && !firstTradeBlock) { // 10 seconds
    // if ((parseInt(hTime.slice(-2)) == 0 && !firstTradeBlock)||((parseInt(hTime.slice(-2)) == 30 && !firstTradeBlock))) { // 30 seconds
    if (parseInt(hTime.slice(-2)) == 0 && !firstTradeBlock) { // 1 minute
        let firstPriceTrend;
        if (startPrice < globalPrice) {
            firstPriceTrend = 'up';
        } else if (startPrice == globalPrice){
            firstPriceTrend = 'flat';
        } else {
            firstPriceTrend = 'down';
        }
        firstPriceTrendArray.push(firstPriceTrend);
        



        if (firstPriceTrendArray.length > 0 && sqzMomParams) { // Ensure sqzMomParams is not null
            let currentTrade = {};
            currentTrade.time = hTime;
            currentTrade.step = 0;      
            let betValue = getBetValue(currentTrade.step);
            currentTrade.betValue = betValue;
            currentTrade.betDirection = firstPriceTrend;
            currentTrade.sqzMomIndicator = 'undetected';
            currentTrade.globalTrend = 'undetected';
            currentTrade.priceTrend = firstPriceTrend;
            betHistory.push(currentTrade);
            totalWager += betValue;
            wagerDiv.innerHTML = totalWager;
            firstTradeBlock = true;
            makeBet(firstPriceTrend, 'won', currentTrade.globalTrend);
        }
    }
}

let makeBet = (priceTrend, tradeStatus, globalTrend) => {

    let tradeDirection;
    let currentTrade = {};

    let time = Date.now();
    let hTime = humanTime(time);

    

    // currentTrade.startPrice = startPrice;
    // currentTrade.globalPrice = globalPrice;

    let prevBetStep = betHistory.slice(-1)[0].step;
    let currentBetStep;

    // anti-martingale

    if (antiMartingale){

        if (tradeStatus === 'won') {        
            if (prevBetStep < betArray.length-1) {
                currentBetStep = prevBetStep + 1; 
            } else {
                currentBetStep = 0;
            }
        } else if (tradeStatus === 'lost') {
            currentBetStep = 0;
        } else if (tradeStatus === 'returned') {
            currentBetStep = prevBetStep;
        }

    } else {
        if (tradeStatus === 'won') {
            currentBetStep = 0;
        } else if (tradeStatus === 'lost') {
            if (prevBetStep < betArray.length-1) {
                currentBetStep = prevBetStep + 1; 
            } else {
                currentBetStep = 0;
            }
        } else if (tradeStatus === 'returned') {
            currentBetStep = prevBetStep;
        }
    }

    // Откладываем повышение ставки пока не будет статистики торгов и более точных данных
    if (betHistory.length < 3){
        currentBetStep = 0;
    }

    
    // console.log(sqzMomParams);
    let multiplyFactor = 20;
    
    let last3Elements = takeRight(sqzMomArray, 3);

    let lastElem1 = last3Elements[0];
    let lastElem2;
    let lastElem3;
    if (!last3Elements[1]) {
        lastElem2 = lastElem1;
    } else {
        lastElem2 = last3Elements[1];
    }
    if (!last3Elements[2]) {
        lastElem3 = lastElem1;
    } else {
        lastElem3 = last3Elements[2];
    }
    let f = Math.abs(lastElem1) + Math.abs(lastElem2) + Math.abs(lastElem3);
    f = f / 3;
    let normalizedSqzMomValue = sqzMomParams.value / f;
    let multipliedValue = normalizedSqzMomValue * multiplyFactor;

    // let multipliedValue = multiplyFactorSqzMom * sqzMomParams.value;

    sqzMomHistory.push({value:multipliedValue, bcolor:sqzMomParams.bcolor, scolor:sqzMomParams.scolor, time: hTime});

    let last40 = takeRight(sqzMomHistory, 40);

    if (false) {
        // исходная отрисовка старых сигналов
        graphContainer.innerHTML = '';
        for (let i = 0; i < last40.length; i++) {
            let newSqzBar = document.createElement("div");
            newSqzBar.className = "sqz-bar";
            graphContainer.appendChild(newSqzBar);
            newSqzBar.style.height = Math.abs(last40[i].value) + 'px';
            let posLeft = i * 10;
            newSqzBar.style.left = posLeft + 'px';

            let newSqzDot = document.createElement("div");
            newSqzDot.className = "sqz-dot";
            graphContainer.appendChild(newSqzDot);
            newSqzDot.style.left = posLeft + 'px';
            newSqzDot.style.backgroundColor = last40[i].scolor;

            if (last40[i].value < 0) {
                newSqzBar.style.bottom = (80 - Math.abs(last40[i].value)) + 'px';
            } else {
                newSqzBar.style.bottom = '80px';
            }
            newSqzBar.style.backgroundColor = last40[i].bcolor;
        }

        // исходная отрисовка старых сигналов
        let newmamaBar = document.createElement("div");
        newmamaBar.className = "mesa-bar";
        newmamaBar.id = "mama-bar";
        graphContainer.appendChild(newmamaBar);
        mamaBar = document.getElementById('mama-bar');

        let newfamaBar = document.createElement("div");
        newfamaBar.className = "mesa-bar";
        newfamaBar.id = "fama-bar";
        graphContainer.appendChild(newfamaBar);
        famaBar = document.getElementById('fama-bar');

        let scaledValues = visualizeCloseValues(mamaArray, famaArray);

        mamaBar.style.bottom = (80 + scaledValues.arr1[scaledValues.arr1.length - 1] * 50) + 'px';
        famaBar.style.bottom = (80 + scaledValues.arr2[scaledValues.arr2.length - 1] * 50) + 'px';
    }

    let sqzGrowIndicator;

    if (sqzMomParams.bcolor == '#32CD32' || sqzMomParams.bcolor == '#800000'){
        sqzGrowIndicator = 'up';
    } else if (sqzMomParams.bcolor == '#008000' || sqzMomParams.bcolor == '#DD0000') {
        sqzGrowIndicator = 'down';
    }
    let mesaIndicator;

    if (mamafama.fama > mamafama.mama) {
        mesaIndicator = 'down';
    } else if (mamafama.fama < mamafama.mama) {
        mesaIndicator = 'up';
    }

    // console.log('sqz indicator: ',sqzGrowIndicator, ' priceTrend: ',priceTrend, ' globalTrend: ',globalTrend, ' mesaIndicator: ',mesaIndicator);

    if (sqzGrowIndicator === 'up') {
        sqzDiv.style.background = greenColor;
    } else if (sqzGrowIndicator === 'down') {
        sqzDiv.style.background = redColor;
    }
    sqzDiv.innerHTML = sqzGrowIndicator;

    if (priceTrend === 'up') {
        trendDiv.style.background = greenColor;
    } else if (priceTrend === 'down') {
        trendDiv.style.background = redColor;
    }
    trendDiv.innerHTML = priceTrend;

    if (globalTrend === 'up') {
        globalTrendDiv.style.background = greenColor;
    } else if (globalTrend === 'down') {
        globalTrendDiv.style.background = redColor;
    }
    globalTrendDiv.innerHTML = globalTrend;

    if (globalTrend == 'undetected' || globalTrend == 'flat') {
        // console.log('%c globalTrend is '+globalTrend+', using priceTrend instead!', 'background:#c98a02; color:#ffffff');
        globalTrend = priceTrend;
    }

    if (!reverse){
        if (sqzGrowIndicator === 'up') {
            tradeDirection = 'buy';
            tradeDirectionDiv.style.background = '#c98a02';
        } else {
            tradeDirection = 'sell';
            tradeDirectionDiv.style.background = '#c98a02';
        }
    } else {
        if (sqzGrowIndicator === 'down') {
            tradeDirection = 'buy';
            tradeDirectionDiv.style.background = '#c98a02';
        } else {
            tradeDirection ='sell';
            tradeDirectionDiv.style.background = '#c98a02';
        }
    }

    tradeDirectionDiv.innerHTML = tradeDirection;

    // if (sqzGrowIndicator === 'up' && mesaIndicator === 'up') {
    //     tradeDirection = 'buy';
    //     tradeDirectionDiv.style.background = greenColor;
    // } else if (sqzGrowIndicator === 'down' && mesaIndicator === 'down') {
    //     tradeDirection = 'sell';
    //     tradeDirectionDiv.style.background = redColor;
    // } else if (sqzGrowIndicator != mesaIndicator && priceTrend == 'up') {
    //     tradeDirection = 'buy';
    //     tradeDirectionDiv.style.background = '#c98a02';
    // } else if (sqzGrowIndicator != mesaIndicator && priceTrend == 'down') {
    //     tradeDirection = 'sell';
    //     tradeDirectionDiv.style.background = '#c98a02';
    // } 

    tradeDirectionDiv.innerHTML = tradeDirection;

    if (currentProfit > limitWin){
        limitWin = limitWin1;
        limitLoss = limitLoss1;
        betArray = betArray1;
        let newDiv = winCycle.cloneNode();
        newDiv.style.height = '30px';
        newDiv.innerHTML = currentProfit;
        newDiv.innerHTML += '<div class="max-cycle">'+maxStepInCycle+'</div>';
        cyclesHistoryDiv.appendChild(newDiv);
        resetCycle();
    } else if (currentProfit - betValue < limitLoss) {
        if (limitWin == limitWin1){
            limitWin = limitWin2;
            limitLoss = limitLoss2;
            betArray = betArray2;
        } else if (limitWin == limitWin2){
            limitWin = limitWin3;
            limitLoss = limitLoss3;
            betArray = betArray3;
        // } else if (limitWin == limitWin3){
        //     limitWin = limitWin4;
        //     limitLoss = limitLoss4;
        //     betArray = betArray4;
        } else {
            limitWin = limitWin1;
            limitLoss = limitLoss1;
            betArray = betArray1;
        }
        let newDiv = loseCycle.cloneNode();
        newDiv.style.height = '30px';
        newDiv.innerHTML = currentProfit;
        newDiv.innerHTML += '<div class="max-cycle">'+maxStepInCycle+'</div>';
        cyclesHistoryDiv.appendChild(newDiv);
        resetCycle();
    } else if (cyclesToPlay > 0){
        smartBet(currentBetStep, tradeDirection);
    
        currentTrade.time = hTime;
        currentTrade.betTime = betTime;
        currentTrade.openPrice = globalPrice;
        currentTrade.step = currentBetStep;
        let betValue = getBetValue(currentTrade.step);
        currentTrade.betValue = betValue;
        currentTrade.betDirection = tradeDirection;
        // currentTrade.anomalyDetected = anomalyDetected;
        currentTrade.sqzMomIndicator = sqzGrowIndicator;
        currentTrade.globalTrend = globalTrend;
        currentTrade.priceTrend = priceTrend;
        betHistory.push(currentTrade);
        totalWager += betValue;
        wagerDiv.innerHTML = totalWager;

        prevBalance = parseFloat(balanceDiv.textContent.replace(/[^\d.-]/g, ''));

        prevBalance -= betValue;

        // Обновляем максимальный шаг
        maxStepInCycle = Math.max(maxStepInCycle, currentTrade.step);
        maxStepDiv.innerHTML = maxStepInCycle;
    }


    //  determine win %
    let winCounter = 0;
    for (var i = 0; i < betHistory.length; i++) {
        if (betHistory[i].won === 'won'){
            winCounter++
        }
    }

    let winPercent = Math.round(winCounter / betHistory.length * 100 * 100 ) / 100;
    wonDiv.innerHTML = winPercent;

    // console.log('Bet History: ', betHistory);
    // console.log('----------------------------------------------------------------');

}
let smartBet = (step, tradeDirection) => {

    currentProfitPercent = parseInt(percentProfitDiv.innerHTML);
    profitPercentDivAdvisor.innerHTML = currentProfitPercent;

    if (currentProfitPercent < allowedWinPercent){
        console.log('%c BET IS NOT RECOMMENDED. Aborting mission! ', 'background: #B90000; color: #ffffff');
        profitPercentDivAdvisor.style.background = '#B90000';
        profitPercentDivAdvisor.style.color = "#ffffff";
        profitPercentDivAdvisor.innerHTML = 'win % is low! ABORT!!! => '+currentProfitPercent;
        return;
    }

    let steps;

    // if (tradeDirection === 'skip'){

    // }

    for (let i = 0; i <betArray.length;i++){
        if (step == betArray[i].step){
            steps = betArray[i].pressCount;
        }
    }

    for (i=0; i < 30; i++){
        setTimeout(function() {
            decreaseBet();
        }, i);
    }

    setTimeout(function() {  
        for (i=0; i < steps; i++){
            setTimeout(function() {
                increaseBet();
            }, i);
        }
    }, 50);

    setTimeout(function() {  
        if (tradeDirection == 'buy'){
            buy();
        } else {
            sell();
        }
        let betValue = getBetValue(step);
        // console.log('Betting: ' + betValue + ' / Step: ' + step + ' / Direction: ' + tradeDirection);
    }, 100);
}
let getBetValue = (betStep) => {
    let value;
    for (let i=0;i<betArray.length;i++) {
        if (betStep == betArray[i].step) {
            value = betArray[i].value;
        }
    }
    return value;
}
let takeRight = (arr, n = 1) => arr.slice(-n);
Array.prototype.max = function() {
    return Math.max.apply(null, this);
};  
Array.prototype.min = function() {
    return Math.min.apply(null, this);
};
let resetCycle = () => {

    let time = Date.now();
    let hTime = humanTime(time);

    console.log('%c RESET CYCLE! '+hTime, 'background: #9326FF; color: #ffffff');

    profitDiv.style.background = 'inherit';

    maxStepInCycle = 0;

    if (cyclesToPlay > 0) {
        cyclesStats.push(currentProfit);
        startBalance = currentBalance;
        cyclesToPlay--;
        // cyclesDiv.innerHTML = cyclesToPlay;
        let totalProfit = 0;
        for (let i = 0; i < cyclesStats.length; i++) {
            totalProfit += cyclesStats[i];
        }

        totalProfit = Math.round(totalProfit * 100) / 100;
        totalProfitDiv.innerHTML = totalProfit;
        if (totalProfit < 0) {
            totalProfitDiv.style.background = '#B90000';
        } else if (totalProfit > 0) {
            totalProfitDiv.style.background = '#009500';
        }
        firstTradeBlock = false;
    } else {
        console.log('%c ----- ALL CYCLES ENDED! ----- '+hTime+' ------', 'background: #9326FF; color: #ffffff');
    }


}
function addUI() {
    // create a new div element
    const newDiv = document.createElement("div");
    newDiv.style.width = "640px";
    newDiv.style.position = "fixed";
    newDiv.style.bottom = "20px";
    newDiv.style.right = "60px";
    newDiv.style.zIndex = "100500";
    newDiv.style.background = "rgba(0, 0, 0, 0.6)";
    newDiv.style.padding = "40px";
    newDiv.style.borderRadius = "10px";

    historyBetDiv = document.createElement("div");
    historyBetDiv.style.width = "10px";
    historyBetDiv.style.height = "10px";
    historyBetDiv.style.padding = "2px";
    historyBetDiv.style.display = "inline-block";
    historyBetDiv.classList.add("history-bet");
  
    // and give it some content
    const newContent = document.createTextNode(appversion);
  
    // add the text node to the newly created div
    newDiv.appendChild(newContent);
  
    // add the newly created element and its content into the DOM
    const currentDiv = document.getElementById("div1");
    document.body.insertBefore(newDiv, currentDiv);

    (function makeDraggable(el){
      if (!el) return;
      el.style.position = el.style.position || 'fixed';
      el.addEventListener('mousedown', function(e){
        const t = e.target.tagName;
        if (['SELECT','INPUT','BUTTON','CANVAS'].includes(t)) return;
        const r = el.getBoundingClientRect();
        const shiftX = e.clientX - r.left;
        const shiftY = e.clientY - r.top;
        el.style.bottom = 'auto';
        el.style.right = 'auto';
        function moveAt(x,y){ el.style.left=(x-shiftX)+'px'; el.style.top=(y-shiftY)+'px'; }
        function onMove(ev){ moveAt(ev.pageX,ev.pageY); }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', function onUp(){
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }, {once:true});
      });
      el.addEventListener('dragstart', e => e.preventDefault());
    })(newDiv || document.getElementById('InfoPanel'));

    newDiv.innerHTML += '<br><br><div>Start Balance: $'+startBalance+'.  Start Time: '+startTime+'</div><br>MODE: '+mode+'</div><br><br>';
    newDiv.innerHTML += '<div>Trading symbol:<span id="trading-symbol"> '+symbolName+'</span>.</div><br>';
    newDiv.innerHTML += '<div>Reverse: '+reverse+'.</div><br>';
    newDiv.innerHTML += '<div>Cycle profit: $<span id="profit">0</span> Won: <span id="won-percent">0</span>%  Wager: $ <span id="wager">0</span></div><br>';
    newDiv.innerHTML += '<div>Current time: <span id="time">0:00</span></div><br>';
    newDiv.innerHTML += '<div>% profit on current pair: <span id="profit-percent">0</span> %</div><br>';
    // newDiv.innerHTML += '<div>History: <span id="history-box"></span></div><br>';
    newDiv.innerHTML += '<div>Indicator: <span id="sqz-indicator">flat</span>Trend: <span id="price-trend">flat</span>globalTrend: <span id="global-trend">flat</span></div><br>';
    newDiv.innerHTML += '<div>Trade Direction: <span id="trade-dir">flat</span></div><br>';
    newDiv.innerHTML += '<div>Max Step in Cycle: <span id="max-step">0</span> / Total Profit: <span id="total-profit">0</span> USD</div><br>';
    newDiv.innerHTML += '<div>Cycles history:<br><span id="cycles-history"></span></div><br>';
    newDiv.innerHTML += '<div id="graphs"></div><br>';

    profitDiv = document.getElementById("profit");
    profitPercentDivAdvisor = document.getElementById("profit-percent");
    historyDiv = document.getElementById("history-box");
    sqzDiv = document.getElementById("sqz-indicator");
    trendDiv = document.getElementById("price-trend");
    tradingSymbolDiv = document.getElementById("trading-symbol");
    globalTrendDiv = document.getElementById("global-trend");
    tradeDirectionDiv = document.getElementById("trade-dir");
    timeDiv = document.getElementById("time");
    wonDiv = document.getElementById("won-percent");
    wagerDiv = document.getElementById("wager");
    maxStepDiv = document.getElementById("max-step");
    // cyclesDiv.innerHTML = cyclesToPlay;
    totalProfitDiv = document.getElementById("total-profit");
    cyclesHistoryDiv = document.getElementById("cycles-history");

    graphContainer = document.getElementById("graphs");
    graphContainer.style.height = '320px';
    graphContainer.style.position = 'relative';
    graphContainer.style.zIndex = '10000';

}

// [BEGIN BLOCK:CHART_IN_PANEL_PLACEMENT_PREP]
(function ensureChartHostPreAddUI(){
  const panel = document.getElementById('InfoPanel') || document.querySelector('#InfoPanel') || document.body;
  if (!document.getElementById('graphs')){
    const graphs = document.createElement('div');
    graphs.id = 'graphs';
    graphs.style.cssText = 'position:relative; z-index:10000; width:100%;';
    panel.appendChild(graphs);
  }
})();
// [END BLOCK:CHART_IN_PANEL_PLACEMENT_PREP]

addUI();

// [BEGIN BLOCK:CHART_IN_PANEL_PLACEMENT]
(function ensureChartHostInPanel(){
  const panel = document.getElementById('InfoPanel') || document.querySelector('#InfoPanel') || document.body;
  let graphs = document.getElementById('graphs');
  if (!graphs){
    graphs = document.createElement('div');
    graphs.id = 'graphs';
    graphs.style.cssText = 'position:relative; z-index:10000; width:100%;';
    panel.appendChild(graphs);
  }else{
    graphs.style.position = 'relative';
    graphs.style.zIndex = '10000';
    graphs.style.width = '100%';
  }
})();
// [END BLOCK:CHART_IN_PANEL_PLACEMENT]

// [BEGIN BLOCK:CANDLE_CHART_INTERVAL_CAPTURE]
(function captureCandleDrawInterval(){
  const originalSetInterval = window.setInterval.bind(window);
  window.setInterval = function(fn, delay){
    const id = originalSetInterval(fn, delay);
    try{
      const isCandleDraw = delay === 1000 && fn && (fn.name === 'draw' || /candle-chart-canvas/.test(String(fn)));
      if (!window.__CANDLE_UI_INTERVAL_ID && isCandleDraw){
        window.__CANDLE_UI_INTERVAL_ID = id;
        window.setInterval = originalSetInterval;
      }
    }catch(_){
      window.setInterval = originalSetInterval;
    }
    return id;
  };
})();
// [END BLOCK:CANDLE_CHART_INTERVAL_CAPTURE]

// [BEGIN BLOCK:CANDLE_CHART_UI]
const CandleChartUI = (() => {
  const TFs = ['5s','10s','15s','30s','1m','5m'];
  let activeTF = '5s';

  function createPanel(){
    const host = document.querySelector('#graphs') ||
                 document.querySelector('#InfoPanel') ||
                 document.body;
    const box = document.createElement('div');
    box.id = 'candle-chart-box';
    box.style.cssText = 'margin:6px 0;font:12px system-ui;color:#ccc;';
    const selector = document.createElement('select');
    TFs.forEach(tf=>{
      const o=document.createElement('option');
      o.value=tf;o.text=tf;if(tf==='5s')o.selected=true;
      selector.appendChild(o);
    });
    selector.onchange = e => { activeTF = e.target.value; draw(); };
    const canvas = document.createElement('canvas');
    canvas.id='candle-chart-canvas';
    canvas.width=640;canvas.height=240;
    canvas.style.cssText='width:640px;height:240px;display:block;background:#0b0e13;border:1px solid #1f2630;border-radius:8px;';
    box.appendChild(selector);
    box.appendChild(canvas);
    host.prepend(box);
  }

  function draw(){
    const cv = document.getElementById('candle-chart-canvas');
    if(!cv) return;
    const ctx = cv.getContext('2d');
    const data = (candleStore.frames[activeTF]||[]).slice(-60);
    ctx.clearRect(0,0,cv.width,cv.height);
    if(!data.length){ ctx.fillStyle='#aaa'; ctx.fillText('no data',10,14); return; }
    let lo=Infinity,hi=-Infinity;
    for(const c of data){if(c.L<lo)lo=c.L;if(c.H>hi)hi=c.H;}
    const pad=(hi-lo)*0.05||1e-6; lo-=pad; hi+=pad;
    const y=v=>(hi-v)*(cv.height-4)/(hi-lo)+2;
    const xStep=cv.width/data.length;
    data.forEach((c,i)=>{
      const x=i*xStep+xStep/2;
      ctx.strokeStyle='#999';
      ctx.beginPath(); ctx.moveTo(x,y(c.H)); ctx.lineTo(x,y(c.L)); ctx.stroke();
      ctx.fillStyle=c.C>=c.O?'#2ecc71':'#e74c3c';
      const bodyH=Math.abs(y(c.O)-y(c.C));
      ctx.fillRect(x-xStep*0.3,y(Math.max(c.O,c.C)),xStep*0.6,bodyH);
    });
  }

  setInterval(draw,1000);
  createPanel();
  return { draw };
})();
// [END BLOCK:CANDLE_CHART_UI]

// [BEGIN BLOCK:DISABLE_OLD_DRAW_TIMER]
try{
  if (typeof clearInterval === 'function' && typeof __CANDLE_UI_INTERVAL_ID !== 'undefined'){
    clearInterval(__CANDLE_UI_INTERVAL_ID);
  }
}catch(_){}
/* Новый рендер выполняется через requestAnimationFrame в BLOCK:CANDLE_CHART_RAF */
// [END BLOCK:DISABLE_OLD_DRAW_TIMER]

// [BEGIN BLOCK:CANDLE_CHART_RAF]
(function setupSmoothChart(){
  // ссылка на существующий canvas из CANDLE_CHART_UI
  let cv = document.getElementById('candle-chart-canvas');
  if (!cv){
    // на случай более позднего создания — отложенная инициализация
    const id = setInterval(()=>{
      cv = document.getElementById('candle-chart-canvas');
      if (cv){ clearInterval(id); init(); }
    }, 100);
  }else{
    init();
  }

  function init(){
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const logicalW = 640, logicalH = 240;            // как в 0.1.4, x2 масштаб
    cv.width  = logicalW * dpr;
    cv.height = logicalH * dpr;
    cv.style.width  = '100%';
    cv.style.maxWidth = logicalW + 'px';
    cv.style.height = logicalH + 'px';

    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);              // HiDPI

    let rafPending = false;
    window.__MTC_scheduleDraw = function(closed){
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(()=>{ rafPending=false; draw(ctx, logicalW, logicalH); });
    };

    // первичный кадр
    window.__MTC_scheduleDraw(false);
  }

  function draw(ctx, W, H){
    // активный ТФ считываем из UI (см. блок кнопки ниже)
    const tf = (window.__MTC_activeTF || '5s');
    const history = MTC.frames[tf] || [];
    const curBar = MTC.cur[tf];
    const data = history.slice(-59);
    if (curBar){
      data.push({ ...curBar });
    }
    ctx.clearRect(0,0,W,H);

    if (!data.length){
      ctx.fillStyle='#9aa4b2'; ctx.font='12px system-ui';
      ctx.fillText('no data', 10, 16);
      return;
    }

    // экстремы
    let lo=Infinity, hi=-Infinity;
    for (const c of data){ if (c.L<lo) lo=c.L; if (c.H>hi) hi=c.H; }
    const pad = (hi-lo)*0.05 || 1e-6; lo-=pad; hi+=pad;

    // сетка лёгкая
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#9aa4b2';
    ctx.beginPath();
    for (let i=1;i<=3;i++){
      const y = Math.round(i*H/4);
      ctx.moveTo(0,y); ctx.lineTo(W,y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    const left=6, right=6, top=6, bottom=6;
    const innerW = W-left-right, innerH = H-top-bottom;
    const xStep = innerW / Math.max(1, data.length);
    const y = v => top + (hi - v) * (innerH / (hi - lo));

    // тени и тела
    for (let i=0;i<data.length;i++){
      const c = data[i];
      const x = left + i*xStep + xStep*0.5;

      // тень
      ctx.beginPath();
      ctx.moveTo(x, y(c.H)); ctx.lineTo(x, y(c.L));
      ctx.lineWidth = 1; ctx.strokeStyle = '#9aa4b2'; ctx.stroke();

      // тело
      const up = c.C >= c.O;
      const bodyW = Math.max(1, Math.floor(xStep*0.6));
      const x0 = Math.round(x - bodyW/2);
      const y0 = Math.round(y(Math.max(c.O,c.C)));
      const h  = Math.max(1, Math.abs(Math.round(y(c.O) - y(c.C))));
      ctx.fillStyle = up ? '#2ecc71' : '#e74c3c';
      ctx.fillRect(x0, y0, bodyW, h);
    }
  }
})();
// [END BLOCK:CANDLE_CHART_RAF]

// [BEGIN BLOCK:TF_BLACK_BUTTON]
(function addTfButton(){
  const host = document.getElementById('candle-chart-box') || document.getElementById('graphs') || document.body;

  // контейнер управления
  let ctrl = document.getElementById('candle-chart-controls');
  if (!ctrl){
    ctrl = document.createElement('div');
    ctrl.id = 'candle-chart-controls';
    ctrl.style.cssText = 'display:flex; gap:8px; align-items:center; margin:6px 0;';
    host.prepend(ctrl);
  }

  // чёрная кнопка переключения
  let btn = document.getElementById('tf-switcher');
  if (!btn){
    btn = document.createElement('button');
    btn.id = 'tf-switcher';
    btn.type = 'button';
    btn.textContent = 'TF: 5s';
    btn.style.cssText = [
      'background:#000', 'color:#fff', 'border:1px solid #333', 'border-radius:6px',
      'padding:6px 10px', 'font:12px system-ui', 'cursor:pointer',
      'box-shadow:0 1px 2px rgba(0,0,0,.4)'
    ].join(';');
    ctrl.appendChild(btn);
  }

  const order = ['5s','10s','15s','30s','1m','5m'];
  window.__MTC_activeTF = window.__MTC_activeTF || '5s';
  function updateLabel(){ btn.textContent = 'TF: ' + window.__MTC_activeTF; }

  btn.addEventListener('click', () => {
    const idx = order.indexOf(window.__MTC_activeTF);
    window.__MTC_activeTF = order[(idx+1) % order.length];
    updateLabel();
    try { window.__MTC_scheduleDraw && window.__MTC_scheduleDraw(false); } catch(_){ }
  });

  updateLabel();
})();
// [END BLOCK:TF_BLACK_BUTTON]

// [BEGIN BLOCK:SIGNAL_ENGINE]
const SignalEngine = (() => {
  function calcSignal(tf){
    const arr = candleStore.frames[tf];
    if(!arr || arr.length < 5) return null;
    const last = arr[arr.length-1];
    const dir = last.C > last.O ? 'buy' : 'sell';
    return { dir, last };
  }

  setInterval(()=>{
    const tf = document.querySelector('#candle-chart-box select')?.value || '5s';
    const sig = calcSignal(tf);
    if(sig)
      console.log(`[SIGNAL][${tf}] ${sig.dir} O=${sig.last.O} C=${sig.last.C}`);
  }, 2000);
})();
// [END BLOCK:SIGNAL_ENGINE]

setInterval(queryPrice, 100);


function updateLB(nextClose, nextLow, nextHigh) {

    const length = 20; // "BB Length"
    const mult = 2; // "BB MultFactor"
    const lengthKC = 20; // "KC Length"
    const multKC = 1.5; // "KC MultFactor"

    // update stacks
    closeStack.unshift(nextClose);
    lowStack.unshift(nextLow);
    highStack.unshift(nextHigh);

    let trueRange = nextHigh - nextLow;
    if (closeStack.length > 1) {
        trueRange = Math.max(trueRange, Math.max(Math.abs(nextHigh - closeStack[1])));
        trueRange = Math.max(trueRange, Math.max(Math.abs(nextLow - closeStack[1])));
    }
    trStack.unshift(trueRange);

    let useTrueRange = true; // "Use TrueRange (KC)"
    
    const sma = (source, length) => {
        let count = Math.min(length, source.length);
        let sum = 0;
        for (let i = 0; i < count; i++) {
            sum += source[i];
        }
        return sum / count;
    };

    const stdev = (source, length) => {
        let mean = sma(source, length);
        let count = Math.min(length, source.length);
        let sum = 0;
        for (let i = 0; i < count; i++) {
            sum += Math.pow(source[i] - mean, 2);
        }
        return Math.sqrt(sum / count);
    };

    const highest = (source, length) => {
        let max = source[0];
        let count = Math.min(length, source.length);
        for (let i = 1; i < count; i++) {
            max = Math.max(max, source[i]);
        }
        return max;
    };

    const lowest = (source, length) => {
        let min = source[0];
        let count = Math.min(length, source.length);
        for (let i = 1; i < count; i++) {
            min = Math.min(min, source[i]);
        }
        return min;
    };

    const avg = (x, y) => (x + y) / 2;

    const linreg = (source, length, offset) => {

        let sum = 0;
        let sumX = 0;
        let sumX2 = 0;
        let sumXY = 0;

        let count = Math.min(length, source.length);
        for (let i = 0; i < count; i++) {
            let val = source[count - 1 - i];
            sum += val;
            sumX += i;
            sumX2 += i * i;
            sumXY += i * val;
        }

        if (count === 1) {
            return source[0];
        }

        let m = (sumXY * count - sumX * sum) / (sumX2 * count - sumX * sumX);
        let b = sum / count - m * sumX / count;

        return b + m * (count - 1 - offset);
    };

    const sub = (source, scalar, length) => {
        let r = [];
        let count = Math.min(length, source.length);
        for (let i = 0; i < count; i++) {
            r.push(source[i] - scalar);
        }
        return r;
    };

    // Calculate BB
    let basis = sma(closeStack, length); // The sma function returns the moving average, that is the sum of last y values of x, divided by y.
    let dev = multKC * stdev(closeStack, length); // This is a biased estimation of standard deviation.
    let upperBB = basis + dev;
    let lowerBB = basis - dev;

    // Calculate KC
    let ma = sma(closeStack, lengthKC);
    let range = useTrueRange? trStack : (highStack - lowStack);
    let rangema = sma(range, lengthKC);
    let upperKC = ma + rangema * multKC;
    let lowerKC = ma - rangema * multKC;

    // Check for squeeze
    let sqzOn = (lowerBB > lowerKC) && (upperBB < upperKC);
    let sqzOff = (lowerBB < lowerKC) && (upperBB > upperKC);
    let noSqz = (sqzOn === false) && (sqzOff === false);

    // Calculate linear regression value
    let scalar = avg(avg(highest(highStack, lengthKC), lowest(lowStack, lengthKC)), sma(closeStack, lengthKC));
    let source = sub(closeStack, scalar, lengthKC);
    const value = linreg(source, lengthKC, 0);
    lbStack.unshift(value);

    return {
        value: value,
        color: value > 0 ? (value > lbStack[1] ? '#32CD32' : '#008000') : (value < lbStack[1] ? '#DD0000' : '#800000')
    };
}

function updateMESA(value) {

    let nz = (value, otherwise = 0) => value !== undefined ? value : otherwise;

    let hilbertTransform = (values) => {
        return 0.0962 * values[0] + 0.5769 * nz(values[2]) - 0.5769 * nz(values[4]) - 0.0962 * nz(values[6]);
    };

    let smoothComponent = (values) => {
        return 0.2 * values[0] + 0.8 * nz(values[1]);
    };

    valueStack.unshift(value);
    smoothStack.unshift((4 * valueStack[0] + 3 * nz(valueStack[1]) + 2 * nz(valueStack[2]) + nz(valueStack[3])) / 10);

    mesaPeriodStack.unshift(0);
    let mesaPeriodMult = 0.075 * nz(mesaPeriodStack[1]) + 0.54;

    detrenderStack.unshift(hilbertTransform(smoothStack) * mesaPeriodMult);

    // Compute InPhase and Quadrature components
    i1Stack.unshift(nz(detrenderStack[3]));
    q1Stack.unshift(hilbertTransform(detrenderStack) * mesaPeriodMult);

    // Advance the phase of I1 and Q1 by 90 degrees
    jiStack.unshift(hilbertTransform(i1Stack) * mesaPeriodMult);
    jqStack.unshift(hilbertTransform(q1Stack) * mesaPeriodMult);

    i2Stack.unshift(i1Stack[0] - jqStack[0]);
    q2Stack.unshift(q1Stack[0] + jiStack[0]);

    i2Stack[0] = smoothComponent(i2Stack);
    q2Stack[0] = smoothComponent(q2Stack);

    // Homodyne Discriminator
    reStack.unshift(i2Stack[0] * nz(i2Stack[1], i2Stack[0]) + q2Stack[0] * nz(q2Stack[1], q2Stack[0]));
    imStack.unshift(i2Stack[0] * nz(q2Stack[1], q2Stack[0]) - q2Stack[0] * nz(i2Stack[1], i2Stack[0]));

    reStack[0] = smoothComponent(reStack);
    imStack[0] = smoothComponent(imStack);

    if (reStack[0] !== 0 && imStack[0] !== 0)
        mesaPeriodStack[0] = 2 * Math.PI / Math.atan(imStack[0] / reStack[0]);

    mesaPeriodStack[0] = Math.min(mesaPeriodStack[0], 1.5 * nz(mesaPeriodStack[1], mesaPeriodStack[0]))
    mesaPeriodStack[0] = Math.max(mesaPeriodStack[0], 0.67 * nz(mesaPeriodStack[1], mesaPeriodStack[0]))
    mesaPeriodStack[0] = Math.min(Math.max(mesaPeriodStack[0], 6), 50)
    mesaPeriodStack[0] = smoothComponent(mesaPeriodStack);

    phaseStack.unshift(0);
    if (i1Stack[0] !== 0)
        phaseStack[0] = (180 / Math.PI) * Math.atan(q1Stack[0] / i1Stack[0]);

    let deltaPhase = nz(phaseStack[1], phaseStack[0]) - phaseStack[0];
    deltaPhase = Math.max(deltaPhase, 1)

    const fastLimit = 0.5;
    const slowLimit = 0.05;

    let alpha = Math.max(fastLimit / deltaPhase, slowLimit)
    let alpha2 = alpha / 2;

    mamaStack.unshift(0);
    mamaStack[0] = alpha * valueStack[0] + (1 - alpha) * nz(mamaStack[1]);

    famaStack.unshift(0);
    famaStack[0] = alpha2 * mamaStack[0] + (1 - alpha2) * nz(famaStack[1]);

    return {
        mama: mamaStack[0],
        fama: famaStack[0]
    };
}

let averageInArray = array => array.reduce((a, b) => a + b) / array.length;


if (false) {
    // исходная отрисовка старых сигналов
    function visualizeCloseValues(arr1, arr2, maxTransform = 100) {
        let samples = Math.min(20, arr1.length, arr2.length);

        let min = arr1[arr1.length - 1];
        let max = arr1[arr1.length - 1];
        for (let i = 1; i <= samples; i++) {
            min = Math.min(min, arr1[arr1.length - i], arr2[arr2.length - i]);
            max = Math.max(max, arr1[arr1.length - i], arr2[arr2.length - i]);
        }

        let transformCount = Math.min(maxTransform, arr1.length, arr2.length);
        let outArr1 = new Array(transformCount);
        let outArr2 = new Array(transformCount);
        for (let i = 1; i <= transformCount; i++) {
            outArr1[transformCount - i] = (arr1[transformCount - i] - min) / (max - min);
            outArr2[transformCount - i] = (arr2[transformCount - i] - min) / (max - min);
        }

        return {
            arr1: outArr1,
            arr2: outArr2,
        };
    }
}



var baseStyles = `
    .max-cycle {
        text-align: center;
        position: relative;
        bottom: 1px;
        font-size: 12px;
        background: #3b3b3b;
        padding: 2px 5px;
        border-radius: 3px;
    }
    span {
        padding: 5px 10px;
        display: inline-block;
        border-radius: 3px;
    }
`;

var baseStyleSheet = document.createElement("style");
baseStyleSheet.textContent = baseStyles;
document.head.appendChild(baseStyleSheet);

if (false) {
    // исходная отрисовка старых сигналов
    var styles = `
        .sqz-bar {
            width: 6px;
            background-color: #ccc;
            display: inline-block;
            margin: 10px 20px 0 40px;
            position: absolute;
            bottom: 80px;
        }
        .sqz-dot {
            width: 6px;
            height: 6px;
            background-color: #ccc;
            display: inline-block;
            margin: 10px 20px 0 40px;
            position: absolute;
            bottom: 80px;
        }
        .mesa-bar {
            width: 360px;
            height: 2px;
            background-color: #ccc;
            display: inline-block;
            margin: 10px 20px;
            position: absolute;
            bottom: 80px;
        }
        #mama-bar {
            background-color: #7344A6;
        }
        #fama-bar {
            background-color: #E1A971;
        }

    `;

    var styleSheet = document.createElement("style");
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
}

function logTradeToGoogleSheets(appversion, symbolName, openTime, betTime, openPrice, closePrice, betAmount, betStatus, betProfit, totalBalance) {

    // logTradeToGoogleSheets(appversion, symbolName, openTime, betTime, openPrice, closePrice, betAmount, betStatus, betProfit);
    const data = { appversion, reverse, symbolName, openTime, betTime, openPrice, closePrice, betAmount, betStatus, betProfit, totalBalance };
  
    fetch(webhookUrl, {
    method: 'POST',
    mode: 'no-cors', // This will bypass CORS, but with limitations
    body: JSON.stringify(data),
    headers: {
        'Content-Type': 'application/json'
    }
    })
    .then(res => res.text())
    .then(response => {
    // console.log('Trade logged:', response);
    })
    .catch(err => {
    console.error('Error logging trade:', err);
    });
  }
