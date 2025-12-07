/* FILE: fieldar-core.js */
/* Handles canvas, image loading, polygon drawing, undo/redo, internal state */

var annoFabric = (function () {
    let canvas = null;
    let polygonMode = false;
    let pointArray = [];
    let lineArray = [];
    let activeLine = null;
    let activeShape = null;
    let undoStack = [];
    let redoStack = [];
    let _canvasIdCounter = 0;

    function generateCid() {
        return new Date().getTime() + Math.floor(Math.random() * 100000);
    }

    function saveState() {
        if (!canvas) return;
        undoStack.push(JSON.stringify(canvas.toJSON()));
        redoStack = [];
    }

    function undo() {
        if (!canvas || undoStack.length === 0) return;
        redoStack.push(JSON.stringify(canvas.toJSON()));
        const prev = undoStack.pop();
        canvas.loadFromJSON(prev, canvas.renderAll.bind(canvas));
    }

    function redo() {
        if (!canvas || redoStack.length === 0) return;
        undoStack.push(JSON.stringify(canvas.toJSON()));
        const next = redoStack.pop();
        canvas.loadFromJSON(next, canvas.renderAll.bind(canvas));
    }

    function initCanvas(imageElOrSelector, options = {}) {
        const imgEl = (typeof imageElOrSelector === 'string') ? document.querySelector(imageElOrSelector) : imageElOrSelector;
        if (!imgEl) return console.error("Image element not found");

        _canvasIdCounter++;
        const cId = 'fieldar_canvas_' + _canvasIdCounter;
        const canvasEl = document.createElement('canvas');
        canvasEl.id = cId;
        canvasEl.width = options.canvasWidth || imgEl.naturalWidth || imgEl.width;
        canvasEl.height = options.canvasHeight || imgEl.naturalHeight || imgEl.height;
        canvasEl.style.position = 'absolute';
        canvasEl.style.top = '0';
        canvasEl.style.left = '0';
        imgEl.insertAdjacentElement('afterend', canvasEl);

        canvas = new fabric.Canvas(cId);
        canvas.setBackgroundImage(imgEl.src, canvas.renderAll.bind(canvas), { originX: 'left', originY: 'top' });

        canvas.on('object:added', saveState);
        canvas.on('object:modified', saveState);
        canvas.on('object:removed', saveState);

        return canvas;
    }

    function togglePolygonMode() {
        polygonMode = !polygonMode;
        if (polygonMode) pointArray = [], lineArray = [], activeLine = null, activeShape = null;
        return polygonMode;
    }

    function addPolygonPoint(event) {
        if (!canvas || !polygonMode) return;
        const pointer = canvas.getPointer(event.e);
        const circle = new fabric.Circle({
            radius: 5,
            fill: pointArray.length === 0 ? 'red' : 'white',
            stroke: '#333',
            strokeWidth: 1,
            left: pointer.x,
            top: pointer.y,
            selectable: false,
            originX: 'center',
            originY: 'center'
        });

        let line = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke: '#999',
            strokeWidth: 2,
            selectable: false,
            evented: false
        });

        if (activeShape) {
            const points = activeShape.get('points');
            points.push({ x: pointer.x, y: pointer.y });
            activeShape.set({ points });
            canvas.remove(activeLine);
        } else {
            activeShape = new fabric.Polygon([{ x: pointer.x, y: pointer.y }], {
                stroke: '#333',
                fill: 'rgba(200,200,200,0.1)',
                strokeWidth: 1,
                selectable: false,
                evented: false
            });
            canvas.add(activeShape);
        }

        activeLine = line;
        pointArray.push(circle);
        lineArray.push(line);
        canvas.add(circle);
        canvas.add(line);
    }

    function finalizePolygon() {
        if (!canvas || !polygonMode) return;
        const points = pointArray.map(p => ({ x: p.left, y: p.top }));
        pointArray.forEach(p => canvas.remove(p));
        lineArray.forEach(l => canvas.remove(l));
        if (activeShape) canvas.remove(activeShape);
        const polygon = new fabric.Polygon(points, {
            stroke: '#333',
            fill: 'rgba(0,0,0,0)',
            strokeWidth: 1
        });

        const cText = new fabric.Text('Tap and Type', {
            fontFamily: 'arial black',
            fontSize: 12,
            fill: 'white',
            visible: false,
            left: polygon.left + (polygon.width / 2),
            top: polygon.top + (polygon.height / 2)
        });

        const group = new fabric.Group([polygon, cText], { left: polygon.left, top: polygon.top });
        canvas.add(group);
        activeLine = null;
        activeShape = null;
        polygonMode = false;
        canvas.selection = true;
        saveState();
        return group;
    }

    function loadImage(file) {
        if (!canvas) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            fabric.Image.fromURL(e.target.result, function (img) {
                canvas.setWidth(img.width);
                canvas.setHeight(img.height);
                canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), { originX: 'left', originY: 'top' });
                saveState();
            });
        };
        reader.readAsDataURL(file);
    }

    return {
        initCanvas,
        togglePolygonMode,
        addPolygonPoint,
        finalizePolygon,
        undo,
        redo,
        loadImage,
        getCanvas: () => canvas
    };
})();