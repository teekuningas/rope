import { Point } from './math';

export class InputManager {
  private keysDown: Set<string> = new Set();
  private keysPressed: Set<string> = new Set();
  private keysReleased: Set<string> = new Set();

  private mousePos: Point = { x: 0, y: 0 };
  private mouseButtonsDown: Set<number> = new Set();
  private mouseButtonsPressed: Set<number> = new Set();
  private mouseButtonsReleased: Set<number> = new Set();
  private wheelDeltaY: number = 0;

  private targetElement: HTMLElement | Window;

  constructor(targetElement: HTMLElement | Window = window) {
    this.targetElement = targetElement;
    this.bindEvents();
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      if (!this.keysDown.has(e.code)) {
        this.keysPressed.add(e.code);
      }
      this.keysDown.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
      this.keysReleased.add(e.code);
    });

    const el = this.targetElement instanceof Window ? document.body : this.targetElement;

    el.addEventListener('mousemove', (e: Event) => {
      const mouseEvent = e as MouseEvent;
      if (this.targetElement instanceof HTMLElement) {
        const rect = this.targetElement.getBoundingClientRect();
        this.mousePos = {
          x: mouseEvent.clientX - rect.left,
          y: mouseEvent.clientY - rect.top,
        };
      } else {
        this.mousePos = { x: mouseEvent.clientX, y: mouseEvent.clientY };
      }
    });

    el.addEventListener('mousedown', (e: Event) => {
      const mouseEvent = e as MouseEvent;
      if (!this.mouseButtonsDown.has(mouseEvent.button)) {
        this.mouseButtonsPressed.add(mouseEvent.button);
      }
      this.mouseButtonsDown.add(mouseEvent.button);
    });

    window.addEventListener('mouseup', (e: MouseEvent) => {
      this.mouseButtonsDown.delete(e.button);
      this.mouseButtonsReleased.add(e.button);
    });

    el.addEventListener('wheel', (e: Event) => {
      const wheelEvent = e as WheelEvent;
      this.wheelDeltaY += wheelEvent.deltaY;
    }, { passive: true });
  }

  public isKeyDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  public wasKeyPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  public wasKeyReleased(code: string): boolean {
    return this.keysReleased.has(code);
  }

  public get mouse(): Point {
    return this.mousePos;
  }

  public isMouseDown(button: number = 0): boolean {
    return this.mouseButtonsDown.has(button);
  }

  public wasMouseClicked(button: number = 0): boolean {
    return this.mouseButtonsPressed.has(button);
  }

  public getWheelDelta(): number {
    return this.wheelDeltaY;
  }

  /**
   * Clears single-frame transient events (pressed/released states). Call at end of update tick.
   */
  public endFrame(): void {
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.mouseButtonsPressed.clear();
    this.mouseButtonsReleased.clear();
    this.wheelDeltaY = 0;
  }
}
