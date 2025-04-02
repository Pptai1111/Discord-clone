declare module 'canvas' {
  export function createCanvas(width: number, height: number): Canvas;
  
  export interface Canvas {
    width: number;
    height: number;
    getContext(contextId: '2d'): CanvasRenderingContext2D;
    toBuffer(mimeType: string): Buffer;
  }
  
  export interface CanvasRenderingContext2D {
    fillStyle: string;
    font: string;
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
    fillRect(x: number, y: number, width: number, height: number): void;
    fillText(text: string, x: number, y: number, maxWidth?: number): void;
  }
} 