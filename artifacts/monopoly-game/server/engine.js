/**
 * Monopoly Online — engine.js v3.1
 * Pure game logic. No I/O. Called by server.js.
 */
import { randomUUID } from "crypto";

// ════════════════════════════════════════════════
//  CARD DECKS
// ════════════════════════════════════════════════
const VERY_GOOD = [
  {title:"SECRET INHERITANCE",icon:"🏰",text:"A long-lost aunt left you her estate! Collect $1500!",action:"gain",amount:1500},
  {title:"BITCOIN WALLET",icon:"₿",text:"Found an old USB with Bitcoin from 2009. Sell for $1500!",action:"gain",amount:1500},
  {title:"VIRAL OVERNIGHT",icon:"🚀",text:"Your cat video went viral. Brand deals: collect $1500!",action:"gain",amount:1500},
  {title:"LAWSUIT WIN",icon:"⚖️",text:"Won unpaid overtime lawsuit. Collect $1500!",action:"gain",amount:1500},
  {title:"GAME SHOW JACKPOT",icon:"🎰",text:"Won a TV game show on a dare. Jackpot: $1500!",action:"gain",amount:1500},
];
const VERY_BAD = [
  {title:"IRS AUDIT",icon:"😱",text:"7 years of tax irregularities. Pay $1500.",action:"pay",amount:1500},
  {title:"IDENTITY THEFT",icon:"🦹",text:"Hacker drained everything. Pay $1500.",action:"pay",amount:1500},
  {title:"PONZI SCHEME",icon:"📉",text:"Your broker was fraud. Lose $1500.",action:"pay",amount:1500},
  {title:"FLOODED BASEMENT",icon:"🌊",text:"Burst pipe destroyed everything. Pay $1500.",action:"pay",amount:1500},
];
const BAD_SURP = [
  {icon:"💸",text:"Secret savings found. Pay $200.",action:"pay",amount:200},
  {icon:"🔧",text:"Car transmission failed. Pay $120.",action:"pay",amount:120},
  {icon:"📱",text:"Dropped phone. Screen repair: pay $90.",action:"pay",amount:90},
  {icon:"🚗",text:"Parking ticket. Pay $40.",action:"pay",amount:40},
  {icon:"🐱",text:"Cat knocked laptop off desk. Pay $130.",action:"pay",amount:130},
  {icon:"🦷",text:"Emergency dentist: pay $100.",action:"pay",amount:100},
  {icon:"😴",text:"Sleep-shopped online. Pay $90.",action:"pay",amount:90},
  {icon:"🏠",text:"Roof leaked. Pay $130.",action:"pay",amount:130},
  {icon:"🚲",text:"Bike stolen. Pay $70.",action:"pay",amount:70},
  {icon:"🍕",text:"Bought meme coin. Crashed. Pay $80.",action:"pay",amount:80},
  {icon:"🐕",text:"Dog vet emergency: pay $110.",action:"pay",amount:110},
  {icon:"🎮",text:"Kid bought in-game currency. Pay $50.",action:"pay",amount:50},
  {icon:"🛑",text:"Ran red light. Camera caught it. Pay $65.",action:"pay",amount:65},
];
const GOOD_SURP = [
  {icon:"💎",text:"Found secret jewellery stash. Sold for $500!",action:"gain",amount:500},
  {icon:"🧥",text:"Found $50 in an old jacket!",action:"gain",amount:50},
  {icon:"📈",text:"Investment dividend arrived. Collect $150!",action:"gain",amount:150},
  {icon:"🎟️",text:"Won local raffle. Collect $100!",action:"gain",amount:100},
  {icon:"💰",text:"Unexpected tax rebate. Collect $200!",action:"gain",amount:200},
  {icon:"🤝",text:"Neighbour paid you back. Collect $80!",action:"gain",amount:80},
  {icon:"💡",text:"Side hustle great month. Collect $120!",action:"gain",amount:120},
  {icon:"🛋️",text:"Sold old furniture. Collect $60!",action:"gain",amount:60},
  {icon:"🏦",text:"Bank loyalty bonus. Collect $30!",action:"gain",amount:30},
  {icon:"🎨",text:"Painting sold for a lot. Collect $180!",action:"gain",amount:180},
  {icon:"🔑",text:"Old property bond matured! Collect $250!",action:"gain",amount:250},
  {icon:"🌈",text:"Insurance claim approved. Collect $220!",action:"gain",amount:220},
];
const CHEST_CARDS = [
  {text:"Advance to GO. Collect start salary.",action:"goto",position:0},
  {text:"Bank error in your favour +$200.",action:"gain",amount:200},
  {text:"Doctor's fee: pay $50.",action:"pay",amount:50},
  {text:"Stock sale +$50.",action:"gain",amount:50},
  {text:"Get Out of Jail Free.",action:"jail_card"},
  {text:"Go to Jail!",action:"jail"},
  {text:"Government Protection Card!",action:"gov_card"},
  {text:"Life insurance matures +$100.",action:"gain",amount:100},
  {text:"Hospital fees: pay $100.",action:"pay",amount:100},
  {text:"School fees: pay $50.",action:"pay",amount:50},
  {text:"Consultancy fee +$25.",action:"gain",amount:25},
  {text:"Free Insurance!",action:"insurance_free"},
];
const SURPRISE_CARDS = [
  {text:"Advance to GO.",action:"goto",position:0},
  {text:"Bank dividend +$50.",action:"gain",amount:50},
  {text:"Get Out of Jail Free.",action:"jail_card"},
  {text:"Go Back 3 Spaces.",action:"back3"},
  {text:"Go to Jail!",action:"jail"},
  {text:"General repairs: $40/house, $115/hotel.",action:"repairs"},
  {text:"Speeding fine: pay $15.",action:"pay",amount:15},
  {text:"Government Protection Card!",action:"gov_card"},
  {text:"Win crossword +$100.",action:"gain",amount:100},
  {text:"Building loan matures +$150.",action:"gain",amount:150},
  {text:"Free Insurance!",action:"insurance_free"},
  {text:"Birthday! Collect $50 from each player.",action:"birthday"},
];
const HAZARDS = [
  {id:"crash",    name:"Car Crash",    icon:"🚗💥",desc:"Pay $50 for repairs.",      type:"money",  amount:50},
  {id:"accident", name:"Accident",     icon:"🏥",  desc:"Hospital bill!",            type:"money",  amount:100},
  {id:"robbery",  name:"Robbery!",     icon:"🔫",  desc:"Your wallet is stolen!",    type:"robbery"},
  {id:"quake",    name:"Earthquake!",  icon:"🌍💥",desc:"Houses demolished!",        type:"disaster"},
  {id:"cyclone",  name:"Cyclone!",     icon:"🌀",  desc:"Storm destroys buildings.", type:"disaster"},
  {id:"tsunami",  name:"Tsunami!",     icon:"🌊",  desc:"Property flooded.",         type:"disaster",fixed:1},
  {id:"landslide",name:"Landslide!",   icon:"⛰️💥",desc:"2 houses demolished.",     type:"disaster",fixed:2},
  {id:"fine",     name:"Gov. Fine",    icon:"📋",  desc:"Pay $75 penalty.",          type:"money",  amount:75},
  {id:"fire",     name:"Fire!",        icon:"🔥",  desc:"All houses on one property lost.",type:"fire"},
];

// ════════════════════════════════════════════════
//  27 COUNTRIES
// ════════════════════════════════════════════════
export const COUNTRIES = [
  {code:"ng",name:"Nigeria",    flag:"🇳🇬",tier:1,base:20,  cities:["Kano","Ibadan","Maiduguri","Kaduna","Zaria","Aba","Ilorin","Jos","Enugu","Abeokuta","Onitsha","Port Harcourt","Abuja","Lagos","Victoria Island"]},
  {code:"pk",name:"Pakistan",   flag:"🇵🇰",tier:1,base:25,  cities:["Mianwali","Larkana","Sukkur","Bahawalpur","Sargodha","Multan","Peshawar","Hyderabad","Rawalpindi","Faisalabad","Gujranwala","Islamabad","Lahore","Karachi","Clifton"]},
  {code:"bd",name:"Bangladesh", flag:"🇧🇩",tier:1,base:30,  cities:["Mymensingh","Rangpur","Bogra","Barisal","Jessore","Sylhet","Comilla","Rajshahi","Khulna","Brahmanbaria","Gazipur","Tongi","Narayanganj","Chittagong","Dhaka Gulshan"]},
  {code:"eg",name:"Egypt",      flag:"🇪🇬",tier:1,base:40,  cities:["Aswan","Luxor","Asyut","Damanhur","Faiyum","Zagazig","Mansoura","Tanta","Ismailia","Suez","Port Said","Alexandria","Giza","Cairo","New Cairo"]},
  {code:"ph",name:"Philippines",flag:"🇵🇭",tier:1,base:50,  cities:["Davao","Zamboanga","Cagayan de Oro","Bacoor","Antipolo","Caloocan","Las Pinas","Pasig","Quezon City","Cebu","Mandaluyong","Taguig","Manila","Makati","BGC Taguig"]},
  {code:"tr",name:"Turkey",     flag:"🇹🇷",tier:2,base:60,  cities:["Diyarbakir","Sanliurfa","Hatay","Kayseri","Konya","Gaziantep","Adana","Mersin","Manisa","Kocaeli","Bursa","Antalya","Izmir","Ankara","Istanbul Besiktas"]},
  {code:"th",name:"Thailand",   flag:"🇹🇭",tier:2,base:70,  cities:["Nakhon Si Thammarat","Songkhla","Ubon Ratchathani","Khon Kaen","Udon Thani","Hat Yai","Rayong","Chiang Rai","Nonthaburi","Phuket","Chiang Mai","Surat Thani","Bangkok Thon Buri","Bangkok CBD","Sukhumvit"]},
  {code:"id",name:"Indonesia",  flag:"🇮🇩",tier:2,base:70,  cities:["Samarinda","Padang","Malang","Bogor","Bandar Lampung","Palembang","Makassar","Semarang","Bandung","Medan","Depok","Bekasi","Surabaya","Jakarta Selatan","SCBD Jakarta"]},
  {code:"ar",name:"Argentina",  flag:"🇦🇷",tier:2,base:80,  cities:["Resistencia","Posadas","Corrientes","Parana","San Juan","Salta","Santa Fe","Mar del Plata","Mendoza","Rosario","Cordoba","La Plata","Tucuman","Buenos Aires","Puerto Madero"]},
  {code:"pl",name:"Poland",     flag:"🇵🇱",tier:2,base:100, cities:["Sosnowiec","Radom","Czestochowa","Bydgoszcz","Lublin","Katowice","Szczecin","Gdynia","Bialystok","Lodz","Poznan","Gdansk","Wroclaw","Krakow","Warsaw Mokotow"]},
  {code:"mx",name:"Mexico",     flag:"🇲🇽",tier:3,base:120, cities:["Acapulco","Culiacan","Juarez","Tijuana","Merida","San Luis Potosi","Leon","Puebla","Hermosillo","Aguascalientes","Mexicali","Guadalajara","Monterrey","Mexico City","Polanco"]},
  {code:"br",name:"Brazil",     flag:"🇧🇷",tier:3,base:140, cities:["Belem","Sao Luis","Manaus","Recife","Fortaleza","Salvador","Curitiba","Porto Alegre","Brasilia","Goiania","Campinas","Belo Horizonte","Rio de Janeiro","Sao Paulo","Sao Paulo Itaim"]},
  {code:"cn",name:"China",      flag:"🇨🇳",tier:3,base:160, cities:["Harbin","Shenyang","Zhengzhou","Tianjin","Dongguan","Nanjing","Hangzhou","Wuhan","Xian","Chengdu","Chongqing","Guangzhou","Shenzhen","Beijing Chaoyang","Shanghai Lujiazui"]},
  {code:"es",name:"Spain",      flag:"🇪🇸",tier:3,base:170, cities:["Gijon","Vigo","Valladolid","Cordoba","Zaragoza","Alicante","Murcia","Seville","Las Palmas","Bilbao","Valencia","Palma","Malaga","Madrid","Barcelona Eixample"]},
  {code:"it",name:"Italy",      flag:"🇮🇹",tier:3,base:180, cities:["Reggio Calabria","Messina","Palermo","Catania","Bari","Naples","Turin","Verona","Bologna","Florence","Genoa","Padua","Trieste","Rome","Milan Centro"]},
  {code:"kr",name:"South Korea",flag:"🇰🇷",tier:4,base:200, cities:["Changwon","Cheongju","Jeonju","Bucheon","Ulsan","Goyang","Seongnam","Daejeon","Gwangju","Incheon","Daegu","Suwon","Yongin","Busan","Seoul Gangnam"]},
  {code:"ru",name:"Russia",     flag:"🇷🇺",tier:4,base:200, cities:["Volgograd","Perm","Voronezh","Krasnoyarsk","Ufa","Rostov-on-Don","Omsk","Samara","Chelyabinsk","Nizhny Novgorod","Kazan","Yekaterinburg","Novosibirsk","Moscow","Saint Petersburg"]},
  {code:"ca",name:"Canada",     flag:"🇨🇦",tier:4,base:220, cities:["Regina","Saskatoon","Winnipeg","Halifax","Quebec City","Edmonton","Hamilton","Ottawa","London ON","Victoria","Kitchener","Calgary","Montreal","Toronto","Vancouver West Side"]},
  {code:"au",name:"Australia",  flag:"🇦🇺",tier:4,base:240, cities:["Townsville","Cairns","Hobart","Geelong","Sunshine Coast","Wollongong","Logan City","Newcastle","Gold Coast","Adelaide","Canberra","Brisbane","Perth","Melbourne","Sydney Eastern"]},
  {code:"fr",name:"France",     flag:"🇫🇷",tier:4,base:240, cities:["Saint-Etienne","Le Havre","Reims","Toulon","Rennes","Strasbourg","Montpellier","Bordeaux","Nantes","Lille","Lyon","Nice","Marseille","Paris 10e","Paris 16e"]},
  {code:"de",name:"Germany",    flag:"🇩🇪",tier:5,base:280, cities:["Duisburg","Dortmund","Essen","Nuremberg","Hanover","Leipzig","Dresden","Bremen","Stuttgart","Dusseldorf","Cologne","Frankfurt","Hamburg","Berlin Mitte","Munich Maxvorstadt"]},
  {code:"gb",name:"United Kingdom",flag:"🇬🇧",tier:5,base:290,cities:["Bradford","Belfast","Coventry","Leicester","Nottingham","Cardiff","Liverpool","Bristol","Edinburgh","Leeds","Sheffield","Birmingham","Manchester","London Canary Wharf","London Kensington"]},
  {code:"in",name:"India",      flag:"🇮🇳",tier:5,base:290, cities:["Visakhapatnam","Nagpur","Kanpur","Lucknow","Surat","Jaipur","Ahmedabad","Pune","Kolkata","Chennai","Hyderabad","Bangalore Whitefield","Delhi Connaught Place","Mumbai Bandra","Mumbai Nariman Point"]},
  {code:"jp",name:"Japan",      flag:"🇯🇵",tier:5,base:310, cities:["Sakai","Kitakyushu","Sendai","Hiroshima","Saitama","Chiba","Kyoto","Fukuoka","Kawasaki","Kobe","Sapporo","Nagoya","Yokohama","Osaka","Tokyo Minato"]},
  {code:"nl",name:"Netherlands",flag:"🇳🇱",tier:5,base:320, cities:["Zaandam","Enschede","Arnhem","Amersfoort","Breda","Nijmegen","Haarlem","Almere","Groningen","Tilburg","Eindhoven","Utrecht","The Hague","Rotterdam","Amsterdam Canal Ring"]},
  {code:"us",name:"United States",flag:"🇺🇸",tier:6,base:360,cities:["Jacksonville","Columbus","Fort Worth","Charlotte","Phoenix","San Antonio","Houston","Dallas","Philadelphia","Chicago","San Diego","Austin","Los Angeles","San Francisco","New York Manhattan"]},
  {code:"sg",name:"Singapore",  flag:"🇸🇬",tier:6,base:370, cities:["Woodlands","Yishun","Hougang","Sengkang","Punggol","Tampines","Ang Mo Kio","Bedok","Clementi","Queenstown","Toa Payoh","Kallang","Jurong East","Bukit Timah","Orchard Road"]},
  {code:"ch",name:"Switzerland",flag:"🇨🇭",tier:6,base:360, cities:["Schaffhausen","Winterthur","Lucerne","St. Gallen","Biel","Thun","Chur","Lausanne","Bern","Lugano","Basel","Zurich Altstetten","Zurich Oerlikon","Geneva","Zurich Seefeld"]},
];

// ════════════════════════════════════════════════
//  DOMESTIC MAPS
// ════════════════════════════════════════════════
export const DOMESTIC_MAPS = {
  india: {name:"India",flag:"🇮🇳",states:[
    {name:"Maharashtra",   cities:["Mumbai","Pune","Nagpur","Nashik","Aurangabad","Solapur","Amravati","Kolhapur","Thane","Navi Mumbai"]},
    {name:"Delhi NCR",     cities:["Delhi","Noida","Gurugram","Faridabad","Ghaziabad","Meerut","Panipat","Sonipat"]},
    {name:"Karnataka",     cities:["Bangalore","Mysore","Hubli","Mangalore","Belgaum","Shimoga","Tumkur","Bidar"]},
    {name:"Tamil Nadu",    cities:["Chennai","Coimbatore","Madurai","Tiruchirappalli","Salem","Erode","Tirunelveli","Vellore"]},
    {name:"West Bengal",   cities:["Kolkata","Howrah","Durgapur","Asansol","Siliguri","Malda","Bardhaman","Kharagpur"]},
    {name:"Gujarat",       cities:["Ahmedabad","Surat","Vadodara","Rajkot","Bhavnagar","Jamnagar","Junagadh","Gandhinagar"]},
    {name:"Rajasthan",     cities:["Jaipur","Jodhpur","Udaipur","Kota","Bikaner","Ajmer","Bhilwara","Alwar"]},
    {name:"Uttar Pradesh", cities:["Lucknow","Kanpur","Agra","Varanasi","Allahabad","Meerut","Aligarh","Moradabad"]},
  ]},
  uk: {name:"United Kingdom",flag:"🇬🇧",states:[
    {name:"England — London",   cities:["London","Greenwich","Croydon","Wimbledon","Hackney","Islington","Southwark","Lambeth"]},
    {name:"England — Midlands", cities:["Birmingham","Coventry","Leicester","Nottingham","Derby","Wolverhampton","Stoke","Walsall"]},
    {name:"England — North",    cities:["Manchester","Leeds","Liverpool","Sheffield","Bradford","Hull","Salford","Oldham"]},
    {name:"Scotland",           cities:["Glasgow","Edinburgh","Aberdeen","Dundee","Inverness","Stirling","Perth","Paisley"]},
    {name:"Wales",              cities:["Cardiff","Swansea","Newport","Wrexham","Barry","Neath","Rhondda","Merthyr Tydfil"]},
    {name:"Northern Ireland",   cities:["Belfast","Derry","Lisburn","Newry","Armagh","Ballymena","Coleraine","Bangor"]},
    {name:"South East",         cities:["Brighton","Oxford","Southampton","Portsmouth","Reading","Slough","Guildford","Milton Keynes"]},
    {name:"South West",         cities:["Bristol","Plymouth","Exeter","Bath","Swindon","Gloucester","Cheltenham","Bournemouth"]},
  ]},
  usa: {name:"United States",flag:"🇺🇸",states:[
    {name:"California",   cities:["Los Angeles","San Francisco","San Diego","San Jose","Sacramento","Fresno","Long Beach","Oakland"]},
    {name:"New York",     cities:["New York City","Buffalo","Rochester","Yonkers","Syracuse","Albany","New Rochelle","White Plains"]},
    {name:"Texas",        cities:["Houston","Dallas","San Antonio","Austin","Fort Worth","El Paso","Arlington","Corpus Christi"]},
    {name:"Florida",      cities:["Miami","Orlando","Tampa","Jacksonville","St. Petersburg","Hialeah","Tallahassee","Fort Lauderdale"]},
    {name:"Illinois",     cities:["Chicago","Aurora","Naperville","Joliet","Rockford","Springfield","Peoria","Elgin"]},
    {name:"Pennsylvania", cities:["Philadelphia","Pittsburgh","Allentown","Erie","Reading","Scranton","Bethlehem","Lancaster"]},
    {name:"Ohio",         cities:["Columbus","Cleveland","Cincinnati","Toledo","Akron","Dayton","Parma","Canton"]},
    {name:"Georgia",      cities:["Atlanta","Augusta","Macon","Savannah","Athens","Sandy Springs","Roswell","Warner Robins"]},
  ]},
};

// ════════════════════════════════════════════════
//  SETTINGS
// ════════════════════════════════════════════════
export function defaultSettings() {
  return {
    currency:"$", startingCash:1500, goSalary:200,
    airportFee:100, travelFee:150, railwayFee:75,
    incomeTaxRate:10, propertyTaxRate:2,
    propertyTaxPerHouse:5, propertyTaxPerHotel:20,
    gainsTaxRate:15, gainsTaxThreshold:1000,
    randomTaxMultiplier:15, taxReturnRate:50, taxReturnMoveEvery:3,
    depositRate:5, loanRate:10, creditCardFee:50,
    creditCardLimit:500, creditCardRounds:2,
    insurancePremium:50, insurancePayout:75,
    govGrantAmount:200, govBailoutAmount:200,
    evenBuild:true, mortgageEnabled:true, auctionMode:false,
    noRentInJail:true, treasurePot:true,
    housingRule:"monopoly", maxPlayers:6, privateRoom:false,
    enableVeryBadSurprises:true, enableVeryGoodSurprises:true,
  };
}

// ════════════════════════════════════════════════
//  RANDOM HELPERS
// ════════════════════════════════════════════════
function rnd6() { return Math.floor(Math.random() * 6) + 1; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function sample(arr, k) {
  const a = [...arr]; shuffle(a); return a.slice(0, k);
}

// Seeded RNG (mulberry32)
function makeRng(seedStr) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619) >>> 0;
  }
  let s = h;
  return () => {
    s += 0x6D2B79F5; s >>>= 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// ════════════════════════════════════════════════
//  GAME INIT
// ════════════════════════════════════════════════
export function initGame(room) {
  const S = (room.mapConfig || {}).tilesPerSide || 9;
  const board = (room.mapConfig || {}).spaces || generateDefaultBoard(S);
  const players = room.players.map(p => mkGamePlayer(p, room.settings));
  const propPositions = board.filter(s => s.type === "property").map(s => s.pos);
  const taxReturnPool = sample(propPositions, Math.min(6, propPositions.length));
  const remaining = propPositions.filter(p => !taxReturnPool.includes(p));
  const rndTaxPool = sample(remaining, Math.min(8, remaining.length));
  const hazardPool = board.filter(s => s.type === "chance").map(s => s.pos);
  const chanceDeck = shuffle([...SURPRISE_CARDS]);
  const chestDeck  = shuffle([...CHEST_CARDS]);
  return {
    board, players, tilesPerSide: S,
    currentPlayerIdx: 0, phase: "roll",
    lastRoll: null, doublesCount: 0,
    log: [`🎲 Game started! ${players[0].name} goes first.`],
    settings: { ...room.settings },
    chanceDeck, chestDeck, chanceIdx: 0, chestIdx: 0, winner: null,
    treasurePot: room.settings.treasurePot ? 0 : null,
    hazardPos: hazardPool[0] ?? 7,
    hazardPool,
    randomTaxPos: rndTaxPool[0] ?? 22,
    randomTaxPool: rndTaxPool,
    taxReturnPos: taxReturnPool[0] ?? 15,
    taxReturnPool,
    taxReturnLastMoved: 0,
    taxesPaidByPlayer: {},
    round: 1, turnInRound: 0,
    pendingEvent: null,
  };
}

function mkGamePlayer(p, s) {
  return {
    id: p.id, name: p.name, token: p.token, color: p.color,
    avatar: p.avatar || {style:"circle",hairStyle:"none",beardStyle:"none",skinTone:"#F5CBA7"},
    money: s.startingCash, position: 0, jailTurns: 0, inJail: false,
    badDebt: false, badDebtTurns: 0, properties: [],
    jailCards: 0, govProtCards: 0, bankrupted: false, disconnected: false,
    bankDeposit: 0, bankDepositInterest: 0, loans: [], creditCard: null,
    hasInsurance: false,
    pendingHazardLoss: 0, pendingHazardHouses: 0, pendingHazardRebuildCost: 0,
    totalEarned: s.startingCash,
  };
}

// ════════════════════════════════════════════════
//  ACTION ROUTER
// ════════════════════════════════════════════════
export function processAction(gs, pi, action, data) {
  const p = gs.players[pi];
  if (p.bankrupted && action !== "end_turn") { nextTurn(gs); return gs; }
  switch (action) {
    case "roll":            doRoll(gs, pi); break;
    case "buy":             doBuy(gs, pi); break;
    case "pass":            gs.phase = "action"; break;
    case "end_turn":        doEndTurn(gs, pi); break;
    case "build":           doBuild(gs, pi, data); break;
    case "sell_house":      doSellHouse(gs, pi, data); break;
    case "mortgage":        doMortgage(gs, pi, data); break;
    case "unmortgage":      doUnmortgage(gs, pi, data); break;
    case "pay_jail":        doPayJail(gs, pi); break;
    case "use_jail_card":   doUseJailCard(gs, pi); break;
    case "use_gov_prot":    doUseGovProt(gs, pi); break;
    case "travel_air":      doTravelAir(gs, pi, data); break;
    case "travel_rail":     doTravelRail(gs, pi, data); break;
    case "skip_travel":     gs.phase = "action"; break;
    case "go_pay_emi":      doGoPayEmi(gs, pi); break;
    case "go_end":          landOn(gs, pi); break;
    case "bank_deposit":    doBankDeposit(gs, pi, data); break;
    case "bank_withdraw":   doBankWithdraw(gs, pi, data); break;
    case "bank_loan":       doBankLoan(gs, pi, data); break;
    case "bank_repay":      doBankRepay(gs, pi, data); break;
    case "bank_credit":     doBankCredit(gs, pi, data); break;
    case "bank_pay_emi":    doBankPayEmi(gs, pi); break;
    case "bank_insurance":  doBankInsurance(gs, pi); break;
    case "claim_insurance": doClaimInsurance(gs, pi); break;
    case "hazard_ack":
    case "gov_ack":         gs.phase = "action"; gs.pendingEvent = null; break;
    case "start_auction":   doStartAuction(gs, pi, data); break;
    case "auction_bid":     doAuctionBid(gs, pi, data); break;
    case "auction_fold":    doAuctionFold(gs, pi); break;
    case "auction_end":     doAuctionEnd(gs); break;
    case "bankrupt_auction":doStartBankruptAuction(gs, pi, data); break;
  }
  return gs;
}

// ════════════════════════════════════════════════
//  ROLL & INTEREST
// ════════════════════════════════════════════════
function doRoll(gs, idx) {
  if (gs.phase !== "roll") return;
  const p = gs.players[idx];
  accrueInterest(gs, idx);
  const d1 = rnd6(), d2 = rnd6();
  const doubles = d1 === d2;
  gs.lastRoll = [d1, d2];
  if (p.badDebt) {
    p.badDebtTurns++;
    gs.log.push(`⛓️ ${p.name} in bad-debt jail (${p.badDebtTurns}/3).`);
    if (p.badDebtTurns >= 3) Object.assign(p, {badDebt:false,badDebtTurns:0,inJail:false,jailTurns:0});
    gs.phase = "action"; return;
  }
  if (p.inJail) {
    if (doubles) {
      p.inJail = false; p.jailTurns = 0;
      gs.log.push(`${p.name} rolled doubles — out of jail!`);
    } else {
      p.jailTurns++;
      if (p.jailTurns >= 3) {
        p.money -= 50; p.inJail = false; p.jailTurns = 0;
        gs.log.push(`${p.name} paid $50 after 3 turns.`);
      } else {
        gs.log.push(`${p.name} in jail (${p.jailTurns}/3)`);
        gs.phase = "action"; return;
      }
    }
  } else {
    if (doubles) {
      gs.doublesCount++;
      if (gs.doublesCount >= 3) { sendJail(gs, idx); gs.phase = "action"; return; }
    } else {
      gs.doublesCount = 0;
    }
  }
  movePlayer(gs, idx, d1 + d2);
}

function accrueInterest(gs, idx) {
  const p = gs.players[idx]; const s = gs.settings;
  const n = Math.max(1, gs.players.filter(q => !q.bankrupted).length);
  if (p.bankDeposit > 0) {
    const i = Math.floor(p.bankDeposit * (s.depositRate / 100) / n);
    p.bankDepositInterest += i;
    if (i > 0) gs.log.push(`🏦 Deposit interest +${s.currency}${i}`);
  }
  const dead = [];
  for (const loan of p.loans) {
    const i = Math.ceil(loan.remaining * (s.loanRate / 100) / n);
    loan.remaining += i; loan.turnsLeft--;
    if (loan.turnsLeft <= 0 && loan.remaining > 0) {
      enforceBadDebt(gs, idx, loan); dead.push(loan);
    }
  }
  p.loans = p.loans.filter(l => !dead.includes(l));
  const cc = p.creditCard;
  if (cc && cc.active) {
    cc.roundsLeft -= 1.0 / n;
    if (cc.roundsLeft <= 0 && (cc.used || 0) > 0) enforceCreditDebt(gs, idx);
  }
}

function enforceBadDebt(gs, idx, loan) {
  const p = gs.players[idx];
  Object.assign(p, {badDebt:true,badDebtTurns:0,inJail:true,position:10,jailTurns:0});
  gs.log.push(`🔴 ${p.name} → BAD-DEBT JAIL.`);
  seizeCollateral(gs, idx, loan.remaining);
  p.loans = p.loans.filter(l => l !== loan);
}

function enforceCreditDebt(gs, idx) {
  const p = gs.players[idx];
  Object.assign(p, {badDebt:true,badDebtTurns:0,inJail:true,position:10,jailTurns:0,creditCard:null});
  gs.log.push(`🔴 ${p.name} defaulted on credit card.`);
  seizeCollateral(gs, idx, 500);
}

function seizeCollateral(gs, idx, amount) {
  const p = gs.players[idx]; let seized = 0;
  for (const pos of [...p.properties]) {
    if (seized >= amount) break;
    const sp = gs.board[pos];
    if (sp && sp.houses > 0) {
      const v = (sp.houseCost || 0) * sp.houses; seized += v; sp.houses = 0;
    }
  }
  for (const pos of [...p.properties]) {
    const sp = gs.board[pos];
    if (seized >= amount || sp.mortgaged) continue;
    sp.mortgaged = true; seized += Math.floor((sp.price || 0) / 2);
  }
}

// ════════════════════════════════════════════════
//  MOVEMENT
// ════════════════════════════════════════════════
function movePlayer(gs, idx, steps) {
  const p = gs.players[idx]; const prev = p.position;
  p.position = (p.position + steps) % gs.board.length;
  if (p.position < prev && steps > 0) {
    earnMoney(gs, idx, gs.settings.goSalary, "GO salary");
    if (p.hasInsurance) p.money -= gs.settings.insurancePremium;
    const cc = p.creditCard;
    if (cc && cc.active && (cc.used || 0) > 0) {
      gs.phase = "go_prompt"; gs.pendingEvent = {type:"go_prompt",emi:cc.emi}; return;
    }
  }
  landOn(gs, idx);
}

function landOn(gs, idx) {
  const p = gs.players[idx]; const sp = gs.board[p.position]; const pos = p.position;
  gs.log.push(`📍 ${p.name} → ${sp.name}`);
  if (pos === gs.hazardPos)    { applyHazard(gs, idx); return; }
  if (pos === gs.taxReturnPos) { landTaxReturn(gs, idx); gs.phase = "action"; return; }
  if (pos === gs.randomTaxPos) { landRandomTax(gs, idx); return; }
  const t = sp.type; const s = gs.settings;
  if (t === "tax_return") { landTaxReturn(gs, idx); gs.phase = "action"; return; }
  if (t === "go")                  gs.phase = "action";
  else if (t === "jail")           gs.phase = "action";
  else if (t === "free_parking") {
    const pot = gs.treasurePot;
    if (pot) { earnMoney(gs, idx, pot, "Treasure Pot"); gs.treasurePot = 0; }
    gs.phase = "action";
  }
  else if (t === "go_to_jail")     { sendJail(gs, idx); gs.phase = "action"; }
  else if (t === "income_tax")     { payTax(gs, idx, Math.floor(p.money * (s.incomeTaxRate/100)), "Income Tax"); gs.phase = "action"; }
  else if (t === "property_tax") {
    const pv = p.properties.reduce((a,x) => a + (gs.board[x].price || 0), 0);
    const h  = p.properties.reduce((a,x) => a + Math.min(gs.board[x].houses || 0, 4), 0);
    const ho = p.properties.filter(x => (gs.board[x].houses || 0) === 5).length;
    payTax(gs, idx, Math.max(0, Math.floor(pv*(s.propertyTaxRate/100)) + h*s.propertyTaxPerHouse + ho*(s.propertyTaxPerHotel||20)), "Property Tax");
    gs.phase = "action";
  }
  else if (t === "gains_tax") {
    const gains = Math.max(0, p.totalEarned - s.gainsTaxThreshold);
    const amt = Math.floor(gains * (s.gainsTaxRate/100));
    if (amt > 0) { payTax(gs, idx, amt, "Gains Tax"); p.totalEarned = 0; }
    gs.phase = "action";
  }
  else if (t === "luxury_tax")     { payTax(gs, idx, 100, "Luxury Tax"); gs.phase = "action"; }
  else if (t === "chance")         drawSurprise(gs, idx);
  else if (t === "chest")          drawChest(gs, idx);
  else if (t === "gov_prot")       landGovProt(gs, idx);
  else if (t === "property" || t === "utility") {
    if (!sp.owner) gs.phase = "buy";
    else payRentCheck(gs, idx, sp);
  }
  else if (t === "airport") {
    if (!sp.owner) gs.phase = "buy";
    else { payAirportFee(gs, idx, sp); gs.phase = "air_travel"; }
  }
  else if (t === "railway") {
    if (!sp.owner) gs.phase = "buy";
    else { payRailwayFee(gs, idx, sp); gs.phase = "rail_travel"; }
  }
  else gs.phase = "action";
}

function payRentCheck(gs, idx, sp) {
  const p = gs.players[idx];
  const own = gs.players.find(q => q.id === sp.owner);
  if (!own || own.id === p.id || own.bankrupted || sp.mortgaged ||
      (gs.settings.noRentInJail && own.inJail)) { gs.phase = "action"; return; }
  const rent = calcRent(gs, sp);
  chargeMoney(gs, idx, rent, `rent to ${own.name}`); own.money += rent;
  gs.phase = "action";
}

function payAirportFee(gs, idx, sp) {
  const p = gs.players[idx];
  const own = gs.players.find(q => q.id === sp.owner);
  if (!own || own.id === p.id || own.bankrupted || sp.mortgaged) return;
  const cnt = gs.board.filter(s => s.type === "airport" && s.owner === own.id).length;
  const fee = gs.settings.airportFee * cnt;
  chargeMoney(gs, idx, fee, `airport fee to ${own.name}`); own.money += fee;
}

function payRailwayFee(gs, idx, sp) {
  const p = gs.players[idx];
  const own = gs.players.find(q => q.id === sp.owner);
  if (!own || own.id === p.id || own.bankrupted || sp.mortgaged) return;
  const cnt = gs.board.filter(s => s.type === "railway" && s.owner === own.id).length;
  const fee = Math.floor(25 * Math.pow(2, cnt - 1));
  chargeMoney(gs, idx, fee, `railway fee to ${own.name}`); own.money += fee;
}

function hasFullSet(gs, sp) {
  if (!sp.group || !sp.owner) return false;
  const grp = gs.board.filter(s => s.group === sp.group && s.type === "property");
  return grp.length > 0 && grp.every(s => s.owner === sp.owner);
}

function calcRent(gs, sp) {
  if (sp.type === "utility") {
    const roll = (gs.lastRoll || [3,3]).reduce((a,b) => a+b, 0);
    const cnt = gs.board.filter(s => s.type === "utility" && s.owner === sp.owner).length;
    return roll * (cnt === 2 ? 10 : 4);
  }
  const h = sp.houses || 0; const rents = sp.rents || [0,0,0,0,0,0];
  let r = rents[Math.min(h, rents.length - 1)];
  if (h === 0 && hasFullSet(gs, sp)) r *= 2;
  return r;
}

// ════════════════════════════════════════════════
//  TAX / HAZARD / CARDS
// ════════════════════════════════════════════════
function payTax(gs, idx, amount, label) {
  const p = gs.players[idx];
  const actual = Math.min(amount, p.money); p.money -= actual;
  if (gs.treasurePot !== null && gs.treasurePot !== undefined) gs.treasurePot = (gs.treasurePot || 0) + actual;
  gs.taxesPaidByPlayer[p.id] = (gs.taxesPaidByPlayer[p.id] || 0) + actual;
  gs.log.push(`${p.name} paid ${gs.settings.currency}${actual} ${label}.`);
  chkBankrupt(gs, idx);
}

function landTaxReturn(gs, idx) {
  const p = gs.players[idx]; const paid = gs.taxesPaidByPlayer[p.id] || 0;
  if (paid <= 0) { gs.log.push(`🟢 ${p.name} on Tax Return — no taxes paid yet.`); gs.phase = "action"; return; }
  const refund = Math.floor(paid * (gs.settings.taxReturnRate / 100));
  earnMoney(gs, idx, refund, "Tax Return");
  gs.taxesPaidByPlayer[p.id] = 0;
  gs.pendingEvent = {type:"tax_return",message:`${p.name} gets back ${gs.settings.currency}${refund}!`};
  gs.phase = "action";
}

function landRandomTax(gs, idx) {
  const d1 = rnd6(), d2 = rnd6();
  const amt = (d1 + d2) * gs.settings.randomTaxMultiplier;
  payTax(gs, idx, amt, "Random Tax");
  const pool = gs.randomTaxPool.filter(p => p !== gs.randomTaxPos);
  if (pool.length) gs.randomTaxPos = pick(pool);
  gs.phase = "action";
}

function applyHazard(gs, idx) {
  const p = gs.players[idx]; const haz = pick(HAZARDS);
  let lostMoney = 0, lostHouses = 0, lostRebuild = 0;
  if (haz.type === "money") { lostMoney = Math.min(haz.amount, p.money); p.money -= lostMoney; }
  else if (haz.type === "robbery") { lostMoney = p.money; p.money = 0; }
  else if (haz.type === "disaster" || haz.type === "fire") {
    const owned = p.properties.map(pos => gs.board[pos]).filter(sp => (sp.houses || 0) > 0);
    if (haz.type === "fire") {
      if (owned.length) {
        const sp = owned[0]; const demolished = sp.houses;
        lostRebuild += demolished * (sp.houseCost || 0); sp.houses = 0; lostHouses += demolished;
      }
    } else {
      const cnt = haz.fixed || (1 + Math.floor(Math.random() * 2)); let d = 0;
      for (const sp of owned) {
        if (d >= cnt) break;
        lostRebuild += sp.houseCost || 0; sp.houses--; d++; lostHouses++;
      }
    }
  }
  p.pendingHazardLoss += lostMoney; p.pendingHazardHouses += lostHouses; p.pendingHazardRebuildCost += lostRebuild;
  chkBankrupt(gs, idx);
  const pool = gs.hazardPool.filter(pos => pos !== gs.hazardPos);
  if (pool.length) gs.hazardPos = pick(pool);
  gs.pendingEvent = {type:"hazard",hazard:haz,lostMoney,lostHouses,lostRebuildCost:lostRebuild,hasInsurance:p.hasInsurance||false};
  gs.phase = "hazard_event";
}

function landGovProt(gs, idx) {
  const p = gs.players[idx]; const s = gs.settings; const cur = s.currency; let msg = "";
  if (p.badDebt && p.govProtCards > 0) {
    p.govProtCards--; Object.assign(p, {badDebt:false,badDebtTurns:0,inJail:false});
    earnMoney(gs, idx, s.govBailoutAmount, "Gov bailout");
    msg = `🏛️ ${p.name} BAILED OUT! Gets ${cur}${s.govBailoutAmount}`;
  } else if ((p.pendingHazardLoss || 0) > 0 || (p.pendingHazardRebuildCost || 0) > 0) {
    const mc = p.pendingHazardLoss || 0; const rc = p.pendingHazardRebuildCost || 0; const tc = mc + rc;
    earnMoney(gs, idx, tc, "Gov hazard compensation");
    Object.assign(p, {pendingHazardLoss:0,pendingHazardHouses:0,pendingHazardRebuildCost:0});
    msg = `🏛️ Government compensates ${p.name} ${cur}${tc}!`;
  } else if (p.money < 100) {
    earnMoney(gs, idx, s.govGrantAmount, "Gov grant");
    msg = `🏛️ ${p.name} gets grant: ${cur}${s.govGrantAmount}`;
  } else {
    msg = `🏛️ ${p.name} on Gov. Protection — all good!`;
  }
  gs.log.push(msg); gs.pendingEvent = {type:"gov_prot",message:msg}; gs.phase = "gov_prot_event";
}

function drawSurprise(gs, idx) {
  const roll = Math.floor(Math.random() * 100);
  let card, tier;
  if (roll === 0 && gs.settings.enableVeryGoodSurprises) { card = pick(VERY_GOOD); tier = "very_good"; }
  else if (roll === 1 && gs.settings.enableVeryBadSurprises) { card = pick(VERY_BAD); tier = "very_bad"; }
  else if (roll <= 49) { card = pick(BAD_SURP); tier = "bad"; }
  else { card = pick(GOOD_SURP); tier = "good"; }
  gs.chanceIdx++;
  gs.pendingEvent = {type:"surprise",card,tier,isSpecialCard:true};
  gs.log.push(`🃏 Surprise (${tier}): ${card.text || card.title || ""}`);
  applyCard(gs, idx, card, true);
}

function drawChest(gs, idx) {
  const deck = gs.chestDeck; const c = deck[gs.chestIdx % deck.length]; gs.chestIdx++;
  gs.log.push(`📦 Chest: ${c.text}`); applyCard(gs, idx, c, false);
}

function applyCard(gs, idx, card, surprise) {
  const p = gs.players[idx]; const a = card.action;
  if      (a === "gain")          earnMoney(gs, idx, card.amount, "card");
  else if (a === "pay")           chargeMoney(gs, idx, card.amount, "card penalty");
  else if (a === "goto") {
    p.position = card.position;
    if (card.position === 0) earnMoney(gs, idx, gs.settings.goSalary, "GO");
    landOn(gs, idx); return;
  }
  else if (a === "jail")          { sendJail(gs, idx); gs.phase = "action"; return; }
  else if (a === "back3")         { p.position = Math.max(0, p.position - 3); landOn(gs, idx); return; }
  else if (a === "jail_card")     p.jailCards++;
  else if (a === "gov_card")      { p.govProtCards++; gs.log.push(`🏛️ ${p.name} got a Gov Protection card!`); }
  else if (a === "insurance_free") {
    if (!p.hasInsurance) { p.hasInsurance = true; gs.log.push(`🛡️ ${p.name} got free insurance!`); }
  }
  else if (a === "birthday") {
    for (let i = 0; i < gs.players.length; i++) {
      if (i !== idx && !gs.players[i].bankrupted) { gs.players[i].money -= 50; earnMoney(gs, idx, 50, "birthday"); }
    }
  }
  else if (a === "repairs") {
    const h  = p.properties.reduce((a,x) => a + Math.min(gs.board[x].houses||0, 4), 0);
    const ho = p.properties.filter(x => (gs.board[x].houses||0) === 5).length;
    chargeMoney(gs, idx, h * 40 + ho * 115, "repairs");
  }
  chkBankrupt(gs, idx);
  if (gs.phase === "hazard_event") return;
  gs.phase = (surprise && gs.pendingEvent && gs.pendingEvent.isSpecialCard) ? "surprise_event" : "action";
}

// ════════════════════════════════════════════════
//  BUY / BUILD / MORTGAGE
// ════════════════════════════════════════════════
function doBuy(gs, idx) {
  const p = gs.players[idx]; const sp = gs.board[p.position];
  if (!sp || sp.owner) { gs.phase = "action"; return; }
  const cc = p.creditCard; const ccRoom = (cc && cc.active) ? (cc.limit - (cc.used||0)) : 0;
  if (p.money + ccRoom < sp.price) { gs.phase = "action"; return; }
  if (p.money >= sp.price) p.money -= sp.price;
  else { const fc = sp.price - p.money; cc.used = (cc.used||0) + fc; p.money = 0; }
  sp.owner = p.id; p.properties.push(p.position);
  gs.log.push(`🏠 ${p.name} bought ${sp.name} for ${gs.settings.currency}${sp.price}`);
  gs.phase = "action";
}

function doEndTurn(gs, idx) {
  const p = gs.players[idx]; const last = gs.lastRoll || [];
  if (last.length === 2 && last[0] === last[1] && !p.inJail && !p.badDebt) {
    gs.phase = "roll"; gs.log.push(`${p.name} rolled doubles — roll again!`);
  } else nextTurn(gs);
}

function doBuild(gs, idx, data) {
  const p = gs.players[idx]; const pos = data.position;
  if (pos == null || pos >= gs.board.length) return;
  const sp = gs.board[pos];
  if (!sp || sp.owner !== p.id || sp.type !== "property") return;
  if (gs.settings.housingRule === "monopoly") {
    const grp = gs.board.filter(s => s.group === sp.group);
    if (!grp.every(s => s.owner === p.id)) return;
  }
  const hc = sp.houseCost || 100;
  if (p.money < hc || (sp.houses||0) >= 5) return;
  if (gs.settings.evenBuild) {
    const grp = gs.board.filter(s => s.group === sp.group);
    if ((sp.houses||0) > Math.min(...grp.map(s => s.houses||0))) return;
  }
  p.money -= hc; sp.houses = (sp.houses||0) + 1;
  gs.log.push(`🏗️ ${p.name} built on ${sp.name}`);
}

function doSellHouse(gs, idx, data) {
  const p = gs.players[idx]; const pos = data.position;
  if (pos == null || pos >= gs.board.length) return;
  const sp = gs.board[pos];
  if (!sp || sp.owner !== p.id || !(sp.houses||0)) return;
  earnMoney(gs, idx, Math.floor((sp.houseCost||100) / 2), "sold house");
  sp.houses--;
}

function doMortgage(gs, idx, data) {
  const p = gs.players[idx]; const pos = data.position;
  if (pos == null || pos >= gs.board.length) return;
  const sp = gs.board[pos];
  if (!sp || sp.owner !== p.id || sp.mortgaged || (sp.houses||0) > 0) return;
  sp.mortgaged = true; earnMoney(gs, idx, Math.floor(sp.price / 2), "mortgage");
  gs.log.push(`${p.name} mortgaged ${sp.name}`);
}

function doUnmortgage(gs, idx, data) {
  const p = gs.players[idx]; const pos = data.position;
  if (pos == null || pos >= gs.board.length) return;
  const sp = gs.board[pos];
  if (!sp || sp.owner !== p.id || !sp.mortgaged) return;
  const cost = Math.floor(sp.price * 0.55);
  if (p.money < cost) return;
  sp.mortgaged = false; p.money -= cost;
}

function doPayJail(gs, idx) {
  const p = gs.players[idx];
  if (!p.inJail || p.badDebt) return;
  chargeMoney(gs, idx, 50, "jail fine"); p.inJail = false; p.jailTurns = 0; gs.phase = "roll";
}

function doUseJailCard(gs, idx) {
  const p = gs.players[idx];
  if (!p.inJail || p.jailCards < 1 || p.badDebt) return;
  p.jailCards--; p.inJail = false; p.jailTurns = 0; gs.phase = "roll";
}

function doUseGovProt(gs, idx) {
  const p = gs.players[idx];
  if (!p.badDebt || p.govProtCards < 1) return;
  p.govProtCards--; Object.assign(p, {badDebt:false,badDebtTurns:0,inJail:false});
  earnMoney(gs, idx, gs.settings.govBailoutAmount, "Gov bailout"); gs.phase = "action";
}

function doTravelAir(gs, idx, data) {
  const p = gs.players[idx]; const destPos = data.destPos;
  if (destPos == null || destPos >= gs.board.length) return;
  const dest = gs.board[destPos];
  if (!dest || dest.type !== "airport") return;
  chargeMoney(gs, idx, gs.settings.travelFee, "air travel");
  if (gs.treasurePot !== null && gs.treasurePot !== undefined) gs.treasurePot = (gs.treasurePot||0) + gs.settings.travelFee;
  p.position = destPos; gs.log.push(`✈️ ${p.name} flew to ${dest.name}`); gs.phase = "action";
}

function doTravelRail(gs, idx, data) {
  const p = gs.players[idx]; const destPos = data.destPos;
  if (destPos == null) return;
  const cur = gs.board[p.position];
  if (!((cur.connects || []).includes(destPos))) return;
  const fee = gs.settings.railwayFee || 75;
  chargeMoney(gs, idx, fee, "railway ride");
  if (gs.treasurePot !== null && gs.treasurePot !== undefined) gs.treasurePot = (gs.treasurePot||0) + fee;
  if ((cur.goBonus || []).includes(destPos)) earnMoney(gs, idx, gs.settings.goSalary, "railway GO bonus");
  p.position = destPos; gs.log.push(`🚂 ${p.name} rode to ${gs.board[destPos]?.name || "railway"}`); gs.phase = "action";
}

function doGoPayEmi(gs, idx) {
  const p = gs.players[idx]; const cc = p.creditCard;
  if (cc && cc.active && (cc.used||0) > 0) {
    const emi = Math.min(cc.emi, cc.used||0, p.money); p.money -= emi; cc.used -= emi;
    if (cc.used <= 0) p.creditCard = null;
  }
  gs.pendingEvent = null; landOn(gs, idx);
}

// ════════════════════════════════════════════════
//  BANK
// ════════════════════════════════════════════════
function doBankDeposit(gs, idx, data) {
  const p = gs.players[idx]; const amt = Math.min(data.amount || 100, p.money);
  if (amt <= 0) return;
  p.money -= amt; p.bankDeposit += amt;
  gs.log.push(`🏦 ${p.name} deposited ${gs.settings.currency}${amt}`);
}

function doBankWithdraw(gs, idx, data) {
  const p = gs.players[idx]; const mx = p.bankDeposit + p.bankDepositInterest;
  const amt = Math.min(data.amount || mx, mx);
  if (amt <= 0) return;
  const fi = Math.min(amt, p.bankDepositInterest); const fp = amt - fi;
  p.bankDepositInterest -= fi; p.bankDeposit -= fp; p.money += amt;
  gs.log.push(`🏦 ${p.name} withdrew ${gs.settings.currency}${amt}`);
}

function doBankLoan(gs, idx, data) {
  const p = gs.players[idx]; const total = p.loans.reduce((a,l) => a + l.remaining, 0);
  const amt = Math.min(data.amount || 500, 5000 - total);
  if (amt <= 0) return;
  const turns = Math.max(data.tenure || 6, 2);
  const loan = {id:randomUUID(),principal:amt,remaining:amt,rate:gs.settings.loanRate,turnsLeft:turns,totalTurns:turns};
  p.loans.push(loan); earnMoney(gs, idx, amt, "bank loan");
  gs.log.push(`🏦 ${p.name} took loan ${gs.settings.currency}${amt} for ${turns} turns`);
}

function doBankRepay(gs, idx, data) {
  const p = gs.players[idx]; const lid = data.loanId;
  const loan = p.loans.find(l => l.id === lid) || p.loans[0];
  if (!loan) return;
  const amt = Math.min(data.amount || loan.remaining, loan.remaining, p.money);
  if (amt <= 0) return;
  loan.remaining -= amt; p.money -= amt;
  if (loan.remaining <= 0) p.loans = p.loans.filter(l => l !== loan);
}

function doBankCredit(gs, idx, data) {
  const p = gs.players[idx];
  if (p.creditCard && p.creditCard.active) return;
  const fee = gs.settings.creditCardFee || 50;
  if (p.money < fee) return;
  const limit = gs.settings.creditCardLimit || 500;
  const ten = Math.max(data.tenure || 6, 3);
  p.money -= fee;
  p.creditCard = {active:true,used:0,limit,emi:Math.ceil(limit/ten),tenure:ten,paidTurns:0,roundsLeft:gs.settings.creditCardRounds||2};
}

function doBankPayEmi(gs, idx) {
  const p = gs.players[idx]; const cc = p.creditCard;
  if (!cc || !cc.active || (cc.used||0) <= 0) return;
  const emi = Math.min(cc.emi, cc.used||0, p.money); p.money -= emi; cc.used -= emi;
  if (cc.used <= 0) p.creditCard = null;
}

function doBankInsurance(gs, idx) {
  const p = gs.players[idx];
  if (p.hasInsurance || p.money < 150) return;
  p.money -= 150; p.hasInsurance = true;
  gs.log.push(`🛡️ ${p.name} bought hazard insurance!`);
}

function doClaimInsurance(gs, idx) {
  const p = gs.players[idx];
  const total = (p.pendingHazardLoss||0) + (p.pendingHazardRebuildCost||0);
  if (!p.hasInsurance || total <= 0) return;
  const payout = Math.floor(total * (gs.settings.insurancePayout / 100));
  earnMoney(gs, idx, payout, "insurance payout");
  p.pendingHazardLoss = 0; p.pendingHazardRebuildCost = 0;
}

// ════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════
function earnMoney(gs, idx, amount, _label) {
  const p = gs.players[idx]; p.money += amount; p.totalEarned = (p.totalEarned||0) + amount;
}

function chargeMoney(gs, idx, amount, _label) {
  const p = gs.players[idx]; const cc = p.creditCard;
  const ccRoom = (cc && cc.active) ? (cc.limit - (cc.used||0)) : 0;
  if (p.money >= amount) p.money -= amount;
  else if (p.money + ccRoom >= amount) { const fc = amount - p.money; cc.used = (cc.used||0) + fc; p.money = 0; }
  else p.money -= amount;
  chkBankrupt(gs, idx);
}

function sendJail(gs, idx) {
  const p = gs.players[idx]; Object.assign(p, {position:10,inJail:true,jailTurns:0}); gs.doublesCount = 0;
  gs.log.push(`⛓️ ${p.name} sent to jail!`);
}

function chkBankrupt(gs, idx) {
  const p = gs.players[idx];
  if (p.money >= 0) return;
  const totalDebt = p.loans.reduce((a,l) => a+l.remaining, 0) + ((p.creditCard||{}).used||0);
  if (p.money + (p.bankDeposit||0) + (p.bankDepositInterest||0) > -totalDebt) return;
  p.bankrupted = true;
  for (const sp of gs.board) {
    if (sp.owner === p.id) Object.assign(sp, {owner:null,houses:0,mortgaged:false});
  }
  p.properties = [];
  gs.log.push(`💀 ${p.name} went bankrupt!`);
  const alive = gs.players.filter(q => !q.bankrupted);
  if (alive.length === 1) gs.winner = alive[0].id;
}

export function nextTurn(gs) {
  let n = (gs.currentPlayerIdx + 1) % gs.players.length; let loops = 0;
  while (gs.players[n].bankrupted && loops < gs.players.length) { n = (n+1) % gs.players.length; loops++; }
  Object.assign(gs, {currentPlayerIdx:n, phase:"roll", doublesCount:0});
  gs.turnInRound++;
  const alive = gs.players.filter(p => !p.bankrupted);
  if (gs.turnInRound >= alive.length) {
    gs.round++; gs.turnInRound = 0;
    const pool = gs.hazardPool.filter(p => p !== gs.hazardPos);
    if (pool.length) gs.hazardPos = pick(pool);
    if (gs.round - gs.taxReturnLastMoved >= gs.settings.taxReturnMoveEvery) {
      const pool2 = gs.taxReturnPool.filter(p => p !== gs.taxReturnPos);
      if (pool2.length) { gs.taxReturnPos = pick(pool2); gs.taxReturnLastMoved = gs.round; }
    }
  }
  gs.log.push(`─── ${gs.players[n].name}'s turn ───`);
  if (gs.log.length > 100) gs.log = gs.log.slice(-80);
}

export function execTrade(gs, fi, ti, offer) {
  const f = gs.players[fi], t = gs.players[ti];
  f.money += (offer.toMoney||0) - (offer.fromMoney||0);
  t.money += (offer.fromMoney||0) - (offer.toMoney||0);
  for (const pos of (offer.fromProps||[])) {
    gs.board[pos].owner = t.id; f.properties = f.properties.filter(p => p!==pos); t.properties.push(pos);
  }
  for (const pos of (offer.toProps||[])) {
    gs.board[pos].owner = f.id; t.properties = t.properties.filter(p => p!==pos); f.properties.push(pos);
  }
  gs.log.push(`💱 Trade: ${f.name} ↔ ${t.name}`);
}

// ════════════════════════════════════════════════
//  BOARD GENERATION
// ════════════════════════════════════════════════
function buildRents(price) {
  return [0.04, 0.20, 0.60, 1.40, 1.70, 2.00].map(x => Math.floor(price * x));
}

export function generateDefaultBoard(S) {
  const C = S + 1; const total = 4 * C;
  // Airports at exact centre of each side
  const half = Math.round(S / 2);
  const ap = {S: half, W: C + half, N: 2*C + half, E: 3*C + half};
  // Railways 2 steps before each airport
  const rw = {S: ap.S - 2, W: ap.W - 2, N: ap.N - 2, E: ap.E - 2};
  // Tax Refund tile: between east railway and east airport (ap.E - 1)
  const taxRet = ap.E - 1;
  const gov = 2*C - Math.round(S*0.35); const pt = C + Math.round(S*0.6); const gt = 2*C + Math.round(S*0.6);
  const surp = [
    Math.min(Math.max(2,Math.round(S*0.2)),total-1),
    Math.min(C+Math.round(S*0.8),total-1),
    Math.min(2*C+Math.round(S*0.7),total-1),
    Math.min(3*C+Math.round(S*0.8),total-1),
  ].filter(p => p !== taxRet && p !== rw.S && p !== rw.W && p !== rw.N && p !== rw.E);
  const specials = new Set([0,C,2*C,3*C,1,2*C-1,C+1,gov,pt,gt,taxRet,...Object.values(ap),...Object.values(rw),...surp]);
  const propSlots = Array.from({length:total},(_,i)=>i).filter(i => !specials.has(i));
  const grpSz = Math.ceil(propSlots.length / 8);
  const grpMap = {}; propSlots.forEach((pos,i) => grpMap[pos] = `g${Math.min(Math.floor(i/grpSz), 7)}`);
  const basePrices = [20,50,90,130,180,240,300,360];
  const board = [];
  for (let pos = 0; pos < total; pos++) {
    if      (pos === 0)       board.push({pos,type:"go",name:"GO"});
    else if (pos === C)       board.push({pos,type:"jail",name:"Jail"});
    else if (pos === 2*C)     board.push({pos,type:"free_parking",name:"Free Parking"});
    else if (pos === 3*C)     board.push({pos,type:"go_to_jail",name:"Go To Jail"});
    else if (pos === 1)       board.push({pos,type:"income_tax",name:"💰 Income Tax"});
    else if (pos === 2*C-1)   board.push({pos,type:"luxury_tax",name:"💰 Luxury Tax",amount:100});
    else if (pos === C+1)     board.push({pos,type:"chest",name:"📦 Community Chest"});
    else if (pos === gov)     board.push({pos,type:"gov_prot",name:"🏛️ Gov. Protection"});
    else if (pos === pt)      board.push({pos,type:"property_tax",name:"🏠 Property Tax"});
    else if (pos === gt)      board.push({pos,type:"gains_tax",name:"📈 Gains Tax"});
    else if (pos === taxRet)  board.push({pos,type:"tax_return",name:"📋 Tax Refund"});
    else if (pos === ap.S)    board.push({pos,type:"airport",name:"✈ South Airport",label:"south",price:200,owner:null,mortgaged:false});
    else if (pos === ap.W)    board.push({pos,type:"airport",name:"✈ West Airport",label:"west",price:200,owner:null,mortgaged:false});
    else if (pos === ap.N)    board.push({pos,type:"airport",name:"✈ North Airport",label:"north",price:200,owner:null,mortgaged:false});
    else if (pos === ap.E)    board.push({pos,type:"airport",name:"✈ East Airport",label:"east",price:200,owner:null,mortgaged:false});
    else if (pos === rw.S)    board.push({pos,type:"railway",name:"🚂 South Rail",label:"south",connects:[rw.W,rw.N],goBonus:[],price:150,owner:null,mortgaged:false});
    else if (pos === rw.W)    board.push({pos,type:"railway",name:"🚂 West Rail",label:"west",connects:[rw.E,rw.N],goBonus:[rw.E,rw.N],price:150,owner:null,mortgaged:false});
    else if (pos === rw.N)    board.push({pos,type:"railway",name:"🚂 North Rail",label:"north",connects:[rw.E,rw.S],goBonus:[],price:150,owner:null,mortgaged:false});
    else if (pos === rw.E)    board.push({pos,type:"railway",name:"🚂 East Rail",label:"east",connects:[rw.S,rw.W],goBonus:[],price:150,owner:null,mortgaged:false});
    else if (surp.includes(pos)) board.push({pos,type:"chance",name:"❓ Surprise"});
    else if (grpMap[pos] !== undefined) {
      const grp = grpMap[pos]; const gi = parseInt(grp[1]); const base = basePrices[gi];
      const slots = propSlots.filter(p => grpMap[p] === grp); const idx = slots.indexOf(pos);
      const price = base + idx * 10;
      board.push({pos,type:"property",group:grp,name:`Property ${pos}`,price,rents:buildRents(price),houseCost:Math.max(50,Math.floor(price*0.5)),houses:0,owner:null,mortgaged:false});
    }
    else board.push({pos,type:"chance",name:"❓ Surprise"});
  }
  return board;
}

export function generateRandomBoard(seedStr, mode, S) {
  const rng = makeRng(seedStr);
  const rngPick = arr => arr[Math.floor(rng() * arr.length)];
  const board = generateDefaultBoard(S);
  const TIER = {g0:[1,1],g1:[1,2],g2:[2,2],g3:[2,3],g4:[3,4],g5:[4,5],g6:[5,6],g7:[6,6]};
  if (mode === "same_country") {
    const c = rngPick(COUNTRIES);
    let i = 0;
    for (const sp of board.filter(s => s.type === "property")) {
      sp.name = c.cities[i % c.cities.length]; sp.countryFlag = c.flag; sp.countryName = c.name; i++;
    }
  } else {
    const used = new Set();
    for (let gi = 0; gi < 8; gi++) {
      const grp = `g${gi}`;
      let pool;
      if (mode === "balanced") {
        const [lo,hi] = TIER[grp];
        pool = COUNTRIES.filter(c => lo<=c.tier && c.tier<=hi && !used.has(c.code));
        if (!pool.length) pool = COUNTRIES.filter(c => !used.has(c.code));
        if (!pool.length) pool = COUNTRIES;
      } else pool = COUNTRIES;
      const c = rngPick(pool); used.add(c.code); let ci = 0;
      for (const sp of board.filter(s => s.type === "property" && s.group === grp)) {
        sp.name = c.cities[ci % c.cities.length]; sp.countryFlag = c.flag; sp.countryName = c.name; ci++;
      }
    }
  }
  return board;
}

export function generateDomesticBoard(preset, S) {
  const dm = DOMESTIC_MAPS[preset];
  if (!dm) return generateDefaultBoard(S);
  const board = generateDefaultBoard(S);
  const states = dm.states;
  const propByGroup = {};
  for (const sp of board) {
    if (sp.type === "property") {
      const grp = sp.group || "g0";
      if (!propByGroup[grp]) propByGroup[grp] = [];
      propByGroup[grp].push(sp);
    }
  }
  const statePrices = [20,50,90,130,180,240,300,380];
  for (let gi = 0; gi < 8; gi++) {
    const grp = `g${gi}`; const props = propByGroup[grp] || []; const state = states[gi % states.length];
    const cities = state.cities; const basePrice = statePrices[gi];
    props.forEach((sp, ci) => {
      const city = cities[ci % cities.length];
      sp.name = city; sp.stateName = state.name;
      sp.countryFlag = dm.flag; sp.countryName = dm.name;
      sp.price = basePrice + ci * 10; sp.rents = buildRents(sp.price);
      sp.houseCost = Math.max(50, Math.floor(sp.price * 0.5));
    });
  }
  return board;
}

export function getCountriesList() {
  return COUNTRIES.map(c => ({code:c.code,name:c.name,flag:c.flag,tier:c.tier,base:c.base,cities:c.cities}));
}

export function getDomesticMaps() {
  const result = {};
  for (const [k,v] of Object.entries(DOMESTIC_MAPS)) {
    result[k] = {name:v.name,flag:v.flag,states:v.states.map(s => ({name:s.name,cities:s.cities}))};
  }
  return result;
}

// ════════════════════════════════════════════════
//  AUCTION SYSTEM
// ════════════════════════════════════════════════
export function doStartAuction(gs, pi, _data) {
  const p = gs.players[pi]; const pos = p.position; const sp = gs.board[pos];
  if (!sp || sp.owner || !["property","airport","railway"].includes(sp.type)) { gs.phase = "action"; return; }
  openAuction(gs, pos, sp.price, false, pi);
}

export function doStartBankruptAuction(gs, pi, data) {
  const pos = data.position; if (pos == null) return;
  const sp = gs.board[pos];
  if (!sp || sp.owner !== gs.players[pi].id) return;
  let base = Math.floor((sp.price||100) / 2);
  if ((sp.houses||0) > 0) base += Math.floor((sp.houseCost||50) / 2) * sp.houses;
  openAuction(gs, pos, base, true, pi);
}

function openAuction(gs, pos, basePrice, isBankrupt, auctioneerIdx) {
  const sp = gs.board[pos];
  gs.auction = {
    pos, basePrice, currentBid: basePrice,
    highBidder: null, bidHistory: [], folded: [],
    isBankrupt, auctioneerIdx, active: true, timerStart: null,
    propertySnapshot: {
      name: sp.name||"", price: sp.price||0, group: sp.group,
      rents: sp.rents||[], houseCost: sp.houseCost||0, houses: sp.houses||0,
      type: sp.type||"property", countryFlag: sp.countryFlag||"",
      countryName: sp.countryName||"", stateName: sp.stateName||"",
    },
  };
  gs.phase = "auction";
  gs.log.push(`🔨 Auction started for ${sp.name}! Base: ${gs.settings.currency}${basePrice}`);
}

export function doAuctionBid(gs, pi, data) {
  if (gs.phase !== "auction" || !gs.auction) return;
  const p = gs.players[pi]; const auc = gs.auction;
  if (auc.folded.includes(p.id)) return;
  const amount = parseInt(data.amount || auc.currentBid + 10);
  if (amount <= auc.currentBid) return;
  if (p.money < amount) return;
  auc.currentBid = amount; auc.highBidder = p.id; auc.timerStart = null;
  auc.bidHistory.push({playerId:p.id,playerName:p.name,amount});
  gs.log.push(`🔨 ${p.name} bids ${gs.settings.currency}${amount}`);
}

export function doAuctionFold(gs, pi) {
  if (gs.phase !== "auction" || !gs.auction) return;
  const p = gs.players[pi]; const auc = gs.auction;
  if (!auc.folded.includes(p.id)) { auc.folded.push(p.id); gs.log.push(`🏳️ ${p.name} folded.`); }
  const aliveIds = gs.players.filter(q => !q.bankrupted).map(q => q.id);
  const activeIds = aliveIds.filter(x => !auc.folded.includes(x));
  if (activeIds.length <= 1) doAuctionEnd(gs);
}

export function doAuctionEnd(gs) {
  if (!gs.auction) return;
  const auc = gs.auction; auc.active = false;
  const pos = auc.pos; const sp = gs.board[pos];
  if (auc.highBidder) {
    const winnerIdx = gs.players.findIndex(p => p.id === auc.highBidder);
    if (winnerIdx >= 0) {
      const winner = gs.players[winnerIdx];
      if (auc.isBankrupt) {
        const prevOwner = sp.owner;
        if (prevOwner) {
          const prevP = gs.players.find(p => p.id === prevOwner);
          if (prevP) {
            prevP.properties = prevP.properties.filter(x => x !== pos);
            const houseVal = Math.floor((sp.houseCost||50)/2) * (sp.houses||0);
            earnMoney(gs, gs.players.indexOf(prevP), houseVal, "auction house proceeds");
          }
        }
      }
      chargeMoney(gs, winnerIdx, auc.currentBid, "auction");
      sp.owner = winner.id;
      if (!winner.properties.includes(pos)) winner.properties.push(pos);
      gs.log.push(`🏆 ${winner.name} won ${sp.name} for ${gs.settings.currency}${auc.currentBid}!`);
    }
  } else {
    gs.log.push(`🔨 No bids — ${sp.name} remains unowned.`);
  }
  gs.auction = null; gs.phase = "action";
  const winnerIdx2 = auc.highBidder ? gs.players.findIndex(p => p.id === auc.highBidder) : -1;
  if (winnerIdx2 >= 0) chkBankrupt(gs, winnerIdx2);
}
