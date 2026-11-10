"""Java track, part 1: Core Java (except arrays), OOP, Collections.

Source of truth for the Java content migration. Regenerate with:  python3 backend/content-src/generate_sql.py <version> java_part1
Plain text only (the lesson page does not render markdown); "- " lines are bullets.
"""

TRACK = "java"

# (section_slug, lesson_slug) -> content
LESSONS = {}


def lesson(section, slug, **fields):
    LESSONS[(section, slug)] = fields


# ───────────────────────── Core Java ─────────────────────────

lesson("core-java", "variables-types",
    summary="Declaring variables and choosing between Java's primitive and reference types.",
    concept="""Java is statically typed: every variable has a type that is fixed at compile time, and the compiler rejects code that mixes types incorrectly. This catches a whole class of bugs before the program ever runs.

Java has two families of types:
- Primitive types hold a raw value directly. There are eight: byte, short, int, long, float, double, char and boolean.
- Reference types hold a reference to an object stored on the heap. Examples are String, arrays, and every class you write.

The most common primitives are int (32-bit whole numbers), long (64-bit whole numbers, written with an L suffix such as 5L), double (64-bit decimals), boolean (true or false) and char (a single UTF-16 character in single quotes).

A variable is declared with its type and a name, and a local variable must be assigned before it is used. Since Java 10 you can write var for local variables and let the compiler infer the type from the right-hand side, but the variable is still statically typed.

Widening conversions, such as int to long, happen automatically because no information is lost. Narrowing conversions, such as double to int, need an explicit cast and may lose data. The final keyword makes a variable assignable only once, which is the Java way to declare a constant.

Each primitive has a wrapper class (Integer, Double, Boolean and so on). Wrappers are needed for collections such as List<Integer>, and Java converts automatically between the two, which is called autoboxing. Wrappers can be null, primitives cannot.""",
    realWorld="Money, ids and counters all force type decisions. Order totals use BigDecimal rather than double to avoid rounding errors, and database ids use long because int overflows at about 2.1 billion rows.",
    commonMistakes=[
        "Using double or float for money, which produces rounding errors such as 0.1 + 0.2 not equalling 0.3",
        "Forgetting that integer division truncates, so 7 / 2 is 3 and not 3.5",
        "Comparing wrapper objects such as Integer with == instead of equals",
        "Casting a large long to int and silently overflowing",
    ],
    bestPractices=[
        "Use final for variables that should not change",
        "Prefer int and double by default and long when values may exceed two billion",
        "Use var only when the type is obvious from the right-hand side",
        "Choose descriptive camelCase names for variables",
    ],
    interviewRelevance="Interviewers ask about primitives versus wrappers, autoboxing pitfalls, integer overflow and why double is unsuitable for currency. These are quick filters for basic Java fluency.",
    code_language="java",
    code_example="""public class Types {
    public static void main(String[] args) {
        int age = 30;                  // 32-bit whole number
        long population = 8_000_000_000L; // underscores improve readability
        double price = 19.99;          // 64-bit decimal
        boolean active = true;
        char grade = 'A';
        final double TAX_RATE = 0.2;   // constant: cannot be reassigned

        var message = "Hello";         // inferred as String
        System.out.println(message + " " + age);

        // Widening is automatic, narrowing needs a cast
        long big = age;                // int -> long
        int truncated = (int) price;   // double -> int, drops .99
        System.out.println(big + " " + truncated);

        // Integer division truncates
        System.out.println(7 / 2);     // 3
        System.out.println(7 / 2.0);   // 3.5

        // Autoboxing: int <-> Integer
        Integer boxed = age;
        int unboxed = boxed;
        System.out.println(unboxed + population + (active ? 1 : 0) + grade + TAX_RATE);
    }
}""")

lesson("core-java", "operators",
    summary="Arithmetic, comparison, logical and assignment operators and how they combine.",
    concept="""Operators let you compute and compare values. Java groups them into a few families.

Arithmetic operators are +, -, *, / and % (remainder). Between two ints, / performs integer division and % gives the remainder, which is handy for tests such as n % 2 == 0 to find even numbers. The + operator also joins strings.

Increment and decrement (++ and --) change a variable by one. In the prefix form ++x the value is changed before it is used, and in the postfix form x++ it is used first and changed afterwards.

Comparison operators (==, !=, <, >, <=, >=) produce a boolean. For primitives == compares values. For objects == compares references, meaning whether both sides are the same object, so use equals to compare contents.

Logical operators combine booleans: && (and), || (or) and ! (not). The first two are short-circuiting: in a && b, if a is false then b is never evaluated. This is often used for safe checks such as obj != null && obj.isValid().

Assignment operators include = and the compound forms +=, -=, *= and /=. Compound forms include an implicit cast, so byte b += 1 compiles.

Bitwise operators (&, |, ^, ~, <<, >>, >>>) work on the binary representation of integers and appear in flags, hashing and performance code. The ternary operator condition ? a : b is a compact if-else expression.

When several operators appear together, precedence decides the order: multiplication before addition, comparison before logical and. Use parentheses when in doubt.""",
    realWorld="Validation rules, pagination arithmetic and permission flags all rely on operators. Checking user input with short-circuit conditions avoids NullPointerException in everyday code.",
    commonMistakes=[
        "Using == to compare Strings or other objects instead of equals",
        "Writing = when you meant == inside a condition",
        "Relying on side effects such as x++ inside larger expressions, which hurts readability",
        "Forgetting that integer division and % with negative numbers behave differently than expected",
    ],
    bestPractices=[
        "Put the null check first in a && chain so short-circuiting protects you",
        "Use parentheses to make precedence explicit",
        "Keep increments on their own line",
        "Use equals for object comparison",
    ],
    interviewRelevance="Common questions cover == versus equals, short-circuit evaluation, prefix versus postfix increment and the result of integer division or modulo on negative numbers.",
    code_language="java",
    code_example="""public class Operators {
    public static void main(String[] args) {
        int a = 17, b = 5;
        System.out.println(a / b);   // 3  (integer division)
        System.out.println(a % b);   // 2  (remainder)
        System.out.println(a / (double) b); // 3.4

        // Prefix versus postfix
        int x = 5;
        int y = x++;                 // y gets 5, then x becomes 6
        int z = ++x;                 // x becomes 7, then z gets 7
        System.out.println(x + " " + y + " " + z);

        // Short-circuit: the second check never runs when s is null
        String s = null;
        if (s != null && s.length() > 3) {
            System.out.println("long string");
        } else {
            System.out.println("null or short");
        }

        // == compares references, equals compares content
        String p = new String("java");
        String q = new String("java");
        System.out.println(p == q);      // false
        System.out.println(p.equals(q)); // true

        // Ternary and compound assignment
        String parity = (a % 2 == 0) ? "even" : "odd";
        a += 3;                          // a = a + 3
        System.out.println(parity + " " + a);
    }
}""")

lesson("core-java", "control-flow",
    summary="Making decisions with if, else, switch and the modern switch expression.",
    concept="""Control flow decides which statements run. The simplest tool is if, with optional else if and else branches. The condition must be a boolean expression; Java does not treat numbers or objects as true or false the way some languages do.

if (score >= 90) { ... } else if (score >= 80) { ... } else { ... } evaluates conditions from top to bottom and runs the first branch whose condition is true.

The switch statement picks a branch based on the value of one expression. It works with int, char, String and enums. The classic form uses case labels with break, and forgetting break causes fall-through, where execution continues into the next case.

Java 14 added switch expressions with the arrow syntax. Each case uses -> and no fall-through occurs, no break is needed, and the whole switch can produce a value. When used as an expression over an enum or sealed type, the compiler can verify that every possibility is covered, which removes the need for a default branch and catches missing cases when the enum grows.

Braces are technically optional for single-statement branches, but always using them avoids subtle bugs when someone later adds a second statement.

Guard clauses are a useful style: handle invalid input at the top of a method with an early return, so the main logic stays unindented and easy to read. Deeply nested if statements are a sign that a method is doing too much and should be split or restructured.""",
    realWorld="Every business rule becomes control flow: discount tiers, order status handling, HTTP status mapping and feature flags. Switch expressions are widely used to map enums to behavior.",
    commonMistakes=[
        "Forgetting break in an old-style switch and falling through to the next case",
        "Omitting braces and adding a second statement that is not part of the if",
        "Comparing strings with == in a condition",
        "Deeply nested ifs instead of guard clauses",
    ],
    bestPractices=[
        "Always use braces, even for one-line branches",
        "Prefer arrow-style switch expressions in Java 14 and later",
        "Use early returns to flatten nested logic",
        "Switch over enums so the compiler can check completeness",
    ],
    interviewRelevance="Expect questions on switch fall-through, which types switch supports, the difference between switch statements and expressions, and refactoring nested conditions.",
    code_language="java",
    code_example="""public class ControlFlow {
    enum Day { MON, TUE, SAT, SUN }

    static String grade(int score) {
        if (score < 0 || score > 100) {      // guard clause
            return "invalid";
        }
        if (score >= 90) {
            return "A";
        } else if (score >= 80) {
            return "B";
        }
        return "C or below";
    }

    static String kind(Day day) {
        // Switch expression: no break, no fall-through, produces a value
        return switch (day) {
            case SAT, SUN -> "weekend";
            case MON, TUE -> "weekday";
        };
    }

    public static void main(String[] args) {
        System.out.println(grade(85));       // B
        System.out.println(kind(Day.SAT));   // weekend

        // Classic switch needs break to prevent fall-through
        int code = 2;
        switch (code) {
            case 1:
                System.out.println("one");
                break;
            case 2:
                System.out.println("two");
                break;
            default:
                System.out.println("other");
        }
    }
}""")

lesson("core-java", "loops",
    summary="Repeating work with for, enhanced for, while and do-while, plus break and continue.",
    concept="""Loops repeat a block of code. Java offers four forms.

The classic for loop has three parts: initialisation, condition and update, as in for (int i = 0; i < n; i++). It is best when you know how many iterations you need or need the index.

The enhanced for loop, also called for-each, iterates over an array or any Iterable without an index: for (String name : names). It is shorter and removes off-by-one errors, but you cannot easily modify the collection while looping or know the position.

The while loop checks its condition before each iteration, so it may run zero times. It suits situations where the number of iterations is not known in advance, such as reading until end of input. The do-while loop checks the condition after the body, so it always runs at least once.

Two keywords alter loop flow. break exits the innermost loop immediately, and continue skips the rest of the current iteration and moves to the next. Labels such as outer: let break or continue target an outer loop when you have nested loops.

Be careful that the loop condition eventually becomes false, otherwise you create an infinite loop. Also avoid modifying a collection while iterating over it with for-each, which throws ConcurrentModificationException; use an Iterator or removeIf instead.

For many transformations, streams (list.stream().filter(...).map(...)) express the same idea more declaratively, but plain loops remain the clearest choice for simple cases and are often faster for small data.""",
    realWorld="Loops process rows from a database, validate every field in a form, retry failing network calls and walk through files. Batch jobs are essentially large loops with error handling.",
    commonMistakes=[
        "Off-by-one errors, such as using <= instead of < when looping over an array length",
        "Modifying a list while iterating over it with for-each",
        "Creating an infinite loop by forgetting to update the loop variable",
        "Doing expensive work, such as a database call, inside a tight loop",
    ],
    bestPractices=[
        "Use for-each when you do not need the index",
        "Keep loop bodies small and move logic into methods",
        "Use labels sparingly, and consider extracting a method instead",
        "Use removeIf or an Iterator to remove elements during iteration",
    ],
    interviewRelevance="Interviewers like loop-based problems such as reversing, searching and counting, and ask about for versus for-each, break versus continue, and ConcurrentModificationException.",
    code_language="java",
    code_example="""import java.util.List;

public class Loops {
    public static void main(String[] args) {
        // Classic for: index is available
        for (int i = 0; i < 3; i++) {
            System.out.println("i = " + i);
        }

        // Enhanced for: simple and safe over collections
        List<String> names = List.of("Ada", "Linus", "Grace");
        for (String name : names) {
            System.out.println("Hello " + name);
        }

        // while: unknown number of iterations
        int n = 27, steps = 0;
        while (n != 1) {
            n = (n % 2 == 0) ? n / 2 : 3 * n + 1;
            steps++;
        }
        System.out.println("Steps: " + steps);

        // do-while always runs at least once
        int tries = 0;
        do {
            tries++;
        } while (tries < 3);

        // break and continue, with a label for the outer loop
        outer:
        for (int r = 0; r < 3; r++) {
            for (int c = 0; c < 3; c++) {
                if (c == 1) continue;        // skip this column
                if (r == 2) break outer;     // leave both loops
                System.out.println(r + "," + c);
            }
        }
    }
}""")

lesson("core-java", "methods",
    summary="Defining reusable methods, passing arguments and overloading.",
    concept="""A method is a named block of code that performs one task. Methods remove duplication, give logic a meaningful name and make programs testable.

A method declaration has a return type, a name, a parameter list and a body: static int add(int a, int b) { return a + b; }. Use void when nothing is returned. The return statement ends the method and hands back a value that matches the declared type.

Java is always pass-by-value. When you pass a primitive, the method receives a copy of the value, so changing it does not affect the caller. When you pass an object, the method receives a copy of the reference. It can therefore change the object the reference points to, but reassigning the parameter to a new object does not affect the caller. This subtle point is frequently misunderstood.

Overloading lets you define several methods with the same name but different parameter lists, such as print(int) and print(String). The compiler picks the version at compile time based on the argument types. The return type alone cannot distinguish overloads.

Varargs let a method accept any number of arguments of one type: int sum(int... numbers). Inside the method the parameter behaves like an array, and a varargs parameter must be last.

Static methods belong to the class and are called as ClassName.method(). Instance methods belong to an object and can use its fields. Good methods are short, do one thing, have clear names that start with a verb, and avoid side effects where possible.""",
    realWorld="Service layers are collections of methods such as calculateTotal, validateOrder and sendEmail. Small, well-named methods make code reviewable and let you write focused unit tests.",
    commonMistakes=[
        "Believing Java passes objects by reference, then being surprised when reassigning a parameter has no effect",
        "Writing very long methods that do several unrelated things",
        "Forgetting a return statement on one path of a method that returns a value",
        "Overloading with confusingly similar signatures",
    ],
    bestPractices=[
        "Keep each method focused on a single responsibility",
        "Name methods with verbs that describe what they do",
        "Limit the number of parameters, and group related ones into an object",
        "Avoid modifying parameters or hidden state when a returned value will do",
    ],
    interviewRelevance="A classic question is whether Java is pass-by-value or pass-by-reference. Overloading versus overriding and varargs behavior also come up often.",
    code_language="java",
    code_example="""public class Methods {
    // Static method with a return value
    static int add(int a, int b) {
        return a + b;
    }

    // Overloads: same name, different parameter types
    static String describe(int n)    { return "int " + n; }
    static String describe(String s) { return "string " + s; }

    // Varargs: any number of ints
    static int sum(int... numbers) {
        int total = 0;
        for (int n : numbers) {
            total += n;
        }
        return total;
    }

    // Primitives are copied, so the caller's value is unchanged
    static void tryChange(int value) {
        value = 99;
    }

    // The reference is copied: mutating the object is visible,
    // but reassigning the parameter is not
    static void modify(StringBuilder sb) {
        sb.append(" world");     // visible to caller
        sb = new StringBuilder("lost"); // not visible
    }

    public static void main(String[] args) {
        System.out.println(add(2, 3));
        System.out.println(describe(7) + ", " + describe("x"));
        System.out.println(sum(1, 2, 3, 4));

        int v = 1;
        tryChange(v);
        StringBuilder sb = new StringBuilder("hello");
        modify(sb);
        System.out.println(v + " " + sb);   // 1 hello world
    }
}""")

lesson("core-java", "strings",
    summary="Working with immutable Strings, common methods, StringBuilder and text blocks.",
    concept="""A String is a sequence of characters, and it is one of the most used classes in Java. The key fact is that Strings are immutable: once created, a String never changes. Methods such as toUpperCase or replace return a new String and leave the original untouched, so you must use the returned value.

String literals like "hello" are stored in a pool. Identical literals share a single object, which is why "a" == "a" can be true while new String("a") == "a" is false. This is the reason you should always compare content with equals (or equalsIgnoreCase) and never ==.

Useful methods include length, charAt, substring, indexOf, contains, startsWith, trim and strip, split, replace, isEmpty, isBlank, toUpperCase and toLowerCase. String.join combines items with a separator, String.format builds text from a template and String.valueOf converts other types.

Because each concatenation with + creates a new object, building a string in a loop is slow: the work grows quadratically. StringBuilder is a mutable buffer designed for this, with append, insert, reverse and toString. A single + expression outside a loop is fine, since the compiler optimises it.

Java 15 added text blocks, written with three double quotes, for multi-line text such as JSON or SQL without escape clutter.

Strings are also safe to share between threads and make good map keys, because their hash code is cached and cannot change. Be aware that a String holding a password stays in memory until garbage collected, which is why char arrays are sometimes preferred for secrets.""",
    realWorld="Parsing request parameters, building log messages, formatting reports and handling JSON all depend on String work. Misusing concatenation in hot loops is a common cause of slow batch jobs.",
    commonMistakes=[
        "Comparing Strings with == instead of equals",
        "Calling a String method such as trim or replace and ignoring the returned value",
        "Concatenating with + inside a large loop instead of using StringBuilder",
        "Not handling null before calling methods, causing NullPointerException",
    ],
    bestPractices=[
        "Compare with equals, and write the literal first to be null-safe, as in \"yes\".equals(input)",
        "Use StringBuilder when building text in loops",
        "Use String.format or text blocks for readable templates",
        "Prefer isBlank over checking length when input may be whitespace",
    ],
    interviewRelevance="Very common: why Strings are immutable, the string pool, == versus equals, String versus StringBuilder versus StringBuffer, and reversing or checking palindromes.",
    code_language="java",
    code_example="""public class Strings {
    public static void main(String[] args) {
        String s = "  Hello, Java  ";
        String trimmed = s.trim();          // returns a new String
        System.out.println(s.length() + " " + trimmed.length());
        System.out.println(trimmed.toUpperCase());
        System.out.println(trimmed.substring(7));      // Java
        System.out.println(trimmed.contains("Java"));  // true

        // Immutability: s is unchanged unless we reassign
        s.replace("Hello", "Bye");          // result ignored
        System.out.println(s.contains("Hello")); // still true

        // The string pool and equals
        String a = "java";
        String b = "java";
        String c = new String("java");
        System.out.println(a == b);         // true, same pooled object
        System.out.println(a == c);         // false, different object
        System.out.println(a.equals(c));    // true

        // StringBuilder for loops
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i <= 5; i++) {
            sb.append(i).append(',');
        }
        sb.setLength(sb.length() - 1);      // remove trailing comma
        System.out.println(sb);

        String[] parts = "a-b-c".split("-");
        System.out.println(String.join("+", parts));
        System.out.println(String.format("%s has %d items", "Cart", 3));
    }
}""")

# ───────────────────────── OOP ─────────────────────────

lesson("oop", "classes-objects",
    summary="Classes as blueprints, objects as instances, and how fields and methods fit together.",
    concept="""Object-oriented programming models a program as a set of objects that hold data and behavior together. A class is the blueprint, and an object is one concrete instance built from it.

A class declares fields (the data each object holds) and methods (what objects can do). You create an object with the new keyword, which allocates memory on the heap and runs a constructor. Each object gets its own copy of the instance fields, so two Dog objects can have different names.

The variable you hold is a reference to the object. Assigning one reference to another, as in Dog b = a, makes both point to the same object, so a change through one is visible through the other. Setting a reference to null means it points to nothing, and calling a method on it throws NullPointerException. When no references remain, the garbage collector can reclaim the object.

Inside an instance method, the keyword this refers to the current object. It is used to distinguish a field from a parameter with the same name and to pass the current object elsewhere.

Fields marked static belong to the class itself and are shared by all instances, while instance fields belong to each object. Static members are accessed through the class name, for example Counter.total.

Every class implicitly extends Object, which provides toString, equals and hashCode. Overriding toString gives you readable output when printing, and overriding equals and hashCode defines what it means for two objects to be equal.

Good classes model one clear concept, such as Order or Customer, and expose a small, meaningful set of methods.""",
    realWorld="Domain models in real applications, such as Customer, Invoice and Product, are classes. Frameworks like Spring create and manage objects of your classes at runtime.",
    commonMistakes=[
        "Confusing a class with an object, or expecting two references to be independent copies",
        "Using static fields for data that should belong to each instance",
        "Calling methods on a reference that may be null",
        "Overriding equals without overriding hashCode",
    ],
    bestPractices=[
        "Give each class a single clear responsibility",
        "Override toString for useful debugging output",
        "Keep fields private and expose behavior through methods",
        "Name classes with singular nouns in PascalCase",
    ],
    interviewRelevance="Be ready to explain class versus object, stack versus heap, what this means, static versus instance members, and the equals and hashCode contract.",
    code_language="java",
    code_example="""public class Dog {
    private static int count = 0;   // shared by all Dog objects
    private String name;            // each Dog has its own name
    private int age;

    public Dog(String name, int age) {
        this.name = name;           // this distinguishes field from parameter
        this.age = age;
        count++;
    }

    public void birthday() {
        age++;
    }

    public static int getCount() {
        return count;
    }

    @Override
    public String toString() {
        return name + " (" + age + ")";
    }

    public static void main(String[] args) {
        Dog rex = new Dog("Rex", 3);   // object created on the heap
        Dog fido = new Dog("Fido", 5);
        rex.birthday();
        System.out.println(rex);        // Rex (4)
        System.out.println(fido);       // Fido (5)

        Dog alias = rex;                // same object, two references
        alias.birthday();
        System.out.println(rex);        // Rex (5)

        System.out.println(Dog.getCount()); // 2
    }
}""")

lesson("oop", "constructors",
    summary="Initialising objects with constructors, overloading and constructor chaining.",
    concept="""A constructor is a special block that runs when an object is created with new. It has the same name as the class and no return type. Its job is to put the new object into a valid initial state.

If you write no constructor, the compiler supplies a default no-argument constructor. As soon as you declare any constructor yourself, the default one disappears, so a class with only a two-argument constructor can no longer be created with new Person().

Constructors can be overloaded: you can offer several with different parameters. To avoid repeating code, one constructor can call another in the same class using this(...), which is called constructor chaining. The call to this(...) must be the first statement. Similarly, a subclass constructor calls its parent constructor with super(...), also as the first statement. If you do not write it, Java inserts an implicit call to the parent's no-argument constructor, which fails to compile if the parent has none.

Constructors are the right place to validate arguments and to guarantee that required fields are set. Throwing an exception for invalid input prevents half-built objects from ever existing. Fields marked final must be assigned by the end of every constructor, which makes immutable objects easy to write.

Avoid calling overridable methods from a constructor, because a subclass version may run before the subclass fields are initialised. When a class has many optional parameters, a long list of constructors becomes hard to read, and the Builder pattern or a static factory method is a cleaner alternative.

Initialisation order is: static initialisers once per class, then for each object the field initialisers and instance blocks, then the constructor body.""",
    realWorld="Entities and value objects are created through constructors that enforce rules, such as an Email that rejects invalid addresses. Dependency injection frameworks prefer constructor injection for required collaborators.",
    commonMistakes=[
        "Expecting a default constructor to exist after declaring another constructor",
        "Giving the constructor a return type, which turns it into an ordinary method",
        "Calling overridable methods from within a constructor",
        "Leaving objects partially initialised instead of validating arguments",
    ],
    bestPractices=[
        "Validate arguments and fail fast in the constructor",
        "Chain constructors with this(...) to avoid duplication",
        "Use final fields to create immutable objects",
        "Prefer a builder or static factory when there are many optional parameters",
    ],
    interviewRelevance="Questions include the default constructor rules, this() versus super(), initialisation order, and whether constructors can be private, which is used for singletons and factories.",
    code_language="java",
    code_example="""public class Account {
    private final String owner;     // must be set by every constructor
    private double balance;

    // Main constructor with validation
    public Account(String owner, double balance) {
        if (owner == null || owner.isBlank()) {
            throw new IllegalArgumentException("owner required");
        }
        if (balance < 0) {
            throw new IllegalArgumentException("balance cannot be negative");
        }
        this.owner = owner;
        this.balance = balance;
    }

    // Overload that chains to the main constructor
    public Account(String owner) {
        this(owner, 0.0);
    }

    @Override
    public String toString() {
        return owner + ": " + balance;
    }

    public static void main(String[] args) {
        Account a = new Account("Ada", 100.0);
        Account b = new Account("Linus");   // balance defaults to 0
        System.out.println(a);
        System.out.println(b);

        try {
            new Account("", 5);
        } catch (IllegalArgumentException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}""")

lesson("oop", "encapsulation",
    summary="Hiding internal state behind private fields and a controlled public interface.",
    concept="""Encapsulation means bundling data with the methods that operate on it and restricting direct access to that data. The class decides how its state can change, so it can protect its own rules.

In Java you achieve this with access modifiers:
- private: visible only inside the class.
- package-private (no modifier): visible inside the same package.
- protected: visible in the package and in subclasses.
- public: visible everywhere.

The standard approach is to make fields private and expose them through public getters and setters, or better, through methods that express intent, such as deposit(amount) rather than setBalance(x). A setter can validate input, so an object can never be put into an invalid state, for example a negative age or an overdrawn account.

Encapsulation also lets you change the internals later without breaking callers. You could switch from storing an age to storing a birth date, and the public method getAge still works. Callers depend on the interface, not the implementation.

Be careful with mutable objects. A getter that returns a reference to an internal list lets outsiders modify your state behind your back. Return an unmodifiable view or a copy, and copy mutable arguments in the constructor. Better still, make classes immutable when you can: private final fields, no setters, and no leaking of mutable internals. Java records give you immutable data carriers with very little code.

A good rule is to expose as little as possible: start everything private and widen access only when there is a real need.""",
    realWorld="A bank account class never exposes its balance field for direct modification. All changes go through deposit and withdraw, which enforce limits and record audit entries.",
    commonMistakes=[
        "Making fields public so any code can corrupt the object's state",
        "Generating a setter for every field automatically, which defeats the purpose",
        "Returning a reference to an internal mutable collection from a getter",
        "Skipping validation in setters and constructors",
    ],
    bestPractices=[
        "Make fields private by default",
        "Expose behavior (deposit, cancel) rather than raw setters",
        "Return defensive copies or unmodifiable views of mutable state",
        "Prefer immutable classes and records where possible",
    ],
    interviewRelevance="Interviewers ask you to define encapsulation, list the access modifiers, explain why getters and setters are used and how to build an immutable class.",
    code_language="java",
    code_example="""import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class BankAccount {
    private double balance;                       // hidden state
    private final List<String> history = new ArrayList<>();

    public void deposit(double amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("amount must be positive");
        }
        balance += amount;
        history.add("deposit " + amount);
    }

    public void withdraw(double amount) {
        if (amount <= 0 || amount > balance) {
            throw new IllegalArgumentException("invalid withdrawal");
        }
        balance -= amount;
        history.add("withdraw " + amount);
    }

    public double getBalance() {
        return balance;                           // read-only access
    }

    // Do not leak the internal list: return a read-only view
    public List<String> getHistory() {
        return Collections.unmodifiableList(history);
    }

    public static void main(String[] args) {
        BankAccount acc = new BankAccount();
        acc.deposit(100);
        acc.withdraw(30);
        System.out.println(acc.getBalance());     // 70.0
        System.out.println(acc.getHistory());
        // acc.balance = 1_000_000;  // would not compile outside the class
    }
}""")

lesson("oop", "inheritance",
    summary="Reusing and extending behavior with subclasses, super and method overriding.",
    concept="""Inheritance lets one class, the subclass, acquire the fields and methods of another, the superclass, using the extends keyword. It models an is-a relationship: a Dog is an Animal. Java supports single class inheritance, so a class can extend only one parent, though it can implement many interfaces.

A subclass inherits non-private members and can add new ones. It may also override an inherited method to change its behavior. Use the @Override annotation so the compiler checks that you really are overriding a method, which catches typos in names or parameter types. The keyword super lets the subclass call the parent's version of a method or the parent's constructor.

Every constructor in a subclass must call a parent constructor first, either explicitly with super(...) or implicitly with a no-argument call. The parent part of the object is therefore built before the child part.

Access control matters here: private members are not accessible in the subclass, while protected members are. Marking a class or method final prevents extension or overriding. Since Java 17 you can also use sealed classes to list exactly which classes may extend a parent.

Inheritance is powerful but easy to overuse. It creates tight coupling between parent and child, so a change in the parent can break every subclass. A common guideline is to favour composition over inheritance: instead of extending a class to reuse code, hold an instance of it as a field and delegate. Use inheritance only for genuine is-a relationships where the subclass can substitute for the parent anywhere without surprises, which is the Liskov Substitution Principle.

All classes ultimately inherit from java.lang.Object.""",
    realWorld="Frameworks use inheritance for extension points, for example extending a base exception class or an abstract test class. Domain hierarchies like Vehicle, Car and Truck share common behavior this way.",
    commonMistakes=[
        "Using inheritance just to reuse code when there is no is-a relationship",
        "Omitting @Override and accidentally overloading instead of overriding",
        "Building deep hierarchies that are hard to understand and change",
        "Forgetting that the parent constructor runs first and may need arguments",
    ],
    bestPractices=[
        "Prefer composition over inheritance",
        "Always annotate overriding methods with @Override",
        "Keep hierarchies shallow",
        "Make classes final or sealed unless they are designed for extension",
    ],
    interviewRelevance="Common topics are is-a versus has-a, why Java has no multiple class inheritance, constructor order, super, final classes and the Liskov Substitution Principle.",
    code_language="java",
    code_example="""class Animal {
    protected String name;

    Animal(String name) {
        this.name = name;
        System.out.println("Animal constructor");
    }

    void speak() {
        System.out.println(name + " makes a sound");
    }
}

class Dog extends Animal {
    Dog(String name) {
        super(name);                 // parent constructor runs first
        System.out.println("Dog constructor");
    }

    @Override
    void speak() {                   // changes inherited behavior
        super.speak();               // reuse the parent version
        System.out.println(name + " barks");
    }

    void fetch() {
        System.out.println(name + " fetches");
    }
}

public class InheritanceDemo {
    public static void main(String[] args) {
        Dog d = new Dog("Rex");
        d.speak();
        d.fetch();

        Animal a = d;                // a Dog is an Animal
        a.speak();                   // still uses the Dog version
        System.out.println(a instanceof Dog); // true
    }
}""")

lesson("oop", "polymorphism",
    summary="Treating different objects through a common type while each behaves in its own way.",
    concept="""Polymorphism means many forms: the same call can run different code depending on the actual object. It is what lets you write code against a general type and have it work with many specific ones.

Java has two kinds. Compile-time polymorphism is method overloading, where the compiler chooses between methods with the same name based on the argument types. Runtime polymorphism is method overriding, which is the more important kind for design.

With runtime polymorphism, a variable of a parent type or interface type can refer to any subclass object. When you call a method on it, the JVM looks at the real object at runtime and runs that class's version. This is called dynamic dispatch. Given Shape s = new Circle(), the call s.area() runs Circle's implementation even though the variable's declared type is Shape.

This is powerful because the calling code does not need to know the concrete class. You can add a new Triangle class later and existing code that loops over a List<Shape> keeps working without modification, which supports the open-closed principle: open for extension, closed for modification. It also eliminates long if-else or switch chains that check object types.

Important rules: only methods are dispatched dynamically. Fields and static methods are resolved by the declared type. You can only call methods that exist on the declared type unless you cast, and a downcast should be guarded with instanceof, using pattern matching in Java 16 and later: if (s instanceof Circle c).

Overloads are chosen at compile time using the declared type, while overrides are chosen at runtime using the actual type.""",
    realWorld="A payment system holds a PaymentMethod interface with implementations for cards, wallets and bank transfers. Checkout code calls pay() without caring which one the customer selected.",
    commonMistakes=[
        "Believing overloaded methods are chosen by the runtime type of the argument",
        "Writing instanceof chains instead of letting subclasses override a method",
        "Downcasting without an instanceof check, causing ClassCastException",
        "Expecting fields to be overridden the way methods are",
    ],
    bestPractices=[
        "Program to an interface or supertype, not a concrete class",
        "Replace type-checking conditionals with overriding methods",
        "Use instanceof pattern matching when a downcast is truly needed",
        "Ensure subclasses honor the contract of the parent",
    ],
    interviewRelevance="Expect to explain compile-time versus runtime polymorphism, dynamic dispatch, overloading versus overriding and to predict the output of a snippet mixing both.",
    code_language="java",
    code_example="""import java.util.List;

abstract class Shape {
    abstract double area();
}

class Circle extends Shape {
    private final double r;
    Circle(double r) { this.r = r; }
    @Override double area() { return Math.PI * r * r; }
}

class Rectangle extends Shape {
    private final double w, h;
    Rectangle(double w, double h) { this.w = w; this.h = h; }
    @Override double area() { return w * h; }
}

public class PolymorphismDemo {
    public static void main(String[] args) {
        // Declared type is Shape, actual types differ
        List<Shape> shapes = List.of(new Circle(1.0), new Rectangle(2, 3));

        for (Shape s : shapes) {
            // The JVM picks the right area() at runtime (dynamic dispatch)
            System.out.printf("%.2f%n", s.area());
        }

        Shape s = shapes.get(0);
        if (s instanceof Circle c) {     // pattern matching, safe downcast
            System.out.println("It is a circle: " + c.area());
        }
    }
}""")

lesson("oop", "abstraction",
    summary="Hiding complexity behind simple contracts using abstract classes and methods.",
    concept="""Abstraction means exposing what something does while hiding how it does it. A driver uses a steering wheel without knowing the details of the steering mechanism. In code, abstraction lets callers depend on a simple contract while the implementation stays free to change.

Java offers two main tools: interfaces and abstract classes. This lesson focuses on abstract classes.

An abstract class is declared with the abstract keyword and cannot be instantiated directly. It exists to be extended. It may contain abstract methods, which have a signature but no body, and concrete methods, which have full implementations. Any concrete subclass must implement all inherited abstract methods or the code will not compile.

Abstract classes can hold fields, constructors and shared state, which is their main advantage over interfaces. They are a good fit when several related classes share common code and a common identity, and you want to enforce that each subclass fills in specific steps. A well-known use is the template method pattern: the abstract class defines the overall algorithm in a final method and leaves certain steps abstract for subclasses to supply.

Compare this with interfaces. A class can extend only one abstract class but implement many interfaces. Interfaces define capabilities (Comparable, Runnable), while abstract classes define a partial base implementation of a closely related family.

Good abstraction picks the right level of detail. Too little leaves callers dealing with implementation details, and too much, such as abstract layers with only one implementation, adds complexity without benefit. Create an abstraction when you have, or genuinely expect, more than one implementation.""",
    realWorld="Java's own AbstractList and HttpServlet are abstract base classes: they implement most of the plumbing and ask you to supply only the few methods that differ.",
    commonMistakes=[
        "Trying to instantiate an abstract class with new",
        "Creating abstractions with only one implementation and no expected variation",
        "Confusing abstract classes with interfaces and picking the wrong one",
        "Putting too many abstract methods in a base class, forcing subclasses to write boilerplate",
    ],
    bestPractices=[
        "Abstract only where behavior genuinely varies",
        "Use the template method pattern for fixed algorithms with variable steps",
        "Keep abstract contracts small and clearly documented",
        "Prefer interfaces unless you need shared state or code",
    ],
    interviewRelevance="A staple question is abstract class versus interface. Also be able to say whether an abstract class can have a constructor (yes) and why you cannot instantiate it.",
    code_language="java",
    code_example="""abstract class Report {
    // Template method: fixed order of steps, final so it cannot be changed
    public final void generate() {
        String data = fetchData();         // varies by subclass
        String body = format(data);        // varies by subclass
        System.out.println(header() + body);
    }

    protected abstract String fetchData();
    protected abstract String format(String data);

    // Shared concrete code
    protected String header() {
        return "== Report ==\\n";
    }
}

class SalesReport extends Report {
    @Override
    protected String fetchData() {
        return "total=1200";               // pretend database call
    }

    @Override
    protected String format(String data) {
        return "Sales -> " + data;
    }
}

public class AbstractionDemo {
    public static void main(String[] args) {
        // Report r = new Report();        // compile error: abstract
        Report r = new SalesReport();
        r.generate();
    }
}""")

lesson("oop", "interfaces",
    summary="Defining contracts that unrelated classes can implement, including default and static methods.",
    concept="""An interface is a contract: it lists the methods a class promises to provide without saying how. A class signs the contract with the implements keyword and must supply every abstract method, otherwise it must be declared abstract.

Interfaces are central to flexible Java design. Code that depends on an interface, such as List or Comparable, works with any implementation, so you can swap one for another, for instance ArrayList for LinkedList, or a real service for a fake one in tests.

A class can implement many interfaces, which is how Java gets around the lack of multiple class inheritance. Interfaces can also extend other interfaces.

Methods in an interface are public and abstract by default. Since Java 8 an interface can also contain default methods, which have a body and are inherited by implementers but can be overridden, and static methods, which belong to the interface itself. Java 9 added private methods for sharing code between default methods. Fields in an interface are implicitly public static final, so they are constants.

An interface with exactly one abstract method is a functional interface, and it can be implemented with a lambda expression. Examples are Runnable, Comparator and Function. The optional @FunctionalInterface annotation makes the compiler enforce the single-method rule.

If a class inherits conflicting default methods from two interfaces, it must override the method and may pick one with InterfaceName.super.method().

Choose an interface when you want to describe a capability that unrelated classes might share. Choose an abstract class when subclasses are closely related and share state or code.""",
    realWorld="Repository, Service and Strategy interfaces are everywhere in enterprise Java. Spring injects an implementation of an interface, and tests inject a mock that implements the same contract.",
    commonMistakes=[
        "Weakening visibility when implementing, since interface methods are public and the implementation must be public too",
        "Forgetting to implement every abstract method in a concrete class",
        "Overusing default methods so interfaces turn into hidden base classes",
        "Declaring variables with the concrete type instead of the interface type",
    ],
    bestPractices=[
        "Declare variables and parameters using the interface type",
        "Keep interfaces small and focused",
        "Use @FunctionalInterface for single-method interfaces",
        "Use default methods mainly to evolve existing interfaces safely",
    ],
    interviewRelevance="Be ready for interface versus abstract class, default methods and the diamond problem, functional interfaces and lambdas, and why coding to interfaces improves testability.",
    code_language="java",
    code_example="""interface Payment {
    void pay(double amount);              // implicitly public abstract

    default String receipt(double amount) {  // default method with a body
        return "Paid " + amount;
    }

    static Payment of(String type) {      // static factory on the interface
        return type.equals("card") ? new CardPayment() : new CashPayment();
    }
}

class CardPayment implements Payment {
    @Override
    public void pay(double amount) {
        System.out.println("Charging card: " + amount);
    }
}

class CashPayment implements Payment {
    @Override
    public void pay(double amount) {
        System.out.println("Taking cash: " + amount);
    }

    @Override
    public String receipt(double amount) { // override the default
        return "Cash receipt " + amount;
    }
}

public class InterfaceDemo {
    public static void main(String[] args) {
        Payment p = Payment.of("card");   // variable uses the interface type
        p.pay(25.0);
        System.out.println(p.receipt(25.0));

        Runnable task = () -> System.out.println("lambda implements Runnable");
        task.run();
    }
}""")

lesson("oop", "inner-classes",
    summary="Nested, inner, local and anonymous classes and when each one is appropriate.",
    concept="""Java lets you define a class inside another class. These nested classes group helper types with the code that uses them and can access the outer class's private members. There are four kinds.

A static nested class is declared with static inside another class. It does not hold a reference to an outer instance and behaves like an ordinary class that happens to be namespaced, as in Outer.Helper. Use it when the helper does not need outer state. Builders and Map.Entry are typical examples.

An inner class (non-static member class) is tied to an instance of the outer class. It has an implicit reference to that instance and can read and write its fields directly. You create it through an outer object: outer.new Inner(). Because of the hidden reference, an inner class can keep its outer object alive and cause memory leaks if it is stored for a long time.

A local class is declared inside a method and is visible only there. An anonymous class has no name and is declared and instantiated in one expression, typically to implement an interface or extend a class on the spot: new Runnable() { public void run() { ... } }. Local and anonymous classes can use local variables from the enclosing method only if those variables are final or effectively final, meaning never reassigned.

Since Java 8, lambda expressions replace most anonymous classes for functional interfaces and read much better. Anonymous classes are still needed when you must implement several methods or hold state.

The default advice is to prefer static nested classes. Make a nested class non-static only when it genuinely needs the outer instance.""",
    realWorld="Iterators in collections are commonly inner classes that read the list's internal array. Android and Swing code historically used anonymous classes for event listeners, now replaced by lambdas.",
    commonMistakes=[
        "Making a nested class non-static when it does not need the outer instance, which adds a hidden reference and memory risk",
        "Trying to modify a local variable from an anonymous class or lambda",
        "Instantiating an inner class without an outer instance",
        "Using anonymous classes where a lambda would be clearer",
    ],
    bestPractices=[
        "Default to static nested classes",
        "Use lambdas instead of anonymous classes for functional interfaces",
        "Keep nested classes small and closely related to the outer class",
        "Move a nested class to its own file when it grows or is reused",
    ],
    interviewRelevance="Typical questions list the four kinds of nested classes, ask why static nested is preferred, and ask why captured local variables must be effectively final.",
    code_language="java",
    code_example="""public class Outer {
    private int counter = 10;

    // Static nested: no outer instance needed
    static class Helper {
        String greet() { return "hello from static nested"; }
    }

    // Inner class: can use the outer instance's fields
    class Inner {
        int next() { return ++counter; }
    }

    public static void main(String[] args) {
        System.out.println(new Helper().greet());

        Outer outer = new Outer();
        Outer.Inner inner = outer.new Inner();   // needs an outer object
        System.out.println(inner.next());        // 11
        System.out.println(outer.counter);       // 11

        // Local variable captured must be effectively final
        String prefix = "Task: ";

        // Local class
        class Printer {
            void print(String s) { System.out.println(prefix + s); }
        }
        new Printer().print("local class");

        // Anonymous class
        Runnable r = new Runnable() {
            @Override
            public void run() {
                System.out.println(prefix + "anonymous class");
            }
        };
        r.run();

        // Lambda: the modern replacement
        Runnable lambda = () -> System.out.println(prefix + "lambda");
        lambda.run();
    }
}""")

# ───────────────────────── Collections ─────────────────────────

lesson("collections", "collection-intro",
    summary="The Java Collections Framework: its interfaces, implementations and how to choose between them.",
    concept="""The Java Collections Framework is a set of interfaces and classes in java.util for storing and processing groups of objects. It saves you from writing your own lists, sets and maps, and its parts are interchangeable because they share common interfaces.

The core hierarchy has two roots:
- Collection, with the sub-interfaces List (ordered, allows duplicates), Set (no duplicates) and Queue (items processed in order).
- Map, which stores key-value pairs and is technically separate from Collection.

Each interface has several implementations with different performance traits:
- List: ArrayList (fast random access, backed by an array) and LinkedList (fast insertion at the ends).
- Set: HashSet (fast, unordered), LinkedHashSet (keeps insertion order) and TreeSet (sorted).
- Map: HashMap, LinkedHashMap and TreeMap, following the same pattern.
- Queue and Deque: ArrayDeque and PriorityQueue.

Collections use generics, written List<String>, so the compiler guarantees what type of element is stored and you avoid casting. Generics only work with reference types, so use List<Integer> and rely on autoboxing rather than List<int>.

Common operations are available through the shared interface: add, remove, contains, size, isEmpty and iteration with for-each. Since Java 9 you can create small immutable collections with List.of, Set.of and Map.of.

Choosing well is mostly about the access pattern. Need ordered items with index access: ArrayList. Need to test membership quickly: HashSet. Need lookup by key: HashMap. Need sorted order: a Tree variant. Declare variables using the interface type, for example List<String> names = new ArrayList<>(), so you can change the implementation later without touching the rest of your code.""",
    realWorld="Almost every Java program uses collections: a list of orders from a database, a set of unique tags, a map of user ids to sessions. Picking the right one often decides whether code is fast or slow.",
    commonMistakes=[
        "Using a raw type such as List without generics, losing type safety",
        "Choosing LinkedList by default when ArrayList is nearly always faster",
        "Declaring variables with the concrete class rather than the interface",
        "Assuming a collection is thread-safe when it is not",
    ],
    bestPractices=[
        "Program to the interface: List, Set, Map",
        "Pick the implementation based on the access pattern",
        "Use List.of, Set.of and Map.of for fixed, immutable data",
        "Use generics everywhere and avoid raw types",
    ],
    interviewRelevance="Interviewers expect you to draw the hierarchy, explain why Map is not a Collection and justify your choice of implementation for a given problem.",
    code_language="java",
    code_example="""import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class CollectionIntro {
    public static void main(String[] args) {
        // List: ordered, duplicates allowed
        List<String> names = new ArrayList<>();
        names.add("Ada");
        names.add("Linus");
        names.add("Ada");
        System.out.println(names + " size=" + names.size());

        // Set: duplicates are ignored
        Set<String> unique = new HashSet<>(names);
        System.out.println(unique.size());          // 2

        // Map: key -> value
        Map<String, Integer> ages = new HashMap<>();
        ages.put("Ada", 36);
        ages.put("Linus", 54);
        System.out.println(ages.get("Ada"));

        // Immutable collection factory (Java 9+)
        List<Integer> fixed = List.of(1, 2, 3);
        // fixed.add(4);  // would throw UnsupportedOperationException

        for (String n : names) {
            System.out.println("Hello " + n);
        }
        System.out.println(fixed.contains(2));
    }
}""")

lesson("collections", "list-interface",
    summary="Ordered, index-based collections with ArrayList, LinkedList and the List API.",
    concept="""A List is an ordered collection that allows duplicates and lets you access elements by integer index, starting at zero. The two most common implementations are ArrayList and LinkedList.

ArrayList is backed by a resizable array. Reading by index is O(1), appending at the end is amortised O(1), and inserting or removing in the middle is O(n) because later elements must shift. When the internal array fills up, a larger one is allocated and the elements are copied. It is the default choice for most situations and is cache-friendly.

LinkedList stores each element in a node linked to its neighbours. Inserting or removing at a known node is cheap, but reaching a position by index requires walking the list, which is O(n). In practice ArrayList is usually faster even for many insertions, because of memory layout, so LinkedList is rarely the right pick. For queue-like behavior ArrayDeque is generally better.

Key methods are add, add(index, e), get, set, remove(index), remove(object), indexOf, contains, size, subList and sort. Be careful with remove on a List<Integer>: remove(1) removes the element at index 1, while remove(Integer.valueOf(1)) removes the value 1.

List.of(...) returns an immutable list, and Arrays.asList(...) returns a fixed-size list that allows set but not add or remove. Attempting a structural change throws UnsupportedOperationException. To get a modifiable copy, wrap it: new ArrayList<>(List.of(...)).

Iterating while modifying the list throws ConcurrentModificationException. Use removeIf, an Iterator, or collect results into a new list.

Vector and Stack are legacy synchronised classes, and you should avoid them in new code. For thread safety use CopyOnWriteArrayList or wrap with Collections.synchronizedList.""",
    realWorld="Search results, shopping cart lines and rows loaded from a database are typically lists. ArrayList is the working default in most service code.",
    commonMistakes=[
        "Confusing remove(int index) with remove(Object) on a List<Integer>",
        "Trying to add to a list created by List.of or Arrays.asList",
        "Removing elements inside a for-each loop",
        "Using LinkedList because insertion sounds faster, when ArrayList would win",
    ],
    bestPractices=[
        "Default to ArrayList and declare the variable as List",
        "Give the initial capacity when you know the size is large",
        "Use removeIf instead of manual removal loops",
        "Copy into a new ArrayList when you need a mutable list from an immutable one",
    ],
    interviewRelevance="Common questions compare ArrayList and LinkedList, ask about time complexity of operations, how ArrayList grows, and fail-fast iterators.",
    code_language="java",
    code_example="""import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class ListDemo {
    public static void main(String[] args) {
        List<Integer> nums = new ArrayList<>(List.of(5, 3, 8, 3, 1));

        nums.add(10);                 // append
        nums.add(0, 99);              // insert at index (shifts others)
        System.out.println(nums.get(2));        // access by index
        System.out.println(nums.indexOf(3));    // first match

        nums.remove(0);               // removes the element at INDEX 0
        nums.remove(Integer.valueOf(3)); // removes the VALUE 3
        System.out.println(nums);

        nums.removeIf(n -> n > 8);    // safe bulk removal
        nums.sort(null);              // natural ordering
        System.out.println(nums);

        List<Integer> view = nums.subList(0, 2);
        System.out.println(view);

        // Immutable and fixed-size lists
        List<String> fixed = List.of("a", "b");
        List<String> asList = Arrays.asList("x", "y");
        asList.set(0, "z");           // allowed
        try {
            fixed.add("c");           // not allowed
        } catch (UnsupportedOperationException e) {
            System.out.println("List.of is immutable");
        }
    }
}""")

lesson("collections", "set-interface",
    summary="Collections of unique elements using HashSet, LinkedHashSet and TreeSet.",
    concept="""A Set is a collection that contains no duplicate elements. Calling add with an element that is already present does nothing and returns false. Sets are ideal for membership tests and removing duplicates.

Java provides three main implementations:
- HashSet is backed by a hash table. add, remove and contains are O(1) on average, and iteration order is unspecified.
- LinkedHashSet is a hash set that also remembers insertion order, so iteration is predictable. It is a little slower and uses more memory.
- TreeSet keeps its elements sorted, using their natural ordering or a Comparator. Operations are O(log n) and it offers navigation methods such as first, last, floor, ceiling and subSet.

How does a set decide two items are the same? For hash-based sets it uses hashCode first to find a bucket and then equals to confirm. So any class you put in a HashSet, or use as a HashMap key, must override both consistently: equal objects must produce equal hash codes. If you forget, duplicates slip in and contains fails. A TreeSet instead relies on compareTo or the Comparator and treats a result of zero as equality, so the comparison must be consistent with equals to avoid surprises.

Elements should be immutable, or at least their hash-relevant fields should not change after insertion. If a mutated object's hash code changes, the set can no longer find it.

Set operations come from the Collection methods: addAll gives a union, retainAll gives an intersection and removeAll gives a difference. Set.of creates an immutable set, and it rejects duplicates at creation by throwing an exception.

The easiest way to remove duplicates from a list is new HashSet<>(list), or new LinkedHashSet<>(list) when order matters.""",
    realWorld="Sets store unique user ids, track visited nodes in a graph traversal, hold permission names and remove duplicate email addresses from an import file.",
    commonMistakes=[
        "Putting objects in a HashSet without overriding equals and hashCode",
        "Mutating an element after adding it, which breaks lookups",
        "Expecting HashSet to keep insertion order",
        "Using a TreeSet with a comparator that is inconsistent with equals",
    ],
    bestPractices=[
        "Use HashSet by default, LinkedHashSet for stable order and TreeSet for sorted order",
        "Override equals and hashCode together, or use a record",
        "Store immutable elements",
        "Use set methods such as retainAll for intersections",
    ],
    interviewRelevance="Likely questions: how HashSet works internally (it wraps a HashMap), the equals and hashCode contract, HashSet versus TreeSet and how to remove duplicates while keeping order.",
    code_language="java",
    code_example="""import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

public class SetDemo {
    // A record gets equals and hashCode automatically
    record Point(int x, int y) { }

    public static void main(String[] args) {
        Set<String> tags = new HashSet<>();
        System.out.println(tags.add("java"));  // true
        System.out.println(tags.add("java"));  // false, duplicate ignored

        // Remove duplicates but keep the original order
        List<Integer> nums = List.of(3, 1, 3, 2, 1);
        Set<Integer> ordered = new LinkedHashSet<>(nums);
        System.out.println(ordered);           // [3, 1, 2]

        // Sorted set with navigation methods
        TreeSet<Integer> sorted = new TreeSet<>(nums);
        System.out.println(sorted + " first=" + sorted.first());
        System.out.println(sorted.ceiling(2)); // smallest >= 2

        // Set algebra
        Set<Integer> a = new HashSet<>(List.of(1, 2, 3));
        Set<Integer> b = new HashSet<>(List.of(2, 3, 4));
        Set<Integer> common = new HashSet<>(a);
        common.retainAll(b);                   // intersection
        System.out.println(common);

        Set<Point> points = new HashSet<>();
        points.add(new Point(1, 2));
        System.out.println(points.contains(new Point(1, 2))); // true
    }
}""")

lesson("collections", "map-interface",
    summary="Key-value storage with HashMap, LinkedHashMap and TreeMap and their most useful methods.",
    concept="""A Map stores key-value pairs and lets you look up a value by its key. Keys are unique: putting a second value under an existing key replaces the first. Values can repeat. Map is not part of the Collection hierarchy, but it works with it through its views keySet, values and entrySet.

The main implementations mirror the set family:
- HashMap: hash table, O(1) average for get and put, no ordering guarantee. It allows one null key and null values.
- LinkedHashMap: keeps insertion order, or access order, which makes it handy for building LRU caches.
- TreeMap: keys kept sorted, O(log n) operations, with methods like firstKey, floorKey and subMap. It does not allow null keys.
- ConcurrentHashMap: a thread-safe map for concurrent access. Hashtable is a legacy class to avoid.

HashMap places each entry in a bucket chosen from the key's hashCode and uses equals to find the exact key within the bucket. As with HashSet, keys must therefore have consistent equals and hashCode, and should be immutable. Strings and Integers make excellent keys. When buckets get long, modern Java converts them to balanced trees to keep lookups fast.

The most useful methods are put, get (null if missing), getOrDefault, containsKey, remove, putIfAbsent, computeIfAbsent, merge and compute. Counting words becomes a one-liner with counts.merge(word, 1, Integer::sum). Grouping uses computeIfAbsent(key, k -> new ArrayList<>()).add(value).

Iterate over entrySet when you need both key and value, which is faster than looping over keys and calling get. Map.of and Map.copyOf create immutable maps. Modifying a map while iterating it throws ConcurrentModificationException.""",
    realWorld="Caches, configuration lookups, word frequency counts, grouping records by category and indexing objects by id are all done with maps.",
    commonMistakes=[
        "Using mutable objects as keys and then changing them",
        "Calling get and treating the null result as present when the key is missing",
        "Iterating keySet and calling get for each key instead of using entrySet",
        "Assuming HashMap is ordered or thread-safe",
    ],
    bestPractices=[
        "Use merge and computeIfAbsent instead of manual get, check and put",
        "Use getOrDefault to avoid null checks",
        "Choose LinkedHashMap or TreeMap only when you need ordering",
        "Use ConcurrentHashMap for shared maps across threads",
    ],
    interviewRelevance="HashMap internals are a favorite: hashing, collisions, resizing, treeification, equals and hashCode, plus HashMap versus Hashtable versus ConcurrentHashMap.",
    code_language="java",
    code_example="""import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

public class MapDemo {
    public static void main(String[] args) {
        Map<String, Integer> stock = new HashMap<>();
        stock.put("apple", 5);
        stock.put("pear", 2);
        stock.put("apple", 7);                    // replaces the old value
        System.out.println(stock.get("apple"));   // 7
        System.out.println(stock.getOrDefault("kiwi", 0));
        stock.putIfAbsent("kiwi", 1);

        // Word count with merge
        Map<String, Integer> counts = new TreeMap<>(); // sorted by key
        for (String w : "to be or not to be".split(" ")) {
            counts.merge(w, 1, Integer::sum);
        }
        System.out.println(counts);

        // Grouping with computeIfAbsent
        Map<Integer, List<String>> byLength = new HashMap<>();
        for (String w : List.of("a", "bb", "cc", "d")) {
            byLength.computeIfAbsent(w.length(), k -> new ArrayList<>()).add(w);
        }
        System.out.println(byLength);

        // Iterate over entries to get key and value together
        for (Map.Entry<String, Integer> e : stock.entrySet()) {
            System.out.println(e.getKey() + " -> " + e.getValue());
        }
    }
}""")

lesson("collections", "queue-interface",
    summary="Processing elements in order with Queue, Deque, ArrayDeque and PriorityQueue.",
    concept="""A Queue holds elements for processing, typically in first-in, first-out (FIFO) order: you add at the tail and take from the head. The Queue interface offers two flavors of each operation, one that throws an exception on failure and one that returns a special value.

- Insert: add throws if the queue is full, offer returns false.
- Remove: remove throws if empty, poll returns null.
- Examine: element throws if empty, peek returns null.

The forms that return special values (offer, poll, peek) are normally preferred in application code.

A Deque (double-ended queue) allows insertion and removal at both ends: addFirst, addLast, pollFirst, pollLast, peekFirst and peekLast. ArrayDeque is the standard, fast, array-backed implementation and is the recommended choice both for queues and for stacks. For a stack use push, pop and peek on a Deque. The legacy Stack class is synchronised and slow, so avoid it. ArrayDeque does not allow null elements.

PriorityQueue is different: it is not FIFO. It is a heap that always gives you the smallest element first according to natural ordering or a Comparator. Insertion and removal cost O(log n) and peek is O(1). Iterating over it does not produce sorted order; only repeated poll does. To get the largest first, supply Comparator.reverseOrder().

LinkedList also implements Queue and Deque but ArrayDeque is generally faster. For producer-consumer programs across threads, use the BlockingQueue implementations such as LinkedBlockingQueue, which wait when empty or full.

Queues model waiting lines and are used in breadth-first search, task scheduling and message buffering.""",
    realWorld="Job schedulers poll tasks from queues, a print spooler is a FIFO queue, and a priority queue picks the next highest-priority support ticket or the closest node in Dijkstra's algorithm.",
    commonMistakes=[
        "Using the legacy Stack class instead of ArrayDeque",
        "Expecting a PriorityQueue to iterate in sorted order",
        "Calling remove or element on an empty queue and getting an exception",
        "Adding null to an ArrayDeque or PriorityQueue",
    ],
    bestPractices=[
        "Use ArrayDeque for both queues and stacks",
        "Prefer offer, poll and peek when emptiness is a normal case",
        "Pass a Comparator to PriorityQueue for custom ordering",
        "Use a BlockingQueue for communication between threads",
    ],
    interviewRelevance="Expect queue-based problems such as BFS, sliding window and top-K with a heap, plus questions on Queue versus Deque, stack implementation and PriorityQueue complexity.",
    code_language="java",
    code_example="""import java.util.ArrayDeque;
import java.util.Comparator;
import java.util.Deque;
import java.util.PriorityQueue;
import java.util.Queue;

public class QueueDemo {
    public static void main(String[] args) {
        // FIFO queue
        Queue<String> line = new ArrayDeque<>();
        line.offer("first");
        line.offer("second");
        System.out.println(line.peek());   // first (not removed)
        System.out.println(line.poll());   // first (removed)
        System.out.println(line.poll());   // second
        System.out.println(line.poll());   // null, queue is empty

        // Stack behavior with a Deque
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(1);
        stack.push(2);
        System.out.println(stack.pop());   // 2 (last in, first out)

        // PriorityQueue: smallest element comes out first
        PriorityQueue<Integer> pq = new PriorityQueue<>();
        pq.add(5);
        pq.add(1);
        pq.add(3);
        System.out.println(pq.poll());     // 1

        // Max-heap using a reversed comparator
        PriorityQueue<Integer> max = new PriorityQueue<>(Comparator.reverseOrder());
        max.addAll(pq);
        System.out.println(max.poll());    // 5
    }
}""")

lesson("collections", "iterators",
    summary="Traversing collections with Iterator, ListIterator and the fail-fast behavior.",
    concept="""An Iterator is an object that walks through the elements of a collection one at a time without exposing how the collection is organised. Any class implementing Iterable can be used in a for-each loop, because the compiler translates for-each into calls on an iterator.

The Iterator interface has three main methods:
- hasNext: returns true if more elements remain.
- next: returns the next element and advances. It throws NoSuchElementException when there are none left.
- remove: removes the last element returned by next. This is the only safe way to remove during iteration.

ListIterator extends this for lists. It can move backwards with hasPrevious and previous, report positions with nextIndex, and modify the list with set and add.

Most collection iterators are fail-fast. If the collection is structurally modified after the iterator is created, other than through the iterator's own remove, the next call to next throws ConcurrentModificationException. This is a best-effort bug detector rather than a guarantee. It commonly happens when you call list.remove inside a for-each loop. The fixes are to use iterator.remove, call removeIf, or build a new list. Concurrent collections such as CopyOnWriteArrayList and ConcurrentHashMap have weakly consistent iterators that do not throw.

You can make your own class iterable by implementing Iterable<T> and returning an Iterator<T> from the iterator method. Then it works with for-each and streams. Iterator is a classic application of the Iterator design pattern.

The Spliterator interface powers streams and parallel traversal, and forEach with a lambda is a concise alternative: list.forEach(System.out::println).""",
    realWorld="Cleaning up expired sessions in a collection, reading rows lazily from a custom data source and making a tree or paged result iterable all use iterators.",
    commonMistakes=[
        "Removing elements from a collection inside a for-each loop",
        "Calling next without checking hasNext",
        "Calling remove twice without a next call in between",
        "Assuming the iteration order of a HashSet or HashMap is stable",
    ],
    bestPractices=[
        "Use iterator.remove or removeIf to delete while iterating",
        "Always guard next with hasNext",
        "Implement Iterable to make custom collections for-each friendly",
        "Use concurrent collections when threads modify while others iterate",
    ],
    interviewRelevance="Common questions: what fail-fast means, why ConcurrentModificationException occurs, Iterator versus ListIterator, and how to implement a custom Iterable.",
    code_language="java",
    code_example="""import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.NoSuchElementException;

public class IteratorDemo {
    // Custom iterable: counts from start up to (but not including) end
    static class Range implements Iterable<Integer> {
        private final int start, end;
        Range(int start, int end) { this.start = start; this.end = end; }

        @Override
        public Iterator<Integer> iterator() {
            return new Iterator<>() {
                private int current = start;
                public boolean hasNext() { return current < end; }
                public Integer next() {
                    if (!hasNext()) throw new NoSuchElementException();
                    return current++;
                }
            };
        }
    }

    public static void main(String[] args) {
        List<Integer> nums = new ArrayList<>(List.of(1, 2, 3, 4, 5, 6));

        // Safe removal while iterating
        Iterator<Integer> it = nums.iterator();
        while (it.hasNext()) {
            if (it.next() % 2 == 0) {
                it.remove();
            }
        }
        System.out.println(nums);          // [1, 3, 5]

        // Our Iterable works in for-each
        for (int n : new Range(0, 3)) {
            System.out.println("range " + n);
        }

        // This would throw ConcurrentModificationException:
        // for (int n : nums) { nums.remove(0); }
    }
}""")

lesson("collections", "comparable-comparator",
    summary="Defining natural and custom sort orders with Comparable and Comparator.",
    concept="""To sort objects, Java needs to know how to compare them. There are two interfaces for this, and they solve different problems.

Comparable<T> defines the natural ordering of a class. The class implements a single method, compareTo(T other), and the result is negative if this comes first, zero if they are equal in ordering, and positive if this comes after. String, Integer and LocalDate already implement it, which is why Collections.sort(list) and TreeSet work out of the box with them. You can have only one natural order per class, so use it when there is an obvious default, such as sorting by id.

Comparator<T> is a separate object that defines an external ordering through compare(a, b). Because it lives outside the class, you can create as many as you need, sort classes you cannot modify, and pick the order at the call site. Since Java 8, comparators are easy to build with static helpers: Comparator.comparing(Person::getName), Comparator.comparingInt(Person::getAge), and then chaining with thenComparing and reversed().

Both are used by list.sort(comparator), Collections.sort, Arrays.sort, TreeMap, TreeSet and PriorityQueue.

Write comparisons carefully. Avoid subtracting integers to compare them, as in a.age - b.age, because large values can overflow; use Integer.compare. Keep compareTo consistent with equals, since a TreeSet treats compareTo returning zero as the same element. Handle nulls explicitly with Comparator.nullsFirst or nullsLast.

Sorting objects is stable for object lists in Java, so items that compare equal keep their original relative order, which makes multi-key sorting by successive passes reliable.""",
    realWorld="Tables that sort by column, leaderboards ranked by score then name, and scheduling queues ordered by priority all use comparators.",
    commonMistakes=[
        "Subtracting values in compare, which can overflow for large numbers",
        "Making compareTo inconsistent with equals, causing elements to vanish from a TreeSet",
        "Forgetting to handle null fields in the comparison",
        "Implementing Comparable when different callers need different orders",
    ],
    bestPractices=[
        "Use Comparator.comparing with thenComparing for multi-field sorts",
        "Use Integer.compare, Double.compare and String compareTo instead of manual arithmetic",
        "Implement Comparable only for one obvious natural ordering",
        "Use nullsFirst or nullsLast when fields may be null",
    ],
    interviewRelevance="Very frequent: Comparable versus Comparator, how to sort a list by multiple fields, and how the choice affects TreeMap, TreeSet and PriorityQueue.",
    code_language="java",
    code_example="""import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class SortDemo {
    static class Person implements Comparable<Person> {
        final String name;
        final int age;

        Person(String name, int age) {
            this.name = name;
            this.age = age;
        }

        // Natural order: by name
        @Override
        public int compareTo(Person other) {
            return name.compareTo(other.name);
        }

        @Override
        public String toString() {
            return name + "(" + age + ")";
        }
    }

    public static void main(String[] args) {
        List<Person> people = new ArrayList<>(List.of(
                new Person("Zoe", 30), new Person("Adam", 41), new Person("Bob", 30)));

        people.sort(null);                       // uses compareTo
        System.out.println(people);              // by name

        // External comparator: age, then name
        Comparator<Person> byAgeThenName =
                Comparator.comparingInt((Person p) -> p.age)
                          .thenComparing(p -> p.name);
        people.sort(byAgeThenName);
        System.out.println(people);

        people.sort(byAgeThenName.reversed());   // reverse the order
        System.out.println(people);
    }
}""")

lesson("collections", "collections-utility",
    summary="Helper methods in the Collections class for sorting, searching, wrapping and shuffling.",
    concept="""java.util.Collections is a utility class full of static methods that operate on or return collections. Do not confuse it with the Collection interface. A sibling class, Arrays, offers similar helpers for arrays.

The most useful methods fall into groups.

Ordering and searching:
- sort(list) and sort(list, comparator) sort a list in place.
- reverse, shuffle and swap rearrange elements.
- binarySearch finds an element in a sorted list in O(log n). The list must already be sorted, otherwise the result is undefined.
- min and max find the smallest or largest element, optionally with a Comparator.

Counting and bulk work:
- frequency(collection, item) counts occurrences.
- nCopies(n, item) builds an immutable list of repeated items.
- disjoint tests whether two collections share no elements.
- addAll(collection, items...) adds several elements at once.

Wrappers:
- unmodifiableList, unmodifiableSet and unmodifiableMap return read-only views. They are views, so changes to the underlying collection remain visible, and for a true snapshot use List.copyOf.
- synchronizedList and its relatives add basic thread safety, though concurrent collections usually perform better.
- emptyList, emptySet, emptyMap and singletonList give cheap immutable instances.

Several of these return immutable collections, which throw UnsupportedOperationException on modification. Prefer returning empty collections instead of null from methods; it removes a whole category of null checks for callers.

Many tasks now have stream or built-in alternatives, such as list.sort(...) and List.copyOf, but Collections remains handy day to day, especially for shuffle, frequency, max, min and unmodifiable wrappers.""",
    realWorld="Shuffling a quiz deck, finding the most expensive item with max, safely exposing an internal list as read-only and returning an empty list when a search finds nothing are typical uses.",
    commonMistakes=[
        "Calling binarySearch on an unsorted list",
        "Assuming unmodifiableList makes a copy, when it is only a read-only view",
        "Returning null instead of Collections.emptyList()",
        "Confusing Collections with the Collection interface and Arrays with Collections",
    ],
    bestPractices=[
        "Return empty collections rather than null",
        "Sort before using binarySearch",
        "Use List.copyOf for a true immutable snapshot",
        "Use concurrent collections instead of synchronized wrappers for heavy multi-threaded use",
    ],
    interviewRelevance="Know Collections versus Collection, how to make a collection read-only, what binarySearch requires and the difference between synchronized wrappers and concurrent collections.",
    code_language="java",
    code_example="""import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class CollectionsDemo {
    // Return an empty list, never null
    static List<String> search(String q) {
        return q.isEmpty() ? Collections.emptyList() : List.of(q);
    }

    public static void main(String[] args) {
        List<Integer> nums = new ArrayList<>(List.of(4, 9, 1, 7, 4));

        Collections.sort(nums);                       // [1, 4, 4, 7, 9]
        System.out.println(nums);
        System.out.println(Collections.binarySearch(nums, 7)); // index 3
        System.out.println(Collections.max(nums) + " " + Collections.min(nums));
        System.out.println(Collections.frequency(nums, 4));    // 2

        Collections.reverse(nums);
        Collections.swap(nums, 0, 1);
        Collections.shuffle(nums);                    // random order
        System.out.println(nums.size());

        // Read-only view: changes to nums still show through
        List<Integer> view = Collections.unmodifiableList(nums);
        nums.add(100);
        System.out.println(view.contains(100));       // true
        try {
            view.add(1);
        } catch (UnsupportedOperationException e) {
            System.out.println("view is read-only");
        }

        System.out.println(Collections.nCopies(3, "ab"));
        System.out.println(search(""));
    }
}""")
