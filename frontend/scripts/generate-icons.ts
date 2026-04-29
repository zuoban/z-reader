import sharp from 'sharp';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { writeFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const svgPath = join(rootDir, 'public/icons/icon.svg');

const generateIcon = async (size: number, outputPath: string) => {
  await sharp(svgPath)
    .resize(size, size)
    .png()
    .toFile(outputPath);
};

const createIcoImage = async (size: number) => {
  const { data } = await sharp(svgPath)
    .resize(size, size)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const headerSize = 40;
  const xorSize = size * size * 4;
  const maskStride = Math.ceil(size / 32) * 4;
  const maskSize = maskStride * size;
  const buffer = Buffer.alloc(headerSize + xorSize + maskSize);

  buffer.writeUInt32LE(headerSize, 0);
  buffer.writeInt32LE(size, 4);
  buffer.writeInt32LE(size * 2, 8);
  buffer.writeUInt16LE(1, 12);
  buffer.writeUInt16LE(32, 14);
  buffer.writeUInt32LE(0, 16);
  buffer.writeUInt32LE(xorSize + maskSize, 20);

  let offset = headerSize;
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) {
      const source = (y * size + x) * 4;
      buffer[offset++] = data[source + 2];
      buffer[offset++] = data[source + 1];
      buffer[offset++] = data[source];
      buffer[offset++] = data[source + 3];
    }
  }

  return buffer;
};

const generateIco = async (sizes: number[], outputPath: string) => {
  const images = await Promise.all(sizes.map(createIcoImage));
  const directorySize = 6 + images.length * 16;
  const output = Buffer.alloc(directorySize + images.reduce((sum, image) => sum + image.length, 0));

  output.writeUInt16LE(0, 0);
  output.writeUInt16LE(1, 2);
  output.writeUInt16LE(images.length, 4);

  let dataOffset = directorySize;
  images.forEach((image, index) => {
    const size = sizes[index];
    const entryOffset = 6 + index * 16;

    output[entryOffset] = size >= 256 ? 0 : size;
    output[entryOffset + 1] = size >= 256 ? 0 : size;
    output[entryOffset + 2] = 0;
    output[entryOffset + 3] = 0;
    output.writeUInt16LE(1, entryOffset + 4);
    output.writeUInt16LE(32, entryOffset + 6);
    output.writeUInt32LE(image.length, entryOffset + 8);
    output.writeUInt32LE(dataOffset, entryOffset + 12);

    image.copy(output, dataOffset);
    dataOffset += image.length;
  });

  await writeFile(outputPath, output);
};

async function main() {
  try {
    await generateIcon(192, join(rootDir, 'public/icons/icon-192.png'));
    await generateIcon(512, join(rootDir, 'public/icons/icon-512.png'));
    await generateIco([16, 24, 32, 48], join(rootDir, 'public/favicon.ico'));
    await generateIco([16, 32, 48], join(rootDir, 'src/app/favicon.ico'));
    console.log('Icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

main();
