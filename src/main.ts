// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

import { Board, Cell } from "./board.ts";
// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
//const TILE_DEGREES = 1e-4;
//const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;
const TILE_WIDTH = 0.0001;
const TILE_VISIBILITY_RADIUS = 8;

const board = new Board(TILE_WIDTH, TILE_VISIBILITY_RADIUS);
// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

const playerInventory: Coin[] = [];
class Coin {
  constructor(public id: string) {}
}

interface Cache {
  location: leaflet.LatLng;
  coins: Coin[];
}

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

function resolveAssetPath(relativePath: string): string {
  return import.meta.resolve(`../public/${relativePath}`);
}

const playerIcon = leaflet.icon({
  iconUrl: resolveAssetPath("MarkerIcon.png"),
  iconSize: [32, 32],
});

const cacheIcon = leaflet.icon({
  iconUrl: resolveAssetPath("CacheIcon.png"),
  iconSize: [32, 32],
});

// Add a marker to represent the player
const playerMarker = leaflet.marker(OAKES_CLASSROOM, { icon: playerIcon });
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Display the player's points
//let playerPoints = 0;
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!; // element `statusPanel` is defined in index.html
statusPanel.innerHTML = "inventory:";

// Add caches to the map by cell numbers
function spawnCache(point: leaflet.LatLng) {
  const cell: Cell = board.getCellForPoint(point);

  //const origin = OAKES_CLASSROOM;
  const bounds = board.getCellBound(cell);
  const cacheLocation = bounds.getCenter();

  const cache = {
    location: cacheLocation,
    coins: [] as Coin[],
  };

  const numberOfCoins = Math.floor(luck(`${cell.i},${cell.j}`) * 100);

  for (let k = 0; k < numberOfCoins; k++) {
    const coinId = `${cell.i}:${cell.j}#${k}`;
    cache.coins.push(new Coin(coinId));
  }

  // Add a rectangle to the map to represent the cache
  const rect = leaflet.marker(cacheLocation, { icon: cacheIcon });
  rect.addTo(map);

  // Handle interactions with the cache
  rect.bindPopup(() => createCachePopupContent(cache));
}

function createCoinElement(
  coin: Coin,
  cache: Cache,
  popupDiv: HTMLElement,
): HTMLElement {
  const fixedCoinId = coin.id.replace(/[^a-zA-Z0-9-_]/g, "_");
  const coinDiv = document.createElement("div");
  coinDiv.innerHTML = `
      <span>Coin ID: ${coin.id}</span>
      <button id="collect-${fixedCoinId}">Collect</button>
    `;

  coinDiv
    .querySelector<HTMLButtonElement>(`#collect-${fixedCoinId}`)!
    .addEventListener("click", () => {
      collectCoin(coin, cache, popupDiv);
    });
  return coinDiv;
}

function collectCoin(coin: Coin, cache: Cache, popupDiv: HTMLElement) {
  console.log(`Collecting coin ${coin.id}`);
  cache.coins = cache.coins.filter((c) => c.id !== coin.id);
  playerInventory.push(coin);

  updateInventoryDisplay();

  const newPopupContent = createCachePopupContent(cache);
  popupDiv.innerHTML = newPopupContent.innerHTML;
}

function createCachePopupContent(cache: Cache) {
  const popupDiv = document.createElement("div");
  popupDiv.innerHTML = `
    <div>There is a cache here at 
      ${cache.location.lat.toFixed(5)}, 
      ${cache.location.lng.toFixed(5)}
    </div>
  `;

  cache.coins.forEach((coin) => {
    const coinDiv = createCoinElement(coin, cache, popupDiv);
    popupDiv.appendChild(coinDiv);
  });

  const depositDiv = document.createElement("div");
  depositDiv.innerHTML = `
  <div>Deposit a coin from your inventory </div>
  <button id = "deposit"> Deposit </button>
  `;

  depositDiv
    .querySelector<HTMLButtonElement>("#deposit")!
    .addEventListener("click", () => {
      if (playerInventory.length > 0) {
        const coinToDeposit = playerInventory.shift()!;

        cache.coins.push(coinToDeposit);

        updateInventoryDisplay();
        const newPopupContent = createCachePopupContent(cache);
        popupDiv.innerHTML = newPopupContent.innerHTML;
      } else {
        console.log("No coins in inventory to deposit");
      }
    });
  popupDiv.append(depositDiv);
  return popupDiv;
}

function updateInventoryDisplay() {
  const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
  statusPanel.innerHTML = `inventory: 
  ${playerInventory.map((coin) => coin.id).join(", ")}`;
}

/*
// Look around the player's neighborhood for caches to spawn
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    // If location i,j is lucky enough, spawn a cache!
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(i, j);
    }
  }
}
*/
const nearbyCell = board.getCellsNearPoint(OAKES_CLASSROOM);

nearbyCell.forEach((cell) => {
  const cellCenter = board.getCellBound(cell).getCenter();
  if (luck([cell.i, cell.j].toString()) < CACHE_SPAWN_PROBABILITY) {
    spawnCache(cellCenter);
  }
});
