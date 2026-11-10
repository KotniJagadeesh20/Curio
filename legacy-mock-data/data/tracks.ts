import { 
  Binary, 
  Network, 
  Terminal, 
  GitBranch, 
  Coffee, 
  Cloud, 
  Container, 
  Ship,
  Brain,
  type LucideIcon 
} from "lucide-react";

export interface Track {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  difficulty: string;
  topics: number;
  estimatedHours: number;
}

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: "locked" | "in-progress" | "completed";
  difficulty: "beginner" | "intermediate" | "advanced";
  topics: string[];
}

export interface TopicContent {
  id: string;
  title: string;
  description: string;
  content: {
    concept: string;
    realWorld: string;
    commonMistakes: string[];
    bestPractices: string[];
    interviewRelevance: string;
  };
  codeLanguage: "java" | "bash" | "yaml" | "javascript";
  codeExample: string;
  subtopics: { id: string; title: string }[];
}

export const tracks: Track[] = [
  {
    id: "dsa",
    name: "Data Structures & Algorithms",
    description: "Master the fundamentals of DSA with structured problem-solving approaches",
    icon: Binary,
    color: "from-emerald-500 to-teal-500",
    difficulty: "Beginner to Advanced",
    topics: 50,
    estimatedHours: 120,
  },
  {
    id: "system-design",
    name: "System Design",
    description: "Learn to design scalable, reliable, and efficient systems",
    icon: Network,
    color: "from-blue-500 to-indigo-500",
    difficulty: "Intermediate to Advanced",
    topics: 35,
    estimatedHours: 80,
  },
  {
    id: "linux",
    name: "Linux",
    description: "Master Linux command line, scripting, and system administration",
    icon: Terminal,
    color: "from-orange-500 to-red-500",
    difficulty: "Beginner to Intermediate",
    topics: 30,
    estimatedHours: 50,
  },
  {
    id: "git",
    name: "Git",
    description: "Version control mastery from basics to advanced workflows",
    icon: GitBranch,
    color: "from-purple-500 to-pink-500",
    difficulty: "Beginner to Intermediate",
    topics: 20,
    estimatedHours: 25,
  },
  {
    id: "java",
    name: "Java",
    description: "Core Java, OOP, Collections, JVM internals, and concurrency",
    icon: Coffee,
    color: "from-amber-500 to-orange-500",
    difficulty: "Beginner to Advanced",
    topics: 45,
    estimatedHours: 100,
  },
  {
    id: "cloud",
    name: "Cloud Computing",
    description: "AWS, GCP, Azure fundamentals and cloud architecture patterns",
    icon: Cloud,
    color: "from-cyan-500 to-blue-500",
    difficulty: "Intermediate to Advanced",
    topics: 40,
    estimatedHours: 90,
  },
  {
    id: "docker",
    name: "Docker",
    description: "Containerization, images, volumes, networking, and best practices",
    icon: Container,
    color: "from-sky-500 to-cyan-500",
    difficulty: "Beginner to Intermediate",
    topics: 25,
    estimatedHours: 40,
  },
  {
    id: "kubernetes",
    name: "Kubernetes",
    description: "Container orchestration, deployments, services, and scaling",
    icon: Ship,
    color: "from-indigo-500 to-purple-500",
    difficulty: "Intermediate to Advanced",
    topics: 35,
    estimatedHours: 70,
  },
  {
    id: "ai",
    name: "AI & LLMs",
    description: "Master LLMs, AI Agents, RAG, MCP, and modern AI engineering",
    icon: Brain,
    color: "from-violet-500 to-fuchsia-500",
    difficulty: "Intermediate to Advanced",
    topics: 40,
    estimatedHours: 85,
  },
];

export const roadmapData: Record<string, RoadmapItem[]> = {
  dsa: [
    { id: "arrays", title: "Arrays & Strings", description: "Fundamental data structures and manipulation techniques", status: "completed", difficulty: "beginner", topics: ["Array basics", "String operations", "Sliding window", "Two pointers"] },
    { id: "linked-lists", title: "Linked Lists", description: "Singly, doubly linked lists and common patterns", status: "in-progress", difficulty: "beginner", topics: ["Singly linked list", "Doubly linked list", "Fast & slow pointers", "Reversal techniques"] },
    { id: "stacks-queues", title: "Stacks & Queues", description: "LIFO and FIFO data structures", status: "locked", difficulty: "beginner", topics: ["Stack operations", "Queue types", "Monotonic stack", "Priority queue"] },
    { id: "trees", title: "Trees", description: "Binary trees, BST, and tree traversals", status: "locked", difficulty: "intermediate", topics: ["Binary tree", "BST", "Tree traversals", "Balanced trees"] },
    { id: "graphs", title: "Graphs", description: "Graph representations and traversal algorithms", status: "locked", difficulty: "intermediate", topics: ["BFS", "DFS", "Shortest paths", "Topological sort"] },
    { id: "dynamic-programming", title: "Dynamic Programming", description: "Optimization and memoization techniques", status: "locked", difficulty: "advanced", topics: ["1D DP", "2D DP", "State machines", "Interval DP"] },
  ],
  "system-design": [
    { id: "basics", title: "System Design Basics", description: "Core concepts and terminology", status: "completed", difficulty: "beginner", topics: ["Scalability", "Latency", "Throughput", "CAP theorem"] },
    { id: "scalability", title: "Scalability", description: "Horizontal and vertical scaling strategies", status: "in-progress", difficulty: "intermediate", topics: ["Load balancing", "Sharding", "Replication", "Caching"] },
    { id: "caching", title: "Caching", description: "Caching strategies and implementations", status: "locked", difficulty: "intermediate", topics: ["Cache types", "Eviction policies", "CDN", "Cache invalidation"] },
    { id: "databases", title: "Databases", description: "SQL, NoSQL, and data modeling", status: "locked", difficulty: "intermediate", topics: ["SQL vs NoSQL", "Indexing", "Transactions", "Partitioning"] },
    { id: "lld", title: "Low Level Design (LLD)", description: "Object-oriented design and design patterns", status: "locked", difficulty: "intermediate", topics: ["SOLID principles", "Design patterns", "Class diagrams", "OOP design"] },
    { id: "case-studies", title: "Case Studies", description: "Real-world system design problems", status: "locked", difficulty: "advanced", topics: ["URL shortener", "Chat app", "Social media", "Video streaming"] },
  ],
  linux: [
    { id: "files", title: "Files & Directories", description: "File system navigation and management", status: "completed", difficulty: "beginner", topics: ["Navigation", "File operations", "Permissions", "Links"] },
    { id: "processes", title: "Processes", description: "Process management and monitoring", status: "in-progress", difficulty: "beginner", topics: ["ps", "top", "kill", "Background jobs"] },
    { id: "networking", title: "Networking", description: "Network configuration and troubleshooting", status: "locked", difficulty: "intermediate", topics: ["ifconfig", "netstat", "curl", "ssh"] },
    { id: "shell-scripting", title: "Shell Scripting", description: "Bash scripting fundamentals", status: "locked", difficulty: "intermediate", topics: ["Variables", "Loops", "Conditionals", "Functions"] },
  ],
  git: [
    { id: "basics", title: "Git Basics", description: "Core Git commands and concepts", status: "completed", difficulty: "beginner", topics: ["init", "add", "commit", "status"] },
    { id: "branching", title: "Branching", description: "Branch management and merging", status: "in-progress", difficulty: "beginner", topics: ["branch", "checkout", "merge", "conflicts"] },
    { id: "rebase", title: "Rebase & History", description: "Rewriting history and advanced techniques", status: "locked", difficulty: "intermediate", topics: ["rebase", "cherry-pick", "reflog", "reset"] },
    { id: "workflows", title: "Team Workflows", description: "Collaboration patterns and best practices", status: "locked", difficulty: "intermediate", topics: ["Git flow", "GitHub flow", "Pull requests", "Code review"] },
  ],
  java: [
    { id: "core-java", title: "Core Java", description: "Java fundamentals and syntax", status: "completed", difficulty: "beginner", topics: ["Variables", "Data types", "Control flow", "Methods"] },
    { id: "oop", title: "Object-Oriented Programming", description: "OOP concepts and design principles", status: "in-progress", difficulty: "beginner", topics: ["Classes", "Inheritance", "Polymorphism", "Encapsulation"] },
    { id: "collections", title: "Collections Framework", description: "Java collections and data structures", status: "locked", difficulty: "intermediate", topics: ["List", "Set", "Map", "Queue"] },
    { id: "jvm", title: "JVM Internals", description: "Understanding the Java Virtual Machine", status: "locked", difficulty: "advanced", topics: ["Memory model", "Garbage collection", "Class loading", "JIT"] },
    { id: "multithreading", title: "Multithreading", description: "Concurrency and parallel programming", status: "locked", difficulty: "advanced", topics: ["Threads", "Synchronization", "Executors", "Concurrent collections"] },
  ],
  cloud: [
    { id: "fundamentals", title: "Cloud Fundamentals", description: "Core cloud computing concepts", status: "completed", difficulty: "beginner", topics: ["IaaS", "PaaS", "SaaS", "Regions"] },
    { id: "compute", title: "Compute Services", description: "Virtual machines and serverless", status: "in-progress", difficulty: "intermediate", topics: ["EC2", "Lambda", "Container services", "Auto scaling"] },
    { id: "storage", title: "Storage", description: "Object, block, and file storage", status: "locked", difficulty: "intermediate", topics: ["S3", "EBS", "EFS", "Glacier"] },
    { id: "networking", title: "Networking", description: "VPC, load balancers, and DNS", status: "locked", difficulty: "intermediate", topics: ["VPC", "Subnets", "Route 53", "CloudFront"] },
    { id: "security", title: "Security", description: "IAM, encryption, and compliance", status: "locked", difficulty: "advanced", topics: ["IAM", "KMS", "Security groups", "WAF"] },
  ],
  docker: [
    { id: "images", title: "Docker Images", description: "Building and managing container images", status: "completed", difficulty: "beginner", topics: ["Dockerfile", "Layers", "Build", "Registry"] },
    { id: "containers", title: "Containers", description: "Running and managing containers", status: "in-progress", difficulty: "beginner", topics: ["run", "exec", "logs", "lifecycle"] },
    { id: "volumes", title: "Volumes", description: "Persistent storage for containers", status: "locked", difficulty: "intermediate", topics: ["Named volumes", "Bind mounts", "tmpfs", "Drivers"] },
    { id: "networking", title: "Networking", description: "Container networking and communication", status: "locked", difficulty: "intermediate", topics: ["Bridge", "Host", "Overlay", "Port mapping"] },
  ],
  kubernetes: [
    { id: "pods", title: "Pods", description: "The smallest deployable units in K8s", status: "completed", difficulty: "beginner", topics: ["Pod spec", "Multi-container", "Init containers", "Lifecycle"] },
    { id: "services", title: "Services", description: "Exposing applications in Kubernetes", status: "in-progress", difficulty: "intermediate", topics: ["ClusterIP", "NodePort", "LoadBalancer", "Ingress"] },
    { id: "deployments", title: "Deployments", description: "Declarative updates for Pods", status: "locked", difficulty: "intermediate", topics: ["ReplicaSet", "Rolling updates", "Rollbacks", "Scaling"] },
    { id: "scaling", title: "Scaling & Operations", description: "Auto-scaling and cluster management", status: "locked", difficulty: "advanced", topics: ["HPA", "VPA", "Cluster autoscaler", "Resource quotas"] },
  ],
  ai: [
    { id: "llm-fundamentals", title: "LLM Fundamentals", description: "Understanding large language models and how they work", status: "completed", difficulty: "beginner", topics: ["Transformers", "Tokenization", "Attention mechanism", "Model architectures"] },
    { id: "prompt-engineering", title: "Prompt Engineering", description: "Master the art of crafting effective prompts", status: "in-progress", difficulty: "beginner", topics: ["Zero-shot", "Few-shot", "Chain of thought", "Prompt patterns"] },
    { id: "rag", title: "RAG (Retrieval-Augmented Generation)", description: "Build knowledge-enhanced AI applications", status: "locked", difficulty: "intermediate", topics: ["Vector databases", "Embeddings", "Chunking strategies", "Retrieval optimization"] },
    { id: "ai-agents", title: "AI Agents", description: "Build autonomous AI agents that can reason and act", status: "locked", difficulty: "intermediate", topics: ["ReAct pattern", "Tool use", "Planning", "Memory systems"] },
    { id: "mcp", title: "Model Context Protocol (MCP)", description: "Connect AI models to external tools and data sources", status: "locked", difficulty: "advanced", topics: ["MCP architecture", "Tool definitions", "Server implementation", "Client integration"] },
    { id: "production-ai", title: "Production AI Systems", description: "Deploy and scale AI applications in production", status: "locked", difficulty: "advanced", topics: ["Observability", "Evaluation", "Fine-tuning", "Cost optimization"] },
  ],
};

export const topicContents: Record<string, TopicContent> = {
  arrays: {
    id: "arrays",
    title: "Arrays & Strings",
    description: "Master fundamental array and string manipulation techniques used in coding interviews",
    content: {
      concept: `Arrays are contiguous blocks of memory that store elements of the same type. They provide O(1) random access but O(n) insertion/deletion. Strings in most languages are immutable arrays of characters.

Key concepts include:
- **Indexing**: Access elements in constant time using indices
- **Traversal**: Linear scan through all elements
- **Sliding Window**: Maintain a window of elements for subarray problems
- **Two Pointers**: Use two indices to solve problems efficiently`,
      realWorld: "Arrays are used everywhere - from storing user data in databases to managing pixel data in images. Strings power everything from search engines to messaging apps.",
      commonMistakes: [
        "Off-by-one errors in loop boundaries",
        "Not handling empty arrays/strings",
        "Modifying array while iterating",
        "Forgetting string immutability in Java/Python",
      ],
      bestPractices: [
        "Always validate input bounds",
        "Use StringBuilder for string concatenation in loops",
        "Consider in-place modifications to save space",
        "Pre-calculate prefix sums for range queries",
      ],
      interviewRelevance: "Arrays and strings appear in 70%+ of coding interviews. Master sliding window, two pointers, and prefix sum patterns.",
    },
    codeLanguage: "java",
    codeExample: `// Two Sum - O(n) solution using HashMap
public int[] twoSum(int[] nums, int target) {
    Map<Integer, Integer> map = new HashMap<>();
    for (int i = 0; i < nums.length; i++) {
        int complement = target - nums[i];
        if (map.containsKey(complement)) {
            return new int[] { map.get(complement), i };
        }
        map.put(nums[i], i);
    }
    return new int[] {};
}`,
    subtopics: [
      { id: "array-basics", title: "Array Basics" },
      { id: "string-operations", title: "String Operations" },
      { id: "sliding-window", title: "Sliding Window" },
      { id: "two-pointers", title: "Two Pointers" },
      { id: "prefix-sum", title: "Prefix Sum" },
    ],
  },
  "array-basics": {
    id: "array-basics",
    title: "Array Fundamentals",
    description: "Understand how arrays work under the hood and master fundamental operations",
    content: {
      concept: `An array is a contiguous block of memory that stores elements of the same data type. Each element is identified by an index, starting from 0 in most languages.

Memory Layout:
Arrays allocate a fixed block of memory. If you create int[] arr = new int[5], the JVM allocates 5 × 4 = 20 bytes of contiguous memory. This is why random access is O(1) — the address of any element can be calculated as:
  address = baseAddress + (index × elementSize)

Types of Arrays:
- **Static Arrays**: Fixed size, allocated at compile time (e.g., int[] in Java)
- **Dynamic Arrays**: Resize automatically (e.g., ArrayList in Java, vector in C++)
- **Multi-dimensional Arrays**: Arrays of arrays (e.g., int[][] for matrices)

Time Complexities:
- Access by index: O(1)
- Search (unsorted): O(n)
- Search (sorted): O(log n) with binary search
- Insertion at end: O(1) amortized for dynamic arrays
- Insertion at beginning/middle: O(n) due to shifting
- Deletion: O(n) due to shifting

Dynamic Array Resizing:
When an ArrayList reaches capacity, it creates a new array (typically 1.5× or 2× the size) and copies all elements. This is why insertion is O(1) *amortized* — most insertions are O(1), but occasionally one is O(n).`,
      realWorld: "Arrays are the backbone of nearly every application. Database indexes use arrays for fast lookups. Image processing treats pixels as 2D arrays. Game engines use arrays for entity management. Even hash tables use arrays internally.",
      commonMistakes: [
        "ArrayIndexOutOfBoundsException — accessing index >= length or < 0",
        "Confusing array length with last valid index (last index = length - 1)",
        "Not initializing arrays (default values: 0 for int, null for objects, false for boolean)",
        "Using == to compare arrays instead of Arrays.equals()",
        "Forgetting that arrays are passed by reference, not by value",
      ],
      bestPractices: [
        "Always check bounds before accessing: if (i >= 0 && i < arr.length)",
        "Use Arrays.sort(), Arrays.fill(), Arrays.copyOf() utility methods",
        "Prefer ArrayList when size is unknown at compile time",
        "Use enhanced for-loop (for-each) when you don't need the index",
        "Initialize with meaningful sizes to avoid unnecessary resizing",
      ],
      interviewRelevance: "Array fundamentals are tested in every coding interview. You must know time complexities cold and understand when to use static vs dynamic arrays.",
    },
    codeLanguage: "java",
    codeExample: `// Array Declaration & Initialization
int[] nums = new int[5];             // [0, 0, 0, 0, 0]
int[] primes = {2, 3, 5, 7, 11};    // Literal initialization
String[] names = new String[3];      // [null, null, null]

// Basic Operations
nums[0] = 10;                        // O(1) - Set element
int val = primes[2];                 // O(1) - Get element (val = 5)
int len = primes.length;             // O(1) - Get length

// Traversal
for (int i = 0; i < nums.length; i++) {
    System.out.println(nums[i]);     // Index-based traversal
}
for (int num : primes) {
    System.out.println(num);         // Enhanced for-loop
}

// Utility Methods
Arrays.sort(nums);                   // O(n log n) - Sort in-place
Arrays.fill(nums, -1);              // O(n) - Fill with value
int[] copy = Arrays.copyOf(primes, primes.length); // O(n)
int idx = Arrays.binarySearch(primes, 7); // O(log n) - must be sorted

// Dynamic Array (ArrayList)
ArrayList<Integer> list = new ArrayList<>();
list.add(10);          // O(1) amortized - Add to end
list.add(0, 5);        // O(n) - Insert at index 0
list.get(0);           // O(1) - Access by index
list.remove(0);        // O(n) - Remove at index
list.size();           // O(1) - Get size
list.contains(10);     // O(n) - Search`,
    subtopics: [],
  },
  "array-operations": {
    id: "array-operations",
    title: "Common Array Operations",
    description: "Master essential array manipulation patterns: reversal, rotation, partitioning, and merging",
    content: {
      concept: `Beyond basic access and traversal, several array operations form the building blocks of more complex algorithms.

1. Reversal:
Swap elements from both ends moving inward. Uses two pointers — one at start, one at end.
Time: O(n), Space: O(1)

2. Rotation:
Shift elements left or right by k positions. The trick: three reversals.
- Left rotate by k: Reverse first k → Reverse remaining → Reverse all
Time: O(n), Space: O(1)

3. Partitioning:
Rearrange elements around a pivot (used in QuickSort). Dutch National Flag variant handles three-way partition.

4. Merging Sorted Arrays:
Use two pointers, one for each array. Compare and pick the smaller element.
Time: O(n + m), Space: O(n + m)

5. Removing Duplicates (Sorted Array):
Use a slow pointer to track the position of the next unique element while the fast pointer scans ahead.
Time: O(n), Space: O(1)

6. Finding Max Subarray (Kadane's preview):
Track current sum and reset when it goes negative.`,
      realWorld: "Array rotation is used in circular buffers and job scheduling. Partitioning is fundamental to QuickSort (one of the fastest sorting algorithms). Merging sorted arrays powers merge sort and database join operations.",
      commonMistakes: [
        "Not handling k > array.length in rotation (use k % length)",
        "Creating a new array when in-place modification is possible",
        "Off-by-one errors in the reversal swap loop",
        "Forgetting to handle empty arrays or single-element arrays",
        "Using nested loops (O(n²)) when a two-pointer approach gives O(n)",
      ],
      bestPractices: [
        "Master the reverse-based rotation trick — it appears in many problems",
        "Always consider in-place solutions first to minimize space usage",
        "Use the two-pointer technique for sorted array problems",
        "Test with edge cases: empty array, single element, all duplicates",
        "Draw out small examples before coding to verify your logic",
      ],
      interviewRelevance: "Array manipulation problems are the most common interview questions at FAANG companies. Problems like 'Rotate Array', 'Move Zeroes', 'Remove Duplicates' are frequently asked in phone screens.",
    },
    codeLanguage: "java",
    codeExample: `// 1. Reverse an Array In-Place
public void reverse(int[] arr, int left, int right) {
    while (left < right) {
        int temp = arr[left];
        arr[left++] = arr[right];
        arr[right--] = temp;
    }
}

// 2. Rotate Array Left by K positions (Three Reversal Trick)
// [1,2,3,4,5] rotate left by 2 → [3,4,5,1,2]
public void rotateLeft(int[] arr, int k) {
    int n = arr.length;
    k = k % n;                    // Handle k > n
    reverse(arr, 0, k - 1);      // Reverse first k: [2,1,3,4,5]
    reverse(arr, k, n - 1);      // Reverse rest:    [2,1,5,4,3]
    reverse(arr, 0, n - 1);      // Reverse all:     [3,4,5,1,2]
}

// 3. Remove Duplicates from Sorted Array (In-Place)
// [1,1,2,2,3] → [1,2,3,_,_] returns 3
public int removeDuplicates(int[] nums) {
    if (nums.length == 0) return 0;
    int slow = 0;
    for (int fast = 1; fast < nums.length; fast++) {
        if (nums[fast] != nums[slow]) {
            nums[++slow] = nums[fast];
        }
    }
    return slow + 1;
}

// 4. Move Zeroes to End (Maintain Order)
// [0,1,0,3,12] → [1,3,12,0,0]
public void moveZeroes(int[] nums) {
    int insertPos = 0;
    for (int num : nums) {
        if (num != 0) nums[insertPos++] = num;
    }
    while (insertPos < nums.length) {
        nums[insertPos++] = 0;
    }
}

// 5. Merge Two Sorted Arrays
public int[] merge(int[] a, int[] b) {
    int[] result = new int[a.length + b.length];
    int i = 0, j = 0, k = 0;
    while (i < a.length && j < b.length) {
        result[k++] = (a[i] <= b[j]) ? a[i++] : b[j++];
    }
    while (i < a.length) result[k++] = a[i++];
    while (j < b.length) result[k++] = b[j++];
    return result;
}`,
    subtopics: [],
  },
  "string-basics": {
    id: "string-basics",
    title: "String Manipulation",
    description: "Master string operations, immutability, and common manipulation patterns",
    content: {
      concept: `Strings in Java are immutable sequences of characters backed by a char[] (or byte[] since Java 9). Once created, a String object cannot be modified — any "modification" creates a new String.

String Pool:
Java maintains a String Pool (intern pool) in heap memory. String literals are automatically interned:
  String a = "hello";  // Goes to pool
  String b = "hello";  // Reuses same object from pool
  String c = new String("hello"); // Creates new object on heap
  a == b    // true (same reference)
  a == c    // false (different references)
  a.equals(c) // true (same content)

Key String Methods:
- charAt(i) — O(1) character access
- substring(start, end) — O(n) creates new string
- indexOf(str) — O(n×m) naive search
- split(regex) — O(n) tokenization
- trim() / strip() — remove whitespace
- toCharArray() — O(n) convert to char[]

StringBuilder vs String:
String concatenation in a loop creates n intermediate objects → O(n²).
StringBuilder maintains a mutable char buffer → O(n).

Character Classification:
Character.isLetter(), isDigit(), isWhitespace(), toLowerCase(), toUpperCase() are essential for parsing problems.`,
      realWorld: "String manipulation powers search engines, text editors, compilers, data validation (email, URL parsing), encryption algorithms, and natural language processing pipelines.",
      commonMistakes: [
        "Using == instead of .equals() to compare string content",
        "Concatenating strings in a loop with + instead of StringBuilder",
        "Not handling null strings (NullPointerException)",
        "Forgetting that substring() creates a new String (memory consideration)",
        "Ignoring Unicode — some characters are multi-byte (emoji, CJK)",
      ],
      bestPractices: [
        "Always use .equals() or Objects.equals() for string comparison",
        "Use StringBuilder for any loop-based string building",
        "Convert to char[] for in-place manipulation problems",
        "Use String.valueOf() instead of concatenation for type conversion",
        "Consider case sensitivity — use equalsIgnoreCase() or toLowerCase()",
      ],
      interviewRelevance: "String problems are ubiquitous in interviews: reverse strings, check palindromes, find anagrams, implement strStr(). Understanding immutability and StringBuilder is fundamental.",
    },
    codeLanguage: "java",
    codeExample: `// 1. Reverse a String
public String reverse(String s) {
    return new StringBuilder(s).reverse().toString();
}

// 2. Check Palindrome
public boolean isPalindrome(String s) {
    s = s.toLowerCase().replaceAll("[^a-z0-9]", "");
    int left = 0, right = s.length() - 1;
    while (left < right) {
        if (s.charAt(left++) != s.charAt(right--)) return false;
    }
    return true;
}

// 3. Check if Two Strings are Anagrams
public boolean isAnagram(String s, String t) {
    if (s.length() != t.length()) return false;
    int[] count = new int[26];
    for (int i = 0; i < s.length(); i++) {
        count[s.charAt(i) - 'a']++;
        count[t.charAt(i) - 'a']--;
    }
    for (int c : count) {
        if (c != 0) return false;
    }
    return true;
}

// 4. StringBuilder for Efficient Concatenation
public String buildString(String[] words) {
    StringBuilder sb = new StringBuilder();
    for (String word : words) {
        sb.append(word).append(" ");
    }
    return sb.toString().trim();
}

// 5. Count Character Frequency
public Map<Character, Integer> charFrequency(String s) {
    Map<Character, Integer> freq = new HashMap<>();
    for (char c : s.toCharArray()) {
        freq.merge(c, 1, Integer::sum);
    }
    return freq;
}

// 6. First Non-Repeating Character
public int firstUniqChar(String s) {
    int[] count = new int[26];
    for (char c : s.toCharArray()) count[c - 'a']++;
    for (int i = 0; i < s.length(); i++) {
        if (count[s.charAt(i) - 'a'] == 1) return i;
    }
    return -1;
}`,
    subtopics: [],
  },
  "two-pointers": {
    id: "two-pointers",
    title: "Two Pointers Technique",
    description: "Learn the two-pointer pattern to solve array and string problems in O(n) time",
    content: {
      concept: `The Two Pointers technique uses two indices that move through an array or string to solve problems efficiently, typically reducing O(n²) brute force to O(n).

Three Main Patterns:

1. Opposite Direction (Converging):
Start one pointer at the beginning, one at the end. Move them toward each other.
Use cases: Pair sum in sorted array, palindrome check, container with most water.

2. Same Direction (Fast & Slow):
Both pointers start at the beginning. The fast pointer moves ahead while the slow pointer tracks a condition.
Use cases: Remove duplicates, move zeroes, remove element, linked list cycle detection.

3. Two Arrays:
One pointer per array, advancing based on comparison.
Use cases: Merge sorted arrays, intersection of arrays.

When to Use Two Pointers:
- The array is sorted (or sorting is acceptable)
- You need to find a pair/triplet that satisfies a condition
- You need to partition or rearrange elements in-place
- You need O(1) extra space

Key Insight: Two pointers work because the sorted order (or some invariant) guarantees that you don't miss any valid pair by skipping elements.`,
      realWorld: "Two pointers optimize search algorithms in databases, power merge operations in distributed systems, and enable efficient text matching in editors. The pattern appears in network packet merging and memory defragmentation.",
      commonMistakes: [
        "Forgetting to sort the array first when the technique requires sorted order",
        "Infinite loops — ensure at least one pointer moves each iteration",
        "Not handling duplicates (e.g., 3Sum requires skipping duplicate values)",
        "Using two pointers when the array isn't sorted and sorting would lose index info",
        "Off-by-one: using <= vs < in the while condition",
      ],
      bestPractices: [
        "Draw out the pointer movements on paper before coding",
        "Clearly define what each pointer represents (slow = insertion point, fast = scanner)",
        "Always handle edge cases: empty array, single element, all same elements",
        "For 3Sum/4Sum, reduce to 2Sum with an outer loop",
        "Use while (left < right) for converging, while (fast < n) for same-direction",
      ],
      interviewRelevance: "Two pointers is one of the top 3 most important patterns. Problems: Two Sum II, 3Sum, Container With Most Water, Trapping Rain Water, Remove Duplicates — all FAANG favorites.",
    },
    codeLanguage: "java",
    codeExample: `// 1. Two Sum II (Sorted Array) — Converging Pointers
public int[] twoSumSorted(int[] nums, int target) {
    int left = 0, right = nums.length - 1;
    while (left < right) {
        int sum = nums[left] + nums[right];
        if (sum == target) return new int[]{left, right};
        else if (sum < target) left++;
        else right--;
    }
    return new int[]{};
}

// 2. Three Sum — Sort + Two Pointers
public List<List<Integer>> threeSum(int[] nums) {
    Arrays.sort(nums);
    List<List<Integer>> result = new ArrayList<>();
    for (int i = 0; i < nums.length - 2; i++) {
        if (i > 0 && nums[i] == nums[i-1]) continue; // skip dupes
        int left = i + 1, right = nums.length - 1;
        while (left < right) {
            int sum = nums[i] + nums[left] + nums[right];
            if (sum == 0) {
                result.add(Arrays.asList(nums[i], nums[left], nums[right]));
                while (left < right && nums[left] == nums[left+1]) left++;
                while (left < right && nums[right] == nums[right-1]) right--;
                left++; right--;
            } else if (sum < 0) left++;
            else right--;
        }
    }
    return result;
}

// 3. Container With Most Water — Converging Pointers
public int maxArea(int[] height) {
    int left = 0, right = height.length - 1, max = 0;
    while (left < right) {
        int area = Math.min(height[left], height[right]) * (right - left);
        max = Math.max(max, area);
        if (height[left] < height[right]) left++;
        else right--;
    }
    return max;
}

// 4. Remove Element In-Place — Same Direction
public int removeElement(int[] nums, int val) {
    int slow = 0;
    for (int fast = 0; fast < nums.length; fast++) {
        if (nums[fast] != val) {
            nums[slow++] = nums[fast];
        }
    }
    return slow;
}`,
    subtopics: [],
  },
  "sliding-window": {
    id: "sliding-window",
    title: "Sliding Window Pattern",
    description: "Master the sliding window technique for subarray and substring problems",
    content: {
      concept: `The Sliding Window pattern maintains a "window" (contiguous subarray/substring) that expands and shrinks to find optimal solutions. It converts O(n²) or O(n³) brute force into O(n).

Two Types:

1. Fixed-Size Window:
Window size k is given. Slide the window one element at a time, adding the new element and removing the old.
Use cases: Max sum subarray of size k, moving average.

2. Variable-Size Window (Expand/Shrink):
Expand the right pointer to include more elements. When a condition is violated, shrink from the left.
Use cases: Longest substring without repeating chars, minimum window substring, longest subarray with sum ≤ k.

Template for Variable Window:
  left = 0
  for right in range(n):
      // Add arr[right] to window state
      while (window is invalid):
          // Remove arr[left] from window state
          left++
      // Update answer with current window

Key Insight: The window only moves forward — left never goes backward. This ensures each element is processed at most twice (once added, once removed), giving O(n) total.

Common State Tracking:
- HashMap for character/element frequency
- Running sum for numeric windows
- Set for uniqueness checks
- Counter for condition tracking`,
      realWorld: "Sliding windows power real-time analytics (moving averages in stock prices), network congestion control (TCP window), streaming data processing, and rate limiting algorithms.",
      commonMistakes: [
        "Shrinking the window too aggressively — only shrink when the condition is violated",
        "Forgetting to update the window state when removing the left element",
        "Not handling the case where no valid window exists",
        "Using a fixed-size approach for a variable-size problem (or vice versa)",
        "Off-by-one in window size calculation: size = right - left + 1",
      ],
      bestPractices: [
        "Identify whether the window is fixed or variable first",
        "Use a HashMap to track character frequencies in substring problems",
        "Update your answer inside the valid window section, not inside the shrink loop",
        "For 'minimum' problems, update answer when window is valid; for 'maximum', update before/after shrinking",
        "Always verify with examples: does left advance correctly?",
      ],
      interviewRelevance: "Sliding window is a top-tier interview pattern. Must-know problems: Longest Substring Without Repeating Characters (Medium), Minimum Window Substring (Hard), Maximum Sum Subarray of Size K.",
    },
    codeLanguage: "java",
    codeExample: `// 1. Maximum Sum Subarray of Size K (Fixed Window)
public int maxSumSubarray(int[] arr, int k) {
    int windowSum = 0, maxSum = Integer.MIN_VALUE;
    for (int i = 0; i < arr.length; i++) {
        windowSum += arr[i];
        if (i >= k - 1) {
            maxSum = Math.max(maxSum, windowSum);
            windowSum -= arr[i - k + 1]; // Remove leftmost
        }
    }
    return maxSum;
}

// 2. Longest Substring Without Repeating Characters (Variable)
public int lengthOfLongestSubstring(String s) {
    Map<Character, Integer> lastSeen = new HashMap<>();
    int maxLen = 0, left = 0;
    for (int right = 0; right < s.length(); right++) {
        char c = s.charAt(right);
        if (lastSeen.containsKey(c) && lastSeen.get(c) >= left) {
            left = lastSeen.get(c) + 1;
        }
        lastSeen.put(c, right);
        maxLen = Math.max(maxLen, right - left + 1);
    }
    return maxLen;
}

// 3. Minimum Window Substring
public String minWindow(String s, String t) {
    Map<Character, Integer> need = new HashMap<>();
    for (char c : t.toCharArray()) need.merge(c, 1, Integer::sum);
    
    int left = 0, matched = 0, minLen = Integer.MAX_VALUE, start = 0;
    Map<Character, Integer> window = new HashMap<>();
    
    for (int right = 0; right < s.length(); right++) {
        char c = s.charAt(right);
        window.merge(c, 1, Integer::sum);
        if (need.containsKey(c) && window.get(c).equals(need.get(c)))
            matched++;
        
        while (matched == need.size()) {
            if (right - left + 1 < minLen) {
                minLen = right - left + 1;
                start = left;
            }
            char leftChar = s.charAt(left++);
            if (need.containsKey(leftChar) && window.get(leftChar).equals(need.get(leftChar)))
                matched--;
            window.merge(leftChar, -1, Integer::sum);
        }
    }
    return minLen == Integer.MAX_VALUE ? "" : s.substring(start, start + minLen);
}`,
    subtopics: [],
  },
  "prefix-sum": {
    id: "prefix-sum",
    title: "Prefix Sum Arrays",
    description: "Use prefix sums to answer range queries in O(1) time after O(n) preprocessing",
    content: {
      concept: `A Prefix Sum array stores cumulative sums: prefix[i] = sum of elements from index 0 to i.

Construction: O(n)
  prefix[0] = arr[0]
  prefix[i] = prefix[i-1] + arr[i]

Range Sum Query: O(1)
  sum(l, r) = prefix[r] - prefix[l-1]
  (Use prefix[r] if l == 0)

This converts repeated O(n) range sum queries into O(1) lookups after one O(n) preprocessing step.

Variations:
1. Prefix Sum with HashMap:
   For "subarray with sum = k", store prefix sums in a HashMap. If prefix[j] - prefix[i] = k, then subarray (i+1, j) sums to k.

2. 2D Prefix Sum:
   For matrix region sum queries. Build a 2D prefix matrix where each cell contains the sum of the rectangle from (0,0) to (i,j).

3. Difference Array:
   The inverse of prefix sum. Used for range update operations: to add val to all elements in range [l, r], set diff[l] += val and diff[r+1] -= val, then compute prefix sum.

When to Use:
- Multiple range sum queries on a static array
- Finding subarrays with a target sum
- Counting subarrays satisfying sum conditions
- 2D region sum queries`,
      realWorld: "Prefix sums power database aggregate queries, image processing (integral images for fast blur/feature detection), financial running totals, and network traffic analysis over time windows.",
      commonMistakes: [
        "Off-by-one: forgetting to handle l == 0 case in range sum",
        "Modifying the original array after building the prefix sum (invalidates it)",
        "Integer overflow for large arrays — use long instead of int",
        "Confusing 0-indexed and 1-indexed prefix arrays",
        "Not recognizing that 'subarray sum equals k' is a prefix sum + HashMap problem",
      ],
      bestPractices: [
        "Use 1-indexed prefix arrays to avoid special-casing l == 0",
        "Use long[] for prefix sums to prevent overflow",
        "Combine with HashMap for subarray sum problems",
        "For 2D, use inclusion-exclusion: sum(r1,c1,r2,c2) = P[r2][c2] - P[r1-1][c2] - P[r2][c1-1] + P[r1-1][c1-1]",
        "Consider difference arrays when you need range updates instead of range queries",
      ],
      interviewRelevance: "Prefix sum is essential for medium/hard interview problems. Key problems: Subarray Sum Equals K, Contiguous Array, Range Sum Query 2D, Product of Array Except Self.",
    },
    codeLanguage: "java",
    codeExample: `// 1. Build Prefix Sum Array
public int[] buildPrefixSum(int[] arr) {
    int[] prefix = new int[arr.length];
    prefix[0] = arr[0];
    for (int i = 1; i < arr.length; i++) {
        prefix[i] = prefix[i-1] + arr[i];
    }
    return prefix;
}

// Range Sum Query: sum of arr[l..r]
public int rangeSum(int[] prefix, int l, int r) {
    return l == 0 ? prefix[r] : prefix[r] - prefix[l-1];
}

// 2. Subarray Sum Equals K (Prefix Sum + HashMap)
public int subarraySum(int[] nums, int k) {
    Map<Integer, Integer> prefixCount = new HashMap<>();
    prefixCount.put(0, 1); // Base case: empty prefix
    int sum = 0, count = 0;
    for (int num : nums) {
        sum += num;
        // If (sum - k) was a previous prefix sum,
        // then subarray between them sums to k
        count += prefixCount.getOrDefault(sum - k, 0);
        prefixCount.merge(sum, 1, Integer::sum);
    }
    return count;
}

// 3. Product of Array Except Self (Prefix + Suffix Products)
public int[] productExceptSelf(int[] nums) {
    int n = nums.length;
    int[] result = new int[n];
    
    // Forward pass: prefix products
    result[0] = 1;
    for (int i = 1; i < n; i++) {
        result[i] = result[i-1] * nums[i-1];
    }
    // Backward pass: multiply by suffix products
    int suffix = 1;
    for (int i = n - 1; i >= 0; i--) {
        result[i] *= suffix;
        suffix *= nums[i];
    }
    return result;
}

// 4. Contiguous Array (Longest Subarray with Equal 0s and 1s)
public int findMaxLength(int[] nums) {
    Map<Integer, Integer> firstSeen = new HashMap<>();
    firstSeen.put(0, -1);
    int sum = 0, maxLen = 0;
    for (int i = 0; i < nums.length; i++) {
        sum += (nums[i] == 0) ? -1 : 1;
        if (firstSeen.containsKey(sum)) {
            maxLen = Math.max(maxLen, i - firstSeen.get(sum));
        } else {
            firstSeen.put(sum, i);
        }
    }
    return maxLen;
}`,
    subtopics: [],
  },
  "kadanes-algorithm": {
    id: "kadanes-algorithm",
    title: "Kadane's Algorithm",
    description: "Find the maximum sum subarray in O(n) time using dynamic programming",
    content: {
      concept: `Kadane's Algorithm finds the contiguous subarray with the maximum sum in O(n) time and O(1) space. It's a classic example of dynamic programming.

Core Idea:
At each index i, decide: should I extend the previous subarray or start a new one here?
  currentMax = max(arr[i], currentMax + arr[i])
  globalMax = max(globalMax, currentMax)

If currentMax + arr[i] < arr[i], that means the previous subarray had a negative sum — it's better to start fresh.

Step-by-step for [-2, 1, -3, 4, -1, 2, 1, -5, 4]:
  i=0: current=-2, global=-2
  i=1: current=max(1, -2+1)=1, global=1
  i=2: current=max(-3, 1-3)=-2, global=1
  i=3: current=max(4, -2+4)=4, global=4
  i=4: current=max(-1, 4-1)=3, global=4
  i=5: current=max(2, 3+2)=5, global=5
  i=6: current=max(1, 5+1)=6, global=6 ✓
  i=7: current=max(-5, 6-5)=1, global=6
  i=8: current=max(4, 1+4)=5, global=6
  Answer: 6 (subarray [4, -1, 2, 1])

Variations:
- Track start/end indices of the max subarray
- Maximum circular subarray sum
- Maximum product subarray (track both max and min)
- Maximum sum with at most k elements`,
      realWorld: "Kadane's algorithm is used in financial analysis (maximum profit period), signal processing (strongest signal segment), bioinformatics (gene sequence analysis), and image processing (maximum brightness region).",
      commonMistakes: [
        "Not handling all-negative arrays (initialize globalMax to arr[0], not 0)",
        "Forgetting to reset currentMax when it goes below the current element",
        "Confusing maximum subarray sum with maximum subsequence sum (subsequence doesn't need contiguity)",
        "Not tracking indices when the problem asks for the actual subarray",
        "Applying Kadane's to circular arrays without the min-subarray trick",
      ],
      bestPractices: [
        "Initialize both currentMax and globalMax to arr[0], not 0 or Integer.MIN_VALUE",
        "For the circular variant: answer = max(normalKadane, totalSum - minSubarraySum)",
        "For max product: track both maxProduct and minProduct (negative × negative = positive)",
        "Always verify with all-negative input: [-3, -1, -2] should return -1",
        "This is DP where dp[i] = max(arr[i], dp[i-1] + arr[i]), optimized to O(1) space",
      ],
      interviewRelevance: "Kadane's Algorithm is a FAANG classic. It tests DP intuition and greedy thinking. Variants like Maximum Product Subarray and Maximum Circular Subarray Sum are common follow-ups.",
    },
    codeLanguage: "java",
    codeExample: `// 1. Classic Kadane's Algorithm
public int maxSubArray(int[] nums) {
    int currentMax = nums[0];
    int globalMax = nums[0];
    for (int i = 1; i < nums.length; i++) {
        currentMax = Math.max(nums[i], currentMax + nums[i]);
        globalMax = Math.max(globalMax, currentMax);
    }
    return globalMax;
}

// 2. Kadane's with Subarray Indices
public int[] maxSubArrayWithIndices(int[] nums) {
    int currentMax = nums[0], globalMax = nums[0];
    int start = 0, end = 0, tempStart = 0;
    for (int i = 1; i < nums.length; i++) {
        if (nums[i] > currentMax + nums[i]) {
            currentMax = nums[i];
            tempStart = i;
        } else {
            currentMax += nums[i];
        }
        if (currentMax > globalMax) {
            globalMax = currentMax;
            start = tempStart;
            end = i;
        }
    }
    return new int[]{globalMax, start, end};
}

// 3. Maximum Product Subarray
public int maxProduct(int[] nums) {
    int maxProd = nums[0], minProd = nums[0], result = nums[0];
    for (int i = 1; i < nums.length; i++) {
        if (nums[i] < 0) { // Swap when negative
            int temp = maxProd;
            maxProd = minProd;
            minProd = temp;
        }
        maxProd = Math.max(nums[i], maxProd * nums[i]);
        minProd = Math.min(nums[i], minProd * nums[i]);
        result = Math.max(result, maxProd);
    }
    return result;
}

// 4. Maximum Circular Subarray Sum
public int maxCircularSubarray(int[] nums) {
    int totalSum = 0;
    int maxSum = nums[0], curMax = 0;
    int minSum = nums[0], curMin = 0;
    for (int num : nums) {
        curMax = Math.max(num, curMax + num);
        maxSum = Math.max(maxSum, curMax);
        curMin = Math.min(num, curMin + num);
        minSum = Math.min(minSum, curMin);
        totalSum += num;
    }
    // If all negative, maxSum is the answer
    return maxSum < 0 ? maxSum : Math.max(maxSum, totalSum - minSum);
}`,
    subtopics: [],
  },
  files: {
    id: "files",
    title: "Files & Directories",
    description: "Navigate and manage the Linux file system like a pro",
    content: {
      concept: `The Linux file system is a hierarchical structure starting from the root directory (/). Everything in Linux is a file - including devices, processes, and network connections.

Key directories:
- **/home**: User home directories
- **/etc**: Configuration files
- **/var**: Variable data (logs, caches)
- **/usr**: User programs and utilities`,
      realWorld: "Understanding the file system is crucial for server administration, DevOps, and debugging production issues.",
      commonMistakes: [
        "Using rm -rf without caution",
        "Incorrect file permissions",
        "Not understanding relative vs absolute paths",
        "Ignoring hidden files (dotfiles)",
      ],
      bestPractices: [
        "Always use tab completion",
        "Use ls -la to see all file details",
        "Backup before modifying system files",
        "Understand permission implications",
      ],
      interviewRelevance: "Basic Linux skills are expected for any backend/DevOps role. Know your way around the terminal.",
    },
    codeLanguage: "bash",
    codeExample: `# Essential file system commands
ls -la          # List all files with details
cd /path/to/dir # Change directory
pwd             # Print working directory
mkdir -p dir    # Create directory (with parents)
cp -r src dest  # Copy recursively
mv old new      # Move/rename
rm -rf dir      # Remove directory (careful!)
find . -name "*.log" # Find files by pattern
chmod 755 file  # Change permissions
chown user:group file # Change ownership`,
    subtopics: [
      { id: "navigation", title: "Navigation" },
      { id: "file-operations", title: "File Operations" },
      { id: "permissions", title: "Permissions" },
      { id: "links", title: "Links & Symlinks" },
    ],
  },
  images: {
    id: "images",
    title: "Docker Images",
    description: "Build efficient container images with Dockerfile best practices",
    content: {
      concept: `Docker images are read-only templates used to create containers. They consist of layers, where each instruction in a Dockerfile creates a new layer.

Key concepts:
- **Base image**: Starting point (FROM instruction)
- **Layers**: Each instruction creates a cacheable layer
- **Build context**: Files available during build
- **Multi-stage builds**: Optimize final image size`,
      realWorld: "Container images are the deployment unit in modern cloud-native applications. Efficient images reduce costs and improve deployment speed.",
      commonMistakes: [
        "Using large base images",
        "Not leveraging build cache",
        "Including unnecessary files",
        "Running as root user",
      ],
      bestPractices: [
        "Use official slim/alpine base images",
        "Order instructions by change frequency",
        "Use multi-stage builds",
        "Scan images for vulnerabilities",
      ],
      interviewRelevance: "Docker is essential for DevOps roles. Understand image optimization and Dockerfile best practices.",
    },
    codeLanguage: "yaml",
    codeExample: `# Optimized multi-stage Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
USER nextjs
EXPOSE 3000
CMD ["npm", "start"]`,
    subtopics: [
      { id: "dockerfile", title: "Dockerfile Syntax" },
      { id: "layers", title: "Image Layers" },
      { id: "build", title: "Building Images" },
      { id: "registry", title: "Container Registry" },
    ],
  },
  "llm-fundamentals": {
    id: "llm-fundamentals",
    title: "LLM Fundamentals",
    description: "Understand how large language models work under the hood",
    content: {
      concept: `Large Language Models (LLMs) are neural networks trained on massive text datasets to understand and generate human-like text.

Key concepts:
- **Transformers**: The architecture behind modern LLMs using self-attention
- **Tokenization**: Breaking text into subword units for processing
- **Attention Mechanism**: Allows models to focus on relevant parts of input
- **Context Window**: Maximum tokens a model can process at once
- **Temperature**: Controls randomness in output generation`,
      realWorld: "LLMs power chatbots, code assistants, content generation, translation, and countless AI applications transforming every industry.",
      commonMistakes: [
        "Not understanding token limits",
        "Ignoring model hallucinations",
        "Using wrong model for the task",
        "Not considering latency and costs",
      ],
      bestPractices: [
        "Choose models based on task requirements",
        "Implement proper error handling",
        "Use streaming for better UX",
        "Monitor token usage and costs",
      ],
      interviewRelevance: "LLM knowledge is essential for AI/ML roles. Understand transformer architecture, tokenization, and model capabilities.",
    },
    codeLanguage: "javascript",
    codeExample: `// Basic LLM API call with OpenAI SDK
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chat(userMessage: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: userMessage }
    ],
    temperature: 0.7,
    max_tokens: 1000,
  });
  
  return response.choices[0].message.content;
}

// Streaming response for better UX
async function streamChat(userMessage: string) {
  const stream = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: userMessage }],
    stream: true,
  });
  
  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || "");
  }
}`,
    subtopics: [
      { id: "transformers", title: "Transformer Architecture" },
      { id: "tokenization", title: "Tokenization" },
      { id: "attention", title: "Attention Mechanism" },
      { id: "model-types", title: "Model Architectures" },
    ],
  },
  "prompt-engineering": {
    id: "prompt-engineering",
    title: "Prompt Engineering",
    description: "Master the art of crafting effective prompts for LLMs",
    content: {
      concept: `Prompt engineering is the practice of designing inputs that guide LLMs to produce desired outputs.

Key techniques:
- **Zero-shot**: Direct instructions without examples
- **Few-shot**: Providing examples to guide the model
- **Chain of Thought**: Breaking down reasoning step-by-step
- **System Prompts**: Setting context and behavior rules
- **Prompt Patterns**: Reusable templates for common tasks`,
      realWorld: "Effective prompts can improve accuracy by 50%+, reduce costs, and enable complex reasoning in production AI systems.",
      commonMistakes: [
        "Vague or ambiguous instructions",
        "Not providing enough context",
        "Overloading with too many instructions",
        "Ignoring output format specification",
      ],
      bestPractices: [
        "Be specific and explicit",
        "Use structured output formats (JSON)",
        "Iterate and test prompts systematically",
        "Version control your prompts",
      ],
      interviewRelevance: "Prompt engineering is crucial for building production AI applications. Know techniques like CoT, few-shot, and structured outputs.",
    },
    codeLanguage: "javascript",
    codeExample: `// Chain of Thought prompting for complex reasoning
const systemPrompt = \`You are an expert problem solver.
When given a problem, think through it step-by-step.
Format your response as:
1. Understanding: Restate the problem
2. Approach: Outline your solution strategy  
3. Steps: Work through each step
4. Answer: Provide the final answer\`;

// Few-shot prompting with examples
const fewShotPrompt = \`
Classify the sentiment of customer reviews.

Review: "This product is amazing! Best purchase ever."
Sentiment: Positive

Review: "Terrible quality, broke after one day."
Sentiment: Negative

Review: "It's okay, nothing special but works fine."
Sentiment: Neutral

Review: "\${userReview}"
Sentiment:\`;

// Structured JSON output
const jsonPrompt = \`Extract the following information as JSON:
{
  "name": "extracted name",
  "email": "extracted email", 
  "intent": "one of: inquiry, complaint, purchase"
}

Input: \${userInput}\`;`,
    subtopics: [
      { id: "zero-shot", title: "Zero-shot Prompting" },
      { id: "few-shot", title: "Few-shot Learning" },
      { id: "chain-of-thought", title: "Chain of Thought" },
      { id: "prompt-patterns", title: "Prompt Patterns" },
    ],
  },
  rag: {
    id: "rag",
    title: "RAG (Retrieval-Augmented Generation)",
    description: "Build AI applications that leverage external knowledge",
    content: {
      concept: `RAG combines the power of LLMs with external knowledge retrieval to provide accurate, up-to-date, and verifiable responses.

Key components:
- **Vector Database**: Stores document embeddings for similarity search
- **Embeddings**: Dense vector representations of text
- **Chunking**: Breaking documents into retrievable pieces
- **Retrieval**: Finding relevant context for queries
- **Generation**: Using retrieved context to generate responses`,
      realWorld: "RAG powers enterprise chatbots, documentation assistants, and any AI that needs access to private or current data beyond training.",
      commonMistakes: [
        "Poor chunking strategies",
        "Not considering retrieval quality",
        "Ignoring context window limits",
        "Missing hybrid search approaches",
      ],
      bestPractices: [
        "Use semantic chunking over fixed-size",
        "Implement re-ranking for better relevance",
        "Combine vector and keyword search",
        "Evaluate retrieval quality metrics",
      ],
      interviewRelevance: "RAG is the #1 pattern for production AI. Understand vector databases, embeddings, chunking, and retrieval optimization.",
    },
    codeLanguage: "javascript",
    codeExample: `// RAG implementation with vector database
import { OpenAIEmbeddings } from "@langchain/openai";
import { Pinecone } from "@pinecone-database/pinecone";

// 1. Create embeddings for documents
async function indexDocuments(documents: string[]) {
  const embeddings = new OpenAIEmbeddings();
  const pinecone = new Pinecone();
  const index = pinecone.index("knowledge-base");
  
  for (const doc of documents) {
    const vector = await embeddings.embedQuery(doc);
    await index.upsert([{
      id: generateId(),
      values: vector,
      metadata: { text: doc }
    }]);
  }
}

// 2. Retrieve relevant context
async function retrieve(query: string, topK = 5) {
  const embeddings = new OpenAIEmbeddings();
  const queryVector = await embeddings.embedQuery(query);
  
  const results = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true
  });
  
  return results.matches.map(m => m.metadata.text);
}

// 3. Generate with context
async function ragChat(query: string) {
  const context = await retrieve(query);
  
  return openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: \`Use this context: \${context.join("\\n")}\` },
      { role: "user", content: query }
    ]
  });
}`,
    subtopics: [
      { id: "vector-databases", title: "Vector Databases" },
      { id: "embeddings", title: "Embeddings" },
      { id: "chunking", title: "Chunking Strategies" },
      { id: "retrieval", title: "Retrieval Optimization" },
    ],
  },
  "ai-agents": {
    id: "ai-agents",
    title: "AI Agents",
    description: "Build autonomous AI agents that can reason, plan, and take actions",
    content: {
      concept: `AI Agents are systems that use LLMs to reason about tasks, make plans, and execute actions using tools.

Key patterns:
- **ReAct**: Reasoning and Acting in an interleaved manner
- **Tool Use**: Giving LLMs access to external functions
- **Planning**: Breaking complex tasks into subtasks
- **Memory**: Short-term and long-term information storage
- **Reflection**: Self-evaluation and course correction`,
      realWorld: "AI agents power autonomous customer support, coding assistants, research tools, and complex workflow automation.",
      commonMistakes: [
        "No guardrails on agent actions",
        "Infinite loops in reasoning",
        "Poor error handling",
        "Not validating tool outputs",
      ],
      bestPractices: [
        "Implement action limits and timeouts",
        "Use structured tool definitions",
        "Add human-in-the-loop for critical actions",
        "Log all agent decisions for debugging",
      ],
      interviewRelevance: "Agent architectures are hot topics. Understand ReAct, tool use, and production considerations for autonomous systems.",
    },
    codeLanguage: "javascript",
    codeExample: `// AI Agent with tool use
const tools = [
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the web for current information",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function", 
    function: {
      name: "send_email",
      description: "Send an email to a recipient",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" }
        },
        required: ["to", "subject", "body"]
      }
    }
  }
];

async function runAgent(task: string) {
  const messages = [{ role: "user", content: task }];
  
  while (true) {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
      tools,
      tool_choice: "auto"
    });
    
    const message = response.choices[0].message;
    messages.push(message);
    
    if (!message.tool_calls) break; // Agent is done
    
    // Execute tools and add results
    for (const call of message.tool_calls) {
      const result = await executeTool(call);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result)
      });
    }
  }
  
  return messages[messages.length - 1].content;
}`,
    subtopics: [
      { id: "react-pattern", title: "ReAct Pattern" },
      { id: "tool-use", title: "Tool Use" },
      { id: "planning", title: "Planning & Decomposition" },
      { id: "memory", title: "Memory Systems" },
    ],
  },
  mcp: {
    id: "mcp",
    title: "Model Context Protocol (MCP)",
    description: "Connect AI models to external tools, data, and services",
    content: {
      concept: `Model Context Protocol (MCP) is an open standard for connecting AI models to external data sources and tools in a secure, standardized way.

Key concepts:
- **MCP Servers**: Expose tools and resources to AI models
- **MCP Clients**: Connect to servers and use their capabilities
- **Tools**: Functions the model can call
- **Resources**: Data sources the model can access
- **Prompts**: Predefined prompt templates`,
      realWorld: "MCP enables AI assistants to connect to databases, APIs, file systems, and enterprise tools securely and efficiently.",
      commonMistakes: [
        "Exposing sensitive operations without auth",
        "Not validating tool inputs",
        "Poor error messages for the model",
        "Ignoring rate limiting",
      ],
      bestPractices: [
        "Implement proper authentication",
        "Use descriptive tool schemas",
        "Provide helpful error messages",
        "Test tool integrations thoroughly",
      ],
      interviewRelevance: "MCP is emerging as the standard for AI integrations. Understand the architecture and how to build MCP servers.",
    },
    codeLanguage: "javascript",
    codeExample: `// MCP Server implementation
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server(
  { name: "database-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Define tools
server.setRequestHandler("tools/list", async () => ({
  tools: [
    {
      name: "query_database",
      description: "Execute a read-only SQL query",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "SQL SELECT query" }
        },
        required: ["query"]
      }
    },
    {
      name: "get_schema",
      description: "Get the database schema",
      inputSchema: { type: "object", properties: {} }
    }
  ]
}));

// Handle tool calls
server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case "query_database":
      // Validate it's a SELECT query (security!)
      if (!args.query.trim().toUpperCase().startsWith("SELECT")) {
        throw new Error("Only SELECT queries allowed");
      }
      const results = await db.query(args.query);
      return { content: [{ type: "text", text: JSON.stringify(results) }] };
      
    case "get_schema":
      const schema = await db.getSchema();
      return { content: [{ type: "text", text: schema }] };
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);`,
    subtopics: [
      { id: "mcp-architecture", title: "MCP Architecture" },
      { id: "tool-definitions", title: "Tool Definitions" },
      { id: "server-impl", title: "Server Implementation" },
      { id: "client-integration", title: "Client Integration" },
    ],
  },
  "production-ai": {
    id: "production-ai",
    title: "Production AI Systems",
    description: "Deploy, monitor, and scale AI applications in production",
    content: {
      concept: `Building production AI requires careful attention to reliability, observability, evaluation, and cost management.

Key areas:
- **Observability**: Tracing, logging, and monitoring AI calls
- **Evaluation**: Measuring quality with automated evals
- **Fine-tuning**: Customizing models for specific tasks
- **Cost Optimization**: Reducing API costs at scale
- **Reliability**: Fallbacks, retries, and error handling`,
      realWorld: "Production AI systems at scale handle millions of requests daily, requiring robust infrastructure and careful cost management.",
      commonMistakes: [
        "No observability on AI calls",
        "Missing automated evaluations",
        "Ignoring cost until it's too late",
        "No fallback strategies",
      ],
      bestPractices: [
        "Implement tracing from day one",
        "Build automated eval suites",
        "Use caching aggressively",
        "Set up cost alerts and limits",
      ],
      interviewRelevance: "Production ML/AI experience is highly valued. Know observability tools, evaluation frameworks, and cost optimization strategies.",
    },
    codeLanguage: "javascript",
    codeExample: `// Production AI with observability and fallbacks
import { trace } from "@opentelemetry/api";

async function productionChat(
  messages: Message[],
  options: { fallbackModel?: string } = {}
) {
  const span = trace.getTracer("ai").startSpan("chat_completion");
  
  try {
    span.setAttributes({
      "ai.model": "gpt-4",
      "ai.messages.count": messages.length,
      "ai.tokens.estimate": estimateTokens(messages)
    });
    
    // Check cache first
    const cacheKey = hashMessages(messages);
    const cached = await cache.get(cacheKey);
    if (cached) {
      span.setAttributes({ "ai.cache": "hit" });
      return cached;
    }
    
    // Primary model with timeout
    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4",
        messages
      }),
      timeout(30000)
    ]);
    
    // Log metrics
    const usage = response.usage;
    span.setAttributes({
      "ai.tokens.prompt": usage.prompt_tokens,
      "ai.tokens.completion": usage.completion_tokens,
      "ai.cost": calculateCost(usage)
    });
    
    // Cache successful responses
    await cache.set(cacheKey, response, { ttl: 3600 });
    
    return response;
    
  } catch (error) {
    span.recordException(error);
    
    // Fallback to cheaper/faster model
    if (options.fallbackModel) {
      return openai.chat.completions.create({
        model: options.fallbackModel,
        messages
      });
    }
    throw error;
    
  } finally {
    span.end();
  }
}`,
    subtopics: [
      { id: "observability", title: "Observability & Tracing" },
      { id: "evaluation", title: "Evaluation & Testing" },
      { id: "fine-tuning", title: "Fine-tuning" },
      { id: "cost-optimization", title: "Cost Optimization" },
    ],
  },
  // ============= JAVA WELCOME =============
  "course-intro": {
    id: "course-intro",
    title: "Course Introduction",
    description: "Welcome to the Java track — here's what you'll learn and how to get the most out of this course",
    content: {
      concept: `Welcome to the Java Programming track! This course is designed to take you from the fundamentals of Java all the way to advanced topics like concurrency, design patterns, and building production-ready applications.

Here's what you'll cover:
- **Core Java**: Variables, control flow, methods, and arrays
- **Object-Oriented Programming**: Classes, inheritance, polymorphism, and interfaces
- **Collections Framework**: Lists, sets, maps, and utility classes
- **Exception Handling**: Try-catch, custom exceptions, and best practices
- **Concurrency**: Threads, executors, and synchronization
- **Modern Java**: Streams, lambdas, and functional programming
- **Build Tools & Testing**: Maven, Gradle, JUnit, and Mockito

Each topic includes clear explanations, real-world examples, code snippets, and interview tips.`,
      realWorld: "Java powers billions of devices worldwide — from Android apps and enterprise backends to big data systems and financial trading platforms. Learning Java opens doors to some of the most in-demand roles in software engineering.",
      commonMistakes: [
        "Trying to learn everything at once — follow the course order",
        "Skipping fundamentals and jumping to frameworks",
        "Not writing code alongside the lessons",
        "Ignoring best practices and coding conventions early on",
      ],
      bestPractices: [
        "Follow the curriculum in order for the best learning experience",
        "Code along with every example — don't just read",
        "Revisit topics you find challenging",
        "Use the practice problems to reinforce each concept",
      ],
      interviewRelevance: "Java is one of the top languages asked in technical interviews at companies like Google, Amazon, and Microsoft. This course prepares you for both OOP design and coding interview questions.",
    },
    codeLanguage: "java",
    codeExample: `// Your first Java program
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Welcome to the Java track!");
        System.out.println("Let's start coding.");
    }
}`,
    subtopics: [],
  },
  "java-ecosystem": {
    id: "java-ecosystem",
    title: "Java Ecosystem Overview",
    description: "Understand the Java platform, JVM, JDK, JRE and the broader ecosystem",
    content: {
      concept: `Java is more than just a programming language — it's an entire ecosystem built around the Java Virtual Machine (JVM).

Key components:
- **JDK (Java Development Kit)**: The full development toolkit — includes the compiler (javac), debugger, and libraries
- **JRE (Java Runtime Environment)**: Everything needed to run Java applications (JVM + core libraries)
- **JVM (Java Virtual Machine)**: The engine that executes Java bytecode — enables "write once, run anywhere"
- **Bytecode**: Java source code compiles to platform-independent bytecode (.class files), which the JVM interprets

The ecosystem also includes:
- **Build Tools**: Maven, Gradle — manage dependencies and build pipelines
- **Frameworks**: Spring, Spring Boot, Jakarta EE — for building web and enterprise applications
- **Testing**: JUnit, Mockito, TestNG — for unit and integration testing
- **IDE Support**: IntelliJ IDEA, Eclipse, VS Code — powerful development environments`,
      realWorld: "The JVM ecosystem runs some of the world's largest systems. Netflix, LinkedIn, and Uber use JVM-based technologies extensively. Languages like Kotlin, Scala, and Groovy also run on the JVM, making it a versatile platform.",
      commonMistakes: [
        "Confusing JDK, JRE, and JVM — they are related but different",
        "Not understanding that Java compiles to bytecode, not native machine code",
        "Ignoring build tools and trying to manage dependencies manually",
        "Choosing an outdated Java version instead of using an LTS release",
      ],
      bestPractices: [
        "Always use an LTS (Long-Term Support) version of Java (e.g., Java 17 or 21)",
        "Learn a build tool early — Maven or Gradle",
        "Understand the compile → bytecode → JVM execution flow",
        "Use a modern IDE like IntelliJ IDEA for productivity",
      ],
      interviewRelevance: "Interviewers often ask about JVM internals, garbage collection, and the difference between JDK/JRE/JVM. Understanding the ecosystem shows depth beyond just writing code.",
    },
    codeLanguage: "bash",
    codeExample: `# Check Java version
java --version

# Compile a Java file to bytecode
javac HelloWorld.java

# Run the compiled bytecode
java HelloWorld

# View bytecode (disassemble)
javap -c HelloWorld.class`,
    subtopics: [],
  },
  "setup-environment": {
    id: "setup-environment",
    title: "Setting Up Your Environment",
    description: "Install Java, configure your IDE, and run your first program",
    content: {
      concept: `Before writing Java code, you need to set up your development environment. Here's a step-by-step guide:

**1. Install the JDK**
Download and install the latest LTS version of Java (Java 21 recommended) from:
- Oracle JDK: oracle.com/java
- OpenJDK (free): adoptium.net or sdkman.io

**2. Set JAVA_HOME**
Configure the JAVA_HOME environment variable so tools and IDEs can locate your Java installation.

**3. Choose an IDE**
- **IntelliJ IDEA** (recommended): Best-in-class Java support, free Community Edition
- **VS Code**: Lightweight with the "Extension Pack for Java"
- **Eclipse**: Traditional choice, fully featured

**4. Create Your First Project**
Use your IDE to create a new Java project, write a simple main method, and run it.

**5. Install a Build Tool**
- **Maven**: XML-based, widely used in enterprises
- **Gradle**: Groovy/Kotlin DSL, more modern and flexible`,
      realWorld: "Professional Java developers use IDEs like IntelliJ IDEA daily. Build tools like Maven and Gradle are essential for any real-world project — they handle dependencies, testing, and deployment automation.",
      commonMistakes: [
        "Not setting JAVA_HOME correctly, causing 'java not found' errors",
        "Using a text editor instead of a proper IDE for Java development",
        "Installing a non-LTS Java version for learning",
        "Skipping build tool setup — it becomes harder to add later",
      ],
      bestPractices: [
        "Use SDKMAN (sdkman.io) to manage multiple Java versions easily",
        "Start with IntelliJ IDEA Community Edition — it's free and powerful",
        "Verify your setup by compiling and running a Hello World program",
        "Set up a simple Maven or Gradle project from day one",
      ],
      interviewRelevance: "While setup isn't directly asked in interviews, demonstrating knowledge of build tools, project structure, and environment configuration shows professional maturity.",
    },
    codeLanguage: "bash",
    codeExample: `# Install Java with SDKMAN (macOS/Linux)
curl -s "https://get.sdkman.io" | bash
sdk install java 21-tem

# Verify installation
java --version
javac --version

# Create a project with Maven
mvn archetype:generate \\
  -DgroupId=com.example \\
  -DartifactId=my-first-app \\
  -DarchetypeArtifactId=maven-archetype-quickstart

# Run with Maven
cd my-first-app
mvn compile exec:java`,
    subtopics: [],
  },
};

export interface PracticeProblem {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  track: string;
  category: string;
  concept: string;
  solved: boolean;
  description?: string;
}

export const practiceProblems: PracticeProblem[] = [
  // DSA - Arrays
  { id: "two-sum", title: "Two Sum", difficulty: "easy", track: "dsa", category: "Arrays & Strings", concept: "Hash Tables", solved: true, description: "Find two numbers that add up to target" },
  { id: "best-time-buy-sell", title: "Best Time to Buy and Sell Stock", difficulty: "easy", track: "dsa", category: "Arrays & Strings", concept: "Sliding Window", solved: true, description: "Maximize profit from stock transactions" },
  { id: "contains-duplicate", title: "Contains Duplicate", difficulty: "easy", track: "dsa", category: "Arrays & Strings", concept: "Hash Tables", solved: true, description: "Check if array contains duplicates" },
  { id: "merge-intervals", title: "Merge Intervals", difficulty: "medium", track: "dsa", category: "Arrays & Strings", concept: "Sorting", solved: false, description: "Merge overlapping intervals" },
  { id: "product-except-self", title: "Product of Array Except Self", difficulty: "medium", track: "dsa", category: "Arrays & Strings", concept: "Prefix Sum", solved: false, description: "Calculate product without division" },
  { id: "trapping-rain-water", title: "Trapping Rain Water", difficulty: "hard", track: "dsa", category: "Arrays & Strings", concept: "Two Pointers", solved: false, description: "Calculate trapped water between bars" },
  
  // DSA - Linked Lists
  { id: "reverse-linked-list", title: "Reverse Linked List", difficulty: "easy", track: "dsa", category: "Linked Lists", concept: "Pointers", solved: true, description: "Reverse a singly linked list" },
  { id: "merge-two-lists", title: "Merge Two Sorted Lists", difficulty: "easy", track: "dsa", category: "Linked Lists", concept: "Recursion", solved: false, description: "Merge two sorted linked lists" },
  { id: "linked-list-cycle", title: "Linked List Cycle", difficulty: "easy", track: "dsa", category: "Linked Lists", concept: "Fast & Slow", solved: true, description: "Detect cycle in linked list" },
  { id: "remove-nth-node", title: "Remove Nth Node From End", difficulty: "medium", track: "dsa", category: "Linked Lists", concept: "Two Pointers", solved: false, description: "Remove nth node from end" },
  { id: "reorder-list", title: "Reorder List", difficulty: "medium", track: "dsa", category: "Linked Lists", concept: "Fast & Slow", solved: false, description: "Reorder list in specific pattern" },
  { id: "merge-k-sorted-lists", title: "Merge K Sorted Lists", difficulty: "hard", track: "dsa", category: "Linked Lists", concept: "Heap", solved: false, description: "Merge k sorted linked lists" },
  
  // DSA - Stack & Queue
  { id: "valid-parentheses", title: "Valid Parentheses", difficulty: "easy", track: "dsa", category: "Stacks & Queues", concept: "Stack", solved: true, description: "Check if parentheses are valid" },
  { id: "min-stack", title: "Min Stack", difficulty: "medium", track: "dsa", category: "Stacks & Queues", concept: "Stack Design", solved: false, description: "Design stack with O(1) min" },
  { id: "daily-temperatures", title: "Daily Temperatures", difficulty: "medium", track: "dsa", category: "Stacks & Queues", concept: "Monotonic Stack", solved: false, description: "Days until warmer temperature" },
  { id: "largest-rectangle-histogram", title: "Largest Rectangle in Histogram", difficulty: "hard", track: "dsa", category: "Stacks & Queues", concept: "Monotonic Stack", solved: false, description: "Find largest rectangle area" },
  
  // DSA - Trees
  { id: "invert-binary-tree", title: "Invert Binary Tree", difficulty: "easy", track: "dsa", category: "Trees", concept: "Recursion", solved: true, description: "Invert a binary tree" },
  { id: "max-depth-binary-tree", title: "Maximum Depth of Binary Tree", difficulty: "easy", track: "dsa", category: "Trees", concept: "DFS", solved: true, description: "Find maximum depth of tree" },
  { id: "validate-bst", title: "Validate Binary Search Tree", difficulty: "medium", track: "dsa", category: "Trees", concept: "BST Properties", solved: false, description: "Check if valid BST" },
  { id: "binary-tree-level-order", title: "Binary Tree Level Order Traversal", difficulty: "medium", track: "dsa", category: "Trees", concept: "BFS", solved: false, description: "Level order traversal" },
  { id: "serialize-deserialize-tree", title: "Serialize and Deserialize Binary Tree", difficulty: "hard", track: "dsa", category: "Trees", concept: "Tree Serialization", solved: false, description: "Serialize/deserialize binary tree" },
  
  // DSA - Graphs
  { id: "number-of-islands", title: "Number of Islands", difficulty: "medium", track: "dsa", category: "Graphs", concept: "DFS/BFS", solved: false, description: "Count islands in grid" },
  { id: "clone-graph", title: "Clone Graph", difficulty: "medium", track: "dsa", category: "Graphs", concept: "Graph Traversal", solved: false, description: "Deep copy a graph" },
  { id: "course-schedule", title: "Course Schedule", difficulty: "medium", track: "dsa", category: "Graphs", concept: "Topological Sort", solved: false, description: "Check if courses can be finished" },
  { id: "word-ladder", title: "Word Ladder", difficulty: "hard", track: "dsa", category: "Graphs", concept: "BFS", solved: false, description: "Transform word with minimum steps" },
  
  // DSA - Dynamic Programming
  { id: "climbing-stairs", title: "Climbing Stairs", difficulty: "easy", track: "dsa", category: "Dynamic Programming", concept: "1D DP", solved: true, description: "Ways to climb n stairs" },
  { id: "house-robber", title: "House Robber", difficulty: "medium", track: "dsa", category: "Dynamic Programming", concept: "1D DP", solved: false, description: "Maximum money without alerting" },
  { id: "coin-change", title: "Coin Change", difficulty: "medium", track: "dsa", category: "Dynamic Programming", concept: "Unbounded Knapsack", solved: false, description: "Minimum coins for amount" },
  { id: "longest-common-subsequence", title: "Longest Common Subsequence", difficulty: "medium", track: "dsa", category: "Dynamic Programming", concept: "2D DP", solved: false, description: "Find LCS of two strings" },
  { id: "edit-distance", title: "Edit Distance", difficulty: "hard", track: "dsa", category: "Dynamic Programming", concept: "2D DP", solved: false, description: "Minimum edits to transform" },
  
  // System Design
  { id: "url-shortener", title: "Design URL Shortener", difficulty: "medium", track: "system-design", category: "Case Studies", concept: "Hashing", solved: false, description: "Design a URL shortening service" },
  { id: "rate-limiter", title: "Design Rate Limiter", difficulty: "medium", track: "system-design", category: "Reliability", concept: "Token Bucket", solved: false, description: "Rate limiting system design" },
  { id: "chat-system", title: "Design Chat System", difficulty: "medium", track: "system-design", category: "Case Studies", concept: "WebSockets", solved: false, description: "Real-time messaging system" },
  { id: "news-feed", title: "Design News Feed", difficulty: "hard", track: "system-design", category: "Case Studies", concept: "Fan-out", solved: false, description: "Social media news feed" },
  { id: "distributed-cache", title: "Design Distributed Cache", difficulty: "hard", track: "system-design", category: "Caching", concept: "Consistent Hashing", solved: false, description: "Distributed caching system" },
  
  // Linux
  { id: "file-permissions", title: "Linux File Permissions", difficulty: "easy", track: "linux", category: "Files & Directories", concept: "chmod", solved: true, description: "Manage file permissions" },
  { id: "process-management", title: "Process Management", difficulty: "medium", track: "linux", category: "Processes", concept: "ps/top/kill", solved: false, description: "Manage Linux processes" },
  { id: "shell-scripting-basics", title: "Shell Scripting Basics", difficulty: "medium", track: "linux", category: "Shell Scripting", concept: "Bash", solved: false, description: "Write basic shell scripts" },
  { id: "linux-networking", title: "Network Troubleshooting", difficulty: "medium", track: "linux", category: "Networking", concept: "netstat/curl", solved: false, description: "Debug network issues" },
  
  // Git
  { id: "git-basics", title: "Git Fundamentals", difficulty: "easy", track: "git", category: "Basics", concept: "init/add/commit", solved: true, description: "Basic Git operations" },
  { id: "git-branching", title: "Branching & Merging", difficulty: "medium", track: "git", category: "Branching", concept: "branch/merge", solved: false, description: "Branch management" },
  { id: "git-rebase", title: "Interactive Rebase", difficulty: "hard", track: "git", category: "History", concept: "rebase -i", solved: false, description: "Rewrite commit history" },
  
  // Java
  { id: "java-collections", title: "Collections Framework", difficulty: "medium", track: "java", category: "Collections", concept: "List/Set/Map", solved: false, description: "Java collections deep dive" },
  { id: "java-multithreading", title: "Multithreading Basics", difficulty: "hard", track: "java", category: "Concurrency", concept: "Threads", solved: false, description: "Thread management in Java" },
  
  // Docker
  { id: "dockerfile-basics", title: "Dockerfile Best Practices", difficulty: "medium", track: "docker", category: "Images", concept: "Multi-stage", solved: false, description: "Write efficient Dockerfiles" },
  { id: "docker-compose", title: "Docker Compose", difficulty: "medium", track: "docker", category: "Orchestration", concept: "compose.yml", solved: false, description: "Multi-container apps" },
  
  // Kubernetes
  { id: "k8s-pods", title: "Kubernetes Pods", difficulty: "medium", track: "kubernetes", category: "Pods", concept: "Pod Spec", solved: false, description: "Understand K8s pods" },
  { id: "k8s-deployments", title: "Deployments & Services", difficulty: "medium", track: "kubernetes", category: "Workloads", concept: "Deployment", solved: false, description: "Manage K8s workloads" },
  
  // Cloud
  { id: "aws-ec2", title: "EC2 Instance Management", difficulty: "medium", track: "cloud", category: "Compute", concept: "EC2", solved: false, description: "AWS EC2 fundamentals" },
  { id: "aws-s3", title: "S3 Storage Patterns", difficulty: "medium", track: "cloud", category: "Storage", concept: "S3", solved: false, description: "AWS S3 best practices" },
  
  // AI & LLMs
  { id: "prompt-engineering", title: "Prompt Engineering Patterns", difficulty: "easy", track: "ai", category: "Prompt Engineering", concept: "Few-shot", solved: true, description: "Master effective prompting" },
  { id: "rag-implementation", title: "Build a RAG System", difficulty: "medium", track: "ai", category: "RAG", concept: "Vector DB", solved: false, description: "Retrieval-augmented generation" },
  { id: "ai-agent-basics", title: "Build an AI Agent", difficulty: "medium", track: "ai", category: "AI Agents", concept: "ReAct", solved: false, description: "Create autonomous AI agents" },
  { id: "mcp-server", title: "MCP Server Implementation", difficulty: "hard", track: "ai", category: "MCP", concept: "Tool Use", solved: false, description: "Build MCP server for tools" },
];
