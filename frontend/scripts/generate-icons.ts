import sharp from 'sharp';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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

async function main() {
  try {
    await generateIcon(192, join(rootDir, 'public/icons/icon-192.png'));
    await generateIcon(512, join(rootDir, 'public/icons/icon-512.png'));
    console.log('Icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

main();