/* ═══════════════════════════════════════════════════════════
   MONOPOLY ONLINE v3.0 — game.js  (complete rewrite)
   ═══════════════════════════════════════════════════════════ */
"use strict";

/* ─── GLOBALS ─────────────────────────────────────────── */
let socket, myId, myRoomId, lobbyData, gs=null;
let curBoardType="standard", curSize=9, curRMode="balanced", curSeed="";
let wwSelectedCities={};
let _tokenMoving=false, _prevMoney={};
let browseInterval=null;
let currentTheme=localStorage.getItem("mono_theme")||"dark";
let incomingTrade=null, _tradeTarget=null, tFromSel=[], tToSel=[];
let avatarReturnScreen="land";
let _auctionTimer=null, _auctionSecsLeft=10;

/* ─── AVATAR STATE ─────────────────────────────────────── */
let myAvatar=JSON.parse(localStorage.getItem("mono_avatar")||"null")||
  {skinTone:"#F5CBA7",hairStyle:"short",hairColor:"#3B2314",beardStyle:"none",eyeStyle:"normal"};

const SKIN_TONES  =["#FDDBB4","#F5CBA7","#E8AC7A","#C68642","#8D5524","#4A2912"];
const HAIR_COLORS =["#3B2314","#7B3F00","#B5651D","#D4A017","#FFD700","#C0C0C0","#2C2C2C","#8B0000","#E8B4B8"];
const HAIR_STYLES =["none","short","long","curly","spiky","mohawk","bun","wavy"];
const BEARD_STYLES=["none","stubble","moustache","goatee","full","long-beard","handlebar"];
const EYE_STYLES  =["normal","wide","sleepy","sunglasses","wink"];

/* ─── EDITOR STATE ─────────────────────────────────────── */
let editorBoard=[];
let editorSize=9;
let editorCountries=[]; // loaded from /api/countries
let editorSettings={
  auctionMode:"none",citiesPerCountry:3,housingRule:"monopoly",
  evenBuild:true,mortgageEnabled:true,pricingModel:"standard",housingMultiplier:2,
  startingCash:1500,goSalary:200,treasurePot:true,incomeTaxRate:10,
  airportFee:100,railwayFee:75,noRentInJail:true,
  enableVeryBadSurprises:true,enableVeryGoodSurprises:true,
  maxPlayers:6,privateRoom:false
};
let editorDragSrc=null;
let editorCustomSpaces=null; // custom board from editor

/* ─── HELPERS ──────────────────────────────────────────── */
const CUR=()=>gs?.settings?.currency||"$";
const DF=["⚀","⚁","⚂","⚃","⚄","⚅"];
const GRP_COLORS=["#b91c1c","#92400e","#15803d","#1d4ed8","#7c3aed","#be185d","#0f766e","#1e40af"];
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function qs(s){return document.querySelector(s);}
function qid(id){return document.getElementById(id);}
function om(id){qid(id)?.classList.remove("ovh");}
function cm(id){qid(id)?.classList.add("ovh");}
function ga(action,data={}){socket?.emit("game_action",{action,data});}
function sanitize(s,n=200){return String(s||"").replace(/[<>&"']/g,"").trim().slice(0,n);}

/* ─── THEMES ───────────────────────────────────────────── */
const THEMES={
  dark:{name:"Dark",bg:"#09090f",accent:"#f5c518"},
  cyberpunk:{name:"Cyberpunk",bg:"#020008",accent:"#00fff0"},
  gold:{name:"Gold",bg:"#0a0800",accent:"#ffd700"},
  ocean:{name:"Ocean",bg:"#00090f",accent:"#00e5ff"},
  neon:{name:"Neon",bg:"#000",accent:"#ffff00"},
  forest:{name:"Forest",bg:"#040a04",accent:"#a8c060"},
  midnight:{name:"Midnight",bg:"#040412",accent:"#bb86fc"},
  sakura:{name:"Sakura",bg:"#0f0509",accent:"#ff8fab"},
};
function setTheme(t,btn){
  currentTheme=t; document.body.setAttribute("data-theme",t);
  localStorage.setItem("mono_theme",t);
  document.querySelectorAll(".tbtn").forEach(b=>b.classList.remove("active"));
  if(btn) btn.classList.add("active");
}

/* ─── AVATAR DRAW ──────────────────────────────────────── */
function drawAvatar(canvas,av,size=80){
  const ctx=canvas.getContext("2d");
  const cx=size/2,cy=size/2,r=size*0.45;
  ctx.clearRect(0,0,size,size);
  // Face
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.fillStyle=av.skinTone||"#F5CBA7";ctx.fill();
  ctx.strokeStyle="rgba(0,0,0,.15)";ctx.lineWidth=1.5;ctx.stroke();
  // Ears
  ctx.fillStyle=av.skinTone||"#F5CBA7";
  [-1,1].forEach(side=>{
    ctx.beginPath();ctx.ellipse(cx+side*r*0.92,cy,r*.12,r*.2,0,0,Math.PI*2);
    ctx.fill();ctx.strokeStyle="rgba(0,0,0,.1)";ctx.lineWidth=1;ctx.stroke();
  });
  const hc=av.hairColor||"#3B2314";
  // Hair
  ctx.fillStyle=hc;ctx.strokeStyle=hc;
  switch(av.hairStyle||"short"){
    case"short":
      ctx.beginPath();ctx.ellipse(cx,cy-r*.55,r*.85,r*.55,0,Math.PI,0);ctx.fill();
      ctx.fillRect(cx-r*.85,cy-r*.55,r*1.7,r*.32);break;
    case"long":
      ctx.beginPath();ctx.ellipse(cx,cy-r*.55,r*.85,r*.55,0,Math.PI,0);ctx.fill();
      ctx.fillRect(cx-r*.85,cy-r*.55,r*.25,r*1.6);
      ctx.fillRect(cx+r*.6,cy-r*.55,r*.25,r*1.6);
      ctx.fillRect(cx-r*.85,cy-r*.55,r*1.7,r*.28);break;
    case"curly":
      for(let a=0;a<Math.PI;a+=.38){
        const bx=cx+Math.cos(a)*r*.82,by=cy+Math.sin(a-Math.PI)*r*.45;
        ctx.beginPath();ctx.arc(bx,by,r*.16,0,Math.PI*2);ctx.fill();
      }
      ctx.fillRect(cx-r*.82,cy-r*.08,r*1.64,r*.28);break;
    case"spiky":
      for(let a=Math.PI;a<=Math.PI*2;a+=.33){
        ctx.beginPath();
        ctx.moveTo(cx+Math.cos(a)*r*.82,cy+Math.sin(a)*r*.82);
        ctx.lineTo(cx+Math.cos(a+.18)*r,cy+Math.sin(a+.18)*r);
        ctx.lineTo(cx+Math.cos(a-.18)*r,cy+Math.sin(a-.18)*r);
        ctx.closePath();ctx.fill();
      }break;
    case"mohawk":
      ctx.fillRect(cx-r*.12,cy-r*1.1,r*.24,r*.72);
      ctx.beginPath();ctx.arc(cx,cy-r*1.1,r*.12,0,Math.PI*2);ctx.fill();
      ctx.fillRect(cx-r*.85,cy-r*.52,r*1.7,r*.22);break;
    case"bun":
      ctx.fillRect(cx-r*.85,cy-r*.52,r*1.7,r*.28);
      ctx.beginPath();ctx.arc(cx,cy-r*.78,r*.3,0,Math.PI*2);ctx.fill();break;
    case"wavy":
      ctx.beginPath();ctx.moveTo(cx-r*.85,cy-r*.12);
      for(let x=-0.85;x<0.85;x+=.2)
        ctx.quadraticCurveTo(cx+x*r,cy-r*(.48+.14*Math.sin(x*5)),cx+(x+.1)*r,cy-r*.12);
      ctx.fill();break;
  }
  // Eyes
  const eyeY=cy-r*.1,eyeOff=r*.3;
  const es=av.eyeStyle||"normal";
  if(es==="sunglasses"){
    ctx.fillStyle="#1a1a2e";
    [[cx-eyeOff,eyeY],[cx+eyeOff,eyeY]].forEach(([ex,ey])=>{
      ctx.fillRect(ex-r*.18,ey-r*.1,r*.36,r*.18);
    });
    ctx.strokeStyle="#666";ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(cx-eyeOff+r*.18,eyeY);ctx.lineTo(cx+eyeOff-r*.18,eyeY);ctx.stroke();
  }else{
    [[cx-eyeOff,eyeY],[cx+eyeOff,eyeY]].forEach(([ex,ey],i)=>{
      ctx.beginPath();
      if(es==="wink"&&i===1){ctx.moveTo(ex-r*.12,ey);ctx.lineTo(ex+r*.12,ey);ctx.strokeStyle="#333";ctx.lineWidth=2;ctx.stroke();}
      else if(es==="sleepy"){ctx.ellipse(ex,ey,r*.12,r*.06,0,0,Math.PI*2);ctx.fillStyle="#2c2c2c";ctx.fill();}
      else if(es==="wide"){
        ctx.arc(ex,ey,r*.16,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();
        ctx.beginPath();ctx.arc(ex,ey,r*.09,0,Math.PI*2);ctx.fillStyle="#111";ctx.fill();
        ctx.beginPath();ctx.arc(ex+r*.04,ey-r*.04,r*.03,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();
      }else{
        ctx.arc(ex,ey,r*.13,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();
        ctx.beginPath();ctx.arc(ex,ey,r*.08,0,Math.PI*2);ctx.fillStyle="#111";ctx.fill();
        ctx.beginPath();ctx.arc(ex+r*.03,ey-r*.03,r*.025,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();
      }
    });
    // Eyebrows
    ctx.strokeStyle=hc;ctx.lineWidth=Math.max(1,size*.022);ctx.lineCap="round";
    [cx-eyeOff,cx+eyeOff].forEach(ex=>{
      ctx.beginPath();ctx.moveTo(ex-r*.14,eyeY-r*.22);ctx.lineTo(ex+r*.14,eyeY-r*.18);ctx.stroke();
    });
  }
  // Nose
  ctx.strokeStyle="rgba(0,0,0,.15)";ctx.lineWidth=1.2;ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(cx,cy-r*.04);ctx.lineTo(cx-r*.08,cy+r*.14);ctx.lineTo(cx+r*.08,cy+r*.14);ctx.stroke();
  // Mouth
  ctx.beginPath();ctx.arc(cx,cy+r*.24,r*.18,.2,Math.PI-.2);
  ctx.strokeStyle="#c04060";ctx.lineWidth=1.8;ctx.stroke();
  // Beard
  ctx.fillStyle=hc;ctx.strokeStyle=hc;
  switch(av.beardStyle||"none"){
    case"stubble":
      ctx.globalAlpha=.22;
      for(let i=0;i<45;i++){
        const bx=cx+(Math.random()-.5)*r*1.2,by=cy+(Math.random()+.2)*r*.65;
        ctx.fillRect(bx,by,1,2);
      }ctx.globalAlpha=1;break;
    case"moustache":
      ctx.beginPath();ctx.ellipse(cx-r*.14,cy+r*.27,r*.18,r*.07,.3,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(cx+r*.14,cy+r*.27,r*.18,r*.07,-.3,0,Math.PI*2);ctx.fill();break;
    case"goatee":
      ctx.beginPath();ctx.ellipse(cx,cy+r*.43,r*.2,r*.15,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(cx-r*.14,cy+r*.27,r*.13,r*.06,.3,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(cx+r*.14,cy+r*.27,r*.13,r*.06,-.3,0,Math.PI*2);ctx.fill();break;
    case"full":
      ctx.beginPath();
      ctx.moveTo(cx-r*.65,cy+r*.2);
      ctx.quadraticCurveTo(cx-r*.75,cy+r*.88,cx,cy+r*.9);
      ctx.quadraticCurveTo(cx+r*.75,cy+r*.88,cx+r*.65,cy+r*.2);
      ctx.lineTo(cx+r*.45,cy+r*.18);ctx.lineTo(cx,cy+r*.52);ctx.lineTo(cx-r*.45,cy+r*.18);
      ctx.closePath();ctx.fill();break;
    case"long-beard":
      ctx.beginPath();
      ctx.moveTo(cx-r*.65,cy+r*.2);
      ctx.quadraticCurveTo(cx-r*.8,cy+r*1.3,cx,cy+r*1.42);
      ctx.quadraticCurveTo(cx+r*.8,cy+r*1.3,cx+r*.65,cy+r*.2);
      ctx.lineTo(cx+r*.45,cy+r*.18);ctx.lineTo(cx,cy+r*.56);ctx.lineTo(cx-r*.45,cy+r*.18);
      ctx.closePath();ctx.fill();break;
    case"handlebar":
      ctx.lineWidth=r*.06;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(cx-r*.04,cy+r*.26);
      ctx.quadraticCurveTo(cx-r*.38,cy+r*.2,cx-r*.48,cy+r*.34);
      ctx.quadraticCurveTo(cx-r*.56,cy+r*.44,cx-r*.46,cy+r*.4);ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx+r*.04,cy+r*.26);
      ctx.quadraticCurveTo(cx+r*.38,cy+r*.2,cx+r*.48,cy+r*.34);
      ctx.quadraticCurveTo(cx+r*.56,cy+r*.44,cx+r*.46,cy+r*.4);ctx.stroke();break;
  }
}

function drawAvatarSVG(av,size=36){
  const c=document.createElement("canvas");
  c.width=c.height=size;
  drawAvatar(c,av||{skinTone:"#F5CBA7",hairStyle:"short",hairColor:"#3B2314",beardStyle:"none",eyeStyle:"normal"},size);
  return c.toDataURL();
}

function initAvatarUI(){
  const tgt=qid("avatar-preview");if(!tgt)return;
  qid("av-skin").innerHTML=SKIN_TONES.map(c=>`<div class="av-swatch ${myAvatar.skinTone===c?"sel":""}" style="background:${c}" onclick="setAv('skinTone','${c}',this,'av-skin')"></div>`).join("");
  qid("av-haircolor").innerHTML=HAIR_COLORS.map(c=>`<div class="av-swatch ${myAvatar.hairColor===c?"sel":""}" style="background:${c}" onclick="setAv('hairColor','${c}',this,'av-haircolor')"></div>`).join("");
  const hL={none:"None",short:"Short",long:"Long",curly:"Curly",spiky:"Spiky",mohawk:"Mohawk",bun:"Bun",wavy:"Wavy"};
  qid("av-hair").innerHTML=HAIR_STYLES.map(s=>`<button class="av-chip ${myAvatar.hairStyle===s?"sel":""}" onclick="setAv('hairStyle','${s}',this,'av-hair')">${hL[s]}</button>`).join("");
  const bL={none:"None",stubble:"Stubble",moustache:"Moustache",goatee:"Goatee",full:"Full Beard","long-beard":"Long","handlebar":"Handlebar"};
  qid("av-beard").innerHTML=BEARD_STYLES.map(s=>`<button class="av-chip ${myAvatar.beardStyle===s?"sel":""}" onclick="setAv('beardStyle','${s}',this,'av-beard')">${bL[s]}</button>`).join("");
  const eL={normal:"Normal",wide:"Wide",sleepy:"Sleepy",sunglasses:"Shades",wink:"Wink"};
  qid("av-eyes").innerHTML=EYE_STYLES.map(s=>`<button class="av-chip ${myAvatar.eyeStyle===s?"sel":""}" onclick="setAv('eyeStyle','${s}',this,'av-eyes')">${eL[s]}</button>`).join("");
  refreshAvatarPreview();
}
function setAv(k,v,el,grp){
  myAvatar[k]=v;
  qid(grp)?.querySelectorAll(".sel").forEach(e=>e.classList.remove("sel"));
  el?.classList.add("sel");refreshAvatarPreview();
}
function refreshAvatarPreview(){const c=qid("avatar-preview");if(c)drawAvatar(c,myAvatar,120);}
function openAvatarFromBoards(){avatarReturnScreen="boards";ss("avatar");initAvatarUI();}
function openAvatarFromEditor(){avatarReturnScreen="editor";ss("avatar");initAvatarUI();}
function confirmAvatar(){localStorage.setItem("mono_avatar",JSON.stringify(myAvatar));ss(avatarReturnScreen);}

/* ─── SOCKET ───────────────────────────────────────────── */
function _initSocketCore(){
  socket=io({reconnection:true,reconnectionDelay:500});
  socket.on("connect",()=>{
    if(qid("conn-info"))qid("conn-info").textContent="✅ Connected";
    // Auto-reconnect to room
    if(myRoomId&&myId) socket.emit("reconnect_player",{roomId:myRoomId,playerId:myId});
  });
  socket.on("disconnect",()=>{if(qid("conn-info"))qid("conn-info").textContent="❌ Disconnected";});
  socket.on("online_count",({count})=>{if(qid("online-cnt"))qid("online-cnt").textContent=count+" online";});
  socket.on("room_created",({roomId,player})=>{myId=player.id;myRoomId=roomId;qid("share-url").textContent=`${location.origin}/room/${roomId}`;ss("lobby");});
  socket.on("room_joined",({roomId,player})=>{myId=player.id;myRoomId=roomId;qid("share-url").textContent=`${location.origin}/room/${roomId}`;ss("lobby");});
  socket.on("join_error",({message})=>toast("❌ "+message));
  socket.on("lobby_update",d=>{lobbyData=d;renderLobby();});
  socket.on("game_started",({gameState})=>{gs=gameState;ss("game");renderGame(true);});
  socket.on("state_update",({gameState})=>onStateUpdate(gameState));
  socket.on("game_over",({winnerId})=>showWin(winnerId));
  socket.on("trade_incoming",d=>showIncomingTrade(d));
  socket.on("trade_accepted",()=>{toast("✅ Trade accepted!");cm("m-t-in");cm("m-neg");renderSidePanels();});
  socket.on("trade_declined",()=>{toast("❌ Trade declined.");cm("m-neg");});
  socket.on("trade_negotiate",d=>showNegotiateModal(d));
  socket.on("chat_msg",m=>appendChat(m));
  socket.on("player_left",({playerId})=>{const p=gs?.players.find(x=>x.id===playerId);if(p){p.disconnected=true;renderGame(false);}});
  socket.on("auction_ended",()=>{stopAuctionTimer();});
}

/* ─── SCREENS ──────────────────────────────────────────── */
function ss(n){
  document.querySelectorAll(".screen").forEach(s=>{
    s.classList.remove("active");
    s.style.pointerEvents="none";
  });
  const target=qid("sc-"+n);
  if(target){
    target.classList.add("active");
    target.style.pointerEvents="";
  }
}

/* ─── STATE UPDATE ─────────────────────────────────────── */
async function onStateUpdate(newGs){
  const oldGs=gs;
  gs=newGs;
  if(oldGs){
    for(const p of gs.players){
      const old=oldGs.players.find(q=>q.id===p.id);
      if(!old)continue;
      const delta=p.money-old.money;
      if(Math.abs(delta)>0)animateMoneyDelta(p.id,delta);
    }
  }
  if(oldGs&&!_tokenMoving){
    for(const p of gs.players){
      const old=oldGs.players.find(q=>q.id===p.id);
      if(!old||old.position===p.position||p.bankrupted)continue;
      await animateTokenStep(p.id,old.position,p.position,gs.board.length);
    }
  }
  renderGame(false);
  handlePendingEvent();
  // Auction state
  if(gs.phase==="auction"&&gs.auction?.active){
    renderAuctionModal();
  }else{
    stopAuctionTimer();cm("m-auction");
  }
}

/* ─── ANIMATION: Money Delta ────────────────────────────── */
function animateMoneyDelta(playerId,delta){
  const row=qid("pp-row-"+playerId);if(!row)return;
  row.querySelectorAll(".money-delta").forEach(e=>e.remove());
  const el=document.createElement("div");
  el.className="money-delta "+(delta>0?"gain":"loss");
  el.textContent=(delta>0?"+":"")+CUR()+Math.abs(delta).toLocaleString();
  row.style.position="relative";
  row.appendChild(el);
  setTimeout(()=>el.remove(),1000);
}

/* ─── ANIMATION: Token Step ─────────────────────────────── */
async function animateTokenStep(playerId,from,to,boardLen){
  _tokenMoving=true;
  const S=gs?.tilesPerSide||9;
  const {cPx,tPx}=getBoardDims(S);
  let cur=from;
  const steps=to>=from?to-from:boardLen-from+to;
  for(let i=0;i<steps;i++){
    cur=(cur+1)%boardLen;
    const tok=qid("tok-"+playerId);if(!tok)break;
    const {x,y}=txy(cur,S,cPx,tPx);
    const off=getTokenOffsets(playerId);
    tok.style.left=(x+off.ox-18)+"px";tok.style.top=(y+off.oy-18)+"px";
    if(i===steps-1){tok.classList.remove("landing");void tok.offsetWidth;tok.classList.add("landing");flashTile(cur);}
    await sleep(i===steps-1?0:120);
  }
  _tokenMoving=false;
}

function flashTile(pos){
  document.querySelectorAll(".sp").forEach(t=>{
    if(parseInt(t.dataset.pos)===pos){
      t.classList.remove("land-flash");void t.offsetWidth;t.classList.add("land-flash");
      setTimeout(()=>t.classList.remove("land-flash"),600);
    }
  });
}

/* ─── BOARD GEOMETRY ────────────────────────────────────── */
function getBoardDims(S){
  const cPx=100;
  const areaEl=qid("game-area");
  const avail=areaEl?Math.min(areaEl.offsetWidth-24,areaEl.offsetHeight-80)-cPx*2:500;
  const tPx=Math.min(88,Math.max(50,Math.floor(avail/S)));
  return{cPx,tPx};
}
function gridPos(pos,S){
  const C=S+1;
  if(pos===0)return{col:S+2,row:S+2};
  if(pos<C)return{col:S+2-pos,row:S+2};
  if(pos===C)return{col:1,row:S+2};
  if(pos<2*C)return{col:1,row:S+2-(pos-C)};
  if(pos===2*C)return{col:1,row:1};
  if(pos<3*C)return{col:pos-2*C+1,row:1};
  if(pos===3*C)return{col:S+2,row:1};
  return{col:S+2,row:pos-3*C+1};
}
function sideOf(pos,S){
  const C=S+1,corners=[0,C,2*C,3*C];
  if(corners.includes(pos))return"corner";
  if(pos>0&&pos<C)return"bottom";
  if(pos>C&&pos<2*C)return"left";
  if(pos>2*C&&pos<3*C)return"top";
  return"right";
}
function txy(pos,S,cPx,tPx){
  const{col,row}=gridPos(pos,S);
  const cx=col===1?cPx/2:col===S+2?cPx+S*tPx+cPx/2:cPx+(col-2)*tPx+tPx/2;
  const cy=row===1?cPx/2:row===S+2?cPx+S*tPx+cPx/2:cPx+(row-2)*tPx+tPx/2;
  return{x:cx,y:cy};
}
function getTokenOffsets(playerId){
  const idx=gs?.players.findIndex(p=>p.id===playerId)||0;
  return{ox:(idx%3)*9-9,oy:Math.floor(idx/3)*9-4};
}

/* ─── RENDER GAME ───────────────────────────────────────── */
function renderGame(init){
  if(!gs)return;
  renderBoard();
  renderTokensInstant(init);
  updateDiceOver();
  renderActions();
  renderSidePanels();
}
function renderSidePanels(){renderPlayersPanel();renderPropsPanel();renderTradePanel();renderBankPanel();}

/* ─── BOARD RENDER ──────────────────────────────────────── */
function renderBoard(){
  const S=gs.tilesPerSide||9,C=S+1,total=gs.board.length;
  const board=qid("game-board");if(!board)return;
  const{cPx,tPx}=getBoardDims(S);
  const boardPx=cPx*2+S*tPx;
  board.style.cssText=`grid-template-columns:${cPx}px repeat(${S},${tPx}px) ${cPx}px;grid-template-rows:${cPx}px repeat(${S},${tPx}px) ${cPx}px`;
  const area=qid("game-area");
  if(area){
    const aW=area.offsetWidth-8,aH=area.offsetHeight-8;
    const scale=Math.min(1,Math.min(aW,aH)/boardPx);
    const wrap=qid("board-wrap");
    wrap.style.transformOrigin="center center";
    wrap.style.transform=`scale(${scale})`;
  }
  board.innerHTML="";

  const GC={
    0:"#b91c1c",1:"#92400e",2:"#15803d",3:"#1d4ed8",
    4:"#7c3aed",5:"#be185d",6:"#0f766e",7:"#1e40af"
  };
  const ICONS={
    airport:"✈️",railway:"🚂",gov_prot:"🏛️",chest:"📦",
    chance:"❓",income_tax:"💰",property_tax:"🏠",
    gains_tax:"📈",luxury_tax:"💸",empty:"·"
  };
  const CORNERS={
    0:{ico:"🚀",lbl:"START",bg:"linear-gradient(135deg,var(--corner),color-mix(in srgb,var(--green) 20%,var(--corner)))"},
    [C]:{ico:"⛓️",lbl:"JAIL",bg:"linear-gradient(135deg,var(--corner),color-mix(in srgb,var(--orange) 18%,var(--corner)))"},
    [2*C]:{ico:"🅿️",lbl:"FREE",bg:"linear-gradient(135deg,var(--corner),color-mix(in srgb,var(--purple) 18%,var(--corner)))"},
    [3*C]:{ico:"👮",lbl:"GO JAIL",bg:"linear-gradient(135deg,var(--corner),color-mix(in srgb,var(--red) 20%,var(--corner)))"}
  };

  for(let pos=0;pos<total;pos++){
    const sp=gs.board[pos];
    const{col,row}=gridPos(pos,S);
    const side=sideOf(pos,S);
    const isCorner=CORNERS[pos]!=null;
    const isHaz=pos===gs.hazardPos,isTR=pos===gs.taxReturnPos,isRT=pos===gs.randomTaxPos;
    const hasFullSet=sp?.group&&sp?.owner&&gs.board.filter(s=>s.group===sp.group&&s.type==="property").every(s=>s.owner===sp.owner);

    const div=document.createElement("div");
    div.dataset.pos=pos;
    div.style.cssText=`grid-column:${col};grid-row:${row}`;
    div.onclick=()=>showPropModal(pos);

    let cls=`sp sp-${side}`;
    if(sp?.mortgaged)cls+=" spmort";
    if(isHaz)cls+=" sphaz";
    if(isTR)cls+=" sptaxret";
    if(isRT)cls+=" sprandomtax";
    if(hasFullSet)cls+=" sp-fullset";
    div.className=cls;

    if(isCorner){
      const c=CORNERS[pos];
      div.className+=" spco";
      div.style.background=c.bg;
      div.innerHTML=`<div class="ci"><span class="ci-ico">${c.ico}</span><span class="ci-lbl">${c.lbl}</span></div>`;
    }else{
      // Determine strip color and icon
      const gi=sp?.group?parseInt(sp.group.slice(1)):-1;
      const stripColor=gi>=0?GC[gi]:null;

      let ico=isHaz?"☠️":isTR?"📋":isRT?"🎲":(ICONS[sp?.type]||sp?.countryFlag||"🏙️");

      // Ownership dot
      let ownerDot="";
      if(sp?.owner){
        const o=gs.players.find(p=>p.id===sp.owner);
        if(o)ownerDot=`<div class="own-dot" style="background:${o.color}"></div>`;
      }

      // Houses
      const h=sp?.houses||0;
      const housesHTML=h>0?`<div class="sp-hs">${h===5?'<div class="htl"></div>':Array(h).fill('<div class="hd"></div>').join("")}</div>`:"";

      // 2x badge
      const badge2x=hasFullSet&&h===0?'<div class="set-2x-badge">2×</div>':"";

      // Group tint background
      if(stripColor&&!isHaz&&!isTR&&!isRT){
        div.style.background=`color-mix(in srgb,${stripColor} 8%,var(--card))`;
      }

      const priceHTML=sp?.price?`<div class="sp-pr">${CUR()}${sp.price}</div>`:"";
      const stripHTML=stripColor?`<div class="sp-band" style="background:${stripColor}"></div>`:"";

      div.innerHTML=`${stripHTML}<div class="sp-body"><div class="sp-ico">${ico}</div><div class="sp-nm">${sp?.name||""}</div>${priceHTML}</div>${housesHTML}${ownerDot}${badge2x}`;
    }
    board.appendChild(div);
  }
}

/* ─── TOKEN RENDER ──────────────────────────────────────── */
function renderTokensInstant(init){
  document.querySelectorAll(".ptok").forEach(t=>t.remove());
  if(!gs)return;
  const S=gs.tilesPerSide||9;
  const{cPx,tPx}=getBoardDims(S);
  const wrap=qid("board-wrap");if(!wrap)return;
  gs.players.forEach((p,i)=>{
    if(p.bankrupted)return;
    const{x,y}=txy(p.position,S,cPx,tPx);
    const{ox,oy}=getTokenOffsets(p.id);
    const tok=document.createElement("canvas");
    tok.width=tok.height=36;
    tok.className=`ptok${i===gs.currentPlayerIdx?" cur-player":""}`;
    tok.id="tok-"+p.id;
    tok.title=`${p.name}: ${CUR()}${p.money}`;
    tok.style.cssText=`left:${x+ox-18}px;top:${y+oy-18}px;position:absolute;border-radius:50%;cursor:default;`;
    drawAvatar(tok,p.avatar||{},36);
    const ctx=tok.getContext("2d");
    ctx.strokeStyle=p.color;ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(18,18,16,0,Math.PI*2);ctx.stroke();
    if(init){tok.style.animation="tokenDrop .4s ease";}
    wrap.appendChild(tok);
  });
}

/* ─── PLAYERS PANEL ─────────────────────────────────────── */
function renderPlayersPanel(){
  const el=qid("panel-players");if(!el||!gs)return;
  el.innerHTML=gs.players.map((p,i)=>{
    const loan=p.loans?.reduce((s,l)=>s+l.remaining,0)||0;
    const isCur=i===gs.currentPlayerIdx;
    const avImg=drawAvatarSVG(p.avatar||{},30);
    return `<div class="pp-row${isCur?" pp-cur":""}${p.bankrupted?" pp-bankrupt":""}" id="pp-row-${p.id}">
      <img src="${avImg}" width="30" height="30" style="border-radius:50%;border:2px solid ${p.color};flex-shrink:0;animation:${isCur?'avatarPulse 2s infinite':'none'}">
      <div class="pp-info">
        <div class="pp-name" style="color:${p.color}">${p.name}${p.bankrupted?" 💀":p.disconnected?" 📴":p.badDebt?" ⛓️":isCur?" 🎲":""}</div>
        <div class="pp-cash">${CUR()}${p.money.toLocaleString()}</div>
        <div class="pp-sub">${gs.board.filter(s=>s.owner===p.id).length} prop${loan>0?` · 💸${CUR()}${loan}`:""}</div>
      </div>
    </div>`;
  }).join("");
}

/* ─── MY PROPERTIES PANEL ───────────────────────────────── */
function renderPropsPanel(){
  const el=qid("panel-props");if(!el||!gs)return;
  const me=gs.players.find(p=>p.id===myId);
  if(!me||!me.properties.length){el.innerHTML=`<div class="panel-empty">No properties yet</div>`;qid("my-prop-count").textContent="";return;}
  qid("my-prop-count").textContent=me.properties.length+"p";
  el.innerHTML=me.properties.map(pos=>{
    const sp=gs.board[pos];if(!sp)return"";
    const gi=sp.group?parseInt(sp.group.slice(1)):-1;
    const gc=gi>=0?GRP_COLORS[gi]:"#888";
    const h=sp.houses||0;
    const hasSet=sp.group&&gs.board.filter(s=>s.group===sp.group&&s.type==="property").every(s=>s.owner===me.id);
    return `<div class="my-prop-item${hasSet?" has-set":""}" onclick="showPropModal(${pos})">
      <div class="my-prop-dot" style="background:${gc}"></div>
      <div class="my-prop-nm">${sp.countryFlag||""}${sp.name}</div>
      <div class="my-prop-hs">${sp.mortgaged?"🔒":h===5?"🏨":h>0?"🏠".repeat(h):""}</div>
      ${hasSet?`<div class="set-dot" title="Full set — 2× rent">★</div>`:""}
    </div>`;
  }).join("");
}

/* ─── TRADE PANEL ───────────────────────────────────────── */
function renderTradePanel(){
  const el=qid("trade-player-list");if(!el||!gs)return;
  const others=gs.players.filter(p=>p.id!==myId&&!p.bankrupted);
  if(!others.length){el.innerHTML=`<div class="panel-empty">No other players</div>`;return;}
  el.innerHTML=others.map(p=>`
    <div class="trade-prow ${_tradeTarget===p.id?"sel":""}" onclick="selectTradeTarget('${p.id}')">
      <div class="pp-dot" style="background:${p.color}"></div>
      <div style="flex:1;font-size:.78rem"><b>${p.name}</b><br><span style="color:var(--muted)">${CUR()}${p.money}</span></div>
      <span style="font-size:.7rem;color:var(--muted)">${gs.board.filter(s=>s.owner===p.id).length}🏠</span>
    </div>`).join("");
}

function selectTradeTarget(pid){_tradeTarget=pid;tFromSel=[];tToSel=[];renderTradePanel();renderTradeExpanded();}

function renderTradeExpanded(){
  const el=qid("trade-expanded");if(!el||!gs)return;
  if(!_tradeTarget){el.style.display="none";return;}
  el.style.display="block";
  const me=gs.players.find(p=>p.id===myId);
  const to=gs.players.find(p=>p.id===_tradeTarget);
  if(!me||!to)return;
  const myP=gs.board.filter(s=>["property","airport","railway"].includes(s.type)&&s.owner===me.id);
  const thP=gs.board.filter(s=>["property","airport","railway"].includes(s.type)&&s.owner===to.id);
  el.innerHTML=`<div style="font-size:.73rem;font-weight:700;margin-bottom:.4rem;color:var(--accent)">Trade with ${to.name}</div>
    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:.3rem;margin-bottom:.4rem">
      <div>
        <div style="font-size:.67rem;color:var(--muted);margin-bottom:.2rem">You give</div>
        ${myP.map(s=>`<div class="trade-prop-row ${tFromSel.includes(s.pos)?"sel":""}" onclick="togTP('from',${s.pos})">${s.countryFlag||""}${s.name}</div>`).join("")||`<span style="font-size:.66rem;color:var(--muted)">—</span>`}
        <input type="number" id="tf-m" value="0" min="0" max="${me.money}" step="50" class="inp" style="width:100%;font-size:.7rem;margin-top:.3rem;padding:.18rem .3rem">
      </div>
      <div style="align-self:center;font-size:.9rem">⇄</div>
      <div>
        <div style="font-size:.67rem;color:var(--muted);margin-bottom:.2rem">${to.name} gives</div>
        ${thP.map(s=>`<div class="trade-prop-row ${tToSel.includes(s.pos)?"sel":""}" onclick="togTP('to',${s.pos})">${s.countryFlag||""}${s.name}</div>`).join("")||`<span style="font-size:.66rem;color:var(--muted)">—</span>`}
        <input type="number" id="tt-m" value="0" min="0" max="${to.money}" step="50" class="inp" style="width:100%;font-size:.7rem;margin-top:.3rem;padding:.18rem .3rem">
      </div>
    </div>
    <button class="btn btn-acc btn-sm" style="width:100%" onclick="sendTrade()">📨 Send Offer</button>`;
}

function togTP(side,pos){const arr=side==="from"?tFromSel:tToSel;const i=arr.indexOf(pos);if(i>=0)arr.splice(i,1);else arr.push(pos);renderTradeExpanded();}

function sendTrade(){
  const fm=+qid("tf-m")?.value||0,tm=+qid("tt-m")?.value||0;
  if(!_tradeTarget){toast("Select a player first");return;}
  socket.emit("trade_offer",{toPlayerId:_tradeTarget,offer:{fromProps:[...tFromSel],toProps:[...tToSel],fromMoney:fm,toMoney:tm}});
  toast("📨 Trade offer sent!");tFromSel=[];tToSel=[];renderTradeExpanded();
}

function showIncomingTrade({tradeId,fromId,toId,offer}){
  if(toId!==myId)return;
  incomingTrade={tradeId,fromId,offer};
  const from=gs?.players.find(p=>p.id===fromId);
  const dp=pos=>gs?.board[pos]?`${gs.board[pos].countryFlag||""}${gs.board[pos].name}`:`#${pos}`;
  qid("tin-c").innerHTML=`
    <h2>💱 Offer from <span style="color:${from?.color||"var(--accent)"}">${from?.name||"?"}</span></h2>
    <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin:.7rem 0">
      <div style="flex:1;min-width:120px;background:var(--bg);border-radius:8px;padding:.6rem">
        <div style="font-size:.68rem;color:var(--muted);margin-bottom:.2rem">They give you</div>
        <div style="font-size:.78rem">${offer.toProps?.map(dp).join(", ")||"nothing"}</div>
        ${offer.fromMoney?`<div style="color:var(--green);font-size:.85rem;font-weight:700">+${CUR()}${offer.fromMoney}</div>`:""}
      </div>
      <div style="flex:1;min-width:120px;background:var(--bg);border-radius:8px;padding:.6rem">
        <div style="font-size:.68rem;color:var(--muted);margin-bottom:.2rem">You give</div>
        <div style="font-size:.78rem">${offer.fromProps?.map(dp).join(", ")||"nothing"}</div>
        ${offer.toMoney?`<div style="color:var(--red);font-size:.85rem;font-weight:700">-${CUR()}${offer.toMoney}</div>`:""}
      </div>
    </div>
    <div style="display:flex;gap:.4rem;flex-wrap:wrap">
      <button class="btn btn-acc" onclick="respondTrade(true)">✅ Accept</button>
      <button class="btn btn-red" onclick="respondTrade(false)">❌ Decline</button>
      <button class="btn btn-out" onclick="openNegotiate()">🔄 Counter</button>
    </div>`;
  om("m-t-in");
}

function declineTrade(){respondTrade(false);}
function respondTrade(ok){if(!incomingTrade)return;socket.emit("trade_respond",{...incomingTrade,accepted:ok});cm("m-t-in");incomingTrade=null;}

function openNegotiate(){
  if(!incomingTrade||!gs)return;
  const from=gs.players.find(p=>p.id===incomingTrade.fromId);
  const me=gs.players.find(p=>p.id===myId);
  const myP=gs.board.filter(s=>["property","airport","railway"].includes(s.type)&&s.owner===myId);
  const thP=gs.board.filter(s=>["property","airport","railway"].includes(s.type)&&s.owner===incomingTrade.fromId);
  qid("neg-c").innerHTML=`
    <p style="color:var(--muted);font-size:.78rem">Send a counter-offer to ${from?.name}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:.5rem">
      <div>
        <div style="font-size:.72rem;font-weight:700;color:var(--accent);margin-bottom:.2rem">I'll give</div>
        ${myP.map(s=>`<div class="trade-prop-row" id="neg-f-${s.pos}" onclick="this.classList.toggle('sel')">${s.countryFlag||""}${s.name}</div>`).join("")||"<span style='font-size:.68rem;color:var(--muted)'>None</span>"}
        <input type="number" id="neg-fm" value="0" min="0" max="${me?.money||0}" step="50" class="inp" placeholder="$ you send" style="width:100%;margin-top:.3rem;font-size:.72rem">
      </div>
      <div>
        <div style="font-size:.72rem;font-weight:700;color:var(--orange);margin-bottom:.2rem">I want</div>
        ${thP.map(s=>`<div class="trade-prop-row" id="neg-t-${s.pos}" onclick="this.classList.toggle('sel')">${s.countryFlag||""}${s.name}</div>`).join("")||"<span style='font-size:.68rem;color:var(--muted)'>None</span>"}
        <input type="number" id="neg-tm" value="0" min="0" max="${from?.money||0}" step="50" class="inp" placeholder="$ you want" style="width:100%;margin-top:.3rem;font-size:.72rem">
      </div>
    </div>
    <input class="inp" id="neg-msg" placeholder="Message (optional)" maxlength="200" style="width:100%;margin-bottom:.4rem">
    <div style="display:flex;gap:.4rem">
      <button class="btn btn-acc" onclick="sendNegotiate()">📨 Send Counter</button>
      <button class="btn btn-out" onclick="cm('m-neg')">Cancel</button>
    </div>`;
  cm("m-t-in");om("m-neg");
}

function sendNegotiate(){
  if(!incomingTrade)return;
  const fp=[...document.querySelectorAll("[id^='neg-f-'].sel")].map(e=>parseInt(e.id.split("-")[2]));
  const tp=[...document.querySelectorAll("[id^='neg-t-'].sel")].map(e=>parseInt(e.id.split("-")[2]));
  const offer={fromProps:fp,toProps:tp,fromMoney:+qid("neg-fm")?.value||0,toMoney:+qid("neg-tm")?.value||0};
  socket.emit("trade_negotiate",{tradeId:incomingTrade.tradeId,toId:incomingTrade.fromId,offer,message:qid("neg-msg")?.value||""});
  cm("m-neg");incomingTrade=null;toast("🔄 Counter sent!");
}

function showNegotiateModal({tradeId,fromId,toId,offer,message}){
  if(toId!==myId)return;
  incomingTrade={tradeId,fromId,offer};
  const from=gs?.players.find(p=>p.id===fromId);
  const dp=pos=>gs?.board[pos]?`${gs.board[pos].countryFlag||""}${gs.board[pos].name}`:`#${pos}`;
  qid("tin-c").innerHTML=`
    <h2>🔄 Counter from <span style="color:${from?.color||"var(--accent)"}">${from?.name||"?"}</span></h2>
    ${message?`<div style="background:var(--bg);border-radius:6px;padding:.4rem;font-size:.76rem;margin-bottom:.5rem;font-style:italic">"${message}"</div>`:""}
    <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin:.6rem 0">
      <div style="flex:1;background:var(--bg);border-radius:8px;padding:.5rem">
        <div style="font-size:.66rem;color:var(--muted)">They give</div>
        <div style="font-size:.76rem">${offer.toProps?.map(dp).join(", ")||"nothing"}</div>
        ${offer.fromMoney?`<div style="color:var(--green)">+${CUR()}${offer.fromMoney}</div>`:""}
      </div>
      <div style="flex:1;background:var(--bg);border-radius:8px;padding:.5rem">
        <div style="font-size:.66rem;color:var(--muted)">You give</div>
        <div style="font-size:.76rem">${offer.fromProps?.map(dp).join(", ")||"nothing"}</div>
        ${offer.toMoney?`<div style="color:var(--red)">-${CUR()}${offer.toMoney}</div>`:""}
      </div>
    </div>
    <div style="display:flex;gap:.4rem;flex-wrap:wrap">
      <button class="btn btn-acc" onclick="respondTrade(true)">✅ Accept</button>
      <button class="btn btn-red" onclick="respondTrade(false)">❌ Decline</button>
      <button class="btn btn-out" onclick="openNegotiate()">🔄 Counter Again</button>
    </div>`;
  om("m-t-in");
}

/* ─── BANK PANEL ─────────────────────────────────────────── */
function renderBankPanel(){
  const me=gs?.players.find(p=>p.id===myId);if(!me||!gs)return;
  const s=gs.settings,cur=s.currency||"$";
  const dep=me.bankDeposit+me.bankDepositInterest;
  qid("bm-dep").innerHTML=`
    <div style="font-size:.73rem;margin-bottom:.3rem">
      <div style="display:flex;justify-content:space-between"><span>Deposited</span><b>${cur}${me.bankDeposit}</b></div>
      <div style="display:flex;justify-content:space-between"><span>Interest</span><b style="color:var(--teal)">${cur}${me.bankDepositInterest}</b></div>
      <div style="font-size:.65rem;color:var(--muted)">Rate: ${s.depositRate}%/round</div>
    </div>
    <div style="display:flex;gap:.25rem;margin-bottom:.22rem">
      <input type="number" id="dep-a" value="100" min="1" max="${me.money}" step="50" class="inp" style="flex:1;font-size:.7rem">
      <button class="btn btn-sm btn-blu" onclick="ga('bank_deposit',{amount:+qid('dep-a').value})">Dep</button>
    </div>
    ${dep>0?`<div style="display:flex;gap:.25rem"><input type="number" id="wit-a" value="${dep}" min="1" max="${dep}" step="50" class="inp" style="flex:1;font-size:.7rem"><button class="btn btn-sm btn-grn" onclick="ga('bank_withdraw',{amount:+qid('wit-a').value})">Wit</button></div>`:""}`;
  qid("bm-loans").innerHTML=`
    <div style="font-size:.65rem;color:var(--muted);margin-bottom:.28rem">Rate:${s.loanRate}%/round · Max:${cur}5000</div>
    ${me.loans?.map((l,i)=>`<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:.35rem;margin-bottom:.25rem">
      <div style="display:flex;justify-content:space-between;font-size:.72rem"><span>Loan ${i+1}: <b>${cur}${l.remaining}</b></span><span style="color:${l.turnsLeft<=2?"var(--red)":"var(--muted)"}">${l.turnsLeft}t</span></div>
      <div style="display:flex;gap:.18rem;margin-top:.2rem;flex-wrap:wrap">
        ${[100,250].filter(a=>a<=l.remaining&&a<=me.money).map(a=>`<button class="btn btn-sm btn-out" style="font-size:.65rem;padding:.1rem .28rem" onclick="ga('bank_repay',{loanId:'${l.id}',amount:${a}})">-${cur}${a}</button>`).join("")}
        ${me.money>=l.remaining?`<button class="btn btn-sm btn-grn" style="font-size:.65rem;padding:.1rem .28rem" onclick="ga('bank_repay',{loanId:'${l.id}',amount:${l.remaining}})">Pay All</button>`:""}
      </div>
    </div>`).join("")||`<div style="font-size:.7rem;color:var(--muted)">No active loans</div>`}
    <div style="display:flex;gap:.22rem;margin-top:.25rem;flex-wrap:wrap">
      <input type="number" id="loan-a" value="500" min="100" max="5000" step="100" class="inp" style="flex:1;min-width:55px;font-size:.7rem">
      <select id="loan-t" class="inp" style="font-size:.7rem;padding:.15rem"><option value="4">4t</option><option value="6" selected>6t</option><option value="8">8t</option><option value="12">12t</option></select>
      <button class="btn btn-sm btn-blu" onclick="ga('bank_loan',{amount:+qid('loan-a').value,tenure:+qid('loan-t').value})">Loan</button>
    </div>`;
  qid("bm-cc").innerHTML=me.creditCard?.active?`
    <div style="font-size:.72rem"><div style="display:flex;justify-content:space-between"><span>Used</span><b>${cur}${me.creditCard.used}/${cur}${me.creditCard.limit}</b></div><div style="display:flex;justify-content:space-between"><span>EMI</span><b>${cur}${me.creditCard.emi}/GO</b></div><div style="display:flex;justify-content:space-between"><span>Rounds</span><b>${Math.ceil(me.creditCard.roundsLeft)}</b></div></div>
    ${me.money>=me.creditCard.emi?`<button class="btn btn-sm btn-pur" style="width:100%;margin-top:.25rem" onclick="ga('bank_pay_emi')">Pay EMI ${cur}${me.creditCard.emi}</button>`:""}`:`
    <div style="font-size:.7rem;color:var(--muted);margin-bottom:.28rem">Fee: ${cur}${s.creditCardFee} · Limit: ${cur}${s.creditCardLimit}</div>
    <div style="display:flex;gap:.22rem">
      <select id="cc-t" class="inp" style="flex:1;font-size:.7rem"><option value="3">3t</option><option value="6" selected>6t</option><option value="9">9t</option></select>
      <button class="btn btn-sm btn-pur" onclick="ga('bank_credit',{tenure:+qid('cc-t').value})">Get Card</button>
    </div>`;
  qid("bm-ins").innerHTML=me.hasInsurance?`
    <div style="font-size:.72rem;color:var(--green)">🛡️ Active</div>
    <div style="font-size:.65rem;color:var(--muted)">Covers ${s.insurancePayout}% losses. Premium: ${cur}${s.insurancePremium}/GO</div>
    ${(me.pendingHazardLoss||0)+(me.pendingHazardRebuildCost||0)>0?`<button class="btn btn-sm btn-grn" style="width:100%;margin-top:.25rem" onclick="ga('claim_insurance')">Claim ${cur}${Math.floor(((me.pendingHazardLoss||0)+(me.pendingHazardRebuildCost||0))*(s.insurancePayout/100))}</button>`:""}`:`
    <div style="font-size:.7rem;color:var(--muted);margin-bottom:.25rem">One-time ${cur}150 · ${s.insurancePayout}% coverage</div>
    ${me.money>=150?`<button class="btn btn-grn" style="width:100%" onclick="ga('bank_insurance')">🛡️ Buy Insurance</button>`:`<span style="font-size:.7rem;color:var(--muted)">Need ${cur}150</span>`}`;
}
function bmtab(id,btn){
  document.querySelectorAll(".bmt").forEach(b=>b.classList.remove("on"));
  document.querySelectorAll(".bank-sec").forEach(s=>s.classList.remove("on"));
  btn.classList.add("on");qid("bm-"+id).classList.add("on");
}

/* ─── ACTION BAR ─────────────────────────────────────────── */
let _bannerTimer=null;
function showTurnBanner(name){
  const b=qid("turn-banner");if(!b)return;
  b.textContent=name==="You"?"🎲 YOUR TURN!":name+"'s turn";
  b.classList.add("show");if(_bannerTimer)clearTimeout(_bannerTimer);
  _bannerTimer=setTimeout(()=>b.classList.remove("show"),2800);
}

function updateDiceOver(){
  const o=qid("dice-over");if(!o)return;
  const isMT=gs?.players[gs.currentPlayerIdx]?.id===myId;
  if(gs?.phase==="roll"&&isMT)o.classList.remove("dh");else o.classList.add("dh");
  if(gs?.lastRoll){qid("d1").textContent=DF[gs.lastRoll[0]-1];qid("d2").textContent=DF[gs.lastRoll[1]-1];}
}

function animDice(cb){
  const d1=qid("d1"),d2=qid("d2");
  let n=0;const iv=setInterval(()=>{
    d1.textContent=DF[Math.floor(Math.random()*6)];d2.textContent=DF[Math.floor(Math.random()*6)];
    if(++n>11){clearInterval(iv);if(cb)cb();}
  },55);
}

function _renderActionsCore(){
  if(!gs)return;
  const me=gs.players.find(p=>p.id===myId);
  const cur=gs.players[gs.currentPlayerIdx];
  const isMT=cur?.id===myId;
  const loan=me?.loans?.reduce((s,l)=>s+l.remaining,0)||0;
  if(qid("turn-box"))qid("turn-box").innerHTML=isMT
    ?`<div><span class="tname">Your Turn! 🎉</span></div><div style="font-size:.71rem;color:var(--muted)">Cash: <b style="color:var(--green)">${CUR()}${me?.money||0}</b>${me?.bankDeposit>0?` · Dep: ${CUR()}${me.bankDeposit+me.bankDepositInterest}`:""}${loan>0?` · Debt: <b style="color:var(--red)">${CUR()}${loan}</b>`:""}</div>`
    :`<div>Waiting for <span class="tname">${cur?.name||"—"}</span></div><div style="font-size:.71rem;color:var(--muted)">Your cash: ${CUR()}${me?.money||0}</div>`;
  if(isMT&&gs.phase==="roll")showTurnBanner("You");
  const al=qid("ablist");if(!al)return;
  if(!isMT||!me||me.bankrupted){al.innerHTML=`<div style="color:var(--muted);font-size:.75rem;padding:.35rem">Waiting…</div>`;return;}
  let h="";
  if(gs.phase==="roll"){
    if(me.badDebt){
      h+=`<div style="background:color-mix(in srgb,var(--red) 10%,transparent);border:1px solid var(--red);border-radius:7px;padding:.45rem;font-size:.73rem;text-align:center;color:var(--red)">⛓️ Bad Debt (${me.badDebtTurns}/3)</div>`;
      if(me.govProtCards>0)h+=`<button class="btn btn-acc btn-sm" onclick="ga('use_gov_prot')">🏛️ Gov Card</button>`;
      h+=`<button class="btn btn-out btn-sm" onclick="ga('roll')">End Turn</button>`;
    }else if(me.inJail){
      h+=`<button class="btn btn-acc" onclick="rollDice()">🎲 Roll Doubles</button>`;
      h+=`<button class="btn btn-out" onclick="ga('pay_jail')">💸 Pay ${CUR()}50</button>`;
      if(me.jailCards>0)h+=`<button class="btn btn-out" onclick="ga('use_jail_card')">🃏 Free Card</button>`;
    }else{h+=`<button class="btn btn-acc" onclick="rollDice()">🎲 Roll Dice</button>`;}
  }
  if(gs.phase==="buy"){
    const sp=gs.board[me.position];
    const canAuction=gs.settings?.auctionMode&&gs.settings.auctionMode!=="none";
    h+=`<button class="btn btn-acc" onclick="ga('buy')">🏠 Buy ${CUR()}${sp?.price}</button>`;
    if(canAuction)h+=`<button class="btn btn-blu" onclick="ga('start_auction')">🔨 Auction</button>`;
    h+=`<button class="btn btn-out" onclick="ga('pass')">❌ Pass</button>`;
  }
  if(gs.phase==="auction"){
    const auc=gs.auction;
    if(auc&&!auc.folded?.includes(myId)){
      h+=`<button class="btn btn-grn btn-sm" onclick="auctionBid(${auc.currentBid+10})">+${CUR()}10</button>`;
      h+=`<button class="btn btn-grn btn-sm" onclick="auctionBid(${auc.currentBid+50})">+${CUR()}50</button>`;
      h+=`<button class="btn btn-grn btn-sm" onclick="auctionBid(${auc.currentBid+100})">+${CUR()}100</button>`;
      h+=`<input type="number" id="custom-bid" class="inp" style="width:72px;font-size:.72rem" value="${auc.currentBid+20}" min="${auc.currentBid+1}">`;
      h+=`<button class="btn btn-acc btn-sm" onclick="auctionCustomBid()">Bid</button>`;
      h+=`<button class="btn btn-red btn-sm" onclick="auctionFold()">🏳️ Fold</button>`;
    }else if(auc?.folded?.includes(myId)){h+=`<div style="color:var(--muted);font-size:.76rem">You folded</div>`;}
  }
  if(gs.phase==="air_travel")h+=`<button class="btn btn-blu" onclick="showTravModal()">✈ Fly (${CUR()}${gs.settings.travelFee})</button><button class="btn btn-out" onclick="ga('skip_travel')">Stay</button>`;
  if(gs.phase==="rail_travel")h+=`<button class="btn btn-out" style="border-color:#8d6e63;color:#bcaaa4" onclick="showRailModal()">🚂 Ride (${CUR()}${gs.settings.railwayFee||75})</button><button class="btn btn-out" onclick="ga('skip_travel')">Stay</button>`;
  if(gs.phase==="go_prompt"&&gs.pendingEvent){
    const emi=gs.pendingEvent.emi||0;
    h+=`<div class="turn-box"><b>Passed GO! +${CUR()}${gs.settings.goSalary}</b>${emi?`<br>💳 EMI due: ${CUR()}${emi}`:""}</div>`;
    if(emi)h+=`<button class="btn btn-acc" onclick="ga('go_pay_emi')">Pay ${CUR()}${emi}</button>`;
    h+=`<button class="btn btn-out" onclick="ga('go_end')">Continue</button>`;
  }
  if(["hazard_event","gov_prot_event","surprise_event"].includes(gs.phase))
    h+=`<button class="btn btn-acc" style="width:100%" onclick="ga('hazard_ack');cm('m-surp');cm('m-gov')">Continue →</button>`;
  if(gs.phase==="action"){
    h+=`<button class="btn btn-out" onclick="showBuildModal()">🏗️ Build</button>`;
    h+=`<button class="btn btn-out" onclick="showMortModal()">🔒 Mortgage</button>`;
    const totalLoss=(me.pendingHazardLoss||0)+(me.pendingHazardRebuildCost||0);
    if(totalLoss>0&&me.hasInsurance)h+=`<button class="btn btn-grn btn-sm" onclick="ga('claim_insurance')">🛡️ Claim ${CUR()}${Math.floor(totalLoss*(gs.settings.insurancePayout/100))}</button>`;
    h+=`<button class="btn btn-acc" onclick="ga('end_turn')">▶ End Turn</button>`;
    if(gs.treasurePot>0)h+=`<div class="pot">💰 Pot: ${CUR()}${gs.treasurePot}</div>`;
    // Bankrupt auction button for any owned property with houses
    const myHouseProps=gs.board.filter(s=>s.owner===myId&&(s.houses||0)>0);
    if(myHouseProps.length&&me.money<0)h+=`<button class="btn btn-out btn-sm" onclick="showBankruptAuctionModal()">🔨 Auction Property</button>`;
  }
  al.innerHTML=h;
}

/* ─── AUCTION ────────────────────────────────────────────── */
function auctionBid(amount){socket.emit("auction_bid",{amount});}
function auctionCustomBid(){const v=+qid("custom-bid")?.value;if(v)auctionBid(v);}
function auctionFold(){socket.emit("auction_fold");}

function renderAuctionModal(){
  if(!gs?.auction)return;
  const auc=gs.auction;
  const sp=gs.board[auc.pos];
  const highBidder=gs.players.find(p=>p.id===auc.highBidder);
  const me=gs.players.find(p=>p.id===myId);
  const myFolded=auc.folded?.includes(myId);
  const iAmHigh=auc.highBidder===myId;
  const gi=sp?.group?parseInt(sp.group.slice(1)):-1;
  const gc=gi>=0?GRP_COLORS[gi]:"#888";
  const ps=auc.propertySnapshot||{};
  qid("auction-c").innerHTML=`
    <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.6rem">
      <div style="width:14px;height:14px;border-radius:50%;background:${gc}"></div>
      <h2 style="margin:0;font-size:1rem">🔨 Auction: ${sp?.countryFlag||ps.countryFlag||""}${sp?.name||ps.name}</h2>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:.7rem">
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:.6rem">
        <div style="font-size:.65rem;color:var(--muted);margin-bottom:.3rem">PROPERTY INFO</div>
        <div style="font-size:.75rem">Price: <b>${CUR()}${ps.price||sp?.price||0}</b></div>
        <div style="font-size:.75rem">Sell: <b>${CUR()}${Math.floor((ps.price||sp?.price||0)/2)}</b></div>
        ${ps.rents?ps.rents.map((r,i)=>{const l=["Base","1🏠","2🏠","3🏠","4🏠","🏨"][i];return`<div style="font-size:.68rem;display:flex;justify-content:space-between"><span>${l}</span><b>${CUR()}${r}</b></div>`;}).join(""):""}
        ${ps.houses?`<div style="font-size:.72rem;color:var(--orange);margin-top:.2rem">Houses on it: ${ps.houses}</div>`:""}
        ${ps.stateName?`<div style="font-size:.65rem;color:var(--muted)">📍 ${ps.stateName}</div>`:""}
        ${ps.countryName?`<div style="font-size:.65rem;color:var(--muted)">🌍 ${ps.countryName}</div>`:""}
      </div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:.6rem">
        <div style="font-size:.65rem;color:var(--muted);margin-bottom:.3rem">AUCTION STATUS</div>
        <div style="font-size:1.5rem;font-weight:900;color:var(--accent)">${CUR()}${auc.currentBid}</div>
        <div style="font-size:.72rem;color:${iAmHigh?"var(--green)":"var(--muted)"}">${highBidder?`Leading: ${highBidder.name}`:"No bids yet"}</div>
        <div style="margin-top:.4rem;font-size:.72rem;color:var(--muted)">Your cash: ${CUR()}${me?.money||0}</div>
        <div style="font-size:.65rem;color:var(--muted)">Folded: ${auc.folded?.length||0}</div>
        <div id="auc-timer" style="font-size:1.1rem;font-weight:800;color:var(--orange);margin-top:.3rem"></div>
      </div>
    </div>
    <div style="margin-bottom:.5rem;max-height:80px;overflow-y:auto">
      ${auc.bidHistory?.slice(-5).reverse().map(b=>`<div style="font-size:.7rem;padding:.15rem 0;border-bottom:1px solid var(--border)22"><b>${b.playerName}</b> bid <b style="color:var(--accent)">${CUR()}${b.amount}</b></div>`).join("")||`<div style="font-size:.7rem;color:var(--muted)">No bids yet — base price: ${CUR()}${auc.basePrice}</div>`}
    </div>
    ${!myFolded?`
    <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.4rem">
      <button class="btn btn-grn btn-sm" onclick="auctionBid(${auc.currentBid+10})">+${CUR()}10</button>
      <button class="btn btn-grn btn-sm" onclick="auctionBid(${auc.currentBid+50})">+${CUR()}50</button>
      <button class="btn btn-grn btn-sm" onclick="auctionBid(${auc.currentBid+100})">+${CUR()}100</button>
    </div>
    <div style="display:flex;gap:.35rem">
      <input type="number" id="auc-custom" class="inp" value="${auc.currentBid+20}" min="${auc.currentBid+1}" style="flex:1;font-size:.75rem">
      <button class="btn btn-acc btn-sm" onclick="auctionCustomBid2()">Bid</button>
      <button class="btn btn-red btn-sm" onclick="auctionFold()">🏳️ Fold</button>
    </div>`:`<div style="font-size:.78rem;color:var(--muted);text-align:center;padding:.4rem">You folded from this auction</div>`}`;
  om("m-auction");
  startAuctionTimerDisplay();
}

function auctionCustomBid2(){const v=+qid("auc-custom")?.value;if(v)auctionBid(v);}

let _aucDisplayTimer=null;
function startAuctionTimerDisplay(){
  stopAuctionTimer();
  _auctionSecsLeft=10;
  _aucDisplayTimer=setInterval(()=>{
    _auctionSecsLeft--;
    const el=qid("auc-timer");
    if(el)el.textContent=_auctionSecsLeft>0?`⏱ ${_auctionSecsLeft}s`:"⏱ Closing…";
    if(_auctionSecsLeft<=0)stopAuctionTimer();
  },1000);
}
function stopAuctionTimer(){clearInterval(_aucDisplayTimer);_aucDisplayTimer=null;}
function showBankruptAuctionModal(){
  const myHouseProps=gs?.board.filter(s=>s.owner===myId&&(s.houses||0)>0)||[];
  const me=gs?.players.find(p=>p.id===myId);
  // Show a quick picker
  const base=myHouseProps[0];if(!base)return;
  const pi=gs.players.findIndex(p=>p.id===myId);
  ga("bankrupt_auction",{position:base.pos});
}

/* ─── PENDING EVENTS ─────────────────────────────────────── */
function handlePendingEvent(){
  if(!gs?.pendingEvent)return;
  const ev=gs.pendingEvent;
  if(ev.type==="surprise"||ev.type==="hazard")showSurpriseModal(ev);
  if(ev.type==="gov_prot")showGovModal(ev);
  if(ev.type==="tax_return")toast(`📋 Tax Return! ${ev.message}`);
}
function handleSurpriseClose(){ga("hazard_ack");cm("m-surp");}

function showSurpriseModal(ev){
  let tier="good",lbl="😊 Good Luck!";
  const card=ev.card||ev.hazard;
  if(ev.tier==="very_good"){tier="very-good";lbl="🌟 JACKPOT!";}
  else if(ev.tier==="very_bad"){tier="very-bad";lbl="💀 CATASTROPHE!";}
  else if(ev.tier==="bad"||ev.isHazard){tier="bad";lbl="😬 Bad Luck!";}
  let amount=0;
  if(card?.action==="gain")amount=card.amount;
  if(card?.action==="pay")amount=-card.amount;
  if(ev.lostMoney)amount=-ev.lostMoney;
  qid("surp-c").innerHTML=`
    <div class="surp-card ${tier} card-reveal">
      <div class="surp-tier">${lbl}</div>
      <span class="surp-ico">${card?.icon||"🃏"}</span>
      ${card?.title?`<div class="surp-title">${card.title}</div>`:""}
      <div class="surp-text">${card?.text||card?.desc||""}</div>
      ${amount?`<div class="surp-amount" style="color:${amount>0?"var(--green)":"var(--red)"}">${amount>0?"+":""} ${CUR()}${Math.abs(amount)}</div>`:""}
      ${ev.lostHouses?`<div style="color:var(--orange);font-size:.8rem">🏚️ ${ev.lostHouses} structure(s) demolished</div>`:""}
    </div>
    <button class="btn btn-acc" style="width:100%;margin-top:.6rem" onclick="handleSurpriseClose()">Continue</button>`;
  om("m-surp");
}
function showGovModal(ev){
  qid("gov-c").innerHTML=`
    <div class="card-reveal" style="background:color-mix(in srgb,var(--green) 8%,var(--card));border:2px solid var(--green);border-radius:12px;padding:1.1rem;text-align:center">
      <div style="font-size:2.4rem">🏛️</div>
      <div style="font-size:1rem;font-weight:800;color:var(--green)">Government Protection</div>
      <div style="font-size:.8rem;color:var(--muted);margin-top:.3rem">${ev.message}</div>
    </div>
    <button class="btn btn-acc" style="width:100%;margin-top:.55rem" onclick="ga('gov_ack');cm('m-gov')">Continue</button>`;
  om("m-gov");
}

/* ─── PROPERTY MODAL ─────────────────────────────────────── */
function showPropModal(pos){
  if(!gs)return;
  const sp=gs.board[pos];
  if(!sp||["go","jail","free_parking","go_to_jail"].includes(sp.type))return;
  const own=sp.owner?gs.players.find(p=>p.id===sp.owner):null;
  const gi=sp.group?parseInt(sp.group.slice(1)):-1;
  const gc=gi>=0?GRP_COLORS[gi]:"#666";
  const hasSet=sp.group&&gs.board.filter(s=>s.group===sp.group&&s.type==="property").every(s=>s.owner===sp.owner);
  let rH="";
  if(sp.type==="property"&&sp.rents){
    const lbls=["Base","1🏠","2🏠","3🏠","4🏠","🏨"];
    rH=`<table class="rtbl"><tr><th>Level</th><th>Rent</th></tr>${sp.rents.map((r,i)=>`<tr class="${(sp.houses||0)===i?"rhl":""}"><td>${lbls[i]}</td><td>${CUR()}${hasSet&&i===0?`<b style="color:var(--accent)">${r*2}</b> <span style='color:var(--muted);font-size:.7em'>×2 SET</span>`:r}</td></tr>`).join("")}</table>`;
  }
  if(sp.type==="airport")rH=`<table class="rtbl"><tr><th>Airports</th><th>Fee</th></tr>${[1,2,3,4].map(n=>`<tr><td>${n}</td><td>${CUR()}${gs.settings.airportFee*n}</td></tr>`).join("")}</table>`;
  if(sp.type==="railway")rH=`<table class="rtbl"><tr><th>Railways</th><th>Fee</th></tr>${[1,2,3,4].map(n=>`<tr><td>${n}</td><td>${CUR()}${25*Math.pow(2,n-1)}</td></tr>`).join("")}</table>`;
  qid("prop-c").innerHTML=`
    <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem">
      <div style="width:14px;height:14px;border-radius:50%;background:${gc}"></div>
      <h2 style="margin:0;font-size:.95rem">${sp.countryFlag||""}${sp.name}</h2>
      ${hasSet?`<span style="font-size:.68rem;background:var(--accent);color:#000;padding:.12rem .4rem;border-radius:10px;font-weight:700">★ FULL SET 2×</span>`:""}
    </div>
    ${sp.stateName?`<p style="color:var(--muted);font-size:.72rem;margin-bottom:.3rem">📍 ${sp.stateName} · ${sp.countryName||""}</p>`:""}
    ${own?`<p style="color:${own.color};font-size:.78rem;margin-bottom:.35rem">Owner: ${own.name}</p>`:`<p style="color:var(--muted);font-size:.76rem;margin-bottom:.35rem">Unowned</p>`}
    ${sp.mortgaged?`<p style="color:var(--red);font-size:.75rem">⚠️ Mortgaged</p>`:""}
    ${sp.price?`<p style="font-size:.82rem;margin-bottom:.35rem">Price: <b>${CUR()}${sp.price}</b>${sp.houseCost?` · House: <b>${CUR()}${sp.houseCost}</b>`:""}</p>`:""}
    ${rH}`;
  om("m-prop");
}

/* ─── TRAVEL MODALS ──────────────────────────────────────── */
function showTravModal(){
  const me=gs.players.find(p=>p.id===myId);
  const airports=gs.board.filter(s=>s.type==="airport"&&s.pos!==me?.position);
  qid("trav-c").innerHTML=`<h2>✈ Choose Destination</h2>
    <p style="color:var(--muted);font-size:.78rem;margin-bottom:.5rem">Fee: <b>${CUR()}${gs.settings.travelFee}</b></p>
    <div class="trav-list">${airports.map(a=>{
      const ok=(me?.money||0)>=gs.settings.travelFee;
      const own=a.owner?gs.players.find(p=>p.id===a.owner):null;
      return `<div class="trav-item${ok?"":" disabled"}" onclick="${ok?`ga('travel_air',{destPos:${a.pos}});cm('m-trav')`:""}">
        <div><div style="font-weight:700">✈ ${a.name}</div><div style="font-size:.7rem;color:${own?own.color:"var(--muted)"}">${own?"Owner: "+own.name:"Unowned"}</div></div>
        <div style="color:var(--accent);font-size:.76rem">${ok?CUR()+gs.settings.travelFee:"No funds"}</div>
      </div>`;
    }).join("")}</div>
    <button class="btn btn-out" style="width:100%;margin-top:.3rem" onclick="ga('skip_travel');cm('m-trav')">Stay Here</button>`;
  om("m-trav");
}
function showRailModal(){
  const me=gs.players.find(p=>p.id===myId);
  const cur=gs.board[me?.position];
  if(!cur?.connects){ga("skip_travel");return;}
  qid("rail-c").innerHTML=`<h2>🚂 ${cur.name}</h2>
    <p style="color:var(--muted);font-size:.78rem;margin-bottom:.5rem">Fee: <b>${CUR()}${gs.settings.railwayFee||75}</b></p>
    <div class="trav-list">${(cur.connects||[]).map(destPos=>{
      const dest=gs.board[destPos];
      const ok=(me?.money||0)>=(gs.settings.railwayFee||75);
      const bonus=cur.goBonus?.includes(destPos);
      return `<div class="trav-item${ok?"":" disabled"}" onclick="${ok?`ga('travel_rail',{destPos:${destPos}});cm('m-rail')`:""}">
        <div><div style="font-weight:700">🚂 ${dest?.name||"Railway"}</div>${bonus?`<div style="font-size:.68rem;color:var(--accent)">+GO salary 🎉</div>`:""}</div>
        <div style="color:var(--orange);font-size:.76rem">${ok?CUR()+(gs.settings.railwayFee||75):"No funds"}</div>
      </div>`;
    }).join("")}</div>
    <button class="btn btn-out" style="width:100%;margin-top:.3rem" onclick="ga('skip_travel');cm('m-rail')">Stay</button>`;
  om("m-rail");
}
function showBuildModal(){
  const me=gs.players.find(p=>p.id===myId);
  const buildable=gs.board.filter(s=>{
    if(s.type!=="property"||s.owner!==me.id||s.mortgaged)return false;
    if(gs.settings.housingRule==="monopoly"&&!gs.board.filter(x=>x.group===s.group&&x.type==="property").every(x=>x.owner===me.id))return false;
    return(s.houses||0)<5;
  });
  qid("build-c").innerHTML=`<h2>🏗️ Build / Sell</h2>
    <p style="font-size:.78rem;color:var(--muted)">Cash: ${CUR()}${me.money}</p>
    ${!buildable.length?`<p style="color:var(--muted);font-size:.8rem">No buildable properties (need full colour group).</p>`:""}
    <div style="display:flex;flex-direction:column;gap:.35rem">
      ${buildable.map(s=>{
        const h=s.houses||0,gi=parseInt(s.group.slice(1));
        return`<div style="background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:.48rem .55rem">
          <div style="display:flex;align-items:center;gap:.38rem;margin-bottom:.28rem">
            <div style="width:9px;height:9px;border-radius:50%;background:${GRP_COLORS[gi]}"></div>
            <strong style="font-size:.8rem">${s.countryFlag||""}${s.name}</strong>
            <span style="font-size:.68rem;color:var(--muted)">${h<5?h+"h":"🏨"}</span>
          </div>
          <div style="display:flex;gap:.28rem">
            ${h<5?`<button class="btn btn-sm btn-grn" onclick="ga('build',{position:${s.pos}})">Build ${CUR()}${s.houseCost}</button>`:""}
            ${h>0?`<button class="btn btn-sm btn-red" onclick="ga('sell_house',{position:${s.pos}})">Sell ${CUR()}${Math.floor(s.houseCost/2)}</button>`:""}
          </div>
        </div>`;
      }).join("")}
    </div>
    <button class="btn btn-out" style="width:100%;margin-top:.55rem" onclick="cm('m-build')">Close</button>`;
  om("m-build");
}
function showMortModal(){
  const me=gs.players.find(p=>p.id===myId);
  const myProps=gs.board.filter(s=>["property","airport","railway"].includes(s.type)&&s.owner===me.id);
  qid("mort-c").innerHTML=`<h2>🔒 Mortgage</h2>
    <div style="display:flex;flex-direction:column;gap:.3rem">
      ${myProps.map(s=>{
        const gi=s.group?parseInt(s.group.slice(1)):-1;
        return`<div style="background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:.42rem .55rem;display:flex;align-items:center;gap:.38rem">
          ${gi>=0?`<div style="width:8px;height:8px;border-radius:50%;background:${GRP_COLORS[gi]}"></div>`:""}
          <span style="flex:1;font-size:.78rem">${s.countryFlag||""}${s.name}</span>
          ${s.mortgaged
            ?`<span style="font-size:.7rem;color:var(--red)">Mortgaged</span><button class="btn btn-sm btn-grn" onclick="ga('unmortgage',{position:${s.pos}})">Unmortgage ${CUR()}${Math.floor(s.price*.55)}</button>`
            :`<button class="btn btn-sm btn-out" onclick="ga('mortgage',{position:${s.pos}})">Mortgage ${CUR()}${Math.floor(s.price/2)}</button>`}
        </div>`;
      }).join("")}
    </div>
    <button class="btn btn-out" style="width:100%;margin-top:.55rem" onclick="cm('m-mort')">Close</button>`;
  om("m-mort");
}

/* ─── WIN SCREEN ─────────────────────────────────────────── */
function showWin(wid){
  const w=gs?.players.find(p=>p.id===wid);if(!w)return;
  const avImg=drawAvatarSVG(w.avatar||{},80);
  qid("win-c").innerHTML=`<div style="text-align:center;padding:2rem">
    <div style="font-size:3rem;margin-bottom:.5rem">🏆</div>
    <img src="${avImg}" width="80" height="80" style="border-radius:50%;border:4px solid ${w.color};margin-bottom:.5rem;animation:bounce .5s ease infinite alternate">
    <h2 style="color:${w.color};font-size:1.8rem">${w.name} Wins!</h2>
    <p style="color:var(--muted)">Final: ${CUR()}${w.money}</p>
    <button class="btn btn-acc" style="margin-top:1rem" onclick="location.reload()">🎲 Play Again</button>
  </div>`;
  om("m-win");launchConfetti();
}

/* ─── CONFETTI ───────────────────────────────────────────── */
function launchConfetti(){
  const canvas=qid("confetti-canvas");if(!canvas)return;
  canvas.width=window.innerWidth;canvas.height=window.innerHeight;
  const ctx=canvas.getContext("2d");
  const pieces=Array.from({length:180},()=>({
    x:Math.random()*canvas.width,y:-20-Math.random()*80,vx:(Math.random()-.5)*3.5,vy:2+Math.random()*4,
    size:6+Math.random()*7,color:["#f5c518","#22c55e","#ef4444","#3b82f6","#a855f7","#f97316","#14b8a6","#fff"][Math.floor(Math.random()*8)],
    rot:Math.random()*360,rotV:(Math.random()-.5)*8,shape:Math.random()>.4?"rect":"circle"
  }));
  let frame=0;
  function loop(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(const p of pieces){
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot*Math.PI/180);ctx.fillStyle=p.color;
      if(p.shape==="rect")ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*.6);
      else{ctx.beginPath();ctx.arc(0,0,p.size/2,0,Math.PI*2);ctx.fill();}
      ctx.restore();
      p.x+=p.vx;p.y+=p.vy;p.rot+=p.rotV;p.vy+=.07;p.vx*=.99;
    }
    if(++frame<200)requestAnimationFrame(loop);else ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  loop();
}

/* ─── LOBBY ──────────────────────────────────────────────── */
function renderLobby(){
  if(!lobbyData)return;
  const{players,settings}=lobbyData;
  const isHost=players.find(p=>p.id===myId)?.isHost;
  if(isHost&&qid("start-btn"))qid("start-btn").style.display=players.length>=1?"block":"none";
  qid("lobby-players").innerHTML=players.map(p=>{
    const avImg=drawAvatarSVG(p.avatar||{},38);
    return`<div style="display:flex;align-items:center;gap:.5rem;padding:.38rem;border-radius:7px;border:1px solid ${p.isHost?"var(--accent)":"var(--border)"}">
      <img src="${avImg}" width="38" height="38" style="border-radius:50%;border:2px solid ${p.color}">
      <span style="font-weight:700;color:${p.color}">${p.name}</span>
      ${p.isHost?`<span style="font-size:.65rem;background:var(--accent);color:#000;padding:.1rem .35rem;border-radius:8px;font-weight:700">HOST</span>`:""}
    </div>`;
  }).join("");
  qid("lobby-settings").innerHTML=`<div style="font-size:.78rem;line-height:1.9">
    <div>💰 Start: ${settings.currency}${settings.startingCash}</div>
    <div>🚀 GO: ${settings.currency}${settings.goSalary}</div>
    <div>🏦 Loan: ${settings.loanRate}%/round</div>
    <div>🔨 Auction: ${settings.auctionMode||"none"}</div>
  </div>`;
}

function openSetup(){
  if(!lobbyData)return;
  const s=lobbyData.settings;
  function num(k,label,mi,mx,step=50){return`<div style="display:flex;align-items:center;justify-content:space-between;padding:.22rem 0;font-size:.8rem;gap:.4rem"><span>${label}</span><input type="number" value="${s[k]}" min="${mi}" max="${mx}" step="${step}" onchange="us('${k}',+this.value)" class="inp" style="width:75px;font-size:.75rem;padding:.25rem .4rem"></div>`;}
  function tgl(k,label){return`<div style="display:flex;align-items:center;justify-content:space-between;padding:.22rem 0;font-size:.8rem"><span>${label}</span><label class="toggle-sw sm"><input type="checkbox" ${s[k]?"checked":""} onchange="us('${k}',this.checked)"><span class="toggle-knob"></span></label></div>`;}
  const CURRENCIES=[["$","USD — Dollar"],["€","EUR — Euro"],["£","GBP — Pound"],["¥","JPY — Yen"],["₹","INR — Rupee"],["₩","KRW — Won"],["₽","RUB — Ruble"],["R$","BRL — Real"],["A$","AUD — Dollar"],["C$","CAD — Dollar"],["₺","TRY — Lira"],["₦","NGN — Naira"],["฿","THB — Baht"],["Rp","IDR — Rupiah"],["₱","PHP — Peso"]];
  function cur_sel(){return`<div style="display:flex;align-items:center;justify-content:space-between;padding:.22rem 0;font-size:.8rem;gap:.4rem"><span>Currency</span><select onchange="us('currency',this.value)" class="inp" style="font-size:.75rem;padding:.2rem .35rem;width:auto">${CURRENCIES.map(([sym,lbl])=>`<option value="${sym}" ${s.currency===sym?"selected":""}>${sym} ${lbl}</option>`).join("")}</select></div>`;}
  qid("setup-c").innerHTML=`
    <div class="stabs"><button class="stab on" onclick="stab('gen',this)">General</button><button class="stab" onclick="stab('tax',this)">Tax</button><button class="stab" onclick="stab('bank',this)">Bank</button></div>
    <div id="st-gen" class="ssec on">${cur_sel()}${num("startingCash","Start Cash",500,5000)}${num("goSalary","GO Salary",50,1000,50)}${num("maxPlayers","Max Players",2,8,1)}${tgl("treasurePot","Treasure Pot")}${tgl("noRentInJail","No Rent in Jail")}${tgl("evenBuild","Even Build")}${tgl("mortgageEnabled","Mortgage System")}${tgl("auctionMode","Auction on Pass")}</div>
    <div id="st-tax" class="ssec">${num("incomeTaxRate","Income Tax %",0,50,1)}${num("propertyTaxRate","Property Tax %",0,20,1)}${num("gainsTaxRate","Gains Tax %",0,50,1)}${num("randomTaxMultiplier","Random Tax ×",1,50,1)}${num("taxReturnRate","Tax Return %",0,100,5)}</div>
    <div id="st-bank" class="ssec">${num("depositRate","Deposit Rate %",0,20,1)}${num("loanRate","Loan Rate %",0,30,1)}${num("creditCardFee","CC Fee",0,200,10)}${num("creditCardLimit","CC Limit",100,2000,100)}${num("insurancePremium","Insurance Premium",0,200,10)}${num("insurancePayout","Insurance Payout %",0,100,5)}</div>`;
  om("m-setup");
}
function stab(id,btn){document.querySelectorAll(".stab").forEach(b=>b.classList.remove("on"));document.querySelectorAll(".ssec").forEach(s=>s.classList.remove("on"));btn.classList.add("on");qid("st-"+id).classList.add("on");}
function us(k,v){socket.emit("update_settings",{settings:{[k]:v}});}

/* ─── BOARD SELECT ───────────────────────────────────────── */
let _wwCountries=[];
async function loadCountries(){
  if(_wwCountries.length)return;
  try{const r=await fetch("/api/countries");_wwCountries=await r.json();}catch(e){console.warn("Countries load failed",e);}
}

function goBoardSelect(){
  const nm=qid("cr-name")?.value.trim();
  if(qid("bs-name"))qid("bs-name").value=nm||"";
  ss("boards");generateSeed();updateBoardPreview();
}

function setBoardType(t,btn){
  curBoardType=t;
  document.querySelectorAll(".bttab").forEach(b=>b.classList.remove("on"));
  btn.classList.add("on");
  qid("random-panel").style.display=t==="random"?"block":"none";
  qid("worldwide-panel").style.display=t==="worldwide"?"block":"none";
  if(t==="worldwide")renderWorldwidePanel();
  updateBoardPreview();
}
function setSize(s,btn){curSize=s;document.querySelectorAll(".szb").forEach(b=>b.classList.remove("on"));btn.classList.add("on");updateBoardPreview();}
function setRMode(m,btn){curRMode=m;document.querySelectorAll(".rmode-btn").forEach(b=>b.classList.remove("on"));btn.classList.add("on");}
function generateSeed(){
  curSeed=Math.random().toString(36).slice(2,8).toUpperCase();
  if(qid("seed-inp"))qid("seed-inp").value=curSeed;
  if(qid("seed-display"))qid("seed-display").textContent=`Seed: ${curSeed}`;
}
function rerollSeed(){generateSeed();}
function updateBoardPreview(){
  const t=4*(curSize+1);
  const labels={standard:"🌍 Standard World",worldwide:"🗺️ Worldwide Custom",random:"🎲 Random",india:"🇮🇳 India",uk:"🇬🇧 UK",usa:"🇺🇸 USA"};
  if(qid("board-preview"))qid("board-preview").innerHTML=`<span>${labels[curBoardType]||""}<br>${t} tiles</span>`;
  if(qid("board-info"))qid("board-info").textContent=`${t} tiles · 4 airports · 4 railways`;
}

async function renderWorldwidePanel(){
  await loadCountries();
  const el=qid("ww-country-list");if(!el)return;
  el.innerHTML=_wwCountries.map(c=>`
    <div class="country-row">
      <div class="country-hdr" onclick="toggleWWCountry('${c.code}')">
        <span class="country-flag">${c.flag}</span>
        <span class="country-name">${c.name}</span>
        <span class="country-tier">Tier ${c.tier}</span>
        <span class="country-arrow" id="warr-${c.code}">▶</span>
      </div>
      <div class="country-cities" id="wcities-${c.code}" style="display:none">
        ${c.cities.map(city=>`<span class="city-chip ${(wwSelectedCities[c.code]||[]).includes(city)?"sel":""}" onclick="toggleWWCity('${c.code}','${city}',this)">${city}</span>`).join("")}
        <div style="margin-top:.28rem;display:flex;gap:.2rem">
          <button class="btn btn-sm btn-out" style="font-size:.62rem" onclick="wwSelectCountry('${c.code}')">All</button>
          <button class="btn btn-sm btn-out" style="font-size:.62rem" onclick="wwClearCountry('${c.code}')">None</button>
        </div>
      </div>
    </div>`).join("");
  updateWwCount();
}
function toggleWWCountry(code){
  const el=qid("wcities-"+code),arr=qid("warr-"+code);
  const open=el.style.display!=="none";
  el.style.display=open?"none":"block";
  if(arr)arr.textContent=open?"▶":"▼";
  if(!open)el.classList.add("expanding");
  setTimeout(()=>el.classList.remove("expanding"),300);
}
function toggleWWCity(code,city,el){
  if(!wwSelectedCities[code])wwSelectedCities[code]=[];
  const i=wwSelectedCities[code].indexOf(city);
  if(i>=0){wwSelectedCities[code].splice(i,1);el.classList.remove("sel");}
  else{wwSelectedCities[code].push(city);el.classList.add("sel");}
  updateWwCount();
}
function wwSelectCountry(code){
  const c=_wwCountries.find(x=>x.code===code);if(!c)return;
  wwSelectedCities[code]=[...c.cities];
  qid("wcities-"+code)?.querySelectorAll(".city-chip").forEach(e=>e.classList.add("sel"));
  updateWwCount();
}
function wwClearCountry(code){
  wwSelectedCities[code]=[];
  qid("wcities-"+code)?.querySelectorAll(".city-chip").forEach(e=>e.classList.remove("sel"));
  updateWwCount();
}
function wwSelectAll(){_wwCountries.forEach(c=>wwSelectCountry(c.code));}
function wwClearAll(){_wwCountries.forEach(c=>wwClearCountry(c.code));}
function updateWwCount(){
  const total=Object.values(wwSelectedCities).reduce((a,b)=>a+b.length,0);
  if(qid("ww-count"))qid("ww-count").textContent=`${total} cities`;
}

/* ─── CREATE ROOM (FIXED) ────────────────────────────────── */
async function createRoom(){
  // FIX: wait for socket connection with retries
  if(!socket){toast("⚠️ Initializing…");setTimeout(createRoom,800);return;}
  if(!socket.connected){
    toast("⚠️ Connecting… please wait");
    socket.connect();
    await sleep(1500);
    if(!socket.connected){toast("❌ Cannot connect to server. Check your network.");return;}
  }
  const btn=qid("create-btn");
  if(btn){btn.disabled=true;btn.textContent="Creating…";}
  try{
    await _doCreateRoom(editorCustomSpaces);
  }finally{
    if(btn){btn.disabled=false;btn.textContent="▶ Create Game";}
  }
}

async function _doCreateRoom(customSpaces=null){
  const nm=(qid("bs-name")?.value||qid("cr-name")?.value||"Player").trim();
  const isPublic=qid("bs-public")?.checked??true;
  let mapConfig=null;

  if(customSpaces){
    // From editor
    mapConfig={spaces:customSpaces,tilesPerSide:editorSize,name:"Custom Map",settings:editorSettings};
  }else if(curBoardType==="random"){
    const s=(qid("seed-inp")?.value||curSeed).toUpperCase();
    try{
      const r=await fetch(`/api/random-board?seed=${s}&mode=${curRMode}&S=${curSize}`);
      const d=await r.json();
      mapConfig={spaces:d.board,tilesPerSide:curSize,name:`Random #${d.seed}`,seed:d.seed,settings:{}};
    }catch{toast("❌ Error generating board");return;}
  }else if(curBoardType==="worldwide"){
    const selected=[];
    for(const[code,cities]of Object.entries(wwSelectedCities)){
      if(cities.length){const c=_wwCountries.find(x=>x.code===code);if(c)selected.push({...c,cities});}
    }
    if(!selected.length){toast("⚠️ Select at least one city");return;}
    mapConfig={name:"Worldwide Custom",tilesPerSide:curSize,preset:"worldwide",wwCities:selected,settings:{}};
  }else if(["india","uk","usa"].includes(curBoardType)){
    try{
      const r=await fetch(`/api/domestic-board?preset=${curBoardType}&S=${curSize}`);
      const d=await r.json();
      mapConfig={spaces:d.board,tilesPerSide:curSize,name:curBoardType.toUpperCase(),settings:{}};
    }catch{toast("❌ Error generating board");return;}
  }else{
    mapConfig={name:"Standard World",tilesPerSide:curSize,preset:"standard",settings:{}};
  }
  socket.emit("create_room",{playerName:nm,mapConfig,isPublic,avatar:myAvatar});
}

function joinRoom(){
  if(!socket?.connected){toast("⚠️ Not connected");return;}
  const code=qid("jr-code")?.value.trim().toUpperCase();
  if(!code){toast("Enter a room code");return;}
  socket.emit("join_room",{roomId:code,playerName:(qid("jr-name")?.value||"Player").trim(),avatar:myAvatar});
}
function quickMatch(){
  if(!socket?.connected){toast("⚠️ Not connected");return;}
  socket.emit("quick_match",{playerName:(qid("qm-name")?.value||"Player").trim(),avatar:myAvatar});
  toast("⚡ Finding a game…");
}
function copyLink(){navigator.clipboard.writeText(qid("share-url")?.textContent||"").then(()=>toast("🔗 Copied!"));}
function startGame(){socket.emit("start_game");}

async function browseRooms(){await refreshBrowse();om("m-browse");browseInterval=setInterval(refreshBrowse,5000);}
function closeBrowse(){cm("m-browse");clearInterval(browseInterval);browseInterval=null;}
async function refreshBrowse(){
  try{
    const rooms=await(await fetch("/api/rooms")).json();
    qid("browse-c").innerHTML=!rooms.length?`<p style="color:var(--muted)">No public games right now.</p>`:
      rooms.map(r=>`<div style="display:flex;align-items:center;gap:.6rem;padding:.5rem;border:1px solid var(--border);border-radius:8px;margin-bottom:.35rem">
        <span style="font-size:1rem">${r.hostToken}</span>
        <div style="flex:1"><div style="font-weight:700;font-size:.82rem">${r.hostName}'s game</div><div style="font-size:.7rem;color:var(--muted)">${r.boardName} · ${r.currency}</div></div>
        <div style="font-size:.76rem;color:var(--muted)">${r.playerCount}/${r.maxPlayers}</div>
        <button class="btn btn-sm btn-acc" onclick="joinSpecific('${r.id}')">Join</button>
      </div>`).join("")+`<div style="font-size:.68rem;color:var(--muted);text-align:right;margin-top:.3rem">Auto-refreshes every 5s</div>`;
  }catch{}
}
function joinSpecific(roomId){
  if(!socket?.connected){toast("⚠️ Not connected");return;}
  socket.emit("join_room",{roomId,playerName:(qid("qm-name")?.value||"Player").trim(),avatar:myAvatar});
  closeBrowse();
}

function rollDice(){animDice(()=>ga("roll"));}
function sendChat(){
  const inGame=qid("sc-game").classList.contains("active");
  const inp=inGame?qid("chat-inp"):qid("lc-inp");
  if(!inp?.value.trim())return;
  socket.emit("chat",{message:inp.value.trim()});inp.value="";
}
function appendChat(m){
  ["chat-log","lobby-chat-log"].forEach(id=>{
    const l=qid(id);if(!l)return;
    const el=document.createElement("div");el.className="cmsg new";
    el.innerHTML=`<b style="color:${m.color}">${m.name}:</b> ${m.text}`;
    l.appendChild(el);l.scrollTop=l.scrollHeight;
    setTimeout(()=>el.classList.remove("new"),300);
  });
}

let _toastTimer,_toastEl;
function toast(msg){
  if(!_toastEl){_toastEl=document.createElement("div");_toastEl.className="toast";document.body.appendChild(_toastEl);}
  _toastEl.textContent=msg;_toastEl.className="toast in";
  clearTimeout(_toastTimer);_toastTimer=setTimeout(()=>{_toastEl.className="toast out";},3200);
}

/* ─── MAP EDITOR ─────────────────────────────────────────── */
async function openEditor(){
  ss("editor");
  if(!editorCountries.length){
    try{editorCountries=await(await fetch("/api/countries")).json();}catch{}
  }
  editorRenderCountryPool();
  editorRenderBoard();
}

function editorFilterCountries(q){
  const query=q.toLowerCase().trim();
  document.querySelectorAll(".ed-country-row").forEach(row=>{
    const name=row.dataset.name?.toLowerCase()||"";
    const cities=row.dataset.cities?.toLowerCase()||"";
    row.style.display=(!query||name.includes(query)||cities.includes(query))?"":"none";
  });
}

function editorRenderCountryPool(){
  const el=qid("editor-country-pool");if(!el)return;
  el.innerHTML=editorCountries.map(c=>{
    const addedCities=new Set(editorBoard.filter(s=>s.countryCode===c.code).map(s=>s.name));
    const onBoard=addedCities.size>0;
    const citiesHtml=c.cities.map((city,i)=>{
      const price=c.base+i*10;
      const active=addedCities.has(city);
      return`<div class="ed-city-chip${active?" active":""}" onclick="editorToggleCity('${c.code}',${i})" title="${active?"Remove":"Add"} ${city}">
        <span class="ed-city-name">${city}</span>
        <span class="ed-city-price">${CUR()}${price}</span>
      </div>`;
    }).join("");
    return`<div class="ed-country-row${onBoard?" on-board":""}" data-name="${c.name}" data-cities="${c.cities.join(",")}" id="ecp-${c.code}">
      <div class="ed-country-hdr" onclick="editorToggleCountry('${c.code}')">
        <span class="ed-country-flag">${c.flag}</span>
        <div class="ed-country-info">
          <div class="ed-country-name">${c.name}</div>
          <div class="ed-country-meta">Tier ${c.tier} · ${CUR()}${c.base}–${CUR()}${c.base+(c.cities.length-1)*10} · ${addedCities.size}/${c.cities.length} cities</div>
        </div>
        <div style="display:flex;gap:3px;align-items:center">
          <button class="ed-add-btn" onclick="event.stopPropagation();editorAddAllCities('${c.code}')" title="Add all cities from ${c.name}">+All</button>
          ${onBoard?`<button class="ed-add-btn active" onclick="event.stopPropagation();editorRemoveCountry('${c.code}')" title="Remove all ${c.name} cities">✕</button>`:""}
        </div>
      </div>
      <div class="ed-country-cities" id="eccities-${c.code}" style="display:none">
        ${citiesHtml}
      </div>
    </div>`;
  }).join("");
}

function editorToggleCountry(code){
  const el=qid("eccities-"+code);if(!el)return;
  const open=el.style.display!=="none";
  el.style.display=open?"none":"flex";
  if(!open){el.style.animation="none";void el.offsetWidth;el.style.animation="";}
}

function editorToggleCity(code,cityIndex){
  const c=editorCountries.find(x=>x.code===code);if(!c)return;
  const city=c.cities[cityIndex];
  const price=c.base+cityIndex*10;
  const existing=editorBoard.findIndex(s=>s.countryCode===code&&s.name===city);
  if(existing>=0){
    editorBoard.splice(existing,1);
    toast(`🗑️ Removed ${city}`);
  }else{
    const slots=editorGetFreeSlots(1);
    if(!slots.length){toast("⚠️ No free slots on board");return;}
    const slot=slots[0];
    editorBoard.push({pos:slot,type:"property",group:`g${Math.floor(slot/(editorSize+1))%8}`,
      name:city,countryCode:c.code,countryFlag:c.flag,countryName:c.name,
      price,rents:[Math.floor(price*.04),Math.floor(price*.2),Math.floor(price*.6),Math.floor(price*1.4),Math.floor(price*1.7),Math.floor(price*2)],
      houseCost:Math.max(50,Math.floor(price*.5)),houses:0,owner:null,mortgaged:false});
    toast(`➕ Added ${city} — ${CUR()}${price}`);
  }
  editorRenderCountryPool();
  editorRenderBoard();
}

function editorAddAllCities(code){
  const c=editorCountries.find(x=>x.code===code);if(!c)return;
  const n=editorSettings.citiesPerCountry||3;
  const alreadyAdded=editorBoard.filter(s=>s.countryCode===code).map(s=>s.name);
  const toAdd=c.cities.filter(city=>!alreadyAdded.includes(city)).slice(0,n);
  if(!toAdd.length){toast(`All ${c.name} cities already on board`);return;}
  const slots=editorGetFreeSlots(toAdd.length);
  toAdd.forEach((city,i)=>{
    if(!slots[i])return;
    const cityIndex=c.cities.indexOf(city);
    const price=c.base+cityIndex*10;
    editorBoard=editorBoard.filter(s=>s.pos!==slots[i]);
    editorBoard.push({pos:slots[i],type:"property",group:`g${Math.floor(slots[i]/(editorSize+1))%8}`,
      name:city,countryCode:c.code,countryFlag:c.flag,countryName:c.name,
      price,rents:[Math.floor(price*.04),Math.floor(price*.2),Math.floor(price*.6),Math.floor(price*1.4),Math.floor(price*1.7),Math.floor(price*2)],
      houseCost:Math.max(50,Math.floor(price*.5)),houses:0,owner:null,mortgaged:false});
  });
  toast(`➕ Added ${toAdd.length} cities from ${c.name}`);
  editorRenderCountryPool();
  editorRenderBoard();
}

function editorRemoveCountry(code){
  const c=editorCountries.find(x=>x.code===code);if(!c)return;
  editorBoard=editorBoard.filter(s=>s.countryCode!==code);
  toast(`🗑️ Removed all ${c.name} cities`);
  editorRenderCountryPool();
  editorRenderBoard();
}

function editorAddCountry(code){ editorAddAllCities(code); }

function editorGetFreeSlots(n){
  const total=4*(editorSize+1);
  const C=editorSize+1;
  const fixed=new Set([0,C,2*C,3*C]);
  const used=new Set(editorBoard.map(s=>s.pos));
  const free=[];
  for(let i=1;i<total;i++){if(!fixed.has(i)&&!used.has(i))free.push(i);}
  return free.slice(0,n);
}

/* ─── EDITOR BOARD RENDER ────────────────────────────────── */
function editorRenderBoard(){
  const el=qid("editor-board");if(!el)return;
  const S=editorSize,C=S+1,total=4*C;
  el.style.cssText=`grid-template-columns:70px repeat(${S},40px) 70px;grid-template-rows:70px repeat(${S},40px) 70px`;
  el.innerHTML="";

  // Build full board with specials
  const board=buildEditorFullBoard(S);

  board.forEach((sp,pos)=>{
    const{col,row}=gridPos(pos,S);
    const side=sideOf(pos,S);
    const isCorner=[0,C,2*C,3*C].includes(pos);
    const div=document.createElement("div");
    div.className=`ed-tile ed-tile-${side}${isCorner?" ed-corner":""}${sp.type==="property"?" ed-prop":""}`;
    div.dataset.pos=pos;div.style.cssText=`grid-column:${col};grid-row:${row}`;
    div.onclick=()=>showEditorPropPopup(sp,pos);

    if(isCorner){
      const icons={0:"🚀 START",[C]:"⛓️ JAIL",[C*2]:"🅿️ FREE",[C*3]:"👮 JAIL"};
      div.innerHTML=`<div class="ed-corner-in">${icons[pos]||""}</div>`;
    }else{
      const gi=sp.group?parseInt(sp.group.slice(1)):-1;
      const strip=gi>=0?`<div class="ed-strip" style="background:${GRP_COLORS[gi]}"></div>`:"";
      const icon=({airport:"✈",railway:"🚂",gov_prot:"🏛️",chest:"📦",chance:"❓",income_tax:"💰",property_tax:"🏠",gains_tax:"📈",luxury_tax:"💸"})[sp.type]||sp.countryFlag||"🏙️";
      div.innerHTML=`${strip}<div class="ed-tile-inner"><span class="ed-flag">${icon}</span><span class="ed-nm">${sp.name}</span>${sp.price?`<span class="ed-price">${CUR()}${sp.price}</span>`:""}</div>`;
      // Drag & drop for properties
      if(sp.type==="property"){
        div.draggable=true;
        div.addEventListener("dragstart",e=>{editorDragSrc=pos;e.dataTransfer.effectAllowed="move";div.classList.add("dragging");});
        div.addEventListener("dragend",()=>div.classList.remove("dragging"));
        div.addEventListener("dragover",e=>{e.preventDefault();div.classList.add("drag-over");});
        div.addEventListener("dragleave",()=>div.classList.remove("drag-over"));
        div.addEventListener("drop",e=>{
          e.preventDefault();div.classList.remove("drag-over");
          if(editorDragSrc===pos||editorDragSrc==null)return;
          const srcSp=board.find(s=>s.pos===editorDragSrc);
          const dstSp=board.find(s=>s.pos===pos);
          if(srcSp&&dstSp&&srcSp.type==="property"&&dstSp.type==="property"){
            [srcSp.pos,dstSp.pos]=[dstSp.pos,srcSp.pos];
            const si=editorBoard.findIndex(s=>s.pos===editorDragSrc);
            const di=editorBoard.findIndex(s=>s.pos===pos);
            if(si>=0&&di>=0){[editorBoard[si].pos,editorBoard[di].pos]=[editorBoard[di].pos,editorBoard[si].pos];}
            editorRenderBoard();toast("↔ Swapped!");
          }
          editorDragSrc=null;
        });
      }
    }
    div.style.animationDelay=(pos*.01)+"s";
    el.appendChild(div);
  });
  updateEditorCounts();
}

function buildEditorFullBoard(S){
  const C=S+1,total=4*C;
  const board=[];
  const specials={};
  // Corners
  specials[0]={pos:0,type:"go",name:"START"};
  specials[C]={pos:C,type:"jail",name:"Jail"};
  specials[2*C]={pos:2*C,type:"free_parking",name:"Free"};
  specials[3*C]={pos:3*C,type:"go_to_jail",name:"Go Jail"};
  // Airports
  const ap={S:Math.round(S*.4),W:C+Math.round(S*.5),N:2*C+Math.round(S*.5),E:3*C+Math.round(S*.5)};
  specials[ap.S]={pos:ap.S,type:"airport",name:"✈ S Airport",price:200,owner:null,mortgaged:false};
  specials[ap.W]={pos:ap.W,type:"airport",name:"✈ W Airport",price:200,owner:null,mortgaged:false};
  specials[ap.N]={pos:ap.N,type:"airport",name:"✈ N Airport",price:200,owner:null,mortgaged:false};
  specials[ap.E]={pos:ap.E,type:"airport",name:"✈ E Airport",price:200,owner:null,mortgaged:false};
  // Railways
  const rw={S:Math.round(S*.7),W:C+Math.round(S*.7),N:2*C+Math.round(S*.3),E:3*C+Math.round(S*.3)};
  specials[rw.S]={pos:rw.S,type:"railway",name:"🚂 S Rail",price:150,owner:null,mortgaged:false};
  specials[rw.W]={pos:rw.W,type:"railway",name:"🚂 W Rail",price:150,owner:null,mortgaged:false};
  specials[rw.N]={pos:rw.N,type:"railway",name:"🚂 N Rail",price:150,owner:null,mortgaged:false};
  specials[rw.E]={pos:rw.E,type:"railway",name:"🚂 E Rail",price:150,owner:null,mortgaged:false};
  // Other specials
  specials[1]={pos:1,type:"income_tax",name:"💰 Tax"};
  specials[2*C-1]={pos:2*C-1,type:"luxury_tax",name:"💸 Luxury"};
  specials[C+1]={pos:C+1,type:"chest",name:"📦 Chest"};
  specials[2*C-Math.round(S*.35)]={pos:2*C-Math.round(S*.35),type:"gov_prot",name:"🏛️ Gov"};
  [Math.round(S*.2),C+Math.round(S*.8),2*C+Math.round(S*.7),3*C+Math.round(S*.8)].forEach((p,i)=>{
    if(!specials[p])specials[p]={pos:p,type:"chance",name:"❓ Surprise"};
  });

  for(let pos=0;pos<total;pos++){
    if(specials[pos]){board.push(specials[pos]);continue;}
    const edSp=editorBoard.find(s=>s.pos===pos);
    if(edSp){board.push(edSp);}
    else board.push({pos,type:"empty",name:"",group:`g${pos%8}`});
  }
  return board;
}

function updateEditorCounts(){
  const S=editorSize,total=4*(S+1);
  if(qid("ed-tile-count"))qid("ed-tile-count").textContent=`${total} Tiles`;
  if(qid("ed-size-val"))qid("ed-size-val").textContent=`${total} Tiles`;
  const countries=new Set(editorBoard.map(s=>s.countryCode).filter(Boolean));
  if(qid("ed-country-count"))qid("ed-country-count").textContent=`${countries.size} countries`;
  const hint=qid("editor-hint");
  if(hint)hint.style.display=editorBoard.length?"none":"flex";
}

function showEditorPropPopup(sp,pos){
  if(!sp||sp.type==="empty"||sp.type==="go"||sp.type==="jail"||sp.type==="free_parking"||sp.type==="go_to_jail")return;
  const gi=sp.group?parseInt(sp.group.slice(1)):-1;
  const gc=gi>=0?GRP_COLORS[gi]:"#888";
  const cur=editorSettings;
  qid("editor-popup-content").innerHTML=`
    <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem">
      ${gi>=0?`<div style="width:12px;height:12px;border-radius:50%;background:${gc}"></div>`:""}
      <h3 style="margin:0;font-size:.95rem">${sp.countryFlag||""}${sp.name}</h3>
    </div>
    ${(sp.type==="property"||sp.type==="airport"||sp.type==="railway")?`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin-bottom:.5rem">
      <div class="ed-popup-stat"><div class="ed-stat-label">Price</div><div class="ed-stat-val">${CUR()}${sp.price||0}</div></div>
      <div class="ed-popup-stat"><div class="ed-stat-label">Sell Price</div><div class="ed-stat-val">${CUR()}${Math.floor((sp.price||0)/2)}</div></div>
      ${sp.type==="property"?`
      <div class="ed-popup-stat"><div class="ed-stat-label">Base Rent</div><div class="ed-stat-val">${CUR()}${sp.rents?.[0]||0}</div></div>
      <div class="ed-popup-stat"><div class="ed-stat-label">1 House</div><div class="ed-stat-val">${CUR()}${sp.rents?.[1]||0}</div></div>
      <div class="ed-popup-stat"><div class="ed-stat-label">2 Houses</div><div class="ed-stat-val">${CUR()}${sp.rents?.[2]||0}</div></div>
      <div class="ed-popup-stat"><div class="ed-stat-label">3 Houses</div><div class="ed-stat-val">${CUR()}${sp.rents?.[3]||0}</div></div>
      <div class="ed-popup-stat"><div class="ed-stat-label">4 Houses</div><div class="ed-stat-val">${CUR()}${sp.rents?.[4]||0}</div></div>
      <div class="ed-popup-stat"><div class="ed-stat-label">Hotel</div><div class="ed-stat-val">${CUR()}${sp.rents?.[5]||0}</div></div>
      <div class="ed-popup-stat"><div class="ed-stat-label">Add House</div><div class="ed-stat-val">${CUR()}${sp.houseCost||0}</div></div>
      <div class="ed-popup-stat"><div class="ed-stat-label">Remove House</div><div class="ed-stat-val">${CUR()}${Math.floor((sp.houseCost||0)/2)}</div></div>
      `:""}
    </div>
    ${sp.countryName?`<div style="font-size:.68rem;color:var(--muted)">🌍 ${sp.countryName}</div>`:""}
    <button class="btn btn-red btn-sm" style="width:100%;margin-top:.4rem" onclick="editorRemoveTile(${pos})">🗑️ Remove from board</button>
    `:`<div style="color:var(--muted);font-size:.8rem">${sp.type} tile — cannot be modified</div>`}`;
  const popup=qid("editor-prop-popup");
  popup.classList.remove("hidden");
  popup.style.animation="none";void popup.offsetWidth;popup.style.animation="popupSlideIn .25s ease";
}
function closeEditorPopup(){qid("editor-prop-popup").classList.add("hidden");}
function editorRemoveTile(pos){
  editorBoard=editorBoard.filter(s=>s.pos!==pos);
  editorRenderBoard();editorRenderCountryPool();closeEditorPopup();
}

/* ─── EDITOR SETTINGS ────────────────────────────────────── */
function editorSetSize(v){
  editorSize=v;editorRenderBoard();
  if(qid("ed-size"))qid("ed-size").value=v;
}
function editorSetAuction(mode,btn){
  editorSettings.auctionMode=mode;
  document.querySelectorAll(".ed-pill").forEach(b=>b.classList.remove("on"));
  btn.classList.add("on");
  const hints={none:"Buy or Pass (No Auction)",half:"Auction on Pass only",full:"Always auction unclaimed properties"};
  if(qid("auc-hint-text"))qid("auc-hint-text").textContent=hints[mode];
}
function editorSetCitiesPerCountry(n){editorSettings.citiesPerCountry=n;}
function editorSetHousing(v){
  editorSettings.housingRule=v;
  const hints={monopoly:"Must own all properties in a colour group to build.",free:"Build anywhere anytime.",none:"No house building allowed."};
  if(qid("ed-housing-hint"))qid("ed-housing-hint").textContent=hints[v];
}
function editorSetToggle(k,v){editorSettings[k]=v;}
function editorSetPricing(v){
  editorSettings.pricingModel=v;
  const hints={standard:"Balanced economy similar to classic board games.",double:"All prices doubled.",halfprice:"Half price throughout.",tiered:"Higher-tier cities cost more."};
  if(qid("ed-pricing-hint"))qid("ed-pricing-hint").textContent=hints[v];
}
function editorSetHMult(v){editorSettings.housingMultiplier=v;if(qid("ed-hmult-val"))qid("ed-hmult-val").textContent=v+"×";}
function editorSetSetting(k,v){editorSettings[k]=v;}
function editorResetBoard(){editorBoard=[];editorRenderBoard();editorRenderCountryPool();toast("Board reset");}
function editorSaveJSON(){
  const data=JSON.stringify({board:editorBoard,size:editorSize,settings:editorSettings},null,2);
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data],{type:"application/json"}));
  a.download="monopoly-board.json";a.click();
}
function editorLoadJSONFile(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{try{const d=JSON.parse(e.target.result);editorBoard=d.board||[];editorSize=d.size||9;if(d.settings)Object.assign(editorSettings,d.settings);editorRenderBoard();editorRenderCountryPool();toast("✅ Board loaded!");}catch{toast("❌ Invalid JSON");}};
  reader.readAsText(file);
}

async function editorLaunchGame(isPrivate){
  if(!socket?.connected){toast("⚠️ Not connected");socket?.connect();await sleep(1500);}
  if(!socket?.connected){toast("❌ Cannot connect");return;}
  editorSettings.privateRoom=isPrivate;
  const nm=(qid("ed-name")?.value||qid("cr-name")?.value||"Player").trim();
  const spaces=buildEditorFullBoard(editorSize);
  editorCustomSpaces=spaces;
  curBoardType="editor";curSize=editorSize;
  const mapConfig={spaces,tilesPerSide:editorSize,name:"Custom Map",settings:{...editorSettings,auctionMode:editorSettings.auctionMode,mortgageEnabled:editorSettings.mortgageEnabled,housingRule:editorSettings.housingRule}};
  socket.emit("create_room",{playerName:nm,mapConfig,isPublic:!isPrivate,avatar:myAvatar});
}

/* ─── INIT ───────────────────────────────────────────────── */
window.addEventListener("DOMContentLoaded",()=>{
  document.body.setAttribute("data-theme",currentTheme);
  // Sync theme button
  document.querySelectorAll(".tbtn").forEach((b,i)=>{
    const themes=["dark","cyberpunk","gold","ocean","neon","forest","midnight","sakura"];
    b.style.background=Object.values(THEMES)[i]?.bg||"#111";
    b.style.border=`2px solid ${Object.values(THEMES)[i]?.accent||"#fff"}44`;
    if(themes[i]===currentTheme)b.classList.add("active");
  });
  initSocket();
  generateSeed();updateBoardPreview();
  // Restore name
  const saved=localStorage.getItem("mono_name");
  if(saved)["cr-name","jr-name","qm-name","bs-name","ed-name"].forEach(id=>{const el=qid(id);if(el)el.value=saved;});
  ["cr-name","jr-name","qm-name","bs-name","ed-name"].forEach(id=>{qid(id)?.addEventListener("input",e=>localStorage.setItem("mono_name",e.target.value));});
  // Auto-fill room code from URL
  const m=location.pathname.match(/\/room\/([A-Z0-9]{6})/i);
  if(m){if(qid("jr-code"))qid("jr-code").value=m[1].toUpperCase();toast("Room code pre-filled: "+m[1]);}
});
window.addEventListener("resize",()=>{if(gs)renderGame(false);if(qid("sc-editor").classList.contains("active"))editorRenderBoard();});

/* ═══════════════════════════════════════════════════════
   RECONNECTION / VOTEKICK / SPECTATE — appended section
   ═══════════════════════════════════════════════════════ */

/* ── RECONNECT HANDLING ─────────────────────────────── */
let _isSpectator = false;
let _mySpectatorId = null;
let _reconnectOverlay = null;

// Handle server events for connectivity
function initConnectivityHandlers() {
  socket.on("player_disconnected", ({ playerId, name, graceSecs, deadline }) => {
    if (playerId === myId) {
      showReconnectOverlay(graceSecs);
    } else {
      toast(`📴 ${name} disconnected — ${graceSecs}s to reconnect`);
    }
    renderSidePanels();
  });

  socket.on("player_reconnected", ({ playerId, name }) => {
    if (playerId === myId) removeReconnectOverlay();
    toast(`✅ ${name} reconnected!`);
    renderSidePanels();
  });

  socket.on("player_timeout", ({ playerId, name }) => {
    toast(`⏱️ ${name} timed out — now spectating`);
    if (playerId === myId) becomeSpectator("timeout");
    renderSidePanels();
  });

  socket.on("reconnect_ok", ({ roomId, player }) => {
    myId = player?.id || myId;
    myRoomId = roomId;
    removeReconnectOverlay();
    _isSpectator = false;
  });

  socket.on("spectate_start", ({ gameState, roomId, spectatorId }) => {
    if (gameState) gs = gameState;
    myRoomId = roomId;
    _mySpectatorId = spectatorId;
    _isSpectator = true;
    if (qid("sc-game").classList.contains("active")) {
      renderGame(true);
      showSpectatorBanner();
    } else {
      ss("game");
      renderGame(true);
      showSpectatorBanner();
    }
  });

  socket.on("spectator_joined", ({ name, count }) => {
    toast(`👁️ ${name} is watching (${count} spectators)`);
  });

  socket.on("you_were_kicked", ({ roomId, gameState }) => {
    if (gameState) gs = gameState;
    myRoomId = roomId;
    becomeSpectator("votekick");
  });

  socket.on("player_kicked", ({ playerId, name }) => {
    toast(`🚫 ${name} was vote-kicked`);
    renderSidePanels();
    cm("m-votekick");
  });

  socket.on("vote_update", ({ targetId, targetName, votes, needed }) => {
    toast(`🗳️ Vote kick: ${targetName} — ${votes}/${needed} votes`);
    renderVoteProgress(targetId, targetName, votes, needed);
  });
}

function showReconnectOverlay(graceSecs) {
  removeReconnectOverlay();
  const div = document.createElement("div");
  div.id = "reconnect-overlay";
  div.className = "disconnect-overlay";
  div.innerHTML = `
    <div class="disconnect-card">
      <div style="font-size:2.5rem;margin-bottom:.5rem">📴</div>
      <h2>Connection Lost</h2>
      <p style="color:var(--muted);font-size:.85rem;margin-bottom:.6rem">You have ${graceSecs} seconds to reconnect before becoming a spectator.</p>
      <div class="reconnect-timer" id="rc-timer">${graceSecs}</div>
      <div style="font-size:.78rem;color:var(--muted)">Reconnecting automatically…</div>
      <div class="vote-progress" style="margin-top:.8rem"><div class="vote-progress-bar" id="rc-bar" style="width:100%"></div></div>
    </div>`;
  document.body.appendChild(div);
  _reconnectOverlay = div;
  let secs = graceSecs;
  const iv = setInterval(() => {
    secs--;
    const el = qid("rc-timer");
    const bar = qid("rc-bar");
    if (el) el.textContent = secs;
    if (bar) bar.style.width = ((secs / graceSecs) * 100) + "%";
    if (secs <= 0 || !_reconnectOverlay) clearInterval(iv);
  }, 1000);
}

function removeReconnectOverlay() {
  if (_reconnectOverlay) { _reconnectOverlay.remove(); _reconnectOverlay = null; }
  const old = qid("reconnect-overlay");
  if (old) old.remove();
}

function becomeSpectator(reason) {
  _isSpectator = true;
  removeReconnectOverlay();
  if (reason === "votekick") {
    toast("🚫 You were vote-kicked — watching as spectator");
  } else if (reason === "timeout") {
    toast("⏱️ Reconnect timed out — watching as spectator");
  }
  showSpectatorBanner();
  renderSidePanels();
}

function showSpectatorBanner() {
  let banner = qid("spectator-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "spectator-banner";
    banner.className = "spectator-banner";
    const center = qid("gl-center") || qid("game-area");
    if (center) center.prepend(banner);
  }
  banner.innerHTML = `👁️ <b>Spectator Mode</b> — You are watching the game. <button class="btn btn-sm btn-out" style="margin-left:.5rem" onclick="qid('spectator-banner').style.display='none'">Hide</button>`;
}

/* ── VOTEKICK MODAL ─────────────────────────────────── */
function openVoteKickModal() {
  if (!gs) return;
  const others = gs.players.filter(p =>
    p.id !== myId && !p.bankrupted && !p.isSpectator
  );
  const votes = {}; // TODO: track from server updates

  const html = `
    <h2>🗳️ Vote Kick a Player</h2>
    <p style="color:var(--muted);font-size:.78rem;margin-bottom:.7rem">Majority vote required. Use for AFK or misconduct only.</p>
    ${others.length === 0 ? `<p style="color:var(--muted)">No other active players.</p>` :
      others.map(p => `
      <div class="vk-player-row" onclick="castVoteKick('${p.id}','${p.name}')">
        <div style="width:10px;height:10px;border-radius:50%;background:${p.color}"></div>
        <span style="flex:1;font-size:.82rem;font-weight:600">${p.name}
          ${p.disconnected ? `<span class="reconnect-badge">disconnected</span>` : ""}
        </span>
        <div id="vkprog-${p.id}" style="font-size:.7rem;color:var(--muted)"></div>
        <button class="btn btn-red btn-sm">Vote Kick</button>
      </div>`).join("")
    }
    <button class="btn btn-out" style="width:100%;margin-top:.7rem" onclick="cm('m-votekick')">Cancel</button>`;

  qid("votekick-c").innerHTML = html;
  om("m-votekick");
}

function castVoteKick(targetId, targetName) {
  if (!confirm(`Vote to kick ${targetName}? This requires majority agreement.`)) return;
  socket.emit("vote_kick", { targetId });
  toast(`🗳️ Vote cast against ${targetName}`);
}

function renderVoteProgress(targetId, targetName, votes, needed) {
  const el = qid("vkprog-" + targetId);
  if (el) el.textContent = `${votes}/${needed} votes`;
  // Update a general status area if modal is open
  const modal = qid("m-votekick");
  if (modal && !modal.classList.contains("ovh")) {
    const bar = document.createElement("div");
    bar.innerHTML = `<div style="margin-top:.35rem;background:var(--bg);border-radius:4px;height:5px;overflow:hidden"><div style="width:${Math.min(100,(votes/needed)*100)}%;height:100%;background:var(--red);border-radius:4px;transition:width .4s"></div></div>`;
    const row = qid("m-votekick").querySelector(`[onclick*="${targetId}"]`);
    if (row) row.appendChild(bar);
  }
}

/* ── UPDATE PLAYERS PANEL to show disconnect/spectate ── */
// Override renderPlayersPanel to include votekick button and status
const _origRenderPlayersPanel = renderPlayersPanel;
function renderPlayersPanel() {
  const el = qid("panel-players"); if (!el || !gs) return;
  el.innerHTML = gs.players.map((p, i) => {
    const loan = p.loans?.reduce((s, l) => s + l.remaining, 0) || 0;
    const isCur = i === gs.currentPlayerIdx;
    const avImg = drawAvatarSVG(p.avatar || {}, 30);
    let statusBadge = "";
    if (p.bankrupted)   statusBadge = " 💀";
    else if (p.isSpectator) statusBadge = " 👁️";
    else if (p.disconnected) {
      const secs = p.reconnectDeadline ? Math.max(0, Math.ceil(p.reconnectDeadline - Date.now()/1000)) : "?";
      statusBadge = ` <span class="reconnect-badge">${secs}s</span>`;
    }
    else if (p.badDebt)   statusBadge = " ⛓️";
    else if (isCur)       statusBadge = " 🎲";

    const canVotekick = !p.bankrupted && !p.isSpectator && p.id !== myId && !_isSpectator;
    const rowClass = `pp-row${isCur?" pp-cur":""}${p.bankrupted?" pp-bankrupt":""}${p.disconnected?" pp-disconnected":""}${p.isSpectator?" pp-spectator":""}`;

    return `<div class="${rowClass}" id="pp-row-${p.id}">
      <img src="${avImg}" width="30" height="30" style="border-radius:50%;border:2px solid ${p.color};flex-shrink:0">
      <div class="pp-info">
        <div class="pp-name" style="color:${p.color}">${p.name}${statusBadge}</div>
        <div class="pp-cash">${CUR()}${p.money.toLocaleString()}</div>
        <div class="pp-sub">${gs.board.filter(s => s.owner === p.id).length} prop${loan > 0 ? ` · 💸${CUR()}${loan}` : ""}</div>
      </div>
      ${canVotekick ? `<button class="btn btn-sm btn-red" style="font-size:.6rem;padding:.15rem .35rem;opacity:.6" onclick="quickVoteKick('${p.id}','${p.name}')" title="Vote kick">🚫</button>` : ""}
    </div>`;
  }).join("");
}

function quickVoteKick(targetId, targetName) {
  if (!confirm(`Vote to kick ${targetName}?`)) return;
  socket.emit("vote_kick", { targetId });
  toast(`🗳️ Vote cast against ${targetName}`);
}

/* ── SPECTATE OPTION AFTER BANKRUPTCY ──────────────── */
// Override showWin to also show spectate option if not winner
const _origShowWin = showWin;
function showWin(wid) {
  const w = gs?.players.find(p => p.id === wid); if (!w) return;
  const avImg = drawAvatarSVG(w.avatar || {}, 80);
  const isMe = wid === myId;
  qid("win-c").innerHTML = `
    <div style="text-align:center;padding:2rem">
      <div style="font-size:3rem;margin-bottom:.5rem">${isMe ? "🏆" : "🎉"}</div>
      <img src="${avImg}" width="80" height="80" style="border-radius:50%;border:4px solid ${w.color};margin-bottom:.5rem;animation:bounce .5s ease infinite alternate">
      <h2 style="color:${w.color};font-size:1.8rem">${w.name} Wins!</h2>
      <p style="color:var(--muted)">Final: ${CUR()}${w.money}</p>
      ${!isMe ? `<p style="color:var(--muted);font-size:.82rem;margin-top:.3rem">You finished as spectator</p>` : ""}
      <div style="display:flex;gap:.5rem;justify-content:center;margin-top:1rem">
        <button class="btn btn-acc" onclick="location.reload()">🎲 Play Again</button>
      </div>
    </div>`;
  om("m-win"); launchConfetti();
}

/* ── AUGMENT initSocket with connectivity handlers ── */
function initSocket() {
  _initSocketCore();
  initConnectivityHandlers();
  // Auto-reconnect on socket reconnect
  socket.on("connect", () => {
    if (myId && myRoomId && gs) {
      socket.emit("reconnect_player", { roomId: myRoomId, playerId: myId });
    }
  });
}

/* ── ADD VOTEKICK BUTTON TO ACTION BAR ──────────────── */
function renderActions() {
  _renderActionsCore();
  // Append votekick button to ablist if in action phase and not spectator
  if (_isSpectator) {
    const al = qid("ablist");
    if (al) al.innerHTML = `<div class="spectator-banner" style="width:100%;text-align:center;padding:.4rem;font-size:.75rem">👁️ Spectator — watching only</div>`;
    const tb = qid("turn-box");
    if (tb) tb.innerHTML = `<div>Spectator Mode</div>`;
    return;
  }
  if (!gs || gs.phase !== "action") return;
  const al = qid("ablist");
  if (!al) return;
  const vkBtn = document.createElement("button");
  vkBtn.className = "btn btn-out btn-sm";
  vkBtn.style.cssText = "border-color:var(--red)44;color:var(--red);font-size:.7rem";
  vkBtn.textContent = "🗳️ Vote Kick";
  vkBtn.onclick = openVoteKickModal;
  al.appendChild(vkBtn);
}
