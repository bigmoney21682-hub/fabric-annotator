// FILE: fieldar-core.js
// Core Fabric.js canvas logic for FieldAR Annotator

var FieldAR = (function () {
    const _state = {
        canvas: null,
        undoStack: [],
        redoStack: [],
        polygonMode: false,
        pointArray: [],
        lineArray: [],
        activeLine: null,
        activeShape: null
    };

    const max = 999999;
    const min = 99;

    // Debug logging
    const debugConsole = document.getElementById("debugConsole");
    function log(msg) {
        console.log(msg);
        if (debugConsole) {
            debugConsole.innerHTML += `[LOG] ${msg}<br>`;
            debugConsole.scrollTop = debugConsole.scrollHeight;
        }
    }
    function error(msg) {
        console.error(msg);
        if (debugConsole) {
            debugConsole.innerHTML += `[ERROR] ${msg}<br>`;
            debugConsole.scrollTop = debugConsole.scrollHeight;
        }
    }

    function generateCid() {
        return new Date().getTime() + Math.floor(Math.random() * (max - min + 1) + min);
    }

    // Save state for undo
    function saveState() {
        if (!_state.canvas) return;
        _state.undoStack.push(JSON.stringify(_state.canvas.toJSON()));
        if (_state.undoStack.length > 50) _state.undoStack.shift();
        _state.redoStack = [];
        log("State saved. Undo stack size: " + _state.undoStack.length);
    }

    function undo() {
        if (!_state.canvas || _state.undoStack.length === 0) return;
        _state.redoStack.push(JSON.stringify(_state.canvas.toJSON()));
        const prev = _state.undoStack.pop();
        _state.canvas.loadFromJSON(prev, _state.canvas.renderAll.bind(_state.canvas));
        log("Undo applied");
    }

    function redo() {
        if (!_state.canvas || _state.redoStack.length === 0) return;
        _state.undoStack.push(JSON.stringify(_state.canvas.toJSON()));
        const next = _state.redoStack.pop();
        _state.canvas.loadFromJSON(next, _state.canvas.renderAll.bind(_state.canvas));
        log("Redo applied");
    }

    function initCanvas(canvasId) {
        const canvasEl = document.getElementById(canvasId);
        if (!canvasEl) {
            error("Canvas element not found: " + canvasId);
            return;
        }

        _state.canvas = new fabric.Canvas(canvasId, {
            width: window.innerWidth,
            height: window.innerHeight,
            preserveObjectStacking: true
        });

        log("Canvas initialized");

        // Auto save
        _state.canvas.on('object:added', saveState);
        _state.canvas.on('object:modified', saveState);
        _state.canvas.on('object:removed', saveState);
    }

    // Load image into canvas
    function loadImage(file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            fabric.Image.fromURL(e.target.result, function (img) {
                _state.canvas.setWidth(img.width);
                _state.canvas.setHeight(img.height);
                _state.canvas.setBackgroundImage(img, _state.canvas.renderAll.bind(_state.canvas), {
                    originX: 'left',
                    originY: 'top'
                });
                saveState();
                log(`Loaded image: ${img.width}x${img.height}`);
            });
        };
        reader.readAsDataURL(file);
    }

    // Polygon drawing
    function togglePolygonMode() {
        _state.polygonMode = !_state.polygonMode;
        _state.pointArray = [];
        _state.lineArray = [];
        _state.activeLine = null;
        _state.activeShape = null;
        log("Polygon mode: " + (_state.polygonMode ? "ON" : "OFF"));
    }

    function addPoint(options) {
        const id = generateCid();
        const circle = new fabric.Circle({
            radius: 5,
            fill: _state.pointArray.length === 0 ? 'red' : '#fff',
            stroke: '#333',
            strokeWidth: 0.5,
            left: options.e.layerX,
            top: options.e.layerY,
            selectable: false,
            originX: 'center',
            originY: 'center',
            id: id
        });

        const points = [options.e.layerX, options.e.layerY, options.e.layerX, options.e.layerY];
        const line = new fabric.Line(points, {
            strokeWidth: 2,
            fill: '#999',
            stroke: '#999',
            originX: 'center',
            originY: 'center',
            selectable: false,
            evented: false
        });

        if (_state.activeShape) {
            const pos = _state.canvas.getPointer(options.e);
            const pts = _state.activeShape.get("points");
            pts.push({ x: pos.x, y: pos.y });
            _state.activeShape.set({ points: pts });
            _state.canvas.remove(_state.activeShape);
            _state.canvas.add(_state.activeShape);
            _state.activeShape = _state.activeShape;
            _state.canvas.renderAll();
        } else {
            const polygon = new fabric.Polygon([{ x: options.e.layerX, y: options.e.layerY }], {
                stroke: '#333',
                strokeWidth: 1,
                fill: 'rgba(200,200,200,0.1)',
                selectable: false
            });
            _state.activeShape = polygon;
            _state.canvas.add(polygon);
        }

        _state.activeLine = line;
        _state.pointArray.push(circle);
        _state.lineArray.push(line);

        _state.canvas.add(circle);
        _state.canvas.add(line);
        _state.canvas.selection = false;
    }

    function finalizePolygon() {
        if (!_state.polygonMode || _state.pointArray.length === 0) return;
        const points = _state.pointArray.map(p => ({ x: p.left, y: p.top }));
        _state.pointArray.forEach(p => _state.canvas.remove(p));
        _state.lineArray.forEach(l => _state.canvas.remove(l));
        if (_state.activeShape) _state.canvas.remove(_state.activeShape);

        const polygon = new fabric.Polygon(points, {
            stroke: '#333',
            strokeWidth: 0.5,
            fill: 'rgba(0,0,0,0)',
            selectable: true
        });

        const text = new fabric.Text('Tap to edit', {
            fontFamily: 'Arial',
            fill: 'white',
            fontSize: 12,
            left: polygon.left + (polygon.width / 2),
            top: polygon.top + (polygon.height / 2),
            visible: false
        });

        const group = new fabric.Group([polygon, text], {
            left: polygon.left,
            top: polygon.top
        });

        _state.canvas.add(group);
        _state.canvas.selection = true;
        _state.activeShape = null;
        _state.activeLine = null;
        _state.pointArray = [];
        _state.lineArray = [];
        _state.polygonMode = false;
        log("Polygon created with " + points.length + " points");
    }

    function deleteSelected() {
        if (!_state.canvas) return;
        const obj = _state.canvas.getActiveObject();
        if (obj) {
            _state.canvas.remove(obj);
            log("Deleted selected object");
        }
    }

    function exportJSON() {
        if (!_state.canvas) return;
        const json = JSON.stringify(_state.canvas.toJSON());
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "fieldar-overlays.json";
        a.click();
        URL.revokeObjectURL(url);
        log("Export complete, JSON size: " + json.length);
    }

    function importJSON(file) {
        const reader = new FileReader();
        reader.onload = function (ev) {
            try {
                const data = JSON.parse(ev.target.result);
                _state.canvas.loadFromJSON(data, _state.canvas.renderAll.bind(_state.canvas));
                log("Imported JSON with " + _state.canvas.getObjects().length + " objects");
            } catch (e) {
                error("Failed to parse JSON");
            }
        };
        reader.readAsText(file);
    }

    return {
        initCanvas,
        loadImage,
        togglePolygonMode,
        addPoint,
        finalizePolygon,
        undo,
        redo,
        deleteSelected,
        exportJSON,
        importJSON
    };
})();