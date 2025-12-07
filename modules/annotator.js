// FILE: modules/annotator.js
// Implements Fabric-based annotator with export/import support + undo/redo
import { fabric } from "https://cdn.jsdelivr.net/npm/fabric@5.3.1/dist/fabric.esm.js";

export default class Annotator {
  /**
   * canvasElement: <canvas> DOM node
   * options: { debugLog: function(msg) }
   */
  constructor(canvasElement, options = {}) {
    this.canvasEl = canvasElement;
    this.debug = options.debugLog || (() => {});
    this._init();
  }

  _init() {
    // create fabric canvas from element
    this.canvas = new fabric.Canvas(this.canvasEl, {
      selection: false,
      preserveObjectStacking: true,
      backgroundColor: "#000"
    });

    // make canvas full viewport in device pixels
    this._resize();
    window.addEventListener("resize", () => this._resize());

    // state stacks
    this.undoStack = [];
    this.redoStack = [];

    // track modifications for undo
    this._setupHistory();

    // helper: when background image changes, we push state
    this.canvas.on("after:render", () => {
      // noop -- kept for debug hooks if needed
    });

    this.debug("Annotator initialized");
  }

  _resize() {
    // set canvas element to device pixels for crispness
    const scale = window.devicePixelRatio || 1;
    const w = Math.max(window.innerWidth, 300);
    const h = Math.max(window.innerHeight, 300);
    this.canvasEl.width = Math.round(w * scale);
    this.canvasEl.height = Math.round(h * scale);
    this.canvasEl.style.width = `${w}px`;
    this.canvasEl.style.height = `${h}px`;
    this.canvas.setWidth(w);
    this.canvas.setHeight(h);
    this.canvas.calcOffset();
    this.canvas.renderAll();
  }

  _setupHistory() {
    // push initial empty state
    this._pushState();

    // on changes, push state
    const push = () => {
      this._pushState();
      // also autosave to localStorage
      try { localStorage.setItem("fieldar_overlays", JSON.stringify(this.toJSON())); } catch {}
    };

    this.canvas.on("object:added", () => {
      // object:added fires also when loading from JSON -- skip pushing in that case
      if (this._loading) return;
      push();
    });
    this.canvas.on("object:modified", () => { if (!this._loading) push(); });
    this.canvas.on("object:removed", () => { if (!this._loading) push(); });
  }

  _pushState() {
    try {
      const snap = this.canvas.toJSON();
      // Keep stack length reasonable
      this.undoStack.push(snap);
      if (this.undoStack.length > 60) this.undoStack.shift();
      // clear redo on new action
      this.redoStack.length = 0;
      this.debug("State pushed (undo stack size: " + this.undoStack.length + ")");
    } catch (e) {
      this.debug("Failed pushState: " + e);
    }
  }

  // ---------- Public API ----------
  loadBaseImage(dataUrl) {
    // dataUrl = data:... or absolute URL
    this.debug("Loading base image");
    fabric.Image.fromURL(dataUrl, (img) => {
      // scale to fit
      const scale = Math.min(this.canvas.getWidth() / img.width, this.canvas.getHeight() / img.height);
      img.set({
        originX: "left",
        originY: "top",
        selectable: false,
        evented: false
      });
      img.scale(scale);
      this.canvas.setBackgroundImage(img, this.canvas.renderAll.bind(this.canvas));
      // push state after bg set
      this._pushState();
      this.debug("Base image set");
    }, { crossOrigin: "anonymous" });
  }

  addRectSample() {
    // example helper: add a rectangle
    const rect = new fabric.Rect({ left: 50, top: 50, width: 150, height: 90, fill: "rgba(255,0,0,0.4)", stroke:"#ff0", strokeWidth:3 });
    this.canvas.add(rect);
  }

  toJSON() {
    // export current canvas JSON
    try {
      return this.canvas.toJSON();
    } catch (e) {
      this.debug("toJSON error: " + e);
      return null;
    }
  }

  async loadFromJSON(obj) {
    // Accept either a canvas JSON object OR older wrapper { overlays:[...], image... }
    this._loading = true;
    try {
      // if object has overlays array (older format), try wrapping into canvas JSON
      if (obj && obj.overlays && !obj.version) {
        // create a basic canvas JSON with objects = overlays
        const canvasJson = {
          version: "5.3.1",
          objects: obj.overlays
        };
        await this._loadCanvasJson(canvasJson);
      } else {
        await this._loadCanvasJson(obj);
      }
      this.debug("Loaded JSON into canvas");
      // after load, push state (but avoid doubling)
      this._pushState();
    } catch (err) {
      this.debug("loadFromJSON error: " + err);
      throw err;
    } finally {
      this._loading = false;
    }
  }

  _loadCanvasJson(json) {
    return new Promise((resolve, reject) => {
      try {
        this.canvas.clear();
        // ensure backgroundColor remains
        this.canvas.loadFromJSON(json, () => {
          // ensure canvas dimensions remain the same (don't let JSON resize the canvas)
          this.canvas.renderAll();
          resolve();
        }, (o, object) => {
          // object loaded callback (optional)
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // UNDO / REDO
  undo() {
    if (this.undoStack.length <= 1) {
      this.debug("Undo: nothing to undo");
      return;
    }
    // pop current state -> move to redo
    const current = this.undoStack.pop();
    this.redoStack.push(current);
    const prev = this.undoStack[this.undoStack.length - 1];
    if (!prev) return;
    this._loading = true;
    this.canvas.loadFromJSON(prev, () => {
      this.canvas.renderAll();
      this._loading = false;
      this.debug("Undo applied");
    });
  }

  redo() {
    if (this.redoStack.length === 0) {
      this.debug("Redo: nothing to redo");
      return;
    }
    const next = this.redoStack.pop();
    this.undoStack.push(next);
    this._loading = true;
    this.canvas.loadFromJSON(next, () => {
      this.canvas.renderAll();
      this._loading = false;
      this.debug("Redo applied");
    });
  }

  // debug helper
  debug(msg) {
    try { if (this.debugLog) this.debugLog(msg); } catch (e) {}
    // also call passed logger if present
    if (typeof this.debug === "function") {
      this.debug(msg);
    }
  }
}