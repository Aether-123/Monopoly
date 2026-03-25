"use strict";

const COUNTRY_DATA = {
  nigeria:{iso:"ng",cities:["Kano","Ibadan","Maiduguri","Kaduna","Zaria","Aba","Ilorin","Jos","Enugu","Abeokuta","Onitsha","Port Harcourt","Abuja","Lagos","Victoria Island"]},
  pakistan:{iso:"pk",cities:["Mianwali","Larkana","Sukkur","Bahawalpur","Sargodha","Multan","Peshawar","Hyderabad","Rawalpindi","Faisalabad","Gujranwala","Islamabad","Lahore","Karachi","Clifton"]},
  bangladesh:{iso:"bd",cities:["Mymensingh","Rangpur","Bogra","Barisal","Jessore","Sylhet","Comilla","Rajshahi","Khulna","Brahmanbaria","Gazipur","Tongi","Narayanganj","Chittagong","Dhaka Gulshan"]},
  egypt:{iso:"eg",cities:["Aswan","Luxor","Asyut","Damanhur","Faiyum","Zagazig","Mansoura","Tanta","Ismailia","Suez","Port Said","Alexandria","Giza","Cairo","New Cairo"]},
  philippines:{iso:"ph",cities:["Davao","Zamboanga","Cagayan de Oro","Bacoor","Antipolo","Caloocan","Las Pinas","Pasig","Quezon City","Cebu","Mandaluyong","Taguig","Manila","Makati","BGC Taguig"]},
  turkey:{iso:"tr",cities:["Diyarbakir","Sanliurfa","Hatay","Kayseri","Konya","Gaziantep","Adana","Mersin","Manisa","Kocaeli","Bursa","Antalya","Izmir","Ankara","Istanbul Besiktas"]},
  thailand:{iso:"th",cities:["Nakhon Si Thammarat","Songkhla","Ubon Ratchathani","Khon Kaen","Udon Thani","Hat Yai","Rayong","Chiang Rai","Nonthaburi","Phuket","Chiang Mai","Surat Thani","Bangkok Thon Buri","Bangkok CBD","Sukhumvit"]},
  indonesia:{iso:"id",cities:["Samarinda","Padang","Malang","Bogor","Bandar Lampung","Palembang","Makassar","Semarang","Bandung","Medan","Depok","Bekasi","Surabaya","Jakarta Selatan","SCBD Jakarta"]},
  argentina:{iso:"ar",cities:["Resistencia","Posadas","Corrientes","Parana","San Juan","Salta","Santa Fe","Mar del Plata","Mendoza","Rosario","Cordoba","La Plata","Tucuman","Buenos Aires","Puerto Madero"]},
  poland:{iso:"pl",cities:["Sosnowiec","Radom","Czestochowa","Bydgoszcz","Lublin","Katowice","Szczecin","Gdynia","Bialystok","Lodz","Poznan","Gdansk","Wroclaw","Krakow","Warsaw Mokotow"]},
  mexico:{iso:"mx",cities:["Acapulco","Culiacan","Juarez","Tijuana","Merida","San Luis Potosi","Leon","Puebla","Hermosillo","Aguascalientes","Mexicali","Guadalajara","Monterrey","Mexico City","Polanco"]},
  brazil:{iso:"br",cities:["Belem","Sao Luis","Manaus","Recife","Fortaleza","Salvador","Curitiba","Porto Alegre","Brasilia","Goiania","Campinas","Belo Horizonte","Rio de Janeiro","Sao Paulo","Sao Paulo Itaim"]},
  china:{iso:"cn",cities:["Harbin","Shenyang","Zhengzhou","Tianjin","Dongguan","Nanjing","Hangzhou","Wuhan","Xian","Chengdu","Chongqing","Guangzhou","Shenzhen","Beijing Chaoyang","Shanghai Lujiazui"]},
  spain:{iso:"es",cities:["Gijon","Vigo","Valladolid","Cordoba","Zaragoza","Alicante","Murcia","Seville","Las Palmas","Bilbao","Valencia","Palma","Malaga","Madrid","Barcelona Eixample"]},
  italy:{iso:"it",cities:["Reggio Calabria","Messina","Palermo","Catania","Bari","Naples","Turin","Verona","Bologna","Florence","Genoa","Padua","Trieste","Rome","Milan Centro"]},
  south_korea:{iso:"kr",cities:["Changwon","Cheongju","Jeonju","Bucheon","Ulsan","Goyang","Seongnam","Daejeon","Gwangju","Incheon","Daegu","Suwon","Yongin","Busan","Seoul Gangnam"]},
  russia:{iso:"ru",cities:["Volgograd","Perm","Voronezh","Krasnoyarsk","Ufa","Rostov-on-Don","Omsk","Samara","Chelyabinsk","Nizhny Novgorod","Kazan","Yekaterinburg","Novosibirsk","Moscow","Saint Petersburg"]},
  canada:{iso:"ca",cities:["Regina","Saskatoon","Winnipeg","Halifax","Quebec City","Edmonton","Hamilton","Ottawa","London ON","Victoria","Kitchener","Calgary","Montreal","Toronto","Vancouver West Side"]},
  australia:{iso:"au",cities:["Townsville","Cairns","Hobart","Geelong","Sunshine Coast","Wollongong","Logan City","Newcastle","Gold Coast","Adelaide","Canberra","Brisbane","Perth","Melbourne","Sydney Eastern"]},
  france:{iso:"fr",cities:["Saint-Etienne","Le Havre","Reims","Toulon","Rennes","Strasbourg","Montpellier","Bordeaux","Nantes","Lille","Lyon","Nice","Marseille","Paris 10e","Paris 16e"]},
  germany:{iso:"de",cities:["Duisburg","Dortmund","Essen","Nuremberg","Hanover","Leipzig","Dresden","Bremen","Stuttgart","Dusseldorf","Cologne","Frankfurt","Hamburg","Berlin Mitte","Munich Maxvorstadt"]},
  united_kingdom:{iso:"gb",cities:["Bradford","Belfast","Coventry","Leicester","Nottingham","Cardiff","Liverpool","Bristol","Edinburgh","Leeds","Sheffield","Birmingham","Manchester","London Canary Wharf","London Kensington"]},
  india:{iso:"in",cities:["Visakhapatnam","Nagpur","Kanpur","Lucknow","Surat","Jaipur","Ahmedabad","Pune","Kolkata","Chennai","Hyderabad","Bangalore Whitefield","Delhi Connaught Place","Mumbai Bandra","Mumbai Nariman Point"]},
  japan:{iso:"jp",cities:["Sakai","Kitakyushu","Sendai","Hiroshima","Saitama","Chiba","Kyoto","Fukuoka","Kawasaki","Kobe","Sapporo","Nagoya","Yokohama","Osaka","Tokyo Minato"]},
  netherlands:{iso:"nl",cities:["Zaandam","Enschede","Arnhem","Amersfoort","Breda","Nijmegen","Haarlem","Almere","Groningen","Tilburg","Eindhoven","Utrecht","The Hague","Rotterdam","Amsterdam Canal Ring"]},
  united_states:{iso:"us",cities:["Jacksonville","Columbus","Fort Worth","Charlotte","Phoenix","San Antonio","Houston","Dallas","Philadelphia","Chicago","San Diego","Austin","Los Angeles","San Francisco","New York Manhattan"]},
  singapore:{iso:"sg",cities:["Woodlands","Yishun","Hougang","Sengkang","Punggol","Tampines","Ang Mo Kio","Bedok","Clementi","Queenstown","Toa Payoh","Kallang","Jurong East","Bukit Timah","Orchard Road"]},
  switzerland:{iso:"ch",cities:["Schaffhausen","Winterthur","Lucerne","St. Gallen","Biel","Thun","Chur","Lausanne","Bern","Lugano","Basel","Zurich Altstetten","Zurich Oerlikon","Geneva","Zurich Seefeld"]}
};

const CITY_TO_COUNTRY = {};
Object.entries(COUNTRY_DATA).forEach(([countryKey, data]) => {
  data.cities.forEach((city) => {
    CITY_TO_COUNTRY[city.toLowerCase()] = { countryKey, iso: data.iso };
  });
});

function getCountryForCity(cityName) {
  if (!cityName) return null;
  return CITY_TO_COUNTRY[String(cityName).toLowerCase()] || null;
}

const FLAG_URL_PREFIXES = ["/flags/", "/flags/svg/", "./flags/", "./flags/svg/"];

function getFlagUrl(iso, prefix = FLAG_URL_PREFIXES[0]) {
  return `${prefix}${String(iso || "").toLowerCase()}.svg`;
}

function clearTileFlagVisuals(tileEl) {
  tileEl.querySelectorAll(".tile-flag").forEach((el) => el.remove());
  tileEl.classList.remove("tile-flag-bg", "tile-flag-missing");
  tileEl.style.removeProperty("--tile-flag-url");
}

function applyFlagBackground(tileEl, iso, url) {
  tileEl.style.setProperty("--tile-flag-url", `url("${url}")`);
  tileEl.classList.add("tile-flag-bg");
  tileEl.classList.remove("tile-flag-missing");
  tileEl.dataset.iso = String(iso || "").toLowerCase();
}

function tryApplyFlagBackground(tileEl, iso, index = 0) {
  if (index >= FLAG_URL_PREFIXES.length) {
    tileEl.classList.remove("tile-flag-bg");
    tileEl.classList.add("tile-flag-missing");
    return;
  }

  const url = getFlagUrl(iso, FLAG_URL_PREFIXES[index]);
  const probe = new Image();
  probe.onload = () => applyFlagBackground(tileEl, iso, url);
  probe.onerror = () => tryApplyFlagBackground(tileEl, iso, index + 1);
  probe.src = url;
}

function injectFlagIntoTile(tileEl) {
  clearTileFlagVisuals(tileEl);

  const iso = String(tileEl.dataset.iso || "").trim().toLowerCase();
  if (!iso) return;
  if (tileEl.classList.contains("corner-tile")) return;
  if (!tileEl.classList.contains("tile-property")) return;

  tryApplyFlagBackground(tileEl, iso);
}

window.COUNTRY_DATA = COUNTRY_DATA;
window.CITY_TO_COUNTRY = CITY_TO_COUNTRY;
window.getCountryForCity = getCountryForCity;
window.getFlagUrl = getFlagUrl;
window.injectFlagIntoTile = injectFlagIntoTile;
