-- Generated from backend/content-src/java_part2.py. Edit the source, not this file.

UPDATE lessons SET summary = 'What exceptions are, how they propagate, and the Throwable hierarchy.', concept = 'An exception is an object that represents an abnormal event during program execution, such as dividing by zero, reading a missing file or calling a method on null. When one occurs, the normal flow stops and the JVM looks for code that can handle it.

Every exception is an instance of a class in the Throwable hierarchy:
- Throwable is the root. Only Throwable objects can be thrown or caught.
- Error represents serious JVM problems such as OutOfMemoryError and StackOverflowError. Applications normally do not catch these.
- Exception represents conditions an application might reasonably handle.
- RuntimeException is a subclass of Exception for programming bugs such as NullPointerException and IllegalArgumentException.

When a method throws, Java creates the exception object, captures the stack trace, and unwinds the call stack frame by frame until it finds a matching catch block. If none is found, the thread terminates and the stack trace is printed. This unwinding is called propagation.

You raise an exception yourself with the throw keyword, and a method declares checked exceptions it may throw with the throws clause. The stack trace is the most valuable debugging tool you have: it lists the exact chain of calls that led to the failure, with file names and line numbers.

Exceptions exist so that error handling is separated from normal logic. Instead of checking a return code after every call, you write the happy path and handle failures in one place. Used well, this keeps code readable and makes failures impossible to ignore silently.', real_world = 'A web server handles thousands of requests. When one request triggers an exception, the framework catches it, logs the stack trace and returns an HTTP 500 response, while other requests continue unaffected.', common_mistakes = '["Catching Throwable or Exception everywhere, which hides bugs and even catches Errors", "Ignoring the stack trace and printing only the message", "Using exceptions for normal control flow such as ending a loop", "Confusing throw (raises an exception) with throws (declares one)"]', best_practices = '["Throw exceptions early with a clear message that includes the offending value", "Let exceptions propagate until you reach a layer that can actually handle them", "Always log or rethrow with the stack trace intact"]', interview_relevance = 'Interviewers often ask you to draw the Throwable hierarchy, explain Error versus Exception, and describe what happens to the call stack when an exception is thrown.', code_language = 'java', code_example = 'public class ExceptionBasics {

    // ''throws'' is only required for checked exceptions; shown here for illustration
    static int divide(int a, int b) {
        if (b == 0) {
            // Create and throw an exception object with a descriptive message
            throw new ArithmeticException("Cannot divide " + a + " by zero");
        }
        return a / b;
    }

    static int compute() {
        // Not handled here, so the exception propagates to the caller
        return divide(10, 0);
    }

    public static void main(String[] args) {
        try {
            System.out.println(compute());
        } catch (ArithmeticException e) {
            System.out.println("Caught: " + e.getMessage());
            // Prints the chain of calls that led to the failure
            e.printStackTrace();
        }
        System.out.println("Program continues normally");

        // Hierarchy check: ArithmeticException is a RuntimeException, an Exception, a Throwable
        Throwable t = new ArithmeticException();
        System.out.println(t instanceof RuntimeException); // true
    }
}
'
WHERE slug = 'exception-basics' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'exception-handling');

UPDATE lessons SET summary = 'Handling exceptions with try, catch and finally, including multi-catch.', concept = 'A try block wraps code that might throw. One or more catch blocks follow it, each naming the exception type it handles. An optional finally block runs afterwards no matter what happened.

The flow works like this. If the try block completes normally, all catch blocks are skipped. If an exception is thrown, execution jumps immediately to the first catch whose type matches (the exception''s class or one of its superclasses). The remaining lines of the try block are never run.

Order matters. Catch blocks are checked top to bottom, so specific types must come before general ones. Putting catch (Exception e) before catch (IOException e) is a compile error because the second block would be unreachable.

Since Java 7 you can handle several unrelated types in one block with multi-catch: catch (IOException | SQLException e). The types in a multi-catch cannot be related by inheritance.

The finally block is meant for cleanup that must always happen, such as releasing a resource. It runs after a normal completion, after a handled exception, and even after an unhandled one, and even if the try block executes a return. The only common cases where it does not run are System.exit and a JVM crash. Avoid returning from finally, because that silently discards any exception in flight.

You can also rethrow an exception from a catch block, or wrap it in another exception while preserving the original as the cause. A catch block should do something useful: recover, retry, translate, or at least log. An empty catch block is almost always a bug waiting to happen.', real_world = 'A file import feature catches NumberFormatException for each bad row, records the row number in an error report and keeps processing the rest of the file instead of aborting.', common_mistakes = '["Writing an empty catch block that swallows the error", "Placing a general catch before a specific one, causing a compile error", "Returning a value from finally, which overrides exceptions and earlier returns", "Wrapping a huge block of code in one try instead of the few lines that can fail"]', best_practices = '["Catch the most specific exception type you can actually handle", "Keep try blocks small and focused", "Use multi-catch to avoid duplicated handler code", "Pass the original exception as the cause when you wrap it"]', interview_relevance = 'Common questions: does finally run after a return, what is the order of catch blocks, what is multi-catch, and what happens when both try and finally throw.', code_language = 'java', code_example = 'import java.util.List;

public class TryCatchDemo {

    static int parseAndGet(List<String> items, int index) {
        try {
            String raw = items.get(index);        // may throw IndexOutOfBoundsException
            return Integer.parseInt(raw);          // may throw NumberFormatException
        } catch (NumberFormatException e) {
            // Specific handler: the text was not a number
            System.out.println("Not a number: " + e.getMessage());
            return -1;
        } catch (IndexOutOfBoundsException | NullPointerException e) {
            // Multi-catch: unrelated types sharing one handler
            System.out.println("Bad access: " + e.getMessage());
            return -2;
        } finally {
            // Always runs, even though the try and catch blocks return
            System.out.println("Finished attempt for index " + index);
        }
    }

    public static void main(String[] args) {
        List<String> data = List.of("42", "abc");
        System.out.println(parseAndGet(data, 0)); // 42
        System.out.println(parseAndGet(data, 1)); // -1
        System.out.println(parseAndGet(data, 5)); // -2
    }
}
'
WHERE slug = 'try-catch' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'exception-handling');

UPDATE lessons SET summary = 'The difference between checked and unchecked exceptions and when to use each.', concept = 'Java divides exceptions into two groups based on whether the compiler forces you to deal with them.

Checked exceptions are subclasses of Exception that are not subclasses of RuntimeException, for example IOException and SQLException. The compiler enforces the "catch or declare" rule: any code that can throw one must either handle it in a try-catch or declare it with throws. They represent conditions outside the program''s control that a caller can reasonably recover from, such as a missing file or a network failure.

Unchecked exceptions are RuntimeException and its subclasses, plus Error. Examples are NullPointerException, IllegalArgumentException, IllegalStateException and ArrayIndexOutOfBoundsException. The compiler does not require you to handle or declare them. They usually represent programming mistakes, such as passing a bad argument, which the caller should fix in code rather than catch.

A useful rule of thumb: use a checked exception when a reasonable caller can recover, and an unchecked exception when the failure indicates a bug or a violated precondition.

Checked exceptions have drawbacks. They leak implementation details through method signatures, they clutter lambdas (functional interfaces such as Function do not declare checked exceptions), and they push developers toward empty catch blocks. Many modern libraries and frameworks, Spring being a well-known example, prefer unchecked exceptions for this reason. A common technique is to wrap a checked exception in an unchecked one at a layer boundary, keeping the original as the cause.

Whichever kind you choose, be consistent within a codebase and document what a method can throw using the throws clause or Javadoc.', real_world = 'Java''s file API throws checked IOException because disk problems are expected, while a repository layer in a Spring application wraps SQLException in an unchecked DataAccessException so service code stays clean.', common_mistakes = '["Declaring throws Exception on every method to silence the compiler", "Catching a checked exception just to print it and continue", "Using unchecked exceptions for recoverable conditions that callers must know about", "Forgetting that checked exceptions cannot be thrown from a lambda without wrapping"]', best_practices = '["Use checked exceptions for recoverable external failures and unchecked for programming errors", "Wrap checked exceptions in unchecked ones at layer boundaries, keeping the cause", "Declare the narrowest throws clause that is accurate"]', interview_relevance = 'A classic question: what is the difference between checked and unchecked exceptions, give examples, and explain why many frameworks avoid checked exceptions.', code_language = 'java', code_example = 'import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public class CheckedVsUnchecked {

    // Checked: the compiler forces callers to handle or declare IOException
    static String readFirstLine(Path path) throws IOException {
        return Files.readAllLines(path).get(0);
    }

    // Unchecked: no throws clause needed; signals a caller bug
    static void setAge(int age) {
        if (age < 0) {
            throw new IllegalArgumentException("age must be >= 0 but was " + age);
        }
    }

    // Wrapping a checked exception in an unchecked one at a boundary
    static String readOrFail(Path path) {
        try {
            return readFirstLine(path);
        } catch (IOException e) {
            // Keep the original as the cause so the stack trace is not lost
            throw new IllegalStateException("Could not read " + path, e);
        }
    }

    public static void main(String[] args) {
        try {
            System.out.println(readOrFail(Path.of("missing.txt")));
        } catch (IllegalStateException e) {
            System.out.println(e.getMessage() + " / cause: " + e.getCause().getClass().getSimpleName());
        }
        setAge(-5); // throws IllegalArgumentException, no compiler complaint
    }
}
'
WHERE slug = 'checked-unchecked' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'exception-handling');

UPDATE lessons SET summary = 'Designing your own exception classes that carry meaningful context.', concept = 'Java''s built-in exceptions cover general problems, but domain-specific failures deserve their own types. A custom exception makes code self-documenting: catching InsufficientFundsException says far more than catching IllegalStateException.

To create one, extend Exception for a checked exception or RuntimeException for an unchecked one. By convention the class name ends with Exception. Provide constructors that mirror the standard ones: no arguments, a message, a message plus cause, and a cause alone. The cause constructor is important because it lets you wrap a lower-level exception without losing its stack trace.

You can add fields to carry structured data, such as an error code, the account id, or the amount that was missing. Callers can then react programmatically instead of parsing message strings. Make those fields final, since exceptions should be immutable once created.

A well-designed exception hierarchy helps callers choose the granularity they want. For example, an application might define a base AppException with subclasses NotFoundException and ValidationException. Callers can catch the specific subclass or the whole family.

Guidelines for good custom exceptions:
- Create one only when callers will handle it differently from existing types.
- Do not put sensitive data such as passwords in messages, because messages end up in logs.
- Prefer unchecked unless callers genuinely must recover.
- Remember that exceptions are Serializable, so give your class a serialVersionUID if it matters to your project.

Custom exceptions form part of your API contract, so name them and document them as carefully as you would a method.', real_world = 'A banking service defines InsufficientFundsException carrying the current balance and requested amount. The REST layer maps it to an HTTP 409 response with a helpful JSON body.', common_mistakes = '["Creating a new exception class for every small situation", "Omitting the cause constructor so root causes are lost", "Encoding data only in the message string so callers must parse text", "Extending Exception by default when an unchecked type would be better"]', best_practices = '["Provide message and message-plus-cause constructors", "Add immutable fields for data callers need to react", "Build a small hierarchy with a common base for the application", "End class names with Exception"]', interview_relevance = 'You may be asked to write a custom exception on the spot and to justify whether it should be checked or unchecked.', code_language = 'java', code_example = '// Custom checked exception carrying structured data
class InsufficientFundsException extends Exception {
    private final double balance;
    private final double requested;

    public InsufficientFundsException(double balance, double requested) {
        super("Balance " + balance + " is less than requested " + requested);
        this.balance = balance;
        this.requested = requested;
    }

    // Cause-preserving constructor for wrapping lower-level failures
    public InsufficientFundsException(String message, Throwable cause) {
        super(message, cause);
        this.balance = 0;
        this.requested = 0;
    }

    public double getShortfall() {
        return requested - balance;
    }
}

class Account {
    private double balance;

    Account(double balance) { this.balance = balance; }

    void withdraw(double amount) throws InsufficientFundsException {
        if (amount > balance) {
            throw new InsufficientFundsException(balance, amount);
        }
        balance -= amount;
    }
}

public class CustomExceptionDemo {
    public static void main(String[] args) {
        Account account = new Account(100);
        try {
            account.withdraw(250);
        } catch (InsufficientFundsException e) {
            // Callers react using the field, not by parsing the message
            System.out.println("Short by " + e.getShortfall());
        }
    }
}
'
WHERE slug = 'custom-exceptions' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'exception-handling');

UPDATE lessons SET summary = 'Automatic resource cleanup with try-with-resources and AutoCloseable.', concept = 'Resources such as files, sockets, database connections and streams must be closed after use or they leak. Before Java 7, this required a verbose try-finally with a nested try-catch inside finally, and it was easy to get wrong.

Try-with-resources solves this. You declare resources in parentheses after try, and the compiler guarantees each is closed when the block ends, whether it finishes normally or throws:

try (BufferedReader reader = Files.newBufferedReader(path)) { ... }

Any object whose class implements java.lang.AutoCloseable (or its subinterface Closeable) can be used. You can declare several resources separated by semicolons. They are closed in reverse order of declaration, so a resource that depends on an earlier one is closed first. Since Java 9 you can also use an existing effectively final variable in the header: try (reader) { ... }.

Suppressed exceptions are a key benefit. If the body throws an exception and close() also throws, the body''s exception is the one propagated, and the close exception is attached to it as a suppressed exception, retrievable with getSuppressed(). With manual try-finally, the close exception would replace the original and hide the real problem.

A try-with-resources statement can still have catch and finally blocks, which run after the resources have been closed.

To make your own class work with it, implement AutoCloseable and put the cleanup logic in close(). Make close() idempotent where possible, since calling it twice should be harmless.', real_world = 'JDBC code opens a Connection, PreparedStatement and ResultSet in one try-with-resources header, so all three are released even when a query fails, preventing connection pool exhaustion.', common_mistakes = '["Opening a resource outside the header and forgetting to close it", "Assuming resources close in declaration order rather than reverse order", "Ignoring suppressed exceptions when diagnosing failures", "Writing a close() method that throws on a second call"]', best_practices = '["Prefer try-with-resources over manual finally for anything closeable", "Declare several resources in one header and rely on reverse-order closing", "Implement AutoCloseable for your own classes that hold resources"]', interview_relevance = 'Expect questions on how try-with-resources works, the closing order, suppressed exceptions and the difference between AutoCloseable and Closeable.', code_language = 'java', code_example = '// A custom resource that prints when it is opened and closed
class Connection implements AutoCloseable {
    private final String name;

    Connection(String name) {
        this.name = name;
        System.out.println("Open " + name);
    }

    void query(boolean fail) {
        if (fail) {
            throw new IllegalStateException("Query failed on " + name);
        }
        System.out.println("Query ok on " + name);
    }

    @Override
    public void close() {
        // Cleanup logic lives here
        System.out.println("Close " + name);
    }
}

public class TryWithResourcesDemo {
    public static void main(String[] args) {
        // Two resources: closed in reverse order (b first, then a)
        try (Connection a = new Connection("A");
             Connection b = new Connection("B")) {
            a.query(false);
            b.query(true); // throws, but both resources still close
        } catch (IllegalStateException e) {
            System.out.println("Handled: " + e.getMessage());
        } finally {
            System.out.println("Finally runs after resources are closed");
        }
    }
}
'
WHERE slug = 'try-with-resources' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'exception-handling');

UPDATE lessons SET summary = 'Writing concise anonymous functions with lambda syntax.', concept = 'A lambda expression is a compact way to write an anonymous function and pass it around as a value. Introduced in Java 8, lambdas let you treat behaviour as data, which removes the boilerplate of anonymous inner classes.

The syntax is (parameters) -> body. Examples:
- () -> 42 takes no parameters and returns 42.
- x -> x * 2 takes one parameter. Parentheses are optional for a single parameter without a type.
- (a, b) -> a + b takes two parameters. Types are inferred from context.
- (a, b) -> { int sum = a + b; return sum; } uses a block body, which needs an explicit return.

A lambda can only be used where the target type is a functional interface, meaning an interface with exactly one abstract method. The compiler matches the lambda''s shape to that method. This is why Comparator, Runnable and Predicate all accept lambdas.

Lambdas can capture variables from the enclosing scope, but those variables must be final or effectively final, meaning they are never reassigned after initialisation. This restriction exists because the lambda may run later or on another thread, and captured copies must stay consistent. Fields, by contrast, can be modified freely.

Inside a lambda, this refers to the enclosing class instance, not to the lambda itself. That differs from an anonymous inner class, where this is the inner object.

Lambdas are not just shorter. They enable the Stream API, functional-style callbacks and much cleaner event-handling code. Keep them short; if a lambda needs many lines, extract it to a named method and use a method reference.', real_world = 'Sorting a list of orders by total, registering a button click handler or defining a scheduled task are all one-line lambdas instead of several lines of anonymous class code.', common_mistakes = '["Trying to modify a local variable captured by a lambda", "Writing long multi-line lambdas that are hard to read and test", "Assuming this inside a lambda refers to the lambda object", "Using a lambda where the target interface has more than one abstract method"]', best_practices = '["Keep lambdas to one or two lines and extract anything larger", "Let the compiler infer parameter types unless clarity needs them", "Prefer method references when the lambda only calls one method"]', interview_relevance = 'Typical questions: what is a lambda, what is a functional interface, why must captured variables be effectively final, and how do lambdas differ from anonymous classes.', code_language = 'java', code_example = 'import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class LambdaDemo {
    public static void main(String[] args) {
        List<String> names = new ArrayList<>(List.of("Charlie", "alice", "Bob"));

        // Old style: anonymous inner class
        names.sort(new Comparator<String>() {
            @Override
            public int compare(String a, String b) {
                return a.compareToIgnoreCase(b);
            }
        });

        // Lambda: same behaviour, far less noise
        names.sort((a, b) -> b.compareToIgnoreCase(a)); // reverse order

        // Runnable lambda with no parameters
        Runnable greet = () -> System.out.println("Hello from a lambda");
        greet.run();

        // Capturing a local variable: it must be effectively final
        String prefix = "User: ";
        names.forEach(n -> System.out.println(prefix + n));

        // prefix = "Changed"; // would not compile: prefix is captured by the lambda
    }
}
'
WHERE slug = 'lambda-expressions' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'java8-features');

UPDATE lessons SET summary = 'Interfaces with a single abstract method and the built-in java.util.function types.', concept = 'A functional interface is an interface with exactly one abstract method. It may also have default methods, static methods and methods inherited from Object (such as equals), none of which count toward the limit. Functional interfaces are the target types for lambdas and method references.

The optional @FunctionalInterface annotation asks the compiler to verify the rule. It is not required, but it documents intent and prevents someone from accidentally adding a second abstract method and breaking every lambda that uses it.

The java.util.function package supplies the standard set so you rarely need your own:
- Function<T, R> takes a T and returns an R through apply.
- Predicate<T> takes a T and returns a boolean through test.
- Consumer<T> takes a T and returns nothing through accept.
- Supplier<T> takes nothing and returns a T through get.
- UnaryOperator<T> and BinaryOperator<T> are Functions where input and output types match.
- Bi variants (BiFunction, BiConsumer, BiPredicate) take two arguments.
- Primitive variants such as IntPredicate and ToIntFunction avoid boxing overhead.

These interfaces include useful default methods for composition. Predicate offers and, or and negate. Function offers andThen and compose. This lets you build complex behaviour from small pieces.

Older interfaces such as Runnable, Callable and Comparator are also functional. When designing your own API, accept a standard functional interface where one fits, and define a custom one only when you need a meaningful name or a checked exception.', real_world = 'A validation library stores rules as Predicate objects and combines them with and and or, so business rules can be assembled at runtime from configuration.', common_mistakes = '["Defining a custom interface when Function, Predicate or Supplier already fits", "Adding a second abstract method to an interface that lambdas depend on", "Using boxed types like Function<Integer, Integer> in hot loops instead of primitive variants", "Confusing Consumer (no result) with Function (returns a result)"]', best_practices = '["Annotate your own functional interfaces with @FunctionalInterface", "Reuse the java.util.function interfaces before inventing new ones", "Compose small predicates and functions instead of writing one large lambda"]', interview_relevance = 'You will often be asked to name the core functional interfaces, state their method signatures, and explain what makes an interface functional.', code_language = 'java', code_example = 'import java.util.function.BiFunction;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.Supplier;

public class FunctionalInterfacesDemo {

    // A custom functional interface; the annotation makes the compiler check it
    @FunctionalInterface
    interface Validator<T> {
        boolean validate(T value);
    }

    public static void main(String[] args) {
        Function<String, Integer> length = String::length;
        Predicate<String> notEmpty = s -> !s.isEmpty();
        Predicate<String> shortWord = s -> s.length() < 6;
        Consumer<String> printer = s -> System.out.println("-> " + s);
        Supplier<Double> random = Math::random;
        BiFunction<Integer, Integer, Integer> add = (a, b) -> a + b;

        // Composition with default methods
        Predicate<String> valid = notEmpty.and(shortWord);
        Function<String, Integer> doubled = length.andThen(n -> n * 2);

        printer.accept("length of ''java'' = " + length.apply("java"));
        printer.accept("valid ''java''? " + valid.test("java"));
        printer.accept("valid ''programming''? " + valid.test("programming"));
        printer.accept("doubled = " + doubled.apply("abc"));
        printer.accept("sum = " + add.apply(2, 3));

        Validator<Integer> positive = n -> n > 0;
        System.out.println(positive.validate(5) + " " + (random.get() < 1.0));
    }
}
'
WHERE slug = 'functional-interfaces' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'java8-features');

UPDATE lessons SET summary = 'Processing collections declaratively with streams, intermediate and terminal operations.', concept = 'A stream is a sequence of elements that supports aggregate operations such as filter, map and reduce. It is not a data structure: it does not store elements and it never modifies its source. Instead, it describes a pipeline of computation over a source such as a collection, array or generated sequence.

A pipeline has three parts:
- A source, for example list.stream() or Stream.of(1, 2, 3).
- Zero or more intermediate operations that return another stream, such as filter, map, sorted, distinct and limit.
- One terminal operation that produces a result or side effect, such as collect, forEach, count, reduce, anyMatch or findFirst.

Streams are lazy. Intermediate operations do nothing until a terminal operation is invoked, and the elements flow through the whole pipeline one at a time, which allows short-circuiting. For example, findFirst can stop after the first match without processing the rest.

A stream can be consumed only once. Reusing it throws IllegalStateException.

The Collectors class provides ready-made terminal collectors: toList, toSet, joining, groupingBy, partitioningBy and counting, among others. Since Java 16 you can also call toList() directly on a stream.

Primitive streams (IntStream, LongStream, DoubleStream) avoid boxing and add methods like sum and average.

Calling parallelStream() splits work across threads. It can help with large, CPU-heavy, independent tasks, but it adds overhead and is dangerous with shared mutable state. Measure before using it.

Streams make code declarative: you say what you want rather than how to loop. Keep lambdas inside them free of side effects.', real_world = 'An e-commerce backend filters orders from the last week, groups them by customer, and sums totals in a few lines, replacing nested loops and temporary maps.', common_mistakes = '["Reusing a stream after a terminal operation", "Modifying external state from inside map or filter lambdas", "Using parallelStream by default without measuring", "Forgetting a terminal operation, so nothing runs"]', best_practices = '["Keep pipelines short and readable, extracting complex steps into named methods", "Avoid side effects in intermediate operations", "Use primitive streams for numeric work to avoid boxing", "Prefer collect and reduce over mutating shared collections"]', interview_relevance = 'Interviews commonly ask for stream pipelines on lists of objects, plus the difference between intermediate and terminal operations, laziness, map versus flatMap, and when to use parallel streams.', code_language = 'java', code_example = 'import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class StreamDemo {

    record Employee(String name, String dept, double salary) {}

    public static void main(String[] args) {
        List<Employee> staff = List.of(
            new Employee("Asha", "Eng", 120_000),
            new Employee("Ben", "Eng", 95_000),
            new Employee("Chen", "Ops", 70_000),
            new Employee("Dina", "Ops", 82_000));

        // filter -> map -> collect
        List<String> highEarners = staff.stream()
            .filter(e -> e.salary() > 80_000)
            .map(Employee::name)
            .sorted()
            .collect(Collectors.toList());
        System.out.println(highEarners);

        // Group by department and average the salaries
        Map<String, Double> avgByDept = staff.stream()
            .collect(Collectors.groupingBy(Employee::dept,
                     Collectors.averagingDouble(Employee::salary)));
        System.out.println(avgByDept);

        // Terminal operation with a primitive stream
        double total = staff.stream().mapToDouble(Employee::salary).sum();
        System.out.println("Total payroll: " + total);
    }
}
'
WHERE slug = 'stream-api' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'java8-features');

UPDATE lessons SET summary = 'Representing a possibly missing value explicitly with Optional.', concept = 'Optional<T> is a container that either holds a non-null value or is empty. Its purpose is to make the possibility of absence visible in a method''s return type, instead of returning null and hoping callers remember to check. Tony Hoare called null his "billion dollar mistake" because forgotten null checks cause so many NullPointerExceptions.

You create an Optional with three factory methods:
- Optional.of(value) throws NullPointerException if value is null.
- Optional.ofNullable(value) returns an empty Optional for null.
- Optional.empty() returns the empty instance.

Then you work with it in a functional style rather than checking isPresent and calling get:
- map transforms the value if present.
- flatMap transforms with a function that itself returns an Optional, avoiding nesting.
- filter keeps the value only if it matches a predicate.
- orElse(default) returns a fallback value; orElseGet(supplier) computes it lazily; orElseThrow throws if empty.
- ifPresent(consumer) runs an action only when a value exists; Java 9 added ifPresentOrElse and or.

Calling get() on an empty Optional throws NoSuchElementException, so prefer orElse, orElseThrow or map chains.

Optional is intended for return types. Avoid using it for fields, method parameters or collection elements; it is not Serializable, adds allocation overhead and clutters APIs. Never return null from a method whose type is Optional, and never use Optional.of on a value that might be null.

Remember orElse always evaluates its argument, so use orElseGet when the default is expensive to build.', real_world = 'A repository method findByEmail returns Optional<User>. The service maps it to a DTO or throws a not-found exception in a single readable chain.', common_mistakes = '["Calling get() without checking, which just moves the NullPointerException", "Using Optional for fields and method parameters", "Using orElse with an expensive default instead of orElseGet", "Writing if (opt.isPresent()) opt.get() instead of map or ifPresent"]', best_practices = '["Use Optional mainly as a return type for methods that may have no result", "Chain map, filter and orElse instead of branching", "Never return null where an Optional is declared"]', interview_relevance = 'Interviewers ask when to use Optional, the difference between map and flatMap, orElse versus orElseGet, and why Optional should not be used for fields or parameters.', code_language = 'java', code_example = 'import java.util.Map;
import java.util.Optional;

public class OptionalDemo {

    static final Map<Integer, String> USERS = Map.of(1, "alice@example.com", 2, "bob@example.com");

    // The return type tells callers a result may be absent
    static Optional<String> findEmail(int id) {
        return Optional.ofNullable(USERS.get(id));
    }

    public static void main(String[] args) {
        // map and orElse: no null checks needed
        String domain = findEmail(1)
            .map(email -> email.substring(email.indexOf(''@'') + 1))
            .orElse("unknown");
        System.out.println(domain); // example.com

        // Missing value falls back to a default
        System.out.println(findEmail(99).orElse("no email"));

        // orElseGet computes the default only when needed
        String generated = findEmail(99).orElseGet(() -> "user99@example.com");
        System.out.println(generated);

        // ifPresentOrElse (Java 9) handles both cases
        findEmail(2).ifPresentOrElse(
            e -> System.out.println("Found " + e),
            () -> System.out.println("Not found"));

        // orElseThrow for required values
        try {
            findEmail(42).orElseThrow(() -> new IllegalArgumentException("No user 42"));
        } catch (IllegalArgumentException ex) {
            System.out.println(ex.getMessage());
        }
    }
}
'
WHERE slug = 'optional' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'java8-features');

UPDATE lessons SET summary = 'Shorthand for lambdas that just call an existing method.', concept = 'A method reference is a shorthand for a lambda expression that does nothing except call an existing method. It uses the :: operator and often reads more clearly than the equivalent lambda, because it names the method directly.

There are four kinds:
- Static method: ClassName::staticMethod, such as Integer::parseInt, equivalent to s -> Integer.parseInt(s).
- Instance method of a particular object: instance::method, such as System.out::println, equivalent to x -> System.out.println(x).
- Instance method of an arbitrary object of a given type: ClassName::instanceMethod, such as String::toUpperCase, equivalent to s -> s.toUpperCase(). The first lambda parameter becomes the receiver.
- Constructor: ClassName::new, such as ArrayList::new, equivalent to () -> new ArrayList<>(). Array constructors work too: int[]::new.

The compiler works out which form applies by matching the method''s signature against the functional interface''s abstract method. With a BiFunction<String, String, Boolean>, String::equals works because the first argument is the receiver and the second is the parameter.

Method references are most useful in stream pipelines: map(String::trim), filter(Objects::nonNull), forEach(System.out::println) and collect(Collectors.toCollection(TreeSet::new)).

Choose a method reference when it improves readability. If you need to adjust arguments, add a constant or call more than one method, a lambda is clearer. Overloaded methods can occasionally make a reference ambiguous, in which case the compiler reports an error and you should fall back to a lambda with explicit types.', real_world = 'Code that converts a list of DTOs to entities uses map(Entity::fromDto), and logging pipelines use forEach(logger::info), keeping data transformation readable.', common_mistakes = '["Forcing a method reference when a lambda would be clearer", "Confusing the unbound form (String::length) with the bound form (str::length)", "Putting parentheses after the method name, as in String::length()", "Hitting ambiguity with overloaded methods and not falling back to a lambda"]', best_practices = '["Replace a lambda with a method reference when it only forwards its arguments", "Use constructor references with collectors and suppliers", "Name small helper methods so they can be referenced cleanly"]', interview_relevance = 'You may be asked to list the four kinds of method reference and to rewrite a given lambda as a method reference and back.', code_language = 'java', code_example = 'import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.stream.Collectors;

public class MethodReferenceDemo {

    static boolean isLong(String s) {
        return s.length() > 4;
    }

    public static void main(String[] args) {
        List<String> words = List.of(" apple ", "fig", " banana ", "kiwi");

        // 1. Static method reference
        Function<String, Integer> parse = Integer::parseInt;
        System.out.println(parse.apply("123") + 1);

        // 2. Arbitrary object of a type: the stream element is the receiver
        List<String> trimmed = words.stream()
            .map(String::trim)
            .collect(Collectors.toList());

        // 3. Bound instance reference: System.out is a specific object
        trimmed.forEach(System.out::println);

        // Reference to our own static helper
        long longCount = trimmed.stream().filter(MethodReferenceDemo::isLong).count();
        System.out.println("long words: " + longCount);

        // 4. Constructor references
        Supplier<List<String>> listMaker = java.util.ArrayList::new;
        List<String> fresh = listMaker.get();
        Set<String> sorted = trimmed.stream().collect(Collectors.toCollection(TreeSet::new));
        System.out.println(fresh.size() + " " + sorted);
    }
}
'
WHERE slug = 'method-references' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'java8-features');

UPDATE lessons SET summary = 'Working with dates, times, durations and time zones using java.time.', concept = 'Java 8 introduced the java.time package to replace the troubled java.util.Date and Calendar classes. The old classes were mutable, not thread-safe, had confusing month indexing starting at zero and mixed dates with time zones. The new API, inspired by Joda-Time, is immutable, thread-safe and clearly designed.

The core types:
- LocalDate holds a date without time or zone, such as 2026-03-15.
- LocalTime holds a time of day without a date.
- LocalDateTime combines date and time, still with no zone.
- ZonedDateTime adds a ZoneId such as Europe/Paris and handles daylight saving rules.
- Instant is a point on the UTC timeline, measured from the epoch. It is ideal for timestamps.
- Duration measures time-based amounts (hours, seconds), while Period measures date-based amounts (years, months, days).

All instances are immutable, so methods like plusDays, minusHours and withMonth return a new object. Forgetting to use the return value is a common bug.

Create values with factory methods: LocalDate.of(2026, 3, 15), LocalDate.now(), or parse a string with LocalDate.parse("2026-03-15"). Use DateTimeFormatter to format and parse custom patterns, for example DateTimeFormatter.ofPattern("dd/MM/yyyy"). Formatters are thread-safe, unlike SimpleDateFormat.

ChronoUnit.DAYS.between(a, b) computes the distance between two points in a chosen unit.

Practical guidance: store and transmit timestamps as Instant or UTC, and convert to a ZonedDateTime only for display in the user''s zone. Choose the least specific type that models your data; a birthday is a LocalDate, not a timestamp.', real_world = 'A booking system stores reservation start times as UTC Instants and converts them to the hotel''s local ZonedDateTime for display, avoiding daylight-saving bugs.', common_mistakes = '["Ignoring the returned object from plusDays and similar methods", "Using LocalDateTime for a moment in time that needs a time zone", "Mixing Period and Duration for the wrong kind of amount", "Continuing to use SimpleDateFormat, which is not thread-safe"]', best_practices = '["Store timestamps in UTC with Instant and convert at the edges", "Pick the narrowest type that fits, such as LocalDate for birthdays", "Share DateTimeFormatter constants since they are immutable", "Inject a Clock to make time-dependent code testable"]', interview_relevance = 'Common questions: why java.time replaced Date and Calendar, the difference between LocalDateTime and ZonedDateTime, and Duration versus Period.', code_language = 'java', code_example = 'import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

public class DateTimeDemo {
    public static void main(String[] args) {
        LocalDate launch = LocalDate.of(2026, 3, 15);
        LocalDate later = launch.plusMonths(2).plusDays(10); // immutable: returns new object
        System.out.println(launch + " -> " + later);

        // Date-based versus time-based amounts
        Period gap = Period.between(launch, later);
        Duration meeting = Duration.ofMinutes(90);
        System.out.println(gap.getMonths() + " months, " + gap.getDays() + " days");
        System.out.println(meeting.toHours() + "h " + meeting.toMinutesPart() + "m");
        System.out.println(ChronoUnit.DAYS.between(launch, later) + " days apart");

        // Formatting and parsing with a custom pattern
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
        LocalDateTime start = LocalDateTime.of(2026, 3, 15, 9, 30);
        System.out.println(start.format(fmt));

        // Same instant shown in two time zones
        Instant now = Instant.parse("2026-03-15T09:30:00Z");
        ZonedDateTime paris = now.atZone(ZoneId.of("Europe/Paris"));
        ZonedDateTime tokyo = now.atZone(ZoneId.of("Asia/Tokyo"));
        System.out.println(paris + " | " + tokyo);
    }
}
'
WHERE slug = 'date-time-api' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'java8-features');

UPDATE lessons SET summary = 'Creating and starting threads with Thread and Runnable.', concept = 'A thread is an independent path of execution within a program. All threads in a process share the same heap memory, but each has its own call stack. Multithreading lets a program do several things at once, for example serving many requests or keeping a user interface responsive while background work runs.

There are two classic ways to define the work:
- Implement Runnable and pass it to a Thread constructor. This is preferred, because it separates the task from the mechanism of running it and leaves your class free to extend something else.
- Extend Thread and override run. This works but ties the task to the thread.

Since Runnable is a functional interface, a lambda is usually the neatest form: new Thread(() -> doWork()).

The most important rule: call start(), not run(). start() asks the JVM to create a new thread, which then calls run(). Calling run() directly just executes the method on the current thread, with no concurrency at all. Calling start() twice on the same thread throws IllegalThreadStateException.

Useful methods include join(), which makes the caller wait for a thread to finish, sleep(ms), which pauses the current thread, and setName and getName for debugging. A daemon thread (setDaemon(true)) does not prevent the JVM from exiting; the program ends when all non-daemon threads finish.

Threads run in a nondeterministic order decided by the scheduler, so output from several threads may interleave differently on every run. Never rely on timing for correctness.

Creating raw threads is fine for learning and simple tasks, but production code usually uses executors, covered later, to manage thread creation and reuse. Java 21 also introduced virtual threads as lightweight alternatives.', real_world = 'A desktop application runs a file download on a background thread so the UI thread stays responsive, then updates a progress bar as chunks arrive.', common_mistakes = '["Calling run() instead of start(), so no new thread is created", "Starting the same Thread object twice", "Assuming threads execute in the order they were started", "Forgetting join() and reading results before the thread has finished"]', best_practices = '["Prefer Runnable or lambdas over extending Thread", "Give threads meaningful names to simplify debugging", "Use join() when you need a thread''s result before continuing", "Prefer executors over manually managing many threads"]', interview_relevance = 'Classic questions: Runnable versus Thread, start versus run, what join does, daemon versus user threads.', code_language = 'java', code_example = 'public class ThreadsBasics {

    // A task defined as a Runnable
    static class Printer implements Runnable {
        private final String label;

        Printer(String label) { this.label = label; }

        @Override
        public void run() {
            for (int i = 1; i <= 3; i++) {
                System.out.println(label + " step " + i
                        + " on " + Thread.currentThread().getName());
            }
        }
    }

    public static void main(String[] args) throws InterruptedException {
        Thread t1 = new Thread(new Printer("A"), "worker-1");
        Thread t2 = new Thread(() -> System.out.println("Lambda task on "
                + Thread.currentThread().getName()), "worker-2");

        t1.start();   // creates a new thread that calls run()
        t2.start();

        // t1.run() would execute on the main thread instead: no concurrency

        t1.join();    // main waits for both threads to finish
        t2.join();
        System.out.println("All workers done, back on " + Thread.currentThread().getName());
    }
}
'
WHERE slug = 'threads-basics' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'multithreading');

UPDATE lessons SET summary = 'The states a thread moves through, from NEW to TERMINATED.', concept = 'Every Java thread is in exactly one of six states, defined by the Thread.State enum. You can inspect it with getState().

- NEW: the Thread object exists but start() has not been called.
- RUNNABLE: the thread is running or is ready to run and waiting for CPU time. Java does not distinguish between actually running and waiting for the scheduler.
- BLOCKED: the thread is waiting to acquire a monitor lock held by another thread, for instance when entering a synchronized block.
- WAITING: the thread waits indefinitely for another thread to act. It enters this state through Object.wait(), Thread.join() or LockSupport.park().
- TIMED_WAITING: like WAITING but with a timeout, such as sleep(ms), wait(ms) or join(ms).
- TERMINATED: run() has finished, either normally or by an uncaught exception. A terminated thread cannot be restarted.

Transitions follow from the actions above: start() moves NEW to RUNNABLE; contending for a lock moves RUNNABLE to BLOCKED and back once the lock is acquired; wait and notify move a thread between WAITING and RUNNABLE.

Interruption is the cooperative cancellation mechanism. Calling interrupt() sets the thread''s interrupt flag. Blocking methods such as sleep and wait respond by throwing InterruptedException. Your code should treat that as a request to stop: either exit cleanly or restore the flag with Thread.currentThread().interrupt(). Never swallow InterruptedException silently.

Understanding states is essential for diagnosing problems. A thread dump (jstack) showing many BLOCKED threads suggests lock contention or deadlock, while many WAITING threads may point to a missing notification or a stalled dependency.', real_world = 'When a production service hangs, engineers capture a thread dump and look at thread states. A pile of BLOCKED threads on the same lock points straight to the contention hot spot.', common_mistakes = '["Swallowing InterruptedException with an empty catch block", "Trying to restart a TERMINATED thread", "Confusing BLOCKED (waiting for a lock) with WAITING (waiting for a signal)", "Using Thread.stop, which is deprecated and unsafe"]', best_practices = '["Handle interruption by stopping work or restoring the interrupt flag", "Use thread dumps to diagnose hangs", "Use cooperative cancellation through interrupt rather than forced stops"]', interview_relevance = 'Interviewers ask you to list the thread states, explain BLOCKED versus WAITING, and describe how interruption works.', code_language = 'java', code_example = 'public class ThreadLifecycleDemo {
    public static void main(String[] args) throws InterruptedException {
        Object lock = new Object();

        Thread sleeper = new Thread(() -> {
            try {
                Thread.sleep(2000);               // TIMED_WAITING
            } catch (InterruptedException e) {
                // Interrupted: respond by finishing the task
                System.out.println("Sleeper interrupted, flag restored? "
                        + Thread.currentThread().isInterrupted());
            }
        });

        Thread waiter = new Thread(() -> {
            synchronized (lock) {
                try {
                    lock.wait();                  // WAITING until notified
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt(); // restore the flag
                }
            }
        });

        System.out.println("sleeper before start: " + sleeper.getState()); // NEW
        sleeper.start();
        waiter.start();
        Thread.sleep(200);                        // give them time to block

        System.out.println("sleeper: " + sleeper.getState()); // TIMED_WAITING
        System.out.println("waiter:  " + waiter.getState());  // WAITING

        sleeper.interrupt();
        synchronized (lock) { lock.notify(); }
        sleeper.join();
        waiter.join();
        System.out.println("sleeper after join: " + sleeper.getState()); // TERMINATED
    }
}
'
WHERE slug = 'thread-lifecycle' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'multithreading');

UPDATE lessons SET summary = 'Protecting shared data with synchronized, monitors and volatile.', concept = 'When several threads read and modify the same data, results can be wrong. A race condition occurs when the outcome depends on the unpredictable timing of threads. The classic example is count++, which is really three steps (read, add, write). Two threads can read the same value and both write back the same result, losing an update.

Synchronization fixes this with mutual exclusion. Every Java object has an intrinsic lock, also called a monitor. The synchronized keyword makes a thread acquire that lock before running the guarded code and release it afterwards. Only one thread can hold a given lock at a time.

You can use it in two ways:
- A synchronized method locks on this (or on the Class object for a static method).
- A synchronized block locks on an object you choose, which is more flexible and lets you hold the lock for as short a time as possible.

Synchronization also gives visibility. When a thread releases a lock, its changes become visible to the next thread that acquires the same lock. This relationship is part of the Java Memory Model, called happens-before.

The volatile keyword provides visibility and ordering for a single variable but not atomicity. It is right for a stop flag, but not for count++.

The wait, notify and notifyAll methods let threads coordinate through a monitor. They must be called while holding the lock, and wait should always sit inside a loop that rechecks its condition.

Dangers include deadlock, where threads hold locks and wait for each other in a cycle. Avoid it by always acquiring multiple locks in the same global order, and keep synchronized sections small to limit contention.', real_world = 'A ticket-booking service must ensure two buyers cannot take the same seat. Guarding the seat-assignment step with a lock makes the check and the update one indivisible action.', common_mistakes = '["Synchronizing on different objects and expecting mutual exclusion", "Assuming volatile makes count++ thread-safe", "Locking on a public object or a string literal that other code might also lock", "Acquiring multiple locks in inconsistent order, causing deadlock"]', best_practices = '["Lock on a private final object instead of this", "Keep synchronized blocks as short as possible", "Acquire multiple locks in a consistent global order", "Call wait inside a while loop that rechecks the condition"]', interview_relevance = 'Expect questions on race conditions, synchronized method versus block, volatile versus synchronized, deadlock and how to prevent it.', code_language = 'java', code_example = 'public class SynchronizationDemo {

    static class Counter {
        private int count = 0;
        private final Object lock = new Object(); // private lock object

        // Without synchronization, increments from two threads can be lost
        void increment() {
            synchronized (lock) {
                count++;          // read-modify-write is now atomic with respect to the lock
            }
        }

        int get() {
            synchronized (lock) { // same lock gives visibility of the latest value
                return count;
            }
        }
    }

    public static void main(String[] args) throws InterruptedException {
        Counter counter = new Counter();

        Runnable task = () -> {
            for (int i = 0; i < 100_000; i++) {
                counter.increment();
            }
        };

        Thread a = new Thread(task);
        Thread b = new Thread(task);
        a.start();
        b.start();
        a.join();
        b.join();

        // Always 200000 with synchronization; usually less without it
        System.out.println("Final count: " + counter.get());
    }
}
'
WHERE slug = 'synchronization' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'multithreading');

UPDATE lessons SET summary = 'Explicit locks from java.util.concurrent.locks, including ReentrantLock and ReadWriteLock.', concept = 'The java.util.concurrent.locks package provides explicit locks that offer more control than the synchronized keyword. The main implementation is ReentrantLock.

Its basic use follows a strict pattern:

lock.lock();
try { ... } finally { lock.unlock(); }

The unlock call must be in a finally block, because unlike synchronized, an explicit lock is not released automatically if an exception occurs. Forgetting this is the most common bug.

Why choose ReentrantLock over synchronized?
- tryLock() attempts to acquire without blocking, and tryLock(timeout, unit) waits only for a limited time. This helps avoid deadlock.
- lockInterruptibly() lets a waiting thread be interrupted.
- A fairness option (new ReentrantLock(true)) grants the lock to the longest-waiting thread, at some cost in throughput.
- Condition objects, created with lock.newCondition(), act like multiple wait sets, giving await and signal with finer control than wait and notify.

Reentrant means the thread that holds the lock can acquire it again without deadlocking itself; the lock tracks a hold count and must be unlocked the same number of times.

ReadWriteLock, implemented by ReentrantReadWriteLock, allows many readers at once but only one writer. It improves performance for data that is read far more often than written. StampedLock adds optimistic reads for even higher read performance, but it is not reentrant.

Use synchronized for simple cases, because it is concise and cannot leak a lock. Reach for explicit locks when you need timeouts, interruption, fairness, multiple conditions or read-write separation.', real_world = 'An in-memory cache uses a ReadWriteLock so hundreds of request threads can read concurrently, while the occasional refresh takes the write lock briefly.', common_mistakes = '["Calling unlock outside a finally block, leaking the lock on exceptions", "Calling lock() inside the try block, which can unlock a lock never acquired", "Unlocking fewer or more times than locking with reentrant acquisition", "Using a read-write lock where writes are frequent and gain nothing"]', best_practices = '["Always follow lock() with try and finally unlock()", "Use tryLock with a timeout to prevent indefinite blocking", "Prefer synchronized unless you need a capability only explicit locks provide", "Keep critical sections small"]', interview_relevance = 'Common questions: ReentrantLock versus synchronized, what reentrant means, how tryLock helps avoid deadlock, and when to use ReadWriteLock.', code_language = 'java', code_example = 'import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

public class LocksDemo {

    private final Lock lock = new ReentrantLock();
    private int balance = 100;

    boolean withdraw(int amount) throws InterruptedException {
        // Give up after one second instead of blocking forever
        if (!lock.tryLock(1, TimeUnit.SECONDS)) {
            return false;
        }
        try {                       // lock acquired, so try/finally is correct here
            if (balance >= amount) {
                balance -= amount;
                return true;
            }
            return false;
        } finally {
            lock.unlock();          // always released, even on exceptions
        }
    }

    // Many readers at once, a single exclusive writer
    private final ReentrantReadWriteLock rw = new ReentrantReadWriteLock();
    private final Map<String, String> cache = new HashMap<>();

    String read(String key) {
        rw.readLock().lock();
        try { return cache.get(key); } finally { rw.readLock().unlock(); }
    }

    void write(String key, String value) {
        rw.writeLock().lock();
        try { cache.put(key, value); } finally { rw.writeLock().unlock(); }
    }

    public static void main(String[] args) throws InterruptedException {
        LocksDemo demo = new LocksDemo();
        System.out.println(demo.withdraw(30)); // true
        System.out.println(demo.withdraw(90)); // false
        demo.write("k", "v");
        System.out.println(demo.read("k"));
    }
}
'
WHERE slug = 'locks' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'multithreading');

UPDATE lessons SET summary = 'Managing thread pools with ExecutorService instead of raw threads.', concept = 'Creating a new thread for every task is expensive and unbounded: thousands of threads can exhaust memory. The Executor framework separates task submission from execution policy. You submit tasks, and a pool of reusable worker threads runs them.

ExecutorService is the main interface. The Executors factory class creates common pools:
- newFixedThreadPool(n): a fixed number of threads with an unbounded queue, good for steady CPU-bound work.
- newCachedThreadPool(): grows as needed and reuses idle threads, suited to many short tasks.
- newSingleThreadExecutor(): runs tasks one at a time in order.
- newScheduledThreadPool(n): runs tasks after a delay or periodically.
- newVirtualThreadPerTaskExecutor() in Java 21: one lightweight virtual thread per task.

You submit work with execute(Runnable) or submit, which accepts a Runnable or a Callable and returns a Future. A Callable, unlike Runnable, can return a value and throw checked exceptions. Calling future.get() blocks until the result is ready and wraps any task failure in an ExecutionException. invokeAll runs a collection of Callables and waits for all of them.

Shutdown is crucial. Pool threads are non-daemon, so a program will not exit until you call shutdown(), which finishes queued tasks, or shutdownNow(), which tries to interrupt running ones. The standard idiom is shutdown followed by awaitTermination. Since Java 19 ExecutorService implements AutoCloseable, so try-with-resources shuts it down automatically.

For production, consider constructing ThreadPoolExecutor directly to control queue size, thread count and rejection policy, because the unbounded queues behind the factory methods can hide overload.', real_world = 'A web server dispatches each incoming request to a pool of, say, 200 worker threads. Requests beyond capacity wait in a queue or are rejected, protecting the server from overload.', common_mistakes = '["Forgetting to call shutdown, so the application never exits", "Calling future.get() immediately after each submit, which serialises the work", "Using an unbounded queue or cached pool under heavy load, causing memory exhaustion", "Ignoring exceptions thrown inside submitted tasks"]', best_practices = '["Size pools according to workload: about CPU count for CPU-bound, larger for I/O-bound", "Always shut down executors, ideally with try-with-resources or finally", "Use ThreadPoolExecutor with a bounded queue in production", "Name your threads with a ThreadFactory for easier debugging"]', interview_relevance = 'Interviewers ask why pools beat raw threads, Runnable versus Callable, what a Future is, how to shut down cleanly, and how to choose a pool size.', code_language = 'java', code_example = 'import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

public class ExecutorsDemo {
    public static void main(String[] args) throws InterruptedException, ExecutionException {
        ExecutorService pool = Executors.newFixedThreadPool(3);
        try {
            List<Future<Integer>> futures = new ArrayList<>();

            // Submit all tasks first so they run in parallel
            for (int i = 1; i <= 5; i++) {
                final int n = i;
                Callable<Integer> task = () -> {
                    Thread.sleep(100);               // simulate work
                    return n * n;
                };
                futures.add(pool.submit(task));
            }

            // Then collect the results
            int total = 0;
            for (Future<Integer> f : futures) {
                total += f.get();                    // blocks until this result is ready
            }
            System.out.println("Sum of squares: " + total); // 55
        } finally {
            pool.shutdown();                         // stop accepting new tasks
            if (!pool.awaitTermination(5, TimeUnit.SECONDS)) {
                pool.shutdownNow();                  // force stop if tasks hang
            }
        }
    }
}
'
WHERE slug = 'executors' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'multithreading');

UPDATE lessons SET summary = 'Thread-safe collections such as ConcurrentHashMap, CopyOnWriteArrayList and BlockingQueue.', concept = 'Standard collections like HashMap and ArrayList are not thread-safe. Concurrent modification can corrupt their internal state or throw ConcurrentModificationException. You could wrap them with Collections.synchronizedMap, which locks the entire collection on every call, but that causes heavy contention and does not make compound actions such as check-then-put atomic. The java.util.concurrent package offers purpose-built alternatives.

- ConcurrentHashMap supports highly concurrent reads and updates without locking the whole map. It does not allow null keys or values. Its atomic methods putIfAbsent, computeIfAbsent, merge and compute let you do compound operations safely, replacing risky check-then-act code.
- CopyOnWriteArrayList creates a fresh copy of its array on every write. Iteration is lock-free and never fails, which suits lists that are read often and modified rarely, such as listener lists.
- ConcurrentLinkedQueue and ConcurrentLinkedDeque are non-blocking queues for high throughput.
- BlockingQueue, with implementations ArrayBlockingQueue and LinkedBlockingQueue, blocks producers when full and consumers when empty. It is the backbone of the producer-consumer pattern, using put and take.
- ConcurrentSkipListMap provides a sorted concurrent map.

Iterators on these collections are weakly consistent: they will not throw ConcurrentModificationException, but they may or may not reflect changes made after they were created.

Remember that thread-safe collections protect individual operations, not sequences of them. Two separate calls such as get followed by put still race unless you use the atomic compound methods.', real_world = 'A word-frequency counter used by many worker threads stores counts in a ConcurrentHashMap and updates them with merge, avoiding any explicit locking.', common_mistakes = '["Using get followed by put on a ConcurrentHashMap instead of an atomic method", "Putting null keys or values in a ConcurrentHashMap", "Using CopyOnWriteArrayList for write-heavy workloads", "Assuming a synchronized wrapper makes iteration safe without extra locking"]', best_practices = '["Use merge, compute and computeIfAbsent for atomic updates", "Choose a BlockingQueue for producer-consumer hand-off", "Pick the collection to match the read and write ratio"]', interview_relevance = 'Common questions: how ConcurrentHashMap differs from Hashtable and synchronizedMap, when to use CopyOnWriteArrayList, and how BlockingQueue implements producer-consumer.', code_language = 'java', code_example = 'import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;

public class ConcurrentCollectionsDemo {
    public static void main(String[] args) throws InterruptedException {
        // Atomic counting from several threads, no explicit lock
        ConcurrentHashMap<String, Integer> counts = new ConcurrentHashMap<>();
        Runnable counter = () -> {
            for (int i = 0; i < 1000; i++) {
                counts.merge("hits", 1, Integer::sum); // atomic read-modify-write
            }
        };
        Thread t1 = new Thread(counter);
        Thread t2 = new Thread(counter);
        t1.start(); t2.start();
        t1.join(); t2.join();
        System.out.println("hits = " + counts.get("hits")); // 2000

        // Producer-consumer with a bounded blocking queue
        BlockingQueue<Integer> queue = new LinkedBlockingQueue<>(2);

        Thread producer = new Thread(() -> {
            try {
                for (int i = 1; i <= 5; i++) {
                    queue.put(i);              // blocks when the queue is full
                }
                queue.put(-1);                 // sentinel value: no more items
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });

        Thread consumer = new Thread(() -> {
            try {
                int item;
                while ((item = queue.take()) != -1) { // blocks when empty
                    System.out.println("Consumed " + item);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });

        producer.start(); consumer.start();
        producer.join(); consumer.join();
    }
}
'
WHERE slug = 'concurrent-collections' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'multithreading');

UPDATE lessons SET summary = 'Composing asynchronous, non-blocking tasks with CompletableFuture.', concept = 'A plain Future represents a result that will exist later, but it offers only blocking get() and no way to chain further work. CompletableFuture, introduced in Java 8, implements Future and CompletionStage and lets you build asynchronous pipelines declaratively, much like streams do for collections.

You start work with static factories:
- supplyAsync(supplier) runs a task that returns a value.
- runAsync(runnable) runs a task with no result.
By default these run on the common ForkJoinPool; pass an Executor as a second argument to control the threads, which is wise for blocking I/O.

Then you chain stages without blocking:
- thenApply transforms the result (like map).
- thenCompose chains another asynchronous step that returns a CompletableFuture (like flatMap).
- thenAccept consumes the result, and thenRun runs an action afterwards.
- thenCombine merges the results of two independent futures.
- allOf waits for many futures, and anyOf completes when the first one does.

Errors do not throw at the call site. An exception completes the future exceptionally and propagates down the chain. You handle it with exceptionally (recover with a value), handle (inspect result or error) or whenComplete (observe either). Calling join() or get() at the end surfaces the failure: join throws CompletionException, get throws ExecutionException.

Methods ending in Async run the next stage on another thread; the plain versions may run on the completing thread.

CompletableFuture shines when you call several independent services and combine their answers, cutting total latency to roughly the slowest call rather than the sum.', real_world = 'A product page fetches price, stock and reviews from three services concurrently, combines them with thenCombine and returns one response in the time of the slowest call.', common_mistakes = '["Calling get or join immediately after every stage, losing the benefit of async", "Running blocking I/O on the common pool and starving other tasks", "Forgetting error handling so failures silently disappear until join", "Using thenApply where thenCompose is needed, producing nested futures"]', best_practices = '["Supply a dedicated Executor for blocking operations", "Add exceptionally or handle to every pipeline", "Use thenCompose for dependent async steps and thenCombine for independent ones", "Add timeouts with orTimeout or completeOnTimeout (Java 9+)"]', interview_relevance = 'Interviewers ask how CompletableFuture improves on Future, the difference between thenApply and thenCompose, and how errors propagate through a pipeline.', code_language = 'java', code_example = 'import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class CompletableFutureDemo {

    static int fetchPrice() {
        sleep(300);
        return 100;
    }

    static int fetchTax() {
        sleep(200);
        return 15;
    }

    static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }

    public static void main(String[] args) {
        ExecutorService pool = Executors.newFixedThreadPool(4);
        try {
            // Two independent calls run concurrently
            CompletableFuture<Integer> price = CompletableFuture.supplyAsync(CompletableFutureDemo::fetchPrice, pool);
            CompletableFuture<Integer> tax = CompletableFuture.supplyAsync(CompletableFutureDemo::fetchTax, pool);

            // Combine both results, then transform and handle errors
            CompletableFuture<String> result = price
                .thenCombine(tax, Integer::sum)
                .thenApply(total -> "Total: " + total)
                .exceptionally(ex -> "Failed: " + ex.getMessage());

            System.out.println(result.join()); // waits only at the very end
        } finally {
            pool.shutdown();
        }
    }
}
'
WHERE slug = 'completable-future' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'multithreading');

UPDATE lessons SET summary = 'Strategies for writing correct concurrent code: immutability, atomics and confinement.', concept = 'A class is thread-safe if it behaves correctly when accessed from multiple threads, with no extra synchronization required by callers. Thread safety problems come from shared mutable state, so most strategies aim to remove one of those two ingredients.

Main strategies, roughly in order of preference:
- Avoid sharing: keep data local to a method or confine it to one thread. Local variables live on a thread''s own stack and are always safe. ThreadLocal gives each thread its own copy of a value.
- Immutability: an object whose state cannot change after construction can be shared freely. Make fields private and final, do not expose mutable internals, and do not provide setters. String, Integer and records are good examples. Defensive copies protect mutable inputs.
- Atomic classes: AtomicInteger, AtomicLong and AtomicReference use hardware compare-and-swap to perform lock-free atomic updates such as incrementAndGet. LongAdder scales better under heavy contention.
- Synchronization: use synchronized or explicit locks to guard shared mutable state, always using the same lock for the same data.
- Thread-safe collections and higher-level utilities: ConcurrentHashMap, BlockingQueue, CountDownLatch, Semaphore and executors.

Key pitfalls beyond race conditions include visibility problems, where one thread does not see another''s writes without proper synchronization or volatile, unsafe publication, where a reference escapes before an object is fully built (for example leaking this from a constructor), and deadlock.

Document the thread-safety guarantees of your classes. Prefer higher-level utilities over hand-written wait and notify, and test with stress tests, since concurrency bugs often appear only under load.', real_world = 'A request-counting metric uses LongAdder, and configuration objects are immutable and replaced wholesale, so thousands of threads can read them without any locks.', common_mistakes = '["Assuming a class is thread-safe because its individual methods are synchronized, ignoring compound actions", "Leaking this from a constructor so another thread sees a half-built object", "Sharing a non-thread-safe object such as SimpleDateFormat across threads", "Using lazy initialisation without synchronization (broken double-checked locking)"]', best_practices = '["Prefer immutable objects and confined state before reaching for locks", "Use atomic classes and concurrent collections for simple shared state", "Document the thread-safety contract of each class", "Stress-test concurrent code"]', interview_relevance = 'Common prompts: define thread safety, make a class immutable, explain atomic classes and compare-and-swap, and write a thread-safe singleton.', code_language = 'java', code_example = 'import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

public class ThreadSafetyDemo {

    // Immutable: final fields, no setters, defensive copy of the list
    static final class Order {
        private final String id;
        private final List<String> items;

        Order(String id, List<String> items) {
            this.id = id;
            this.items = List.copyOf(items); // protects against outside modification
        }

        String id() { return id; }
        List<String> items() { return items; } // unmodifiable, safe to share
    }

    // Thread-safe lazy singleton using the holder idiom
    static class Config {
        private Config() {}
        private static class Holder { static final Config INSTANCE = new Config(); }
        static Config getInstance() { return Holder.INSTANCE; }
    }

    public static void main(String[] args) throws InterruptedException {
        AtomicInteger hits = new AtomicInteger();   // lock-free atomic counter

        Runnable task = () -> {
            for (int i = 0; i < 50_000; i++) {
                hits.incrementAndGet();             // atomic compare-and-swap update
            }
        };
        Thread a = new Thread(task);
        Thread b = new Thread(task);
        a.start(); b.start();
        a.join(); b.join();

        System.out.println("hits = " + hits.get()); // always 100000
        System.out.println(new Order("A1", List.of("pen", "book")).items());
        System.out.println(Config.getInstance() == Config.getInstance()); // true
    }
}
'
WHERE slug = 'thread-safety' AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id WHERE t.slug = 'java' AND s.slug = 'multithreading');
