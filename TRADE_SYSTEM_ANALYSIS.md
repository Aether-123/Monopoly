# Monopoly Trade System: Current Implementation & Architecture Analysis

## Executive Summary

The current trade system is a **1-on-1 private negotiation system** where all information is technically broadcast to all players via Socket.IO, but **client-side filtering restricts visibility**. It supports:
- Direct trade offers
- Counter-offer negotiation
- Acceptance or decline
- No public visibility, history, or third-party participation

---

## 1. CURRENT TRADE FLOW - DETAILED BREAKDOWN

### Phase 1: Trade Initiation
**Who initiates:** Any active player
**Where:** Right sidebar trade panel
**How:**
```
renderTradePanel() → User clicks on another player
selectTradeTarget(pid) → Displays expanded trade UI
renderTradeExpanded() → Shows my properties, their properties, money inputs
sendTrade() → Emits trade_offer to server
```

**Client Code Location:** [game.js](artifacts/monopoly-game/public/game/game.js#L879)
```javascript
socket.emit("trade_offer", {
  toPlayerId: _tradeTarget,
  offer: {
    fromProps: [...tFromSel],      // Properties I'm giving
    toProps: [...tToSel],          // Properties they're giving
    fromMoney: fm,                 // Money I'm giving
    toMoney: tm                    // Money they're giving
  }
});
```

**Server Receipt:** [server.js](artifacts/monopoly-game/server/server.js#L1536-L1545)
```javascript
socket.on("trade_offer", (data) => {
  const room = roomOf(socket.id);
  if (!room || room.phase !== "playing") return;
  const playerId = pid(socket.id);
  
  // BROADCAST TO ALL PLAYERS
  io.to(room.id).emit("trade_incoming", {
    tradeId: randomUUID(),
    fromId: playerId,
    toId: data.toPlayerId,
    offer: data.offer || {}
  });
});
```

### Phase 2: Broadcast to All Players
**Emitter:** Server (after validating room exists and game is playing)
**Recipients:** ALL players in room via `io.to(room.id).emit()`
**Event:** `trade_incoming`
**Payload:**
```javascript
{
  tradeId: "uuid-string",           // Unique identifier
  fromId: "player-id-of-sender",    // Player sending offer
  toId: "player-id-of-recipient",   // Intended recipient
  offer: {
    fromProps: [3, 5, 39],          // Space positions
    toProps: [1, 6],
    fromMoney: 100,
    toMoney: 50
  }
}
```

**Important:** The server broadcasts the FULL offer details to everyone, not just the recipient.

### Phase 3: Recipient Receives Trade
**Client Listener:** [game.js](artifacts/monopoly-game/public/game/game.js#L406)
```javascript
socket.on("trade_incoming", d => showIncomingTrade(d));
```

**Visibility Filter:** [game.js](artifacts/monopoly-game/public/game/game.js#L883)
```javascript
function showIncomingTrade({tradeId, fromId, toId, offer}) {
  if (toId !== myId) return;  // ← ONLY RECIPIENT SEES THIS
  incomingTrade = {tradeId, fromId, offer};
  // Render modal m-t-in
}
```

**What Recipient Sees:**
- Modal `m-t-in` displays in a wide modal
- Left side: "They give you" (fromProps, fromMoney)
- Right side: "You give" (toProps, toMoney)
- Buttons:
  - ✅ Accept
  - ❌ Decline
  - 🔄 Counter (sends to Negotiate Modal)

**Modal Structure (HTML):** [index.html](artifacts/monopoly-game/public/game/index.html#L411)
```html
<div class="ov ovh" id="m-t-in">
  <div class="modal wide">
    <button class="mc" onclick="declineTrade()">✕</button>
    <div id="tin-c"></div>  <!-- Dynamically populated -->
  </div>
</div>
```

### Phase 4a: Counter-Offer Negotiation Path
**Trigger:** Recipient clicks "Counter" button
**Function:** `openNegotiate()`

**Counter Modal Structure:** [index.html](artifacts/monopoly-game/public/game/index.html#L412)
```html
<div class="ov ovh" id="m-neg">
  <div class="modal wide">
    <button class="mc" onclick="cm('m-neg')">✕</button>
    <h2>🔄 Counter Offer</h2>
    <div id="neg-c"></div>
  </div>
</div>
```

**Counter Submission:** [game.js](artifacts/monopoly-game/public/game/game.js#L948)
```javascript
socket.emit("trade_negotiate", {
  tradeId: incomingTrade.tradeId,
  toId: incomingTrade.fromId,  // Send back to original sender
  offer: {...},                 // New counter-offer terms
  message: qid("neg-msg")?.value || ""
});
```

**Server Handles Counter:** [server.js](artifacts/monopoly-game/server/server.js#L1562-L1572)
```javascript
socket.on("trade_negotiate", (data) => {
  const room = roomOf(socket.id);
  if (!room) return;
  const playerId = pid(socket.id);
  
  // BROADCAST COUNTER TO ALL
  io.to(room.id).emit("trade_negotiate", {
    tradeId: data.tradeId,
    fromId: playerId,
    toId: data.toId,
    offer: data.offer || {},
    message: sanitize(data.message || "", 200)
  });
});
```

**Original Sender Receives Counter:** [game.js](artifacts/monopoly-game/public/game/game.js#L409)
```javascript
socket.on("trade_negotiate", d => showNegotiateModal(d));
```

**Filter Applied:** [game.js](artifacts/monopoly-game/public/game/game.js#L951)
```javascript
function showNegotiateModal({tradeId, fromId, toId, offer, message}) {
  if (toId !== myId) return;  // ← ONLY INTENDED RECIPIENT SEES
  // Render counter in m-t-in modal
}
```

### Phase 4b: Accept or Decline Trade
**Accept Path:** [game.js](artifacts/monopoly-game/public/game/game.js#L911)
```javascript
function respondTrade(ok) {
  if (!incomingTrade) return;
  socket.emit("trade_respond", {
    ...incomingTrade,
    accepted: ok
  });
  cm("m-t-in");  // Close modal
  incomingTrade = null;
}
```

**Server Processes Acceptance:** [server.js](artifacts/monopoly-game/server/server.js#L1547-L1560)
```javascript
socket.on("trade_respond", (data) => {
  const room = roomOf(socket.id);
  if (!room) return;
  const playerId = pid(socket.id);
  
  if (!data.accepted) {
    io.to(room.id).emit("trade_declined", {tradeId: data.tradeId});
    return;
  }
  
  const gs = room.gameState;
  const fid = data.fromId;
  const fi = gs.players.findIndex(p => p.id === fid);
  const ti = gs.players.findIndex(p => p.id === playerId);
  if (fi === -1 || ti === -1) return;
  
  // ← EXECUTE THE TRADE
  E.execTrade(gs, fi, ti, data.offer || {});
  
  // Broadcast updated game state
  io.to(room.id).emit("state_update", {gameState: gs});
  io.to(room.id).emit("trade_accepted", {tradeId: data.tradeId});
});
```

**Trade Execution:** [engine.js](artifacts/monopoly-game/server/engine.js#L1234-L1246)
```javascript
export function execTrade(gs, fi, ti, offer) {
  const f = gs.players[fi], t = gs.players[ti];
  
  // Money transfer
  f.money += (offer.toMoney || 0) - (offer.fromMoney || 0);
  t.money += (offer.fromMoney || 0) - (offer.toMoney || 0);
  
  // Property transfer (from → to)
  for (const pos of (offer.fromProps || [])) {
    gs.board[pos].owner = t.id;
    f.properties = f.properties.filter(p => p !== pos);
    t.properties.push(pos);
  }
  
  // Property transfer (to → from)
  for (const pos of (offer.toProps || [])) {
    gs.board[pos].owner = f.id;
    t.properties = t.properties.filter(p => p !== pos);
    f.properties.push(pos);
  }
  
  gs.log.push(`💱 Trade: ${f.name} ↔ ${t.name}`);
}
```

---

## 2. DATA VISIBILITY & BROADCAST ARCHITECTURE

### What Information Is Public (Broadcast to All)?
✅ **ALL details are sent to all players:**
- Trade initiator (fromId)
- Trade recipient (toId)
- Complete offer breakdown (which properties, how much money)
- Counter-offers with messages
- Acceptance/decline status

✅ **But visibility is enforced CLIENT-SIDE:**
- `if (toId !== myId) return;` in `showIncomingTrade()`
- `if (toId !== myId) return;` in `showNegotiateModal()`
- Non-involved players simply don't display the modals

⚠️ **Critical:** If you remove these filters, third parties will see all trade details.

### What Information Is NOT Broadcast?
- ❌ Trade history (previous trades)
- ❌ Trade notifications (no "trade feed")
- ❌ List of active trades
- ❌ User interaction on trades (who's looking at what)

---

## 3. CURRENT TRADE MODAL STRUCTURE

### Incoming Trade Modal (`m-t-in`)
**Location:** [index.html line 411](artifacts/monopoly-game/public/game/index.html#L411)

**HTML Container:**
```html
<div class="ov ovh" id="m-t-in">
  <div class="modal wide">
    <button class="mc" onclick="declineTrade()">✕</button>
    <div id="tin-c"></div>
  </div>
</div>
```

**Dynamic Content (in `tin-c`):**
```html
<h2>💱 Offer from <span style="color:...">From Player Name</span></h2>
<div style="display:flex;gap:.6rem;flex-wrap:wrap;...">
  <div>They give you
    <!-- List of properties -->
    <!-- Money amount if included -->
  </div>
  <div>You give
    <!-- List of properties -->
    <!-- Money amount if included -->
  </div>
</div>
<div style="display:flex;gap:.4rem;...">
  <button class="btn btn-acc" onclick="respondTrade(true)">✅ Accept</button>
  <button class="btn btn-red" onclick="respondTrade(false)">❌ Decline</button>
  <button class="btn btn-out" onclick="openNegotiate()">🔄 Counter</button>
</div>
```

### Counter Offer Modal (`m-neg`)
**Location:** [index.html line 412](artifacts/monopoly-game/public/game/index.html#L412)

**HTML Container:**
```html
<div class="ov ovh" id="m-neg">
  <div class="modal wide">
    <button class="mc" onclick="cm('m-neg')">✕</button>
    <h2>🔄 Counter Offer</h2>
    <div id="neg-c"></div>
  </div>
</div>
```

**Dynamic Content (in `neg-c`):**
- Two-column layout: "I'll give" and "I want"
- Property selection with IDs like `neg-f-{pos}` and `neg-t-{pos}`
- Money input: `neg-fm` and `neg-tm`
- Message input: `neg-msg`
- Buttons: "📨 Send Counter" and "Cancel"

---

## 4. ANSWERS TO SPECIFIC QUESTIONS

### Q1: Are trades currently 1-on-1 only or can multiple players be involved?
**Answer: Strictly 1-on-1.** 
- `trade_offer` targets a single `toPlayerId`
- `trade_respond` is between the initiator (fromId) and responder (playerId)
- `execTrade()` takes only two player indices (fi, ti)
- System cannot handle 3+ player trades

### Q2: Are trades currently visible to non-involved players?
**Answer: Technically YES (broadcast), but displayed as NO (client filtering).**
- Server broadcasts full offer to `io.to(room.id)` (all players)
- But recipient checks `if (toId !== myId) return;` before displaying
- Non-involved players receive the event but ignore it
- **No mechanism exists for non-involved players to see "active trades"**

### Q3: Where do non-involved players see trades?
**Answer: NOWHERE currently.**
- Only recipient sees incoming trade modal
- Goal is privacy, not transparency
- If you want visibility, you need:
  1. A "Trade Feed" or "Active Trades" list in the UI
  2. Remove or modify the client filters
  3. Display trades conditionally based on new rules

### Q4: What would "chipping in" mean?
**Answer: Depends on your design:**

**Option A: Counter with Alternatives**
- Third party makes a counter-offer to the original sender
- Creates a side negotiation: Player A ← third party B ← Player C
- Issue: Original trade becomes complex (3+ simultaneous offers)

**Option B: Append to One Side**
- Third party offers "I'll also give these properties" 
- Adds to the offer terms but keeps 2-player execution
- Example: A ↔ B, but C says "I'll add these to B's side"

**Option C: Auction/Bid Model**
- Trade becomes public auction
- Multiple counter-offers pile up
- Winner's offer executes
- Requires new data structure and logic

**Option D: Coalition Trades**
- Allow N-player trades where money/props are pooled
- Most complex; requires significant refactoring

### Q5: Permission & Approval
**Current system:** Only the recipient decides (accept/decline).

**For third-party participation:**
- **Option A (recommended for visibility):** Both original parties must approve third-party participation
- **Option B (simpler):** Original sender implicitly accepts by responding; recipient's approval is final
- **Option C (strict):** Both original parties + third party all must vote

---

## 5. WHAT NEEDS TO CHANGE FOR VISIBILITY & PARTICIPATION

### Change 1: Remove or Modify Client-Side Filters
**Current code blocks non-involved players from seeing trades:**

```javascript
// In showIncomingTrade()
if (toId !== myId) return;

// In showNegotiateModal()
if (toId !== myId) return;
```

**To add visibility:**
- Change filters to conditional display (e.g., show in a "Trade Feed" only)
- Or remove filters entirely and handle via CSS/DOM organization

### Change 2: Add "Trade Feed" UI Component
**New right-sidebar section or shared modal showing:**
- List of active trades not involving current player
- Initiator, recipient, trade terms
- Button to "View Details" or "Make Counter-Offer"

**Possible locations:**
- New tab in the game panel (Players, Trade, **Active Trades**)
- Dedicated modal `m-trade-feed` or `m-active-trades`
- Expandable section in trade panel

### Change 3: Add Third-Party Offer Mechanism
**New socket event:** `trade_chip_in` or `trade_counter_from_third`

**Payload:**
```javascript
{
  originalTradeId: uuid,      // Links to specific trade
  fromId: myId,               // Player making offer
  offer: {...},               // New terms
  targetSide: "from"|"to",    // Which side do I support?
  message: "..."
}
```

**Server broadcast:** Send to both original parties
**Recipients decide:** Do they accept third-party involvement?

### Change 4: Extend Trade Data Model
**Current trade data:**
```javascript
{
  tradeId, fromId, toId, offer
}
```

**Extended for multi-participation:**
```javascript
{
  tradeId,
  initiator: fromId,
  originalTarget: toId,
  originalOffer: {...},
  counterOffers: [
    { from: id, offer: {...}, timestamp, message },
    ...
  ],
  thirdPartyOffers: [
    { from: id, side: "from"|"to", offer: {...}, message },
    ...
  ],
  status: "active" | "approved" | "declined" | "expired",
  lastModified: timestamp
}
```

### Change 5: Server-Side Trade Persistence
**Current system:**
- Trades exist only in socket events
- Once accepted/declined, they disappear

**For history and "active trades":**
- Store trades in `room.activeTrades = Map<tradeId, trade>`
- Add cleanup timer (e.g., trades expire after 5 minutes)
- Keep last N trades in history log

### Change 6: Socket Event Architecture
**New events needed:**
- `trade_offer` → `trade_incoming` ✅ (exists)
- `trade_negotiate` → `trade_negotiate` ✅ (exists)
- `trade_respond` → `trade_accepted` / `trade_declined` ✅ (exists)
- **NEW:** `trade_feed_request` → send active trades to client
- **NEW:** `trade_chip_in` - third party makes offer
- **NEW:** `trade_chip_in_respond` - original parties approve/deny
- **NEW:** `trade_status_update` - broadcast any trade status change

---

## 6. RECOMMENDED IMPLEMENTATION ROADMAP

### Phase 1: Visibility (Foundation)
1. Create "Trade Feed" UI component
2. Store active trades in server memory (`room.activeTrades`)
3. Send `trade_feed_update` events when trades change
4. Remove client filter for "view-only" trades
5. Add "View Details" button for non-involved players

### Phase 2: Participation
1. Add "Make Counter-Offer" button for non-involved players
2. Implement `trade_chip_in` socket handler
3. Modify showIncomingTrade to display third-party offers
4. Add approval/denial logic for third-party involvement

### Phase 3: Advanced Features
1. Trade history view
2. Trade notifications/feed
3. Approval voting if multi-signature required
4. Trade expiration timers
5. Trade preferences (allow/disallow third-party participation)

### Phase 4: Full Multi-Player Trades
1. Extend execTrade() to handle 3+ players
2. Create new trade execution path for coalition trades
3. New counter-offer merging logic
4. Complex money/property resolution

---

## 7. FILE LOCATIONS REFERENCE

| Component | File | Lines |
|-----------|------|-------|
| Trade initiation event | [game.js](artifacts/monopoly-game/public/game/game.js#L879) | 879 |
| sendTrade function | [game.js](artifacts/monopoly-game/public/game/game.js) | 875-880 |
| renderTradePanel | [game.js](artifacts/monopoly-game/public/game/game.js#L834) | 834-843 |
| renderTradeExpanded | [game.js](artifacts/monopoly-game/public/game/game.js#L846) | 846-876 |
| showIncomingTrade | [game.js](artifacts/monopoly-game/public/game/game.js#L883) | 883-907 |
| openNegotiate | [game.js](artifacts/monopoly-game/public/game/game.js#L913) | 913-940 |
| showNegotiateModal | [game.js](artifacts/monopoly-game/public/game/game.js#L951) | 951-990 |
| server trade_offer | [server.js](artifacts/monopoly-game/server/server.js#L1536) | 1536-1545 |
| server trade_respond | [server.js](artifacts/monopoly-game/server/server.js#L1547) | 1547-1560 |
| server trade_negotiate | [server.js](artifacts/monopoly-game/server/server.js#L1562) | 1562-1572 |
| execTrade | [engine.js](artifacts/monopoly-game/server/engine.js#L1234) | 1234-1246 |
| Modal HTML | [index.html](artifacts/monopoly-game/public/game/index.html#L411-L412) | 411-412 |
| Trade panel HTML | [index.html](artifacts/monopoly-game/public/game/index.html#L379-L382) | 379-382 |

---

## 8. CRITICAL INSIGHTS FOR IMPLEMENTATION

### Key Insight #1: Privacy is Client-Side, Not Server-Side
This means you can change visibility behavior without server changes—just modify the JavaScript filters. However, for a robust system, you should consider adding server-side visibility rules.

### Key Insight #2: Counter Offers Are Bilateral, Not Additive
When a counter-offer is sent, it replaces the original terms entirely. There's no "offer merging"—it's just a new proposal that goes back to the original sender.

### Key Insight #3: No Trade Expiration
Trades remain "active" until accepted or declined. If a player disconnects, their trade is lost. Consider adding:
- Trade timeout (e.g., 5 min)
- Auto-decline on disconnect
- Trade queue per player

### Key Insight #4: Notification Design
Currently, trades appear as modal pop-ups. With multi-player visibility:
- Consider notifications for "active trades" feed
- Toast notifications for new third-party offers
- Opt-in/opt-out for trade notifications

### Key Insight #5: Data Persistence vs. Session
Current system is session-only (RAM). For:
- Trade history → Need localStorage or persistent DB
- Trade statistics → Need aggregation/logging
- Leaderboards → Need database

---

## Summary

**Current state:** Private 1-on-1 trades with client-side visibility filtering
**What's broadcast:** Everything (but hidden client-side)
**What needs to change:** Visibility filters, trade feed UI, third-party offer mechanism
**Complexity:** Medium (not a complete rewrite, but requires new UI + socket events)
**Dependencies:** None (no external APIs needed)

The architecture is actually well-suited for extensions—you just need to:
1. Remove/modify the client filters
2. Add persistent trade state on the server
3. Create UI to display and interact with active trades
4. Implement third-party offer socket handlers
