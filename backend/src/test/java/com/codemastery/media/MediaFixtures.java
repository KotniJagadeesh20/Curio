package com.codemastery.media;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Random;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import org.springframework.util.unit.DataSize;

/** Test helpers: committed binary fixtures (src/test/resources/media) and generated images / hostile headers. */
public final class MediaFixtures {
    private MediaFixtures() {}

    public static byte[] resource(String name) {
        try (InputStream in = MediaFixtures.class.getResourceAsStream("/media/" + name)) {
            if (in == null) throw new IllegalStateException("missing fixture " + name);
            return in.readAllBytes();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    public static MediaProperties props(int decodeBudgetMb) {
        return new MediaProperties("local", new MediaProperties.Local("unused"), DataSize.ofMegabytes(5), 25_000_000L, 20_000,
                DataSize.ofMegabytes(200), 500, decodeBudgetMb, 4, Duration.ofSeconds(2), Duration.ofMinutes(30), Duration.ofMinutes(10),
                false, 2560, 640, 85);
    }

    public static MediaProperties props() { return props(256); }

    public static ImageProcessor processor() { return new ImageProcessor(props(), new DecodeBudget(256, Long.MAX_VALUE)); }

    private static BufferedImage gradient(int w, int h, boolean alpha) {
        BufferedImage img = new BufferedImage(w, h, alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        for (int x = 0; x < w; x += Math.max(1, w / 64)) {
            g.setColor(new Color((x * 255) / Math.max(1, w), 120, 200));
            g.fillRect(x, 0, Math.max(1, w / 64) + 1, h);
        }
        g.dispose();
        return img;
    }

    public static byte[] encode(BufferedImage img, String format) {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(img, format, out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    public static byte[] jpeg(int w, int h) { return encode(gradient(w, h, false), "jpeg"); }

    public static byte[] png(int w, int h, boolean alpha) { return encode(gradient(w, h, alpha), "png"); }

    /** Incompressible content, so the stored output has a predictable, large size (quota-by-bytes tests). */
    public static byte[] noiseJpeg(int w, int h, long seed) {
        Random r = new Random(seed);
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) img.setRGB(x, y, r.nextInt(0x1000000));
        return encode(img, "jpeg");
    }

    /** A PNG that claims these dimensions but holds no real pixels: IHDR with a valid CRC, an IDAT of junk, IEND. */
    public static byte[] pngHeaderOnly(int w, int h) { return pngHeaderOnly(w, h, 8, 2); }

    public static byte[] pngHeaderOnly(int w, int h, int bitDepth, int colorType) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A});
        byte[] ihdr = new byte[13];
        putInt(ihdr, 0, w);
        putInt(ihdr, 4, h);
        ihdr[8] = (byte) bitDepth;
        ihdr[9] = (byte) colorType;   // 0 grey, 2 truecolor, 3 palette, 4 grey+alpha, 6 truecolor+alpha
        chunk(out, "IHDR", ihdr);
        chunk(out, "IDAT", new byte[] {0x78, (byte) 0x9C, 0x01, 0x02, 0x03});
        chunk(out, "IEND", new byte[0]);
        return out.toByteArray();
    }

    /** Sample used by the crafted grey images: a ramp, so every pixel position is distinguishable. */
    public static int rampValue(int x, int y) { return (x * 4 + y) % 256; }

    /**
     * A real grey+alpha (colour type 4) or RGBA (type 6, every channel equal) PNG of {@code rampValue} pixels, 8- or 16-bit, fully opaque
     * from x = 8 on and fully transparent before it, optionally with an eXIf chunk carrying the given orientation (1 = none).
     */
    public static byte[] pngRamp(int w, int h, int bitDepth, boolean rgba, int exifOrientation) {
        int channels = rgba ? 4 : 2, bytes = bitDepth / 8;
        byte[] raw = new byte[h * (1 + w * channels * bytes)];
        int p = 0;
        for (int y = 0; y < h; y++) {
            raw[p++] = 0;   // filter: none
            for (int x = 0; x < w; x++) {
                int v = rampValue(x, y), a = x >= 8 ? 255 : 0;
                int[] samples = rgba ? new int[] {v, v, v, a} : new int[] {v, a};
                for (int sv : samples) {
                    if (bitDepth == 16) { raw[p++] = (byte) sv; raw[p++] = (byte) sv; }   // v * 257
                    else raw[p++] = (byte) sv;
                }
            }
        }
        java.util.zip.Deflater d = new java.util.zip.Deflater();
        d.setInput(raw);
        d.finish();
        ByteArrayOutputStream z = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        while (!d.finished()) z.write(buf, 0, d.deflate(buf));
        d.end();

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A});
        byte[] ihdr = new byte[13];
        putInt(ihdr, 0, w);
        putInt(ihdr, 4, h);
        ihdr[8] = (byte) bitDepth;
        ihdr[9] = (byte) (rgba ? 6 : 4);
        chunk(out, "IHDR", ihdr);
        if (exifOrientation > 1) {
            chunk(out, "eXIf", new byte[] {'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, (byte) exifOrientation, 0, 0, 0, 0, 0, 0, 0});
        }
        chunk(out, "IDAT", z.toByteArray());
        chunk(out, "IEND", new byte[0]);
        return out.toByteArray();
    }

    static void chunk(ByteArrayOutputStream out, String type, byte[] data) {
        byte[] len = new byte[4];
        putInt(len, 0, data.length);
        out.writeBytes(len);
        byte[] t = type.getBytes(StandardCharsets.ISO_8859_1);
        out.writeBytes(t);
        out.writeBytes(data);
        CRC32 crc = new CRC32();
        crc.update(t);
        crc.update(data);
        byte[] c = new byte[4];
        putInt(c, 0, (int) crc.getValue());
        out.writeBytes(c);
    }

    private static void putInt(byte[] b, int off, int v) {
        b[off] = (byte) (v >>> 24);
        b[off + 1] = (byte) (v >>> 16);
        b[off + 2] = (byte) (v >>> 8);
        b[off + 3] = (byte) v;
    }

    public static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] p : parts) out.writeBytes(p);
        return out.toByteArray();
    }

    public static byte[] head(byte[] b, int n) { return java.util.Arrays.copyOf(b, n); }

    public static boolean contains(byte[] haystack, String needle) {
        byte[] n = needle.getBytes(StandardCharsets.ISO_8859_1);
        outer:
        for (int i = 0; i + n.length <= haystack.length; i++) {
            for (int j = 0; j < n.length; j++) if (haystack[i + j] != n[j]) continue outer;
            return true;
        }
        return false;
    }

    /** PNG chunk types present, in order. */
    public static java.util.List<String> pngChunks(byte[] d) {
        java.util.List<String> out = new java.util.ArrayList<>();
        int p = 8;
        while (p + 8 <= d.length) {
            int len = ((d[p] & 0xFF) << 24) | ((d[p + 1] & 0xFF) << 16) | ((d[p + 2] & 0xFF) << 8) | (d[p + 3] & 0xFF);
            out.add(new String(d, p + 4, 4, StandardCharsets.ISO_8859_1));
            p += 12 + len;
        }
        return out;
    }

    /** JPEG with a COM (comment) segment spliced in right after SOI. */
    public static byte[] jpegWithComment(byte[] jpeg, String comment) {
        byte[] text = comment.getBytes(StandardCharsets.ISO_8859_1);
        int len = text.length + 2;
        byte[] seg = new byte[4 + text.length];
        seg[0] = (byte) 0xFF;
        seg[1] = (byte) 0xFE;
        seg[2] = (byte) (len >> 8);
        seg[3] = (byte) len;
        System.arraycopy(text, 0, seg, 4, text.length);
        return concat(head(jpeg, 2), seg, java.util.Arrays.copyOfRange(jpeg, 2, jpeg.length));
    }
}
