"""Java track, part 3: JVM Internals and I/O & NIO.

Plain text only (the lesson page does not render markdown); "- " lines are bullets.
"""

TRACK = "java"

# (section_slug, lesson_slug) -> content
LESSONS = {}


def lesson(section, slug, **fields):
    LESSONS[(section, slug)] = fields


# ───────────────────────── JVM Internals ─────────────────────────

lesson("jvm-internals", "jvm-architecture",
    summary="How the JVM turns bytecode into a running program.",
    concept="""Java source code is compiled by javac into bytecode stored in .class files. Bytecode is not tied to any CPU or operating system. The Java Virtual Machine (JVM) is the program that loads and runs it, which is why the same class files run on Windows, Linux and macOS.

The JVM has three main parts:
- The class loader subsystem finds .class files, loads them, verifies them and links them into the running program.
- The runtime data areas hold everything the program needs while it runs: the heap, the method area (metaspace), a stack per thread, program counters and native method stacks.
- The execution engine runs the bytecode. It contains an interpreter, a JIT compiler that turns hot code into machine code, and the garbage collector.

The JVM is a specification, and there are several implementations. HotSpot, shipped with OpenJDK and Oracle JDK, is the most common. Others include OpenJ9 and GraalVM.

Three names are easy to confuse. The JDK is the full development kit with the compiler and tools. The JRE is what you need to run programs. The JVM is the engine inside the JRE. Since Java 9, you can also build a trimmed runtime with jlink.

Startup follows a fixed path: the launcher creates the JVM, the bootstrap loader loads core classes, your main class is loaded and initialised, and then main starts on the main thread. Understanding this layout helps you read stack traces, interpret memory errors and choose sensible JVM flags.""",
    realWorld="Production teams read JVM architecture every time they size a container, diagnose an OutOfMemoryError, or decide which JDK distribution and garbage collector to deploy.",
    commonMistakes=[
        "Confusing the JDK, JRE and JVM and installing the wrong one",
        "Assuming Java is purely interpreted and therefore always slow",
        "Believing the JVM only uses heap memory, and forgetting metaspace, thread stacks and native memory",
    ],
    bestPractices=[
        "Use a current long-term support JDK and keep it patched",
        "Print runtime details with java -version and Runtime methods when diagnosing problems",
        "Set container memory limits with the JVM's container support in mind",
    ],
    interviewRelevance="Interviewers often ask you to explain what happens between typing java Main and seeing output, and to name the JVM's major components.",
    code_language="java",
    code_example="""// Inspect the JVM your program is running on.
public class JvmInfo {
    public static void main(String[] args) {
        // Vendor and version come from system properties
        System.out.println("Java version: " + System.getProperty("java.version"));
        System.out.println("VM name:      " + System.getProperty("java.vm.name"));
        System.out.println("VM vendor:    " + System.getProperty("java.vm.vendor"));

        Runtime rt = Runtime.getRuntime();
        // Logical processors visible to the JVM (respects container limits)
        System.out.println("CPUs:         " + rt.availableProcessors());
        // Upper bound of heap the JVM will try to use (-Xmx)
        System.out.println("Max heap MB:  " + rt.maxMemory() / (1024 * 1024));
        // Heap currently reserved from the OS
        System.out.println("Total heap MB:" + rt.totalMemory() / (1024 * 1024));
        System.out.println("Free heap MB: " + rt.freeMemory() / (1024 * 1024));

        // The class loader that loaded this class
        System.out.println("Loader: " + JvmInfo.class.getClassLoader());

        // Run with: java -Xmx256m JvmInfo
    }
}""")

lesson("jvm-internals", "memory-model",
    summary="Heap, stack, metaspace and the rules for visibility between threads.",
    concept="""The word memory model means two related things in Java: where data lives, and what one thread is guaranteed to see of another thread's writes.

Where data lives:
- The heap is shared by all threads and holds every object and array. It is managed by the garbage collector and is usually split into a young generation (new objects) and an old generation (long-lived objects).
- Each thread has its own stack. Each method call pushes a frame holding local variables and partial results. Primitives live directly in the frame, while object variables hold references to heap objects.
- Metaspace holds class metadata such as method code and constant pools. It lives in native memory, not in the heap.
- Other native memory is used for direct buffers, thread stacks and the JIT code cache.

Visibility between threads is governed by the Java Memory Model (JMM). Modern CPUs cache values and reorder instructions, so without synchronisation one thread may never see another thread's update. The JMM defines happens-before rules that guarantee visibility and ordering:
- Unlocking a monitor happens-before every later lock of the same monitor.
- A write to a volatile field happens-before every later read of that field.
- Thread.start happens-before anything in the started thread, and the end of a thread happens-before a successful join.

If two threads access the same variable, at least one writes, and no happens-before relationship exists, you have a data race and the result is unpredictable. Use synchronized, volatile, locks or the java.util.concurrent classes to establish ordering.""",
    realWorld="Visibility bugs appear as flags that never flip, stale configuration, or objects seen half-built. Understanding the model is also how engineers decide whether to tune heap, stack and metaspace sizes.",
    commonMistakes=[
        "Believing a plain boolean flag written by one thread will always be seen by another",
        "Thinking volatile makes compound actions like count++ atomic",
        "Assuming objects are stored on the stack because the reference variable is",
    ],
    bestPractices=[
        "Prefer immutable objects and confine mutable state to one thread",
        "Use volatile for simple flags and java.util.concurrent for anything compound",
        "Publish objects safely, for example through final fields or concurrent collections",
    ],
    interviewRelevance="Expect questions on stack versus heap, what volatile guarantees, and what happens-before means. They are staples of Java concurrency interviews.",
    code_language="java",
    code_example="""// volatile guarantees that the worker sees the updated flag.
public class VisibilityDemo {
    // Without volatile, the loop below might never terminate.
    private static volatile boolean running = true;

    public static void main(String[] args) throws InterruptedException {
        int local = 42;                       // primitive: lives in this thread's stack frame
        StringBuilder shared = new StringBuilder("hi"); // object lives on the heap

        Thread worker = new Thread(() -> {
            long loops = 0;
            while (running) {                 // reads the volatile field every iteration
                loops++;
            }
            System.out.println("Worker stopped after loops: " + (loops > 0));
        });
        worker.start();

        Thread.sleep(100);
        running = false;                      // volatile write happens-before the worker's read
        worker.join();                        // join gives happens-before to the main thread

        System.out.println(local + " " + shared);
    }
}""")

lesson("jvm-internals", "garbage-collection",
    summary="How the JVM finds and frees objects you no longer use.",
    concept="""In Java you create objects with new but never free them yourself. The garbage collector (GC) reclaims the memory of objects that are no longer reachable.

Reachability is the key idea. The GC starts from a set of roots: local variables on thread stacks, static fields, active threads and JNI references. Any object reachable by following references from a root is live. Everything else is garbage. This is why circular references are not a problem in Java: two objects that only point at each other, with no path from a root, are collected.

Most objects die young. The generational hypothesis says that new objects usually become garbage quickly, so the heap is divided into generations:
- Young generation: new objects start in Eden. Survivors are copied between survivor spaces, and a minor GC cleans this area quickly.
- Old generation: objects that survive several collections are promoted here. Cleaning it is a major or full GC and takes longer.

Collections pause the application threads in at least part of their work. These are called stop-the-world pauses. Much of modern GC design is about making them shorter.

You can influence but not command the GC. Calling System.gc is only a hint and is usually a bad idea in production code. Instead, reduce allocation, avoid holding references longer than needed, and choose a collector and heap size that match your workload.

Memory leaks still happen in Java: a static map or cache that keeps growing holds references forever, so the GC cannot free those objects. Weak and soft references exist for caches that should not keep objects alive.""",
    realWorld="GC logs and pause times are a primary signal when services show latency spikes. Teams watch allocation rates and old-generation growth to catch leaks before an outage.",
    commonMistakes=[
        "Calling System.gc as a routine way to free memory",
        "Keeping objects in static collections and never removing them, creating a leak",
        "Relying on finalizers for cleanup instead of try-with-resources",
    ],
    bestPractices=[
        "Enable GC logging with -Xlog:gc and read it before tuning anything",
        "Limit object lifetimes and avoid creating needless short-lived garbage in hot loops",
        "Use try-with-resources and Cleaner for resource cleanup, not finalize",
    ],
    interviewRelevance="Common questions are how the GC decides an object is garbage, what generations are, and how a memory leak can exist in a garbage-collected language.",
    code_language="java",
    code_example="""import java.lang.ref.WeakReference;

// Shows that unreachable objects become eligible for collection.
public class GcDemo {
    public static void main(String[] args) {
        Object data = new byte[10 * 1024 * 1024];       // 10 MB on the heap
        WeakReference<Object> weak = new WeakReference<>(data);

        System.out.println("Before: " + (weak.get() != null)); // true, still strongly reachable

        data = null;      // remove the only strong reference; the array is now unreachable

        // System.gc() is only a hint; the JVM may ignore it.
        System.gc();

        // Usually prints false once the collector has run, but it is not guaranteed.
        System.out.println("After:  " + (weak.get() != null));

        // Run with GC logging to watch it happen:
        //   java -Xlog:gc GcDemo
    }
}""")

lesson("jvm-internals", "gc-algorithms",
    summary="The main garbage collectors in HotSpot and when to choose each.",
    concept="""A garbage collector algorithm decides how to find dead objects and how to reclaim their space. Underneath the different collectors are a few basic techniques:
- Mark-sweep: mark live objects, then free the dead ones. It can leave the heap fragmented.
- Mark-compact: mark live objects, then slide them together to remove gaps.
- Copying: copy live objects into a fresh area, then discard the old one wholesale. Fast when most objects are dead, which suits the young generation.

HotSpot ships several collectors built on these ideas:
- Serial GC: single-threaded, tiny overhead. Good for small heaps and single-core containers.
- Parallel GC: uses many threads to collect, maximising throughput. Pauses can be long on big heaps.
- G1 GC: the default since Java 9. It splits the heap into many regions, collects the regions with the most garbage first, and tries to meet a pause-time goal you set with -XX:MaxGCPauseMillis.
- ZGC and Shenandoah: low-latency collectors that do most work concurrently with the application, keeping pauses very short, often under a millisecond, even on large heaps. ZGC became generational in Java 21.

Choosing is a trade-off between three goals: throughput (how much time goes to your code), latency (how long pauses last) and footprint (how much memory the collector needs). Batch jobs favour throughput. Interactive services favour latency.

Select a collector with flags such as -XX:+UseG1GC, -XX:+UseZGC or -XX:+UseParallelGC. Measure with realistic load before and after a change, because the default usually performs well.""",
    realWorld="Trading platforms and real-time APIs often use ZGC or Shenandoah for tiny pauses, data pipelines choose Parallel GC for throughput, and most general web services run happily on G1.",
    commonMistakes=[
        "Switching collectors without measuring, on the basis of folklore",
        "Setting a very low pause-time goal that makes G1 collect so often it hurts throughput",
        "Confusing a minor GC with a full GC and treating all pauses the same",
    ],
    bestPractices=[
        "Start with the default collector and only change it when measurements show a problem",
        "Test with production-like data volumes and traffic shape",
        "Record GC logs in production so you can analyse incidents afterwards",
    ],
    interviewRelevance="You may be asked to compare G1, Parallel and ZGC, or to explain throughput versus latency in garbage collection.",
    code_language="java",
    code_example="""import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.util.ArrayList;
import java.util.List;

// Prints which collectors are active and how much work they did.
// Try different collectors:
//   java -XX:+UseSerialGC   GcAlgorithms
//   java -XX:+UseParallelGC GcAlgorithms
//   java -XX:+UseG1GC       GcAlgorithms
//   java -XX:+UseZGC        GcAlgorithms
public class GcAlgorithms {
    public static void main(String[] args) {
        // Create plenty of short-lived garbage
        List<byte[]> keep = new ArrayList<>();
        for (int i = 0; i < 20_000; i++) {
            byte[] chunk = new byte[10_000];
            if (i % 1000 == 0) {
                keep.add(chunk);        // a few survive
            }
        }

        for (GarbageCollectorMXBean gc : ManagementFactory.getGarbageCollectorMXBeans()) {
            System.out.println(gc.getName()
                + " collections=" + gc.getCollectionCount()
                + " timeMs=" + gc.getCollectionTime());
        }
        System.out.println("Survivors kept: " + keep.size());
    }
}""")

lesson("jvm-internals", "class-loading",
    summary="How classes are found, loaded, linked and initialised.",
    concept="""Classes are not all loaded when the program starts. The JVM loads each class lazily, the first time it is needed, using class loaders.

A class goes through these stages:
- Loading: a class loader reads the bytes of the .class file and creates a Class object.
- Linking: verification checks the bytecode is valid and safe, preparation allocates static fields with default values, and resolution turns symbolic references into direct ones.
- Initialisation: static initialisers and static field assignments run, once, in a thread-safe manner.

There are three built-in loaders in a standard JVM:
- The bootstrap loader loads core classes such as java.lang.Object. It is implemented in native code, so getClassLoader returns null for these.
- The platform loader loads other Java platform modules.
- The application (system) loader loads classes from your classpath or module path.

Loaders follow the parent delegation model. When asked to load a class, a loader first asks its parent. Only if the parent cannot find it does the loader try itself. This stops application code from replacing core classes such as java.lang.String with its own version.

Two loaded classes are the same only if they have the same name and the same loader. That is why application servers and plugin systems use custom class loaders to isolate different applications, and why you sometimes meet a ClassCastException between two classes that print the same name.

Common errors are ClassNotFoundException, thrown when you load a class by name and it is missing, and NoClassDefFoundError, thrown when a class that was present at compile time is missing at run time.""",
    realWorld="Application servers, build tools, IDE plugins and frameworks like Spring and OSGi rely on custom class loaders to isolate modules, support hot reload and load code dynamically.",
    commonMistakes=[
        "Mixing up ClassNotFoundException and NoClassDefFoundError",
        "Assuming a class is initialised as soon as the program starts",
        "Having two versions of the same library on the classpath and not knowing which one wins",
    ],
    bestPractices=[
        "Keep the classpath small and avoid duplicate library versions",
        "Respect parent delegation when writing a custom class loader",
        "Use -verbose:class to see what is loaded and from where",
    ],
    interviewRelevance="Interviewers like the questions: what is parent delegation, what are the built-in loaders, and when does a class get initialised.",
    code_language="java",
    code_example="""// Shows loaders, delegation and lazy initialisation.
public class ClassLoadingDemo {
    static class Lazy {
        static {
            // Runs once, the first time Lazy is actively used
            System.out.println("Lazy initialised");
        }
        static void hello() { System.out.println("hello"); }
    }

    public static void main(String[] args) throws Exception {
        // Core classes come from the bootstrap loader, shown as null
        System.out.println("String loader: " + String.class.getClassLoader());

        // Application classes come from the application loader
        ClassLoader app = ClassLoadingDemo.class.getClassLoader();
        System.out.println("App loader:    " + app);
        System.out.println("Parent loader: " + app.getParent());

        System.out.println("Before first use");
        Lazy.hello();                       // triggers loading and initialisation
        Lazy.hello();                       // already initialised, no second message

        // Load a class by name through a loader
        Class<?> c = Class.forName("java.util.ArrayList");
        System.out.println("Loaded: " + c.getName());

        // See every class load with: java -verbose:class ClassLoadingDemo
    }
}""")

lesson("jvm-internals", "jit-compilation",
    summary="How the JVM compiles hot bytecode to fast machine code at run time.",
    concept="""If the JVM only interpreted bytecode, Java would be much slower than languages compiled ahead of time. The Just-In-Time (JIT) compiler closes that gap by translating frequently used bytecode into native machine code while the program runs.

HotSpot starts every method in the interpreter, which begins executing immediately with no compile delay. While it runs, the JVM profiles the program, counting how often methods are called and how often loops repeat. Methods that become hot are compiled.

HotSpot uses tiered compilation with two compilers:
- C1, the client compiler, compiles quickly with light optimisation.
- C2, the server compiler, takes longer but applies aggressive optimisation to the hottest code.

A method typically moves from interpreter to C1 to C2 as it proves itself hot.

Because the JIT sees real runtime behaviour, it can make optimisations that a static compiler cannot:
- Inlining: replacing a call with the body of the method, which removes call overhead and opens more optimisation.
- Escape analysis: if an object never escapes a method, it may be allocated on the stack or removed entirely.
- Speculative optimisation: assuming, for example, that a virtual call always hits one class, and falling back (deoptimising) if the assumption breaks.

One consequence is warm-up. A freshly started JVM is slower than one that has run for a while, so benchmarks must include warm-up iterations, and tools such as JMH exist for this. For faster startup, options include class data sharing, GraalVM native image and project CRaC.""",
    realWorld="This is why long-running Java services reach excellent steady-state performance, and why serverless and command-line uses of Java care about warm-up and startup time.",
    commonMistakes=[
        "Benchmarking with a simple loop and System.nanoTime without warm-up and trusting the result",
        "Writing huge methods that exceed inlining limits and are never compiled well",
        "Assuming the first request in production reflects steady-state speed",
    ],
    bestPractices=[
        "Use JMH for micro-benchmarks and always include warm-up",
        "Keep hot methods small so the JIT can inline them",
        "Inspect compilation with -XX:+PrintCompilation when investigating performance",
    ],
    interviewRelevance="Be ready to explain interpreter versus JIT, tiered compilation, inlining and why Java programs need time to warm up.",
    code_language="java",
    code_example="""// Run with: java -XX:+PrintCompilation JitDemo
// The output shows methods being compiled as they become hot.
public class JitDemo {
    // Small method: a good inlining candidate
    static int square(int x) {
        return x * x;
    }

    static long work(int n) {
        long sum = 0;
        for (int i = 0; i < n; i++) {
            sum += square(i) % 7;
        }
        return sum;
    }

    public static void main(String[] args) {
        // Round 1 includes interpretation and compilation (warm-up)
        // Later rounds usually run faster once C2 has optimised the code
        for (int round = 1; round <= 5; round++) {
            long start = System.nanoTime();
            long result = work(50_000_000);
            long ms = (System.nanoTime() - start) / 1_000_000;
            System.out.println("Round " + round + ": " + ms + " ms (result " + result + ")");
        }
    }
}""")

lesson("jvm-internals", "performance-tuning",
    summary="A measured approach to making Java applications faster and leaner.",
    concept="""Performance tuning is the practice of measuring, finding the real bottleneck and fixing that, rather than guessing. The most important rule is: measure first.

A sensible workflow looks like this:
- Define a goal, such as a 99th percentile latency or a throughput target.
- Reproduce realistic load.
- Observe with tools to find where time and memory go.
- Change one thing at a time and measure again.

Useful tools come with the JDK:
- Java Flight Recorder (JFR) with JDK Mission Control records low-overhead profiling data from a live JVM.
- jcmd, jstack and jmap give thread dumps, heap statistics and heap dumps.
- jstat and GC logs show collection frequency and pause times.
- Heap dump analysers help find memory leaks.

Common levers, once you know the cause:
- Code: use better algorithms and data structures, avoid needless allocation, use StringBuilder in loops and primitives instead of boxed types where it matters.
- Heap size: -Xms and -Xmx set the initial and maximum heap. Setting them equal avoids resizing pauses. Too small causes frequent GC, too large makes pauses and footprint grow.
- Collector choice: see the GC lessons for throughput versus latency.
- Threads: size pools according to CPU count and whether work is CPU-bound or I/O-bound.
- Containers: modern JVMs read container limits, but -XX:MaxRAMPercentage lets you control how much of the memory limit the heap uses.

Premature tuning of flags is rarely helpful. Most large wins come from fixing algorithms, I/O patterns and database queries, not from JVM switches.""",
    realWorld="Operations teams tune heap size, collector and thread pools for each service, and use JFR in production to diagnose slowdowns without restarting.",
    commonMistakes=[
        "Changing many flags at once so you cannot tell what helped",
        "Optimising code that a profiler never showed to be hot",
        "Copying JVM flags from a blog post written for a different version or workload",
    ],
    bestPractices=[
        "Profile before and after every change and keep the numbers",
        "Leave the heap sized with headroom and keep GC logging enabled",
        "Prefer fixing algorithms and queries before touching JVM flags",
    ],
    interviewRelevance="Interviewers ask how you would investigate a slow or memory-hungry service. A clear measure, hypothesise, change, re-measure process scores well.",
    code_language="java",
    code_example="""import java.util.ArrayList;
import java.util.List;

// Typical flags for a service (shown as comments):
//   java -Xms512m -Xmx512m          fixed heap, no resize pauses
//   -XX:+UseG1GC                    collector choice
//   -XX:MaxRAMPercentage=75         use 75 percent of a container's memory
//   -Xlog:gc*:file=gc.log           GC logging
//   -XX:+HeapDumpOnOutOfMemoryError dump heap when memory runs out
//   -XX:StartFlightRecording=duration=60s,filename=app.jfr
public class TuningDemo {
    public static void main(String[] args) {
        // Slow: String concatenation in a loop creates many temporary objects
        long t1 = System.nanoTime();
        String s = "";
        for (int i = 0; i < 20_000; i++) {
            s += i;
        }
        long slow = System.nanoTime() - t1;

        // Faster: one StringBuilder reused
        long t2 = System.nanoTime();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 20_000; i++) {
            sb.append(i);
        }
        long fast = System.nanoTime() - t2;

        System.out.println("concat ms:  " + slow / 1_000_000);
        System.out.println("builder ms: " + fast / 1_000_000);
        System.out.println(s.length() == sb.length());
    }
}""")

# ───────────────────────── I/O & NIO ─────────────────────────

lesson("io-nio", "io-streams",
    summary="Reading and writing bytes and characters with the classic java.io streams.",
    concept="""The java.io package models input and output as streams: ordered flows of data that you read from or write to one piece at a time.

There are two families:
- Byte streams: InputStream and OutputStream, for raw bytes such as images, archives and network data.
- Character streams: Reader and Writer, for text. They convert between bytes and characters using a character encoding.

Common classes are FileInputStream and FileOutputStream for files, ByteArrayInputStream and ByteArrayOutputStream for memory, and InputStreamReader and OutputStreamWriter, which bridge bytes to characters and let you specify the encoding.

Streams are designed to be wrapped, which is called the decorator pattern. A BufferedReader wraps a Reader and adds an in-memory buffer plus a convenient readLine method. A DataOutputStream wraps an OutputStream and adds methods for primitive types. Reading a file through a buffer is far faster than reading it one byte at a time, because each unbuffered read may become an operating system call.

Always close streams. Open streams hold operating system resources and unflushed buffered data can be lost. The right tool is try-with-resources, which closes anything that implements AutoCloseable even when an exception occurs.

Character encoding matters. If you do not say which charset to use, older APIs fall back to the platform default, which can differ between machines. Always pass StandardCharsets.UTF_8 explicitly. Java 18 and later default to UTF-8 for file APIs, but being explicit keeps the code portable.

Classic streams are blocking: a read call waits until data is available, and the thread is stuck meanwhile.""",
    realWorld="Streams sit under logging, config loading, HTTP clients and servers, report export and nearly every program that touches a file or socket.",
    commonMistakes=[
        "Forgetting to close streams, leaking file handles",
        "Reading text with a byte stream or without specifying the charset",
        "Reading one byte at a time from an unbuffered stream",
    ],
    bestPractices=[
        "Use try-with-resources for every stream",
        "Wrap in BufferedReader or BufferedInputStream for efficiency",
        "Pass StandardCharsets.UTF_8 explicitly when converting between bytes and text",
    ],
    interviewRelevance="Common questions: byte streams versus character streams, why buffering helps, and how try-with-resources prevents resource leaks.",
    code_language="java",
    code_example="""import java.io.*;
import java.nio.charset.StandardCharsets;

// Copies a text file line by line using wrapped streams.
public class StreamCopy {
    public static void main(String[] args) {
        String in = "input.txt";
        String out = "output.txt";

        // try-with-resources closes both automatically, in reverse order
        try (BufferedReader reader = new BufferedReader(
                 new InputStreamReader(new FileInputStream(in), StandardCharsets.UTF_8));
             BufferedWriter writer = new BufferedWriter(
                 new OutputStreamWriter(new FileOutputStream(out), StandardCharsets.UTF_8))) {

            String line;
            int count = 0;
            while ((line = reader.readLine()) != null) {   // null means end of stream
                writer.write(line.toUpperCase());
                writer.newLine();
                count++;
            }
            System.out.println("Copied lines: " + count);
        } catch (FileNotFoundException e) {
            System.err.println("Missing file: " + e.getMessage());
        } catch (IOException e) {
            System.err.println("I/O error: " + e.getMessage());
        }
    }
}""")

lesson("io-nio", "file-handling",
    summary="Working with files and directories using java.nio.file Path and Files.",
    concept="""Modern Java file handling uses the java.nio.file package, introduced in Java 7. It replaces most uses of the old java.io.File class with two cleaner pieces: Path and Files.

A Path represents a location in a file system. You create one with Path.of("data", "notes.txt"), and you can combine, resolve and normalise paths without touching the disk. Path methods such as resolve, relativize, getFileName and getParent make path logic safe and portable across operating systems, so you avoid hand-built strings with slashes.

The Files class provides static methods that do the actual work:
- Files.readString and Files.writeString for small text files.
- Files.readAllLines and Files.lines to read as lines. Files.lines returns a lazy stream and must be closed.
- Files.newBufferedReader and newBufferedWriter for larger files processed incrementally.
- Files.copy, Files.move and Files.delete, with options such as StandardCopyOption.REPLACE_EXISTING.
- Files.exists, isDirectory, size and getLastModifiedTime for metadata.
- Files.list, Files.walk and Files.walkFileTree to traverse directories.
- Files.createTempFile and createDirectories for new files.

Failures are reported through exceptions that are more specific than the old File API, which often just returned false. For example, NoSuchFileException and AccessDeniedException tell you exactly what went wrong.

Remember that reading a whole file into memory is fine for small files but dangerous for large ones. For big inputs, stream line by line. Also be careful with user-provided paths: normalise them and check they stay inside the intended directory to prevent path traversal attacks.""",
    realWorld="Applications use these APIs to load configuration, import and export CSV files, write logs and reports, process uploads and scan directory trees.",
    commonMistakes=[
        "Reading very large files fully into memory",
        "Forgetting to close the stream returned by Files.lines or Files.list",
        "Building paths by string concatenation and trusting user input without normalising it",
    ],
    bestPractices=[
        "Prefer Path and Files over java.io.File in new code",
        "Use try-with-resources for streams from Files.lines, Files.list and Files.walk",
        "Normalise and validate paths that come from users",
    ],
    interviewRelevance="Interviewers may ask the difference between File and Path, or how to read a large file efficiently and safely.",
    code_language="java",
    code_example="""import java.io.IOException;
import java.nio.file.*;
import java.util.List;
import java.util.stream.Stream;

public class FileDemo {
    public static void main(String[] args) throws IOException {
        Path dir = Path.of("demo-dir");
        Files.createDirectories(dir);                       // no error if it already exists

        Path file = dir.resolve("notes.txt");               // demo-dir/notes.txt
        Files.writeString(file, "alpha\\nbeta\\ngamma\\n");

        // Small file: read everything
        List<String> lines = Files.readAllLines(file);
        System.out.println("Lines: " + lines);

        // Large file: stream lazily and close the stream
        try (Stream<String> s = Files.lines(file)) {
            long count = s.filter(l -> l.contains("a")).count();
            System.out.println("Lines containing a: " + count);
        }

        Path copy = dir.resolve("copy.txt");
        Files.copy(file, copy, StandardCopyOption.REPLACE_EXISTING);
        System.out.println("Size: " + Files.size(copy) + " bytes");

        // List directory contents
        try (Stream<Path> children = Files.list(dir)) {
            children.forEach(p -> System.out.println(p.getFileName()));
        }

        Files.delete(copy);
        Files.delete(file);
        Files.delete(dir);
    }
}""")

lesson("io-nio", "serialization",
    summary="Turning objects into bytes and back, and why Java's built-in way is risky.",
    concept="""Serialization converts an object into a sequence of bytes so it can be stored or sent over a network. Deserialization rebuilds the object from those bytes.

Java's built-in mechanism works for classes that implement the marker interface java.io.Serializable. You write objects with ObjectOutputStream.writeObject and read them back with ObjectInputStream.readObject. The whole object graph reachable from the object is saved, as long as every part is also serializable.

Key details:
- serialVersionUID is a version number for the class. If you do not declare it, Java computes one from the class structure, and almost any change makes old data unreadable with an InvalidClassException. Declare it explicitly as a private static final long.
- Fields marked transient are skipped. Use this for passwords, caches and non-serializable fields such as threads or open connections. After deserialization they hold default values.
- Static fields are not part of an object's state and are not serialized.
- Constructors of the serializable class are not called on deserialization, so invariants you enforce in a constructor can be bypassed.

Security is the big warning. Deserializing untrusted data can let an attacker run code through crafted objects. It has caused many serious vulnerabilities. Never deserialize data from an untrusted source with ObjectInputStream. If you must, use an ObjectInputFilter to restrict allowed classes.

Because of these issues, most modern systems prefer explicit data formats: JSON with Jackson or Gson, Protocol Buffers, Avro, or similar. They are language-neutral, human-inspectable or compact, and easier to evolve. Java records are a good fit for plain data carried to such formats.""",
    realWorld="Native Java serialization still appears in older session storage, caches and RMI. New systems commonly use JSON or Protocol Buffers for APIs, messaging and persistence.",
    commonMistakes=[
        "Deserializing data from an untrusted source",
        "Not declaring serialVersionUID and then breaking compatibility with a small code change",
        "Forgetting that a non-serializable field causes NotSerializableException",
    ],
    bestPractices=[
        "Prefer JSON, Protocol Buffers or Avro over native Java serialization",
        "Declare serialVersionUID and mark sensitive fields transient",
        "Apply an ObjectInputFilter if you must read serialized objects",
    ],
    interviewRelevance="Common questions: what transient does, what serialVersionUID is for, and why Java deserialization is a security risk.",
    code_language="java",
    code_example="""import java.io.*;

public class SerializationDemo {
    static class User implements Serializable {
        private static final long serialVersionUID = 1L;  // explicit version
        private final String name;
        private final int age;
        private transient String password;                 // never written out

        User(String name, int age, String password) {
            this.name = name;
            this.age = age;
            this.password = password;
        }

        @Override
        public String toString() {
            return name + " (" + age + "), password=" + password;
        }
    }

    public static void main(String[] args) throws IOException, ClassNotFoundException {
        User original = new User("Asha", 30, "secret");

        // Serialize to a byte array
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(original);
        }
        System.out.println("Serialized size: " + bytes.size() + " bytes");

        // Deserialize (only do this with trusted data!)
        try (ObjectInputStream in = new ObjectInputStream(
                new ByteArrayInputStream(bytes.toByteArray()))) {
            User copy = (User) in.readObject();
            System.out.println(copy);   // password is null because it is transient
        }
    }
}""")

lesson("io-nio", "nio-basics",
    summary="Why NIO exists and how its main pieces fit together.",
    concept="""NIO, short for New I/O and introduced in Java 1.4, offers a different model from the classic java.io streams. It has three core ideas: buffers, channels and selectors. The later NIO.2 additions in Java 7 brought Path, Files and asynchronous channels.

The differences from classic I/O:
- Streams move data one direction and block the calling thread. Channels can read and write, and can work in non-blocking mode.
- Streams read bytes straight into your variables. NIO reads into a buffer, a block of memory that you then process.
- With streams, a server usually needs one thread per connection. With selectors, one thread can watch thousands of connections and handle only those that are ready.

Main building blocks:
- Buffer: a container for data with a position, limit and capacity. ByteBuffer is the most common.
- Channel: a connection to a file, socket or other source. Examples are FileChannel, SocketChannel and ServerSocketChannel.
- Selector: lets a single thread monitor many non-blocking channels for readiness events.
- Path and Files: the NIO.2 file system API covered in the file handling lesson.

NIO does not make everything faster automatically. For ordinary file reading, a buffered stream or Files.readAllBytes is simpler and perfectly adequate. NIO pays off when you need high concurrency with many network connections, memory-mapped files, direct buffers or fine control over data transfer.

Most applications use NIO indirectly. Frameworks such as Netty, and servers such as Tomcat and Jetty, are built on it, so understanding the model helps you reason about their behaviour.""",
    realWorld="High-performance network servers, proxies, messaging systems and databases are built on NIO so that a small number of threads can serve very many connections.",
    commonMistakes=[
        "Switching to NIO for simple file work where Files and buffered streams are clearer",
        "Thinking NIO is automatically faster for every workload",
        "Mixing up blocking and non-blocking modes of a channel",
    ],
    bestPractices=[
        "Use Files and Path for everyday file tasks",
        "Reach for NIO channels and selectors only when concurrency or throughput demands it",
        "Consider an established framework such as Netty rather than hand-writing selector loops",
    ],
    interviewRelevance="Be ready to contrast I/O and NIO: blocking versus non-blocking, streams versus buffers and channels, and one thread per connection versus selectors.",
    code_language="java",
    code_example="""import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

// Writes and reads a file through a channel and a buffer.
public class NioBasics {
    public static void main(String[] args) throws IOException {
        Path path = Path.of("nio-demo.txt");

        // Write: put data in a buffer, then hand it to the channel
        try (FileChannel ch = FileChannel.open(path,
                StandardOpenOption.CREATE, StandardOpenOption.WRITE,
                StandardOpenOption.TRUNCATE_EXISTING)) {
            ByteBuffer out = ByteBuffer.wrap("Hello NIO".getBytes(StandardCharsets.UTF_8));
            ch.write(out);
        }

        // Read: the channel fills the buffer
        try (FileChannel ch = FileChannel.open(path, StandardOpenOption.READ)) {
            ByteBuffer in = ByteBuffer.allocate(64);
            int n = ch.read(in);                 // returns bytes read, or -1 at end
            in.flip();                           // switch from filling to reading
            String text = StandardCharsets.UTF_8.decode(in).toString();
            System.out.println("Read " + n + " bytes: " + text);
        }
    }
}""")

lesson("io-nio", "buffers-channels",
    summary="How ByteBuffer state works and how channels move data.",
    concept="""A buffer is a fixed-size block of memory with a small amount of bookkeeping. Understanding that bookkeeping is the key to using NIO correctly. Every buffer has:
- capacity: the total size, which never changes.
- position: the index of the next element to read or write.
- limit: the first index that must not be read or written.
- mark: an optional remembered position.

A buffer is always in one of two modes, and you switch with method calls:
- Filling mode: position advances as you put data in, and limit equals capacity.
- Draining mode: after flip, limit is set to the current position and position goes back to zero, so you can read what was written.

After reading everything you can call clear to prepare for a fresh fill, or compact to keep unread bytes and continue filling. Forgetting flip is the most common NIO bug: the buffer appears empty because position sits at the end of the data.

Buffers come in two flavours. Heap buffers, from ByteBuffer.allocate, are backed by a Java array. Direct buffers, from allocateDirect, live outside the heap, which can avoid a copy during native I/O but cost more to allocate and are not tracked by normal heap limits. Use direct buffers for large, long-lived buffers that are reused.

A Channel is the connection that moves data to or from a buffer. FileChannel supports reading, writing, positioned access, transferTo and transferFrom for efficient copying between channels, and memory-mapped files with map. A single read call may fill only part of the buffer, so always loop until you have what you need or read returns -1.""",
    realWorld="Network frameworks reuse pooled direct buffers to avoid copying, and file-copy or web-serving code uses transferTo to let the operating system move data without passing it through user space.",
    commonMistakes=[
        "Forgetting to call flip between writing into a buffer and reading from it",
        "Assuming a single read fills the buffer completely",
        "Allocating a new direct buffer for every operation instead of reusing one",
    ],
    bestPractices=[
        "Follow the cycle: write into the buffer, flip, read from it, then clear or compact",
        "Loop on channel reads and writes until the buffer is drained or filled",
        "Use transferTo or transferFrom for plain file-to-file or file-to-socket copies",
    ],
    interviewRelevance="Interviewers may ask what flip does, the difference between position, limit and capacity, or heap versus direct buffers.",
    code_language="java",
    code_example="""import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

public class BufferDemo {
    public static void main(String[] args) throws IOException {
        ByteBuffer buf = ByteBuffer.allocate(16);
        System.out.println("start:   pos=" + buf.position() + " lim=" + buf.limit()
            + " cap=" + buf.capacity());

        buf.put((byte) 'A').put((byte) 'B').putInt(100);   // filling mode
        System.out.println("filled:  pos=" + buf.position() + " lim=" + buf.limit());

        buf.flip();                                        // switch to draining mode
        System.out.println("flipped: pos=" + buf.position() + " lim=" + buf.limit());

        System.out.println((char) buf.get() + "" + (char) buf.get() + " " + buf.getInt());

        buf.clear();                                       // ready to fill again

        // Efficient file copy: the channel moves the data itself
        Path src = Path.of("source.bin");
        Path dst = Path.of("target.bin");
        try (FileChannel in = FileChannel.open(src, StandardOpenOption.READ);
             FileChannel out = FileChannel.open(dst, StandardOpenOption.CREATE,
                                                StandardOpenOption.WRITE)) {
            long pos = 0, size = in.size();
            while (pos < size) {                           // transferTo may move less than asked
                pos += in.transferTo(pos, size - pos, out);
            }
            System.out.println("Copied bytes: " + pos);
        } catch (java.nio.file.NoSuchFileException e) {
            System.out.println("Create source.bin first: " + e.getMessage());
        }
    }
}""")

lesson("io-nio", "nio-selectors",
    summary="Serving many connections from one thread with non-blocking channels and a Selector.",
    concept="""A Selector lets one thread manage many channels. Instead of blocking on each connection, you register non-blocking channels with the selector and ask it which of them are ready. This is the foundation of scalable servers.

The steps are:
- Open a Selector with Selector.open.
- Configure each channel as non-blocking with configureBlocking(false), then register it with channel.register(selector, interestOps).
- Loop: call selector.select, which waits until at least one channel is ready, then process selector.selectedKeys.
- For each SelectionKey, check what happened and act on it, then remove the key from the selected set.

The interest operations are:
- OP_ACCEPT: a server channel has an incoming connection.
- OP_CONNECT: a client connection finished connecting.
- OP_READ: data is available to read.
- OP_WRITE: the channel can accept more output.

A key can carry an attachment, such as a per-connection buffer or state object, retrieved with key.attachment. That is how you remember what each connection is doing.

The model is called the reactor pattern: a single event loop reacts to readiness events and dispatches handlers. Handlers must be quick. If one does slow work, every other connection waits, so heavy work is handed to a thread pool.

Writing a correct selector loop by hand is hard: you must handle partial reads and writes, closed connections, buffer management and wakeups. This is why most teams use Netty, Vert.x or the built-in support of a web server. Java 21 virtual threads provide another route, letting you write simple blocking code while the runtime scales to many connections.""",
    realWorld="Web servers, chat servers, API gateways and message brokers use selector-based event loops to hold tens of thousands of idle connections with only a few threads.",
    commonMistakes=[
        "Forgetting to remove the key from selectedKeys, so it is processed again forever",
        "Doing slow or blocking work inside the event loop thread",
        "Ignoring that a read can return -1 when the peer closes the connection",
    ],
    bestPractices=[
        "Use a proven framework such as Netty unless you have a strong reason to write your own loop",
        "Keep handlers short and delegate heavy work to a thread pool",
        "Close channels and cancel keys when a connection ends or an error occurs",
    ],
    interviewRelevance="A frequent topic: how one thread can serve many sockets, what the reactor pattern is, and how this compares to a thread per connection.",
    code_language="java",
    code_example="""import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.channels.*;
import java.util.Iterator;

// A tiny echo server handling many clients on one thread.
public class EchoServer {
    public static void main(String[] args) throws IOException {
        Selector selector = Selector.open();
        ServerSocketChannel server = ServerSocketChannel.open();
        server.bind(new InetSocketAddress(9000));
        server.configureBlocking(false);                    // required for selectors
        server.register(selector, SelectionKey.OP_ACCEPT);

        while (true) {
            selector.select();                              // wait for readiness
            Iterator<SelectionKey> it = selector.selectedKeys().iterator();
            while (it.hasNext()) {
                SelectionKey key = it.next();
                it.remove();                                // always remove the key

                if (key.isAcceptable()) {
                    SocketChannel client = server.accept();
                    client.configureBlocking(false);
                    client.register(selector, SelectionKey.OP_READ);
                } else if (key.isReadable()) {
                    SocketChannel client = (SocketChannel) key.channel();
                    ByteBuffer buf = ByteBuffer.allocate(256);
                    int n = client.read(buf);
                    if (n == -1) {                          // peer closed
                        client.close();
                    } else {
                        buf.flip();
                        client.write(buf);                  // echo back
                    }
                }
            }
        }
    }
}""")
