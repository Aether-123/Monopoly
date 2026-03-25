/* ═══════════════════════════════════════════════════════════
   MONOPOLY ONLINE v3.0 — game.js  (complete rewrite)
   ═══════════════════════════════════════════════════════════ */
"use strict";

/* ─── GLOBALS ─────────────────────────────────────────── */
let socket, myId, myRoomId, roomHostId, lobbyData, gs=null;
let curBoardType="standard", curSize=9, curRMode="balanced", curSeed="";
let wwSelectedCities={};
let _tokenMoving=false, _prevMoney={};
let browseInterval=null;
let currentTheme=localStorage.getItem("mono_theme")||"dark";
let soundEnabled=localStorage.getItem("mono_sound")!=="false"; // Default enabled
let lastClickSoundTime=0; // Prevent rapid-fire purchase sounds
let incomingTrade=null, _tradeTarget=null, tFromSel=[], tToSel=[];
let avatarReturnScreen="land";
let _auctionTimer=null, _auctionSecsLeft=10;
let _diceRolling=false;
let _awaitingServerRoll=false;
let _isLobbyHost=false;
let _boardPreviewCache={};
let _loadingCountriesPromise=null;
let _lastBoardRenderKey="";
let _lastBoardSizeKey="";
let _lastPanelsRenderKey="";
let _resizeRenderTimer=null;
let _stateUpdateInFlight=false;
let _queuedGameState=null;
let _deferredSidePanelRender=false;
const ENABLE_BOARD_SELECT_UI=true;
const ENABLE_MAP_EDITOR_UI=false;

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
let editorCountries=[]; // loaded from /mapi/countries
let editorSettings={
  auctionMode:"none",citiesPerCountry:3,housingRule:"monopoly",
  evenBuild:true,mortgageEnabled:true,pricingModel:"standard",housingMultiplier:2,
  startingCash:1500,goSalary:200,treasurePot:true,incomeTaxRate:10,
  airportFee:100,railwayFee:75,noRentInJail:true,
  enableVeryBadSurprises:true,enableVeryGoodSurprises:true,
  enableSurprises:true,enableTreasures:true,
  maxPlayers:6,privateRoom:false
};
let editorDragSrc=null;
let editorPoolDragData=null; // {countryCode, cityIndex} when dragging from pool
let editorCustomSpaces=null; // custom board from editor

/* ─── HELPERS ──────────────────────────────────────────── */
const CUR=()=>gs?.settings?.currency||"$";
const DF=["⚀","⚁","⚂","⚃","⚄","⚅"];
const GRP_COLORS=["#ef4444","#f97316","#22c55e","#3b82f6","#a855f7","#ec4899","#14b8a6","#6366f1"];
const DICE_FACE_TRANSFORMS={
  1:"rotateX(720deg) rotateY(720deg)",
  2:"rotateX(810deg) rotateY(720deg)",
  3:"rotateX(720deg) rotateY(630deg)",
  4:"rotateX(720deg) rotateY(810deg)",
  5:"rotateX(630deg) rotateY(720deg)",
  6:"rotateX(720deg) rotateY(900deg)",
};
const DICE_PIP_PATTERN={
  1:[0,0,0,0,1,0,0,0,0],
  2:[0,0,1,0,0,0,1,0,0],
  3:[0,0,1,0,1,0,1,0,0],
  4:[1,0,1,0,0,0,1,0,1],
  5:[1,0,1,0,1,0,1,0,1],
  6:[1,0,1,1,0,1,1,0,1],
};
const DICE_FACE_VALUE_BY_CLASS={front:1,back:6,right:3,left:4,top:5,bottom:2};
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function qs(s){return document.querySelector(s);}
function qid(id){return document.getElementById(id);}
function om(id){qid(id)?.classList.remove("ovh");}
function cm(id){qid(id)?.classList.add("ovh");}
function ga(action,data={}){socket?.emit("game_action",{action,data});}

/* ─── SOUND EFFECTS ─────────────────────────────────────── */
let audioCtx=null;
function getAudioContext(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();return audioCtx;}
function playTingSound(frequency=900){
  if(!soundEnabled)return;
  try{
    const ctx=getAudioContext();
    const osc=ctx.createOscillator();
    const gain=ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value=frequency;
    osc.type="sine";
    gain.gain.setValueAtTime(.3,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.01,ctx.currentTime+.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime+.15);
  }catch(e){}
}
function playClickSound(){
  if(!soundEnabled)return;
  try{
    const ctx=getAudioContext();
    const osc=ctx.createOscillator();
    const gain=ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(1200,ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400,ctx.currentTime+.1);
    osc.type="square";
    gain.gain.setValueAtTime(.2,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.01,ctx.currentTime+.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime+.1);
  }catch(e){}
}

function sanitize(s,n=200){return String(s||"").replace(/[<>&"']/g,"").trim().slice(0,n);}
function escHtml(s){
  return String(s??"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}
function calcTieredRents(price){
  const p=Math.max(0,Number(price)||0);
  const bands=[
    {max:80,lo:6,hi:10},
    {max:140,lo:10,hi:20},
    {max:200,lo:20,hi:35},
    {max:260,lo:35,hi:55},
    {max:330,lo:55,hi:80},
    {max:Infinity,lo:80,hi:120},
  ];
  let minP=0,base=10;
  for(const b of bands){
    if(p<=b.max){
      const span=Number.isFinite(b.max)?Math.max(1,b.max-minP):Math.max(1,p-minP);
      const t=Number.isFinite(b.max)?Math.max(0,Math.min(1,(p-minP)/span)):1;
      base=Math.round(b.lo+(b.hi-b.lo)*t);
      break;
    }
    minP=b.max+1;
  }
  return [base,Math.round(base*4),Math.round(base*10),Math.round(base*22),Math.round(base*36),Math.round(base*50)];
}
function getCountryCode(sp){
  const direct=String(sp?.countryCode||"").toLowerCase();
  if(direct)return direct;
  const byCity=getCountryForCity(sp?.name||sp?.cityName||"");
  return byCity?.iso||"";
}
function getCountryName(sp){
  const full=sanitize(sp?.countryName||"",40);
  if(full && full.length>2)return full;
  const code=getCountryCode(sp);
  const match=Object.entries(COUNTRY_DATA).find(([,v])=>v.iso===code);
  return match?match[0].replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()):"Country";
}
function hasPropertyFullSet(gs,sp){
  if(!gs||!sp||sp.type!=="property"||!sp.owner)return false;
  const cCode=getCountryCode(sp);
  if(cCode){
    const set=gs.board.filter(s=>s?.type==="property"&&getCountryCode(s)===cCode);
    return set.length>1&&set.every(s=>s.owner===sp.owner);
  }
  if(!sp.group)return false;
  const grp=gs.board.filter(s=>s?.type==="property"&&s.group===sp.group);
  return grp.length>1&&grp.every(s=>s.owner===sp.owner);
}
function cityLabel(sp){
  return sanitize(sp?.name||"",64);
}
function setDieFace(el, face){
  if(!el)return;
  const f=Math.max(1,Math.min(6,parseInt(face||1)));
  el.setAttribute("data-face",String(f));
  const tx=DICE_FACE_TRANSFORMS[f]||DICE_FACE_TRANSFORMS[1];
  el.style.transform=tx;
}
function _buildFacePips(faceEl,val){
  const pattern=DICE_PIP_PATTERN[val]||DICE_PIP_PATTERN[1];
  faceEl.innerHTML=pattern.map(on=>`<div>${on?'<div class="pip"></div>':""}</div>`).join("");
}
function initDiceFaces(){
  ["die1","die2"].forEach(id=>{
    const die=qid(id);
    if(!die)return;
    Object.entries(DICE_FACE_VALUE_BY_CLASS).forEach(([cls,val])=>{
      const face=die.querySelector(`.face.${cls}`);
      if(face)_buildFacePips(face,val);
    });
    setDieFace(die,1);
  });
}
function getLobbyBoardSpaces(){
  return lobbyData?.mapConfig?.spaces||[];
}

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

function toggleSound(){
  soundEnabled=!soundEnabled;
  localStorage.setItem("mono_sound",soundEnabled);
  return soundEnabled;
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
  socket.on("room_created",({roomId,player})=>{myId=player.id;myRoomId=roomId;roomHostId=player.id;try{localStorage.setItem("mono_game_session",JSON.stringify({roomId,playerId:player.id}));}catch(e){}const codeEl=qid("room-code-display-lobby");if(codeEl)codeEl.textContent=roomId;ss("lobby");});
  socket.on("room_joined",({roomId,player})=>{myId=player.id;myRoomId=roomId;try{localStorage.setItem("mono_game_session",JSON.stringify({roomId,playerId:player.id}));}catch(e){}const codeEl=qid("room-code-display-lobby");if(codeEl)codeEl.textContent=roomId;ss("lobby");});
  socket.on("join_error",({message})=>toast("❌ "+message));
  socket.on("start_error",({message})=>toast("❌ "+(message||"Cannot start game yet.")));
  socket.on("lobby_update",d=>{lobbyData=d;roomHostId=d.hostId;renderLobby();});
  socket.on("game_started",({gameState})=>{gs=gameState;ss("game");renderGame(true);cm("m-win");});
  socket.on("state_update",({gameState})=>enqueueStateUpdate(gameState));
  socket.on("game_over",({winnerId})=>{try{localStorage.removeItem("mono_game_session");}catch(e){}showWin(winnerId);});
  socket.on("board_selected",({mapConfig})=>{toast("🗺️ New board selected. Waiting for host to restart game...");});
  socket.on("trade_incoming",d=>showIncomingTrade(d));
  socket.on("trade_accepted",()=>{toast("✅ Trade accepted!");cm("m-t-in");cm("m-neg");renderSidePanels();});
  socket.on("trade_declined",({tradeId})=>{toast("❌ Trade declined.");cm("m-t-in");cm("m-neg");});
  socket.on("trade_negotiate",d=>showNegotiateModal(d));
  socket.on("trade_chip_in",d=>showChipInNotification(d));
  socket.on("trade_chip_response",d=>handleChipResponse(d));
  socket.on("chat_msg",m=>appendChat(m));
  socket.on("player_left",({playerId})=>{const p=gs?.players.find(x=>x.id===playerId);if(p){p.disconnected=true;renderGame(false);}});
  socket.on("auction_ended",()=>{stopAuctionTimer();});
  socket.on("board_change_requested",(d)=>{toast(`📝 ${d.byName} requested ${d.kind} change`);});
  socket.on("board_changed",()=>{toast("🧩 Board updated in lobby");});
}

/* ─── SCREENS ──────────────────────────────────────────── */
function ss(n){
  if(n==="boards" && !ENABLE_BOARD_SELECT_UI){
    toast("⚠️ Board selection is disabled for now.");
    n="land";
  }
  if(n==="editor" && !ENABLE_MAP_EDITOR_UI){
    toast("⚠️ Map editor is disabled for now.");
    n="land";
  }
  document.querySelectorAll(".screen").forEach(s=>{
    s.classList.remove("active");
    s.style.pointerEvents="none";
  });
  const target=qid("sc-"+n);
  if(target){
    target.classList.add("active");
    target.style.pointerEvents="";
    target.scrollTop=0;
  }
  window.scrollTo(0,0);
}

/* ─── STATE UPDATE ─────────────────────────────────────── */
async function onStateUpdate(newGs){
  const oldGs=gs;
  gs=newGs;
  let boardChanged=!oldGs;
  if(oldGs){
    if((oldGs.tilesPerSide||9)!==(gs.tilesPerSide||9)||oldGs.hazardPos!==gs.hazardPos||oldGs.taxReturnPos!==gs.taxReturnPos||oldGs.randomTaxPos!==gs.randomTaxPos||oldGs.board.length!==gs.board.length){
      boardChanged=true;
    }
  }
  const rollChanged=!!(oldGs&&gs?.lastRoll&&(
    !oldGs.lastRoll||
    oldGs.lastRoll[0]!==gs.lastRoll[0]||
    oldGs.lastRoll[1]!==gs.lastRoll[1]
  ));
  const shouldAnimateRoll=!!(gs?.lastRoll&&(rollChanged||_awaitingServerRoll));

  if(shouldAnimateRoll){
    await animateDice(gs.lastRoll[0],gs.lastRoll[1]);
    _awaitingServerRoll=false;
    _diceRolling=false;
  }

  if(oldGs){
    for(const p of gs.players){
      const old=oldGs.players.find(q=>q.id===p.id);
      if(!old)continue;
      const delta=p.money-old.money;
      if(Math.abs(delta)>0)animateMoneyDelta(p.id,delta);
    }
    if(!boardChanged){
      for(let i=0;i<gs.board.length;i++){
        const sp=gs.board[i];
        const oldSp=oldGs.board[i];
        if(!oldSp||sp?.owner!==oldSp.owner||sp?.houses!==oldSp.houses||sp?.mortgaged!==oldSp.mortgaged||sp?.type!==oldSp.type||sp?.name!==oldSp.name||sp?.price!==oldSp.price){
          boardChanged=true;
          break;
        }
      }
    }
    // Detect property purchases (owner changed)
    const now=Date.now();
    for(let i=0;i<gs.board.length;i++){
      const sp=gs.board[i];
      const oldSp=oldGs.board[i];
      if(oldSp&&!oldSp.owner&&sp.owner&&now-lastClickSoundTime>200){
        // Property was just purchased (owner changed from none to someone)
        playClickSound();
        lastClickSoundTime=now;
        break; // Only play once per state update to avoid overwhelming audio
      }
    }
  }
  if(oldGs&&!_tokenMoving){
    for(const p of gs.players){
      const old=oldGs.players.find(q=>q.id===p.id);
      if(!old||old.position===p.position||p.bankrupted)continue;
      await animateTokenStep(p.id,old.position,p.position,gs.board.length);
    }
  }
  renderGame(false,boardChanged);
  handlePendingEvent();
  // Auction state
  if(gs.phase==="auction"&&gs.auction?.active){
    renderAuctionModal();
  }else{
    stopAuctionTimer();cm("m-auction");
  }
}

function enqueueStateUpdate(gameState){
  _queuedGameState=gameState;
  flushStateUpdates();
}

async function flushStateUpdates(){
  if(_stateUpdateInFlight)return;
  _stateUpdateInFlight=true;
  try{
    while(_queuedGameState){
      const next=_queuedGameState;
      _queuedGameState=null;
      await onStateUpdate(next);
    }
  }finally{
    _stateUpdateInFlight=false;
    if(_deferredSidePanelRender&&gs){
      _deferredSidePanelRender=false;
      renderSidePanels();
      renderBoardActionLog();
      _lastPanelsRenderKey=buildPanelsRenderKey();
    }
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
  // Play sound effect based on money direction
  if(delta>0)playTingSound(900); // Money in - higher pitch
  else playTingSound(600); // Money out - lower pitch
  setTimeout(()=>el.remove(),1000);
}

/* ─── ANIMATION: Token Step ─────────────────────────────── */
async function animateTokenStep(playerId,from,to,boardLen){
  _tokenMoving=true;
  const S=gs?.tilesPerSide||9;
  const {cPx,tPx}=getBoardDims(S);
  const stepDelay=85;
  let cur=from;
  const steps=to>=from?to-from:boardLen-from+to;
  if(steps>12){
    const tok=qid("tok-"+playerId);
    if(tok){
      tok.style.transition="left .18s linear, top .18s linear";
      const {x,y}=txy(to,S,cPx,tPx);
      const off=getTokenOffsets(playerId);
      tok.style.left=(x+off.ox-18)+"px";
      tok.style.top=(y+off.oy-18)+"px";
      tok.classList.remove("landing");void tok.offsetWidth;tok.classList.add("landing");
      flashTile(to);
    }
    _tokenMoving=false;
    return;
  }
  for(let i=0;i<steps;i++){
    cur=(cur+1)%boardLen;
    const tok=qid("tok-"+playerId);if(!tok)break;
    tok.style.transition=`left ${stepDelay}ms linear, top ${stepDelay}ms linear`;
    const {x,y}=txy(cur,S,cPx,tPx);
    const off=getTokenOffsets(playerId);
    tok.style.left=(x+off.ox-18)+"px";tok.style.top=(y+off.oy-18)+"px";
    if(i===steps-1){tok.classList.remove("landing");void tok.offsetWidth;tok.classList.add("landing");flashTile(cur);}
    await sleep(i===steps-1?0:stepDelay);
  }
  _tokenMoving=false;
}

function flashTile(pos){
  const tile=qid("game-board")?.querySelector(`[data-pos="${pos}"]`);
  if(!tile)return;
  tile.classList.remove("land-flash");
  void tile.offsetWidth;
  tile.classList.add("land-flash");
  setTimeout(()=>tile.classList.remove("land-flash"),600);
}

function buildBoardRenderKey(){
  if(!gs||!Array.isArray(gs.board))return"";
  const staticBits=[gs.tilesPerSide||9,gs.hazardPos??-1,gs.taxReturnPos??-1,gs.randomTaxPos??-1];
  const dynamicBits=gs.board.map(sp=>`${sp?.type||""}|${sp?.owner||""}|${sp?.houses||0}|${sp?.mortgaged?1:0}`).join(";");
  return `${staticBits.join("|")}|${dynamicBits}`;
}

function buildPanelsRenderKey(){
  if(!gs||!Array.isArray(gs.players))return"";
  const playersKey=gs.players.map(p=>[
    p.id,
    p.money||0,
    p.position||0,
    p.inJail?1:0,
    p.bankrupted?1:0,
    p.disconnected?1:0,
    p.isSpectator?1:0,
    (p.properties||[]).length,
    p.bankDeposit||0,
    p.bankDepositInterest||0,
    (p.loans||[]).length,
    p.hasInsurance?1:0,
  ].join(":" )).join(";");
  const me=gs.players.find(p=>p.id===myId);
  const tradesLen=(gs.tradeRequests||[]).length;
  const logTail=(gs.log||[]).slice(-1)[0]||"";
  return [
    gs.phase||"",
    gs.currentPlayerIdx??-1,
    gs.turnHasRolled?1:0,
    gs.treasurePot||0,
    tradesLen,
    (gs.log||[]).length,
    logTail,
    me?.pendingHazardLoss||0,
    me?.pendingHazardRebuildCost||0,
    playersKey,
  ].join("|");
}

/* ─── BOARD GEOMETRY ────────────────────────────────────── */
function getBoardDims(S){
  const areaEl=qid("game-area");
  const usable=areaEl?Math.min(areaEl.offsetWidth-24,areaEl.offsetHeight-24):900;
  const cellPx=Math.max(54,Math.floor(usable/(S+2)));
  const cPx=cellPx;
  const tPx=cellPx;
  return{cPx,tPx};
}
function gridPos(pos,S){
  const C=S+1;
  if(pos===0)return{col:1,row:1};
  if(pos<C)return{col:pos+1,row:1};
  if(pos===C)return{col:S+2,row:1};
  if(pos<2*C)return{col:S+2,row:pos-C+1};
  if(pos===2*C)return{col:S+2,row:S+2};
  if(pos<3*C)return{col:S+2-(pos-2*C),row:S+2};
  if(pos===3*C)return{col:1,row:S+2};
  return{col:1,row:S+2-(pos-3*C)};
}
function sideOf(pos,S){
  const C=S+1,corners=[0,C,2*C,3*C];
  if(corners.includes(pos))return"corner";
  if(pos>0&&pos<C)return"top";
  if(pos>C&&pos<2*C)return"right";
  if(pos>2*C&&pos<3*C)return"bottom";
  return"left";
}
function txy(pos,S,cPx,tPx){
  const{col,row}=gridPos(pos,S);
  const cx=col===1?cPx/2:col===S+2?cPx+S*tPx+cPx/2:cPx+(col-2)*tPx+tPx/2;
  const cy=row===1?cPx/2:row===S+2?cPx+S*tPx+cPx/2:cPx+(row-2)*tPx+tPx/2;
  return{x:Math.round(cx),y:Math.round(cy)};
}
function getTokenOffsets(playerId){
  const idx=gs?.players.findIndex(p=>p.id===playerId)||0;
  const offsetMultiplier=4;
  const row=Math.floor(idx/2);
  const col=idx%2;
  return{ox:(col*offsetMultiplier*2)-offsetMultiplier,oy:(row*offsetMultiplier*2)-offsetMultiplier};
}

/* ─── RENDER GAME ───────────────────────────────────────── */
function renderGame(init,forceBoard=false){
  if(!gs)return;
  
  // Clean slate for new game
  if(init){
    const board=qid("game-board");
    if(board)board.innerHTML="";
  }
  
  // Render board only when required
  const S=gs.tilesPerSide||9;
  const dims=getBoardDims(S);
  const sizeKey=`${S}:${dims.cPx}:${dims.tPx}`;
  const boardKey=buildBoardRenderKey();
  const mustRenderBoard=!!(init||forceBoard||boardKey!==_lastBoardRenderKey||sizeKey!==_lastBoardSizeKey);
  if(mustRenderBoard){
    renderBoard();
    _lastBoardRenderKey=boardKey;
    _lastBoardSizeKey=sizeKey;
  }
  renderTokensInstant(init);
  updateDiceOver();
  renderActions();
  const panelsKey=buildPanelsRenderKey();
  if(init||panelsKey!==_lastPanelsRenderKey){
    const animationBusy=!!(_tokenMoving||_diceRolling);
    if(!init&&animationBusy){
      _deferredSidePanelRender=true;
    }else{
      renderSidePanels();
      renderBoardActionLog();
      _lastPanelsRenderKey=panelsKey;
    }
  }
  const gameCode=qid("game-room-code-display");
  if(gameCode)gameCode.textContent=(myRoomId||lobbyData?.roomId||"—");
}
function renderSidePanels(){renderPlayersPanel();renderPropsPanel();renderStatusPanel();renderTradePanel();renderBankPanel();}

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

  const ICONS={
    airport:"✈️",railway:"🚂",utility:"🏢",gov_prot:"🏛️",chest:"📦",
    chance:"❓",income_tax:"💰",property_tax:"🏠",tax_return:"$",
    gains_tax:"📈",luxury_tax:"🏙️",empty:"·"
  };
  const CORNERS={
    0:{ico:"🚀",lbl:"START",bg:"linear-gradient(135deg,var(--corner),color-mix(in srgb,var(--green) 20%,var(--corner)))"},
    [C]:{ico:"⛓️",lbl:"JAIL",bg:"linear-gradient(135deg,var(--corner),color-mix(in srgb,var(--orange) 18%,var(--corner)))"},
    [2*C]:{ico:"🏖️",lbl:"VACATION",bg:"linear-gradient(135deg,var(--corner),color-mix(in srgb,var(--blue) 16%,var(--corner)))"},
    [3*C]:{ico:"👮",lbl:"GO JAIL",bg:"linear-gradient(135deg,var(--corner),color-mix(in srgb,var(--red) 20%,var(--corner)))"}
  };

  for(let pos=0;pos<total;pos++){
    const sp=gs.board[pos];
    const{col,row}=gridPos(pos,S);
    const side=sideOf(pos,S);
    const isCorner=CORNERS[pos]!=null;
    const isHaz=pos===gs.hazardPos,isTR=(pos===gs.taxReturnPos||sp?.type==="tax_return"),isRT=pos===gs.randomTaxPos;
    const hasFullSet=hasPropertyFullSet(gs,sp);
    const setBonusOn=gs?.settings?.doubleRentOnSet!==false;

    const div=document.createElement("div");
    div.dataset.pos=pos;
    div.dataset.index=pos;
    if(sp?.type==="property"&&sp?.name){
      const c=getCountryForCity(sp.name);
      const iso=sp?.iso||sp?.countryCode||c?.iso||"";
      if(iso)div.dataset.iso=iso;
    }
    div.style.cssText=`grid-column:${col};grid-row:${row}`;
    div.onclick=()=>showPropModal(pos);

    let cls=`sp sp-${side}`;
    if(sp?.mortgaged)cls+=" spmort";
    if(isHaz)cls+=" sphaz";
    if(isTR)cls+=" sptaxret";
    if(isRT)cls+=" sprandomtax";
    if(hasFullSet&&setBonusOn)cls+=" sp-fullset";
    div.className=cls;

    if(isCorner){
      const c=CORNERS[pos];
      div.className+=" spco";
      div.style.background=c.bg;
      div.innerHTML=`<div class="ci"><span class="ci-ico">${c.ico}</span><span class="ci-lbl">${c.lbl}</span></div>`;
    }else{
      const isGovTile=sp?.type==="gov_prot";
      let ico=isGovTile
        ?(ICONS[sp?.type]||"🏙️")
        :isHaz?"☠️":isTR?"$":isRT?"🎲":(ICONS[sp?.type]||"🏙️");

      // Owner: colored border glow + ownership dot — only when owned
      let ownerDot="";
      if(sp?.owner){
        const o=gs.players.find(p=>p.id===sp.owner);
        if(o){
          ownerDot=`<div class="own-dot" style="background:${o.color}"></div>`;
          div.style.boxShadow=`inset 0 0 0 2px ${o.color}, 0 0 8px ${o.color}55`;
        }
      }

      // Houses
      const h=sp?.houses||0;
      const housesHTML=h>0?`<div class="sp-hs">${h===5?'<div class="htl"></div>':`<div class="hd">${h>1?`×${h}`:""}</div>`}</div>`:"";

      // 2x badge
      const badge2x=hasFullSet&&setBonusOn&&h===0?'<div class="set-2x-badge">2×</div>':"";

      const sideIsVertical=(side==="left"||side==="right");
      const showTileIcon=sp?.type!=="property";
      const iconHTML=showTileIcon?`<div class="sp-ico${sideIsVertical?" sp-ico-under":""}">${ico}</div>`:"";
      const priceHTML=sp?.price?`<div class="sp-pr">${CUR()}${sp.price}</div>`:"";
      const countryHTML="";
      const mapDotHTML="";
      const bodyHTML=sideIsVertical
        ?`<div class="sp-body"><div class="sp-nm">${sp?.name||""}</div>${priceHTML}${iconHTML}</div>`
        :`<div class="sp-body">${iconHTML}<div class="sp-nm">${sp?.name||""}</div>${priceHTML}</div>`;

      div.innerHTML=`${bodyHTML}${mapDotHTML}${countryHTML}${housesHTML}${ownerDot}${badge2x}`;
    }
    div.classList.add("tile");
    if(sp?.type==="property") div.classList.add("tile-property");
    board.appendChild(div);
  }

  const boardTiles=gs.board.map((sp,idx)=>({
    element:board.querySelector(`[data-pos="${idx}"]`),
    cityName:sp?.type==="property"?sp?.name:"",
    iso:sp?.type==="property" ? (sp?.iso || sp?.countryCode || getCountryForCity(sp?.name)?.iso || null) : null,
  }));
  applyPositionClasses(boardTiles);
}

/* ─── TOKEN RENDER ──────────────────────────────────────── */
function renderTokensInstant(init){
  const tokenContainer=qid("board-wrap");
  if(!tokenContainer||!gs)return;
  if(init){
    document.querySelectorAll(".ptok").forEach(t=>t.remove());
  }
  
  const S=gs.tilesPerSide||9;
  const{cPx,tPx}=getBoardDims(S);
  const TOKEN_SIZE=26;
  const TOKEN_HALF=TOKEN_SIZE/2;
  const activeTokenIds=new Set(gs.players.filter(p=>!p.bankrupted).map(p=>`tok-${p.id}`));
  document.querySelectorAll(".ptok").forEach(el=>{if(!activeTokenIds.has(el.id))el.remove();});
  
  gs.players.forEach((p,playerIdx)=>{
    if(p.bankrupted)return;
    
    // Get tile center position
    const{x:tileX,y:tileY}=txy(p.position,S,cPx,tPx);
    
    // Calculate cluster offset for multiple players on same tile
    const col=playerIdx%2;
    const row=Math.floor(playerIdx/2);
    const offsetX=(col===0?-3:3);
    const offsetY=(row===0?-3:3);
    
    // Final token position (centered on tile with small offset)
    const posX=tileX+offsetX-TOKEN_HALF;
    const posY=tileY+offsetY-TOKEN_HALF;
    
    let tok=qid("tok-"+p.id);
    const needsCreate=!tok;
    if(!tok){
      tok=document.createElement("canvas");
      tok.width=tok.height=TOKEN_SIZE;
      tok.className="ptok";
      tok.id="tok-"+p.id;
      tokenContainer.appendChild(tok);
    }
    tok.classList.toggle("cur-player",playerIdx===gs.currentPlayerIdx);
    tok.title=`${p.name}: ${CUR()}${p.money}`;
    tok.style.cssText=`position:absolute;left:${posX}px;top:${posY}px;border-radius:50%;cursor:default;z-index:${playerIdx+10};`;
    if(needsCreate){
      drawAvatar(tok,p.avatar||{},TOKEN_SIZE);
      const ctx=tok.getContext("2d");
      ctx.strokeStyle=p.color;
      ctx.lineWidth=2;
      ctx.beginPath();
      ctx.arc(TOKEN_HALF,TOKEN_HALF,TOKEN_HALF-1,0,Math.PI*2);
      ctx.stroke();
      if(init){tok.style.animation="tokenDrop .4s ease";}
    }
  });
}

/* ─── PLAYERS PANEL ─────────────────────────────────────── */
/* ─── PLAYERS PANEL (rendered by override below) ───────────────────────────────── */

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
      <div class="my-prop-nm">${cityLabel(sp)}</div>
      <div class="my-prop-hs">${sp.mortgaged?"🔒":h===5?"🏨":h>0?"🏠".repeat(h):""}</div>
      ${hasSet?`<div class="set-dot" title="Full set — 2× rent">★</div>`:""}
    </div>`;
  }).join("");
}

function renderStatusPanel(){
  const el=qid("panel-status");if(!el||!gs)return;
  const playersHTML=gs.players.map(p=>{
    const gained=Math.floor(p.stats?.gained||0);
    const lost=Math.floor(p.stats?.lost||0);
    const cards=(p.stats?.cards||[]).slice(0,3);
    const cardsHtml=cards.length
      ?cards.map(c=>`<div>• ${sanitize(c,80)}</div>`).join("")
      :"<div>• No cards drawn yet</div>";
    return `<div class="status-row">
      <div class="status-head">
        <span class="status-name" style="color:${p.color}">${sanitize(p.name,24)}</span>
        <span class="status-money"><span class="gain">+${CUR()}${gained.toLocaleString()}</span> · <span class="loss">-${CUR()}${lost.toLocaleString()}</span></span>
      </div>
      <div class="status-cards"><b>Cards</b>${cardsHtml}</div>
    </div>`;
  }).join("");
  const feed=(gs.log||[]).slice(-20).reverse().map(line=>`<div class="status-feed-item">${sanitize(line,180)}</div>`).join("")||"<div class='status-feed-item'>No activity yet</div>";
  el.innerHTML=`${playersHTML}<div class="status-feed-title">Latest Actions</div><div class="status-feed">${feed}</div>`;
}

function renderBoardActionLog(){
  const el=qid("board-action-log");if(!el||!gs)return;
  const feed=(gs.log||[]).slice(-6).reverse().map((line,idx)=>`<div class="board-log-item${idx===0?" latest":""}">${sanitize(line,180)}</div>`).join("")||"<div class='board-log-item latest'>No activity yet</div>";
  el.innerHTML=`<div class="board-log-feed">${feed}</div>`;
}

function applyTouchUIClass(){
  const isTouchLike=window.matchMedia?.("(pointer: coarse)")?.matches||("ontouchstart" in window)||(navigator.maxTouchPoints>0);
  document.body.classList.toggle("touch-ui",!!isTouchLike);
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

function isSmallTradeUI(){
  return window.matchMedia?.("(max-width: 900px)")?.matches||window.matchMedia?.("(max-width: 1024px) and (pointer: coarse)")?.matches;
}

function selectTradeTarget(pid){
  _tradeTarget=pid;tFromSel=[];tToSel=[];
  renderTradePanel();
  renderTradeExpanded();
  if(isSmallTradeUI()){
    renderTradeComposerModal();
    om("m-trade-compose");
  }
}

function renderTradeComposerModal(){
  const el=qid("trade-compose-c");if(!el||!gs||!_tradeTarget)return;
  const me=gs.players.find(p=>p.id===myId);
  const to=gs.players.find(p=>p.id===_tradeTarget);
  if(!me||!to)return;
  const myP=gs.board.filter(s=>["property","airport","railway","utility"].includes(s.type)&&s.owner===me.id);
  const thP=gs.board.filter(s=>["property","airport","railway","utility"].includes(s.type)&&s.owner===to.id);
  el.innerHTML=`<div style="font-size:.85rem;font-weight:700;margin-bottom:.5rem;color:var(--accent)">Trade with ${to.name}</div>
    <div style="display:grid;grid-template-columns:1fr;gap:.55rem;margin-bottom:.55rem">
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:.45rem">
        <div style="font-size:.72rem;color:var(--muted);margin-bottom:.25rem">You give</div>
        ${myP.map(s=>`<div class="trade-prop-row ${tFromSel.includes(s.pos)?"sel":""}" onclick="togTP('from',${s.pos})">${cityLabel(s)}</div>`).join("")||`<span style="font-size:.72rem;color:var(--muted)">—</span>`}
        <input type="number" id="tf-m-mobile" value="0" min="0" max="${me.money}" step="50" class="inp" style="width:100%;font-size:.76rem;margin-top:.35rem">
      </div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:.45rem">
        <div style="font-size:.72rem;color:var(--muted);margin-bottom:.25rem">${to.name} gives</div>
        ${thP.map(s=>`<div class="trade-prop-row ${tToSel.includes(s.pos)?"sel":""}" onclick="togTP('to',${s.pos})">${cityLabel(s)}</div>`).join("")||`<span style="font-size:.72rem;color:var(--muted)">—</span>`}
        <input type="number" id="tt-m-mobile" value="0" min="0" max="${to.money}" step="50" class="inp" style="width:100%;font-size:.76rem;margin-top:.35rem">
      </div>
    </div>
    <button class="btn btn-acc" style="width:100%" onclick="sendTrade()">📨 Send Offer</button>`;
}

function renderTradeExpanded(){
  const el=qid("trade-expanded");if(!el||!gs)return;
  if(!_tradeTarget){el.style.display="none";return;}
  el.style.display="block";
  const me=gs.players.find(p=>p.id===myId);
  const to=gs.players.find(p=>p.id===_tradeTarget);
  if(!me||!to)return;
  const myP=gs.board.filter(s=>["property","airport","railway","utility"].includes(s.type)&&s.owner===me.id);
  const thP=gs.board.filter(s=>["property","airport","railway","utility"].includes(s.type)&&s.owner===to.id);
  el.innerHTML=`<div style="font-size:.73rem;font-weight:700;margin-bottom:.4rem;color:var(--accent)">Trade with ${to.name}</div>
    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:.3rem;margin-bottom:.4rem">
      <div>
        <div style="font-size:.67rem;color:var(--muted);margin-bottom:.2rem">You give</div>
        ${myP.map(s=>`<div class="trade-prop-row ${tFromSel.includes(s.pos)?"sel":""}" onclick="togTP('from',${s.pos})">${cityLabel(s)}</div>`).join("")||`<span style="font-size:.66rem;color:var(--muted)">—</span>`}
        <input type="number" id="tf-m" value="0" min="0" max="${me.money}" step="50" class="inp" style="width:100%;font-size:.7rem;margin-top:.3rem;padding:.18rem .3rem">
      </div>
      <div style="align-self:center;font-size:.9rem">⇄</div>
      <div>
        <div style="font-size:.67rem;color:var(--muted);margin-bottom:.2rem">${to.name} gives</div>
        ${thP.map(s=>`<div class="trade-prop-row ${tToSel.includes(s.pos)?"sel":""}" onclick="togTP('to',${s.pos})">${cityLabel(s)}</div>`).join("")||`<span style="font-size:.66rem;color:var(--muted)">—</span>`}
        <input type="number" id="tt-m" value="0" min="0" max="${to.money}" step="50" class="inp" style="width:100%;font-size:.7rem;margin-top:.3rem;padding:.18rem .3rem">
      </div>
    </div>
    <button class="btn btn-acc btn-sm" style="width:100%" onclick="sendTrade()">📨 Send Offer</button>`;
}

function togTP(side,pos){
  const arr=side==="from"?tFromSel:tToSel;
  const i=arr.indexOf(pos);
  if(i>=0)arr.splice(i,1);else arr.push(pos);
  renderTradeExpanded();
  if(!qid("m-trade-compose")?.classList.contains("ovh"))renderTradeComposerModal();
}

function sendTrade(){
  const useMobile=!qid("m-trade-compose")?.classList.contains("ovh");
  const fm=useMobile?(+qid("tf-m-mobile")?.value||0):(+qid("tf-m")?.value||0);
  const tm=useMobile?(+qid("tt-m-mobile")?.value||0):(+qid("tt-m")?.value||0);
  if(!_tradeTarget){toast("Select a player first");return;}
  socket.emit("trade_offer",{toPlayerId:_tradeTarget,offer:{fromProps:[...tFromSel],toProps:[...tToSel],fromMoney:fm,toMoney:tm}});
  toast("📨 Trade offer sent!");
  tFromSel=[];tToSel=[];
  renderTradeExpanded();
  if(!qid("m-trade-compose")?.classList.contains("ovh"))cm("m-trade-compose");
}

function showIncomingTrade({tradeId,fromId,toId,fromName,toName,offer}){
  const from=gs?.players.find(p=>p.id===fromId);
  const to=gs?.players.find(p=>p.id===toId);
  const isDirectRecipient=toId===myId;
  const isInvolved=fromId===myId||toId===myId;
  const dp=pos=>gs?.board[pos]?`${cityLabel(gs.board[pos])}`:`#${pos}`;
  
  if(isDirectRecipient) incomingTrade={tradeId,fromId,offer};
  
  let actionButtons=``;
  if(isDirectRecipient){
    actionButtons=`
      <button class="btn btn-acc" onclick="respondTrade(true)">✅ Accept</button>
      <button class="btn btn-red" onclick="respondTrade(false)">❌ Decline</button>
      <button class="btn btn-out" onclick="openNegotiate()">🔄 Counter</button>`;
  } else if(!isInvolved){
    actionButtons=`<button class="btn btn-out" onclick="showSelectChipTargets('${tradeId}','${fromId}','${toId}')">💡 Chip In</button>`;
  }
  
  qid("tin-c").innerHTML=`
    <h2>💱 Trade: <span style="color:${from?.color||"var(--accent)"}">${fromName||from?.name||"?"}</span> ↔️ <span style="color:${to?.color||"var(--orange)"}">${toName||to?.name||"?"}</span></h2>
    <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin:.7rem 0">
      <div style="flex:1;min-width:120px;background:var(--bg);border-radius:8px;padding:.6rem">
        <div style="font-size:.68rem;color:var(--muted);margin-bottom:.2rem">${fromName||from?.name||"?"} gives</div>
        <div style="font-size:.78rem">${offer.fromProps?.map(dp).join(", ")||"nothing"}</div>
        ${offer.fromMoney?`<div style="color:var(--green);font-size:.85rem;font-weight:700">+${CUR()}${offer.fromMoney}</div>`:""}
      </div>
      <div style="flex:1;min-width:120px;background:var(--bg);border-radius:8px;padding:.6rem">
        <div style="font-size:.68rem;color:var(--muted);margin-bottom:.2rem">${toName||to?.name||"?"} gives</div>
        <div style="font-size:.78rem">${offer.toProps?.map(dp).join(", ")||"nothing"}</div>
        ${offer.toMoney?`<div style="color:var(--red);font-size:.85rem;font-weight:700">-${CUR()}${offer.toMoney}</div>`:""}
      </div>
    </div>
    <div style="display:flex;gap:.4rem;flex-wrap:wrap">
      ${actionButtons}
    </div>`;
  om("m-t-in");
}

function declineTrade(){respondTrade(false);}
function respondTrade(ok){if(!incomingTrade)return;socket.emit("trade_respond",{...incomingTrade,accepted:ok});cm("m-t-in");incomingTrade=null;}

function showSelectChipTargets(tradeId,fromId,toId){
  const from=gs?.players.find(p=>p.id===fromId);
  const to=gs?.players.find(p=>p.id===toId);
  qid("chip-target-c").innerHTML=`
    <p style="color:var(--muted);font-size:.75rem">Who do you want to negotiate with?</p>
    <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin:.6rem 0">
      <label style="display:flex;align-items:center;gap:.3rem;cursor:pointer">
        <input type="checkbox" id="chip-tgt-from" checked> <span style="color:${from?.color||'var(--accent)'};">${from?.name}</span>
      </label>
      <label style="display:flex;align-items:center;gap:.3rem;cursor:pointer">
        <input type="checkbox" id="chip-tgt-to" checked> <span style="color:${to?.color||'var(--orange)'};">${to?.name}</span>
      </label>
    </div>
    <div style="display:flex;gap:.4rem">
      <button class="btn btn-acc" onclick="proceedWithChipIn('${tradeId}','${fromId}','${toId}')">Continue</button>
      <button class="btn btn-out" onclick="cm('m-chip-target')">Cancel</button>
    </div>`;
  om("m-chip-target");
}

function proceedWithChipIn(tradeId,fromId,toId){
  const targets=[];
  if(qid("chip-tgt-from")?.checked) targets.push(fromId);
  if(qid("chip-tgt-to")?.checked) targets.push(toId);
  if(targets.length===0){toast("Select at least 1 player");return;}
  cm("m-chip-target");
  showChipInOffer(tradeId,fromId,toId,targets);
}

function showChipInOffer(tradeId,fromId,toId,targetIds){
  if(!gs)return;
  const from=gs.players.find(p=>p.id===fromId);
  const to=gs.players.find(p=>p.id===toId);
  const me=gs.players.find(p=>p.id===myId);
  if(!me||!targetIds||targetIds.length===0)return;
  
  const myP=gs.board.filter(s=>["property","airport","railway","utility"].includes(s.type)&&s.owner===myId);
  const fromP=gs.board.filter(s=>["property","airport","railway","utility"].includes(s.type)&&s.owner===fromId);
  const toP=gs.board.filter(s=>["property","airport","railway","utility"].includes(s.type)&&s.owner===toId);
  
  const myPropRows=myP.map(s=>'<div class="trade-prop-row" id="chip-f-'+s.pos+'" onclick="this.classList.toggle(\'sel\')">'+cityLabel(s)+'</div>').join("");
  const fromPRows=fromP.map(s=>'<div class="trade-prop-row" id="chip-t1-'+s.pos+'" onclick="this.classList.toggle(\'sel\')">'+cityLabel(s)+'</div>').join("");
  const toPRows=toP.map(s=>'<div class="trade-prop-row" id="chip-t2-'+s.pos+'" onclick="this.classList.toggle(\'sel\')">'+cityLabel(s)+'</div>').join("");
  
  const targetStr=targetIds.map(id=>gs.players.find(p=>p.id===id)?.name||"?").join(" & ");
  let fromSection="", toSection="";
  
  if(targetIds.includes(fromId)){
    fromSection=`<div>
      <div style="font-size:.72rem;font-weight:700;color:var(--orange);margin-bottom:.2rem">Want from ${from?.name}</div>
      <div class="trade-prop-row" onclick="document.querySelectorAll('[id^=chip-t1-]').forEach(e=>e.classList.remove('sel'))" style="background:var(--bg);border:1px solid var(--border);font-weight:700">⊘ None</div>
      ${fromPRows}
      <input type="number" id="chip-t1m" value="0" min="0" max="${from?.money||0}" step="50" class="inp" placeholder="$ from ${from?.name}" style="width:100%;margin-top:.3rem;font-size:.72rem">
    </div>`;
  }
  if(targetIds.includes(toId)){
    toSection=`<div>
      <div style="font-size:.72rem;font-weight:700;color:var(--orange);margin-bottom:.2rem">Want from ${to?.name}</div>
      <div class="trade-prop-row" onclick="document.querySelectorAll('[id^=chip-t2-]').forEach(e=>e.classList.remove('sel'))" style="background:var(--bg);border:1px solid var(--border);font-weight:700">⊘ None</div>
      ${toPRows}
      <input type="number" id="chip-t2m" value="0" min="0" max="${to?.money||0}" step="50" class="inp" placeholder="$ from ${to?.name}" style="width:100%;margin-top:.3rem;font-size:.72rem">
    </div>`;
  }
  
  qid("chip-c").innerHTML=`
    <p style="color:var(--muted);font-size:.75rem">Counter-offer to ${targetStr}</p>
    <div style="display:grid;grid-template-columns:${targetIds.length===2?'1fr 1fr 1fr':'1fr 1fr'};gap:.6rem;margin-bottom:.5rem">
      <div>
        <div style="font-size:.72rem;font-weight:700;color:var(--accent);margin-bottom:.2rem">I'll give</div>
        <div class="trade-prop-row" onclick="document.querySelectorAll('[id^=chip-f-]').forEach(e=>e.classList.remove('sel'))" style="background:var(--bg);border:1px solid var(--border);font-weight:700">⊘ None</div>
        ${myPropRows}
        <input type="number" id="chip-fm" value="0" min="0" max="${me?.money||0}" step="50" class="inp" placeholder="$ I send" style="width:100%;margin-top:.3rem;font-size:.72rem">
      </div>
      ${fromSection}${toSection}
    </div>
    <input class="inp" id="chip-msg" placeholder="Message (optional)" maxlength="200" style="width:100%;margin-bottom:.4rem">
    <div style="display:flex;gap:.4rem">
      <button class="btn btn-acc" onclick="sendChipIn('${tradeId}',${JSON.stringify(targetIds)},'${fromId}','${toId}')">💡 Send Offer</button>
      <button class="btn btn-out" onclick="cm('m-chip')">Cancel</button>
    </div>`;
  cm("m-t-in");
  om("m-chip");
}

function sendChipIn(tradeId,targetIds,fromId,toId){
  if(!targetIds||targetIds.length===0){toast("Select target players");return;}
  const fp=[...document.querySelectorAll("[id^='chip-f-'].sel")].map(e=>parseInt(e.id.split("-")[2]));
  const t1p=[...document.querySelectorAll("[id^='chip-t1-'].sel")].map(e=>parseInt(e.id.split("-")[2]));
  const t2p=[...document.querySelectorAll("[id^='chip-t2-'].sel")].map(e=>parseInt(e.id.split("-")[2]));
  
  const wants={};
  if(fromId&&targetIds.includes(fromId)){
    const m1=+qid("chip-t1m")?.value||0;
    if(t1p.length>0||m1>0) wants[fromId]={props:t1p,money:m1};
  }
  if(toId&&targetIds.includes(toId)){
    const m2=+qid("chip-t2m")?.value||0;
    if(t2p.length>0||m2>0) wants[toId]={props:t2p,money:m2};
  }
  
  socket.emit("trade_chip_in",{
    tradeId,targetIds,
    myProps:fp,myMoney:+qid("chip-fm")?.value||0,
    wants:wants,
    message:qid("chip-msg")?.value||""
  });
  cm("m-chip");
  const targetNames=targetIds.map(id=>gs?.players.find(p=>p.id===id)?.name||"?").join(" & ");
  toast(`💡 Offer sent to ${targetNames}!`);
}

function openNegotiate(){
  if(!incomingTrade||!gs)return;
  const from=gs.players.find(p=>p.id===incomingTrade.fromId);
  const me=gs.players.find(p=>p.id===myId);
  const myP=gs.board.filter(s=>["property","airport","railway","utility"].includes(s.type)&&s.owner===myId);
  const thP=gs.board.filter(s=>["property","airport","railway","utility"].includes(s.type)&&s.owner===incomingTrade.fromId);
  qid("neg-c").innerHTML=`
    <p style="color:var(--muted);font-size:.78rem">Send a counter-offer to ${from?.name}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:.5rem">
      <div>
        <div style="font-size:.72rem;font-weight:700;color:var(--accent);margin-bottom:.2rem">I'll give</div>
        <div class="trade-prop-row" onclick="document.querySelectorAll('[id^=neg-f-]').forEach(e=>e.classList.remove('sel'))" style="background:var(--bg);border:1px solid var(--border);font-weight:700">⊘ None</div>
        ${myP.map(s=>`<div class="trade-prop-row" id="neg-f-${s.pos}" onclick="this.classList.toggle('sel')">${cityLabel(s)}</div>`).join("")}
        <input type="number" id="neg-fm" value="0" min="0" max="${me?.money||0}" step="50" class="inp" placeholder="$ you send" style="width:100%;margin-top:.3rem;font-size:.72rem">
      </div>
      <div>
        <div style="font-size:.72rem;font-weight:700;color:var(--orange);margin-bottom:.2rem">I want</div>
        <div class="trade-prop-row" onclick="document.querySelectorAll('[id^=neg-t-]').forEach(e=>e.classList.remove('sel'))" style="background:var(--bg);border:1px solid var(--border);font-weight:700">⊘ None</div>
        ${thP.map(s=>`<div class="trade-prop-row" id="neg-t-${s.pos}" onclick="this.classList.toggle('sel')">${cityLabel(s)}</div>`).join("")}
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
  const dp=pos=>gs?.board[pos]?`${cityLabel(gs.board[pos])}`:`#${pos}`;
  qid("tin-c").innerHTML=`
    <h2>🔄 Counter from <span style="color:${from?.color||"var(--accent)"}">${from?.name||"?"}</span></h2>
    ${message?`<div style="background:var(--bg);border-radius:6px;padding:.4rem;font-size:.76rem;margin-bottom:.5rem;font-style:italic">"${message}"</div>`:""}
    <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin:.6rem 0">
      <div style="flex:1;background:var(--bg);border-radius:8px;padding:.5rem">
        <div style="font-size:.66rem;color:var(--muted)">They give</div>
        <div style="font-size:.76rem">${offer.fromProps?.map(dp).join(", ")||"nothing"}</div>
        ${offer.fromMoney?`<div style="color:var(--green)">+${CUR()}${offer.fromMoney}</div>`:""}
      </div>
      <div style="flex:1;background:var(--bg);border-radius:8px;padding:.5rem">
        <div style="font-size:.66rem;color:var(--muted)">You give</div>
        <div style="font-size:.76rem">${offer.toProps?.map(dp).join(", ")||"nothing"}</div>
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

function showChipInNotification({tradeId,chipFromId,chipFromName,targetId,targetName,myProps,myMoney,wants,message}){
  if(targetId!==myId)return; // Only show chip-in to the targeted player(s)
  const chipper=gs?.players.find(p=>p.id===chipFromId);
  const dp=pos=>gs?.board[pos]?`${cityLabel(gs.board[pos])}`:`#${pos}`;
  
  let wantsSections="";
  Object.entries(wants).forEach(([wantFromId,offer])=>{
    const wantFrom=gs?.players.find(p=>p.id===wantFromId);
    wantsSections+=`<div style="flex:1;background:var(--bg);border-radius:8px;padding:.5rem">
      <div style="font-size:.66rem;color:var(--muted)">Want from ${wantFrom?.name||"?"}</div>
      <div style="font-size:.76rem">${offer.props?.map(dp).join(", ")||"nothing"}</div>
      ${offer.money?`<div style="color:var(--green)">+${CUR()}${offer.money}</div>`:""}
    </div>`;
  });
  
  qid("tin-c").innerHTML=`
    <h2>💡 Chip-in from <span style="color:${chipper?.color||"var(--teal)"}">${chipFromName||chipper?.name||"?"}</span></h2>
    ${message?`<div style="background:var(--bg);border-radius:6px;padding:.4rem;font-size:.76rem;margin-bottom:.5rem;font-style:italic">"${message}"</div>`:""}
    <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin:.6rem 0">
      <div style="flex:1;background:var(--bg);border-radius:8px;padding:.5rem">
        <div style="font-size:.66rem;color:var(--muted)">${chipFromName||chipper?.name||"?"} gives</div>
        <div style="font-size:.76rem">${myProps?.map(dp).join(", ")||"nothing"}</div>
        ${myMoney?`<div style="color:var(--green)">+${CUR()}${myMoney}</div>`:""}
      </div>
      ${wantsSections}
    </div>
    <div style="display:flex;gap:.4rem;flex-wrap:wrap">
      <button class="btn btn-acc" onclick="socket.emit('trade_chip_approve',{tradeId:'${tradeId}',chipFromId:'${chipFromId}',approved:true})">✅ Accept Offer</button>
      <button class="btn btn-red" onclick="socket.emit('trade_chip_approve',{tradeId:'${tradeId}',chipFromId:'${chipFromId}',approved:false})">❌ Reject</button>
    </div>`;
  om("m-t-in");
}

function handleChipResponse({tradeId,responderId,chipFromId,approved}){
  const responder=gs?.players.find(p=>p.id===responderId);
  if(chipFromId!==myId)return; // Only show to the chipper
  
  const msg=approved?`✅ ${responder?.name||"?"} approved your chip-in offer!`:`❌ ${responder?.name||"?"} rejected your chip-in offer.`;
  toast(msg);
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

/* ─── BANK MODAL ─────────────────────────────────────────── */
function openBankModal(){
  renderBankModal();
  om("m-bank");
}
function bktab(id,btn){
  document.querySelectorAll(".bk-tab").forEach(b=>b.classList.remove("on"));
  document.querySelectorAll(".bk-sec").forEach(s=>s.classList.remove("on"));
  btn.classList.add("on");qid("bk-"+id).classList.add("on");
}
function renderBankModal(){
  const me=gs?.players.find(p=>p.id===myId);if(!me||!gs)return;
  const s=gs.settings,cur=s.currency||"$";
  const dep=me.bankDeposit+(me.bankDepositInterest||0);
  const totalLoan=me.loans?.reduce((a,l)=>a+l.remaining,0)||0;

  qid("bk-dep").innerHTML=`
    <div class="bk-stat-row">
      <div class="bk-stat"><span class="bk-stat-lbl">Balance Deposited</span><span class="bk-stat-val">${cur}${me.bankDeposit}</span></div>
      <div class="bk-stat"><span class="bk-stat-lbl">Accrued Interest</span><span class="bk-stat-val" style="color:var(--teal)">${cur}${me.bankDepositInterest||0}</span></div>
      <div class="bk-stat"><span class="bk-stat-lbl">Total Available</span><span class="bk-stat-val" style="color:var(--green)">${cur}${dep}</span></div>
      <div class="bk-stat"><span class="bk-stat-lbl">Rate</span><span class="bk-stat-val">${s.depositRate}%/round</span></div>
    </div>
    <div class="bk-action-row">
      <label class="bk-action-lbl">Deposit Amount</label>
      <div style="display:flex;gap:.4rem">
        <input type="number" id="bkd-dep-a" value="100" min="1" max="${me.money}" step="50" class="inp" style="flex:1">
        <button class="btn btn-blu" onclick="ga('bank_deposit',{amount:+qid('bkd-dep-a').value});cm('m-bank')">💰 Deposit</button>
      </div>
    </div>
    ${dep>0?`<div class="bk-action-row">
      <label class="bk-action-lbl">Withdraw Amount</label>
      <div style="display:flex;gap:.4rem">
        <input type="number" id="bkd-wit-a" value="${dep}" min="1" max="${dep}" step="50" class="inp" style="flex:1">
        <button class="btn btn-grn" onclick="ga('bank_withdraw',{amount:+qid('bkd-wit-a').value});cm('m-bank')">💵 Withdraw</button>
      </div>
    </div>`:""}
    <div class="bk-note">Deposits earn ${s.depositRate}% interest each time you pass GO. Withdraw anytime.</div>`;

  qid("bk-loans").innerHTML=`
    <div class="bk-stat-row">
      <div class="bk-stat"><span class="bk-stat-lbl">Total Debt</span><span class="bk-stat-val" style="color:${totalLoan>0?"var(--red)":"var(--green)"}">${cur}${totalLoan}</span></div>
      <div class="bk-stat"><span class="bk-stat-lbl">Loan Rate</span><span class="bk-stat-val">${s.loanRate}%/round</span></div>
      <div class="bk-stat"><span class="bk-stat-lbl">Your Cash</span><span class="bk-stat-val">${cur}${me.money}</span></div>
      <div class="bk-stat"><span class="bk-stat-lbl">Max Loan</span><span class="bk-stat-val">${cur}5000</span></div>
    </div>
    ${me.loans?.length?`<div class="bk-loans-list">
      ${me.loans.map((l,i)=>`<div class="bk-loan-card${l.turnsLeft<=2?" bk-loan-urgent":""}">
        <div class="bk-loan-info">
          <span>Loan ${i+1}</span>
          <span style="font-size:.75rem;color:var(--muted)">${l.turnsLeft} round${l.turnsLeft!==1?"s":""} left</span>
        </div>
        <div class="bk-loan-balance">${cur}${l.remaining}</div>
        <div class="bk-loan-btns">
          ${[100,250,500].filter(a=>a<=l.remaining&&a<=me.money).map(a=>`<button class="btn btn-sm btn-out" onclick="ga('bank_repay',{loanId:'${l.id}',amount:${a}});renderBankModal()">Pay ${cur}${a}</button>`).join("")}
          ${me.money>=l.remaining?`<button class="btn btn-sm btn-grn" onclick="ga('bank_repay',{loanId:'${l.id}',amount:${l.remaining}});cm('m-bank')">✅ Pay All</button>`:""}
        </div>
      </div>`).join("")}
    </div>`:"<div class='bk-note'>No active loans.</div>"}
    <div class="bk-action-row">
      <label class="bk-action-lbl">New Loan</label>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap">
        <input type="number" id="bkd-loan-a" value="500" min="100" max="5000" step="100" class="inp" style="flex:1;min-width:80px">
        <select id="bkd-loan-t" class="inp" style="width:auto"><option value="4">4 rounds</option><option value="6" selected>6 rounds</option><option value="8">8 rounds</option><option value="12">12 rounds</option></select>
        <button class="btn btn-blu" onclick="ga('bank_loan',{amount:+qid('bkd-loan-a').value,tenure:+qid('bkd-loan-t').value});cm('m-bank')">💸 Take Loan</button>
      </div>
    </div>
    <div class="bk-note">⚠️ Unpaid loans accrue ${s.loanRate}% each round. Defaulting after 3 rounds marks you as bad debt.</div>`;

  const cc=me.creditCard;
  qid("bk-cc").innerHTML=cc?.active?`
    <div class="bk-cc-card">
      <div class="bk-cc-chip">💳</div>
      <div class="bk-cc-name">${me.name}</div>
      <div class="bk-cc-limit">${cur}${cc.limit} LIMIT</div>
    </div>
    <div class="bk-stat-row" style="margin-top:.7rem">
      <div class="bk-stat"><span class="bk-stat-lbl">Credit Used</span><span class="bk-stat-val" style="color:var(--orange)">${cur}${cc.used}</span></div>
      <div class="bk-stat"><span class="bk-stat-lbl">Available</span><span class="bk-stat-val" style="color:var(--green)">${cur}${cc.limit-cc.used}</span></div>
      <div class="bk-stat"><span class="bk-stat-lbl">EMI / GO</span><span class="bk-stat-val">${cur}${cc.emi}</span></div>
      <div class="bk-stat"><span class="bk-stat-lbl">Rounds Left</span><span class="bk-stat-val">${Math.ceil(cc.roundsLeft||0)}</span></div>
    </div>
    <div class="bk-cc-bar-wrap"><div class="bk-cc-bar" style="width:${Math.min(100,Math.round(cc.used/cc.limit*100))}%"></div></div>
    ${me.money>=cc.emi?`<button class="btn btn-pur" style="width:100%;margin-top:.6rem" onclick="ga('bank_pay_emi');renderBankModal()">💳 Pay EMI — ${cur}${cc.emi}</button>`:`<div class="bk-note" style="color:var(--red)">⚠️ Insufficient funds to pay EMI (${cur}${cc.emi} needed).</div>`}`:`
    <div class="bk-cc-empty">
      <div style="font-size:2.5rem;margin-bottom:.5rem">💳</div>
      <div style="font-size:.9rem;font-weight:700;margin-bottom:.3rem">No Credit Card</div>
      <div class="bk-note">Fee: ${cur}${s.creditCardFee} · Limit: ${cur}${s.creditCardLimit}</div>
    </div>
    <div class="bk-action-row">
      <label class="bk-action-lbl">Repayment Tenure</label>
      <div style="display:flex;gap:.4rem">
        <select id="bkd-cc-t" class="inp" style="flex:1"><option value="3">3 rounds</option><option value="6" selected>6 rounds</option><option value="9">9 rounds</option></select>
        <button class="btn btn-pur" onclick="ga('bank_credit',{tenure:+qid('bkd-cc-t').value});cm('m-bank')">Get Card</button>
      </div>
    </div>`;

  qid("bk-ins").innerHTML=me.hasInsurance?`
    <div class="bk-ins-active">
      <div style="font-size:3rem">🛡️</div>
      <div style="font-size:1rem;font-weight:800;color:var(--green);margin:.3rem 0">Insurance Active</div>
      <div class="bk-note">Covers ${s.insurancePayout}% of hazard losses. Premium: ${cur}${s.insurancePremium} per GO pass.</div>
    </div>
    ${(me.pendingHazardLoss||0)+(me.pendingHazardRebuildCost||0)>0?`
      <div class="bk-action-row">
        <button class="btn btn-grn" style="width:100%" onclick="ga('claim_insurance');cm('m-bank')">🛡️ Claim Insurance — ${cur}${Math.floor(((me.pendingHazardLoss||0)+(me.pendingHazardRebuildCost||0))*(s.insurancePayout/100))}</button>
      </div>
    `:`<div class="bk-note" style="margin-top:.5rem">No pending claims at this time.</div>`}`:`
    <div class="bk-ins-empty">
      <div style="font-size:3rem;margin-bottom:.5rem">🛡️</div>
      <div style="font-size:.9rem;font-weight:700;margin-bottom:.3rem">No Insurance</div>
      <div class="bk-note">One-time premium of ${cur}${s.insurancePremium||150}. Covers ${s.insurancePayout}% of losses from hazard tiles.</div>
    </div>
    ${me.money>=( s.insurancePremium||150)?`<button class="btn btn-grn" style="width:100%;margin-top:.8rem" onclick="ga('bank_insurance');cm('m-bank')">🛡️ Buy Insurance — ${cur}${s.insurancePremium||150}</button>`:`<div class="bk-note" style="color:var(--red)">Need ${cur}${(s.insurancePremium||150)-me.money} more to afford insurance.</div>`}`;
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
  const canRoll=gs?.phase==="roll"&&isMT;
  o.classList.remove("dh");
  o.style.cursor=canRoll?"pointer":"default";
  const hint=qid("dice-hint-txt");
  if(hint){
    const me=gs?.players?.find(p=>p.id===myId);
    if(canRoll&&me?.inJail)hint.textContent="🎲 Roll for doubles";
    else if(canRoll)hint.textContent="🎲 Click to Roll!";
    else hint.textContent="🎲 Waiting for turn";
  }
  if(gs?.lastRoll){
    const die1=qid("die1"),die2=qid("die2");
    setDieFace(die1,gs.lastRoll[0]);
    setDieFace(die2,gs.lastRoll[1]);
    const d1=gs.lastRoll[0]||0;
    const d2=gs.lastRoll[1]||0;
    const total=d1+d2;
    const totalEl=qid("dice-total");
    if(totalEl)totalEl.textContent=`Total: ${d1} + ${d2} = ${total}`;
    const dbl=qid("doubles-badge");
    if(dbl){
      if(gs.lastRoll[0]===gs.lastRoll[1])dbl.classList.remove("hidden");
      else dbl.classList.add("hidden");
    }
  }
}

async function animateDice(val1,val2){
  const die1=qid("die1"),die2=qid("die2");
  if(!die1||!die2)return;
  const over=qid("dice-over");

  die1.classList.remove("rolling");
  die2.classList.remove("rolling");
  over?.classList.remove("rolling");

  die1.style.transition="none";
  die2.style.transition="none";
  die1.style.transform="rotateX(0deg) rotateY(0deg)";
  die2.style.transform="rotateX(0deg) rotateY(0deg)";

  void die1.offsetWidth;
  void die2.offsetWidth;

  die1.classList.add("rolling");
  die2.classList.add("rolling");
  over?.classList.add("rolling");
  await sleep(600);

  die1.classList.remove("rolling");
  die2.classList.remove("rolling");
  over?.classList.remove("rolling");

  die1.style.transition="transform .7s ease-out";
  die2.style.transition="transform .7s ease-out";
  setDieFace(die1,val1);
  setDieFace(die2,val2);
  await sleep(700);
}

function _renderActionsCore(){
  if(!gs)return;
  const me=gs.players.find(p=>p.id===myId);
  const cur=gs.players[gs.currentPlayerIdx];
  const isMT=cur?.id===myId;
  const hasDoubles=Array.isArray(gs.lastRoll)&&gs.lastRoll.length===2&&gs.lastRoll[0]===gs.lastRoll[1];
  const canRollAgain=!!(isMT&&me&&!me.inJail&&!me.badDebt&&hasDoubles&&(me.turnDoublesCount||0)>0);
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
    }else if(canRollAgain){
      h+=`<button class="btn btn-acc" onclick="rollDice()">🎲 Roll Again</button>`;
    }else{h+=`<button class="btn btn-acc" onclick="rollDice()">🎲 Roll Dice</button>`;}
  }
  if(gs.phase==="buy"){
    const sp=gs.board[me.position];
    const canAuction=gs.settings?.auctionMode&&gs.settings.auctionMode!=="none";
    h+=`<button class="btn btn-acc" onclick="ga('buy')">🏠 Buy ${CUR()}${sp?.price}</button>`;
    if(canAuction)h+=`<button class="btn btn-blu" onclick="ga('start_auction')">🔨 Auction</button>`;
  }
  if(gs.phase==="auction"){
    const auc=gs.auction;
    if(auc&&!auc.folded?.includes(myId)){
      const mustWait=auc.lastBidder===myId;
      if(mustWait)h+=`<div style="color:var(--muted);font-size:.72rem;padding:.2rem .35rem">Wait for another player to bid…</div>`;
      h+=`<button class="btn btn-grn btn-sm" ${mustWait?"disabled":""} onclick="auctionBid(${auc.currentBid+2})">+${CUR()}2</button>`;
      h+=`<button class="btn btn-grn btn-sm" ${mustWait?"disabled":""} onclick="auctionBid(${auc.currentBid+10})">+${CUR()}10</button>`;
      h+=`<button class="btn btn-grn btn-sm" ${mustWait?"disabled":""} onclick="auctionBid(${auc.currentBid+100})">+${CUR()}100</button>`;
      h+=`<input type="number" id="custom-bid" class="inp" style="width:72px;font-size:.72rem" value="${auc.currentBid+2}" min="${auc.currentBid+1}">`;
      h+=`<button class="btn btn-acc btn-sm" onclick="auctionCustomBid()">Bid</button>`;
      h+=`<button class="btn btn-red btn-sm" onclick="auctionFold()">🏳️ Fold</button>`;
    }else if(auc?.folded?.includes(myId)){h+=`<div style="color:var(--muted);font-size:.76rem">You folded</div>`;}
  }
  if(gs.phase==="air_travel")h+=`<button class="btn btn-blu" onclick="showTravModal()">✈ Fly</button><button class="btn btn-out" onclick="ga('skip_travel')">Stay</button>`;
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
    const totalLoss=(me.pendingHazardLoss||0)+(me.pendingHazardRebuildCost||0);
    if(totalLoss>0&&me.hasInsurance)h+=`<button class="btn btn-grn btn-sm" onclick="ga('claim_insurance')">🛡️ Claim ${CUR()}${Math.floor(totalLoss*(gs.settings.insurancePayout/100))}</button>`;
    if(me.money<0){
      h+=`<div style="background:color-mix(in srgb,var(--red) 10%,transparent);border:1px solid var(--red);border-radius:7px;padding:.45rem;font-size:.73rem;text-align:center;color:var(--red)">Negative balance: sell, mortgage, trade, or go bankrupt.</div>`;
      h+=`<button class="btn btn-acc" disabled style="opacity:.45;cursor:not-allowed">▶ End Turn</button>`;
    }else{
      if(canRollAgain)h+=`<button class="btn btn-acc" onclick="ga('end_turn')">🎲 Roll Again</button>`;
      else h+=`<button class="btn btn-acc" onclick="ga('end_turn')">▶ End Turn</button>`;
    }
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
  const activePlayers=gs.players.filter(p=>!p.bankrupted&&!p.isSpectator);
  const moneyRows=activePlayers.map(p=>`<div style="display:flex;justify-content:space-between;font-size:.72rem"><span style="color:${p.color}">${p.name}${p.id===myId?" (You)":""}</span><b>${CUR()}${p.money||0}</b></div>`).join("");
  const CIRC=100;
  qid("auction-c").innerHTML=`
    <div class="auc-header">
      <div style="display:flex;align-items:center;gap:.5rem">
        <div style="width:12px;height:12px;border-radius:50%;background:${gc};flex-shrink:0"></div>
        <span style="font-size:.95rem;font-weight:700">🔨 ${sp?.name||ps.name||"Auction"}</span>
      </div>
      <div class="auc-ring-wrap">
        <svg class="auc-ring" viewBox="0 0 36 36">
          <circle class="auc-ring-bg" cx="18" cy="18" r="15.9"/>
          <circle class="auc-ring-fill" id="auc-ring-c" cx="18" cy="18" r="15.9" stroke-dasharray="${CIRC} ${CIRC}" stroke-dashoffset="0"/>
        </svg>
        <div class="auc-ring-lbl" id="auc-timer">10</div>
      </div>
    </div>
    <div class="auc-bid-center">
      <div class="auc-cur-bid">${CUR()}${auc.currentBid||0}</div>
      <div class="auc-cur-bidder" style="color:${iAmHigh?"var(--green)":"var(--muted)"}">
        ${highBidder?`${iAmHigh?"🏆 You lead":"Leading:"} ${highBidder.name}`:"No bids yet — starting at "+CUR()+"0"}
      </div>
      ${auc.lastBidder===myId?`<div style="font-size:.7rem;color:var(--muted);margin-top:.2rem">You bid last. Waiting for another bidder…</div>`:""}
      <div style="font-size:.72rem;color:var(--muted);margin-top:.25rem">Your cash: ${CUR()}${me?.money||0} · Folded: ${auc.folded?.length||0}/${gs.players.filter(p=>!p.bankrupted).length}</div>
    </div>
    <div class="auc-prop-strip">
      <span>List price: <b>${CUR()}${ps.price||sp?.price||0}</b></span>
      ${ps.rents?`<span>Base rent: <b>${CUR()}${ps.rents[0]||0}</b></span>`:""}
      ${ps.stateName?`<span>📍 ${ps.stateName}</span>`:""}
    </div>
    <div style="margin-top:.35rem;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:.4rem">
      <div style="font-size:.68rem;color:var(--muted);margin-bottom:.25rem">Players' Money</div>
      ${moneyRows}
    </div>
    ${(ps.type==="property"&&ps.rents)?`<table class="rtbl" style="margin-top:.25rem"><tr><th>Level</th><th>Rent</th></tr>${["Base","1🏠","2🏠","3🏠","4🏠","🏨"].map((lbl,i)=>`<tr><td>${lbl}</td><td>${CUR()}${ps.rents[i]||0}</td></tr>`).join("")}</table>`:""}
    ${(ps.type==="airport")?`<table class="rtbl" style="margin-top:.25rem"><tr><th>Owned Airports</th><th>Rent</th></tr><tr><td>1</td><td>${CUR()}100</td></tr><tr><td>2</td><td>${CUR()}200</td></tr></table>`:""}
    ${(ps.type==="railway")?`<table class="rtbl" style="margin-top:.25rem"><tr><th>Owned Railways</th><th>Fee</th></tr>${[1,2,3,4].map(n=>`<tr><td>${n}</td><td>${CUR()}${25*Math.pow(2,n-1)}</td></tr>`).join("")}</table>`:""}
    <div class="auc-history">
      ${auc.bidHistory?.length?auc.bidHistory.slice(-6).reverse().map((b,i)=>`<div class="auc-hist-row${i===0?" auc-hist-latest":""}"><b>${b.playerName}</b> bid <b style="color:var(--accent)">${CUR()}${b.amount}</b></div>`).join(""):`<div style="font-size:.72rem;color:var(--muted);text-align:center">No bids yet — start bidding!</div>`}
    </div>
    ${!myFolded?`
    <div class="auc-bid-btns">
      <button class="btn btn-grn" ${auc.lastBidder===myId?"disabled":""} onclick="auctionBid(${auc.currentBid+2})">+${CUR()}2</button>
      <button class="btn btn-grn" ${auc.lastBidder===myId?"disabled":""} onclick="auctionBid(${auc.currentBid+10})">+${CUR()}10</button>
      <button class="btn btn-grn" ${auc.lastBidder===myId?"disabled":""} onclick="auctionBid(${auc.currentBid+100})">+${CUR()}100</button>
    </div>
    <div style="display:flex;gap:.4rem;margin-top:.4rem">
      <input type="number" id="auc-custom" class="inp" value="${auc.currentBid+2}" min="${auc.currentBid+1}" style="flex:1">
      <button class="btn btn-acc" onclick="auctionCustomBid2()">Custom Bid</button>
      <button class="btn btn-red" onclick="auctionFold()">🏳️ Fold</button>
    </div>`:`<div class="auc-folded-msg">You folded — watching the auction</div>`}`;
  om("m-auction");
  startAuctionTimerDisplay();
}

function auctionCustomBid2(){const v=+qid("auc-custom")?.value;if(v)auctionBid(v);}

const AUC_SECS=10,AUC_CIRC=100;
let _aucDisplayTimer=null;
function startAuctionTimerDisplay(){
  stopAuctionTimer();
  _auctionSecsLeft=AUC_SECS;
  _aucDisplayTimer=setInterval(()=>{
    _auctionSecsLeft=Math.max(0,_auctionSecsLeft-1);
    const el=qid("auc-timer");
    const ring=qid("auc-ring-c");
    const pct=_auctionSecsLeft/AUC_SECS;
    const offset=AUC_CIRC*(1-pct);
    if(el)el.textContent=_auctionSecsLeft>0?`${_auctionSecsLeft}`:"!";
    if(ring){ring.style.strokeDashoffset=offset;ring.style.stroke=_auctionSecsLeft<=3?"var(--red)":_auctionSecsLeft<=6?"var(--orange)":"var(--green)";}
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

function confirmDeclareBankrupt(){
  const me=gs?.players?.find(p=>p.id===myId);
  if(!me||me.bankrupted)return;
  if(confirm("Declare bankruptcy and forfeit the game? This cannot be undone."))ga("declare_bankrupt");
}

/* ─── PENDING EVENTS ─────────────────────────────────────── */
function handlePendingEvent(){
  if(!gs?.pendingEvent)return;
  const ev=gs.pendingEvent;
  if(ev.type==="hazard")showHazardModal(ev);
  else if(ev.type==="surprise")showSurpriseModal(ev);
  if(ev.type==="gov_prot")showGovModal(ev);
  if(ev.type==="tax_return")toast(`📋 Tax Return! ${ev.message}`);
}
function handleSurpriseClose(){ga("hazard_ack");cm("m-surp");}

function showHazardModal(ev){
  const h=ev.hazard||{};
  const me=gs?.players.find(p=>p.id===myId);
  const s=gs?.settings||{};
  const lostMoney=ev.lostMoney||0;
  const lostHouses=ev.lostHouses||0;
  const hasIns=me?.hasInsurance;
  const pending=(me?.pendingHazardLoss||0)+(me?.pendingHazardRebuildCost||0);
  const claimAmt=pending>0?Math.floor(pending*(s.insurancePayout||80)/100):0;
  qid("haz-c").innerHTML=`
    <div class="haz-card card-reveal">
      <div class="haz-icon">${h.icon||"⚠️"}</div>
      <div class="haz-title">${h.name||"Hazard!"}</div>
      <div class="haz-desc">${h.desc||""}</div>
      ${lostMoney>0?`<div class="haz-loss">-${CUR()}${lostMoney}</div>`:""}
      ${lostHouses>0?`<div class="haz-houses">🏚️ ${lostHouses} structure${lostHouses!==1?"s":""} demolished</div>`:""}
    </div>
    ${hasIns&&claimAmt>0?`<button class="btn btn-grn" style="width:100%;margin-top:.6rem" onclick="ga('claim_insurance');ga('hazard_ack');cm('m-haz')">🛡️ Claim Insurance (${CUR()}${claimAmt})</button>`:""}
    <button class="btn btn-acc" style="width:100%;margin-top:.45rem" onclick="ga('hazard_ack');cm('m-haz')">Continue →</button>`;
  om("m-haz");
}

function showSurpriseModal(ev){
  let tier="good",lbl="😊 Good Luck!",headerColor="var(--green)";
  const card=ev.card||ev.hazard;
  if(ev.tier==="very_good"){tier="very-good";lbl="🌟 JACKPOT!";headerColor="var(--accent)";}
  else if(ev.tier==="very_bad"){tier="very-bad";lbl="💀 CATASTROPHE!";headerColor="var(--red)";}
  else if(ev.tier==="bad"){tier="bad";lbl="😬 Bad Luck!";headerColor="var(--orange)";}
  let amount=0;
  if(card?.action==="gain")amount=card.amount;
  if(card?.action==="pay")amount=-card.amount;
  if(ev.lostMoney)amount=-ev.lostMoney;
  qid("surp-c").innerHTML=`
    <div class="surp-card ${tier} card-flip">
      <div class="surp-card-inner">
        <div class="surp-card-front"><div style="font-size:2.5rem">🃏</div><div style="font-size:.8rem;color:var(--muted)">Surprise Card</div></div>
        <div class="surp-card-back">
          <div class="surp-tier" style="color:${headerColor}">${lbl}</div>
          <span class="surp-ico">${card?.icon||"🃏"}</span>
          ${card?.title?`<div class="surp-title">${card.title}</div>`:""}
          <div class="surp-text">${card?.text||card?.desc||""}</div>
          ${amount?`<div class="surp-amount" style="color:${amount>0?"var(--green)":"var(--red)"}">${amount>0?"+":""} ${CUR()}${Math.abs(amount)}</div>`:""}
          ${ev.lostHouses?`<div style="color:var(--orange);font-size:.8rem;margin-top:.3rem">🏚️ ${ev.lostHouses} structure(s) demolished</div>`:""}
        </div>
      </div>
    </div>
    <button class="btn btn-acc" style="width:100%;margin-top:.6rem" onclick="handleSurpriseClose()">Take it! →</button>`;
  om("m-surp");
}
function showGovModal(ev){
  const details=[];
  if(ev.debtCleared)details.push(`✅ Cleared debt of ${CUR()}${ev.debtCleared}`);
  if(ev.hazardCompensation)details.push(`🛠️ Hazard compensation: ${CUR()}${ev.hazardCompensation}`);
  if(ev.cashGrant)details.push(`💵 Cash grant: ${CUR()}${ev.cashGrant}`);
  if(!details.length)details.push("Your finances are healthy — no action needed.");
  qid("gov-c").innerHTML=`
    <div class="card-reveal" style="background:color-mix(in srgb,var(--green) 10%,var(--card));border:2px solid var(--green);border-radius:12px;padding:1.3rem;text-align:center">
      <div style="font-size:3rem">🏛️</div>
      <div style="font-size:1.05rem;font-weight:800;color:var(--green);margin:.4rem 0">Government Protection</div>
      ${details.map(d=>`<div style="font-size:.82rem;color:var(--muted);padding:.2rem 0">${d}</div>`).join("")}
      ${ev.message?`<div style="font-size:.78rem;color:var(--muted);margin-top:.5rem;font-style:italic">${ev.message}</div>`:""}
    </div>
    <button class="btn btn-acc" style="width:100%;margin-top:.6rem" onclick="ga('gov_ack');cm('m-gov')">OK, thanks!</button>`;
  om("m-gov");
}

/* ─── PROPERTY MODAL ─────────────────────────────────────── */
function showPropModal(pos){
  if(!gs)return;
  const sp=gs.board[pos];
  if(!sp||["go","jail","free_parking","go_to_jail"].includes(sp.type))return;
  const me=gs.players.find(p=>p.id===myId);
  const own=sp.owner?gs.players.find(p=>p.id===sp.owner):null;
  const gi=sp.group?parseInt(sp.group.slice(1)):-1;
  const gc=gi>=0?GRP_COLORS[gi]:"#666";
  const hasSet=hasPropertyFullSet(gs,sp);
  const setBonusOn=gs.settings?.doubleRentOnSet!==false;
  const isOwnedByMe=!!(own&&me&&own.id===myId);
  const hasLandedOnTile=(me?.position===pos);
  const canViewTileFinancials=true;
  let rH="";
  if(sp.type==="property"&&sp.rents&&canViewTileFinancials){
    const lbls=["Base","1🏠","2🏠","3🏠","4🏠","🏨"];
    rH=`<table class="rtbl"><tr><th>Level</th><th>Rent</th></tr>${sp.rents.map((r,i)=>`<tr class="${(sp.houses||0)===i?"rhl":""}"><td>${lbls[i]}</td><td>${CUR()}${hasSet&&setBonusOn&&i===0?`<b style="color:var(--accent)">${r*2}</b> <span style='color:var(--muted);font-size:.7em'>×2 SET</span>`:r}</td></tr>`).join("")}</table>`;
  }
  if(sp.type==="airport"&&canViewTileFinancials)rH=`<table class="rtbl"><tr><th>Owned Airports</th><th>Rent</th></tr><tr><td>1</td><td>${CUR()}100</td></tr><tr><td>2</td><td>${CUR()}200</td></tr></table>`;
  if(sp.type==="railway"&&canViewTileFinancials)rH=`<table class="rtbl"><tr><th>Railways</th><th>Fee</th></tr>${[1,2,3,4].map(n=>`<tr><td>${n}</td><td>${CUR()}${25*Math.pow(2,n-1)}</td></tr>`).join("")}</table>`;
  if(sp.type==="utility"&&canViewTileFinancials){const cnt=gs.board.filter(s=>s.type==="utility"&&s.owner===sp.owner).length;rH=`<table class="rtbl"><tr><th>Utilities Owned</th><th>Rent Formula</th></tr><tr><td>1</td><td>${CUR()}<b>Dice × 4</b></td></tr><tr><td>2</td><td>${CUR()}<b>Dice × 10</b></td></tr></table>`;}
  if(["property","airport","railway","utility"].includes(sp.type)&&!canViewTileFinancials){
    rH=`<div style="margin-top:.35rem;padding:.45rem;border:1px solid var(--border);border-radius:8px;background:var(--bg);font-size:.74rem;color:var(--muted)">🔒 Rent/transport details unlock after you land on this tile or own it.</div>`;
  }
  const isMyTurn=gs.players[gs.currentPlayerIdx]?.id===myId;
  const rolledThisTurn=!!gs.turnHasRolled&&isMyTurn;
  const isBuyPhase=gs.phase==="buy"&&me?.position===pos&&gs.players[gs.currentPlayerIdx]?.id===myId;
  const cc=me?.creditCard;
  const canCreditBuy=isBuyPhase&&!own&&cc?.active&&(cc.limit-cc.used)>=(sp.price||0);
  const modalPrefix="";
  const canManageMortgage=own&&me&&own.id===myId&&isMyTurn&&!rolledThisTurn;
  const isMyProperty=own&&me&&own.id===myId&&sp.type==="property";
  const canManageHouses=isMyProperty&&!sp.mortgaged;
  const mortgagedAmount=Math.floor((sp.price||0)*0.75);
  const unmortgageCost=mortgagedAmount+Math.ceil(mortgagedAmount*0.05);
  const propertySet=(canManageHouses
    ?(()=>{
      const cCode=getCountryCode(sp);
      if(cCode)return gs.board.filter(s=>s?.type==="property"&&getCountryCode(s)===cCode);
      if(sp.group)return gs.board.filter(s=>s?.type==="property"&&s.group===sp.group);
      return [];
    })()
    :[]);
  const minSetH=propertySet.length?Math.min(...propertySet.map(s=>s.houses||0)):0;
  const maxSetH=propertySet.length?Math.max(...propertySet.map(s=>s.houses||0)):0;
  const needsMonopoly=gs.settings?.housingRule==="monopoly";
  const canBuildSet=!needsMonopoly||hasSet;
  const houseCost=Math.max(0,sp.houseCost||0);
  const sellRefund=Math.floor(houseCost/2);
  const canBuildHouse=canManageHouses&&isMyTurn&&canBuildSet&&houseCost>0&&(sp.houses||0)<5&&(me.money>=houseCost)&&((sp.houses||0)<=minSetH);
  const canSellHouse=canManageHouses&&isMyTurn&&(sp.houses||0)>0&&((sp.houses||0)>=maxSetH);
  const houseControlsHTML=isMyProperty?`
    <div style="margin-top:.55rem;padding:.5rem;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:.45rem">
        <div style="font-size:.74rem;color:var(--muted)">Houses: <b style="color:var(--txt)">${sp.houses||0}</b>/5</div>
        <div style="display:flex;gap:.35rem;align-items:center">
          <button class="btn btn-sm btn-red" ${canSellHouse?"":"disabled"} onclick="ga('sell_house',{position:${pos}})">− ${CUR()}${sellRefund}</button>
          <button class="btn btn-sm btn-grn" ${canBuildHouse?"":"disabled"} onclick="ga('build',{position:${pos}})">+ ${CUR()}${houseCost}</button>
        </div>
      </div>
      ${needsMonopoly&&!hasSet?`<div style="font-size:.7rem;color:var(--red);margin-top:.3rem">Own the full country set to build.</div>`:""}
      <div style="font-size:.7rem;color:var(--muted);margin-top:.3rem">Level rule: build evenly across country properties.</div>
      ${!isMyTurn?`<div style="font-size:.7rem;color:var(--muted);margin-top:.3rem">House actions available on your turn.</div>`:""}
      <div style="font-size:.7rem;color:var(--muted);margin-top:.25rem">Demolish refund: 50% of house cost.</div>
      ${rolledThisTurn?`<div style="font-size:.7rem;color:var(--orange);margin-top:.3rem">Mortgage actions are locked after rolling.</div>`:""}
    </div>`:"";
  const mortgageHTML=canManageMortgage
    ?(sp.mortgaged
      ?`<div style="margin-top:.55rem;padding:.5rem;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
          <div style="font-size:.72rem;color:var(--muted);margin-bottom:.3rem">Lift Mortgage = Mortgaged Amount + 5% fee</div>
          <button class="btn btn-grn" style="width:100%" ${me.money<unmortgageCost?"disabled":""} onclick="ga('unmortgage',{position:${pos}});cm('m-prop')">🔓 Unmortgage ${CUR()}${unmortgageCost}</button>
        </div>`
      :`<div style="margin-top:.55rem;padding:.5rem;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
          ${sp.houses>0?`<div style="font-size:.72rem;color:var(--red);margin-bottom:.3rem">Sell all houses first to mortgage this property.</div>`:""}
          <button class="btn btn-out" style="width:100%" ${sp.houses>0?"disabled":""} onclick="ga('mortgage',{position:${pos}});cm('m-prop')">🔒 Mortgage ${CUR()}${mortgagedAmount}</button>
        </div>`)
    :"";
  qid("prop-c").innerHTML=`
    <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem">
      <div style="width:14px;height:14px;border-radius:50%;background:${gc}"></div>
      <h2 style="margin:0;font-size:.95rem">${modalPrefix}${sp.name}</h2>
      ${hasSet&&setBonusOn?`<span style="font-size:.68rem;background:var(--accent);color:#000;padding:.12rem .4rem;border-radius:10px;font-weight:700">★ FULL SET 2×</span>`:""}
    </div>
    ${sp.stateName?`<p style="color:var(--muted);font-size:.72rem;margin-bottom:.3rem">📍 ${sp.stateName} · ${sp.countryName||""}</p>`:""}
    ${own?`<p style="color:${own.color};font-size:.78rem;margin-bottom:.35rem">Owner: ${own.name}</p>`:`<p style="color:var(--muted);font-size:.76rem;margin-bottom:.35rem">Unowned</p>`}
    ${sp.mortgaged?`<p style="color:var(--red);font-size:.75rem">⚠️ Mortgaged</p>`:""}
    ${sp.price?`<p style="font-size:.82rem;margin-bottom:.35rem">Price: <b>${CUR()}${sp.price}</b>${sp.houseCost?` · House: <b>${CUR()}${sp.houseCost}</b>`:""}</p>`:""}
    ${rH}
    ${houseControlsHTML}
    ${mortgageHTML}
    ${canCreditBuy?`<div style="margin-top:.6rem;padding:.45rem;background:color-mix(in srgb,var(--purple) 10%,transparent);border:1px solid var(--purple);border-radius:8px">
      <div style="font-size:.72rem;color:var(--muted);margin-bottom:.3rem">💳 Credit available: ${CUR()}${cc.limit-cc.used}</div>
      <button class="btn btn-pur" style="width:100%" onclick="ga('buy',{useCredit:true});cm('m-prop')">💳 Buy on Credit</button>
    </div>`:""}`;
  om("m-prop");
}

/* ─── TRAVEL MODALS ──────────────────────────────────────── */
function showTravModal(){
  const me=gs.players.find(p=>p.id===myId);
  const cur=gs.board[me?.position];
  const airports=gs.board.filter(s=>s.type==="airport"&&s.pos!==me?.position);
  const fromSouth=cur?.label==="south";
  qid("trav-c").innerHTML=`<h2>✈ Choose Destination</h2>
    <p style="color:var(--muted);font-size:.78rem;margin-bottom:.5rem">Pay destination airport rent if owned (100 / 200 for full airport set).</p>
    <div class="trav-list">${airports.map(a=>{
      const ok=(me?.money||0)>=0;
      const own=a.owner?gs.players.find(p=>p.id===a.owner):null;
      const rent=own&&own.id!==myId?(gs.board.filter(s=>s.type==="airport"&&s.owner===own.id).length>=2?200:100):0;
      const goBonus=(fromSouth&&a.label==="north")?` · +${CUR()}${gs.settings.goSalary} GO salary`:"";
      return `<div class="trav-item${ok?"":" disabled"}" onclick="${ok?`ga('travel_air',{destPos:${a.pos}});cm('m-trav')`:""}">
        <div><div style="font-weight:700">✈ ${a.name}</div><div style="font-size:.7rem;color:${own?own.color:"var(--muted)"}">${own?"Owner: "+own.name:"Unowned"}</div></div>
        <div style="color:var(--accent);font-size:.72rem">${rent?`Rent ${CUR()}${rent}`:"No rent"}${goBonus}</div>
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
  const myProps=gs.board.filter(s=>s.type==="property"&&s.owner===me.id);
  qid("build-c").innerHTML=`<h2>🏗️ Build / Sell</h2>
    <p style="font-size:.78rem;color:var(--muted)">Cash: ${CUR()}${me.money}</p>
    ${!myProps.length?`<p style="color:var(--muted);font-size:.8rem">No owned properties.</p>`:""}
    <div style="display:flex;flex-direction:column;gap:.35rem">
      ${myProps.map(s=>{
        const h=s.houses||0,gi=parseInt(s.group.slice(1));
        const cCode=getCountryCode(s);
        const set=(cCode
          ?gs.board.filter(x=>x.type==="property"&&getCountryCode(x)===cCode)
          :gs.board.filter(x=>x.type==="property"&&x.group===s.group));
        const hasSet=set.length>1&&set.every(x=>x.owner===me.id);
        const minH=set.length?Math.min(...set.map(x=>x.houses||0)):0;
        const maxH=set.length?Math.max(...set.map(x=>x.houses||0)):0;
        const canBuild=!s.mortgaged&&(gs.settings.housingRule!=="monopoly"||hasSet)&&h<5&&me.money>=(s.houseCost||0)&&(!gs.settings.evenBuild||h<=minH);
        const canSell=!s.mortgaged&&h>0&&(!gs.settings.evenBuild||h>=maxH);
        return`<div style="background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:.48rem .55rem">
          <div style="display:flex;align-items:center;gap:.38rem;margin-bottom:.28rem">
            <div style="width:9px;height:9px;border-radius:50%;background:${GRP_COLORS[gi]}"></div>
            <strong style="font-size:.8rem">${cityLabel(s)}</strong>
            <span style="font-size:.68rem;color:var(--muted)">${h<5?h+"h":"🏨"}</span>
          </div>
          <div style="display:flex;gap:.28rem">
            <button class="btn btn-sm btn-red" ${canSell?"":"disabled"} onclick="ga('sell_house',{position:${s.pos}})">− ${CUR()}${Math.floor((s.houseCost||0)/2)}</button>
            <button class="btn btn-sm btn-grn" ${canBuild?"":"disabled"} onclick="ga('build',{position:${s.pos}})">+ ${CUR()}${s.houseCost||0}</button>
          </div>
          ${gs.settings.housingRule==="monopoly"&&!hasSet?`<div style="font-size:.68rem;color:var(--red);margin-top:.25rem">Need full country set</div>`:""}
        </div>`;
      }).join("")}
    </div>
    <button class="btn btn-out" style="width:100%;margin-top:.55rem" onclick="cm('m-build')">Close</button>`;
  om("m-build");
}
function showMortModal(){
  const me=gs.players.find(p=>p.id===myId);
  const isMyTurn=gs.players[gs.currentPlayerIdx]?.id===myId;
  const mortgageLocked=!isMyTurn||!!gs.turnHasRolled;
  const myProps=gs.board.filter(s=>["property","airport","railway","utility"].includes(s.type)&&s.owner===me.id);
  qid("mort-c").innerHTML=`<h2>🔒 Mortgage</h2>
    ${mortgageLocked?`<div style="font-size:.72rem;color:var(--orange);margin-bottom:.4rem">Mortgage actions are available only before you roll on your turn.</div>`:""}
    <div style="display:flex;flex-direction:column;gap:.3rem">
      ${myProps.map(s=>{
        const gi=s.group?parseInt(s.group.slice(1)):-1;
        return`<div style="background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:.42rem .55rem;display:flex;align-items:center;gap:.38rem">
          ${gi>=0?`<div style="width:8px;height:8px;border-radius:50%;background:${GRP_COLORS[gi]}"></div>`:""}
          <span style="flex:1;font-size:.78rem">${cityLabel(s)}</span>
          ${s.mortgaged
            ?`<span style="font-size:.7rem;color:var(--red)">Mortgaged</span><button class="btn btn-sm btn-grn" ${mortgageLocked?"disabled":""} onclick="ga('unmortgage',{position:${s.pos}})">Unmortgage ${CUR()}${Math.floor(s.price*.75)+Math.ceil(Math.floor(s.price*.75)*0.05)}</button>`
            :`<button class="btn btn-sm btn-out" ${mortgageLocked?"disabled":""} onclick="ga('mortgage',{position:${s.pos}})">Mortgage ${CUR()}${Math.floor(s.price*.75)}</button>`}
        </div>`;
      }).join("")}
    </div>
    <button class="btn btn-out" style="width:100%;margin-top:.55rem" onclick="cm('m-mort')">Close</button>`;
  om("m-mort");
}

/* ─── WIN SCREEN (overridden below) ────────────────── */

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
  const{players,settings,mapConfig}=lobbyData;
  const isHost=players.find(p=>p.id===myId)?.isHost;
  const activeLobbyPlayers=players.filter(p=>!p.isSpectator&&!p.disconnected).length;
  _isLobbyHost=!!isHost;
  if(qid("start-btn")){
    if(isHost){
      qid("start-btn").style.display="block";
      qid("start-btn").disabled=activeLobbyPlayers<2;
      qid("start-btn").title=activeLobbyPlayers<2?"Need at least 2 players":"Start game";
      qid("start-btn").style.opacity=activeLobbyPlayers<2?".55":"1";
      qid("start-btn").style.cursor=activeLobbyPlayers<2?"not-allowed":"pointer";
    }else{
      qid("start-btn").style.display="none";
    }
  }
  const startMinNote=qid("lobby-start-min-note");
  if(startMinNote){
    const minimumPlayers=2;
    const isReady=activeLobbyPlayers>=minimumPlayers;
    startMinNote.textContent=`Players: ${activeLobbyPlayers}/${minimumPlayers} minimum to start`;
    startMinNote.style.color=isReady?"var(--ok)":"var(--warn)";
    startMinNote.style.fontWeight="700";
    startMinNote.title=isHost
      ?(isReady?"You can start the game":"Need at least 2 active players to start")
      :(isReady?"Host can start now":"Waiting for at least 2 active players");
  }
  const rulesBtn=qid("rules-btn");
  if(rulesBtn){
    rulesBtn.disabled=false;
    rulesBtn.style.opacity="1";
    rulesBtn.style.cursor="pointer";
    rulesBtn.title=isHost?"Edit game rules":"View game rules";
  }
  
  // Update room code display
  const codeDisplay=qid("room-code-display-lobby");
  if(codeDisplay)codeDisplay.textContent=myRoomId||lobbyData.roomId||"—";
  
  qid("lobby-players").innerHTML=players.map(p=>{
    const avImg=drawAvatarSVG(p.avatar||{},38);
    return`<div style="display:flex;align-items:center;gap:.5rem;padding:.38rem;border-radius:7px;border:1px solid ${p.isHost?"var(--accent)":"var(--border)"}">
      <img src="${avImg}" width="38" height="38" style="border-radius:50%;border:2px solid ${p.color}">
      <span style="font-weight:700;color:${p.color}">${p.name}</span>
      ${p.isHost?`<span style="font-size:.65rem;background:var(--accent);color:#000;padding:.1rem .35rem;border-radius:8px;font-weight:700">HOST</span>`:""}
    </div>`;
  }).join("");
  qid("lobby-settings").innerHTML=`<div style="font-size:.78rem;line-height:1.9">
    <div style="margin-bottom:.6rem;padding-bottom:.6rem;border-bottom:1px solid var(--border)">
      <div style="font-weight:700;margin-bottom:.3rem">🔐 ${settings.privateRoom?"🔒 Private Room":"🌐 Public Room"}</div>
      <div style="font-size:.7rem;color:var(--text)">Room Code: <span style="font-family:monospace;font-weight:700;color:var(--accent);background:var(--bg);padding:0.1rem 0.4rem;border-radius:4px">${myRoomId||lobbyData.roomId||"—"}</span></div>
    </div>
    <div>💰 Start: ${settings.currency}${settings.startingCash}</div>
    <div>🚀 GO: ${settings.currency}${settings.goSalary}</div>
    <div>⭐ START Bonus: ${settings.startTileBonusPercent||0}%</div>
    <div>🏦 Loan: ${settings.loanRate}%/round</div>
    <div>🔨 Auction: ${settings.auctionMode||"none"}</div>
  </div>`;

  renderMiniBoard("lobby-board-preview", mapConfig?.spaces||[], mapConfig?.tilesPerSide||9);
  const boardProps=(mapConfig?.spaces||[]).filter(s=>s.type==="property");
  const countries=[...new Set(boardProps.map(s=>s.countryName).filter(Boolean))];
  if(qid("lobby-board-info"))qid("lobby-board-info").textContent=`${(mapConfig?.spaces||[]).length||0} tiles · ${countries.length} countries`;

  const requestBtn=qid("lobby-request-btn");
  const applyBtn=qid("lobby-apply-btn");
  if(requestBtn)requestBtn.style.display=isHost?"none":"inline-flex";
  if(applyBtn)applyBtn.style.display=isHost?"inline-flex":"none";
  lobbyRefreshChangeOptions();

  const reqs=lobbyData.boardChangeRequests||[];
  const reqWrap=qid("lobby-change-requests");
  if(reqWrap){
    if(!reqs.length){
      reqWrap.innerHTML="<div style='font-size:.72rem;color:var(--muted)'>No pending change requests.</div>";
    }else{
      reqWrap.innerHTML=reqs.slice(0,8).map(r=>`<div style="display:flex;align-items:center;gap:.35rem;border:1px solid var(--border);border-radius:8px;padding:.28rem .42rem;margin-bottom:.25rem;font-size:.72rem">
        <span style="color:var(--muted)">${r.byName}</span>
        <span><b>${r.kind}</b>: ${r.from} → ${r.to}</span>
        ${isHost?`<button class='btn btn-sm btn-acc' style='margin-left:auto' onclick='applyRequestedBoardChange("${r.id}","${r.kind}","${String(r.from||"").replace(/"/g,"&quot;")}","${String(r.to||"").replace(/"/g,"&quot;")}")'>Apply</button>`:""}
      </div>`).join("");
    }
  }
}

function renderMiniBoard(containerId, spaces, size){
  const el=qid(containerId);if(!el)return;
  const board=Array.isArray(spaces)?spaces:[];
  const S=Math.max(6,Math.min(parseInt(size||9),9));
  if(!board.length){el.innerHTML="<span>No board data yet</span>";return;}
  const dim=S+2;
  const tileHtml=(sp)=>{
    if(sp.type==="property"){
      const cc=(sp.countryCode||"").toLowerCase();
      const city=sanitize(sp.name||"City",32);
      const country=getCountryName(sp);
      return `<div class="mini-prop-wrap"><div class="mini-city" title="${city}">${city}</div><div class="mini-country" title="${country}">${country}</div></div>`;
    }
    const specialIcon={
      go:"🚀",jail:"⛓️",free_parking:"💰",go_to_jail:"👮",
      airport:"✈️",railway:"🚂",chance:"❓",chest:"📦",
      income_tax:"💸",luxury_tax:"🏙️",tax_return:"💵",property_tax:"🏠",gains_tax:"📈",gov_prot:"🏛️"
    }[sp.type]||"•";
    const label=sanitize(sp.name||sp.type||"tile",20);
    return `<div class="mini-special-wrap"><span class="mini-special-ico">${specialIcon}</span><span class="mini-special-name" title="${label}">${label}</span></div>`;
  };
  const mini=board.map(sp=>{
    const gp=gridPos(sp.pos,S);
    return `<div class='mini-tile mini-${sp.type||"tile"}' style='grid-column:${gp.col};grid-row:${gp.row}' title='${sanitize(sp.name||"",60)}'>${tileHtml(sp)}</div>`;
  }).join("");
  el.innerHTML=`<div class='mini-board' style='--mini-grid:${dim}'>${mini}</div>`;
}

function lobbyRefreshChangeOptions(){
  if(!_wwCountries.length && !_loadingCountriesPromise){
    loadCountries().then(()=>lobbyRefreshChangeOptions());
  }
  const spaces=getLobbyBoardSpaces();
  const kind=qid("lobby-change-kind")?.value||"country";
  const fromSel=qid("lobby-change-from");
  const toSel=qid("lobby-change-to");
  if(!fromSel||!toSel)return;
  const prevFrom=fromSel.value;
  const prevTo=toSel.value;
  const props=spaces.filter(s=>s.type==="property");
  if(!props.length){fromSel.innerHTML="";toSel.innerHTML="";return;}

  if(kind==="country"){
    const current=[...new Map(props.filter(p=>p.countryCode&&p.countryName).map(p=>[p.countryCode,{code:p.countryCode,name:p.countryName}])).values()];
    const all=[...new Map(_wwCountries.map(c=>[c.code,c])).values()];
    fromSel.innerHTML=current.map(c=>`<option value="${escHtml(c.code)}">${escHtml(c.name)}</option>`).join("");
    toSel.innerHTML=all.map(c=>`<option value="${escHtml(c.code)}">${escHtml(c.name)}</option>`).join("");
    if(prevFrom && [...fromSel.options].some(o=>o.value===prevFrom))fromSel.value=prevFrom;
    if(prevTo && [...toSel.options].some(o=>o.value===prevTo))toSel.value=prevTo;
    return;
  }

  const cities=props.map(p=>({name:p.name,countryCode:p.countryCode,countryName:p.countryName}));
  fromSel.innerHTML=cities.map(c=>`<option value="${escHtml(c.name)}">${escHtml(c.name)}</option>`).join("");
  if(prevFrom && [...fromSel.options].some(o=>o.value===prevFrom))fromSel.value=prevFrom;
  const chosen=fromSel.value||cities[0].name;
  const source=props.find(p=>p.name===chosen);
  let options=[];
  if(source?.countryCode){
    const country=(
      _wwCountries.find(c=>c.code===source.countryCode)||
      _wwCountries.find(c=>c.name===source.countryName)
    );
    options=(country?.cities||[]).filter(c=>c!==chosen);
  }
  if(!options.length&&source?.countryCode){
    options=props.filter(p=>String(p.countryCode||"").toLowerCase()===String(source.countryCode||"").toLowerCase()&&p.name!==chosen).map(p=>p.name);
  }
  if(!options.length){
    options=_wwCountries.flatMap(c=>c.cities||[]).filter(c=>c!==chosen);
  }
  options=[...new Set(options)];
  toSel.innerHTML=options.map(c=>`<option value="${escHtml(c)}">${escHtml(c)}</option>`).join("");
  if(prevTo && [...toSel.options].some(o=>o.value===prevTo))toSel.value=prevTo;
}

function requestLobbyBoardChange(){
  const kind=qid("lobby-change-kind")?.value;
  const from=qid("lobby-change-from")?.value;
  const to=qid("lobby-change-to")?.value;
  if(!kind||!from||!to){toast("Choose change type/from/to first");return;}
  socket.emit("request_board_change",{kind,from,to});
}

function applyLobbyBoardChange(){
  if(!_isLobbyHost){toast("Only host can apply changes.");return;}
  const kind=qid("lobby-change-kind")?.value;
  const from=qid("lobby-change-from")?.value;
  const to=qid("lobby-change-to")?.value;
  if(!kind||!from||!to){toast("Choose change type/from/to first");return;}
  socket.emit("apply_board_change",{kind,from,to});
}

function applyRequestedBoardChange(requestId,kind,from,to){
  if(!_isLobbyHost)return;
  socket.emit("apply_board_change",{requestId,kind,from,to});
}

function openLobbyPlayersModal(){
  const src=qid("lobby-players");
  const dst=qid("lobby-players-view");
  if(!src||!dst){toast("Players list unavailable right now.");return;}
  dst.innerHTML=src.innerHTML||"<div style='font-size:.78rem;color:var(--muted)'>No players yet.</div>";
  om("m-lobby-players");
}

function openLobbySettingsModal(){
  const src=qid("lobby-settings");
  const dst=qid("lobby-settings-view");
  if(!src||!dst){toast("Settings unavailable right now.");return;}
  dst.innerHTML=src.innerHTML||"<div style='font-size:.78rem;color:var(--muted)'>No settings loaded.</div>";
  om("m-lobby-settings");
}

function openSetup(){
  if(!lobbyData)return;
  const s=lobbyData.settings;
  function num(k,label,mi,mx,step=50){return`<div style="display:flex;align-items:center;justify-content:space-between;padding:.22rem 0;font-size:.8rem;gap:.4rem"><span>${label}</span><input type="number" value="${s[k]}" min="${mi}" max="${mx}" step="${step}" onchange="us('${k}',+this.value)" class="inp" style="width:75px;font-size:.75rem;padding:.25rem .4rem"></div>`;}
  function tgl(k,label){return`<div style="display:flex;align-items:center;justify-content:space-between;padding:.22rem 0;font-size:.8rem"><span>${label}</span><label class="toggle-sw sm"><input type="checkbox" ${s[k]?"checked":""} onchange="us('${k}',this.checked)"><span class="toggle-knob"></span></label></div>`;}
  function jailRentTgl(){return`<div style="display:flex;align-items:center;justify-content:space-between;padding:.22rem 0;font-size:.8rem"><span>Collect Rent in Jail</span><label class="toggle-sw sm"><input type="checkbox" ${!s.noRentInJail?"checked":""} onchange="us('noRentInJail',!this.checked)"><span class="toggle-knob"></span></label></div>`;}
  const CURRENCIES=[["$","USD — Dollar"],["€","EUR — Euro"],["£","GBP — Pound"],["¥","JPY — Yen"],["₹","INR — Rupee"],["₩","KRW — Won"],["₽","RUB — Ruble"],["R$","BRL — Real"],["A$","AUD — Dollar"],["C$","CAD — Dollar"],["₺","TRY — Lira"],["₦","NGN — Naira"],["฿","THB — Baht"],["Rp","IDR — Rupiah"],["₱","PHP — Peso"]];
  function cur_sel(){return`<div style="display:flex;align-items:center;justify-content:space-between;padding:.22rem 0;font-size:.8rem;gap:.4rem"><span>Currency</span><select onchange="us('currency',this.value)" class="inp" style="font-size:.75rem;padding:.2rem .35rem;width:auto">${CURRENCIES.map(([sym,lbl])=>`<option value="${sym}" ${s.currency===sym?"selected":""}>${sym} ${lbl}</option>`).join("")}</select></div>`;}
  qid("setup-c").innerHTML=`
    <div class="stabs"><button class="stab on" onclick="stab('gen',this)">General</button><button class="stab" onclick="stab('tax',this)">Tax</button><button class="stab" onclick="stab('bank',this)">Bank</button></div>
    <div id="st-gen" class="ssec on">${cur_sel()}${num("startingCash","Start Cash",500,5000)}${num("goSalary","GO Salary",50,1000,50)}${num("startTileBonusPercent","START Bonus %",0,300,10)}${num("maxPlayers","Max Players",2,8,1)}${tgl("treasurePot","Treasure")}${jailRentTgl()}${tgl("doubleRentOnSet","2× Rent on Full Set")}${tgl("evenBuild","Even Build")}${tgl("mortgageEnabled","Mortgage System")}${tgl("auctionMode","Auction on Unbought Property")}</div>
    <div id="st-tax" class="ssec">${num("incomeTaxRate","Income Tax %",0,50,1)}${num("propertyTaxRate","Property Tax %",0,20,1)}${num("gainsTaxRate","Gains Tax %",0,50,1)}${num("randomTaxMultiplier","Random Tax ×",1,50,1)}${num("taxReturnRate","Tax Return %",0,100,5)}</div>
    <div id="st-bank" class="ssec">${num("depositRate","Deposit Rate %",0,20,1)}${num("loanRate","Loan Rate %",0,30,1)}${num("creditCardFee","CC Fee",0,200,10)}${num("creditCardLimit","CC Limit",100,2000,100)}${num("insurancePremium","Insurance Premium",0,200,10)}${num("insurancePayout","Insurance Payout %",0,100,5)}</div>`;
  if(!_isLobbyHost){
    qid("setup-c")?.querySelectorAll("input,select,button.stab").forEach(el=>{el.disabled=true;});
    toast("👀 Rules view only");
  }
  om("m-setup");
}
function stab(id,btn){document.querySelectorAll(".stab").forEach(b=>b.classList.remove("on"));document.querySelectorAll(".ssec").forEach(s=>s.classList.remove("on"));btn.classList.add("on");qid("st-"+id).classList.add("on");}
function us(k,v){if(!_isLobbyHost){toast("Only host can change rules.");return;}socket.emit("update_settings",{settings:{[k]:v}});}

/* ─── BOARD SELECT ───────────────────────────────────────── */
let _wwCountries=[];
async function loadCountries(){
  if(_wwCountries.length)return;
  if(_loadingCountriesPromise){await _loadingCountriesPromise;return;}
  _loadingCountriesPromise=(async()=>{
    try{
      const keys=Object.keys(COUNTRY_DATA);
      _wwCountries=keys.map((key,idx)=>({
        code:COUNTRY_DATA[key].iso,
        name:key.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()),
        tier:Math.floor(idx/5)+1,
        cities:[...COUNTRY_DATA[key].cities],
      }));
    }catch(e){console.warn("Countries load failed",e);}finally{_loadingCountriesPromise=null;}
  })();
  await _loadingCountriesPromise;
}

function goBoardSelect(){
  if(!ENABLE_BOARD_SELECT_UI){
    toast("⚠️ Board selection is disabled for now.");
    return;
  }
  const nm=qid("cr-name")?.value.trim();
  if(qid("bs-name"))qid("bs-name").value=nm||"";
  ss("boards");generateSeed();updateBoardPreview();
}

function setBoardType(t,btn){
  curBoardType=t;
  document.querySelectorAll(".bttab").forEach(b=>b.classList.remove("on"));
  btn.classList.add("on");
  const randomPanel=qid("random-panel");
  const worldwidePanel=qid("worldwide-panel");
  if(randomPanel)randomPanel.style.display=t==="random"?"block":"none";
  if(worldwidePanel)worldwidePanel.style.display=t==="worldwide"?"block":"none";
  if(t==="worldwide")renderWorldwidePanel();
  updateBoardPreview();
}
function setSize(s,btn){curSize=Math.max(6,Math.min(parseInt(s||9),9));document.querySelectorAll(".szb").forEach(b=>b.classList.remove("on"));btn.classList.add("on");updateBoardPreview();}
function setRMode(m,btn){curRMode=m;document.querySelectorAll(".rmode-btn").forEach(b=>b.classList.remove("on"));btn.classList.add("on");updateBoardPreview();}
function generateSeed(){
  const prev=(qid("seed-inp")?.value||curSeed||"").toUpperCase();
  let next=prev;
  for(let i=0;i<5&&next===prev;i++)next=Math.random().toString(36).slice(2,8).toUpperCase();
  curSeed=next||Math.random().toString(36).slice(2,8).toUpperCase();
  if(qid("seed-inp"))qid("seed-inp").value=curSeed;
  if(qid("seed-display"))qid("seed-display").textContent=`Seed: ${curSeed}`;
}
function rerollSeed(){generateSeed();updateBoardPreview();}
function randomizeBoard(){
  if(curBoardType!=="random"){
    toast("⚠️ Select Random board first");
    return;
  }
  rerollSeed();
  toast("🔀 Board randomized");
}
async function getSelectionPreviewBoard(){
  const wwSig=curBoardType==="worldwide"
    ? Object.entries(wwSelectedCities)
        .filter(([,cities])=>Array.isArray(cities)&&cities.length)
        .map(([code,cities])=>`${code}:${[...cities].sort().join(",")}`)
        .sort()
        .join("|")
    : "";
  const cacheKey=`${curBoardType}|${curSize}|${curRMode}|${qid("seed-inp")?.value||curSeed}|${wwSig}`;
  if(_boardPreviewCache[cacheKey])return _boardPreviewCache[cacheKey];
  let data={board:[],tilesPerSide:curSize};
  if(curBoardType==="random"){
    const s=(qid("seed-inp")?.value||curSeed||"").toUpperCase();
    const r=await fetch(`/mapi/random-board?seed=${encodeURIComponent(s)}&mode=${encodeURIComponent(curRMode)}&S=${curSize}`);
    data=await r.json();
  }else if(["india","uk","usa"].includes(curBoardType)){
    const r=await fetch(`/mapi/domestic-board?preset=${curBoardType}&S=${curSize}`);
    data=await r.json();
  }else if(curBoardType==="worldwide"){
    const selected=[];
    for(const[code,cities]of Object.entries(wwSelectedCities)){
      if(cities.length){
        const c=_wwCountries.find(x=>x.code===code);
        if(c)selected.push({...c,cities});
      }
    }
    if(selected.length){
      const r=await fetch('/mapi/worldwide-board',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({S:curSize,wwCities:selected})
      });
      data=await r.json();
    }else{
      const r=await fetch(`/mapi/default-board?S=${curSize}`);
      data=await r.json();
    }
  }else{
    const r=await fetch(`/mapi/default-board?S=${curSize}`);
    data=await r.json();
  }
  _boardPreviewCache[cacheKey]=data;
  return data;
}
async function updateBoardPreview(){
  const t=4*(curSize+1);
  const labels={
    standard:"🌍 Standard World",
    worldwide:"🗺️ Worldwide Custom",
    random:"🎲 Random",
    india:"India",
    uk:"UK",
    usa:"USA"
  };
  if(qid("board-preview"))qid("board-preview").innerHTML=`<span>${labels[curBoardType]||""}<br>${t} tiles</span>`;
  if(qid("board-info"))qid("board-info").textContent=`${t} tiles · 4 airports · 4 railways`;
  try{
    const d=await getSelectionPreviewBoard();
    renderMiniBoard("board-size-preview",d.board,d.tilesPerSide||curSize);
  }catch{
    if(qid("board-size-preview"))qid("board-size-preview").innerHTML="<span>Preview unavailable</span>";
  }
}

async function renderWorldwidePanel(){
  const el=qid("ww-country-list");if(!el)return;
  el.innerHTML=`<div style="padding:.55rem .6rem;color:var(--muted);font-size:.75rem">Loading countries…</div>`;
  await loadCountries();
  if(!_wwCountries.length){
    el.innerHTML=`<div style="padding:.55rem .6rem;color:var(--red);font-size:.75rem">Could not load countries. Please retry.</div>`;
    if(qid("ww-count"))qid("ww-count").textContent="0 cities";
    return;
  }
  el.innerHTML=_wwCountries.map(c=>`
    <div class="country-row">
      <div class="country-hdr" onclick="toggleWWCountry('${c.code}')">
        <span class="country-icon-slot" data-iso="${c.code}"></span>
        <span class="country-name">${c.name}</span>
        <span class="country-tier">Tier ${c.tier}</span>
        <span class="country-arrow" id="warr-${c.code}">▶</span>
      </div>
      <div class="country-cities" id="wcities-${c.code}" style="display:none">
        ${c.cities.map(city=>`<span class="city-chip ${(wwSelectedCities[c.code]||[]).includes(city)?"sel":""}" onclick="toggleWWCity('${c.code}','${city}',this)">${city}</span>`).join("")}
        <div style="margin-top:.28rem;display:flex;gap:.2rem">
          <button type="button" class="btn btn-sm btn-out" style="font-size:.62rem" onclick="event.stopPropagation();wwSelectCountry('${c.code}')">All</button>
          <button type="button" class="btn btn-sm btn-out" style="font-size:.62rem" onclick="event.stopPropagation();wwClearCountry('${c.code}')">None</button>
        </div>
      </div>
    </div>`).join("");
  el.querySelectorAll(".country-icon-slot").forEach(slot=>{
    const iso=slot.getAttribute("data-iso")||"";
    slot.innerHTML="";
    if(iso)slot.appendChild(createFlagElement(iso));
  });
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
function _waitForConnect(timeoutMs=5000){
  if(socket?.connected)return Promise.resolve(true);
  return new Promise(resolve=>{
    const tid=setTimeout(()=>resolve(false),timeoutMs);
    socket?.once("connect",()=>{clearTimeout(tid);resolve(true);});
    if(!socket?.connected)socket?.connect();
  });
}

async function createRoom(){
  if(!socket){toast("⚠️ Initializing…");setTimeout(createRoom,800);return;}
  if(!socket.connected){
    const btn=qid("create-btn");
    if(btn){btn.disabled=true;btn.textContent="Connecting…";}
    const ok=await _waitForConnect(5000);
    if(!ok){
      if(btn){btn.disabled=false;btn.textContent="▶ Create Game";}
      toast("❌ Cannot reach server — check your connection.");return;
    }
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
  const isPublic=(qid("bs-privacy")?.value||"public")==="public";
  let mapConfig=null;

  if(customSpaces){
    // From editor
    mapConfig={spaces:customSpaces,tilesPerSide:editorSize,name:"Custom Map",settings:editorSettings};
  }else if(curBoardType==="random"){
    const s=(qid("seed-inp")?.value||curSeed).toUpperCase();
    try{
      const r=await fetch(`/mapi/random-board?seed=${s}&mode=${curRMode}&S=${curSize}`);
      const d=await r.json();
      mapConfig={spaces:d.board,tilesPerSide:curSize,name:`Random #${d.seed}`,seed:d.seed,settings:{}};
    }catch{toast("❌ Error generating board");return;}
  }else if(curBoardType==="worldwide"){
    const selected=[];
    for(const[code,cities]of Object.entries(wwSelectedCities)){
      if(cities.length){const c=_wwCountries.find(x=>x.code===code);if(c)selected.push({...c,cities});}
    }
    if(!selected.length){toast("⚠️ Select at least one city");return;}
    try{
      const r=await fetch('/mapi/worldwide-board',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({S:curSize,wwCities:selected})
      });
      const d=await r.json();
      mapConfig={spaces:d.board,name:"Worldwide Custom",tilesPerSide:curSize,preset:"worldwide",wwCities:selected,settings:{}};
    }catch{toast("❌ Error generating worldwide board");return;}
  }else if(["india","uk","usa"].includes(curBoardType)){
    try{
      const r=await fetch(`/mapi/domestic-board?preset=${curBoardType}&S=${curSize}`);
      const d=await r.json();
      mapConfig={spaces:d.board,tilesPerSide:curSize,name:curBoardType.toUpperCase(),settings:{}};
    }catch{toast("❌ Error generating board");return;}
  }else{
    try{
      const r=await fetch(`/mapi/default-board?S=${curSize}`);
      const d=await r.json();
      mapConfig={spaces:d.board,name:"Standard World",tilesPerSide:curSize,preset:"standard",settings:{}};
    }catch{
      mapConfig={name:"Standard World",tilesPerSide:curSize,preset:"standard",settings:{}};
    }
  }
  socket.emit("create_room",{playerName:nm,mapConfig,isPublic,avatar:myAvatar});
}

function joinRoom(){
  if(!socket?.connected){toast("⚠️ Not connected");return;}
  const code=qid("jr-code")?.value.trim().toUpperCase();
  if(!code){toast("Enter a room code");return;}
  // Check if this is a reconnect attempt by looking for stored myId/myRoomId for this room
  let playerId = undefined;
  try {
    const stored = localStorage.getItem("mono_game_session");
    if (stored) {
      const session = JSON.parse(stored);
      if (session.roomId === code && session.playerId) {
        playerId = session.playerId;
      }
    }
  } catch(e) {}
  socket.emit("join_room",{roomId:code,playerName:(qid("jr-name")?.value||"Player").trim(),avatar:myAvatar,playerId});
}
function quickMatch(){
  if(!socket?.connected){toast("⚠️ Not connected");return;}
  socket.emit("quick_match",{playerName:(qid("qm-name")?.value||"Player").trim(),avatar:myAvatar});
  toast("⚡ Finding a game…");
}
function copyLink(){
  const roomCode=(myRoomId||lobbyData?.roomId||"").trim();
  if(!roomCode){toast("⚠️ No room code yet");return;}
  const link=`${location.origin}/room/${roomCode}`;
  navigator.clipboard.writeText(link)
    .then(()=>toast("🔗 Link copied!"))
    .catch(()=>toast("❌ Could not copy"));
}
function copyRoomCode(){
  const roomCode=(myRoomId||lobbyData?.roomId||"").trim();
  if(!roomCode){toast("⚠️ No room code yet");return;}
  navigator.clipboard.writeText(roomCode)
    .then(()=>toast("📌 Room code copied!"))
    .catch(()=>toast("❌ Could not copy"));
}
function startGame(){
  const players=lobbyData?.players||[];
  const activeLobbyPlayers=players.filter(p=>!p.isSpectator&&!p.disconnected).length;
  if(activeLobbyPlayers<2){toast("⚠️ Need at least 2 players to start.");return;}
  socket.emit("start_game");
}

async function browseRooms(){await refreshBrowse();om("m-browse");browseInterval=setInterval(refreshBrowse,5000);}
function closeBrowse(){cm("m-browse");clearInterval(browseInterval);browseInterval=null;}
async function refreshBrowse(){
  try{
    const rooms=await(await fetch("/mapi/rooms")).json();
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

async function rollDice(){
  if(_diceRolling)return;
  const isMT=gs?.players?.[gs.currentPlayerIdx]?.id===myId;
  if(gs?.phase!=="roll"||!isMT)return;
  _diceRolling=true;
  _awaitingServerRoll=true;
  ga("roll");
  setTimeout(()=>{
    if(_awaitingServerRoll){
      _awaitingServerRoll=false;
      _diceRolling=false;
    }
  },4000);
}
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
async function openEditorFromCreate(){
  if(!ENABLE_MAP_EDITOR_UI){
    toast("⚠️ Map editor is disabled for now.");
    return;
  }
  const playerName=qid("cr-name")?.value.trim();
  if(!playerName){
    toast("⚠️ Please enter your name first");
    return;
  }
  await openEditor();
  // Auto-fill editor name with Create Room name
  if(qid("ed-name"))qid("ed-name").value=playerName;
}

async function openEditor(){
  if(!ENABLE_MAP_EDITOR_UI){
    toast("⚠️ Map editor is disabled for now.");
    return;
  }
  ss("editor");
  if(!editorCountries.length){
    const pool=qid("editor-country-pool");
    if(pool)pool.innerHTML=`<div style="padding:1.2rem;text-align:center;color:var(--muted)"><div class="spin-ring" style="width:26px;height:26px;margin:0 auto .5rem;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite"></div>Loading countries…</div>`;
    let loaded=false;
    for(let attempt=0;attempt<3;attempt++){
      try{
        const res=await fetch("/mapi/countries");
        if(!res.ok)throw new Error("status "+res.status);
        editorCountries=await res.json();
        loaded=true;break;
      }catch(e){
        if(attempt<2)await sleep(800);
      }
    }
    if(!loaded){
      if(pool)pool.innerHTML=`<div style="padding:1rem;text-align:center;color:var(--red)">❌ Could not load countries. Is the server running?<br><button class="btn btn-sm btn-out" style="margin-top:.5rem" onclick="openEditor()">Retry</button></div>`;
      return;
    }
  }
  editorRenderCountryPool();
  editorRenderBoard();
  // Initialize size display and enhancements hint
  setTimeout(()=>editorSetSize(editorSize),50);
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
      return`<div class="ed-city-chip${active?" active":""}" draggable="true" data-code="${c.code}" data-idx="${i}" onclick="editorToggleCity('${c.code}',${i})" title="${active?"Remove from":"Drag to place"} ${city}">
        <span class="ed-city-name">${city}</span>
        <span class="ed-city-price">${CUR()}${price}</span>
      </div>`;
    }).join("");
    return`<div class="ed-country-row${onBoard?" on-board":""}" data-name="${c.name}" data-cities="${c.cities.join(",")}" id="ecp-${c.code}">
      <div class="ed-country-hdr" onclick="editorToggleCountry('${c.code}')">
        <span class="ed-country-icon" data-iso="${c.code}"></span>
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
  el.querySelectorAll(".ed-country-icon").forEach(slot=>{
    const row=slot.closest(".ed-country-row");
    if(!row)return;
    const code=row.id.replace("ecp-","");
    slot.innerHTML="";
    slot.appendChild(createFlagElement(code));
  });
  // Attach drag listeners to all chips via delegation on the pool container
  el.addEventListener("dragstart",_edPoolDragStart,{capture:true});
  el.addEventListener("dragend",_edPoolDragEnd,{capture:true});
}
function _edPoolDragStart(e){
  const chip=e.target.closest(".ed-city-chip");if(!chip)return;
  editorPoolDragData={countryCode:chip.dataset.code,cityIndex:+chip.dataset.idx};
  editorDragSrc=null;
  e.dataTransfer.effectAllowed="copy";
  e.dataTransfer.setData("text/plain","pool:"+chip.dataset.code+":"+chip.dataset.idx);
  chip.classList.add("dragging");
  setTimeout(()=>{
    document.querySelectorAll(".ed-tile.ed-empty,.ed-tile.ed-prop").forEach(t=>t.classList.add("drop-hint"));
  },0);
}
function _edPoolDragEnd(e){
  const chip=e.target.closest(".ed-city-chip");if(chip)chip.classList.remove("dragging");
  editorPoolDragData=null;
  document.querySelectorAll(".ed-tile").forEach(t=>t.classList.remove("drop-hint","drag-over"));
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
    // Check country tile limit (max 3 tiles per country)
    const countryCount = editorBoard.filter(s => s.countryCode === code).length;
    const maxTiles = 3;  // Cap at 3 tiles per country
    if (countryCount >= maxTiles) {
      toast(`⚠️ ${c.name} already has ${maxTiles} tile(s). Maximum 3 tiles per country.`);
      return;
    }
    
    const slots=editorGetFreeSlots(1);
    if(!slots.length){toast("⚠️ No free slots on board");return;}
    const slot=slots[0];
    editorBoard.push({pos:slot,type:"property",group:`g${Math.floor(slot/(editorSize+1))%8}`,
      name:city,countryCode:c.code,iso:c.code,countryName:c.name,
      price,rents:calcTieredRents(price),
      houseCost:Math.max(50,Math.floor(price*.5)),houses:0,owner:null,mortgaged:false});
    toast(`➕ Added ${city} — ${CUR()}${price}`);
  }
  editorRenderCountryPool();
  editorRenderBoard();
}

function editorAddAllCities(code){
  const c=editorCountries.find(x=>x.code===code);if(!c)return;
  const maxTiles = 3;  // Cap per country
  const alreadyAdded=editorBoard.filter(s=>s.countryCode===code).map(s=>s.name);
  const currentCount = alreadyAdded.length;
  
  if (currentCount >= maxTiles) {
    toast(`⚠️ ${c.name} already has ${maxTiles} tile(s). Cannot add more.`);
    return;
  }
  
  const maxToAdd = maxTiles - currentCount;  // How many more can be added
  const toAdd=c.cities.filter(city=>!alreadyAdded.includes(city)).slice(0, maxToAdd);
  
  if(!toAdd.length){toast(`All available ${c.name} cities already on board`);return;}
  const slots=editorGetFreeSlots(toAdd.length);
  toAdd.forEach((city,i)=>{
    if(!slots[i])return;
    const cityIndex=c.cities.indexOf(city);
    const price=c.base+cityIndex*10;
    editorBoard=editorBoard.filter(s=>s.pos!==slots[i]);
    editorBoard.push({pos:slots[i],type:"property",group:`g${Math.floor(slots[i]/(editorSize+1))%8}`,
      name:city,countryCode:c.code,iso:c.code,countryName:c.name,
      price,rents:calcTieredRents(price),
      houseCost:Math.max(50,Math.floor(price*.5)),houses:0,owner:null,mortgaged:false});
  });
  toast(`➕ Added ${toAdd.length} cities from ${c.name} (max ${maxTiles} tiles per country)`);
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
  const S=editorSize,total=4*(S+1);
  const board=buildEditorFullBoard(S);
  const free=[];
  for(let i=1;i<total;i++){
    if(board[i]&&board[i].type==="empty")free.push(i);
  }
  return free.slice(0,n);
}

/* ─── EDITOR BOARD RENDER ────────────────────────────────── */
function editorRenderBoard(){
  const el=qid("editor-board");if(!el)return;
  const S=editorSize,C=S+1,total=4*C;
  el.style.cssText=`grid-template-columns:70px repeat(${S},40px) 70px;grid-template-rows:70px repeat(${S},40px) 70px`;
  el.innerHTML="";
  const board=buildEditorFullBoard(S);
  const ICONS={airport:"✈️",railway:"🚂",gov_prot:"🏛️",chest:"📦",chance:"❓",income_tax:"💰",property_tax:"🏠",gains_tax:"📈",luxury_tax:"🏙️",tax_return:"$",empty:"·"};

  board.forEach((sp,pos)=>{
    const{col,row}=gridPos(pos,S);
    const side=sideOf(pos,S);
    const isCorner=[0,C,2*C,3*C].includes(pos);
    const div=document.createElement("div");
    const typeClass=sp.type==="property"?" ed-prop":sp.type==="empty"?" ed-empty":sp.type==="airport"?" ed-airport":sp.type==="railway"?" ed-rail":sp.type==="tax_return"?" ed-taxret":"";
    div.className=`ed-tile ed-tile-${side}${isCorner?" ed-corner":""}${typeClass}`;
    div.dataset.pos=pos;div.style.cssText=`grid-column:${col};grid-row:${row}`;
    div.onclick=()=>showEditorPropPopup(sp,pos);

    if(isCorner){
      const labels={0:"🚀\nSTART",[C]:"⛓️\nJAIL",[C*2]:"💰\nTREASURE",[C*3]:"👮\nGO\nJAIL"};
      div.innerHTML=`<div class="ed-corner-in">${labels[pos]||""}</div>`;
    }else{
      const gi=sp.group?parseInt(sp.group.slice(1)):-1;
      const gc=gi>=0?GRP_COLORS[gi]:null;
      let icon=ICONS[sp.type]||"";
      if(!icon&&sp.countryCode){
        icon="<span class=\"ed-icon-slot\" data-iso=\""+sp.countryCode+"\"></span>";
      }
      if(!icon)icon="🏙️";
      if(gc)div.style.setProperty("--ed-grp-color",gc);
      const nameText=sp.type==="empty"?"":sp.name||"";
      div.innerHTML=`<div class="ed-tile-inner"><span class="ed-icon">${icon}</span>${nameText?`<span class="ed-nm">${nameText}</span>`:""}${sp.price?`<span class="ed-price">${CUR()}${sp.price}</span>`:""}</div>`;
      div.querySelectorAll(".ed-icon-slot").forEach(slot=>{
        const iso=slot.getAttribute("data-iso")||"";
        slot.innerHTML="";
        if(iso)slot.appendChild(createFlagElement(iso));
      });

      // All empty + property tiles accept drops (from pool or from board)
      const isDroppable=sp.type==="empty"||sp.type==="property";
      if(isDroppable){
        div.addEventListener("dragenter",e=>{e.preventDefault();div.classList.add("drag-over");});
        div.addEventListener("dragover",e=>{e.preventDefault();e.dataTransfer.dropEffect=editorPoolDragData?"copy":"move";div.classList.add("drag-over");});
        div.addEventListener("dragleave",e=>{if(!div.contains(e.relatedTarget))div.classList.remove("drag-over");});
        div.addEventListener("drop",e=>{
          e.preventDefault();div.classList.remove("drag-over");
          document.querySelectorAll(".ed-tile").forEach(t=>t.classList.remove("drop-hint","drag-over"));
          if(editorPoolDragData){
            // Place city from pool onto this slot
            editorPoolDropOnBoard(editorPoolDragData.countryCode,editorPoolDragData.cityIndex,pos);
            editorPoolDragData=null;
          }else if(editorDragSrc!==null&&editorDragSrc!==pos){
            const srcSp=editorBoard.find(s=>s.pos===editorDragSrc);
            if(srcSp){
              if(sp.type==="empty"){
                srcSp.pos=pos;
              }else{
                const dstSp=editorBoard.find(s=>s.pos===pos);
                if(dstSp)[srcSp.pos,dstSp.pos]=[dstSp.pos,srcSp.pos];
              }
              editorRenderBoard();editorRenderCountryPool();toast("✅ Moved!");
            }
            editorDragSrc=null;
          }
        });
      }

      // Board properties can be dragged to other slots
      if(sp.type==="property"){
        div.draggable=true;
        div.addEventListener("dragstart",e=>{
          editorDragSrc=pos;editorPoolDragData=null;
          e.dataTransfer.effectAllowed="move";
          div.classList.add("dragging");
          setTimeout(()=>{
            document.querySelectorAll(".ed-tile.ed-empty,.ed-tile.ed-prop").forEach(t=>{
              if(+t.dataset.pos!==pos)t.classList.add("drop-hint");
            });
          },0);
        });
        div.addEventListener("dragend",()=>{
          div.classList.remove("dragging");
          document.querySelectorAll(".ed-tile").forEach(t=>t.classList.remove("drop-hint","drag-over"));
          editorDragSrc=null;
        });
      }
    }
    div.style.animationDelay=(pos*.01)+"s";
    el.appendChild(div);
  });
  updateEditorCounts();
}

function editorPoolDropOnBoard(countryCode,cityIndex,targetPos){
  const c=editorCountries.find(x=>x.code===countryCode);if(!c)return;
  const city=c.cities[cityIndex];if(!city)return;
  const price=c.base+cityIndex*10;
  const S=editorSize,C=S+1;
  // Verify target is empty or property (not a fixed special)
  const board=buildEditorFullBoard(S);
  const targetTile=board[targetPos];
  if(!targetTile||!["empty","property"].includes(targetTile.type))return;
  // Remove this city from board if already placed elsewhere
  editorBoard=editorBoard.filter(s=>!(s.countryCode===countryCode&&s.name===city));
  // Remove whatever was at the target slot
  editorBoard=editorBoard.filter(s=>s.pos!==targetPos);
  // Place city at the chosen slot
  editorBoard.push({pos:targetPos,type:"property",
    group:`g${Math.floor(targetPos/C)%8}`,
    name:city,countryCode:c.code,iso:c.code,countryName:c.name,
    price,rents:calcTieredRents(price),
    houseCost:Math.max(50,Math.floor(price*.5)),houses:0,owner:null,mortgaged:false});
  toast(`📍 ${city} → slot #${targetPos}`);
  editorRenderCountryPool();
  editorRenderBoard();
}

/* ─── EDITOR ENHANCEMENTS: 40/44 Tile Rules ────────────── */
function editorApplyEdgeCountrySetRule(board, S){
  if(!Array.isArray(board)||!board.length||S<6)return board;
  if(4*(S+1)>=44)return board; // Only for boards smaller than 44
  
  const C=S+1,total=4*C;
  const props=board.filter(sp=>sp?.type==="property");
  if(props.length<10)return board;
  
  function sideOfPos(pos){
    if(pos>C&&pos<2*C)return"east";
    if(pos>2*C&&pos<3*C)return"south";
    if(pos>3*C&&pos<4*C)return"west";
    if(pos>0&&pos<C)return"north";
    return"corner";
  }
  
  const statsByCode=new Map();
  props.forEach(sp=>{
    const code=String(sp.countryCode||"").toLowerCase();
    if(!code)return;
    const entry=statsByCode.get(code)||{code,name:sp.countryName||"",count:0,sum:0};
    entry.count+=1;entry.sum+=Number(sp.price||0);
    if(!entry.name&&sp.countryName)entry.name=sp.countryName;
    statsByCode.set(code,entry);
  });
  
  if(statsByCode.size<3)return board;
  
  const ranked=[...statsByCode.values()].map(x=>({...x,avg:x.count?x.sum/x.count:0})).sort((a,b)=>a.avg-b.avg);
  const lowCode=ranked[0].code,highCode=ranked[ranked.length-1].code;
  if(!lowCode||!highCode||lowCode===highCode)return board;
  
  const middleCodes=ranked.slice(1,-1).map(x=>x.code);
  if(!middleCodes.length)return board;
  
  const countryPropCount=props.length-2,remaining=countryPropCount-4;
  if(remaining<0)return board;
  
  const targetCounts=new Map([[lowCode,2],[highCode,2]]);
  const base=Math.floor(remaining/middleCodes.length);
  const extra=remaining%middleCodes.length;
  middleCodes.forEach((code,idx)=>{
    let count=base+(idx<extra?1:0);
    count=Math.min(count,3);
    targetCounts.set(code,count);
  });
  
  const targetTotal=[...targetCounts.values()].reduce((a,b)=>a+b,0);
  if(targetTotal<countryPropCount&&middleCodes.length>0){
    const diff=countryPropCount-targetTotal;
    for(let i=0;i<diff&&i<middleCodes.length;i++){
      const code=middleCodes[i];
      if((targetCounts.get(code)||0)<3)targetCounts.set(code,(targetCounts.get(code)||0)+1);
    }
  }
  
  const countrySequence=[];
  [lowCode,...middleCodes,highCode].forEach(code=>{
    const cnt=targetCounts.get(code)||0;
    for(let i=0;i<cnt;i++)countrySequence.push(code);
  });
  if(countrySequence.length!==countryPropCount)return board;
  
  const propsSorted=props.slice().sort((a,b)=>Number(a.price||0)-Number(b.price||0));
  const eastC=props.filter(sp=>sideOfPos(Number(sp.pos))==="east").sort((a,b)=>Number(b.price||0)-Number(a.price||0))[0]||null;
  const southC=props.filter(sp=>sideOfPos(Number(sp.pos))==="south").sort((a,b)=>Number(b.price||0)-Number(a.price||0))[0]||null;
  
  const utilityProps=[];
  if(eastC)utilityProps.push(eastC);
  if(southC&&southC!==eastC)utilityProps.push(southC);
  if(utilityProps.length<2){
    propsSorted.slice().reverse().forEach(sp=>{if(utilityProps.length>=2)return;if(!utilityProps.includes(sp))utilityProps.push(sp);});
  }
  
  const utilitySet=new Set(utilityProps);
  const countryProps=propsSorted.filter(sp=>!utilitySet.has(sp));
  
  countryProps.forEach((sp,idx)=>{sp.countryCode=countrySequence[idx];});
  
  const elec=utilityProps.find(sp=>sideOfPos(Number(sp.pos))==="east")||utilityProps[0];
  const water=utilityProps.find(sp=>sideOfPos(Number(sp.pos))==="south")||utilityProps.find(sp=>sp!==elec)||utilityProps[1]||utilityProps[0];
  
  [{sp:elec,name:"Electric Company"},{sp:water,name:"Water Company"}].forEach(({sp,name})=>{
    if(!sp)return;
    sp.type="utility";sp.group="company_set";sp.name=name;sp.countryCode="";sp.countryName="";sp.iso="";
    sp.price=150;sp.rents=[0,0,0,0,0,0];sp.houseCost=0;sp.houses=0;sp.owner=null;sp.mortgaged=false;
  });
  
  return board;
}

function editorApplyFortyFourInfrastructureRule(board, S){
  if(!Array.isArray(board)||board.length!==4*(S+1)||S!==10)return board;
  
  const C=S+1,total=4*C;
  const props=board.filter(sp=>sp?.type==="property");
  if(props.length<6)return board;
  
  function sideOfPos(pos){
    if(pos>C&&pos<2*C)return"east";
    if(pos>2*C&&pos<3*C)return"south";
    if(pos>3*C&&pos<4*C)return"west";
    if(pos>0&&pos<C)return"north";
    return"corner";
  }
  
  const isAdjacent=(p1,p2)=>{const a=Number(p1),b=Number(p2);return Math.abs(a-b)===1||((a===0&&b===total-1)||(a===total-1&&b===0));};
  
  const used=new Set();
  const pickInRange=(side,minPos,maxPos)=>{
    const tile=props.filter(sp=>{const pos=Number(sp.pos);return sideOfPos(pos)===side&&pos>=minPos&&pos<=maxPos&&!used.has(sp.pos);})
      .sort((a,b)=>Number(b.price||0)-Number(a.price||0))[0]||null;
    if(tile)used.add(tile.pos);return tile;
  };
  const pickOnSide=(side)=>{
    const tile=props.filter(sp=>sideOfPos(Number(sp.pos))===side&&!used.has(sp.pos))
      .sort((a,b)=>Number(b.price||0)-Number(a.price||0))[0]||null;
    if(tile)used.add(tile.pos);return tile;
  };
  const pickAny=()=>{
    const tile=props.filter(sp=>!used.has(sp.pos)).sort((a,b)=>Number(b.price||0)-Number(a.price||0))[0]||null;
    if(tile)used.add(tile.pos);return tile;
  };
  
  // Infrastructure placement
  const ap1=pickInRange("south",2*C+Math.floor(C/4),2*C+Math.floor(3*C/4))||pickOnSide("south")||pickAny();
  const ap2=pickInRange("south",2*C+Math.floor(C/4),2*C+Math.floor(3*C/4))||pickOnSide("south")||pickAny();
  const compN=pickOnSide("north")||pickAny();
  let compS=pickOnSide("south")||pickAny();
  
  if(compN&&compS&&isAdjacent(compN.pos,compS.pos)){
    used.delete(compS.pos);compS=null;compS=pickAny();
    if(compS&&isAdjacent(compN.pos,compS.pos)){
      used.delete(compS.pos);
      compS=props.find(sp=>!used.has(sp.pos)&&!isAdjacent(Number(compN.pos),Number(sp.pos)));
      if(compS)used.add(compS.pos);
    }
  }
  
  const railN=pickOnSide("north")||pickAny();
  const railS=pickOnSide("south")||pickAny();
  
  const toType=(sp,type,group,name,price)=>{
    if(!sp)return;sp.type=type;sp.group=group;sp.name=name;sp.countryCode="";sp.countryName="";sp.iso="";
    sp.price=price;sp.rents=[0,0,0,0,0,0];sp.houseCost=0;sp.houses=0;sp.owner=null;sp.mortgaged=false;
  };
  
  toType(ap1,"airport","airport_set","South Airport 1",200);
  toType(ap2,"airport","airport_set","South Airport 2",200);
  toType(compN,"utility","company_set","Northern Company",150);
  toType(compS,"utility","company_set","Southern Company",150);
  toType(railN,"railway","rail_ns","North Railway",200);
  toType(railS,"railway","rail_ns","South Railway",200);
  
  return board;
}

function buildEditorFullBoard(S){
  const C=S+1,total=4*C;
  const specials={};
  // Corners
  specials[0]={pos:0,type:"go",name:"START"};
  specials[C]={pos:C,type:"jail",name:"Jail"};
  specials[2*C]={pos:2*C,type:"free_parking",name:"Treasure"};
  specials[3*C]={pos:3*C,type:"go_to_jail",name:"Go Jail"};
  // Airports — exact centre of each side
  const half=Math.round(S/2);
  const ap={S:half,W:C+half,N:2*C+half,E:3*C+half};
  specials[ap.S]={pos:ap.S,type:"airport",name:"✈ S Airport",price:200};
  specials[ap.W]={pos:ap.W,type:"airport",name:"✈ W Airport",price:200};
  specials[ap.N]={pos:ap.N,type:"airport",name:"✈ N Airport",price:200};
  specials[ap.E]={pos:ap.E,type:"airport",name:"✈ E Airport",price:200};
  // Railways — 2 steps before each airport
  const rw={S:ap.S-2,W:ap.W-2,N:ap.N-2,E:ap.E-2};
  specials[rw.S]={pos:rw.S,type:"railway",name:"🚂 S Rail",price:150};
  specials[rw.W]={pos:rw.W,type:"railway",name:"🚂 W Rail",price:150};
  specials[rw.N]={pos:rw.N,type:"railway",name:"🚂 N Rail",price:150};
  specials[rw.E]={pos:rw.E,type:"railway",name:"🚂 E Rail",price:150};
  // Tax Refund and Government Protection on east lane with one city gap
  const taxRet=Math.min(total-1,ap.E+1);
  specials[taxRet]={pos:taxRet,type:"tax_return",name:"$ Tax Refund"};
  // Government Protection — one tile after Tax Refund (with one city in between)
  const govProt=Math.min(total-1,taxRet+2);
  specials[govProt]={pos:govProt,type:"gov_prot",name:"🏛️ Government Protection"};
  // Other specials
  specials[1]={pos:1,type:"income_tax",name:"💰 Tax"};
  if(editorSettings.enableTreasures!==false)
    specials[C+1]={pos:C+1,type:"chest",name:"📦 Chest"};
  if(editorSettings.enableSurprises!==false){
    [Math.round(S*.2),C+Math.round(S*.8),2*C+Math.round(S*.7),3*C+Math.round(S*.8)].forEach(p=>{
      if(p>0&&p<total&&!specials[p])specials[p]={pos:p,type:"chance",name:"❓ Surprise"};
    });
  }
  let board=[];
  for(let pos=0;pos<total;pos++){
    if(specials[pos]){board.push(specials[pos]);continue;}
    const edSp=editorBoard.find(s=>s.pos===pos);
    if(edSp)board.push(edSp);
    else board.push({pos,type:"empty",name:""});
  }
  // Apply enhancements based on board size
  board=editorApplyEdgeCountrySetRule(board,S);
  board=editorApplyFortyFourInfrastructureRule(board,S);
  return board;
}

/* ─── EDITOR COLLAPSE ───────────────────────────────────── */
function editorCollapseLeft(){
  const body=document.querySelector(".editor-body");
  const collapsed=body.classList.toggle("left-collapsed");
  const btn=qid("ed-collapse-left-btn");
  if(btn)btn.textContent=collapsed?"▶":"◀";
}
function editorCollapseRight(){
  const body=document.querySelector(".editor-body");
  const collapsed=body.classList.toggle("right-collapsed");
  const btn=qid("ed-collapse-right-btn");
  if(btn)btn.textContent=collapsed?"◀":"▶";
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
      <h3 style="margin:0;font-size:.95rem">${cityLabel(sp)}</h3>
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
  v=Math.max(9,Math.min(parseInt(v||9),9)); // 44-tile layout disabled for now
  editorSize=v;
  if(qid("ed-size"))qid("ed-size").value=v;
  const total=4*(v+1);
  if(qid("ed-size-val"))qid("ed-size-val").textContent=`${total} Tiles`;
  // Update enhancement hint based on board size
  const hintEl=qid("ed-enhancement-hint");
  const sizeHintEl=qid("ed-size-hint");
  if(sizeHintEl)sizeHintEl.textContent="Edge country distribution + edge utilities";
  if(hintEl)hintEl.textContent="✨ 40-Tile: Cheapest country on one edge, most expensive on opposite";
  editorRenderBoard();
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
  if(!socket?.connected){
    socket?.connect();
    const ok=await _waitForConnect(5000);
    if(!ok){toast("❌ Cannot connect to server");return;}
  }
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
  applyTouchUIClass();
  document.body.setAttribute("data-theme",currentTheme);
  // Sync theme button
  document.querySelectorAll(".tbtn").forEach((b,i)=>{
    const themes=["dark","cyberpunk","gold","ocean","neon","forest","midnight","sakura"];
    b.style.background=Object.values(THEMES)[i]?.bg||"#111";
    b.style.border=`2px solid ${Object.values(THEMES)[i]?.accent||"#fff"}44`;
    if(themes[i]===currentTheme)b.classList.add("active");
  });
  initSocket();
  initDiceFaces();
  generateSeed();updateBoardPreview();
  // Restore name
  const saved=localStorage.getItem("mono_name");
  if(saved)["cr-name","jr-name","qm-name","bs-name","ed-name"].forEach(id=>{const el=qid(id);if(el)el.value=saved;});
  ["cr-name","jr-name","qm-name","bs-name","ed-name"].forEach(id=>{qid(id)?.addEventListener("input",e=>localStorage.setItem("mono_name",e.target.value));});
  // Auto-fill room code from URL
  const m=location.pathname.match(/\/room\/([A-Z0-9]{6})/i);
  if(m){if(qid("jr-code"))qid("jr-code").value=m[1].toUpperCase();toast("Room code pre-filled: "+m[1]);}
});
window.addEventListener("resize",()=>{
  applyTouchUIClass();
  if(_resizeRenderTimer)clearTimeout(_resizeRenderTimer);
  _resizeRenderTimer=setTimeout(()=>{
    if(gs)renderGame(false,true);
    if(qid("sc-editor").classList.contains("active"))editorRenderBoard();
  },80);
});

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
    const isMe = p.id === myId;
    const canBankrupt = isMe && !p.bankrupted;
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
      <div class="pp-right-actions">
        ${canBankrupt ? `<button class="btn btn-red btn-sm pp-bankrupt-btn" onclick="confirmDeclareBankrupt()">Bankrupt</button>` : ""}
        ${canVotekick ? `<button class="btn btn-sm btn-red" style="font-size:.6rem;padding:.15rem .35rem;opacity:.6" onclick="quickVoteKick('${p.id}','${p.name}')" title="Vote kick">🚫</button>` : ""}
      </div>
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
  const isHost = myId === roomHostId;
  
  let buttons = "";
  if (isHost) {
    buttons = `
      <div style="display:flex;flex-direction:column;gap:.4rem;width:100%">
        <button class="btn btn-acc" onclick="socket.emit('restart_game',{});cm('m-win')">🎲 Play Same Board</button>
        <button class="btn btn-blu" onclick="showPostGameBoardSelect()">🗺️ Choose Different Board</button>
        <button class="btn btn-red" onclick="quitGame()">❌ Quit & Home</button>
      </div>`;
  } else {
    buttons = `
      <div style="display:flex;flex-direction:column;gap:.4rem;width:100%">
        <button class="btn btn-muted" disabled style="opacity:.5">🎲 Host Chooses Board</button>
        <button class="btn btn-red" onclick="quitGame()">❌ Quit & Home</button>
      </div>`;
  }
  
  qid("win-c").innerHTML = `
    <div style="text-align:center;padding:2rem">
      <div style="font-size:3rem;margin-bottom:.5rem">${isMe ? "🏆" : "🎉"}</div>
      <img src="${avImg}" width="80" height="80" style="border-radius:50%;border:4px solid ${w.color};margin-bottom:.5rem;animation:bounce .5s ease infinite alternate">
      <h2 style="color:${w.color};font-size:1.8rem">${w.name} Wins!</h2>
      <p style="color:var(--muted)">Final: ${CUR()}${w.money}</p>
      ${!isMe ? `<p style="color:var(--muted);font-size:.82rem;margin-top:.3rem">You finished as spectator</p>` : ""}
      <div style="display:flex;gap:.5rem;justify-content:center;margin-top:1.2rem;flex-direction:column;align-items:center">
        ${buttons}
      </div>
    </div>`;
  om("m-win"); launchConfetti();
}

/* ─── POST-GAME CONTROLS ─────────────────────────────────── */
function quitGame(){
  try{localStorage.removeItem("mono_game_session");}catch(e){}
  socket.disconnect();
  location.href="/";
}

function showPostGameBoardSelect(){
  const div=qid("board-select-c");
  if(!div)return;
  div.innerHTML=`
    <h2>🗺️ Select Board</h2>
    <p style="color:var(--muted);font-size:.8rem;margin-bottom:1rem">Choose a different board for the next game</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;max-height:400px;overflow-y:auto">
      <button class="board-opt-btn" onclick="_selectBoardType('standard')">📋 Standard</button>
      <button class="board-opt-btn" onclick="_selectBoardType('random')">🎲 Random</button>
      <button class="board-opt-btn" onclick="_selectBoardType('worldwide')">🌍 Mr. Worldwide</button>
      <button class="board-opt-btn" onclick="_selectBoardType('india')">🇮🇳 India</button>
      <button class="board-opt-btn" onclick="_selectBoardType('uk')">🇬🇧 UK</button>
      <button class="board-opt-btn" onclick="_selectBoardType('usa')">🇺🇸 USA</button>
    </div>
    <button class="btn btn-out" style="width:100%;margin-top:.5rem" onclick="cm('m-board-select')">Close</button>`;
  om("m-board-select");
}

function _selectBoardType(type){
  curBoardType=type;
  _doCreateRoom({skipJoin:true,boardOnly:true}).then(mapConfig=>{
    if(!mapConfig||!myRoomId)return;
    socket.emit("select_board",{roomId:myRoomId,mapConfig,settings:{}});
  }).catch(e=>console.error("Board selection error:",e));
  cm("m-board-select");
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
