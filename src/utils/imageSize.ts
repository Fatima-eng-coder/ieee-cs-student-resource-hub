/**
 * The shape of a picture, read the way the page will display it.
 *
 * Measured through an <img> rather than by parsing the file, on purpose. Phone cameras usually
 * store a portrait photo as landscape pixels plus an EXIF "rotate this" flag, and browsers apply
 * that flag when they display the image -- including to naturalWidth / naturalHeight. Reading the
 * dimensions any other way would call a portrait phone photo landscape, which is precisely the
 * photo this exists to get right.
 */

export type ImageOrientation = 'landscape' | 'portrait';

export interface ImageSize {
  width: number;
  height: number;
}

/** Square counts as landscape: it sits better in a row of wide tiles than in a row of tall ones. */
export const orientationOf = ({ width, height }: ImageSize): ImageOrientation =>
  width >= height ? 'landscape' : 'portrait';

/**
 * Natural size of a local file or of an image already on the web.
 *
 * A File is read through an object URL that is always revoked, because a batch upload measures
 * every file it is given and a leaked URL holds the whole decoded image in memory.
 */
export async function readImageSize(source: File | string): Promise<ImageSize> {
  const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source);
  const src = objectUrl ?? (source as string);

  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    // decode() resolves once the image is ready and rejects if it cannot be read, so a broken
    // link or a file that is not really an image surfaces as an error rather than as 0 x 0.
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('That image has no size.');
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export async function readImageOrientation(source: File | string): Promise<ImageOrientation> {
  return orientationOf(await readImageSize(source));
}
