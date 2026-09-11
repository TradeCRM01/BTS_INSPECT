export interface ExifJpegOptions {
  dateTimeOriginal?: string;
  offsetTimeOriginal?: string;
  lat?: number;
  lng?: number;
  little?: boolean;
}

export function toDms(degrees: number): Array<[number, number]>;
export function withExif(jpeg: Uint8Array, options: ExifJpegOptions): Uint8Array;
