// Adapted from pdf-diff-viewer 96af1ce5caa0b27b3b4a2e14ef3c16aed0842170; MIT. See README.md.
import * as pdfjsLib from "pdfjs-dist";
const canvases = new Set();
const createCanvas = () => { const canvas = new OffscreenCanvas(1, 1); canvases.add(canvas); return canvas; };
export function releaseCanvases() { for (const canvas of canvases) { canvas.width = 0; canvas.height = 0; } canvases.clear(); }
/**
 * PDFDiffViewer - Embeddable PDF Comparison Library
 * A framework-agnostic library for visual PDF comparison
 */

class PDFDiffViewer {
    constructor(container, options = {}) {
        if (typeof container === 'string') {
            this.container = document.querySelector(container);
        } else {
            this.container = container;
        }

        if (!this.container) {
            throw new Error('Container element not found');
        }

        // Configuration
        this.options = {
            scale: options.scale ?? 1.5,
            maxShift: options.maxShift ?? 3,
            dilationRadius: options.dilationRadius || 0,
            colorTolerance: options.colorTolerance ?? 120,
            minHighlightArea: options.minHighlightArea ?? 60,
            minWordSize: options.minWordSize || 8,
            highlightAlpha: options.highlightAlpha || 0.32,
            highlightColorA: options.highlightColorA || '#FF1744',  // Red for Doc A changes
            highlightColorB: options.highlightColorB || '#2196F3',  // Blue for Doc B changes
            backgroundFillColor: options.backgroundFillColor || 'white',  // Canvas background
            labelA: options.labelA || 'Document A',
            labelB: options.labelB || 'Document B',
            workerSrc: options.workerSrc,
            showPageNumbers: options.showPageNumbers !== false,
            cropRegions: options.cropRegions || [],
            maskRegions: options.maskRegions || [],
            alignmentTolerance: options.alignmentTolerance || 2,
            similarityThreshold: options.similarityThreshold || 0.3
        };

        // Check if PDF.js is loaded
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js library not found. Please include PDF.js before using PDFDiffViewer.');
        }

        pdfjsLib.GlobalWorkerOptions.workerSrc = this.options.workerSrc;

        this.results = null;
    }

    /**
     * Compare two PDF files and render the results
     * @param {File|ArrayBuffer|Uint8Array} pdfA - First PDF
     * @param {File|ArrayBuffer|Uint8Array} pdfB - Second PDF
     * @returns {Promise<Object>} Comparison results
     */
    // ===== PRIVATE METHODS =====

    async _toArrayBuffer(input) {
        if (input instanceof ArrayBuffer) {
            return input;
        }
        if (input instanceof Uint8Array) {
            return input.buffer;
        }
        if (input instanceof File || input instanceof Blob) {
            return await input.arrayBuffer();
        }
        throw new Error('Unsupported input type. Expected File, Blob, ArrayBuffer, or Uint8Array.');
    }

    async _comparePage(docA, docB, pageNum) {
        return await this._comparePagePair(docA, docB, pageNum, pageNum);
    }

    async _comparePagePair(docA, docB, pageNumA, pageNumB) {
        const canvasA = createCanvas();
        const canvasB = createCanvas();

        const { words: wordsA } = await this._renderPageToCanvas(docA, pageNumA, canvasA);
        const { words: wordsB } = await this._renderPageToCanvas(docB, pageNumB, canvasB);

        const pageCrop = this.options.cropRegions.find(r => r.page === pageNumA);
        const croppedWordsA = this._offsetWordBoxes(wordsA, pageCrop);
        const croppedWordsB = this._offsetWordBoxes(wordsB, pageCrop);

        const croppedA = this._applyCrop(canvasA, pageCrop);
        const croppedB = this._applyCrop(canvasB, pageCrop);
        const targetWidth = Math.max(croppedA.width, croppedB.width);
        const targetHeight = Math.max(croppedA.height, croppedB.height);
        if (targetWidth * targetHeight > 6000000) throw new Error("Aligned PDF pages exceed the pixel limit");

        const paddedA = this._padCanvas(croppedA, targetWidth, targetHeight);
        const paddedB = this._padCanvas(croppedB, targetWidth, targetHeight);

        const highlightCanvasB = createCanvas();
        highlightCanvasB.width = targetWidth;
        highlightCanvasB.height = targetHeight;

        const imgA = this._canvasToImageData(paddedA);
        const imgB = this._canvasToImageData(paddedB);

        const canvasDiff = createCanvas();
        canvasDiff.width = targetWidth;
        canvasDiff.height = targetHeight;

        const ctxDiff = canvasDiff.getContext('2d');
        const diffImage = ctxDiff.createImageData(imgA.width, imgA.height);

        // Find best alignment
        const best = this._findBestOffset(imgA, paddedB, imgA.width, imgA.height, this.options.colorTolerance);
        const shiftedB = this._getShiftedImageData(paddedB, imgA.width, imgA.height, best.dx, best.dy);

        this._buildDiffImage(imgA, shiftedB, diffImage, this.options.colorTolerance);

        // Apply masks
        const pageMasks = this.options.maskRegions.filter(r => r.page === pageNumA);
        this._applyMasks(diffImage, pageMasks);
        const diffPixels = diffImage.data.reduce((count, value, index) => count + (index % 4 === 3 && value > 0 ? 1 : 0), 0);

        // Dilate diff mask
        this._dilateDiffMask(diffImage, imgA.width, imgA.height, this.options.dilationRadius);

        const boxes = this._extractDiffBoxes(diffImage, imgA.width, imgA.height, this.options.minHighlightArea);

        const wordHighlightsA = this._mapDiffsToWordBoxes(boxes, croppedWordsA);
        this._drawHighlightBoxes(ctxDiff, wordHighlightsA, 'red');

        const boxesForB = this._translateBoxes(boxes, -best.dx, -best.dy);
        const wordHighlightsB = this._mapDiffsToWordBoxes(boxesForB, croppedWordsB);
        const highlightCtxB = highlightCanvasB.getContext('2d');
        this._drawHighlightBoxes(highlightCtxB, wordHighlightsB, 'green');

        // Create overlays
        const overlayOnA = this._overlayDiff(paddedA, canvasDiff);
        const overlayOnB = this._overlayDiff(paddedB, highlightCanvasB);

        return {
            pageNumA,
            pageNumB,
            diffPixels,
            overlayA: await overlayOnA.convertToBlob({ type: 'image/png' }),
            overlayB: await overlayOnB.convertToBlob({ type: 'image/png' }),
            width: targetWidth, height: targetHeight, boxes, wordHighlightsA, wordHighlightsB,
            alignment: { dx: best.dx, dy: best.dy }
        };
    }

    async _renderPageToCanvas(pdf, pageNum, canvas) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: this.options.scale });

        if (viewport.width * viewport.height > 6000000) throw new Error("PDF page exceeds the six-million-pixel limit");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;

        await page.render({ canvasContext: ctx, viewport }).promise;

        const words = await this._extractWordBoxes(page, viewport);
        return { words };
    }

    async _extractWordBoxes(page, viewport) {
        const textContent = await page.getTextContent({ normalizeWhitespace: true });
        const boxes = [];

        textContent.items.forEach((item) => {
            const text = (item.str || '').trim();
            if (!text) return;

            const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
            const x = transform[4];
            const y = transform[5];

            const width = (item.width || 0) * viewport.scale;
            const glyphHeight = Math.hypot(transform[2], transform[3]);
            const height = glyphHeight || ((item.height || 0) * viewport.scale);

            if (!width || !height) return;

            const charWidth = width / text.length;
            if (!isFinite(charWidth) || charWidth <= 0) return;

            const baseY = y - height;
            let cursorX = x;

            text.split(/(\s+)/).forEach((segment) => {
                if (!segment) return;

                const segmentWidth = charWidth * segment.length;
                if (!segment.trim()) {
                    cursorX += segmentWidth;
                    return;
                }

                const paddingX = charWidth * 0.18;
                const paddingY = height * 0.15;
                const box = this._padBox({
                    x: cursorX,
                    y: baseY,
                    width: segmentWidth,
                    height
                }, paddingX, paddingY);

                boxes.push(box);
                cursorX += segmentWidth;
            });
        });

        return boxes;
    }

    _padCanvas(srcCanvas, targetWidth, targetHeight) {
        if (srcCanvas.width === targetWidth && srcCanvas.height === targetHeight) {
            return srcCanvas;
        }

        const padded = createCanvas();
        padded.width = targetWidth;
        padded.height = targetHeight;

        const ctx = padded.getContext('2d');
        ctx.fillStyle = this.options.backgroundFillColor;
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(srcCanvas, 0, 0);
        return padded;
    }

    _getShiftedImageData(srcCanvas, width, height, dx, dy) {
        const temp = createCanvas();
        temp.width = width;
        temp.height = height;
        const ctx = temp.getContext('2d');
        ctx.fillStyle = this.options.backgroundFillColor;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(srcCanvas, dx, dy);
        return ctx.getImageData(0, 0, width, height);
    }

    _pixelDelta(dataA, dataB, index) {
        return Math.abs(dataA[index] - dataB[index]) +
            Math.abs(dataA[index + 1] - dataB[index + 1]) +
            Math.abs(dataA[index + 2] - dataB[index + 2]);
    }

    _countDiffPixels(imgA, imgB, tolerance) {
        const dataA = imgA.data;
        const dataB = imgB.data;
        let diff = 0;
        for (let i = 0; i < dataA.length; i += 4) {
            if (this._pixelDelta(dataA, dataB, i) > tolerance) {
                diff++;
            }
        }
        return diff;
    }

    _findBestOffset(imgA, paddedB, width, height, tolerance) {
        let best = { diff: Infinity, dx: 0, dy: 0 };
        for (let dy = -this.options.maxShift; dy <= this.options.maxShift; dy++) {
            for (let dx = -this.options.maxShift; dx <= this.options.maxShift; dx++) {
                const shiftedB = this._getShiftedImageData(paddedB, width, height, dx, dy);
                const diffCount = this._countDiffPixels(imgA, shiftedB, tolerance);
                if (diffCount < best.diff) {
                    best = { diff: diffCount, dx, dy };
                }
            }
        }
        return best;
    }

    _buildDiffImage(imgA, imgB, diffImage, tolerance) {
        const target = diffImage.data;
        const dataA = imgA.data;
        const dataB = imgB.data;
        let diffPixels = 0;

        for (let i = 0; i < dataA.length; i += 4) {
            if (this._pixelDelta(dataA, dataB, i) > tolerance) {
                target[i] = 255;
                target[i + 1] = 0;
                target[i + 2] = 0;
                target[i + 3] = 255;
                diffPixels++;
            } else {
                target[i] = 0;
                target[i + 1] = 0;
                target[i + 2] = 0;
                target[i + 3] = 0;
            }
        }

        return diffPixels;
    }

    _dilateDiffMask(diffImage, width, height, radius = 0) {
        const src = diffImage.data;
        const mask = new Uint8Array(width * height);

        for (let i = 0; i < width * height; i++) {
            if (src[i * 4] > 0) {
                mask[i] = 1;
            }
        }

        const expanded = new Uint8Array(mask);
        if (radius > 0) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = y * width + x;
                    if (!mask[idx]) continue;
                    const yMin = Math.max(0, y - radius);
                    const yMax = Math.min(height - 1, y + radius);
                    const xMin = Math.max(0, x - radius);
                    const xMax = Math.min(width - 1, x + radius);
                    for (let ny = yMin; ny <= yMax; ny++) {
                        for (let nx = xMin; nx <= xMax; nx++) {
                            expanded[ny * width + nx] = 1;
                        }
                    }
                }
            }
        }

        for (let i = 0; i < width * height; i++) {
            const base = i * 4;
            if (expanded[i]) {
                src[base] = 255;
                src[base + 1] = 0;
                src[base + 2] = 0;
                src[base + 3] = 255;
            }
        }
    }

    _extractDiffBoxes(diffImage, width, height, minArea = 25) {
        const data = diffImage.data;
        const visited = new Uint8Array(width * height);
        const boxes = [];
        const directions = [1, -1, width, -width];

        for (let idx = 0; idx < width * height; idx++) {
            if (visited[idx]) continue;
            if (data[idx * 4 + 3] === 0) continue;

            let minX = idx % width;
            let maxX = minX;
            let minY = Math.floor(idx / width);
            let maxY = minY;

            const stack = [idx];
            visited[idx] = 1;

            while (stack.length) {
                const current = stack.pop();
                const cx = current % width;
                const cy = Math.floor(current / width);

                if (cx < minX) minX = cx;
                if (cx > maxX) maxX = cx;
                if (cy < minY) minY = cy;
                if (cy > maxY) maxY = cy;

                for (const dir of directions) {
                    const next = current + dir;
                    if (next < 0 || next >= width * height) continue;
                    const nx = next % width;
                    const ny = Math.floor(next / width);
                    if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
                    if (visited[next]) continue;
                    if (data[next * 4 + 3] === 0) continue;
                    visited[next] = 1;
                    stack.push(next);
                }
            }

            const area = (maxX - minX + 1) * (maxY - minY + 1);
            if (area >= minArea) {
                boxes.push({
                    x: minX,
                    y: minY,
                    width: maxX - minX + 1,
                    height: maxY - minY + 1
                });
            }
        }

        return boxes;
    }

    _drawHighlightBoxes(ctx, boxes, color = 'red') {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        const alpha = this.options.highlightAlpha;

        // Use configured colors or fallback to color parameter
        if (color === 'red') {
            ctx.fillStyle = this._hexToRgba(this.options.highlightColorA, alpha);
        } else if (color === 'green') {
            ctx.fillStyle = this._hexToRgba(this.options.highlightColorB, alpha);
        }

        boxes.forEach(({ x, y, width, height }) => {
            ctx.fillRect(x, y, width, height);
        });
    }

    _rectsIntersect(a, b) {
        return (
            a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y
        );
    }

    _dedupeBoxes(boxes) {
        const seen = new Set();
        const result = [];
        boxes.forEach((box) => {
            const key = [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)].join(':');
            if (seen.has(key)) return;
            seen.add(key);
            result.push({ x: box.x, y: box.y, width: box.width, height: box.height });
        });
        return result;
    }

    _padBox(box, paddingX, paddingY) {
        const x = Math.max(0, box.x - paddingX);
        const y = Math.max(0, box.y - paddingY);
        return {
            x,
            y,
            width: Math.max(1, box.width + paddingX * 2),
            height: Math.max(1, box.height + paddingY * 2)
        };
    }

    _mapDiffsToWordBoxes(diffBoxes, wordBoxes) {
        if (!wordBoxes || !wordBoxes.length) {
            return diffBoxes;
        }

        const matched = [];

        diffBoxes.forEach((diffBox) => {
            let found = false;
            for (const word of wordBoxes) {
                if (this._rectsIntersect(diffBox, word)) {
                    if (word.width >= this.options.minWordSize && word.height >= this.options.minWordSize) {
                        matched.push(word);
                        found = true;
                    }
                }
            }
            if (!found) {
                matched.push(diffBox);
            }
        });

        return this._dedupeBoxes(matched);
    }

    _translateBoxes(boxes, dx, dy) {
        return boxes.map((box) => ({
            x: box.x + dx,
            y: box.y + dy,
            width: box.width,
            height: box.height
        }));
    }

    _offsetWordBoxes(words, crop) {
        if (!crop) return words;
        return words.map(box => ({
            ...box,
            x: box.x - crop.x,
            y: box.y - crop.y
        }));
    }

    _canvasToImageData(canvas) {
        const ctx = canvas.getContext('2d');
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    _applyCrop(canvas, region) {
        if (!region) return canvas;
        if (region.x + region.width > canvas.width || region.y + region.height > canvas.height || region.width * region.height > 6000000)
            throw new Error("PDF crop exceeds the rendered page or pixel limit");
        const cropped = createCanvas();
        cropped.width = region.width;
        cropped.height = region.height;
        const ctx = cropped.getContext('2d');
        ctx.drawImage(
            canvas,
            region.x, region.y, region.width, region.height,
            0, 0, region.width, region.height
        );
        return cropped;
    }

    _applyMasks(diffImage, masks) {
        if (!masks?.length) return;
        const data = diffImage.data;
        masks.forEach(({ x, y, width, height }) => {
            for (let row = Math.max(0, y); row < Math.min(diffImage.height, y + height); row++) {
                for (let col = Math.max(0, x); col < Math.min(diffImage.width, x + width); col++) {
                    const idx = (row * diffImage.width + col) * 4;
                    data[idx] = data[idx + 1] = data[idx + 2] = data[idx + 3] = 0;
                }
            }
        });
    }

    _overlayDiff(baseCanvas, diffCanvas, opacity = 0.3) {
        const overlay = createCanvas();
        overlay.width = baseCanvas.width;
        overlay.height = baseCanvas.height;

        const ctx = overlay.getContext('2d');
        ctx.drawImage(baseCanvas, 0, 0);
        ctx.globalAlpha = opacity;
        ctx.drawImage(diffCanvas, 0, 0);
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = false;

        return overlay;
    }

    // ===== SMART ALIGNMENT METHODS =====

    /**
     * Find optimal page mappings between two PDFs based on text content similarity
     */
    async _findPageMappings(docA, docB) {
        const mappings = [];
        const usedPagesB = new Set();
        const tolerance = this.options.alignmentTolerance;

        // Extract text from all pages of both documents
        const textsA = await this._extractAllPageTexts(docA);
        const textsB = await this._extractAllPageTexts(docB);

        // For each page in document A, find best matching page in document B
        for (let pageA = 1; pageA <= docA.numPages; pageA++) {
            const textA = textsA[pageA - 1];

            let bestMatch = null;
            let bestSimilarity = 0;

            // Search within tolerance range
            const startPage = Math.max(1, pageA - tolerance);
            const endPage = Math.min(docB.numPages, pageA + tolerance);

            for (let pageB = startPage; pageB <= endPage; pageB++) {
                if (usedPagesB.has(pageB)) continue;

                const textB = textsB[pageB - 1];
                const similarity = this._calculateTextSimilarity(textA, textB);

                if (similarity > bestSimilarity && similarity >= this.options.similarityThreshold) {
                    bestSimilarity = similarity;
                    bestMatch = pageB;
                }
            }

            // If no good match found, try 1:1 mapping if that page exists and isn't used
            if (!bestMatch && pageA <= docB.numPages && !usedPagesB.has(pageA)) {
                bestMatch = pageA;
                bestSimilarity = this._calculateTextSimilarity(textA, textsB[pageA - 1]);
            }

            if (bestMatch) {
                usedPagesB.add(bestMatch);
                mappings.push({
                    pageA,
                    pageB: bestMatch,
                    similarity: bestSimilarity
                });
            }
        }

        return mappings;
    }

    /**
     * Extract text from all pages of a PDF document
     */
    async _extractAllPageTexts(doc) {
        const texts = [];
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map(item => item.str || '')
                .join(' ')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
            texts.push(pageText);
        }
        return texts;
    }

    /**
     * Calculate text similarity using Jaccard similarity coefficient
     * Returns a value between 0 (no similarity) and 1 (identical)
     */
    _calculateTextSimilarity(text1, text2) {
        if (!text1 && !text2) return 1.0;
        if (!text1 || !text2) return 0.0;

        // Tokenize into words
        const words1 = this._tokenize(text1);
        const words2 = this._tokenize(text2);

        // Create sets of words
        const set1 = new Set(words1);
        const set2 = new Set(words2);

        // Calculate Jaccard similarity: |intersection| / |union|
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        if (union.size === 0) return 0.0;

        const jaccardSimilarity = intersection.size / union.size;

        // Also consider length ratio for better accuracy
        const lengthRatio = Math.min(text1.length, text2.length) / Math.max(text1.length, text2.length);

        // Weighted combination
        return jaccardSimilarity * 0.7 + lengthRatio * 0.3;
    }

    /**
     * Tokenize text into words, removing common stopwords
     */
    _tokenize(text) {
        const stopwords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
            'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
            'would', 'should', 'could', 'may', 'might', 'can', 'shall'
        ]);

        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ') // Remove punctuation
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopwords.has(word));
    }

    /**
     * Convert hex color to rgba with alpha
     */
    _hexToRgba(hex, alpha) {
        // Handle both #RGB and #RRGGBB formats
        const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            const r = parseInt(result[1], 16);
            const g = parseInt(result[2], 16);
            const b = parseInt(result[3], 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        // Fallback to red if invalid hex
        return `rgba(255, 0, 0, ${alpha})`;
    }
}


export default PDFDiffViewer;
