import leaflet from "leaflet";

export class GeolocationManager {
  private watcherId: number | null = null;

  constructor(
    private playerMarker: leaflet.Marker,
    private recordMovement: (position: leaflet.LatLng) => void,
    private updateCaches: () => void,
  ) {}

  startGeolocation() {
    if (navigator.geolocation) {
      this.watcherId = navigator.geolocation.watchPosition((position) => {
        const newLatLng = new leaflet.LatLng(
          position.coords.latitude,
          position.coords.longitude,
        );
        this.playerMarker.setLatLng(newLatLng);
        this.recordMovement(newLatLng);
        this.updateCaches();
      });
    }
  }

  stopGeolocation() {
    if (this.watcherId !== null) {
      navigator.geolocation.clearWatch(this.watcherId);
      this.watcherId = null;
    }
  }
}
