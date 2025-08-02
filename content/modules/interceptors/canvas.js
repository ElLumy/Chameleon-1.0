// content/modules/interceptors/canvas.js
export class CanvasInterceptor {
    constructor(profile, chameleonState) {
        this.profile = profile.canvas;
        this.chameleonState = chameleonState;
        this.rng = new Math.seedrandom(chameleonState.seed + '_canvas');
        this.appliedCanvases = new WeakSet();
    }
    
    apply() {
        console.log('[Chameleon] Applying canvas interceptor...');
        
        // Intercept 2D context methods
        this.intercept2DContext();
        
        // Intercept WebGL context (handled separately)
        
        // Intercept toDataURL
        this.interceptToDataURL();
        
        // Intercept toBlob
        this.interceptToBlob();
        
        // Intercept getImageData
        this.interceptGetImageData();
        
        // Intercept putImageData
        this.interceptPutImageData();
        
        console.log('[Chameleon] Canvas interceptor applied');
    }
    
    intercept2DContext() {
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        
        HTMLCanvasElement.prototype.getContext = new Proxy(originalGetContext, {
            apply: (target, thisArg, args) => {
                const context = Reflect.apply(target, thisArg, args);
                
                if (args[0] === '2d' && context && !this.appliedCanvases.has(thisArg)) {
                    this.applyContextNoise(context);
                    this.appliedCanvases.add(thisArg);
                }
                
                return context;
            }
        });
        
        if (window.chameleonRegisterIntercepted) {
            window.chameleonRegisterIntercepted(HTMLCanvasElement.prototype.getContext);
        }
    }
    
    applyContextNoise(ctx) {
        // Intercept fillText
        const originalFillText = ctx.fillText;
        ctx.fillText = new Proxy(originalFillText, {
            apply: (target, thisArg, args) => {
                // Apply slight position offset
                if (args.length >= 3) {
                    args[1] += this.profile.offsetX * 0.1;
                    args[2] += this.profile.offsetY * 0.1;
                }
                return Reflect.apply(target, thisArg, args);
            }
        });
        
        // Intercept strokeText
        const originalStrokeText = ctx.strokeText;
        ctx.strokeText = new Proxy(originalStrokeText, {
            apply: (target, thisArg, args) => {
                // Apply slight position offset
                if (args.length >= 3) {
                    args[1] += this.profile.offsetX * 0.1;
                    args[2] += this.profile.offsetY * 0.1;
                }
                return Reflect.apply(target, thisArg, args);
            }
        });
    }
    
    interceptToDataURL() {
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        
        HTMLCanvasElement.prototype.toDataURL = new Proxy(originalToDataURL, {
            apply: (target, thisArg, args) => {
                this.applyCanvasNoise(thisArg);
                return Reflect.apply(target, thisArg, args);
            }
        });
        
        if (window.chameleonRegisterIntercepted) {
            window.chameleonRegisterIntercepted(HTMLCanvasElement.prototype.toDataURL);
        }
    }
    
    interceptToBlob() {
        const originalToBlob = HTMLCanvasElement.prototype.toBlob;
        
        HTMLCanvasElement.prototype.toBlob = new Proxy(originalToBlob, {
            apply: (target, thisArg, args) => {
                this.applyCanvasNoise(thisArg);
                return Reflect.apply(target, thisArg, args);
            }
        });
        
        if (window.chameleonRegisterIntercepted) {
            window.chameleonRegisterIntercepted(HTMLCanvasElement.prototype.toBlob);
        }
    }
    
    interceptGetImageData() {
        const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
        
        CanvasRenderingContext2D.prototype.getImageData = new Proxy(originalGetImageData, {
            apply: (target, thisArg, args) => {
                // Apply noise before getting image data
                this.applyCanvasNoise(thisArg.canvas);
                
                const imageData = Reflect.apply(target, thisArg, args);
                
                // Apply additional noise to the image data
                this.applyImageDataNoise(imageData);
                
                return imageData;
            }
        });
        
        if (window.chameleonRegisterIntercepted) {
            window.chameleonRegisterIntercepted(CanvasRenderingContext2D.prototype.getImageData);
        }
    }
    
    interceptPutImageData() {
        const originalPutImageData = CanvasRenderingContext2D.prototype.putImageData;
        
        CanvasRenderingContext2D.prototype.putImageData = new Proxy(originalPutImageData, {
            apply: (target, thisArg, args) => {
                // Apply noise to the image data before putting it
                if (args[0] && args[0].data) {
                    this.applyImageDataNoise(args[0]);
                }
                
                return Reflect.apply(target, thisArg, args);
            }
        });
        
        if (window.chameleonRegisterIntercepted) {
            window.chameleonRegisterIntercepted(CanvasRenderingContext2D.prototype.putImageData);
        }
    }
    
    applyCanvasNoise(canvas) {
        if (!canvas || this.appliedCanvases.has(canvas)) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Get current image data
        const width = canvas.width;
        const height = canvas.height;
        
        if (width === 0 || height === 0) return;
        
        try {
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            
            // Detect edges and apply noise only there
            const edges = this.detectEdges(data, width, height);
            // Apply noise to edges
            for (let i = 0; i < edges.length; i++) {
                if (edges[i] > 128) { // It's an edge
                    const pixelIndex = i * 4;
                    const noise = (this.rng() - 0.5) * this.profile.noise * 255;
                    
                    // Apply noise to RGB channels
                    data[pixelIndex] = this.clamp(data[pixelIndex] + noise);
                    data[pixelIndex + 1] = this.clamp(data[pixelIndex + 1] + noise);
                    data[pixelIndex + 2] = this.clamp(data[pixelIndex + 2] + noise);
                    // Alpha channel remains unchanged
                }
            }
            
            ctx.putImageData(imageData, 0, 0);
            
            // Add an almost invisible pixel based on seed
            ctx.save();
            ctx.globalAlpha = 0.01;
            ctx.fillStyle = `rgb(${Math.floor(this.rng() * 256)}, ${Math.floor(this.rng() * 256)}, ${Math.floor(this.rng() * 256)})`;
            ctx.fillRect(
                width - 1 + this.profile.offsetX,
                height - 1 + this.profile.offsetY,
                1, 1
            );
            ctx.restore();
            
            // Mark as processed
            this.appliedCanvases.add(canvas);
            
        } catch (e) {
            console.warn('[Chameleon] Canvas noise application failed:', e);
        }
    }
    
    applyImageDataNoise(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        // Apply very subtle noise to the entire image
        for (let i = 0; i < data.length; i += 4) {
            const noise = (this.rng() - 0.5) * this.profile.noise * 50;
            
            data[i] = this.clamp(data[i] + noise);
            data[i + 1] = this.clamp(data[i + 1] + noise);
            data[i + 2] = this.clamp(data[i + 2] + noise);
        }
    }
    
    detectEdges(data, width, height) {
        const edges = new Uint8Array(width * height);
        
        // Sobel edge detection
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                
                // Get surrounding pixels
                const tl = this.getPixelBrightness(data, (y - 1) * width + (x - 1));
                const tm = this.getPixelBrightness(data, (y - 1) * width + x);
                const tr = this.getPixelBrightness(data, (y - 1) * width + (x + 1));
                const ml = this.getPixelBrightness(data, y * width + (x - 1));
                const mm = this.getPixelBrightness(data, y * width + x);
                const mr = this.getPixelBrightness(data, y * width + (x + 1));
                const bl = this.getPixelBrightness(data, (y + 1) * width + (x - 1));
                const bm = this.getPixelBrightness(data, (y + 1) * width + x);
                const br = this.getPixelBrightness(data, (y + 1) * width + (x + 1));
                
                // Sobel X
                const gx = -1 * tl + 0 * tm + 1 * tr +
                          -2 * ml + 0 * mm + 2 * mr +
                          -1 * bl + 0 * bm + 1 * br;
                
                // Sobel Y
                const gy = -1 * tl + -2 * tm + -1 * tr +
                           0 * ml +  0 * mm +  0 * mr +
                           1 * bl +  2 * bm +  1 * br;
                
                // Calculate magnitude
                const magnitude = Math.sqrt(gx * gx + gy * gy);
                edges[y * width + x] = Math.min(255, magnitude);
            }
        }
        
        return edges;
    }
    
    getPixelBrightness(data, index) {
        const i = index * 4;
        return (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    
    clamp(value) {
        return Math.max(0, Math.min(255, Math.round(value)));
    }
}