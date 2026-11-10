package com.codemastery.media;

/** Reads only the EXIF orientation tag from a TIFF block, with every offset bounds-checked. Anything odd means 1 (upright). */
final class ExifOrientation {
    private ExifOrientation() {}

    /** @param tiffStart offset of the TIFF header ("II*\0" or "MM\0*"); @param limit exclusive end of the readable block */
    static int read(byte[] d, int tiffStart, int limit) {
        try {
            limit = Math.min(limit, d.length);
            if (tiffStart < 0 || tiffStart + 8 > limit) return 1;
            boolean le;
            if (d[tiffStart] == 'I' && d[tiffStart + 1] == 'I') le = true;
            else if (d[tiffStart] == 'M' && d[tiffStart + 1] == 'M') le = false;
            else return 1;
            if (u16(d, tiffStart + 2, le) != 42) return 1;
            long ifd = u32(d, tiffStart + 4, le);
            if (ifd < 8 || tiffStart + ifd + 2 > limit) return 1;
            int pos = (int) (tiffStart + ifd);
            int count = u16(d, pos, le);
            for (int i = 0; i < count; i++) {
                int e = pos + 2 + i * 12;
                if (e + 12 > limit) return 1;
                if (u16(d, e, le) == 0x0112) {
                    int type = u16(d, e + 2, le);
                    long n = u32(d, e + 4, le);
                    if (type != 3 || n != 1) return 1;
                    int v = u16(d, e + 8, le);
                    return v >= 1 && v <= 8 ? v : 1;
                }
            }
        } catch (RuntimeException ignored) {
            // malformed metadata is simply ignored
        }
        return 1;
    }

    /** A WebP EXIF chunk or PNG eXIf chunk may or may not carry the "Exif\0\0" prefix JPEG uses. */
    static int readMaybePrefixed(byte[] d, int start, int end) {
        if (start + 6 <= end && d[start] == 'E' && d[start + 1] == 'x' && d[start + 2] == 'i' && d[start + 3] == 'f' && d[start + 4] == 0 && d[start + 5] == 0) {
            return read(d, start + 6, end);
        }
        return read(d, start, end);
    }

    private static int u16(byte[] d, int p, boolean le) {
        int a = d[p] & 0xFF, b = d[p + 1] & 0xFF;
        return le ? a | (b << 8) : (a << 8) | b;
    }

    private static long u32(byte[] d, int p, boolean le) {
        long a = u16(d, p, le), b = u16(d, p + 2, le);
        return le ? a | (b << 16) : (a << 16) | b;
    }
}
