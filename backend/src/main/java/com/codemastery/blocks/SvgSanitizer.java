package com.codemastery.blocks;

import java.io.StringReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Attr;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;
import org.xml.sax.ErrorHandler;
import org.xml.sax.InputSource;
import org.xml.sax.SAXParseException;

/**
 * SVG safety, built on the JDK's strict, namespace-aware XML parser (DOCTYPE and external entities disabled, so nothing is ever
 * resolved or fetched) and an allowlist; nothing is regex-sanitised. The same parser that validates is the one that is walked, so
 * there is no parser differential between "what we checked" and "what a browser reads". The SVG is walked element by element
 * and RE-SERIALISED from the allowed parts only. One walk serves both boundaries:
 *  - write: any {@link Result#problems()} (something was not allowed) or {@link Result#fatal()} rejects the block;
 *  - read: the stripped {@link Result#svg()} is served, or the block is omitted when {@code fatal}.
 * Not allowed in v1: style/script/foreignObject/use/image/animation elements, style/class/on* attributes, any namespace but
 * SVG (and xlink:href as a #fragment), external references, url(...) other than url(#id), DOCTYPE/ENTITY/processing instructions.
 */
public final class SvgSanitizer {
    private SvgSanitizer() {}

    public static final int MAX_CHARS = 100_000;
    static final int MAX_ELEMENTS = 5_000;
    static final int MAX_DEPTH = 32;
    static final String SVG_NS = "http://www.w3.org/2000/svg";
    static final String XLINK_NS = "http://www.w3.org/1999/xlink";

    /** @param svg the clean markup (null when fatal); @param problems what was not allowed (and was dropped from {@code svg}). */
    public record Result(String svg, List<String> problems, boolean fatal) {}

    private static final Set<String> ELEMENTS = Set.of("svg", "g", "defs", "path", "rect", "circle", "ellipse", "line", "polyline",
            "polygon", "text", "tspan", "title", "desc", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "marker");
    private static final Set<String> TEXT_ELEMENTS = Set.of("text", "tspan", "title", "desc");
    private static final Set<String> HREF_ELEMENTS = Set.of("linearGradient", "radialGradient");
    private static final Set<String> ATTRIBUTES = Set.of("id", "viewBox", "width", "height", "preserveAspectRatio", "x", "y", "cx", "cy", "r",
            "rx", "ry", "x1", "y1", "x2", "y2", "fx", "fy", "points", "d", "transform", "fill", "fill-opacity", "fill-rule", "stroke",
            "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset",
            "stroke-miterlimit", "opacity", "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "spreadMethod",
            "clip-path", "clip-rule", "clipPathUnits", "mask", "maskUnits", "maskContentUnits", "marker-start", "marker-mid", "marker-end",
            "markerWidth", "markerHeight", "markerUnits", "refX", "refY", "orient", "font-family", "font-size", "font-weight", "font-style",
            "text-anchor", "dominant-baseline", "letter-spacing", "dx", "dy", "rotate", "display", "visibility");
    private static final Pattern ID = Pattern.compile("^[A-Za-z][A-Za-z0-9_.-]{0,63}$");
    private static final Pattern FRAGMENT = Pattern.compile("^#[A-Za-z][A-Za-z0-9_.-]{0,63}$");
    private static final Pattern URL_FN = Pattern.compile("url\\(([^)]*)\\)", Pattern.CASE_INSENSITIVE);
    /** Letters, digits and the punctuation real paint/transform/path/font values use. Notably NOT ':', '<', '>', '\\', '&', ';'. */
    private static final Pattern VALUE_CHARS = Pattern.compile("^[A-Za-z0-9_\\s#(),.%+'\"/*!=-]*$");
    private static final Pattern DANGER = Pattern.compile("javascript|vbscript|expression|@import|data", Pattern.CASE_INSENSITIVE);

    public static Result process(String raw) { return process(raw, true); }

    /** @param capSize false skips only the character-count cap (an unchanged stored block); every safety rule still applies */
    public static Result process(String raw, boolean capSize) {
        List<String> problems = new ArrayList<>();
        if (raw == null || raw.isBlank()) return new Result("", problems, false);
        if (capSize && raw.length() > MAX_CHARS) return fatal("This SVG is too large (limit " + MAX_CHARS + " characters).");
        String lower = raw.toLowerCase(java.util.Locale.ROOT);
        if (lower.contains("<!doctype") || lower.contains("<!entity") || lower.contains("<!element") || lower.contains("<!attlist")) {
            return fatal("SVG with a DOCTYPE or entity declarations isn't allowed.");
        }
        int pi = lower.indexOf("<?");
        while (pi >= 0) {
            if (!(lower.startsWith("<?xml ", pi) && pi == raw.length() - raw.stripLeading().length())) {
                return fatal("SVG with processing instructions isn't allowed.");
            }
            pi = lower.indexOf("<?", pi + 2);
        }
        Document doc;
        try {
            doc = parse(raw);
        } catch (SAXParseException e) {
            return fatal("This isn't well-formed SVG (XML): " + clip(e.getMessage()));
        } catch (Exception | StackOverflowError e) {
            return fatal("This isn't valid SVG (XML).");
        }
        Element root = doc.getDocumentElement();
        if (root == null || !SVG_NS.equals(root.getNamespaceURI()) || !"svg".equals(root.getLocalName())) {
            return fatal("The SVG must be a single <svg> element in the SVG namespace (xmlns=\"" + SVG_NS + "\").");
        }
        for (Node n = doc.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n.getNodeType() == Node.PROCESSING_INSTRUCTION_NODE) return fatal("SVG with processing instructions isn't allowed.");
        }
        Walk w = new Walk(problems);
        StringBuilder out = new StringBuilder();
        if (!w.element(root, 1, out, true)) return fatal(w.fatalMessage);
        return new Result(out.toString(), List.copyOf(problems), false);
    }

    private static Document parse(String raw) throws Exception {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setNamespaceAware(true);
        f.setXIncludeAware(false);
        f.setExpandEntityReferences(false);
        f.setCoalescing(false);
        f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        f.setFeature("http://xml.org/sax/features/external-general-entities", false);
        f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        f.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        try { f.setAttribute("jdk.xml.maxElementDepth", String.valueOf(MAX_DEPTH * 2)); } catch (IllegalArgumentException ignored) { /* older JAXP */ }
        DocumentBuilder b = f.newDocumentBuilder();
        b.setErrorHandler(new ErrorHandler() {
            @Override public void warning(SAXParseException e) { /* ignore */ }
            @Override public void error(SAXParseException e) throws SAXParseException { throw e; }
            @Override public void fatalError(SAXParseException e) throws SAXParseException { throw e; }
        });
        b.setEntityResolver((publicId, systemId) -> { throw new SAXParseException("External resources aren't allowed.", null); });
        return b.parse(new InputSource(new StringReader(raw)));
    }

    private static String clip(String s) { return s == null ? "" : s.length() > 120 ? s.substring(0, 120) + "…" : s; }

    private static Result fatal(String why) { return new Result(null, List.of(why), true); }

    private static final class Walk {
        final List<String> problems;
        int elements;
        String fatalMessage;
        boolean usesXlink;

        Walk(List<String> problems) { this.problems = problems; }

        void problem(String p) { if (problems.size() < 20 && !problems.contains(p)) problems.add(p); }

        /** @return false when the SVG must be rejected outright (budget exceeded) */
        boolean element(Element e, int depth, StringBuilder out, boolean root) {
            if (++elements > MAX_ELEMENTS) { fatalMessage = "This SVG has too many elements (limit " + MAX_ELEMENTS + ")."; return false; }
            if (depth > MAX_DEPTH) { fatalMessage = "This SVG is nested too deeply (limit " + MAX_DEPTH + ")."; return false; }
            String name = e.getLocalName();
            StringBuilder body = new StringBuilder();
            for (Node child = e.getFirstChild(); child != null; child = child.getNextSibling()) {
                switch (child.getNodeType()) {
                    case Node.ELEMENT_NODE -> {
                        Element c = (Element) child;
                        String cn = c.getLocalName();
                        if (!SVG_NS.equals(c.getNamespaceURI())) problem("<" + clip(c.getNodeName()) + "> uses a namespace other than SVG.");
                        else if (!ELEMENTS.contains(cn)) problem("<" + cn + "> isn't allowed in an SVG block.");
                        else if (!element(c, depth + 1, body, false)) return false;
                        // a rejected element is dropped together with everything inside it
                    }
                    case Node.TEXT_NODE, Node.CDATA_SECTION_NODE -> {
                        if (TEXT_ELEMENTS.contains(name)) {
                            String t = child.getNodeValue();
                            if (hasBadControl(t)) problem("Text contains control characters.");
                            else body.append(escape(t));
                        }                                                        // whitespace between other elements is dropped
                    }
                    case Node.PROCESSING_INSTRUCTION_NODE -> problem("Processing instructions aren't allowed.");
                    default -> { /* comments are dropped silently */ }
                }
            }
            StringBuilder attrs = new StringBuilder();
            if (root) attrs.append(" xmlns=\"").append(SVG_NS).append('"');
            NamedNodeMap map = e.getAttributes();
            for (int i = 0; i < map.getLength(); i++) attribute(name, (Attr) map.item(i), attrs);
            if (root && usesXlink) attrs.append(" xmlns:xlink=\"").append(XLINK_NS).append('"');
            out.append('<').append(name).append(attrs);
            if (body.length() == 0) out.append("/>");
            else out.append('>').append(body).append("</").append(name).append('>');
            return true;
        }

        void attribute(String element, Attr a, StringBuilder out) {
            String ns = a.getNamespaceURI();
            String local = a.getLocalName() != null ? a.getLocalName() : a.getName();
            String value = a.getValue();
            if (XMLConstants.XMLNS_ATTRIBUTE_NS_URI.equals(ns)) {                    // namespace declarations
                // declaring the SVG or XLink namespace (under any prefix) is harmless; any other namespace is refused
                if (!SVG_NS.equals(value) && !XLINK_NS.equals(value)) problem("Namespace declaration " + clip(a.getName()) + " isn't allowed.");
                return;
            }
            if (ns != null && !(XLINK_NS.equals(ns) && local.equals("href"))) {
                problem("Attribute " + clip(a.getName()) + " uses a namespace other than SVG.");
                return;
            }
            boolean href = local.equals("href");                                       // plain href, or xlink:href (checked above)
            if (href) {
                if (!HREF_ELEMENTS.contains(element) || !FRAGMENT.matcher(value).matches()) {
                    problem("Links (" + a.getName() + ") are only allowed as #id references between gradients; external references aren't allowed.");
                    return;
                }
                if (ns != null) usesXlink = true;
                out.append(' ').append(ns != null ? "xlink:href" : "href").append("=\"").append(escape(value)).append('"');
                return;
            }
            if (!ATTRIBUTES.contains(local)) {
                problem(local.toLowerCase(java.util.Locale.ROOT).startsWith("on") ? "Event handler attribute " + clip(local) + " isn't allowed."
                        : local.equals("style") ? "The style attribute isn't allowed; use presentation attributes like fill and stroke."
                        : "Attribute " + clip(local) + " isn't allowed on SVG blocks.");
                return;
            }
            String bad = badValue(local, value);
            if (bad != null) { problem(local + ": " + bad); return; }
            out.append(' ').append(local).append("=\"").append(escape(value)).append('"');
        }
    }

    /** null = fine. The value is already entity-decoded by the parser, so encoded tricks are checked in their real form. */
    static String badValue(String key, String v) {
        int max = key.equals("d") || key.equals("points") ? 50_000 : 1_000;
        if (v.length() > max) return "value is too long.";
        for (int i = 0; i < v.length(); i++) {
            char c = v.charAt(i);
            if ((c < 0x20 && c != '\t' && c != '\n' && c != '\r') || c == 0x7f) return "contains control characters.";
        }
        if (key.equals("id")) return ID.matcher(v).matches() ? null : "ids must start with a letter and use letters, digits, - _ .";
        if (!VALUE_CHARS.matcher(v).matches()) return "contains characters that aren't allowed here (such as ':' or '<').";
        String compact = v.replaceAll("\\s+", "");
        if (DANGER.matcher(compact).find()) return "contains a script or data reference.";
        Matcher m = URL_FN.matcher(v);
        while (m.find()) if (!FRAGMENT.matcher(m.group(1).trim()).matches()) return "url(...) may only point at #an-id inside the same SVG.";
        return null;
    }

    private static boolean hasBadControl(String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if ((c < 0x20 && c != '\t' && c != '\n' && c != '\r') || c == 0x7f) return true;
        }
        return false;
    }

    static String escape(String s) {
        StringBuilder b = new StringBuilder(s.length() + 8);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '&' -> b.append("&amp;");
                case '<' -> b.append("&lt;");
                case '>' -> b.append("&gt;");
                case '"' -> b.append("&quot;");
                default -> b.append(c);
            }
        }
        return b.toString();
    }

    /** For tests: the allowed element names. */
    static Set<String> allowedElements() { return ELEMENTS; }
    static Map<String, Integer> limits() { return Map.of("elements", MAX_ELEMENTS, "depth", MAX_DEPTH, "chars", MAX_CHARS); }
}
