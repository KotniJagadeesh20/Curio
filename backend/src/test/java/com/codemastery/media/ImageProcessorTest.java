package com.codemastery.media;

import static com.codemastery.media.MediaFixtures.*;
import static org.junit.jupiter.api.Assertions.*;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.util.List;
import java.util.Set;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

/** The upload pipeline without Spring: every hostile and every accepted shape named in PLAN.md Step 12. */
class ImageProcessorTest {
    private final ImageProcessor p = processor();

    private static MediaException refused(Runnable r) {
        return assertThrows(MediaException.class, r::run);
    }

    private static BufferedImage decode(byte[] b) throws Exception {
        return ImageIO.read(new ByteArrayInputStream(b));
    }

    // ---- accepted formats ----

    @Test
    void jpegBecomesJpegAndKeepsItsSize() throws Exception {
        ProcessedImage r = p.process(resource("plain.jpg"), "image/jpeg", "photo.jpg");
        assertEquals("image/jpeg", r.contentType());
        assertEquals(64, r.width());
        assertEquals(48, r.height());
        BufferedImage out = decode(r.original());
        assertEquals(64, out.getWidth());
        assertEquals(48, out.getHeight());
    }

    @Test
    void progressiveAndGrayJpegsAreAccepted() {
        assertEquals("image/jpeg", p.process(resource("progressive.jpg"), "image/jpeg", "a.jpeg").contentType());
        assertEquals("image/jpeg", p.process(resource("gray.jpg"), "image/jpeg", "g.jpg").contentType());
    }

    @Test
    void grayJpegKeepsItsBrightness() throws Exception {
        BufferedImage src = decode(resource("gray.jpg"));
        BufferedImage out = decode(p.process(resource("gray.jpg"), "image/jpeg", "g.jpg").original());
        for (int x : new int[] {5, 20, 50}) {
            int expected = src.getRaster().getSample(x, 10, 0);
            int actual = out.getRGB(x, 10) & 0xFF;
            assertTrue(Math.abs(expected - actual) <= 8, "gray " + expected + " vs " + actual + " at x=" + x + ": a gamma shift would be far larger");
        }
    }

    /** Mean absolute difference between our output and the source's own grey samples (source decoded by ImageIO, 16-bit scaled to 8). */
    private double greyError(String fixture, String type) throws Exception {
        BufferedImage src = decode(resource(fixture));
        BufferedImage out = decode(p.process(resource(fixture), type, fixture).original());
        int shift = src.getRaster().getDataBuffer().getDataType() == java.awt.image.DataBuffer.TYPE_USHORT ? 8 : 0;
        double sum = 0;
        int n = 0;
        for (int y = 0; y < src.getHeight(); y += 3) for (int x = 16; x < src.getWidth(); x += 3) {   // x >= 16: past the transparent strip of gray-alpha.png
            int expected = src.getRaster().getSample(x, y, 0) >> shift;
            int px = out.getRGB(x, y);
            int r = (px >> 16) & 0xFF, g = (px >> 8) & 0xFF, b = px & 0xFF;
            assertTrue(Math.abs(r - g) <= 2 && Math.abs(g - b) <= 2, "grey stays grey");
            sum += Math.abs(expected - g);
            n++;
        }
        return sum / n;
    }

    @Test
    void everyGreyFlavourKeepsItsBrightness() throws Exception {
        assertTrue(greyError("gray8.png", "image/png") < 1.5, "8-bit grey PNG (stored as JPEG, so a little lossy)");
        assertTrue(greyError("gray16.png", "image/png") < 1.5, "16-bit grey PNG");
        assertTrue(greyError("gray-gradient.jpg", "image/jpeg") < 3.0, "grey JPEG with a full tonal range");
        assertTrue(greyError("gray-alpha.png", "image/png") < 1.5, "grey + alpha PNG stays PNG");
        assertEquals("image/png", p.process(resource("gray-alpha.png"), "image/png", "a.png").contentType());
    }

    @Test
    void pngWithoutAlphaBecomesJpegAndWithAlphaStaysPng() throws Exception {
        assertEquals("image/jpeg", p.process(resource("plain.png"), "image/png", "a.png").contentType());
        assertEquals("image/jpeg", p.process(resource("palette.png"), "image/png", "p.png").contentType());
        ProcessedImage r = p.process(resource("alpha.png"), "image/png", "a.png");
        assertEquals("image/png", r.contentType());
        assertTrue(decode(r.original()).getColorModel().hasAlpha());
    }

    @Test
    void everyWebpVariantDecodes() throws Exception {
        for (String f : List.of("lossy.webp", "lossless.webp", "lossy-exif.webp")) {
            ProcessedImage r = p.process(resource(f), "image/webp", f);
            assertEquals("image/jpeg", r.contentType(), f);
            assertEquals(64, r.width(), f);
            assertEquals(48, r.height(), f);
        }
        for (String f : List.of("lossy-alpha.webp", "lossless-alpha.webp")) {
            ProcessedImage r = p.process(resource(f), "image/webp", f);
            assertEquals("image/png", r.contentType(), f);
            BufferedImage out = decode(r.original());
            assertTrue(out.getColorModel().hasAlpha(), f);
            assertTrue((out.getRGB(0, 0) >>> 24) < 16, f + ": the transparent corner must stay transparent");
            assertEquals(255, out.getRGB(32, 24) >>> 24, f + ": the opaque centre must stay opaque");
        }
    }

    // ---- rejections ----

    @Test
    void animatedWebpAndApngAreRejectedNotFlattened() {
        assertEquals("MEDIA_ANIMATED", refused(() -> p.process(resource("animated.webp"), "image/webp", "a.webp")).code());
        assertEquals("MEDIA_ANIMATED", refused(() -> p.process(resource("animated.apng"), "image/png", "a.png")).code());
    }

    @Test
    void eitherAnimationSignalAloneIsEnoughToRejectAWebp() {
        byte[] still = resource("lossy-exif.webp");   // VP8X file, animation flag clear
        assertEquals(0, still[20] & 0x02, "fixture sanity: flag clear");
        byte[] flagOnly = still.clone();
        flagOnly[20] |= 0x02;   // the VP8X animation flag with no ANIM/ANMF chunk
        assertEquals("MEDIA_ANIMATED", refused(() -> p.process(flagOnly, "image/webp", "a.webp")).code());

        byte[] anim = {'A', 'N', 'I', 'M', 6, 0, 0, 0, 0, 0, 0, 0, 0, 0};   // an ANIM chunk with the flag clear
        byte[] chunkOnly = concat(still, anim);
        long riff = (still[4] & 0xFFL) | ((still[5] & 0xFFL) << 8) | ((still[6] & 0xFFL) << 16) | ((still[7] & 0xFFL) << 24);
        riff += anim.length;
        for (int i = 0; i < 4; i++) chunkOnly[4 + i] = (byte) (riff >> (8 * i));
        assertEquals("MEDIA_ANIMATED", refused(() -> p.process(chunkOnly, "image/webp", "a.webp")).code());
    }

    @Test
    void cmykJpegHasItsOwnStableCode() {
        MediaException e = refused(() -> p.process(resource("cmyk.jpg"), "image/jpeg", "print.jpg"));
        assertEquals("MEDIA_COLORSPACE_UNSUPPORTED", e.code());
        assertEquals(422, e.status().value());
    }

    @Test
    void typesWeDoNotAcceptAreRefusedByContentNotByName() {
        byte[] gif = "GIF89a\u0001\u0000\u0001\u0000".getBytes(java.nio.charset.StandardCharsets.ISO_8859_1);
        assertEquals("MEDIA_TYPE_UNSUPPORTED", refused(() -> p.process(gif, "image/gif", "a.gif")).code());
        byte[] svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>".getBytes();
        assertEquals("MEDIA_TYPE_UNSUPPORTED", refused(() -> p.process(svg, "image/png", "logo.png")).code());   // SVG dressed up as PNG
        assertEquals("MEDIA_TYPE_UNSUPPORTED", refused(() -> p.process("<html></html>".getBytes(), "image/jpeg", "x.jpg")).code());
        assertEquals("MEDIA_TYPE_UNSUPPORTED", refused(() -> p.process(new byte[] {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13}, null, null)).code());
    }

    @Test
    void aClaimThatContradictsTheBytesIsRefused() {
        assertEquals("MEDIA_TYPE_UNSUPPORTED", refused(() -> p.process(resource("plain.jpg"), "image/png", "a.jpg")).code());   // wrong MIME
        assertEquals("MEDIA_TYPE_UNSUPPORTED", refused(() -> p.process(resource("plain.jpg"), "image/jpeg", "a.png")).code());  // wrong extension
        assertEquals("MEDIA_TYPE_UNSUPPORTED", refused(() -> p.process(resource("lossy.webp"), "image/jpeg", "a.webp")).code());
        // claims the pipeline doesn't rely on may be missing, the bytes decide
        assertEquals("image/jpeg", p.process(resource("plain.jpg"), null, null).contentType());
        assertEquals("image/jpeg", p.process(resource("plain.jpg"), "application/octet-stream", "noext").contentType());
        assertEquals("image/jpeg", p.process(resource("plain.jpg"), "IMAGE/JPEG; charset=binary", "C:\\fakepath\\A.JPG").contentType());
    }

    @Test
    void emptyAndTruncatedFilesAreCorrupt() {
        assertEquals("MEDIA_CORRUPT", refused(() -> p.process(new byte[0], "image/jpeg", "a.jpg")).code());
        byte[] jpg = resource("plain.jpg"), png = resource("plain.png"), webp = resource("lossy.webp");
        assertEquals("MEDIA_CORRUPT", refused(() -> p.process(head(jpg, jpg.length / 2), "image/jpeg", "a.jpg")).code());
        assertEquals("MEDIA_CORRUPT", refused(() -> p.process(head(png, png.length / 2), "image/png", "a.png")).code());
        assertEquals("MEDIA_CORRUPT", refused(() -> p.process(head(webp, webp.length / 2), "image/webp", "a.webp")).code());
        assertEquals("MEDIA_CORRUPT", refused(() -> p.process(head(jpg, 3), "image/jpeg", "a.jpg")).code());
        byte[] garbled = jpg.clone();
        for (int i = 200; i < 260; i++) garbled[i] = (byte) 0x55;
        // a damaged but complete JPEG may decode with artefacts or fail; it must never escape as anything but an image or MEDIA_CORRUPT
        try {
            assertNotNull(p.process(garbled, "image/jpeg", "a.jpg"));
        } catch (MediaException e) {
            assertEquals("MEDIA_CORRUPT", e.code());
        }
    }

    @Test
    void noTruncationOfAnyFormatIsEverAcceptedAsAnImage() {
        // Every cut point of every small fixture: any proper prefix is refused, never half-decoded
        for (String f : List.of("plain.jpg", "progressive.jpg", "gray.jpg", "lossy.webp", "lossless.webp", "lossy-alpha.webp", "lossless-alpha.webp", "lossy-exif.webp", "plain.png", "alpha.png")) {
            byte[] full = resource(f);
            int mustFailBelow = full.length;   // every proper prefix, including one that only lost the end marker (EOI / IEND / last RIFF byte)
            String type = f.endsWith(".jpg") ? "image/jpeg" : f.endsWith(".png") ? "image/png" : "image/webp";
            for (int cut = 0; cut < mustFailBelow; cut++) {
                byte[] part = head(full, cut);
                int c = cut;
                MediaException e = assertThrows(MediaException.class, () -> p.process(part, type, f), f + " cut at " + c + " of " + full.length + " must be refused");
                assertTrue(Set.of("MEDIA_CORRUPT", "MEDIA_TYPE_UNSUPPORTED").contains(e.code()), f + " cut " + c + ": " + e.code());
            }
        }
    }

    @Test
    void pixelBombHeadersAreRefusedBeforeAnyDecode() {
        assertEquals("MEDIA_DIMENSIONS", refused(() -> p.process(pngHeaderOnly(20_000, 20_000), "image/png", "bomb.png")).code());   // 400 MP
        assertEquals("MEDIA_DIMENSIONS", refused(() -> p.process(pngHeaderOnly(5_001, 5_000), "image/png", "bomb.png")).code());     // 25.005 MP, just over
        assertEquals("MEDIA_DIMENSIONS", refused(() -> p.process(pngHeaderOnly(20_001, 1), "image/png", "wide.png")).code());       // one side over
        assertEquals("MEDIA_DIMENSIONS", refused(() -> p.process(pngHeaderOnly(Integer.MAX_VALUE, Integer.MAX_VALUE), "image/png", "x.png")).code());   // would overflow int/long math if unchecked
        // exactly at the limit passes the size checks (the junk pixel data then fails as corrupt, not as DIMENSIONS)
        assertEquals("MEDIA_CORRUPT", refused(() -> p.process(pngHeaderOnly(5_000, 5_000), "image/png", "edge.png")).code());
        assertEquals("MEDIA_CORRUPT", refused(() -> p.process(pngHeaderOnly(20_000, 1), "image/png", "edge.png")).code());
    }

    @Test
    void anImageThatCanNeverFitTheMemoryBudgetIsRefused() {
        ImageProcessor tiny = new ImageProcessor(props(6), new DecodeBudget(6, Long.MAX_VALUE));   // 6 MB: the 4 MB codec allowance plus a little
        assertNotNull(tiny.process(png(64, 48, false), "image/png", "a.png"));
        assertEquals("MEDIA_DIMENSIONS", refused(() -> tiny.process(png(1000, 1000, false), "image/png", "big.png")).code());
    }

    // ---- what is (not) stored ----

    @Test
    void appendedPayloadsDoNotSurviveReencoding() {
        byte[] payload = "<?php system($_GET['c']); ?>".getBytes();
        for (byte[] polyglot : List.of(concat(resource("plain.jpg"), payload), concat(resource("plain.png"), payload), concat(resource("lossy.webp"), payload))) {
            ProcessedImage r = p.process(polyglot, null, null);
            assertFalse(contains(r.original(), "<?php"));
            assertFalse(contains(r.thumb(), "<?php"));
        }
    }

    @Test
    void exifGpsIccAndCommentsAreNotCarriedOver() throws Exception {
        byte[] src = resource("exif-gps-rot6.jpg");
        assertTrue(contains(src, "SECRET-MAKE"), "fixture sanity");
        ProcessedImage r = p.process(jpegWithComment(src, "SECRET-COMMENT"), "image/jpeg", "a.jpg");
        for (byte[] out : List.of(r.original(), r.thumb())) {
            assertFalse(contains(out, "SECRET"), "metadata text must be gone");
            assertFalse(contains(out, "Exif"), "no EXIF segment");
            assertFalse(contains(out, "GPS"));
        }
        ProcessedImage w = p.process(resource("lossy-exif.webp"), "image/webp", "a.webp");
        assertFalse(contains(w.original(), "SECRET"));
        assertFalse(contains(w.original(), "Exif"));
        ProcessedImage a = p.process(resource("alpha.png"), "image/png", "a.png");
        Set<String> allowed = Set.of("IHDR", "IDAT", "IEND", "pHYs", "sRGB", "gAMA");
        for (String c : pngChunks(a.original())) assertTrue(allowed.contains(c), "unexpected PNG chunk " + c);
        for (String c : pngChunks(a.thumb())) assertTrue(allowed.contains(c), "unexpected PNG chunk " + c);
    }

    @Test
    void outputTypeIsOurOwnNeverTheClients() {
        assertEquals("image/jpeg", p.process(resource("lossless.webp"), "image/webp", "a.webp").contentType());
        assertEquals("image/png", p.process(resource("lossless-alpha.webp"), "image/webp", "a.webp").contentType());
    }

    @Test
    void checksumsDescribeTheStoredBytes() {
        ProcessedImage r = p.process(jpeg(1600, 900), "image/jpeg", "a.jpg");
        assertEquals(ImageProcessor.sha256(r.original()), r.sha256());
        assertEquals(ImageProcessor.sha256(r.thumb()), r.thumbSha256());
        assertNotEquals(r.sha256(), r.thumbSha256(), "the thumbnail is its own object with its own hash/ETag");
        // an image already smaller than the thumbnail size has identical bytes in both variants, and then identical hashes
        ProcessedImage small = p.process(resource("plain.jpg"), "image/jpeg", "a.jpg");
        assertEquals(ImageProcessor.sha256(small.thumb()), small.thumbSha256());
    }

    // ---- orientation, caps, thumbnails ----

    @Test
    void exifOrientationIsAppliedThenDropped() throws Exception {
        ProcessedImage r = p.process(resource("exif-gps-rot6.jpg"), "image/jpeg", "a.jpg");   // stored 64x48, orientation 6 (90 degrees clockwise)
        assertEquals(48, r.width());
        assertEquals(64, r.height());
        BufferedImage out = decode(r.original());
        // the red square sat top-left in the stored pixels; rotated clockwise it is top-right
        int topRight = out.getRGB(48 - 20, 20), topLeft = out.getRGB(10, 20);
        assertTrue(((topRight >> 16) & 0xFF) > 180 && ((topRight >> 8) & 0xFF) < 90, "red square should now be top-right");
        assertFalse(((topLeft >> 16) & 0xFF) > 180 && ((topLeft >> 8) & 0xFF) < 90, "and no longer top-left");
        assertEquals(48, r.thumbWidth());
        assertEquals(64, r.thumbHeight());
    }

    @Test
    void largeImagesAreCappedAndGetAThumbnail() throws Exception {
        ProcessedImage r = p.process(jpeg(3000, 2000), "image/jpeg", "a.jpg");
        assertEquals(2560, r.width());
        assertEquals(1707, r.height());
        assertEquals(640, r.thumbWidth());
        assertEquals(427, r.thumbHeight());
        assertEquals(2560, decode(r.original()).getWidth());
        assertEquals(640, decode(r.thumb()).getWidth());
    }

    @Test
    void veryLargeJpegIsDecodedSubsampledAndStillEndsUpWithinTheCap() {
        ProcessedImage r = p.process(jpeg(5200, 3000), "image/jpeg", "a.jpg");   // 15.6 MP: decoded at 1/2 size, then scaled
        assertEquals(2560, r.width());
        assertEquals(1477, r.height());
        assertEquals(640, r.thumbWidth());
        assertEquals(369, r.thumbHeight());
    }

    @Test
    void subsamplingKeepsALargeJpegWithinAMemoryBudgetItCouldNotOtherwiseMeet() {
        // 15.6 MP decoded in full needs ~110 MB (raster + converted copy); decoded at half size ~53 MB (the scale/encode phase dominates)
        DecodeBudget limitedBudget = new DecodeBudget(64, Long.MAX_VALUE);
        ImageProcessor limited = new ImageProcessor(props(64), limitedBudget);
        assertEquals(2560, limited.process(jpeg(5200, 3000), "image/jpeg", "a.jpg").width());
        assertTrue(limitedBudget.peakUsedMb() >= 50, "here the scale-and-encode phase (about 4 MP of output x 12 bytes) is the larger one: reserved " + limitedBudget.peakUsedMb() + " MB");
        // PNG is not subsampled, so the same pixel count does not fit
        assertEquals("MEDIA_DIMENSIONS", refused(() -> limited.process(png(5200, 3000, false), "image/png", "a.png")).code());
    }

    @Test
    void greyPlusAlphaKeepsItsBrightnessAtEightAndSixteenBits() throws Exception {
        for (int depth : new int[] {8, 16}) {
            ProcessedImage r = p.process(pngRamp(64, 48, depth, false, 1), "image/png", "g.png");
            assertEquals("image/png", r.contentType());
            BufferedImage out = decode(r.original());
            for (int y = 0; y < 48; y += 2) for (int x = 0; x < 64; x++) {
                int px = out.getRGB(x, y);
                if (x < 8) { assertEquals(0, px >>> 24, depth + "-bit transparent strip"); continue; }
                assertEquals(255, px >>> 24);
                assertEquals(rampValue(x, y), (px >> 8) & 0xFF, depth + "-bit grey+alpha value at " + x + "," + y + " (Java2D's own conversion would brighten it)");
            }
        }
    }

    @Test
    void greyPlusAlphaIsOrientedExactlyLikeColourImages() throws Exception {
        for (int o = 1; o <= 8; o++) {
            BufferedImage grey = decode(p.process(pngRamp(64, 48, 8, false, o), "image/png", "g.png").original());   // sample-by-sample path
            BufferedImage rgba = decode(p.process(pngRamp(64, 48, 8, true, o), "image/png", "c.png").original());    // Java2D transform path
            assertEquals(o >= 5 ? 48 : 64, grey.getWidth(), "orientation " + o);
            assertEquals(o >= 5 ? 64 : 48, grey.getHeight(), "orientation " + o);
            assertEquals(rgba.getWidth(), grey.getWidth());
            assertEquals(rgba.getHeight(), grey.getHeight());
            for (int y = 0; y < grey.getHeight(); y++) for (int x = 0; x < grey.getWidth(); x++) {
                int a = grey.getRGB(x, y), b = rgba.getRGB(x, y);
                assertEquals(b >>> 24, a >>> 24, "alpha at " + x + "," + y + " orientation " + o);
                if ((a >>> 24) > 0) assertEquals(b, a, "pixel at " + x + "," + y + " orientation " + o);
            }
        }
        // and the mapping itself, stated independently: orientation 6 puts source pixel (x, y) at (h-1-y, x)
        BufferedImage six = decode(p.process(pngRamp(64, 48, 8, false, 6), "image/png", "g.png").original());
        for (int y = 0; y < 48; y += 5) for (int x = 8; x < 64; x += 5) assertEquals(rampValue(x, y), (six.getRGB(47 - y, x) >> 8) & 0xFF);
    }

    @Test
    void greyJpegWithOrientationKeepsBrightnessAndIsRotated() throws Exception {
        BufferedImage src = decode(resource("gray-rot6.jpg"));
        ProcessedImage r = p.process(resource("gray-rot6.jpg"), "image/jpeg", "g.jpg");
        assertEquals(48, r.width());
        assertEquals(64, r.height());
        BufferedImage out = decode(r.original());
        int checked = 0;
        for (int y = 2; y < 46; y += 3) for (int x = 2; x < 62; x += 3) {
            // the ramp wraps every 256; JPEG is lossy at such a cliff, so only compare pixels whose neighbourhood doesn't cross one
            int band = (x * 4 + y) / 256;
            if (((x - 2) * 4 + y - 2) / 256 != band || ((x + 2) * 4 + y + 2) / 256 != band) continue;
            checked++;
            int expected = src.getRaster().getSample(x, y, 0);
            assertTrue(Math.abs(expected - ((out.getRGB(47 - y, x) >> 8) & 0xFF)) <= 10, "pixel " + x + "," + y);   // two lossy JPEG generations; a wrong mapping would be off by 100+
        }
        assertTrue(checked > 100, "enough pixels compared: " + checked);
    }

    @Test
    void theBudgetReservesThePeakOfTheWorstCaseAndGivesItBack() {
        DecodeBudget b = new DecodeBudget(256, Long.MAX_VALUE);
        ImageProcessor ip = new ImageProcessor(props(256), b);
        byte[] rgb8 = pngHeaderOnly(5000, 5000, 8, 2);   // 25 MP, 3-byte raster; junk pixels, so the decode fails after the budget was taken
        assertEquals("MEDIA_CORRUPT", refused(() -> ip.process(rgb8, "image/png", "a.png")).code());
        // phase 1 (raster 3 + converted copy 4 = 7 bytes per pixel) dominates phase 2 (6.96 MP x 12), plus 2x input and the 4 MiB codec allowance
        assertEquals(DecodeBudget.mbFor(25_000_000L * 7 + 2L * rgb8.length + (4L << 20)), b.peakUsedMb(), "25 MP 8-bit RGB PNG");
        assertEquals(256, b.available(), "released on the failure path");

        DecodeBudget b16 = new DecodeBudget(256, Long.MAX_VALUE);
        ImageProcessor ip16 = new ImageProcessor(props(256), b16);
        byte[] rgb16 = pngHeaderOnly(5000, 5000, 16, 2);   // 6-byte raster: 10 bytes per pixel, still fits
        assertEquals("MEDIA_CORRUPT", refused(() -> ip16.process(rgb16, "image/png", "a.png")).code());
        assertEquals(DecodeBudget.mbFor(25_000_000L * 10 + 2L * rgb16.length + (4L << 20)), b16.peakUsedMb(), "25 MP 16-bit RGB PNG");
        // 16-bit RGBA: 8-byte raster + 4 = 12 bytes per pixel = 300 MB, which can never fit a 256 MB budget: refused up front, nothing acquired
        assertEquals("MEDIA_DIMENSIONS", refused(() -> ip16.process(pngHeaderOnly(5000, 5000, 16, 6), "image/png", "a.png")).code());
        assertEquals(256, b16.available());
        // a real image reserves less than its own raster-plus-copy would suggest when it is small, never less than the codec allowance
        DecodeBudget small = new DecodeBudget(256, Long.MAX_VALUE);
        new ImageProcessor(props(256), small).process(resource("plain.png"), "image/png", "a.png");
        assertTrue(small.peakUsedMb() >= 4 && small.peakUsedMb() <= 5, "tiny image: about the codec allowance, got " + small.peakUsedMb());
    }

    @Test
    void theEstimateCountsTheUploadedBytesHeldWhileDecoding() {
        byte[] noisy = noiseJpeg(1500, 1000, 5);   // incompressible: a multi-MB input, so the 2x input term is visible in whole MB
        assertTrue(noisy.length > 800_000, "fixture sanity: " + noisy.length);
        DecodeBudget b = new DecodeBudget(256, Long.MAX_VALUE);
        new ImageProcessor(props(256), b).process(noisy, "image/jpeg", "a.jpg");
        long phase1 = 1_500_000L * (3 + 4);                       // 3-byte JPEG raster + converted copy
        long phase2 = (1_500_000L + 640L * 427L) * 12L;           // capped original (not capped: under 2560) + thumbnail, raster + encoder buffers
        assertEquals(DecodeBudget.mbFor(Math.max(phase1, phase2) + 2L * noisy.length + (4L << 20)), b.peakUsedMb());
    }

    @Test
    void concurrentDecodesNeverHoldMoreThanTheBudgetAndEveryPathReleasesIt() throws Exception {
        byte[] img = png(1500, 1000, false);
        DecodeBudget solo = new DecodeBudget(256, Long.MAX_VALUE);
        new ImageProcessor(props(256), solo).process(img, "image/png", "a.png");
        int one = solo.peakUsedMb();
        assertTrue(one > 20 && one < 40, "one 1.5 MP decode reserves " + one + " MB");

        int budgetMb = one + one / 2;   // room for one decode, not for two
        DecodeBudget b = new DecodeBudget(budgetMb, Long.MAX_VALUE);
        ImageProcessor ip = new ImageProcessor(new MediaProperties("local", new MediaProperties.Local("x"), org.springframework.util.unit.DataSize.ofMegabytes(5), 25_000_000L, 20_000,
                org.springframework.util.unit.DataSize.ofMegabytes(200), 500, budgetMb, 4, java.time.Duration.ofSeconds(30), java.time.Duration.ofMinutes(30), java.time.Duration.ofMinutes(10), false, 2560, 640, 85), b);
        byte[] corrupt = pngHeaderOnly(1500, 1000);   // passes the header checks, then fails inside the budget
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(6);
        List<java.util.concurrent.Future<Integer>> fs = new java.util.ArrayList<>();
        for (int i = 0; i < 12; i++) {
            boolean bad = i % 3 == 0;
            fs.add(pool.submit(() -> {
                try { return ip.process(bad ? corrupt : img, "image/png", "a.png").width(); }
                catch (MediaException e) { return bad && e.code().equals("MEDIA_CORRUPT") ? -1 : -2; }
            }));
        }
        for (var f : fs) assertNotEquals(-2, f.get(), "only the corrupt inputs fail, and only as MEDIA_CORRUPT");
        pool.shutdown();
        assertTrue(b.peakUsedMb() <= budgetMb, "never above the budget");
        assertEquals(budgetMb, b.available(), "every success and failure path released its share");
        assertTrue(b.peakUsedMb() < 2 * one - 5, "two such decodes were never in flight together (peak " + b.peakUsedMb() + " MB, one is " + one + ")");
    }

    @Test
    void smallImagesAreNotUpscaled() {
        ProcessedImage r = p.process(jpeg(300, 200), "image/jpeg", "a.jpg");
        assertEquals(300, r.width());
        assertEquals(300, r.thumbWidth());
        assertEquals(200, r.thumbHeight());
    }
}
