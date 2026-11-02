// BMP and TGA decoders for the MeshCreator library. Three's texture loader
// reads PNG and JPEG only; this library also ships 24/32-bit BMP and TGA.
// The canvas is top-down. Callers set texture.flipY = false so UV v = 0 stays
// at the top of the image, matching DirectX.

function canvasFromRgba(width, height, rgba) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvas;
}

function decodeBmp(buffer) {
  const view = new DataView(buffer);
  if (view.getUint16(0, true) !== 0x4d42) throw new Error('Not a BMP');
  const pixelOffset = view.getUint32(10, true);
  const dib = view.getUint32(14, true);
  if (dib < 40) throw new Error('Unsupported BMP header');
  const width = view.getInt32(18, true);
  const heightRaw = view.getInt32(22, true);
  const bits = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  if (compression !== 0 || (bits !== 24 && bits !== 32)) {
    throw new Error(`Unsupported BMP (${bits}-bit, compression ${compression})`);
  }
  const topDown = heightRaw < 0;
  const height = Math.abs(heightRaw);
  const bytesPerPixel = bits / 8;
  const stride = Math.ceil((width * bytesPerPixel) / 4) * 4;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const srcRow = topDown ? y : height - 1 - y;
    const row = pixelOffset + srcRow * stride;
    for (let x = 0; x < width; x += 1) {
      const s = row + x * bytesPerPixel;
      const d = (y * width + x) * 4;
      rgba[d] = view.getUint8(s + 2);
      rgba[d + 1] = view.getUint8(s + 1);
      rgba[d + 2] = view.getUint8(s);
      rgba[d + 3] = bits === 32 ? view.getUint8(s + 3) : 255;
    }
  }
  return canvasFromRgba(width, height, rgba);
}

function decodeTga(buffer) {
  const view = new DataView(buffer);
  const idLength = view.getUint8(0);
  const imageType = view.getUint8(2);
  const width = view.getUint16(12, true);
  const height = view.getUint16(14, true);
  const bits = view.getUint8(16);
  const descriptor = view.getUint8(17);
  if ((imageType !== 2 && imageType !== 10) || (bits !== 24 && bits !== 32)) {
    throw new Error(`Unsupported TGA (type ${imageType}, ${bits}-bit)`);
  }
  const bytesPerPixel = bits / 8;
  const topOrigin = (descriptor & 0x20) !== 0;
  let offset = 18 + idLength;
  const pixels = new Uint8Array(width * height * 4);

  const write = (index, b, g, r, a) => {
    const d = index * 4;
    pixels[d] = r;
    pixels[d + 1] = g;
    pixels[d + 2] = b;
    pixels[d + 3] = a;
  };
  const readPixel = () => {
    const b = view.getUint8(offset);
    const g = view.getUint8(offset + 1);
    const r = view.getUint8(offset + 2);
    const a = bits === 32 ? view.getUint8(offset + 3) : 255;
    offset += bytesPerPixel;
    return [b, g, r, a];
  };

  if (imageType === 2) {
    for (let i = 0; i < width * height; i += 1) {
      write(i, ...readPixel());
    }
  } else {
    let i = 0;
    const count = width * height;
    while (i < count) {
      const header = view.getUint8(offset);
      offset += 1;
      const run = (header & 0x7f) + 1;
      if (header & 0x80) {
        const pixel = readPixel();
        for (let k = 0; k < run; k += 1) write(i + k, ...pixel);
      } else {
        for (let k = 0; k < run; k += 1) write(i + k, ...readPixel());
      }
      i += run;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const src = topOrigin ? y : height - 1 - y;
    rgba.set(pixels.subarray(src * width * 4, (src + 1) * width * 4), y * width * 4);
  }
  return canvasFromRgba(width, height, rgba);
}

export function decodeImage(extension, buffer) {
  if (extension === 'bmp') return decodeBmp(buffer);
  if (extension === 'tga') return decodeTga(buffer);
  throw new Error(`Cannot decode .${extension}`);
}
