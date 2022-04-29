class ScoreVector {
  length: number;

  angles: number[] = [];

  private coords: number[];

  constructor(...args: number[]) {
    this.coords = args;
    this.length = Math.sqrt(
      this.coords.reduce((total, current) => total + current * current, 0)
    );
    args.forEach((axis) =>
      this.angles.push(Math.acos(axis / this.length) ?? 0)
    );
  }
}

export default ScoreVector;
