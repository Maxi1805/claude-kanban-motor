// POSITIVO (mutación B: State aplanado en if/else sobre un discriminante).
class TrafficLight {
  private kind: "red" | "green" | "yellow" = "red";

  advance(): void {
    if (this.kind === "red") {
      this.kind = "green";
    } else if (this.kind === "green") {
      this.kind = "yellow";
    } else if (this.kind === "yellow") {
      this.kind = "red";
    }
  }

  forceState(kind: "red" | "green" | "yellow"): void {
    this.kind = kind;
  }
}
