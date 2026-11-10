package com.codemastery.media;

import java.awt.RenderingHints;
import java.awt.color.ColorSpace;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.awt.image.Raster;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import javax.imageio.IIOException;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import org.springframework.stereotype.Component;

/**
 * Validates and re-encodes one uploaded image (PLAN.md Step 12, "Formats and pipeline"). Nothing is persisted here.
 *
 * <p>Order: magic-byte sniff, declared type/extension must agree, animated and colour-space checks, reader chosen by the
 * sniffed format, header-only dimension checks with overflow-safe arithmetic, memory budget, bounded decode, orientation,
 * re-encode (PNG when there is alpha, otherwise JPEG), thumbnail. The stored bytes are always our own re-encoding, so source
 * metadata (EXIF/GPS, ICC, XMP) and appended data are not carried over. That is not a claim that the decoder cannot be
 * attacked: it is an attack surface, bounded by the header checks, the memory budget and a pinned dependency.
 */
@Component
public class ImageProcessor {
    enum Format {
        JPEG("image/jpeg", "jpeg", Set.of("jpg", "jpeg")),
        PNG("image/png", "png", Set.of("png")),
        WEBP("image/webp", "webp", Set.of("webp"));

        final String mime, readerName;
        final Set<String> extensions;

        Format(String mime, String readerName, Set<String> extensions) {
            this.mime = mime;
            this.readerName = readerName;
            this.extensions = extensions;
        }
    }

    /** What the byte scan found without decoding anything. */
    private record Scan(int orientation, boolean animated, int jpegComponents, boolean truncated) {}

    private final MediaProperties props;
    private final DecodeBudget budget;

    static {
        ImageIO.setUseCache(false);   // never spill decode buffers to temp files
    }

    public ImageProcessor(MediaProperties props, DecodeBudget budget) {
        this.props = props;
        this.budget = budget;
    }

    public ProcessedImage process(byte[] data, String declaredType, String filename) {
        if (data == null || data.length == 0) throw MediaException.corrupt();
        Format format = sniff(data);
        checkDeclared(format, declaredType, filename);
        Scan scan = scan(format, data);
        if (scan.truncated()) throw MediaException.corrupt();
        if (scan.animated()) throw MediaException.animated();
        if (format == Format.JPEG && scan.jpegComponents() == 4) throw MediaException.colorspace();

        ImageReader reader = pickReader(format);
        try (ImageInputStream in = new MemoryCacheImageInputStream(new ByteArrayInputStream(data))) {
            reader.setInput(in, true, true);
            int w, h;
            try {
                w = reader.getWidth(0);
                h = reader.getHeight(0);
            } catch (IOException | RuntimeException e) {
                throw translate(e);
            }
            // header-only checks, before any raster is allocated; long arithmetic with exact multiplication
            if (w <= 0 || h <= 0) throw MediaException.corrupt();
            if (w > props.maxSide() || h > props.maxSide()) throw MediaException.dimensions("The image is too large (at most " + props.maxSide() + " pixels on a side).");
            long pixels = Math.multiplyExact((long) w, (long) h);
            if (pixels > props.maxPixels()) throw MediaException.dimensions("The image is too large (at most " + props.maxPixels() / 1_000_000 + " megapixels).");

            int sub = format == Format.JPEG ? Math.max(1, Math.max(w, h) / props.originalMaxEdge()) : 1;
            long decodedPixels = sub == 1 ? pixels : Math.multiplyExact((long) ((w + sub - 1) / sub), (long) ((h + sub - 1) / sub));
            int mb = DecodeBudget.mbFor(estimatePeakBytes(reader, w, h, decodedPixels, data.length));
            if (budget.cannotEverFit(mb)) throw MediaException.dimensions("The image is too large to process.");
            return budget.run(mb, props.decodeWait(), () -> decodeAndEncode(reader, sub, scan.orientation()));
        } catch (IOException e) {
            throw MediaException.corrupt();
        } finally {
            reader.dispose();
        }
    }

    // ---- sniffing and metadata scans (pure byte inspection) ----

    static Format sniff(byte[] d) {
        if (d.length >= 3 && (d[0] & 0xFF) == 0xFF && (d[1] & 0xFF) == 0xD8 && (d[2] & 0xFF) == 0xFF) return Format.JPEG;
        if (d.length >= 8 && (d[0] & 0xFF) == 0x89 && d[1] == 'P' && d[2] == 'N' && d[3] == 'G' && d[4] == 0x0D && d[5] == 0x0A && d[6] == 0x1A && d[7] == 0x0A) return Format.PNG;
        if (d.length >= 12 && d[0] == 'R' && d[1] == 'I' && d[2] == 'F' && d[3] == 'F' && d[8] == 'W' && d[9] == 'E' && d[10] == 'B' && d[11] == 'P') return Format.WEBP;
        throw MediaException.unsupported("Only JPEG, PNG and WebP images are accepted.");
    }

    /** The client's claims are never trusted, but a claim that contradicts the bytes is refused. */
    private static void checkDeclared(Format format, String declaredType, String filename) {
        if (declaredType != null) {
            String t = declaredType.toLowerCase(Locale.ROOT);
            int semi = t.indexOf(';');
            if (semi >= 0) t = t.substring(0, semi);
            t = t.trim();
            if (!t.isEmpty() && !t.equals("application/octet-stream") && !t.equals(format.mime)) {
                throw MediaException.unsupported("The file's type does not match its content.");
            }
        }
        if (filename != null) {
            String base = filename.substring(Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\')) + 1);
            int dot = base.lastIndexOf('.');
            if (dot >= 0 && dot < base.length() - 1 && !format.extensions.contains(base.substring(dot + 1).toLowerCase(Locale.ROOT))) {
                throw MediaException.unsupported("The file's extension does not match its content.");
            }
        }
    }

    private static Scan scan(Format f, byte[] d) {
        return switch (f) {
            case JPEG -> scanJpeg(d);
            case PNG -> scanPng(d);
            case WEBP -> scanWebp(d);
        };
    }

    private static Scan scanJpeg(byte[] d) {
        int n = d.length, p = 2, components = -1, orientation = 1;
        boolean sos = false;
        while (p + 4 <= n) {
            if ((d[p] & 0xFF) != 0xFF) break;
            int m = d[p + 1] & 0xFF;
            if (m == 0xFF) { p++; continue; }
            if (m == 0xD8 || m == 0x01 || (m >= 0xD0 && m <= 0xD7)) { p += 2; continue; }
            if (m == 0xD9) break;
            int len = ((d[p + 2] & 0xFF) << 8) | (d[p + 3] & 0xFF);
            if (len < 2 || p + 2 + len > n) break;
            boolean sof = m >= 0xC0 && m <= 0xCF && m != 0xC4 && m != 0xC8 && m != 0xCC;
            if (sof && p + 9 < n) components = d[p + 9] & 0xFF;
            if (m == 0xE1 && len >= 8 && d[p + 4] == 'E' && d[p + 5] == 'x' && d[p + 6] == 'i' && d[p + 7] == 'f') {
                orientation = ExifOrientation.read(d, p + 10, p + 2 + len);
            }
            if (m == 0xDA) { sos = true; p += 2 + len; break; }
            p += 2 + len;
        }
        // Entropy-coded data never contains FF D9 (FF is stuffed), so no EOI after the scan means the file was cut short.
        boolean eoi = false;
        if (sos) {
            for (int i = p; i + 1 < n; i++) {
                if ((d[i] & 0xFF) == 0xFF && (d[i + 1] & 0xFF) == 0xD9) { eoi = true; break; }
            }
        }
        return new Scan(orientation, false, components, !sos || !eoi);
    }

    private static Scan scanPng(byte[] d) {
        int n = d.length, p = 8, orientation = 1;
        boolean animated = false, complete = false;
        // Walk the whole chunk chain up to IEND (cheap: lengths only). A file that ends inside a chunk, or without IEND, was cut short;
        // the JDK reader alone would accept some such files (e.g. one missing only the last bytes of its final IDAT).
        while (p + 8 <= n) {
            long len = ((long) (d[p] & 0xFF) << 24) | ((d[p + 1] & 0xFF) << 16) | ((d[p + 2] & 0xFF) << 8) | (d[p + 3] & 0xFF);
            String type = new String(d, p + 4, 4, StandardCharsets.ISO_8859_1);
            if (len < 0 || p + 12L + len > n) break;
            if (type.equals("acTL")) animated = true;
            if (type.equals("eXIf")) orientation = ExifOrientation.readMaybePrefixed(d, p + 8, p + 8 + (int) len);
            if (type.equals("IEND")) { complete = true; break; }
            p += 12 + (int) len;
        }
        return new Scan(orientation, animated, -1, !complete);
    }

    private static Scan scanWebp(byte[] d) {
        int n = d.length;
        long riff = le32(d, 4);
        if (riff < 4 || 8 + riff > n) return new Scan(1, false, -1, true);   // declared length runs past the data: cut short
        int end = (int) (8 + riff), p = 12, orientation = 1;
        boolean animated = false, image = false;
        while (p + 8 <= end) {
            String type = new String(d, p, 4, StandardCharsets.ISO_8859_1);
            long size = le32(d, p + 4);
            if (p + 8 + size > end) return new Scan(1, false, -1, true);
            int body = p + 8;
            switch (type) {
                case "VP8X" -> { if (size >= 1 && (d[body] & 0x02) != 0) animated = true; image = true; }
                case "ANIM", "ANMF" -> animated = true;
                case "EXIF" -> orientation = ExifOrientation.readMaybePrefixed(d, body, (int) (body + size));
                case "VP8 ", "VP8L" -> image = true;
                default -> { }
            }
            p = (int) (body + size + (size & 1));
        }
        return new Scan(orientation, animated, -1, !image);
    }

    private static long le32(byte[] d, int p) {
        return (d[p] & 0xFFL) | ((d[p + 1] & 0xFFL) << 8) | ((d[p + 2] & 0xFFL) << 16) | ((d[p + 3] & 0xFFL) << 24);
    }

    // ---- decode and encode ----

    private ImageReader pickReader(Format f) {
        Iterator<ImageReader> it = ImageIO.getImageReadersByFormatName(f.readerName);
        if (!it.hasNext()) {
            if (f == Format.WEBP) throw new IllegalStateException("No WebP ImageIO reader on the classpath (imageio-webp missing)");
            throw MediaException.unsupported("This image format cannot be processed.");
        }
        return it.next();
    }

    /** Fixed allowance for codec internals (native libjpeg buffers, inflater windows, ImageIO bookkeeping) that we cannot measure per image. */
    private static final long CODEC_ALLOWANCE = 4L << 20;

    /**
     * Peak heap this decode can need, in bytes. Two phases, and the larger counts:
     * <ol>
     *   <li><b>Decode + convert:</b> the reader's raster ({@code rawBytesPerPixel} x decoded pixels: 1 for palette/grey, 3-4 for 8-bit colour,
     *       up to 8 for 16-bit RGBA) and the 4-byte-per-pixel INT_RGB/INT_ARGB image built from it in the same pass that applies EXIF
     *       orientation. Both are alive at once. The first scaling step (full image + its half-size copy = 5 bytes per pixel) never
     *       exceeds this, because the raw raster is at least 1 byte per pixel.</li>
     *   <li><b>Scale + encode:</b> the capped original and the thumbnail as rasters (4 bytes per pixel) plus worst-case encoder buffers
     *       (output stream growth and the final copy, 8 bytes per pixel for an incompressible PNG): 12 bytes per output pixel.</li>
     * </ol>
     * Plus the input held while decoding (the uploaded bytes and the ImageIO stream's cache of them, 2x) and a fixed codec allowance.
     * Not covered: allocations inside native decoders beyond that allowance; the budget is capped at 25% of the heap to leave room.
     */
    private long estimatePeakBytes(ImageReader reader, int w, int h, long decodedPixels, int inputBytes) {
        long phase1 = Math.multiplyExact(decodedPixels, rawBytesPerPixel(reader) + 4L);
        int[] capped = fit(w, h, props.originalMaxEdge());
        int[] thumb = fit(capped[0], capped[1], props.thumbMaxEdge());
        long outPixels = (long) capped[0] * capped[1] + (long) thumb[0] * thumb[1];
        long phase2 = Math.multiplyExact(outPixels, 12L);
        return Math.max(phase1, phase2) + 2L * inputBytes + CODEC_ALLOWANCE;
    }

    /** Bytes per pixel of the raster this reader produces, from the header. An unknown layout is assumed to be a common 4-byte one. */
    private static long rawBytesPerPixel(ImageReader reader) {
        try {
            javax.imageio.ImageTypeSpecifier t = reader.getRawImageType(0);
            if (t != null) {
                java.awt.image.SampleModel sm = t.getSampleModel();
                long bytes = (long) sm.getNumDataElements() * (java.awt.image.DataBuffer.getDataTypeSize(sm.getDataType()) / 8);
                return Math.max(1, bytes);
            }
        } catch (IOException | RuntimeException ignored) {
            // fall through to the default
        }
        return 4;
    }

    static int[] fit(int w, int h, int maxEdge) {
        int edge = Math.max(w, h);
        if (edge <= maxEdge) return new int[] {w, h};
        double f = (double) maxEdge / edge;
        return new int[] {Math.max(1, (int) Math.round(w * f)), Math.max(1, (int) Math.round(h * f))};
    }

    private ProcessedImage decodeAndEncode(ImageReader reader, int subsample, int orientation) {
        BufferedImage decoded;
        try {
            ImageReadParam param = reader.getDefaultReadParam();
            if (subsample > 1) param.setSourceSubsampling(subsample, subsample, 0, 0);
            decoded = reader.read(0, param);
        } catch (IOException | RuntimeException e) {
            throw translate(e);
        }
        if (decoded == null) throw MediaException.corrupt();
        boolean alpha = decoded.getColorModel().hasAlpha();
        BufferedImage std = standardize(decoded, alpha, orientation);   // the only place the decoded raster and its converted copy coexist
        decoded = null;
        BufferedImage original = scaleToFit(std, props.originalMaxEdge(), alpha);
        std = null;
        BufferedImage thumb = scaleToFit(original, props.thumbMaxEdge(), alpha);

        String type = alpha ? "image/png" : "image/jpeg";
        byte[] originalBytes = encode(original, alpha);
        byte[] thumbBytes = encode(thumb, alpha);
        return new ProcessedImage(type, originalBytes, original.getWidth(), original.getHeight(), sha256(originalBytes),
                thumbBytes, thumb.getWidth(), thumb.getHeight(), sha256(thumbBytes));
    }

    private static MediaException translate(Exception e) {
        String msg = String.valueOf(e.getMessage());
        if (e instanceof IIOException && msg.contains("Unsupported Image Type")) return MediaException.colorspace();
        return MediaException.corrupt();
    }

    /**
     * One pass into a plain INT_RGB / INT_ARGB image: colour conversion and EXIF orientation together, so only the decoded raster and
     * this result are ever alive at once. Grey + alpha is converted sample by sample: Java2D's gamma handling for a two-band grey
     * raster brightens it (a stored 90 comes out as 160, see ImageProcessorTest). One-band grey (8/16-bit PNG, JPEG) keeps its values
     * through a normal draw, so it needs no special case.
     */
    static BufferedImage standardize(BufferedImage src, boolean alpha, int orientation) {
        int w = src.getWidth(), h = src.getHeight();
        boolean valid = orientation >= 2 && orientation <= 8;
        boolean swap = valid && orientation >= 5;
        BufferedImage out = new BufferedImage(swap ? h : w, swap ? w : h, alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        if (alpha && src.getColorModel().getColorSpace().getType() == ColorSpace.TYPE_GRAY && src.getRaster().getNumBands() == 2) {
            greyAlpha(src, out, valid ? orientation : 1);
            return out;
        }
        java.awt.Graphics2D g = out.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);   // exact pixel moves
            g.drawImage(src, valid ? orientationTransform(orientation, w, h) : new AffineTransform(), null);
        } finally {
            g.dispose();
        }
        return out;
    }

    private static AffineTransform orientationTransform(int o, int w, int h) {
        return switch (o) {
            case 2 -> new AffineTransform(-1, 0, 0, 1, w, 0);
            case 3 -> new AffineTransform(-1, 0, 0, -1, w, h);
            case 4 -> new AffineTransform(1, 0, 0, -1, 0, h);
            case 5 -> new AffineTransform(0, 1, 1, 0, 0, 0);
            case 6 -> new AffineTransform(0, 1, -1, 0, h, 0);
            case 7 -> new AffineTransform(0, -1, -1, 0, h, w);
            default -> new AffineTransform(0, -1, 1, 0, 0, w);
        };
    }

    private static void greyAlpha(BufferedImage src, BufferedImage out, int o) {
        Raster r = src.getRaster();
        int w = src.getWidth(), h = src.getHeight();
        int shift = r.getDataBuffer().getDataType() == java.awt.image.DataBuffer.TYPE_USHORT ? 8 : 0;
        int[] grey = new int[w], alpha = new int[w], row = new int[w];
        for (int y = 0; y < h; y++) {
            r.getSamples(0, y, w, 1, 0, grey);
            r.getSamples(0, y, w, 1, 1, alpha);
            for (int x = 0; x < w; x++) {
                int g = Math.min(255, grey[x] >> shift), a = Math.min(255, alpha[x] >> shift);
                row[x] = (a << 24) | (g << 16) | (g << 8) | g;
            }
            if (o == 1) {
                out.setRGB(0, y, w, 1, row, 0, w);
            } else {
                for (int x = 0; x < w; x++) {   // same pixel mapping as orientationTransform, in integer form
                    int dx, dy;
                    switch (o) {
                        case 2 -> { dx = w - 1 - x; dy = y; }
                        case 3 -> { dx = w - 1 - x; dy = h - 1 - y; }
                        case 4 -> { dx = x; dy = h - 1 - y; }
                        case 5 -> { dx = y; dy = x; }
                        case 6 -> { dx = h - 1 - y; dy = x; }
                        case 7 -> { dx = h - 1 - y; dy = w - 1 - x; }
                        default -> { dx = y; dy = w - 1 - x; }
                    }
                    out.setRGB(dx, dy, row[x]);
                }
            }
        }
    }

    static BufferedImage scaleToFit(BufferedImage src, int maxEdge, boolean alpha) {
        int w = src.getWidth(), h = src.getHeight();
        int edge = Math.max(w, h);
        if (edge <= maxEdge) return src;
        double f = (double) maxEdge / edge;
        int tw = Math.max(1, (int) Math.round(w * f)), th = Math.max(1, (int) Math.round(h * f));
        BufferedImage cur = src;
        while (cur.getWidth() / 2 >= tw && cur.getHeight() / 2 >= th) {   // halve while far larger: much better quality than one big step
            cur = resize(cur, cur.getWidth() / 2, cur.getHeight() / 2, alpha, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        }
        return resize(cur, tw, th, alpha, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
    }

    private static BufferedImage resize(BufferedImage src, int w, int h, boolean alpha, Object interpolation) {
        BufferedImage out = new BufferedImage(w, h, alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        java.awt.Graphics2D g = out.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, interpolation);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.drawImage(src, 0, 0, w, h, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    private byte[] encode(BufferedImage img, boolean png) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            if (png) {
                if (!ImageIO.write(img, "png", out)) throw new IllegalStateException("no PNG writer");
            } else {
                ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
                try (MemoryCacheImageOutputStream ios = new MemoryCacheImageOutputStream(out)) {
                    ImageWriteParam p = writer.getDefaultWriteParam();
                    p.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                    p.setCompressionQuality(props.jpegQuality() / 100f);
                    writer.setOutput(ios);
                    writer.write(null, new IIOImage(img, null, null), p);   // no metadata passed in: nothing from the source is written
                } finally {
                    writer.dispose();
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("encoding failed", e);
        }
        return out.toByteArray();
    }

    static String sha256(byte[] b) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
