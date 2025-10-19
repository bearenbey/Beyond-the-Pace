/* connected-lines.js — Futuristic connected lines render inside a container
   Usage: <div class="photo" data-image="path/to.jpg"></div>
   Auto-inits on DOMContentLoaded for '.bio .photo' elements.
*/

(function(){
  // ---- Config (you can override per-element via data-* attributes) ----
  const DEFAULTS = {
    sampleStep: 6,          // grid step in px for sampling
    keepProbability: 0.70,  // base chance to keep a point
    darkBoost: 0.75,        // extra keep chance for darker pixels
    maxPoints: 8000,        // hard cap

    maxDist: 38,            // link radius in px (internal canvas scale)
    maxNeighbors: 5,        // max links per node
    nodeRadius: 1.0,        // 0 = no dots

    backgroundAlpha: 0.08,  // faint source image in the back
    lineWidth: 1.0,         // base stroke width
    fadeNear: 0.25,         // distance at which line starts fading (fraction of maxDist)
    fadeFar: 1.0,           // distance where line fully fades
    jitter: 0.7,            // random jitter for organic look (px)

    // Fallback colors; will try CSS variables first.
    neonA: "#21d4fd",
    neonB: "#ff4d6d",
  };

  // ---- Utilities ----
  const clamp = (x,a,b)=> Math.max(a, Math.min(b, x));
  const lerp = (a,b,t)=> a + (b-a)*t;
  const lcg = seed => { let s = (seed>>>0)||1; return ()=> (s=(1664525*s+1013904223)>>>0)/4294967296; };
  const hexToRgb = h => {
    const n = parseInt(h.replace("#","").replace(/[^0-9a-f]/gi,"").replace(/^(.)(.)(.)$/,'$1$1$2$2$3$3'),16);
    return [(n>>16)&255,(n>>8)&255,n&255];
  };
  const luminance = (r,g,b)=> (0.299*r + 0.587*g + 0.114*b)/255; // 0..1

  // Read theme colors from CSS variables if present
  function themeColors(el, defaults){
    const cs = getComputedStyle(el);
    const cA = cs.getPropertyValue("--accent").trim() || defaults.neonA;
    // Prefer --accent-2 for second hue; fallback to defaults
    const cB = cs.getPropertyValue("--accent-2").trim() || defaults.neonB;
    return { neonA: cA, neonB: cB };
  }

  // ---- Core renderer ----
  async function renderConnectedLines(container, overrides = {}){
    if (!container) return;

    // Merge config
    const opts = Object.assign({}, DEFAULTS, overrides);
    // Data-attribute overrides (e.g., data-samplestep="8")
    for (const [k,v] of Object.entries(container.dataset)){
      const key = k.replace(/-([a-z])/g, (_,c)=> c.toUpperCase()); // kebab to camel
      if (key in opts){
        const num = Number(v);
        opts[key] = Number.isFinite(num) ? num : v;
      }
    }

    // Pull theme colors from CSS variables if available
    const theme = themeColors(container, opts);
    opts.neonA = theme.neonA || opts.neonA;
    opts.neonB = theme.neonB || opts.neonB;

    // Prepare canvas
    const canvas = document.createElement("canvas");
    canvas.className = "connected-lines";
    const ctx = canvas.getContext("2d", { alpha: true });
    container.appendChild(canvas);

    // Set up resize handling (devicePixelRatio aware)
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    function fit(){
      const { width, height } = container.getBoundingClientRect();
      const w = Math.max(1, Math.floor(width));
      const h = Math.max(1, Math.floor(height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    }

    // Load image (optional)
    const imgSrc = container.dataset.image;
    let img = null;
    if (imgSrc){
      img = await new Promise((resolve,reject)=>{
        const im = new Image();
        // For remote sources, uncomment if needed:
        // im.crossOrigin = "anonymous";
        im.onload = ()=> resolve(im);
        im.onerror = ()=> resolve(null);
        im.src = imgSrc;
      });
    }

    // Main draw
    async function draw(){
      const { w, h } = fit();
      ctx.clearRect(0,0,w,h);

      // If we have an image, draw it to an offscreen canvas to sample pixels
      let srcData = null;
      if (img){
        // Fit image cover-style within container (preserve aspect)
        const iw = img.naturalWidth, ih = img.naturalHeight;
        const scale = Math.max(w/iw, h/ih);
        const dw = Math.round(iw*scale), dh = Math.round(ih*scale);
        const dx = Math.round((w - dw)/2), dy = Math.round((h - dh)/2);

        // Offscreen
        const off = document.createElement("canvas");
        off.width = w; off.height = h;
        const octx = off.getContext("2d");
        octx.drawImage(img, dx, dy, dw, dh);
        srcData = octx.getImageData(0,0,w,h);

        // Soft background of the image
        if (opts.backgroundAlpha > 0){
          ctx.globalAlpha = opts.backgroundAlpha;
          ctx.drawImage(img, dx, dy, dw, dh);
          ctx.globalAlpha = 1;
        }
      }

      // Sample candidate points (denser in darker areas)
      const rand = lcg((Math.random()*1e9)|0);
      const points = [];
      const step = Math.max(2, opts.sampleStep|0);
      const jitter = opts.jitter;

      for (let y=0; y<h; y+=step){
        for (let x=0; x<w; x+=step){
          let L = 0.5; // middle if no image
          if (srcData){
            const i = ((y*w + x) << 2);
            const r = srcData.data[i], g = srcData.data[i+1], b = srcData.data[i+2];
            L = luminance(r,g,b);
          }
          const keepChance = opts.keepProbability + (1 - L) * opts.darkBoost;
          if (rand() < clamp(keepChance, 0, 1)){
            const jx = (rand()*2-1)*jitter, jy = (rand()*2-1)*jitter;
            points.push({ x: x + jx, y: y + jy, L });
            if (points.length >= opts.maxPoints) break;
          }
        }
        if (points.length >= opts.maxPoints) break;
      }

      // Spatial hash
      const cell = Math.max(8, Math.floor(opts.maxDist));
      const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
      const grid = Array.from({length: cols*rows}, ()=>[]);
      const cidx = (x,y)=> clamp(Math.floor(y/cell),0,rows-1)*cols + clamp(Math.floor(x/cell),0,cols-1);
      points.forEach((p, idx)=> grid[cidx(p.x, p.y)].push(idx));
      const neighbors = p => {
        const cx = Math.floor(p.x/cell), cy = Math.floor(p.y/cell);
        const out = [];
        for (let oy=-1; oy<=1; oy++){
          for (let ox=-1; ox<=1; ox++){
            const gx = cx+ox, gy = cy+oy;
            if (gx<0||gy<0||gx>=cols||gy>=rows) continue;
            out.push(...grid[gy*cols+gx]);
          }
        }
        return out;
      };

      // Colors
      const cA = hexToRgb(opts.neonA);
      const cB = hexToRgb(opts.neonB);
      const maxD2 = opts.maxDist*opts.maxDist;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Draw links
      for (let i=0; i<points.length; i++){
        const a = points[i];
        const pool = neighbors(a);
        const near = [];
        for (const j of pool){
          if (j===i) continue;
          const b = points[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx*dx + dy*dy;
          if (d2 > maxD2) continue;
          near.push({ j, d2 });
        }
        near.sort((u,v)=> u.d2 - v.d2);
        const take = Math.min(opts.maxNeighbors, near.length);

        for (let k=0; k<take; k++){
          const { j, d2 } = near[k];
          const b = points[j];
          const d = Math.sqrt(d2);

          // distance fade
          const t = clamp((d - opts.maxDist*opts.fadeNear) / (opts.maxDist*(opts.fadeFar - opts.fadeNear) + 1e-6), 0, 1);
          const avgDark = 1 - (a.L + b.L)/2;
          const alpha = clamp( (0.9 * avgDark) * (1 - t), 0, 0.9);

          // color mix by contrast
          const contrast = Math.abs(a.L - b.L);
          const R = Math.round(lerp(cA[0], cB[0], contrast));
          const G = Math.round(lerp(cA[1], cB[1], contrast));
          const B = Math.round(lerp(cA[2], cB[2], contrast));
          ctx.strokeStyle = `rgba(${R},${G},${B},${alpha})`;
          ctx.lineWidth = opts.lineWidth;

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Nodes
      if (opts.nodeRadius > 0){
        ctx.fillStyle = "rgba(232,237,246,.8)";
        for (const p of points){
          ctx.beginPath();
          ctx.arc(p.x, p.y, opts.nodeRadius, 0, Math.PI*2);
          ctx.fill();
        }
      }
    }

    // Draw once and on resize
    const ro = new ResizeObserver(()=> draw());
    ro.observe(container);

    // Expose a manual rerender API on the element
    container.connectedLines = { redraw: draw, destroy: ()=> { ro.disconnect(); canvas.remove(); } };

    await draw();
  }

  // Auto-init on page load
  document.addEventListener("DOMContentLoaded", ()=>{
    document.querySelectorAll(".bio .photo").forEach(el => renderConnectedLines(el));
  });

  // Optional: global helper if you want to init elsewhere
  window.initConnectedLines = renderConnectedLines;
})();
