declare module "canvas-confetti" {
  export interface Options {
    particleCount?: number;
    angle?: number;
    spread?: number;
    startVelocity?: number;
    decay?: number;
    gravity?: number;
    ticks?: number;
    origin?: { x?: number; y?: number };
    colors?: string[];
    scalar?: number;
    disableForReducedMotion?: boolean;
  }

  export interface GlobalOptions {
    resize?: boolean;
    useWorker?: boolean;
    disableForReducedMotion?: boolean;
  }

  export interface CreateTypes {
    (options?: Options): Promise<undefined> | null;
    reset: () => void;
  }

  export interface Confetti {
    (options?: Options): Promise<undefined> | null;
    reset: () => void;
    create: (canvas?: HTMLCanvasElement, options?: GlobalOptions) => CreateTypes;
  }

  const confetti: Confetti;
  export default confetti;
}
