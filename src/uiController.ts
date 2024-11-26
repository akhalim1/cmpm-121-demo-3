type Direction = "up" | "down" | "left" | "right";

export class UIController {
  constructor(private readonly movePlayer: (direction: Direction) => void) {}

  initializeControls() {
    this.configureControl("north", "up");
    this.configureControl("south", "down");
    this.configureControl("west", "left");
    this.configureControl("east", "right");
  }

  private configureControl(elementId: string, direction: Direction) {
    const button = document.getElementById(elementId);
    if (!button) {
      console.error(`Button with id "${elementId}" not found.`);
      return;
    }

    button.addEventListener("click", () => this.movePlayer(direction));
  }
}
