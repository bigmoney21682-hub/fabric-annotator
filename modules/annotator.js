// FILE: modules/annotator.js
import { fabric } from "https://cdn.jsdelivr.net/npm/fabric@5.2.4/dist/fabric.esm.js";

export class Annotator {
    constructor(canvasElement) {
        this.canvasElement = canvasElement;
        this.undoStack = [];
        this.redoStack = [];

        this._initCanvas();
    }

    _initCanvas() {
        this.canvas = new fabric.Canvas(this.canvasElement, {
            selection: false,
            backgroundColor: "#111"
        });

        // Fullscreen canvas
        this._resizeCanvas();
        window.addEventListener("resize", () => this._resizeCanvas());

        // Add click-to-place-dot behavior
        this.canvas.on("mouse:down", (opt) => {
            const p = this.canvas.getPointer(opt.e);
            this.addDot(p.x, p.y);
        });
    }

    _resizeCanvas() {
        this.canvas.setWidth(window.innerWidth);
        this.canvas.setHeight(window.innerHeight);
        this.canvas.renderAll();
    }

    loadBaseImage(url) {
        fabric.Image.fromURL(url, (img) => {
            const scale = Math.min(
                window.innerWidth / img.width,
                window.innerHeight / img.height
            );
            img.scale(scale);
            img.set({ selectable: false });

            this.canvas.setBackgroundImage(img, this.canvas.renderAll.bind(this.canvas));
        });
    }

    addDot(x, y) {
        const dot = new fabric.Circle({
            left: x,
            top: y,
            radius: 8,
            fill: "red",
            stroke: "white",
            strokeWidth: 2,
            hasControls: false,
            hasBorders: false
        });

        this.canvas.add(dot);
        this._pushState();
    }

    _pushState() {
        const json = this.canvas.toJSON();
        this.undoStack.push(json);
        this.redoStack.length = 0; // clear redo stack
    }

    undo() {
        if (this.undoStack.length <= 1) return; // nothing to undo
        const current = this.undoStack.pop();
        this.redoStack.push(current);

        const prev = this.undoStack[this.undoStack.length - 1];
        this.canvas.loadFromJSON(prev, () => this.canvas.renderAll());
    }

    redo() {
        if (this.redoStack.length === 0) return;

        const state = this.redoStack.pop();
        this.undoStack.push(state);

        this.canvas.loadFromJSON(state, () => this.canvas.renderAll());
    }
}