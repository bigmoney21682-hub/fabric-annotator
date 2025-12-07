// FILE: modules/annotator.js
export default class Annotator {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");

        this.baseImage = null;

        this.dots = [];
        this.undoStack = [];
        this.redoStack = [];

        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        this.canvas.addEventListener("click", this.addDot.bind(this));

        console.log("[LOG] Annotator initialized");
    }

    setBaseImage(img) {
        this.baseImage = img;
        this.resetHistory();
        this.redraw();
    }

    resetHistory() {
        this.dots = [];
        this.undoStack = [];
        this.redoStack = [];
    }

    addDot(event) {
        if (!this.baseImage) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const dot = { x, y };

        // Push current state to undo stack
        this.undoStack.push(JSON.stringify(this.dots));
        this.redoStack = [];

        this.dots.push(dot);

        this.redraw();
    }

    undo() {
        if (this.undoStack.length === 0) return;

        this.redoStack.push(JSON.stringify(this.dots));
        this.dots = JSON.parse(this.undoStack.pop());

        this.redraw();
    }

    redo() {
        if (this.redoStack.length === 0) return;

        this.undoStack.push(JSON.stringify(this.dots));
        this.dots = JSON.parse(this.redoStack.pop());

        this.redraw();
    }

    redraw() {
        if (!this.baseImage) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.baseImage, 0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = "red";
        for (const dot of this.dots) {
            this.ctx.beginPath();
            this.ctx.arc(dot.x, dot.y, 6, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
}