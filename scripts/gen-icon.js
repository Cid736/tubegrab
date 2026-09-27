// One-off script to procedurally generate build/icon.ico (no image editor / no
// canvas lib available). Draws a rounded purple-gradient square with a bold
// white download arrow, matching the web UI's accent colors (#7c3aed -> #4f46e5).
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const toIco = require('to-ico');

const SS = 4; // supersampling factor for anti-aliasing
const SIZES = [16, 24, 32, 48, 64, 128, 256];

function lerp(a, b, t) { return a + (b - a) * t; }

function renderAt(size) {
  const N = size * SS;
  const png = new PNG({ width: N, height: N });
  const r = N * 0.22; // corner radius
  const cx = N / 2, cy = N / 2;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const idx = (N * y + x) << 2;

      // Rounded-square mask via distance to nearest corner circle center.
      const dx = Math.min(x, N - 1 - x);
      const dy = Math.min(y, N - 1 - y);
      let inside = true;
      if (dx < r && dy < r) {
        const cdx = r - dx, cdy = r - dy;
        inside = (cdx * cdx + cdy * cdy) <= r * r;
      }

      if (!inside) {
        png.data[idx] = 0; png.data[idx + 1] = 0; png.data[idx + 2] = 0; png.data[idx + 3] = 0;
        continue;
      }

      // Diagonal gradient background: #7c3aed -> #4f46e5
      const t = (x + y) / (2 * N);
      const cr = lerp(0x7c, 0x4f, t);
      const cg = lerp(0x3a, 0x46, t);
      const cb = lerp(0xed, 0xe5, t);

      // Download glyph: vertical shaft + arrowhead + base tray, in white.
      const nx = (x - cx) / N; // -0.5..0.5
      const ny = (y - cy) / N;
      let isGlyph = false;

      // Shaft: thin vertical bar in the upper-middle area
      if (Math.abs(nx) < 0.045 && ny > -0.26 && ny < 0.02) isGlyph = true;

      // Arrowhead: triangle pointing down, apex around ny=0.16
      const apexY = 0.16, headTop = -0.06, headHalfW = 0.16;
      if (ny >= headTop && ny <= apexY) {
        const progress = (ny - headTop) / (apexY - headTop); // 0..1
        const halfWidthAtY = headHalfW * (1 - progress);
        if (Math.abs(nx) <= halfWidthAtY) isGlyph = true;
      }

      // Base tray: rounded-ish bar near the bottom
      if (ny > 0.24 && ny < 0.3 && Math.abs(nx) < 0.22) isGlyph = true;

      if (isGlyph) {
        png.data[idx] = 255; png.data[idx + 1] = 255; png.data[idx + 2] = 255; png.data[idx + 3] = 255;
      } else {
        png.data[idx] = cr; png.data[idx + 1] = cg; png.data[idx + 2] = cb; png.data[idx + 3] = 255;
      }
    }
  }

  // Box-downsample N x N -> size x size for anti-aliasing.
  const out = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const srcIdx = (N * (y * SS + sy) + (x * SS + sx)) << 2;
          r += png.data[srcIdx]; g += png.data[srcIdx + 1]; b += png.data[srcIdx + 2]; a += png.data[srcIdx + 3];
        }
      }
      const count = SS * SS;
      const dstIdx = (size * y + x) << 2;
      out.data[dstIdx] = Math.round(r / count);
      out.data[dstIdx + 1] = Math.round(g / count);
      out.data[dstIdx + 2] = Math.round(b / count);
      out.data[dstIdx + 3] = Math.round(a / count);
    }
  }
  return PNG.sync.write(out);
}

async function main() {
  const buffers = SIZES.map(renderAt);
  const icoBuffer = await toIco(buffers);
  const buildDir = path.join(__dirname, '..', 'build');
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);
  fs.writeFileSync(path.join(buildDir, 'icon-preview.png'), buffers[buffers.length - 1]);
  console.log('Wrote build/icon.ico and build/icon-preview.png');
}

main().catch((err) => { console.error(err); process.exit(1); });
