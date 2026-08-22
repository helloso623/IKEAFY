/**
 * Byte-mode QR (versions 2–5, ECC L) for short LAN URLs.
 * No network, no npm QR package — Lab draws the SVG next to the phone link.
 */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

function gfMul(a, b) {
  if (!a || !b) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** ECC L, one RS block. data = data codewords, ec = error-correction codewords. */
const VERSIONS = {
  2: { size: 25, data: 34, ec: 10, align: 18 },
  3: { size: 29, data: 55, ec: 15, align: 22 },
  4: { size: 33, data: 80, ec: 20, align: 26 },
  5: { size: 37, data: 108, ec: 26, align: 30 },
};

const FORMAT_L = [0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976];

function rsDivisor(degree) {
  const poly = new Uint8Array(degree);
  poly[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      poly[j] = gfMul(poly[j], root);
      if (j + 1 < degree) poly[j] ^= poly[j + 1];
    }
    root = gfMul(root, 2);
  }
  return poly;
}

function rsRemainder(data, degree) {
  const gen = rsDivisor(degree);
  const out = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ out[0];
    out.copyWithin(0, 1);
    out[degree - 1] = 0;
    if (!factor) continue;
    for (let i = 0; i < degree; i += 1) out[i] ^= gfMul(gen[i], factor);
  }
  return out;
}

function pickVersion(byteLen) {
  for (const version of [2, 3, 4, 5]) {
    const capacity = VERSIONS[version].data - 2;
    if (byteLen <= capacity) return version;
  }
  throw new Error("That link is too long for the phone QR.");
}

function encodeBits(bytes, dataCodewords) {
  const bits = [];
  const push = (value, width) => {
    for (let i = width - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const byte of bytes) push(byte, 8);
  const capacity = dataCodewords * 8;
  const rest = Math.min(4, capacity - bits.length);
  for (let i = 0; i < rest; i += 1) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const words = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) byte = (byte << 1) | bits[i + b];
    words.push(byte);
  }
  let pad = 0;
  while (words.length < dataCodewords) {
    words.push(pad % 2 === 0 ? 0xec : 0x11);
    pad += 1;
  }
  return words;
}

function maskBit(mask, row, col) {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

function placeFinder(modules, reserved, row, col, size) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const rr = row + y;
      const cc = col + x;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const inFinder = x >= 0 && x <= 6 && y >= 0 && y <= 6;
      const on =
        inFinder &&
        (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
      modules[rr][cc] = on ? 1 : 0;
      reserved[rr][cc] = 1;
    }
  }
}

function placeAlignment(modules, reserved, center, size) {
  const origin = center - 2;
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const rr = origin + y;
      const cc = origin + x;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const on = x === 0 || x === 4 || y === 0 || y === 4 || (x === 2 && y === 2);
      modules[rr][cc] = on ? 1 : 0;
      reserved[rr][cc] = 1;
    }
  }
}

function getBit(value, i) {
  return (value >>> i) & 1;
}

function writeFormat(modules, size, mask) {
  const bits = FORMAT_L[mask];
  for (let i = 0; i <= 5; i += 1) modules[i][8] = getBit(bits, i);
  modules[7][8] = getBit(bits, 6);
  modules[8][8] = getBit(bits, 7);
  modules[8][7] = getBit(bits, 8);
  for (let i = 9; i < 15; i += 1) modules[8][14 - i] = getBit(bits, i);
  for (let i = 0; i < 8; i += 1) modules[8][size - 1 - i] = getBit(bits, i);
  for (let i = 8; i < 15; i += 1) modules[size - 15 + i][8] = getBit(bits, i);
  modules[size - 8][8] = 1;
}

function emptyGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function placeData(modules, reserved, size, bits, mask) {
  let bit = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let i = 0; i < size; i += 1) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (reserved[row][c]) continue;
        let dark = bit < bits.length ? bits[bit] : 0;
        bit += 1;
        if (maskBit(mask, row, c)) dark ^= 1;
        modules[row][c] = dark;
      }
    }
    upward = !upward;
  }
}

function penalty(modules, size) {
  let score = 0;
  for (let r = 0; r < size; r += 1) {
    let run = 1;
    for (let c = 1; c <= size; c += 1) {
      if (c < size && modules[r][c] === modules[r][c - 1]) {
        run += 1;
      } else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
  }
  for (let c = 0; c < size; c += 1) {
    let run = 1;
    for (let r = 1; r <= size; r += 1) {
      if (r < size && modules[r][c] === modules[r - 1][c]) {
        run += 1;
      } else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
  }
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3;
    }
  }
  const finder = [1, 0, 1, 1, 1, 0, 1];
  const hasFinder = (seq) => {
    for (let i = 0; i <= seq.length - 7; i += 1) {
      let ok = true;
      for (let k = 0; k < 7; k += 1) if (seq[i + k] !== finder[k]) ok = false;
      if (ok) score += 40;
    }
  };
  for (let r = 0; r < size; r += 1) hasFinder(modules[r]);
  for (let c = 0; c < size; c += 1) hasFinder(modules.map((row) => row[c]));
  let dark = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) dark += modules[r][c];
  }
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

function buildTemplate(version) {
  const { size, align } = VERSIONS[version];
  const modules = emptyGrid(size);
  const reserved = emptyGrid(size);
  placeFinder(modules, reserved, 0, 0, size);
  placeFinder(modules, reserved, 0, size - 7, size);
  placeFinder(modules, reserved, size - 7, 0, size);
  placeAlignment(modules, reserved, align, size);
  for (let i = 8; i < size - 8; i += 1) {
    modules[6][i] = i % 2 === 0 ? 1 : 0;
    modules[i][6] = i % 2 === 0 ? 1 : 0;
    reserved[6][i] = 1;
    reserved[i][6] = 1;
  }
  for (let i = 0; i < 9; i += 1) {
    reserved[8][i] = 1;
    reserved[i][8] = 1;
  }
  for (let i = 0; i < 8; i += 1) {
    reserved[8][size - 1 - i] = 1;
    reserved[size - 1 - i][8] = 1;
  }
  reserved[size - 8][8] = 1;
  return { modules, reserved, size };
}

function bitsFromCodewords(words, remainder) {
  const bits = [];
  for (const word of words) {
    for (let i = 7; i >= 0; i -= 1) bits.push((word >> i) & 1);
  }
  for (let i = 0; i < remainder; i += 1) bits.push(0);
  return bits;
}

export function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text || "")));
  const version = pickVersion(bytes.length);
  const spec = VERSIONS[version];
  const data = encodeBits(bytes, spec.data);
  const ec = rsRemainder(data, spec.ec);
  const stream = bitsFromCodewords([...data, ...ec], 7);
  let best = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const { modules, reserved, size } = buildTemplate(version);
    placeData(modules, reserved, size, stream, mask);
    writeFormat(modules, size, mask);
    const score = penalty(modules, size);
    if (score < bestScore) {
      bestScore = score;
      best = modules;
    }
  }
  return best;
}

export function qrSvg(text, { module = 4, margin = 3 } = {}) {
  const matrix = qrMatrix(text);
  const n = matrix.length;
  const dim = (n + margin * 2) * module;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}" shape-rendering="crispEdges" aria-hidden="true">`,
    `<rect width="${dim}" height="${dim}" fill="#fff"/>`,
  ];
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (!matrix[y][x]) continue;
      parts.push(
        `<rect x="${(x + margin) * module}" y="${(y + margin) * module}" width="${module}" height="${module}" fill="#111"/>`,
      );
    }
  }
  parts.push("</svg>");
  return parts.join("");
}
