export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export async function compressImage(
  file: File,
  options?: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
  }
): Promise<CompressedImage> {
  const {
    maxWidth = 1200,
    maxHeight = 1600,
    quality = 0.7,
  } = options || {};

  const originalSize = file.size;

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const img = new Image();

    img.onload = () => {
      try {
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const scale = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get canvas context');

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) throw new Error('Failed to compress image');

            const compressionRatio = blob.size / originalSize;

            resolve({
              blob,
              width,
              height,
              originalSize,
              compressedSize: blob.size,
              compressionRatio,
            });
          },
          'image/jpeg',
          quality
        );
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export async function compressMultiple(
  files: File[],
  options?: Parameters<typeof compressImage>[1]
): Promise<CompressedImage[]> {
  return Promise.all(files.map(f => compressImage(f, options)));
}
