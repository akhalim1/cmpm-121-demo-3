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
const TILE_VISIBILITY_RADIUS = 4;
const MOVE_INCREMENT = 0.0001;
const DEGREES_TO_METERS = 10000;

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
const cacheMementos = new Map<string, string>();

class Coin {
  constructor(public id: string) {}
}

class Cache {
  location: leaflet.LatLng;
  coins: Coin[];

  constructor(location: leaflet.LatLng, coins: Coin[]) {
    this.location = location;
    this.coins = coins;
  }

  toMemento(): string {
    return JSON.stringify(this.coins.map((coin) => coin.id));
  }

  fromMemento(memento: string) {
    const coinIds = JSON.parse(memento);
    this.coins = coinIds.map((id: string) => new Coin(id));
  }
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

const activeCacheMarkers = new Map<string, leaflet.Marker>();

// Add a marker to represent the player
const playerMarker = leaflet.marker(OAKES_CLASSROOM, { icon: playerIcon });
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Display the player's points
//let playerPoints = 0;
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!; // element `statusPanel` is defined in index.html
statusPanel.innerHTML = "inventory:";

function saveGameState() {
  const playerPosition = playerMarker.getLatLng();
  localStorage.setItem(
    "playerPosition",
    JSON.stringify({ lat: playerPosition.lat, lng: playerPosition.lng }),
  );

  const inventoryIds = playerInventory.map((coin) => coin.id);
  localStorage.setItem("inventory", JSON.stringify(inventoryIds));

  const cacheMementosObject: { [key: string]: string } = {};
  cacheMementos.forEach((value, key) => {
    cacheMementosObject[key] = value;
  });
  localStorage.setItem("cacheMementos", JSON.stringify(cacheMementosObject));
}

function loadGameState() {
  const savedPos = localStorage.getItem("playerPosition");

  if (savedPos) {
    const { lat, lng } = JSON.parse(savedPos);
    playerMarker.setLatLng(new leaflet.LatLng(lat, lng));
  }

  const savedInventory = localStorage.getItem("inventory");
  if (savedInventory) {
    playerInventory.length = 0;
    JSON.parse(savedInventory).forEach((id: string) =>
      playerInventory.push(new Coin(id))
    );
    updateInventoryDisplay();
  }

  const savedCacheMementos = localStorage.getItem("cacheMementos");
  if (savedCacheMementos) {
    const cacheEntries = JSON.parse(savedCacheMementos);
    cacheMementos.clear();

    for (const key in cacheEntries) {
      if (Object.prototype.hasOwnProperty.call(cacheEntries, key)) {
        const memento = cacheEntries[key];
        if (typeof memento === "string") {
          cacheMementos.set(key, memento);
        } else {
          console.warn(`Invalid ${key}:`, memento);
        }
      }
    }

    cacheMementos.forEach((memento, key) => {
      const [i, j] = key.split(",").map(Number);
      const cell = { i, j };
      const cellCenter = board.getCellBound(cell).getCenter();
      const cache = new Cache(cellCenter, []);
      cache.fromMemento(memento);
      spawnCache(cellCenter);
    });
  }

  console.log("Game state loaded:", {
    playerPosition: savedPos,
    inventory: savedInventory,
    cacheMementos: Array.from(cacheMementos.entries()),
  });
}

function movePlayer(direction: string) {
  const currentPos = playerMarker.getLatLng();

  let newLatLng;

  switch (direction) {
    case "up":
      newLatLng = new leaflet.LatLng(
        currentPos.lat + MOVE_INCREMENT,
        currentPos.lng,
      );
      break;
    case "down":
      newLatLng = new leaflet.LatLng(
        currentPos.lat - MOVE_INCREMENT,
        currentPos.lng,
      );
      break;
    case "left":
      newLatLng = new leaflet.LatLng(
        currentPos.lat,
        currentPos.lng - MOVE_INCREMENT,
      );
      break;
    case "right":
      newLatLng = new leaflet.LatLng(
        currentPos.lat,
        currentPos.lng + MOVE_INCREMENT,
      );
      break;
  }

  if (newLatLng) {
    playerMarker.setLatLng(newLatLng);
    updateNearbyCaches();
  }
}

function updateNearbyCaches() {
  const playerPosition = playerMarker.getLatLng();
  const nearbyCells = board.getCellsNearPoint(playerPosition);

  activeCacheMarkers.forEach((marker, key) => {
    const [i, j] = key.split(",").map(Number);
    const cellCenter = board.getCellBound({ i, j }).getCenter();

    if (
      playerPosition.distanceTo(cellCenter) >
        TILE_VISIBILITY_RADIUS * TILE_WIDTH * DEGREES_TO_METERS
    ) {
      marker.remove();
      activeCacheMarkers.delete(key);
    }
  });

  nearbyCells.forEach((cell) => {
    const cellKey = `${cell.i},${cell.j}`;
    const cellCenter = board.getCellBound(cell).getCenter();

    if (
      !activeCacheMarkers.has(cellKey) &&
      luck([cell.i, cell.j].toString()) < CACHE_SPAWN_PROBABILITY
    ) {
      const marker = spawnCache(cellCenter);
      activeCacheMarkers.set(cellKey, marker);
    }
  });
}

function saveCacheState(cellKey: string, cache: Cache) {
  const memento = cache.toMemento();
  cacheMementos.set(cellKey, memento);
}

function restoreCacheState(cellKey: string, cache: Cache) {
  if (cacheMementos.has(cellKey)) {
    cache.fromMemento(cacheMementos.get(cellKey)!);
  }
}

function spawnCache(point: leaflet.LatLng): leaflet.Marker {
  const cell: Cell = board.getCellForPoint(point);
  const cellKey = `${cell.i},${cell.j}`;

  let cache: Cache;
  if (cacheMementos.has(cellKey)) {
    cache = new Cache(point, []);
    restoreCacheState(cellKey, cache);
  } else {
    cache = new Cache(point, []);
    const numberOfCoins = Math.floor(luck([cell.i, cell.j].toString()) * 100);
    for (let k = 0; k < numberOfCoins; k++) {
      const coinId = `${cell.i}:${cell.j}#${k}`;
      cache.coins.push(new Coin(coinId));
    }
    saveCacheState(cellKey, cache);
  }

  const marker = leaflet.marker(point, { icon: cacheIcon });
  marker.bindPopup(() => createCachePopupContent(cache));
  marker.addTo(map);

  activeCacheMarkers.set(cellKey, marker);

  return marker;
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

  const cellKey = `${board.getCellForPoint(cache.location).i},${
    board.getCellForPoint(cache.location).j
  }`;
  saveCacheState(cellKey, cache);

  const newPopupContent = createCachePopupContent(cache);
  popupDiv.innerHTML = newPopupContent.innerHTML;
}

function createDepositElement(
  cache: Cache,
  popupDiv: HTMLElement,
): HTMLElement {
  const depositDiv = document.createElement("div");
  depositDiv.innerHTML = `
  <div>Deposit a coin from your inventory </div>
  <button id = "deposit"> Deposit </button>
  `;

  depositDiv
    .querySelector<HTMLButtonElement>("#deposit")!
    .addEventListener("click", () => {
      depositCoin(cache, popupDiv);
    });

  return depositDiv;
}

function depositCoin(cache: Cache, popupDiv: HTMLElement) {
  if (playerInventory.length > 0) {
    const coinToDeposit = playerInventory.shift()!;
    cache.coins.push(coinToDeposit);

    updateInventoryDisplay();

    const cellKey = `${board.getCellForPoint(cache.location).i},${
      board.getCellForPoint(cache.location).j
    }`;
    saveCacheState(cellKey, cache);

    const newPopupContent = createCachePopupContent(cache);
    popupDiv.innerHTML = newPopupContent.innerHTML;
  } else {
    console.log("No coins in inventory to deposit");
  }
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

  const depositDiv = createDepositElement(cache, popupDiv);
  popupDiv.appendChild(depositDiv);
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

document
  .getElementById("north")!
  .addEventListener("click", () => movePlayer("up"));

document
  .getElementById("south")!
  .addEventListener("click", () => movePlayer("down"));

document
  .getElementById("west")!
  .addEventListener("click", () => movePlayer("left"));

document
  .getElementById("east")!
  .addEventListener("click", () => movePlayer("right"));

let geolocationActive = false;
let geolocactionWatcherId: number | null = null;

document.getElementById("sensor")!.addEventListener("click", () => {
  if (navigator.geolocation) {
    if (!geolocationActive) {
      geolocationActive = true;
      geolocactionWatcherId = navigator.geolocation.watchPosition(
        (position) => {
          const newLatLng = new leaflet.LatLng(
            position.coords.latitude,
            position.coords.longitude,
          );
          playerMarker.setLatLng(newLatLng);
          updateNearbyCaches();
          //todo: recordPlayerMovement()
        },
      );
    } else {
      geolocationActive = false;
      if (geolocactionWatcherId != null) {
        navigator.geolocation.clearWatch(geolocactionWatcherId);
        geolocactionWatcherId = null;
      }
    }
  }
});

globalThis.addEventListener("beforeunload", saveGameState);
loadGameState();
