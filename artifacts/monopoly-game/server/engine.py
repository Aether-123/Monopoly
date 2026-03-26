"""
Monopoly Online — engine.py v3.0
Pure game logic. No I/O, no async. Called by server.py.
"""
import random, math, uuid as _uuid, time

# ═══════════════════════════════════════════════════════
#  CARD DECKS
# ═══════════════════════════════════════════════════════
VERY_GOOD = [
    {"title":"SECRET INHERITANCE","icon":"🏰","text":"A long-lost aunt left you her estate! Collect $1500!","action":"gain","amount":1500},
    {"title":"BITCOIN WALLET","icon":"₿","text":"Found an old USB with Bitcoin from 2009. Sell for $1500!","action":"gain","amount":1500},
    {"title":"VIRAL OVERNIGHT","icon":"🚀","text":"Your cat video went viral. Brand deals: collect $1500!","action":"gain","amount":1500},
    {"title":"LAWSUIT WIN","icon":"⚖️","text":"Won unpaid overtime lawsuit. Collect $1500!","action":"gain","amount":1500},
    {"title":"GAME SHOW JACKPOT","icon":"🎰","text":"Won a TV game show on a dare. Jackpot: $1500!","action":"gain","amount":1500},
]
VERY_BAD = [
    {"title":"IRS AUDIT","icon":"😱","text":"7 years of tax irregularities. Pay $1500.","action":"pay","amount":1500},
    {"title":"IDENTITY THEFT","icon":"🦹","text":"Hacker drains 80% of your wallet cash.","action":"pay","walletPercentOfCash":80},
    {"title":"PONZI SCHEME","icon":"📉","text":"Your broker was fraud. Lose $1500.","action":"pay","amount":1500},
    {"title":"FLOODED BASEMENT","icon":"🌊","text":"Burst pipe destroyed everything. Pay $1500.","action":"pay","amount":1500},
]
BAD_SURP = [
    {"icon":"💸","text":"Secret savings found. Pay $200.","action":"pay","amount":200},
    {"icon":"🔧","text":"Car transmission failed. Pay $120.","action":"pay","amount":120},
    {"icon":"📱","text":"Dropped phone. Screen repair: pay $90.","action":"pay","amount":90},
    {"icon":"🚗","text":"Parking ticket. Pay $40.","action":"pay","amount":40},
    {"icon":"🐱","text":"Cat knocked laptop off desk. Pay $130.","action":"pay","amount":130},
    {"icon":"🦷","text":"Emergency dentist: pay $100.","action":"pay","amount":100},
    {"icon":"😴","text":"Sleep-shopped online. Pay $90.","action":"pay","amount":90},
    {"icon":"🏠","text":"Roof leaked. Pay $130.","action":"pay","amount":130},
    {"icon":"🚲","text":"Bike stolen. Pay $70.","action":"pay","amount":70},
    {"icon":"🍕","text":"Bought meme coin. Crashed. Pay $80.","action":"pay","amount":80},
    {"icon":"🐕","text":"Dog vet emergency: pay $110.","action":"pay","amount":110},
    {"icon":"🎮","text":"Kid bought in-game currency. Pay $50.","action":"pay","amount":50},
    {"icon":"🛑","text":"Ran red light. Camera caught it. Pay $65.","action":"pay","amount":65},
]
GOOD_SURP = [
    {"icon":"💎","text":"Found secret jewellery stash. Sold for $500!","action":"gain","amount":500},
    {"icon":"🧥","text":"Found $50 in an old jacket!","action":"gain","amount":50},
    {"icon":"📈","text":"Investment dividend arrived. Collect $150!","action":"gain","amount":150},
    {"icon":"🎟️","text":"Won local raffle. Collect $100!","action":"gain","amount":100},
    {"icon":"💰","text":"Unexpected tax rebate. Collect $200!","action":"gain","amount":200},
    {"icon":"🤝","text":"Neighbour paid you back. Collect $80!","action":"gain","amount":80},
    {"icon":"💡","text":"Side hustle great month. Collect $120!","action":"gain","amount":120},
    {"icon":"🛋️","text":"Sold old furniture. Collect $60!","action":"gain","amount":60},
    {"icon":"🏦","text":"Bank loyalty bonus. Collect $30!","action":"gain","amount":30},
    {"icon":"🎨","text":"Painting sold for a lot. Collect $180!","action":"gain","amount":180},
    {"icon":"🔑","text":"Old property bond matured! Collect $250!","action":"gain","amount":250},
    {"icon":"🌈","text":"Insurance claim approved. Collect $220!","action":"gain","amount":220},
]
CHEST_CARDS = [
    {"text":"Advance to GO. Collect start salary.","action":"goto","position":0},
    {"text":"Bank error in your favour +$200.","action":"gain","amount":200},
    {"text":"Doctor's fee: pay $50.","action":"pay","amount":50},
    {"text":"Stock sale +$50.","action":"gain","amount":50},
    {"text":"Get Out of Jail Free.","action":"jail_card"},
    {"text":"Go to Jail!","action":"jail"},
    {"text":"Government Protection Card!","action":"gov_card"},
    {"text":"Life insurance matures +$100.","action":"gain","amount":100},
    {"text":"Hospital fees: pay $100.","action":"pay","amount":100},
    {"text":"School fees: pay $50.","action":"pay","amount":50},
    {"text":"Consultancy fee +$25.","action":"gain","amount":25},
    {"text":"Free Insurance!","action":"insurance_free"},
]
SURPRISE_CARDS = [
    {"text":"Advance to GO.","action":"goto","position":0},
    {"text":"Bank dividend +$50.","action":"gain","amount":50},
    {"text":"Get Out of Jail Free.","action":"jail_card"},
    {"text":"Go Back 3 Spaces.","action":"back3"},
    {"text":"Go to Jail!","action":"jail"},
    {"text":"General repairs: $40/house, $115/hotel.","action":"repairs"},
    {"text":"Speeding fine: pay $15.","action":"pay","amount":15},
    {"text":"Government Protection Card!","action":"gov_card"},
    {"text":"Win crossword +$100.","action":"gain","amount":100},
    {"text":"Building loan matures +$150.","action":"gain","amount":150},
    {"text":"Free Insurance!","action":"insurance_free"},
    {"text":"Birthday! Collect $50 from each player.","action":"birthday"},
]
HAZARDS = [
    {"id":"crash",    "name":"Car Crash",    "icon":"🚗💥","desc":"Pay $50 for repairs.",     "type":"money","amount":50},
    {"id":"accident", "name":"Accident",     "icon":"🏥",  "desc":"Hospital bill!",           "type":"money","amount":100},
    {"id":"robbery",  "name":"Robbery!",     "icon":"🔫",  "desc":"Lose 80% of your wallet cash!",   "type":"robbery"},
    {"id":"quake",    "name":"Earthquake!", "icon":"🌍💥","desc":"Houses demolished!",        "type":"disaster"},
    {"id":"cyclone",  "name":"Cyclone!",    "icon":"🌀",  "desc":"Storm destroys buildings.","type":"disaster"},
    {"id":"tsunami",  "name":"Tsunami!",    "icon":"🌊",  "desc":"Property flooded.",        "type":"disaster","fixed":1},
    {"id":"landslide","name":"Landslide!",  "icon":"⛰️💥","desc":"2 houses demolished.",    "type":"disaster","fixed":2},
    {"id":"fine",     "name":"Gov. Fine",   "icon":"📋",  "desc":"Pay $75 penalty.",         "type":"money","amount":75},
    {"id":"fire",     "name":"Fire!",       "icon":"🔥",  "desc":"All houses on one property lost.","type":"fire"},
]

# ═══════════════════════════════════════════════════════
#  27 COUNTRIES with full city lists
# ═══════════════════════════════════════════════════════
COUNTRIES = [
    # ── TIER 1 — Emerging/Frontier Markets (GDP/cap < $5k) ──────────────────
    # Base prices scaled so: cheapest city = $20, most expensive = $500
    # Each country: price[i] = base + i * step (step=10 within country)
    # Tier 1: base 20-50, cities range ~$20-$160
    {"code":"ng","name":"Nigeria","flag":"🇳🇬","tier":1,"base":20,
     "cities":["Kano","Ibadan","Maiduguri","Kaduna","Zaria","Aba","Ilorin","Jos","Enugu","Abeokuta","Onitsha","Port Harcourt","Abuja","Lagos","Victoria Island"]},
    {"code":"pk","name":"Pakistan","flag":"🇵🇰","tier":1,"base":25,
     "cities":["Mianwali","Larkana","Sukkur","Bahawalpur","Sargodha","Multan","Peshawar","Hyderabad","Rawalpindi","Faisalabad","Gujranwala","Islamabad","Lahore","Karachi","Clifton"]},
    {"code":"bd","name":"Bangladesh","flag":"🇧🇩","tier":1,"base":30,
     "cities":["Mymensingh","Rangpur","Bogra","Barisal","Jessore","Sylhet","Comilla","Rajshahi","Khulna","Brahmanbaria","Gazipur","Tongi","Narayanganj","Chittagong","Dhaka Gulshan"]},
    {"code":"eg","name":"Egypt","flag":"🇪🇬","tier":1,"base":40,
     "cities":["Aswan","Luxor","Asyut","Damanhur","Faiyum","Zagazig","Mansoura","Tanta","Ismailia","Suez","Port Said","Alexandria","Giza","Cairo","New Cairo"]},
    {"code":"ph","name":"Philippines","flag":"🇵🇭","tier":1,"base":50,
     "cities":["Davao","Zamboanga","Cagayan de Oro","Bacoor","Antipolo","Caloocan","Las Pinas","Pasig","Quezon City","Cebu","Mandaluyong","Taguig","Manila","Makati","BGC Taguig"]},
    # ── TIER 2 — Lower-Middle Income (GDP/cap $5-15k) ────────────────────────
    # Tier 2: base 60-100, cities range ~$60-$240
    {"code":"tr","name":"Turkey","flag":"🇹🇷","tier":2,"base":60,
     "cities":["Diyarbakir","Sanliurfa","Hatay","Kayseri","Konya","Gaziantep","Adana","Mersin","Manisa","Kocaeli","Bursa","Antalya","Izmir","Ankara","Istanbul Besiktas"]},
    {"code":"th","name":"Thailand","flag":"🇹🇭","tier":2,"base":70,
     "cities":["Nakhon Si Thammarat","Songkhla","Ubon Ratchathani","Khon Kaen","Udon Thani","Hat Yai","Rayong","Chiang Rai","Nonthaburi","Phuket","Chiang Mai","Surat Thani","Bangkok Thon Buri","Bangkok CBD","Sukhumvit"]},
    {"code":"id","name":"Indonesia","flag":"🇮🇩","tier":2,"base":70,
     "cities":["Samarinda","Padang","Malang","Bogor","Bandar Lampung","Palembang","Makassar","Semarang","Bandung","Medan","Depok","Bekasi","Surabaya","Jakarta Selatan","SCBD Jakarta"]},
    {"code":"ar","name":"Argentina","flag":"🇦🇷","tier":2,"base":80,
     "cities":["Resistencia","Posadas","Corrientes","Parana","San Juan","Salta","Santa Fe","Mar del Plata","Mendoza","Rosario","Cordoba","La Plata","Tucuman","Buenos Aires","Puerto Madero"]},
    {"code":"pl","name":"Poland","flag":"🇵🇱","tier":2,"base":100,
     "cities":["Sosnowiec","Radom","Czestochowa","Bydgoszcz","Lublin","Katowice","Szczecin","Gdynia","Bialystok","Lodz","Poznan","Gdansk","Wroclaw","Krakow","Warsaw Mokotow"]},
    # ── TIER 3 — Upper-Middle Income (GDP/cap $10-25k) ───────────────────────
    # Tier 3: base 120-180, cities range ~$120-$320
    {"code":"mx","name":"Mexico","flag":"🇲🇽","tier":3,"base":120,
     "cities":["Acapulco","Culiacan","Juarez","Tijuana","Merida","San Luis Potosi","Leon","Puebla","Hermosillo","Aguascalientes","Mexicali","Guadalajara","Monterrey","Mexico City","Polanco"]},
    {"code":"br","name":"Brazil","flag":"🇧🇷","tier":3,"base":140,
     "cities":["Belem","Sao Luis","Manaus","Recife","Fortaleza","Salvador","Curitiba","Porto Alegre","Brasilia","Goiania","Campinas","Belo Horizonte","Rio de Janeiro","Sao Paulo","Sao Paulo Itaim"]},
    {"code":"cn","name":"China","flag":"🇨🇳","tier":3,"base":160,
     "cities":["Harbin","Shenyang","Zhengzhou","Tianjin","Dongguan","Nanjing","Hangzhou","Wuhan","Xian","Chengdu","Chongqing","Guangzhou","Shenzhen","Beijing Chaoyang","Shanghai Lujiazui"]},
    {"code":"es","name":"Spain","flag":"🇪🇸","tier":3,"base":170,
     "cities":["Gijon","Vigo","Valladolid","Cordoba","Zaragoza","Alicante","Murcia","Seville","Las Palmas","Bilbao","Valencia","Palma","Malaga","Madrid","Barcelona Eixample"]},
    {"code":"it","name":"Italy","flag":"🇮🇹","tier":3,"base":180,
     "cities":["Reggio Calabria","Messina","Palermo","Catania","Bari","Naples","Turin","Verona","Bologna","Florence","Genoa","Padua","Trieste","Rome","Milan Centro"]},
    # ── TIER 4 — High Income (GDP/cap $25-45k) ───────────────────────────────
    # Tier 4: base 200-260, cities range ~$200-$400
    {"code":"kr","name":"South Korea","flag":"🇰🇷","tier":4,"base":200,
     "cities":["Changwon","Cheongju","Jeonju","Bucheon","Ulsan","Goyang","Seongnam","Daejeon","Gwangju","Incheon","Daegu","Suwon","Yongin","Busan","Seoul Gangnam"]},
    {"code":"ru","name":"Russia","flag":"🇷🇺","tier":4,"base":200,
     "cities":["Volgograd","Perm","Voronezh","Krasnoyarsk","Ufa","Rostov-on-Don","Omsk","Samara","Chelyabinsk","Nizhny Novgorod","Kazan","Yekaterinburg","Novosibirsk","Moscow","Saint Petersburg"]},
    {"code":"ca","name":"Canada","flag":"🇨🇦","tier":4,"base":220,
     "cities":["Regina","Saskatoon","Winnipeg","Halifax","Quebec City","Edmonton","Hamilton","Ottawa","London ON","Victoria","Kitchener","Calgary","Montreal","Toronto","Vancouver West Side"]},
    {"code":"au","name":"Australia","flag":"🇦🇺","tier":4,"base":240,
     "cities":["Townsville","Cairns","Hobart","Geelong","Sunshine Coast","Wollongong","Logan City","Newcastle","Gold Coast","Adelaide","Canberra","Brisbane","Perth","Melbourne","Sydney Eastern"]},
    {"code":"fr","name":"France","flag":"🇫🇷","tier":4,"base":240,
     "cities":["Saint-Etienne","Le Havre","Reims","Toulon","Rennes","Strasbourg","Montpellier","Bordeaux","Nantes","Lille","Lyon","Nice","Marseille","Paris"]},
    # ── TIER 5 — Very High Income (GDP/cap $45-65k) ──────────────────────────
    # Tier 5: base 280-360, cities range ~$280-$500
    {"code":"de","name":"Germany","flag":"🇩🇪","tier":5,"base":280,
     "cities":["Duisburg","Dortmund","Essen","Nuremberg","Hanover","Leipzig","Dresden","Bremen","Stuttgart","Dusseldorf","Cologne","Frankfurt","Hamburg","Berlin Mitte","Munich Maxvorstadt"]},
    {"code":"gb","name":"United Kingdom","flag":"🇬🇧","tier":5,"base":290,
     "cities":["Bradford","Belfast","Coventry","Leicester","Nottingham","Cardiff","Liverpool","Bristol","Edinburgh","Leeds","Sheffield","Birmingham","Manchester","London Canary Wharf","London Kensington"]},
    {"code":"in","name":"India","flag":"🇮🇳","tier":5,"base":290,
     "cities":["Visakhapatnam","Nagpur","Kanpur","Lucknow","Surat","Jaipur","Ahmedabad","Pune","Kolkata","Chennai","Hyderabad","Bangalore Whitefield","Delhi Connaught Place","Mumbai Bandra","Mumbai Nariman Point"]},
    {"code":"jp","name":"Japan","flag":"🇯🇵","tier":5,"base":310,
     "cities":["Sakai","Kitakyushu","Sendai","Hiroshima","Saitama","Chiba","Kyoto","Fukuoka","Kawasaki","Kobe","Sapporo","Nagoya","Yokohama","Osaka","Tokyo Minato"]},
    {"code":"nl","name":"Netherlands","flag":"🇳🇱","tier":5,"base":320,
     "cities":["Zaandam","Enschede","Arnhem","Amersfoort","Breda","Nijmegen","Haarlem","Almere","Groningen","Tilburg","Eindhoven","Utrecht","The Hague","Rotterdam","Amsterdam Canal Ring"]},
    # ── TIER 6 — Global Financial Hubs (GDP/cap > $65k) ─────────────────────
    # Tier 6: base 360-500, highest city = $500
    {"code":"us","name":"United States","flag":"🇺🇸","tier":6,"base":360,
     "cities":["Jacksonville","Columbus","Fort Worth","Charlotte","Phoenix","San Antonio","Houston","Dallas","Philadelphia","Chicago","San Diego","Austin","Los Angeles","San Francisco","New York Manhattan"]},
    {"code":"sg","name":"Singapore","flag":"🇸🇬","tier":6,"base":370,
     "cities":["Woodlands","Yishun","Hougang","Sengkang","Punggol","Tampines","Ang Mo Kio","Bedok","Clementi","Queenstown","Toa Payoh","Kallang","Jurong East","Bukit Timah","Orchard Road"]},
    {"code":"ch","name":"Switzerland","flag":"🇨🇭","tier":6,"base":360,
     "cities":["Schaffhausen","Winterthur","Lucerne","St. Gallen","Biel","Thun","Chur","Lausanne","Bern","Lugano","Basel","Zurich Altstetten","Zurich Oerlikon","Geneva","Zurich Seefeld"]},
]


# ═══════════════════════════════════════════════════════
#  DOMESTIC MAPS — state/region-based property sets
# ═══════════════════════════════════════════════════════
DOMESTIC_MAPS = {
    "india": {
        "name":"India","flag":"🇮🇳",
        "states":[
            {"name":"Maharashtra",   "cities":["Mumbai","Pune","Nagpur","Nashik","Aurangabad","Solapur","Amravati","Kolhapur","Thane","Navi Mumbai"]},
            {"name":"Delhi NCR",     "cities":["Delhi","Noida","Gurugram","Faridabad","Ghaziabad","Meerut","Panipat","Sonipat"]},
            {"name":"Karnataka",     "cities":["Bangalore","Mysore","Hubli","Mangalore","Belgaum","Shimoga","Tumkur","Bidar"]},
            {"name":"Tamil Nadu",    "cities":["Chennai","Coimbatore","Madurai","Tiruchirappalli","Salem","Erode","Tirunelveli","Vellore"]},
            {"name":"West Bengal",   "cities":["Kolkata","Howrah","Durgapur","Asansol","Siliguri","Malda","Bardhaman","Kharagpur"]},
            {"name":"Gujarat",       "cities":["Ahmedabad","Surat","Vadodara","Rajkot","Bhavnagar","Jamnagar","Junagadh","Gandhinagar"]},
            {"name":"Rajasthan",     "cities":["Jaipur","Jodhpur","Udaipur","Kota","Bikaner","Ajmer","Bhilwara","Alwar"]},
            {"name":"Uttar Pradesh", "cities":["Lucknow","Kanpur","Agra","Varanasi","Allahabad","Meerut","Aligarh","Moradabad"]},
        ]
    },
    "uk": {
        "name":"United Kingdom","flag":"🇬🇧",
        "states":[
            {"name":"England — London",   "cities":["London","Greenwich","Croydon","Wimbledon","Hackney","Islington","Southwark","Lambeth"]},
            {"name":"England — Midlands", "cities":["Birmingham","Coventry","Leicester","Nottingham","Derby","Wolverhampton","Stoke","Walsall"]},
            {"name":"England — North",    "cities":["Manchester","Leeds","Liverpool","Sheffield","Bradford","Hull","Salford","Oldham"]},
            {"name":"Scotland",           "cities":["Glasgow","Edinburgh","Aberdeen","Dundee","Inverness","Stirling","Perth","Paisley"]},
            {"name":"Wales",              "cities":["Cardiff","Swansea","Newport","Wrexham","Barry","Neath","Rhondda","Merthyr Tydfil"]},
            {"name":"Northern Ireland",   "cities":["Belfast","Derry","Lisburn","Newry","Armagh","Ballymena","Coleraine","Bangor"]},
            {"name":"South East",         "cities":["Brighton","Oxford","Southampton","Portsmouth","Reading","Slough","Guildford","Milton Keynes"]},
            {"name":"South West",         "cities":["Bristol","Plymouth","Exeter","Bath","Swindon","Gloucester","Cheltenham","Bournemouth"]},
        ]
    },
    "usa": {
        "name":"United States","flag":"🇺🇸",
        "states":[
            {"name":"California",  "cities":["Los Angeles","San Francisco","San Diego","San Jose","Sacramento","Fresno","Long Beach","Oakland"]},
            {"name":"New York",    "cities":["New York City","Buffalo","Rochester","Yonkers","Syracuse","Albany","New Rochelle","White Plains"]},
            {"name":"Texas",       "cities":["Houston","Dallas","San Antonio","Austin","Fort Worth","El Paso","Arlington","Corpus Christi"]},
            {"name":"Florida",     "cities":["Miami","Orlando","Tampa","Jacksonville","St. Petersburg","Hialeah","Tallahassee","Fort Lauderdale"]},
            {"name":"Illinois",    "cities":["Chicago","Aurora","Naperville","Joliet","Rockford","Springfield","Peoria","Elgin"]},
            {"name":"Pennsylvania","cities":["Philadelphia","Pittsburgh","Allentown","Erie","Reading","Scranton","Bethlehem","Lancaster"]},
            {"name":"Ohio",        "cities":["Columbus","Cleveland","Cincinnati","Toledo","Akron","Dayton","Parma","Canton"]},
            {"name":"Georgia",     "cities":["Atlanta","Augusta","Macon","Savannah","Athens","Sandy Springs","Roswell","Warner Robins"]},
        ]
    }
}

# ═══════════════════════════════════════════════════════
#  SETTINGS
# ═══════════════════════════════════════════════════════
def default_settings():
    return {
        "currency":"$","startingCash":1500,"goSalary":200,
        "airportFee":100,"travelFee":150,"railwayFee":75,
        "incomeTaxRate":10,"propertyTaxRate":2,
        "propertyTaxPerHouse":5,"propertyTaxPerHotel":20,
        "gainsTaxRate":15,"gainsTaxThreshold":1000,
        "randomTaxMultiplier":15,"taxReturnRate":50,"taxReturnMoveEvery":3,
        "depositRate":5,"loanRate":10,"creditCardFee":50,
        "creditCardLimit":500,"creditCardRounds":2,
        "insurancePremium":50,"insurancePayout":75,
        "govGrantAmount":200,"govBailoutAmount":200,
        "evenBuild":True,"mortgageEnabled":True,"auctionMode":False,
        "noRentInJail":True,"treasurePot":True,
        "housingRule":"monopoly","maxPlayers":6,"privateRoom":False,
        "enableVeryBadSurprises":True,"enableVeryGoodSurprises":True,
    }

# ═══════════════════════════════════════════════════════
#  GAME INIT
# ═══════════════════════════════════════════════════════
def init_game(room):
    S = (room.get("mapConfig") or {}).get("tilesPerSide", 9)
    board = (room.get("mapConfig") or {}).get("spaces") or generate_default_board(S)
    players = [mk_game_player(p, room["settings"]) for p in room["players"]]
    prop_positions = [s["pos"] for s in board if s.get("type") == "property"]
    tax_return_pool = random.sample(prop_positions, min(6, len(prop_positions)))
    rnd_tax_pool = random.sample(
        [p for p in prop_positions if p not in tax_return_pool],
        min(8, len([p for p in prop_positions if p not in tax_return_pool]))
    )
    hazard_pool = [s["pos"] for s in board if s.get("type") == "chance"]
    chance_deck = list(SURPRISE_CARDS); random.shuffle(chance_deck)
    chest_deck  = list(CHEST_CARDS);   random.shuffle(chest_deck)
    return {
        "board":board,"players":players,"tilesPerSide":S,
        "currentPlayerIdx":0,"phase":"roll",
        "lastRoll":None,"doublesCount":0,
        "log":[f"🎲 Game started! {players[0]['name']} goes first."],
        "settings":dict(room["settings"]),
        "chanceDeck":chance_deck,"chestDeck":chest_deck,
        "chanceIdx":0,"chestIdx":0,"winner":None,
        "treasurePot":0 if room["settings"].get("treasurePot") else None,
        "hazardPos":hazard_pool[0] if hazard_pool else 7,
        "hazardPool":hazard_pool,
        "randomTaxPos":rnd_tax_pool[0] if rnd_tax_pool else 22,
        "randomTaxPool":rnd_tax_pool,
        "taxReturnPos":tax_return_pool[0] if tax_return_pool else 15,
        "taxReturnPool":tax_return_pool,
        "taxReturnLastMoved":0,
        "taxesPaidByPlayer":{},
        "round":1,"turnInRound":0,
        "pendingEvent":None,
    }

def mk_game_player(p, s):
    return {
        "id":p["id"],"name":p["name"],"token":p["token"],"color":p["color"],
        "avatar":p.get("avatar",{"style":"circle","hairStyle":"none","beardStyle":"none","skinTone":"#F5CBA7"}),
        "money":s["startingCash"],"position":0,"jailTurns":0,"inJail":False,
        "badDebt":False,"badDebtTurns":0,"properties":[],
        "jailCards":0,"govProtCards":0,"bankrupted":False,"disconnected":False,
        "bankDeposit":0,"bankDepositInterest":0,"loans":[],"creditCard":None,
        "hasInsurance":False,
        "pendingHazardLoss":0,"pendingHazardHouses":0,"pendingHazardRebuildCost":0,
        "totalEarned":s["startingCash"],
    }

# ═══════════════════════════════════════════════════════
#  ACTION ROUTER
# ═══════════════════════════════════════════════════════
def process_action(gs, pi, action, data):
    p = gs["players"][pi]
    if p["bankrupted"] and action != "end_turn":
        next_turn(gs); return gs
    match action:
        case "roll":            do_roll(gs, pi)
        case "buy":             do_buy(gs, pi, data)
        case "pass":            do_end_turn(gs, pi)
        case "end_turn":        do_end_turn(gs, pi)
        case "build":           do_build(gs, pi, data)
        case "sell_house":      do_sell_house(gs, pi, data)
        case "mortgage":        do_mortgage(gs, pi, data)
        case "unmortgage":      do_unmortgage(gs, pi, data)
        case "pay_jail":        do_pay_jail(gs, pi)
        case "use_jail_card":   do_use_jail_card(gs, pi)
        case "use_gov_prot":    do_use_gov_prot(gs, pi)
        case "travel_air":      do_travel_air(gs, pi, data)
        case "travel_rail":     do_travel_rail(gs, pi, data)
        case "skip_travel":     gs["phase"] = "action"
        case "go_pay_emi":      do_go_pay_emi(gs, pi)
        case "go_end":          gs["pendingEvent"]=None; gs["phase"]="action"
        case "bank_deposit":    do_bank_deposit(gs, pi, data)
        case "bank_withdraw":   do_bank_withdraw(gs, pi, data)
        case "bank_loan":       do_bank_loan(gs, pi, data)
        case "bank_repay":      do_bank_repay(gs, pi, data)
        case "bank_credit":     do_bank_credit(gs, pi, data)
        case "bank_pay_emi":    do_bank_pay_emi(gs, pi)
        case "bank_foreclose_loans": do_bank_foreclose_loans(gs, pi)
        case "bank_foreclose_credit": do_bank_foreclose_credit(gs, pi)
        case "bank_surrender_credit": do_bank_surrender_credit(gs, pi)
        case "bank_insurance":  do_bank_insurance(gs, pi)
        case "claim_insurance": do_claim_insurance(gs, pi)
        case "hazard_ack"|"gov_ack":
            gs["phase"]="action"; gs["pendingEvent"]=None
        case "start_auction":   do_start_auction(gs, pi, data)
        case "auction_bid":     do_auction_bid(gs, pi, data)
        case "auction_fold":    do_auction_fold(gs, pi)
        case "auction_end":     do_auction_end(gs)
        case "bankrupt_auction":do_start_bankrupt_auction(gs, pi, data)
        case _: pass
    return gs

# ═══════════════════════════════════════════════════════
#  ROLL & INTEREST
# ═══════════════════════════════════════════════════════
def do_roll(gs, idx):
    if gs["phase"] != "roll": return
    p = gs["players"][idx]
    d1, d2 = random.randint(1,6), random.randint(1,6)
    doubles = d1 == d2
    gs["lastRoll"] = [d1, d2]
    if p["badDebt"]:
        p["badDebtTurns"] += 1
        gs["log"].append(f"⛓️ {p['name']} in bad-debt jail ({p['badDebtTurns']}/3).")
        if p["badDebtTurns"] >= 3:
            p.update({"badDebt":False,"badDebtTurns":0,"inJail":False,"jailTurns":0})
            gs["log"].append(f"{p['name']} released from bad-debt jail.")
        gs["phase"] = "action"; return
    if p["inJail"]:
        if doubles:
            p["inJail"] = False; p["jailTurns"] = 0
            gs["log"].append(f"{p['name']} rolled doubles — out of jail!")
        else:
            p["jailTurns"] += 1
            if p["jailTurns"] >= 3:
                p["money"] -= 50; p.update({"inJail":False,"jailTurns":0})
                gs["log"].append(f"{p['name']} paid $50 after 3 turns.")
            else:
                gs["log"].append(f"{p['name']} in jail ({p['jailTurns']}/3)")
                gs["phase"] = "action"; return
    else:
        if doubles:
            gs["doublesCount"] += 1
            if gs["doublesCount"] >= 3:
                send_jail(gs, idx); gs["phase"] = "action"; return
        else:
            gs["doublesCount"] = 0
    move_player(gs, idx, d1+d2)

def accrue_interest(gs, idx):
    p = gs["players"][idx]; s = gs["settings"]
    n = max(1, sum(1 for q in gs["players"] if not q["bankrupted"]))
    if p["bankDeposit"] > 0:
        i = math.floor(p["bankDeposit"]*(s["depositRate"]/100)/n)
        p["bankDepositInterest"] += i
        if i > 0: gs["log"].append(f"🏦 Deposit interest +{s['currency']}{i}")
    dead = []
    for loan in p["loans"]:
        i = math.ceil(loan["remaining"]*(s["loanRate"]/100)/n)
        loan["remaining"] += i; loan["turnsLeft"] -= 1
        if loan["turnsLeft"] <= 0 and loan["remaining"] > 0:
            enforce_bad_debt(gs, idx, loan); dead.append(loan)
    p["loans"] = [l for l in p["loans"] if l not in dead]
    cc = p.get("creditCard")
    if cc and cc.get("active"):
        cc["roundsLeft"] -= 1.0/n
        if cc["roundsLeft"] <= 0 and cc.get("used",0) > 0:
            enforce_credit_debt(gs, idx)

def enforce_bad_debt(gs, idx, loan):
    p = gs["players"][idx]
    p.update({"badDebt":True,"badDebtTurns":0,"inJail":True,"position":10,"jailTurns":0})
    gs["log"].append(f"🔴 {p['name']} → BAD-DEBT JAIL.")
    seize_collateral(gs, idx, loan["remaining"])
    p["loans"] = [l for l in p["loans"] if l is not loan]

def enforce_credit_debt(gs, idx):
    p = gs["players"][idx]
    p.update({"badDebt":True,"badDebtTurns":0,"inJail":True,"position":10,"jailTurns":0,"creditCard":None})
    gs["log"].append(f"🔴 {p['name']} defaulted on credit card.")
    seize_collateral(gs, idx, 500)

def seize_collateral(gs, idx, amount):
    p = gs["players"][idx]; seized = 0
    for pos in list(p["properties"]):
        sp = gs["board"][pos]
        if seized >= amount: break
        if sp.get("houses",0) > 0:
            v = sp.get("houseCost",0)*sp["houses"]; seized += v; sp["houses"] = 0
    for pos in list(p["properties"]):
        sp = gs["board"][pos]
        if seized >= amount or sp.get("mortgaged"): continue
        sp["mortgaged"] = True; seized += math.floor(sp.get("price",0)/2)

# ═══════════════════════════════════════════════════════
#  MOVEMENT
# ═══════════════════════════════════════════════════════
def move_player(gs, idx, steps):
    p = gs["players"][idx]; prev = p["position"]
    p["position"] = (p["position"]+steps) % len(gs["board"])
    if p["position"] < prev and steps > 0:
        earn_money(gs, idx, gs["settings"]["goSalary"], "GO salary")
        if p.get("hasInsurance"):
            p["money"] -= gs["settings"]["insurancePremium"]
    land_on(gs, idx)

def apply_round_economy(gs):
    s = gs["settings"]
    for i,p in enumerate(gs["players"]):
        if p.get("bankrupted") or p.get("disconnected") or p.get("isSpectator"): continue
        if p.get("bankDeposit",0) > 0:
            intr = math.floor(p["bankDeposit"]*(s["depositRate"]/100))
            p["bankDepositInterest"] += intr
        dead = []
        for loan in p.get("loans",[]):
            intr = math.ceil(loan["remaining"]*(s["loanRate"]/100))
            loan["remaining"] += intr
            loan["turnsLeft"] -= 1
            if loan["turnsLeft"] <= 0 and loan["remaining"] > 0:
                enforce_bad_debt(gs, i, loan)
                dead.append(loan)
        p["loans"] = [l for l in p.get("loans",[]) if l not in dead]
        cc = p.get("creditCard")
        if cc and cc.get("active"):
            cc["roundsLeft"] -= 1
            if cc["roundsLeft"] <= 0 and cc.get("used",0) > 0:
                enforce_credit_debt(gs, i)

def end_round_on_start(gs):
    gs["round"] = gs.get("round",1) + 1
    gs["turnInRound"] = 0
    apply_round_economy(gs)
    pool=[p for p in gs["hazardPool"] if p!=gs["hazardPos"]]
    if pool: gs["hazardPos"] = random.choice(pool)
    if gs["round"]-gs["taxReturnLastMoved"]>=gs["settings"]["taxReturnMoveEvery"]:
        pool2=[p for p in gs["taxReturnPool"] if p!=gs["taxReturnPos"]]
        if pool2:
            gs["taxReturnPos"] = random.choice(pool2)
            gs["taxReturnLastMoved"] = gs["round"]

def land_on(gs, idx):
    p = gs["players"][idx]; sp = gs["board"][p["position"]]; pos = p["position"]
    gs["log"].append(f"📍 {p['name']} → {sp['name']}")
    if pos == gs["hazardPos"]:    apply_hazard(gs, idx); return
    if pos == gs["taxReturnPos"]: land_tax_return(gs, idx); return
    if pos == gs["randomTaxPos"]: land_random_tax(gs, idx); return
    t = sp.get("type"); s = gs["settings"]
    if t == "go":
        end_round_on_start(gs)
        cc = p.get("creditCard")
        if cc and cc.get("active") and cc.get("used",0) > 0:
            gs["phase"] = "go_prompt"
            gs["pendingEvent"] = {"type":"go_prompt","emi":min(cc.get("emi",0),cc.get("used",0))}
            return
        gs["phase"] = "action"
    elif t == "jail": gs["phase"] = "action"
    elif t == "free_parking":
        pot = gs.get("treasurePot")
        if pot: earn_money(gs, idx, pot, "Treasure Pot"); gs["treasurePot"] = 0
        gs["phase"] = "action"
    elif t == "go_to_jail": send_jail(gs, idx); gs["phase"] = "action"
    elif t == "income_tax":
        pay_tax(gs, idx, math.floor(p["money"]*(s["incomeTaxRate"]/100)), "Income Tax"); gs["phase"] = "action"
    elif t == "property_tax":
        pv = sum(gs["board"][x].get("price",0) for x in p["properties"])
        h = sum(min(gs["board"][x].get("houses",0),4) for x in p["properties"])
        ho = sum(1 for x in p["properties"] if gs["board"][x].get("houses",0)==5)
        pay_tax(gs, idx, max(0, math.floor(pv*(s["propertyTaxRate"]/100))+h*s["propertyTaxPerHouse"]+ho*s.get("propertyTaxPerHotel",20)), "Property Tax")
        gs["phase"] = "action"
    elif t == "gains_tax":
        gains = max(0, p["totalEarned"]-s["gainsTaxThreshold"])
        amt = math.floor(gains*(s["gainsTaxRate"]/100))
        if amt > 0: pay_tax(gs, idx, amt, "Gains Tax"); p["totalEarned"] = 0
        gs["phase"] = "action"
    elif t == "luxury_tax": pay_tax(gs, idx, 100, "Luxury Tax"); gs["phase"] = "action"
    elif t == "chance": draw_surprise(gs, idx)
    elif t == "chest": draw_chest(gs, idx)
    elif t == "gov_prot": land_gov_prot(gs, idx)
    elif t in ("property","utility"):
        if not sp.get("owner"): gs["phase"] = "buy"
        else: pay_rent_check(gs, idx, sp)
    elif t == "airport":
        if not sp.get("owner"): gs["phase"] = "buy"
        else: pay_airport_fee(gs, idx, sp); gs["phase"] = "air_travel"
    elif t == "railway":
        if not sp.get("owner"): gs["phase"] = "buy"
        else: pay_railway_fee(gs, idx, sp); gs["phase"] = "rail_travel"
    else: gs["phase"] = "action"

def pay_rent_check(gs, idx, sp):
    p = gs["players"][idx]
    own = next((q for q in gs["players"] if q["id"]==sp.get("owner")), None)
    if not own or own["id"]==p["id"] or own["bankrupted"] or sp.get("mortgaged") or \
       (gs["settings"].get("noRentInJail") and own.get("inJail")):
        gs["phase"] = "action"; return
    rent = calc_rent(gs, sp)
    charge_money(gs, idx, rent, f"rent to {own['name']}"); own["money"] += rent
    gs["phase"] = "action"

def pay_airport_fee(gs, idx, sp):
    p = gs["players"][idx]
    own = next((q for q in gs["players"] if q["id"]==sp.get("owner")), None)
    if not own or own["id"]==p["id"] or own["bankrupted"] or sp.get("mortgaged"): return
    cnt = sum(1 for s in gs["board"] if s.get("type")=="airport" and s.get("owner")==own["id"])
    fee = gs["settings"]["airportFee"]*cnt
    charge_money(gs, idx, fee, f"airport fee to {own['name']}"); own["money"] += fee

def pay_railway_fee(gs, idx, sp):
    p = gs["players"][idx]
    own = next((q for q in gs["players"] if q["id"]==sp.get("owner")), None)
    if not own or own["id"]==p["id"] or own["bankrupted"] or sp.get("mortgaged"): return
    cnt = sum(1 for s in gs["board"] if s.get("type")=="railway" and s.get("owner")==own["id"])
    fee = int(25*(2**(cnt-1)))
    charge_money(gs, idx, fee, f"railway fee to {own['name']}"); own["money"] += fee

def has_full_set(gs, sp):
    """True if owner controls all properties in the same country (fallback: group)."""
    if sp.get("type") != "property" or not sp.get("owner"): return False

    code = str(sp.get("countryCode") or "").lower()
    if code:
      country_set = [
          s for s in gs["board"]
          if s.get("type") == "property" and str(s.get("countryCode") or "").lower() == code
      ]
      return len(country_set) > 1 and all(s.get("owner") == sp.get("owner") for s in country_set)

    if not sp.get("group"): return False
    grp = [s for s in gs["board"] if s.get("group")==sp.get("group") and s.get("type")=="property"]
    return len(grp)>1 and all(s.get("owner")==sp.get("owner") for s in grp)

def get_property_set(gs, sp):
    if not sp or sp.get("type") != "property": return []
    code = str(sp.get("countryCode") or "").lower()
    if code:
        return [
            s for s in gs["board"]
            if s.get("type") == "property" and str(s.get("countryCode") or "").lower() == code
        ]
    if not sp.get("group"): return []
    return [s for s in gs["board"] if s.get("type") == "property" and s.get("group") == sp.get("group")]

def calc_rent(gs, sp):
    if sp.get("type") == "utility":
        roll = sum(gs.get("lastRoll") or [3,3])
        cnt = sum(1 for s in gs["board"] if s.get("type")=="utility" and s.get("owner")==sp.get("owner"))
        return roll*(10 if cnt==2 else 4)
    h = sp.get("houses",0); rents = sp.get("rents",[0]*6)
    r = rents[min(h, len(rents)-1)]
    # 2x base rent on full set when enabled and no houses yet
    if h==0 and has_full_set(gs, sp) and gs.get("settings", {}).get("doubleRentOnSet", True): r = r*2
    return r

# ═══════════════════════════════════════════════════════
#  TAX / HAZARD / CARDS / BANK — (same logic as original)
# ═══════════════════════════════════════════════════════
def pay_tax(gs, idx, amount, label):
    p = gs["players"][idx]; actual = min(amount, p["money"]); p["money"] -= actual
    if gs.get("treasurePot") is not None: gs["treasurePot"] = (gs["treasurePot"] or 0)+actual
    gs["taxesPaidByPlayer"][p["id"]] = gs["taxesPaidByPlayer"].get(p["id"],0)+actual
    gs["log"].append(f"{p['name']} paid {gs['settings']['currency']}{actual} {label}.")
    chk_bankrupt(gs, idx)

def land_tax_return(gs, idx):
    p = gs["players"][idx]; paid = gs["taxesPaidByPlayer"].get(p["id"],0)
    if paid <= 0: gs["log"].append(f"🟢 {p['name']} on Tax Return — no taxes paid yet."); gs["phase"]="action"; return
    refund = math.floor(paid*(gs["settings"]["taxReturnRate"]/100))
    earn_money(gs, idx, refund, "Tax Return")
    gs["taxesPaidByPlayer"][p["id"]] = 0
    gs["pendingEvent"] = {"type":"tax_return","message":f"{p['name']} gets back {gs['settings']['currency']}{refund}!"}
    gs["phase"] = "action"

def land_random_tax(gs, idx):
    d1, d2 = random.randint(1,6), random.randint(1,6)
    amt = (d1+d2)*gs["settings"]["randomTaxMultiplier"]
    pay_tax(gs, idx, amt, "Random Tax")
    pool = [p for p in gs["randomTaxPool"] if p!=gs["randomTaxPos"]]
    if pool: gs["randomTaxPos"] = random.choice(pool)
    gs["phase"] = "action"

def apply_hazard(gs, idx):
    p = gs["players"][idx]; haz = random.choice(HAZARDS)
    lost_money=0; lost_houses=0; lost_rebuild=0
    if haz["type"]=="money": lost_money=min(haz["amount"],p["money"]); p["money"]-=lost_money
    elif haz["type"]=="robbery":
        lost_money=math.floor(max(0,p["money"])*0.8)
        p["money"]-=lost_money
    elif haz["type"] in ("disaster","fire"):
        owned=[gs["board"][pos] for pos in p["properties"] if gs["board"][pos].get("houses",0)>0]
        if haz["type"]=="fire":
            if owned:
                sp=owned[0]; demolished=sp["houses"]; lost_rebuild+=demolished*sp.get("houseCost",0)
                sp["houses"]=0; lost_houses+=demolished
        else:
            cnt=haz.get("fixed") or (1+random.randint(0,1)); d=0
            for sp in owned:
                if d>=cnt: break
                lost_rebuild+=sp.get("houseCost",0); sp["houses"]-=1; d+=1; lost_houses+=1
    p["pendingHazardLoss"]+=lost_money; p["pendingHazardHouses"]+=lost_houses; p["pendingHazardRebuildCost"]+=lost_rebuild
    chk_bankrupt(gs, idx)
    pool=[pos for pos in gs["hazardPool"] if pos!=gs["hazardPos"]]
    if pool: gs["hazardPos"]=random.choice(pool)
    gs["pendingEvent"]={"type":"hazard","hazard":haz,"lostMoney":lost_money,"lostHouses":lost_houses,"lostRebuildCost":lost_rebuild,"hasInsurance":p.get("hasInsurance",False)}
    gs["phase"]="hazard_event"

def land_gov_prot(gs, idx):
    p=gs["players"][idx]; s=gs["settings"]; cur=s["currency"]; msg=""
    if p["badDebt"] and p["govProtCards"]>0:
        p["govProtCards"]-=1; p.update({"badDebt":False,"badDebtTurns":0,"inJail":False})
        earn_money(gs, idx, s["govBailoutAmount"], "Gov bailout")
        msg=f"🏛️ {p['name']} BAILED OUT! Gets {cur}{s['govBailoutAmount']}"
    elif p.get("pendingHazardLoss",0)>0 or p.get("pendingHazardRebuildCost",0)>0:
        mc=p.get("pendingHazardLoss",0); rc=p.get("pendingHazardRebuildCost",0); tc=mc+rc
        earn_money(gs, idx, tc, "Gov hazard compensation")
        p.update({"pendingHazardLoss":0,"pendingHazardHouses":0,"pendingHazardRebuildCost":0})
        msg=f"🏛️ Government compensates {p['name']} {cur}{tc}!"
    elif p["money"]<100:
        earn_money(gs, idx, s["govGrantAmount"], "Gov grant")
        msg=f"🏛️ {p['name']} gets grant: {cur}{s['govGrantAmount']}"
    else: msg=f"🏛️ {p['name']} on Gov. Protection — all good!"
    gs["log"].append(msg); gs["pendingEvent"]={"type":"gov_prot","message":msg}; gs["phase"]="gov_prot_event"

def draw_surprise(gs, idx):
    roll=random.randint(0,99)
    if roll==0 and gs["settings"].get("enableVeryGoodSurprises"): card,tier=random.choice(VERY_GOOD),"very_good"
    elif roll==1 and gs["settings"].get("enableVeryBadSurprises"): card,tier=random.choice(VERY_BAD),"very_bad"
    elif roll<=49: card,tier=random.choice(BAD_SURP),"bad"
    else: card,tier=random.choice(GOOD_SURP),"good"
    gs["chanceIdx"]+=1
    gs["pendingEvent"]={"type":"surprise","card":card,"tier":tier,"isSpecialCard":True}
    gs["log"].append(f"🃏 Surprise ({tier}): {card.get('text',card.get('title',''))}")
    apply_card(gs, idx, card, surprise=True)

def draw_chest(gs, idx):
    deck=gs["chestDeck"]; c=deck[gs["chestIdx"]%len(deck)]; gs["chestIdx"]+=1
    gs["log"].append(f"📦 Chest: {c['text']}"); apply_card(gs, idx, c, surprise=False)

def apply_card(gs, idx, card, *, surprise):
    p=gs["players"][idx]; a=card.get("action")
    if   a=="gain":  earn_money(gs, idx, card["amount"], "card")
    elif a=="pay":
        if isinstance(card.get("walletPercentOfCash"), (int,float)) and card.get("walletPercentOfCash",0)>0:
            amount=math.floor(max(0,p["money"])*(card["walletPercentOfCash"]/100))
            p["money"]-=amount
        else:
            charge_money(gs, idx, card["amount"], "card penalty")
    elif a=="goto":
        p["position"]=card["position"]
        if card["position"]==0: earn_money(gs, idx, gs["settings"]["goSalary"], "GO")
        land_on(gs, idx); return
    elif a=="jail": send_jail(gs, idx); gs["phase"]="action"; return
    elif a=="back3": p["position"]=max(0,p["position"]-3); land_on(gs, idx); return
    elif a=="jail_card": p["jailCards"]+=1
    elif a=="gov_card": p["govProtCards"]+=1; gs["log"].append(f"🏛️ {p['name']} got a Gov Protection card!")
    elif a=="insurance_free":
        if not p.get("hasInsurance"): p["hasInsurance"]=True; gs["log"].append(f"🛡️ {p['name']} got free insurance!")
    elif a=="birthday":
        for i,op in enumerate(gs["players"]):
            if i!=idx and not op["bankrupted"]: op["money"]-=50; earn_money(gs, idx, 50, "birthday")
    elif a=="repairs":
        h=sum(min(gs["board"][x].get("houses",0),4) for x in p["properties"])
        ho=sum(1 for x in p["properties"] if gs["board"][x].get("houses",0)==5)
        charge_money(gs, idx, h*40+ho*115, "repairs")
    chk_bankrupt(gs, idx)
    if gs["phase"]=="hazard_event": return
    gs["phase"]="surprise_event" if surprise and gs.get("pendingEvent",{}).get("isSpecialCard") else "action"

# ═══════════════════════════════════════════════════════
#  BUY / BUILD / MORTGAGE
# ═══════════════════════════════════════════════════════
def do_buy(gs, idx, data):
    p=gs["players"][idx]; sp=gs["board"][p["position"]]
    if not sp or sp.get("owner"): gs["phase"]="action"; return
    cc=p.get("creditCard"); cc_room=(cc["limit"]-cc.get("used",0)) if cc and cc.get("active") else 0
    use_credit=bool((data or {}).get("useCredit"))
    if use_credit:
        if not cc or not cc.get("active") or cc_room < sp["price"]: gs["phase"]="action"; return
        cc["used"] = cc.get("used",0) + sp["price"]
    else:
        if p["money"]+cc_room<sp["price"]: gs["phase"]="action"; return
        if p["money"]>=sp["price"]: p["money"]-=sp["price"]
        else:
            fc=sp["price"]-p["money"]; cc["used"]=cc.get("used",0)+fc; p["money"]=0
    sp["owner"]=p["id"]; p["properties"].append(p["position"])
    gs["log"].append(f"🏠 {p['name']} bought {sp['name']} for {gs['settings']['currency']}{sp['price']}")
    gs["phase"]="action"

def do_end_turn(gs, idx):
    p=gs["players"][idx]; last=gs.get("lastRoll") or []
    if gs.get("phase") == "buy":
        gs["log"].append(f"⚠️ {p['name']} must buy or auction this property.")
        return
    if len(last)==2 and last[0]==last[1] and not p["inJail"] and not p["badDebt"]:
        gs["phase"]="roll"; gs["log"].append(f"{p['name']} rolled doubles — roll again!")
    else: next_turn(gs)

def do_build(gs, idx, data):
    p,pos=gs["players"][idx],data.get("position")
    if pos is None or pos>=len(gs["board"]): return
    sp=gs["board"][pos]
    if not sp or sp.get("owner")!=p["id"] or sp.get("type")!="property": return
    prop_set=get_property_set(gs, sp)
    if gs["settings"]["housingRule"]=="monopoly":
        if not (len(prop_set)>1 and all(s.get("owner")==p["id"] for s in prop_set)): return
    hc=sp.get("houseCost",100)
    if p["money"]<hc or sp.get("houses",0)>=5: return
    if gs["settings"].get("evenBuild"):
        if prop_set and sp.get("houses",0)>min(s.get("houses",0) for s in prop_set): return
    p["money"]-=hc; sp["houses"]=sp.get("houses",0)+1
    gs["log"].append(f"🏗️ {p['name']} built on {sp['name']}")

def do_sell_house(gs, idx, data):
    p,pos=gs["players"][idx],data.get("position")
    if pos is None or pos>=len(gs["board"]): return
    sp=gs["board"][pos]
    if not sp or sp.get("owner")!=p["id"] or not sp.get("houses"): return
    prop_set=get_property_set(gs, sp)
    if gs["settings"].get("evenBuild"):
        if prop_set and sp.get("houses",0)<max(s.get("houses",0) for s in prop_set): return
    earn_money(gs, idx, math.floor(sp.get("houseCost",100)/2), "sold house")
    sp["houses"]-=1

def do_mortgage(gs, idx, data):
    p,pos=gs["players"][idx],data.get("position")
    if pos is None or pos>=len(gs["board"]): return
    sp=gs["board"][pos]
    if not sp or sp.get("owner")!=p["id"] or sp.get("mortgaged") or sp.get("houses",0)>0: return
    sp["mortgaged"]=True; earn_money(gs, idx, math.floor(sp["price"]/2), "mortgage")
    gs["log"].append(f"{p['name']} mortgaged {sp['name']}")

def do_unmortgage(gs, idx, data):
    p,pos=gs["players"][idx],data.get("position")
    if pos is None or pos>=len(gs["board"]): return
    sp=gs["board"][pos]
    if not sp or sp.get("owner")!=p["id"] or not sp.get("mortgaged"): return
    cost=math.floor(sp["price"]*0.55)
    if p["money"]<cost: return
    sp["mortgaged"]=False; p["money"]-=cost

def do_pay_jail(gs, idx):
    p=gs["players"][idx]
    if not p["inJail"] or p["badDebt"]: return
    charge_money(gs, idx, 50, "jail fine"); p["inJail"]=False; p["jailTurns"]=0; gs["phase"]="roll"

def do_use_jail_card(gs, idx):
    p=gs["players"][idx]
    if not p["inJail"] or p["jailCards"]<1 or p["badDebt"]: return
    p["jailCards"]-=1; p["inJail"]=False; p["jailTurns"]=0; gs["phase"]="roll"

def do_use_gov_prot(gs, idx):
    p=gs["players"][idx]
    if not p["badDebt"] or p["govProtCards"]<1: return
    p["govProtCards"]-=1; p.update({"badDebt":False,"badDebtTurns":0,"inJail":False})
    earn_money(gs, idx, gs["settings"]["govBailoutAmount"], "Gov bailout"); gs["phase"]="action"

def do_travel_air(gs, idx, data):
    p=gs["players"][idx]; dest_pos=data.get("destPos")
    if dest_pos is None or dest_pos>=len(gs["board"]): return
    dest=gs["board"][dest_pos]
    if not dest or dest.get("type")!="airport": return
    charge_money(gs, idx, gs["settings"]["travelFee"], "air travel")
    if gs.get("treasurePot") is not None: gs["treasurePot"]=(gs["treasurePot"] or 0)+gs["settings"]["travelFee"]
    p["position"]=dest_pos; gs["log"].append(f"✈️ {p['name']} flew to {dest['name']}"); gs["phase"]="action"

def do_travel_rail(gs, idx, data):
    p=gs["players"][idx]; dest_pos=data.get("destPos")
    if dest_pos is None: return
    cur=gs["board"][p["position"]]
    if dest_pos not in (cur.get("connects") or []): return
    fee=gs["settings"].get("railwayFee",75)
    charge_money(gs, idx, fee, "railway ride")
    if gs.get("treasurePot") is not None: gs["treasurePot"]=(gs["treasurePot"] or 0)+fee
    if dest_pos in (cur.get("goBonus") or []): earn_money(gs, idx, gs["settings"]["goSalary"], "railway GO bonus")
    p["position"]=dest_pos; gs["log"].append(f"🚂 {p['name']} rode to {gs['board'][dest_pos].get('name','railway')}"); gs["phase"]="action"

def do_go_pay_emi(gs, idx):
    if idx!=gs.get("currentPlayerIdx") or gs.get("phase")!="go_prompt": return
    p=gs["players"][idx]; cc=p.get("creditCard")
    if cc and cc.get("active") and cc.get("used",0)>0:
        emi=min(cc["emi"],cc.get("used",0),p["money"]); p["money"]-=emi; cc["used"]-=emi
        if cc["used"]<=0: p["creditCard"]=None
    gs["pendingEvent"]=None; gs["phase"]="action"

# ═══════════════════════════════════════════════════════
#  BANK
# ═══════════════════════════════════════════════════════
def do_bank_deposit(gs, idx, data):
    p=gs["players"][idx]; amt=min(data.get("amount",100),p["money"])
    if amt<=0: return
    p["money"]-=amt; p["bankDeposit"]+=amt
    gs["log"].append(f"🏦 {p['name']} deposited {gs['settings']['currency']}{amt}")

def do_bank_withdraw(gs, idx, data):
    p=gs["players"][idx]; mx=p["bankDeposit"]+p["bankDepositInterest"]
    amt=min(data.get("amount",mx),mx)
    if amt<=0: return
    fi=min(amt,p["bankDepositInterest"]); fp=amt-fi
    p["bankDepositInterest"]-=fi; p["bankDeposit"]-=fp; p["money"]+=amt
    gs["log"].append(f"🏦 {p['name']} withdrew {gs['settings']['currency']}{amt}")

def do_bank_loan(gs, idx, data):
    p=gs["players"][idx]; total=sum(l["remaining"] for l in p["loans"])
    amt=min(data.get("amount",500),5000-total)
    if amt<=0: return
    turns=max(data.get("tenure",6),2)
    loan={"id":str(_uuid.uuid4()),"principal":amt,"remaining":amt,"rate":gs["settings"]["loanRate"],"turnsLeft":turns,"totalTurns":turns}
    p["loans"].append(loan); earn_money(gs, idx, amt, "bank loan")
    gs["log"].append(f"🏦 {p['name']} took loan {gs['settings']['currency']}{amt} for {turns} turns")

def do_bank_repay(gs, idx, data):
    p=gs["players"][idx]; lid=data.get("loanId")
    loan=next((l for l in p["loans"] if l["id"]==lid), p["loans"][0] if p["loans"] else None)
    if not loan: return
    amt=min(data.get("amount",loan["remaining"]),loan["remaining"],p["money"])
    if amt<=0: return
    loan["remaining"]-=amt; p["money"]-=amt
    if loan["remaining"]<=0: p["loans"]=[l for l in p["loans"] if l is not loan]

def do_bank_credit(gs, idx, data):
    p=gs["players"][idx]
    if p.get("creditCard") and p["creditCard"].get("active"): return
    fee=gs["settings"].get("creditCardFee",50)
    if p["money"]<fee: return
    limit=gs["settings"].get("creditCardLimit",500); ten=max(data.get("tenure",6),3)
    p["money"]-=fee
    p["creditCard"]={"active":True,"used":0,"limit":limit,"emi":math.ceil(limit/ten),"tenure":ten,"paidTurns":0,"roundsLeft":gs["settings"].get("creditCardRounds",2)}

def do_bank_pay_emi(gs, idx):
    if idx!=gs.get("currentPlayerIdx") or gs.get("phase")!="go_prompt": return
    p=gs["players"][idx]; cc=p.get("creditCard")
    if not cc or not cc.get("active") or cc.get("used",0)<=0: return
    emi=min(cc["emi"],cc.get("used",0),p["money"]); p["money"]-=emi; cc["used"]-=emi
    if emi<=0: return
    if cc["used"]<=0: p["creditCard"]=None

def do_bank_foreclose_loans(gs, idx):
    if idx!=gs.get("currentPlayerIdx"): return
    p=gs["players"][idx]
    total=sum(l.get("remaining",0) for l in p.get("loans",[]))
    if total<=0 or p["money"]<total: return
    p["money"]-=total
    p["loans"]=[]

def do_bank_foreclose_credit(gs, idx):
    if idx!=gs.get("currentPlayerIdx"): return
    p=gs["players"][idx]; cc=p.get("creditCard")
    if not cc or not cc.get("active"): return
    due=cc.get("used",0)
    if due>0 and p["money"]<due: return
    if due>0: p["money"]-=due
    p["creditCard"]=None

def do_bank_surrender_credit(gs, idx):
    if idx!=gs.get("currentPlayerIdx"): return
    p=gs["players"][idx]; cc=p.get("creditCard")
    if not cc or not cc.get("active") or cc.get("used",0)>0: return
    p["creditCard"]=None

def do_bank_insurance(gs, idx):
    p=gs["players"][idx]
    if p.get("hasInsurance") or p["money"]<150: return
    p["money"]-=150; p["hasInsurance"]=True
    gs["log"].append(f"🛡️ {p['name']} bought hazard insurance!")

def do_claim_insurance(gs, idx):
    p=gs["players"][idx]; total=p.get("pendingHazardLoss",0)+p.get("pendingHazardRebuildCost",0)
    if not p.get("hasInsurance") or total<=0: return
    payout=math.floor(total*(gs["settings"]["insurancePayout"]/100))
    earn_money(gs, idx, payout, "insurance payout")
    p["pendingHazardLoss"]=0; p["pendingHazardRebuildCost"]=0

# ═══════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════
def earn_money(gs, idx, amount, label):
    p=gs["players"][idx]; p["money"]+=amount; p["totalEarned"]=p.get("totalEarned",0)+amount

def charge_money(gs, idx, amount, label):
    p=gs["players"][idx]; cc=p.get("creditCard")
    cc_room=(cc["limit"]-cc.get("used",0)) if cc and cc.get("active") else 0
    if p["money"]>=amount: p["money"]-=amount
    elif p["money"]+cc_room>=amount:
        fc=amount-p["money"]; cc["used"]=cc.get("used",0)+fc; p["money"]=0
    else: p["money"]-=amount
    chk_bankrupt(gs, idx)

def send_jail(gs, idx):
    p=gs["players"][idx]; p.update({"position":10,"inJail":True,"jailTurns":0}); gs["doublesCount"]=0
    gs["log"].append(f"⛓️ {p['name']} sent to jail!")

def chk_bankrupt(gs, idx):
    p=gs["players"][idx]
    if p["money"]>=0: return
    total_debt=sum(l["remaining"] for l in p.get("loans",[]))+(p.get("creditCard") or {}).get("used",0)
    if p["money"]+p.get("bankDeposit",0)+p.get("bankDepositInterest",0)>-total_debt: return
    p["bankrupted"]=True
    for sp in gs["board"]:
        if sp.get("owner")==p["id"]: sp.update({"owner":None,"houses":0,"mortgaged":False})
    p["properties"]=[]
    gs["log"].append(f"💀 {p['name']} went bankrupt!")
    alive=[q for q in gs["players"] if not q["bankrupted"]]
    if len(alive)==1: gs["winner"]=alive[0]["id"]

def next_turn(gs):
    n=(gs["currentPlayerIdx"]+1)%len(gs["players"]); loops=0
    while gs["players"][n]["bankrupted"] and loops<len(gs["players"]):
        n=(n+1)%len(gs["players"]); loops+=1
    gs.update({"currentPlayerIdx":n,"phase":"roll","doublesCount":0})
    gs["log"].append(f"─── {gs['players'][n]['name']}'s turn ───")
    if len(gs["log"])>100: gs["log"]=gs["log"][-80:]

def exec_trade(gs, fi, ti, offer):
    f,t=gs["players"][fi],gs["players"][ti]
    f["money"]+=(offer.get("toMoney") or 0)-(offer.get("fromMoney") or 0)
    t["money"]+=(offer.get("fromMoney") or 0)-(offer.get("toMoney") or 0)
    for pos in (offer.get("fromProps") or []):
        gs["board"][pos]["owner"]=t["id"]; f["properties"]=[p for p in f["properties"] if p!=pos]; t["properties"].append(pos)
    for pos in (offer.get("toProps") or []):
        gs["board"][pos]["owner"]=f["id"]; t["properties"]=[p for p in t["properties"] if p!=pos]; f["properties"].append(pos)
    gs["log"].append(f"💱 Trade: {f['name']} ↔ {t['name']}")

# ═══════════════════════════════════════════════════════
#  BOARD GENERATION
# ═══════════════════════════════════════════════════════
def build_rents(price):
    return [math.floor(price*x) for x in (0.04,0.20,0.60,1.40,1.70,2.00)]

def generate_default_board(S):
    C=S+1; total=4*C
    ap={"S":round(S*0.4),"W":C+round(S*0.5),"N":2*C+round(S*0.5),"E":3*C+round(S*0.5)}
    rw={"S":round(S*0.7),"W":C+round(S*0.7),"N":2*C+round(S*0.3),"E":3*C+round(S*0.3)}
    gov=2*C-round(S*0.35); pt=C+round(S*0.6); gt=2*C+round(S*0.6)
    surp=[min(max(2,round(S*0.2)),total-1),min(C+round(S*0.8),total-1),
          min(2*C+round(S*0.7),total-1),min(3*C+round(S*0.8),total-1)]
    specials={0,C,2*C,3*C,1,2*C-1,C+1,gov,pt,gt,*ap.values(),*rw.values(),*surp}
    prop_slots=[i for i in range(total) if i not in specials]
    grp_sz=math.ceil(len(prop_slots)/8)
    grp_map={pos:f"g{min(i//grp_sz,7)}" for i,pos in enumerate(prop_slots)}
    base_prices=[20,50,90,130,180,240,300,360]
    board=[]
    for pos in range(total):
        if   pos==0:     board.append({"pos":pos,"type":"go","name":"GO"})
        elif pos==C:     board.append({"pos":pos,"type":"jail","name":"Jail"})
        elif pos==2*C:   board.append({"pos":pos,"type":"free_parking","name":"Free Parking"})
        elif pos==3*C:   board.append({"pos":pos,"type":"go_to_jail","name":"Go To Jail"})
        elif pos==1:     board.append({"pos":pos,"type":"income_tax","name":"💰 Income Tax"})
        elif pos==2*C-1: board.append({"pos":pos,"type":"luxury_tax","name":"💰 Luxury Tax","amount":100})
        elif pos==C+1:   board.append({"pos":pos,"type":"chest","name":"📦 Community Chest"})
        elif pos==gov:   board.append({"pos":pos,"type":"gov_prot","name":"🏛️ Gov. Protection"})
        elif pos==pt:    board.append({"pos":pos,"type":"property_tax","name":"🏠 Property Tax"})
        elif pos==gt:    board.append({"pos":pos,"type":"gains_tax","name":"📈 Gains Tax"})
        elif pos==ap["S"]: board.append({"pos":pos,"type":"airport","name":"✈ South Airport","label":"south","price":200,"owner":None,"mortgaged":False})
        elif pos==ap["W"]: board.append({"pos":pos,"type":"airport","name":"✈ West Airport","label":"west","price":200,"owner":None,"mortgaged":False})
        elif pos==ap["N"]: board.append({"pos":pos,"type":"airport","name":"✈ North Airport","label":"north","price":200,"owner":None,"mortgaged":False})
        elif pos==ap["E"]: board.append({"pos":pos,"type":"airport","name":"✈ East Airport","label":"east","price":200,"owner":None,"mortgaged":False})
        elif pos==rw["S"]: board.append({"pos":pos,"type":"railway","name":"🚂 South Rail","label":"south","connects":[rw["W"],rw["N"]],"goBonus":[],"price":150,"owner":None,"mortgaged":False})
        elif pos==rw["W"]: board.append({"pos":pos,"type":"railway","name":"🚂 West Rail","label":"west","connects":[rw["E"],rw["N"]],"goBonus":[rw["E"],rw["N"]],"price":150,"owner":None,"mortgaged":False})
        elif pos==rw["N"]: board.append({"pos":pos,"type":"railway","name":"🚂 North Rail","label":"north","connects":[rw["E"],rw["S"]],"goBonus":[],"price":150,"owner":None,"mortgaged":False})
        elif pos==rw["E"]: board.append({"pos":pos,"type":"railway","name":"🚂 East Rail","label":"east","connects":[rw["S"],rw["W"]],"goBonus":[],"price":150,"owner":None,"mortgaged":False})
        elif pos in surp: board.append({"pos":pos,"type":"chance","name":"❓ Surprise"})
        elif pos in grp_map:
            grp=grp_map[pos]; gi=int(grp[1]); base=base_prices[gi]
            slots=[p for p in prop_slots if grp_map.get(p)==grp]; idx=slots.index(pos)
            price=base+idx*10
            board.append({"pos":pos,"type":"property","group":grp,"name":f"Property {pos}","price":price,"rents":build_rents(price),"houseCost":max(50,math.floor(price*0.5)),"houses":0,"owner":None,"mortgaged":False})
        else: board.append({"pos":pos,"type":"chance","name":"❓ Surprise"})
    return board

def generate_random_board(seed_str, mode, S):
    rng=random.Random(seed_str); board=generate_default_board(S)
    TIER={"g0":(1,1),"g1":(1,2),"g2":(2,2),"g3":(2,3),"g4":(3,4),"g5":(4,5),"g6":(5,6),"g7":(6,6)}
    if mode=="same_country":
        c=COUNTRIES[rng.randint(0,len(COUNTRIES)-1)]
        for i,sp in enumerate(s for s in board if s.get("type")=="property"):
            sp["name"]=c["cities"][i%len(c["cities"])]; sp["countryFlag"]=c["flag"]; sp["countryName"]=c["name"]
    else:
        used=set()
        for grp in [f"g{i}" for i in range(8)]:
            if mode=="balanced":
                lo,hi=TIER[grp]; pool=[c for c in COUNTRIES if lo<=c["tier"]<=hi and c["code"] not in used]
                if not pool: pool=[c for c in COUNTRIES if c["code"] not in used]
                if not pool: pool=COUNTRIES
            else: pool=COUNTRIES
            c=pool[rng.randint(0,len(pool)-1)]; used.add(c["code"]); ci=0
            for sp in (s for s in board if s.get("type")=="property" and s.get("group")==grp):
                sp["name"]=c["cities"][ci%len(c["cities"])]; sp["countryFlag"]=c["flag"]; sp["countryName"]=c["name"]; ci+=1
    return board

def generate_domestic_board(preset, S):
    dm=DOMESTIC_MAPS.get(preset)
    if not dm: return generate_default_board(S)
    board=generate_default_board(S)
    states=dm["states"]
    prop_by_group={}
    for sp in board:
        if sp.get("type")=="property":
            grp=sp.get("group","g0"); prop_by_group.setdefault(grp,[]).append(sp)
    state_prices=[20,50,90,130,180,240,300,380]
    for gi in range(8):
        grp=f"g{gi}"; props=prop_by_group.get(grp,[]); state=states[gi%len(states)]
        cities=state["cities"]; base_price=state_prices[gi]
        for ci,sp in enumerate(props):
            city=cities[ci%len(cities)]; sp["name"]=city; sp["stateName"]=state["name"]
            sp["countryFlag"]=dm["flag"]; sp["countryName"]=dm["name"]
            sp["price"]=base_price+ci*10; sp["rents"]=build_rents(sp["price"])
            sp["houseCost"]=max(50,math.floor(sp["price"]*0.5))
    return board

def get_countries_list():
    return [{"code":c["code"],"name":c["name"],"flag":c["flag"],"tier":c["tier"],"base":c["base"],"cities":c["cities"]} for c in COUNTRIES]

def get_domestic_maps():
    return {k:{"name":v["name"],"flag":v["flag"],"states":[{"name":s["name"],"cities":s["cities"]} for s in v["states"]]} for k,v in DOMESTIC_MAPS.items()}

# ═══════════════════════════════════════════════════════
#  AUCTION SYSTEM
# ═══════════════════════════════════════════════════════

def do_start_auction(gs, pi, data):
    """Called when landing player chooses to auction an unowned property."""
    p = gs["players"][pi]
    pos = p["position"]
    sp = gs["board"][pos]
    if not sp or sp.get("owner") or sp.get("type") not in ("property","airport","railway"):
        gs["phase"] = "action"; return
    _open_auction(gs, pos, sp["price"], is_bankrupt=False, auctioneer_idx=pi)

def do_start_bankrupt_auction(gs, pi, data):
    """Player near-bankrupt auctions one of their properties (with houses)."""
    pos = data.get("position")
    if pos is None: return
    sp = gs["board"][pos]
    if not sp or sp.get("owner") != gs["players"][pi]["id"]: return
    # Base price = mortgage value + house sale value
    base = math.floor(sp.get("price",100)/2)
    if sp.get("houses",0)>0:
        base += math.floor(sp.get("houseCost",50)/2) * sp["houses"]
    _open_auction(gs, pos, base, is_bankrupt=True, auctioneer_idx=pi)

def _open_auction(gs, pos, base_price, *, is_bankrupt, auctioneer_idx):
    sp = gs["board"][pos]
    alive = [p for p in gs["players"] if not p["bankrupted"]]
    gs["auction"] = {
        "pos":       pos,
        "basePrice": base_price,
        "currentBid": base_price,
        "highBidder": None,   # player id
        "bidHistory": [],
        "folded":    [],       # list of player ids who folded
        "isBankrupt": is_bankrupt,
        "auctioneerIdx": auctioneer_idx,
        "active":    True,
        "timerStart": None,    # set by server when first bid arrives
        "propertySnapshot": {
            "name": sp.get("name",""),
            "price": sp.get("price",0),
            "group": sp.get("group"),
            "rents": sp.get("rents",[]),
            "houseCost": sp.get("houseCost",0),
            "houses": sp.get("houses",0),
            "type": sp.get("type","property"),
            "countryFlag": sp.get("countryFlag",""),
            "countryName": sp.get("countryName",""),
            "stateName": sp.get("stateName",""),
        }
    }
    gs["phase"] = "auction"
    gs["log"].append(f"🔨 Auction started for {sp['name']}! Base: {gs['settings']['currency']}{base_price}")

def do_auction_bid(gs, pi, data):
    """A player places a bid."""
    if gs.get("phase") != "auction" or not gs.get("auction"): return
    p = gs["players"][pi]
    auc = gs["auction"]
    if p["id"] in auc["folded"]: return  # already folded
    amount = int(data.get("amount", auc["currentBid"]+10))
    if amount <= auc["currentBid"]: return  # must exceed current bid
    if p["money"] < amount: return         # can't afford
    auc["currentBid"] = amount
    auc["highBidder"] = p["id"]
    auc["timerStart"] = None  # server resets 10s timer on each bid
    auc["bidHistory"].append({"playerId": p["id"], "playerName": p["name"], "amount": amount})
    gs["log"].append(f"🔨 {p['name']} bids {gs['settings']['currency']}{amount}")

def do_auction_fold(gs, pi):
    """A player folds from the auction."""
    if gs.get("phase") != "auction" or not gs.get("auction"): return
    p = gs["players"][pi]
    auc = gs["auction"]
    if p["id"] not in auc["folded"]:
        auc["folded"].append(p["id"])
        gs["log"].append(f"🏳️ {p['name']} folded.")
    # Check if everyone has folded or only one non-folded bidder remains
    alive_ids = [q["id"] for q in gs["players"] if not q["bankrupted"]]
    active_ids = [x for x in alive_ids if x not in auc["folded"]]
    if len(active_ids) <= 1:
        do_auction_end(gs)

def do_auction_end(gs):
    """Finalize the auction — award property to highest bidder or return."""
    if not gs.get("auction"): return
    auc = gs["auction"]
    auc["active"] = False
    pos = auc["pos"]
    sp = gs["board"][pos]

    if auc["highBidder"]:
        # Transfer property to winner
        winner_idx = next((i for i,p in enumerate(gs["players"]) if p["id"]==auc["highBidder"]), -1)
        if winner_idx >= 0:
            winner = gs["players"][winner_idx]
            # If bankrupt auction: remove from previous owner first
            if auc["isBankrupt"]:
                prev_owner = sp.get("owner")
                if prev_owner:
                    prev_p = next((p for p in gs["players"] if p["id"]==prev_owner), None)
                    if prev_p:
                        prev_p["properties"] = [x for x in prev_p["properties"] if x!=pos]
                        # Return house sale money to bankrupt seller
                        house_val = math.floor(sp.get("houseCost",50)/2) * sp.get("houses",0)
                        earn_money(gs, gs["players"].index(prev_p), house_val, "auction house proceeds")
            # Pay and award
            charge_money(gs, winner_idx, auc["currentBid"], "auction")
            sp["owner"] = winner["id"]
            if pos not in winner["properties"]: winner["properties"].append(pos)
            if auc["isBankrupt"]: sp["houses"] = sp.get("houses",0)  # houses stay
            gs["log"].append(f"🏆 {winner['name']} won {sp['name']} for {gs['settings']['currency']}{auc['currentBid']}!")
    else:
        gs["log"].append(f"🔨 No bids — {sp['name']} remains unowned.")

    gs["auction"] = None
    gs["phase"] = "action"
    # Check for new bankruptcies after payment
    winner_idx2 = next((i for i,p in enumerate(gs["players"]) if p.get("id")==(auc.get("highBidder"))), -1)
    if winner_idx2>=0: chk_bankrupt(gs, winner_idx2)
