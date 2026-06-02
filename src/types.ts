export type FruitType = 'watermelon' | 'orange' | 'apple' | 'banana' | 'bomb' | 'dragonfruit';

export interface FruitEntity {
  id: string;
  type: FruitType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  colorPrimary: string;
  colorSecondary: string;
  scoreValue: number;
  isBomb: boolean;
  sliced: boolean;
  angle: number;
  rotSpeed: number;
  sliceAngle: number;
  halfOffsetDist: number;
  separateVx: number;
}

export interface ParticleEntity {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  fadeSpeed: number;
  gravity: number;
  isSpark: boolean;
}

export type GameState = 'START' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export interface PythonFileDef {
  name: string;
  code: string;
  description: string;
  language: string;
}
