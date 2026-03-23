"""
Monopoly Online — server.py v3.1
Features: reconnection (2-min grace), votekick, spectate mode, auction timers
"""
import asyncio, os, random, time, uuid as _uuid, math
from contextlib import asynccontextmanager
from pathlib import Path

import socketio, uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

import engine as E

PUBLIC = Path(__file__).parent.parent / "public" / "game"
PORT   = int(os.environ.get("GAME_PORT", 8001))

sio = socketio.AsyncServer(
    async_mode="asgi", cors_allowed_origins="*",
    logger=False, engineio_logger=False,
    ping_timeout=60, ping_interval=25,
)

@asynccontextmanager
async def lifespan(_app):
    asyncio.create_task(_cleanup_loop())
    print(f"🎲  Monopoly Online v3.1  →  http://0.0.0.0:{PORT}")
    yield

app      = FastAPI(lifespan=lifespan)
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

rooms:        dict[str, dict] = {}
sid_room:     dict[str, str]  = {}
sid_player:   dict[str, str]  = {}
player_sid:   dict[str, str]  = {}
_reconnect_timers: dict[str, asyncio.Task] = {}
_auction_timers:   dict[str, asyncio.Task] = {}

TOKENS    = ["🎩","🚗","🐕","🚢","🛸","🎲","⚓","🏆"]
COLORS    = ["#e74c3c","#3b82f6","#22c55e","#f97316","#a855f7","#14b8a6","#f59e0b","#ec4899"]
SEED_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
RECONNECT_GRACE    = 120
VOTEKICK_THRESHOLD = 0.6

def make_room_id():
    return "".join(random.choices(SEED_CHARS, k=6))

def sanitize(s, n=200):
    if not isinstance(s, str): return ""
    return s.replace("<","").replace(">","").replace("&","").replace('"',"").replace("'","").strip()[:n]

def mk_lobby_player(sid, name, idx, is_host, avatar=None):
    return {
        "id": sid, "sid": sid, "isHost": is_host,
        "name": sanitize(name) or f"Player {idx+1}",
        "token": TOKENS[idx % 8], "color": COLORS[idx % 8],
        "avatar": avatar or {"skinTone":"#F5CBA7","hairStyle":"short","hairColor":"#3B2314","beardStyle":"none","eyeStyle":"normal"},
        "disconnected": False, "reconnectDeadline": None, "isSpectator": False,
    }

def lobby_payload(room):
    return {
        "roomId": room["id"], "players": room["players"],
        "spectators": room.get("spectators", []),
        "settings": room["settings"], "mapConfig": room.get("mapConfig"),
        "phase": room["phase"],
    }

def room_of(sid):
    rid = sid_room.get(sid)
    return rooms.get(rid) if rid else None

def _pid(sid):
    return sid_player.get(sid, sid)

def _find_gp(gs, pid):
    return next((p for p in gs.get("players",[]) if p["id"]==pid), None)

def _active_count(room):
    gs = room.get("gameState")
    if not gs:
        return sum(1 for p in room.get("players",[]) if not p.get("isSpectator") and not p.get("disconnected"))
    return sum(1 for p in gs.get("players",[]) if not p.get("bankrupted") and not p.get("isSpectator") and not p.get("disconnected"))

async def _reconnect_countdown(rid: str, pid: str):
    await asyncio.sleep(RECONNECT_GRACE)
    room = rooms.get(rid)
    if not room: return
    gs = room.get("gameState")
    if gs:
        gp = _find_gp(gs, pid)
        if gp and gp.get("disconnected"):
            gp["isSpectator"] = True
            gp["disconnected"] = False
            room.setdefault("spectators",[]).append({"id":pid,"name":gp["name"],"reason":"timeout"})
            gs["log"].append(f"⏱️ {gp['name']} timed out → spectator.")
            cur = gs["players"][gs.get("currentPlayerIdx",0)]
            if cur["id"] == pid:
                E.next_turn(gs)
            await sio.emit("state_update", {"gameState": gs}, room=rid)
            await sio.emit("player_timeout", {"playerId":pid,"name":gp["name"]}, room=rid)
    else:
        room["players"] = [p for p in room["players"] if p["id"] != pid]
        if not room["players"]:
            rooms.pop(rid, None); return
        if room.get("hostId") == pid:
            room["hostId"] = room["players"][0]["id"]
            room["players"][0]["isHost"] = True
        await sio.emit("lobby_update", lobby_payload(room), room=rid)
    _reconnect_timers.pop(pid, None)

def _start_reconnect(rid, pid):
    old = _reconnect_timers.pop(pid, None)
    if old: old.cancel()
    _reconnect_timers[pid] = asyncio.create_task(_reconnect_countdown(rid, pid))

def _cancel_reconnect(pid):
    t = _reconnect_timers.pop(pid, None)
    if t: t.cancel()

async def _auction_countdown(rid: str, pos: int):
    await asyncio.sleep(10)
    room = rooms.get(rid)
    if not room or room["phase"] != "playing": return
    gs = room.get("gameState")
    if not gs or gs.get("phase") != "auction": return
    auc = gs.get("auction")
    if not auc or not auc.get("active") or auc.get("pos") != pos: return
    E.do_auction_end(gs)
    await sio.emit("state_update", {"gameState": gs}, room=rid)
    await sio.emit("auction_ended", {"pos": pos}, room=rid)
    if gs.get("winner"):
        room["phase"] = "ended"
        await sio.emit("game_over", {"winnerId": gs["winner"]}, room=rid)
    _auction_timers.pop(rid, None)

def _reset_auction_timer(rid, pos):
    old = _auction_timers.pop(rid, None)
    if old: old.cancel()
    _auction_timers[rid] = asyncio.create_task(_auction_countdown(rid, pos))

def _cancel_auction_timer(rid):
    t = _auction_timers.pop(rid, None)
    if t: t.cancel()

@sio.event
async def connect(sid, environ):
    n = len(sio.manager.rooms.get("/",{}).get("",set()))
    await sio.emit("online_count", {"count":n})

@sio.event
async def disconnect(sid):
    room = room_of(sid)
    sid_room.pop(sid, None)
    pid = sid_player.pop(sid, None)
    if pid: player_sid.pop(pid, None)

    if not room:
        n = len(sio.manager.rooms.get("/",{}).get("",set()))
        await sio.emit("online_count", {"count":n}); return

    rid = room["id"]
    if room["phase"] == "lobby":
        room["players"] = [p for p in room["players"] if p.get("sid") != sid]
        if not room["players"]: rooms.pop(rid, None); return
        if room["hostId"] == (pid or sid):
            room["hostId"] = room["players"][0]["id"]
            room["players"][0]["isHost"] = True
        await sio.emit("lobby_update", lobby_payload(room), room=rid)
    else:
        gs = room.get("gameState")
        player_id = pid or sid
        if gs:
            gp = _find_gp(gs, player_id)
            if gp and not gp.get("bankrupted") and not gp.get("isSpectator"):
                gp["disconnected"] = True
                gp["reconnectDeadline"] = time.time() + RECONNECT_GRACE
                gs["log"].append(f"📴 {gp['name']} disconnected — {RECONNECT_GRACE}s grace.")
                _start_reconnect(rid, player_id)
                cur = gs["players"][gs.get("currentPlayerIdx",0)]
                if cur["id"] == player_id and gs.get("phase") in ("roll","action","buy"):
                    E.next_turn(gs)
                await sio.emit("state_update", {"gameState":gs}, room=rid)
                await sio.emit("player_disconnected", {
                    "playerId": player_id, "name": gp["name"],
                    "graceSecs": RECONNECT_GRACE, "deadline": gp["reconnectDeadline"],
                }, room=rid)

    n = len(sio.manager.rooms.get("/",{}).get("",set()))
    await sio.emit("online_count", {"count":n})

@sio.event
async def reconnect_player(sid, data):
    data = data or {}
    rid  = sanitize(data.get("roomId",""), 6).upper()
    pid  = sanitize(data.get("playerId",""), 64)
    room = rooms.get(rid)
    if not room: return

    old_sid = player_sid.get(pid)
    if old_sid and old_sid != sid:
        sid_room.pop(old_sid, None)
        sid_player.pop(old_sid, None)
    sid_room[sid]   = rid
    sid_player[sid] = pid
    player_sid[pid] = sid
    await sio.enter_room(sid, rid)
    _cancel_reconnect(pid)

    gs = room.get("gameState")
    if gs:
        gp = _find_gp(gs, pid)
        if gp:
            gp["disconnected"] = False
            gp["reconnectDeadline"] = None
            gp["sid"] = sid
            gs["log"].append(f"✅ {gp['name']} reconnected!")
            await sio.emit("game_started", {"gameState": gs}, to=sid)
            await sio.emit("state_update", {"gameState": gs}, room=rid)
            await sio.emit("player_reconnected", {"playerId":pid,"name":gp["name"]}, room=rid)
    else:
        await sio.emit("lobby_update", lobby_payload(room), to=sid)

    p = next((q for q in room.get("players",[]) if q["id"]==pid), None)
    if p: p["sid"] = sid
    await sio.emit("reconnect_ok", {"roomId":rid,"player":p or {"id":pid}}, to=sid)

@sio.event
async def create_room(sid, data):
    data = data or {}
    name = sanitize(data.get("playerName",""), 20) or "Player 1"
    map_cfg = data.get("mapConfig") or {}
    is_public = bool(data.get("isPublic", True))
    avatar = data.get("avatar") or None
    rid = make_room_id()
    settings = E.default_settings()
    settings["privateRoom"] = not is_public
    if map_cfg.get("settings"): settings.update(map_cfg["settings"])
    player = mk_lobby_player(sid, name, 0, True, avatar)
    room = {
        "id": rid, "hostId": player["id"],
        "players": [player], "spectators": [],
        "settings": settings, "mapConfig": map_cfg,
        "phase": "lobby", "gameState": None,
        "chatLog": [], "createdAt": time.time(),
        "votes": {},
    }
    rooms[rid] = room
    sid_room[sid] = rid
    sid_player[sid] = player["id"]
    player_sid[player["id"]] = sid
    await sio.enter_room(sid, rid)
    await sio.emit("room_created", {"roomId":rid,"player":player}, to=sid)
    await sio.emit("lobby_update", lobby_payload(room), room=rid)

@sio.event
async def join_room(sid, data):
    data = data or {}
    code = sanitize(data.get("roomId",""), 6).upper()
    name = sanitize(data.get("playerName",""), 20) or "Player"
    avatar = data.get("avatar") or None
    room = rooms.get(code)
    if not room:
        await sio.emit("join_error", {"message":"Room not found."}, to=sid); return
    if room["phase"] not in ("lobby",):
        await _add_spectator(sid, room, name, avatar); return
    if len(room["players"]) >= room["settings"]["maxPlayers"]:
        await sio.emit("join_error", {"message":"Room is full."}, to=sid); return
    idx = len(room["players"])
    player = mk_lobby_player(sid, name, idx, False, avatar)
    room["players"].append(player)
    sid_room[sid] = room["id"]
    sid_player[sid] = player["id"]
    player_sid[player["id"]] = sid
    await sio.enter_room(sid, room["id"])
    await sio.emit("room_joined", {"roomId":room["id"],"player":player}, to=sid)
    await sio.emit("lobby_update", lobby_payload(room), room=room["id"])

async def _add_spectator(sid, room, name, avatar):
    spec = {"sid":sid,"id":"spec-"+sid[:8],"name":name,"avatar":avatar,"isSpectator":True,"color":"#888"}
    room.setdefault("spectators",[]).append(spec)
    sid_room[sid] = room["id"]
    await sio.enter_room(sid, room["id"])
    await sio.emit("spectate_start", {
        "gameState": room.get("gameState"),
        "roomId": room["id"],
        "spectatorId": spec["id"],
    }, to=sid)
    await sio.emit("spectator_joined", {"name":name,"count":len(room["spectators"])}, room=room["id"])

@sio.event
async def spectate(sid, data):
    data = data or {}
    room = room_of(sid)
    if not room:
        rid = sanitize(data.get("roomId",""), 6).upper()
        room = rooms.get(rid)
    if not room: return
    name = sanitize(data.get("playerName",""), 20) or "Spectator"
    avatar = data.get("avatar") or None
    await _add_spectator(sid, room, name, avatar)

@sio.event
async def quick_match(sid, data):
    data = data or {}
    name = sanitize(data.get("playerName",""), 20) or "Player"
    avatar = data.get("avatar") or None
    avail = next((r for r in rooms.values()
        if r["phase"]=="lobby" and not r["settings"].get("privateRoom")
        and len(r["players"])<r["settings"]["maxPlayers"] and len(r["players"])>=1), None)
    if avail:
        idx = len(avail["players"])
        player = mk_lobby_player(sid, name, idx, False, avatar)
        avail["players"].append(player)
        sid_room[sid] = avail["id"]
        sid_player[sid] = player["id"]
        player_sid[player["id"]] = sid
        await sio.enter_room(sid, avail["id"])
        await sio.emit("room_joined", {"roomId":avail["id"],"player":player}, to=sid)
        await sio.emit("lobby_update", lobby_payload(avail), room=avail["id"])
    else:
        await create_room(sid, {"playerName":name,"isPublic":True,"avatar":avatar})

@sio.event
async def update_settings(sid, data):
    room = room_of(sid)
    if not room or room["hostId"] != _pid(sid): return
    room["settings"].update((data or {}).get("settings") or {})
    await sio.emit("lobby_update", lobby_payload(room), room=room["id"])

@sio.event
async def start_game(sid, _data=None):
    room = room_of(sid)
    if not room or room["hostId"] != _pid(sid): return
    room["phase"] = "playing"
    room["gameState"] = E.init_game(room)
    await sio.emit("game_started", {"gameState":room["gameState"]}, room=room["id"])

@sio.event
async def game_action(sid, data):
    room = room_of(sid)
    if not room or room["phase"] != "playing" or not room.get("gameState"): return
    gs = room["gameState"]
    pid = _pid(sid)
    pi  = next((i for i,p in enumerate(gs["players"]) if p["id"]==pid), -1)
    if pi == -1 or gs["players"][pi].get("isSpectator") or gs["players"][pi].get("disconnected"): return
    if gs["currentPlayerIdx"] != pi: return
    data = data or {}
    action = sanitize(data.get("action",""), 30)
    room["gameState"] = E.process_action(gs, pi, action, data.get("data") or {})
    gs = room["gameState"]
    await sio.emit("state_update", {"gameState":gs}, room=room["id"])
    if gs.get("phase")=="auction" and gs.get("auction",{}).get("active"):
        _reset_auction_timer(room["id"], gs["auction"]["pos"])
    if gs.get("winner"):
        room["phase"] = "ended"
        _cancel_auction_timer(room["id"])
        await sio.emit("game_over", {"winnerId":gs["winner"]}, room=room["id"])

@sio.event
async def auction_bid(sid, data):
    room = room_of(sid)
    if not room or room["phase"] != "playing": return
    gs = room.get("gameState")
    if not gs or gs.get("phase") != "auction": return
    pid = _pid(sid)
    pi  = next((i for i,p in enumerate(gs["players"]) if p["id"]==pid), -1)
    if pi == -1 or gs["players"][pi].get("isSpectator"): return
    prev = gs["auction"]["currentBid"]
    E.do_auction_bid(gs, pi, data or {})
    if gs["auction"]["currentBid"] > prev:
        _reset_auction_timer(room["id"], gs["auction"]["pos"])
    await sio.emit("state_update", {"gameState":gs}, room=room["id"])

@sio.event
async def auction_fold(sid, _data=None):
    room = room_of(sid)
    if not room or room["phase"] != "playing": return
    gs = room.get("gameState")
    if not gs or gs.get("phase") != "auction": return
    pid = _pid(sid)
    pi  = next((i for i,p in enumerate(gs["players"]) if p["id"]==pid), -1)
    if pi == -1: return
    E.do_auction_fold(gs, pi)
    if not gs.get("auction"): _cancel_auction_timer(room["id"])
    await sio.emit("state_update", {"gameState":gs}, room=room["id"])

@sio.event
async def vote_kick(sid, data):
    room = room_of(sid)
    if not room or room["phase"] != "playing": return
    gs = room.get("gameState")
    if not gs: return
    data = data or {}
    voter_id  = _pid(sid)
    target_id = sanitize(data.get("targetId",""), 64)
    if not voter_id or not target_id or voter_id == target_id: return
    target_p = _find_gp(gs, target_id)
    if not target_p or target_p.get("bankrupted") or target_p.get("isSpectator"): return
    votes = room.setdefault("votes", {})
    votes.setdefault(target_id, set()).add(voter_id)
    vote_count = len(votes[target_id])
    needed = max(2, math.ceil(_active_count(room) * VOTEKICK_THRESHOLD))
    await sio.emit("vote_update", {
        "targetId": target_id, "targetName": target_p["name"],
        "votes": vote_count, "needed": needed,
    }, room=room["id"])
    if vote_count >= needed:
        target_p["isSpectator"] = True
        target_p["disconnected"] = False
        _cancel_reconnect(target_id)
        room["votes"].pop(target_id, None)
        room.setdefault("spectators",[]).append({"id":target_id,"name":target_p["name"],"reason":"votekick"})
        gs["log"].append(f"🚫 {target_p['name']} was vote-kicked.")
        cur = gs["players"][gs.get("currentPlayerIdx",0)]
        if cur["id"] == target_id: E.next_turn(gs)
        kicked_sid = player_sid.get(target_id)
        if kicked_sid:
            await sio.emit("you_were_kicked", {"roomId":room["id"],"gameState":gs}, to=kicked_sid)
        await sio.emit("player_kicked", {"playerId":target_id,"name":target_p["name"]}, room=room["id"])
        await sio.emit("state_update", {"gameState":gs}, room=room["id"])

@sio.event
async def cancel_vote_kick(sid, data):
    room = room_of(sid)
    if not room: return
    voter_id  = _pid(sid)
    target_id = sanitize((data or {}).get("targetId",""), 64)
    if voter_id and target_id:
        room.get("votes",{}).get(target_id, set()).discard(voter_id)

@sio.event
async def trade_offer(sid, data):
    room = room_of(sid)
    if not room or room["phase"] != "playing": return
    data = data or {}
    pid = _pid(sid)
    await sio.emit("trade_incoming", {
        "tradeId": str(_uuid.uuid4()), "fromId": pid,
        "toId": data.get("toPlayerId"), "offer": data.get("offer") or {},
    }, room=room["id"])

@sio.event
async def trade_respond(sid, data):
    room = room_of(sid)
    if not room: return
    data = data or {}
    pid = _pid(sid)
    if not data.get("accepted"):
        await sio.emit("trade_declined", {"tradeId":data.get("tradeId")}, room=room["id"]); return
    gs  = room["gameState"]
    fid = data.get("fromId")
    fi  = next((i for i,p in enumerate(gs["players"]) if p["id"]==fid), -1)
    ti  = next((i for i,p in enumerate(gs["players"]) if p["id"]==pid), -1)
    if fi==-1 or ti==-1: return
    E.exec_trade(gs, fi, ti, data.get("offer") or {})
    await sio.emit("state_update",   {"gameState":gs},               room=room["id"])
    await sio.emit("trade_accepted", {"tradeId":data.get("tradeId")}, room=room["id"])

@sio.event
async def trade_negotiate(sid, data):
    room = room_of(sid)
    if not room: return
    data = data or {}
    pid = _pid(sid)
    await sio.emit("trade_negotiate", {
        "tradeId": data.get("tradeId"), "fromId": pid,
        "toId": data.get("toId"), "offer": data.get("offer") or {},
        "message": sanitize(data.get("message",""), 200),
    }, room=room["id"])

@sio.event
async def chat(sid, data):
    room = room_of(sid)
    if not room: return
    data = data or {}
    pid = _pid(sid)
    gs = room.get("gameState")
    player = None
    if gs: player = _find_gp(gs, pid)
    if not player: player = next((p for p in room.get("players",[]) if p.get("sid")==sid or p["id"]==pid), None)
    if not player: player = next((s for s in room.get("spectators",[]) if s.get("sid")==sid), None)
    if not player: return
    is_spec = player.get("isSpectator",False) or player.get("id","").startswith("spec-")
    msg = {
        "name": player["name"], "color": player.get("color","#aaa"),
        "text": sanitize(data.get("message",""), 200),
        "ts": int(time.time()*1000), "isSpectator": is_spec,
    }
    room["chatLog"].append(msg)
    if len(room["chatLog"]) > 100: room["chatLog"] = room["chatLog"][-80:]
    await sio.emit("chat_msg", msg, room=room["id"])

@app.get("/mapi/rooms")
async def list_rooms():
    pub = [
        {"id":r["id"],"hostName":r["players"][0]["name"] if r["players"] else "?",
         "hostToken":r["players"][0]["token"] if r["players"] else "🎩",
         "boardName":(r.get("mapConfig") or {}).get("name","Standard"),
         "boardSize":(r.get("mapConfig") or {}).get("tilesPerSide",9),
         "playerCount":len(r["players"]),"maxPlayers":r["settings"]["maxPlayers"],
         "currency":r["settings"]["currency"],"createdAt":r["createdAt"]}
        for r in rooms.values()
        if r["phase"]=="lobby" and not r["settings"].get("privateRoom")
    ]
    return JSONResponse(pub)

@app.get("/mapi/countries")
async def list_countries():
    return JSONResponse(E.get_countries_list())

@app.get("/mapi/domestic-maps")
async def list_domestic_maps():
    return JSONResponse(E.get_domestic_maps())

@app.get("/mapi/domestic-board")
async def domestic_board(preset:str="india", S:int=9):
    board = E.generate_domestic_board(preset, max(6, min(S, 12)))
    return JSONResponse({"preset":preset,"board":board,"tilesPerSide":S})

@app.get("/mapi/random-board")
async def random_board(seed:str="", mode:str="balanced", S:int=9):
    actual = seed.upper() or "".join(random.choices(SEED_CHARS, k=6))
    board = E.generate_random_board(actual, mode, max(6, min(S, 12)))
    return JSONResponse({"seed":actual,"board":board,"tilesPerSide":S})

@app.get("/favicon.ico")
async def favicon():
    return Response(status_code=204)

async def _cleanup_loop():
    while True:
        await asyncio.sleep(3600)
        cutoff = time.time()-14_400
        for rid in [k for k,v in rooms.items() if v["createdAt"]<cutoff]:
            rooms.pop(rid, None)

if __name__ == "__main__":
    uvicorn.run("server:socket_app", host="0.0.0.0", port=PORT, log_level="warning")
