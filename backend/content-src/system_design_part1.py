"""System Design track, part 1: Welcome, Intro, Core Concepts, Load Balancing.

Source of truth for migration V4. Regenerate with:  python3 backend/content-src/generate_sql.py
Plain text only (the lesson page does not render markdown); "- " lines are bullets.
"""

TRACK = "system-design"

# (section_slug, lesson_slug) -> content
LESSONS = {}


def lesson(section, slug, **fields):
    LESSONS[(section, slug)] = fields


# ───────────────────────── Welcome ─────────────────────────

lesson("welcome", "course-introduction",
    summary="What this course covers and how it is organised.",
    concept="""System design is the skill of turning a vague requirement, such as "build something like Twitter", into an architecture that works for real users at real scale. This course teaches that skill from the ground up.

You will learn it in layers:
- Core concepts: scalability, availability, consistency and the trade-offs between them.
- Building blocks: load balancers, caches, databases, queues, storage and APIs.
- Distributed systems: replication, consensus, partitioning and distributed transactions.
- Patterns: microservices, event-driven design, resilience and observability.
- Practice: worked case studies such as a URL shortener, a chat system and a news feed.

Every lesson follows the same shape: the concept, where it shows up in real products, the mistakes people make, best practices, and how it appears in interviews. Read a lesson, then try to explain it back in your own words. That habit matters more than memorising any single architecture.""",
    realWorld="The same handful of ideas power very different products. A payment service, a video platform and a ride-hailing app all rely on replication, caching, queues and careful failure handling.",
    commonMistakes=[
        "Jumping straight to case studies before learning the building blocks",
        "Memorising famous architectures instead of understanding why each choice was made",
        "Treating system design as having one correct answer",
    ],
    bestPractices=[
        "Follow the sections in order the first time through",
        "After each lesson, explain the idea aloud without looking at the notes",
        "Sketch a diagram for every concept, even a rough one",
    ],
    interviewRelevance="System design rounds test how you reason about trade-offs, not whether you recall a particular diagram. This course is built around that reasoning.")

lesson("welcome", "course-roadmap",
    summary="The path through the track, from fundamentals to case studies.",
    concept="""The track is ordered so that each section depends only on the ones before it.

1. Foundations: what system design is, and the core concepts (scalability, availability, reliability, latency, consistency, CAP).
2. Networking and traffic: how requests travel, and how load balancers spread them across servers.
3. Building blocks: APIs, communication patterns and message queues, caching, databases and database scaling, and storage systems.
4. Trade-offs: where every design decision costs you something.
5. Distributed systems: consensus, replication, partitioning and transactions across services.
6. Architecture: monoliths, microservices, serverless and event sourcing, plus the resilience patterns that keep them standing.
7. Operating at scale: big data processing, observability and security.

You can skip around if you already know a topic, but do not skip the core concepts. Almost every later lesson refers back to them.""",
    realWorld="Engineering teams grow into this same sequence. They start with a single server and database, then add caching, then replication, then split services as scale and team size demand.",
    commonMistakes=[
        "Skipping the core concepts because they seem too basic",
        "Reading only the topics that look relevant to the next interview",
    ],
    bestPractices=[
        "Keep a running glossary of terms as you go",
        "Revisit the trade-offs section after finishing the building blocks",
        "Use the practice problems to test what you have learned",
    ],
    interviewRelevance="Interviewers expect you to move through requirements, estimation, high-level design and deep dives in that order. The roadmap mirrors that structure.")

lesson("welcome", "join-community",
    title="How to Study This Course",
    summary="A simple routine for retaining what you learn.",
    concept="""Reading about architecture is easy to forget unless you do something with it. A routine that works well:

- Read one lesson at a time. Resist the urge to binge several in a row.
- Close the page and write a three-sentence summary from memory.
- Draw the system on paper: boxes for components, arrows for requests.
- Ask what breaks. Remove a server, slow down a database, double the traffic. What happens?
- Return a few days later and explain the lesson again without notes.

Treat the practice problems as the real test. If you can design a URL shortener and justify each choice, the concepts have stuck. If you cannot, go back to the lessons that cover the gap.""",
    realWorld="Working engineers do exactly this in design reviews: they draw the system, then probe it for failure modes before anyone writes code.",
    commonMistakes=[
        "Passively reading without ever drawing or explaining anything",
        "Studying only when an interview is close",
        "Ignoring failure scenarios and only designing the happy path",
    ],
    bestPractices=[
        "Study in short, regular sessions instead of long cramming ones",
        "Discuss designs with a friend or colleague and defend your choices",
        "Keep your diagrams and review them later",
    ],
    interviewRelevance="Being able to talk through a design out loud is the actual interview skill. Practising explanation is practising the interview.")

# ───────────────────────── Intro ─────────────────────────

lesson("intro-system-design", "what-is-system-design",
    summary="Defining components, interfaces and data for a system that meets its requirements.",
    concept="""System design is the process of defining the architecture, components, interfaces and data of a system so that it satisfies a set of requirements.

It works at two levels:
- High-level design (HLD): the big picture. Which services exist, how they talk to each other, where data lives, and how the system scales.
- Low-level design (LLD): the inside of a component. Classes, methods, data models and design patterns.

Requirements come in two kinds:
- Functional: what the system does. "Users can post a message."
- Non-functional: how well it does it. "Messages appear within one second, and the service stays up 99.9% of the time."

Most of the hard decisions come from the non-functional requirements. A system that must serve ten users and one that must serve ten million have the same features but completely different designs.

A design is never simply right or wrong. It is a set of trade-offs that fits a particular set of constraints.""",
    realWorld="Choosing between a single PostgreSQL database and a sharded cluster is a system design decision. So is deciding whether a notification should be sent synchronously or through a queue.",
    commonMistakes=[
        "Designing before clarifying what the system must actually do",
        "Ignoring non-functional requirements such as latency, availability and cost",
        "Over-engineering for scale the product will never reach",
    ],
    bestPractices=[
        "Write down functional and non-functional requirements first",
        "Start with the simplest design that works, then evolve it",
        "State your assumptions and the numbers behind them",
    ],
    interviewRelevance="Every design interview begins with clarifying requirements. Candidates who skip this step usually design the wrong system.")

lesson("intro-system-design", "why-system-design-matters",
    summary="Why architecture decisions outlast the code written on top of them.",
    concept="""Code can be rewritten in days. Architecture is much harder to change, because data, other services and entire teams depend on it.

Good system design pays off in several ways:
- Scale: the system keeps working as users, data and traffic grow.
- Reliability: a single failing machine or network does not take the product down.
- Cost: you spend on the parts that need capacity and not on the parts that do not.
- Speed of change: clear boundaries let teams work and deploy independently.

Poor design shows up late and expensively: pages that time out at peak traffic, outages from a single point of failure, or a database that can no longer be migrated because everything reads from it.

The goal is not to build the most sophisticated architecture. It is to make the important decisions deliberately, early enough that they are cheap to change.""",
    realWorld="Many large companies began as a single application and database. They survived growth because key decisions, such as stateless servers and clear data ownership, left room to scale later.",
    commonMistakes=[
        "Assuming scale problems can always be fixed later at no cost",
        "Copying a big company's architecture without having its problems",
        "Treating architecture as a one-time activity instead of an ongoing one",
    ],
    bestPractices=[
        "Make irreversible decisions, such as data models and public APIs, carefully",
        "Keep components loosely coupled so they can be replaced",
        "Revisit the design as real traffic data arrives",
    ],
    interviewRelevance="Senior engineering roles are judged largely on design judgment. Expect to be asked to justify a choice and to say what you would change at ten times the load.")

# ───────────────────────── Core concepts ─────────────────────────

lesson("core-concepts", "scalability",
    summary="How a system handles growth in load, data and users.",
    concept="""Scalability is a system's ability to handle more work by adding resources, without a proportional drop in performance.

There are two basic ways to scale:
- Vertical scaling (scale up): give one machine more CPU, memory or disk. It is simple, with no code changes, but it has a hard ceiling and the machine remains a single point of failure.
- Horizontal scaling (scale out): add more machines and share the work between them. It has no practical ceiling and tolerates failures, but it needs load balancing and makes data harder to manage.

For horizontal scaling to work, application servers should be stateless. If a server keeps a user's session in its own memory, that user must always return to that server. Moving the state to a shared store such as Redis or a database lets any server handle any request.

Scaling also means finding the bottleneck. Adding web servers does nothing if the database is the limit. The usual order of attack is: measure, find the slowest component, fix that, repeat.""",
    realWorld="A web shop handles a sale by adding more application servers behind a load balancer. Once the database becomes the limit, it adds read replicas and a cache in front of it.",
    commonMistakes=[
        "Scaling the wrong component without measuring where the bottleneck is",
        "Keeping session state inside individual servers",
        "Jumping to a distributed design before a single well-tuned server is exhausted",
        "Forgetting that the database is often the hardest part to scale",
    ],
    bestPractices=[
        "Make application servers stateless from the start",
        "Measure before optimising: load test and profile",
        "Scale the cheapest bottleneck first, usually with caching",
        "Plan for failure of any single instance",
    ],
    interviewRelevance="Almost every design question reaches scalability. Be ready to explain vertical versus horizontal scaling and to name the specific bottleneck you would address first.")

lesson("core-concepts", "availability",
    summary="The fraction of time a system is up and able to serve requests.",
    concept="""Availability is the percentage of time a system is operational and able to serve requests. It is usually described in nines:

- 99% ("two nines"): about 3.65 days of downtime per year
- 99.9% ("three nines"): about 8.8 hours per year
- 99.99% ("four nines"): about 52 minutes per year
- 99.999% ("five nines"): about 5 minutes per year

Each extra nine is dramatically more expensive, because it requires removing more single points of failure.

How components combine matters:
- In series (A needs B), availability multiplies. Two 99.9% components give about 99.8%.
- In parallel (redundant copies), failure requires all copies to fail. Two independent 99.9% copies give 1 - (0.001 x 0.001) = 99.9999%.

That is why redundancy is the core technique: multiple servers, multiple data centres, replicated databases and automatic failover. The catch is that redundancy only helps if failures are independent and if failover actually works, which means testing it.""",
    realWorld="Cloud providers publish availability targets for their services. Applications reach higher availability by running across several zones so that the loss of one data centre does not cause an outage.",
    code_language="java",
    code_example="""// Downtime allowed per year for a given availability target
static double downtimeMinutesPerYear(double availability) {
    double minutesPerYear = 365 * 24 * 60;
    return (1 - availability) * minutesPerYear;
}

// Availability of components chained in series (all must work)
static double series(double... a) {
    double result = 1;
    for (double x : a) result *= x;
    return result;
}

// Availability of redundant components (at least one must work)
static double parallel(double... a) {
    double allFail = 1;
    for (double x : a) allFail *= (1 - x);
    return 1 - allFail;
}""",
    commonMistakes=[
        "Quoting availability without defining what counts as down",
        "Adding redundancy but never testing failover",
        "Ignoring dependencies: your availability cannot exceed that of a service you depend on in series",
        "Assuming replicas fail independently when they share a network or power source",
    ],
    bestPractices=[
        "Remove single points of failure at every layer",
        "Spread replicas across failure domains such as zones",
        "Automate failover and rehearse it",
        "Use health checks so traffic only goes to healthy instances",
    ],
    interviewRelevance="Interviewers expect the nines table, the series versus parallel calculation, and a concrete plan for removing single points of failure.")

lesson("core-concepts", "reliability",
    summary="The probability that a system performs correctly over time, even when parts fail.",
    concept="""Reliability is the ability of a system to keep working correctly, including when hardware fails, software has bugs or users make mistakes. It is related to availability but not the same thing. A system can be up (available) while returning wrong answers (unreliable).

Failures come in three groups:
- Hardware faults: disks fail, machines lose power, networks drop packets.
- Software faults: bugs, memory leaks, bad deployments, cascading overloads.
- Human errors: misconfiguration is among the most common causes of outages.

You cannot prevent every fault, so reliable systems are designed to be fault tolerant: a fault in one part does not become a failure of the whole.

Common techniques:
- Redundancy and replication
- Timeouts and retries with backoff
- Graceful degradation: show cached or partial results instead of an error page
- Circuit breakers to stop calling a failing dependency
- Safe deployments: canary releases and fast rollback

Two useful measures are MTBF (mean time between failures) and MTTR (mean time to repair). Reliability improves by failing less often and by recovering faster.""",
    realWorld="A video platform that cannot load recommendations still plays videos. It degrades the personalised row to a generic one rather than failing the whole page.",
    commonMistakes=[
        "Retrying immediately and in unlimited numbers, which turns a small failure into an overload",
        "Treating rare failures as impossible",
        "Having no rollback plan for deployments",
    ],
    bestPractices=[
        "Set a timeout on every network call",
        "Retry with exponential backoff and jitter, and only for safe operations",
        "Decide in advance how each feature degrades",
        "Practise failure with game days or fault injection",
    ],
    interviewRelevance="A strong answer names the failure modes of your design and says how the system behaves in each one.")

lesson("core-concepts", "latency-throughput",
    summary="Two different measures of performance: how fast one request is, and how many you can serve.",
    concept="""Latency is the time one request takes from start to finish. Throughput is how many requests or how much data the system handles per unit of time, for example requests per second.

They are related but independent. A highway with a high speed limit has low latency per car. Adding lanes raises throughput without changing the speed of any single car.

Latency should be measured with percentiles, not averages:
- p50 (median): the typical request
- p95 and p99: the slow tail

The average hides the tail, and the tail is what users notice. If a page makes many backend calls, the chance that at least one hits a slow p99 is high, so tail latency tends to dominate.

A useful relationship is Little's Law: concurrent requests in flight = throughput x average latency. If a service handles 1,000 requests per second and each takes 200 ms, about 200 requests are in flight at any moment. That tells you how many connections or threads you need.

Techniques differ. Lowering latency uses caching, fewer network hops and faster queries. Raising throughput uses parallelism, batching and horizontal scaling.""",
    realWorld="Search engines optimise p99 latency aggressively, because a slow response for a small share of users is still millions of slow responses.",
    commonMistakes=[
        "Reporting only the average latency",
        "Optimising throughput when users are complaining about latency, or the reverse",
        "Ignoring queueing: latency rises sharply as utilisation nears 100%",
    ],
    bestPractices=[
        "Track p50, p95 and p99 for every important endpoint",
        "Leave headroom: keep utilisation well below saturation",
        "Reduce the number of sequential calls in a request path",
        "Set latency targets as part of your SLOs",
    ],
    interviewRelevance="Know the difference cold, why percentiles beat averages, and how to size a system with Little's Law.")

lesson("core-concepts", "consistency",
    summary="What different readers see after data is written.",
    concept="""Consistency describes what a reader can expect to see after a write, especially when data is stored in several places.

Common models, from strongest to weakest:
- Strong (linearizable) consistency: once a write completes, every later read sees it. The system behaves as if there is one copy. It is the easiest to reason about but costs latency and availability.
- Causal consistency: operations that are related, such as a reply and the post it answers, are seen in order by everyone.
- Read-your-writes: you always see your own updates, even if others briefly do not.
- Eventual consistency: if writes stop, all copies converge to the same value eventually. Reads may be stale in the meantime. It is fast and highly available.

Choosing a model is a product decision as well as a technical one. A bank balance needs strong consistency. A like count on a post can be a few seconds stale without harm.

Replication is what makes this a concern. With a single copy there is nothing to disagree about. Once data is replicated for availability or scale, you must decide how quickly and how strictly replicas agree.""",
    realWorld="A social feed shows a new post to its author immediately (read-your-writes) while followers may see it a moment later. A payment ledger, by contrast, must never show two different balances.",
    commonMistakes=[
        "Assuming a replicated database always returns the latest write",
        "Using strong consistency everywhere and paying for it needlessly",
        "Using eventual consistency for data where stale reads cause real harm",
    ],
    bestPractices=[
        "Decide the required consistency per piece of data, not per system",
        "Route a user's reads to a replica that has their latest write, or to the primary",
        "Design the user interface to tolerate brief staleness",
    ],
    interviewRelevance="Be able to name the models, give an example of where each is appropriate, and explain what you give up to get strong consistency.")

lesson("core-concepts", "cap-theorem",
    summary="In a network partition, a distributed system must choose between consistency and availability.",
    concept="""The CAP theorem says a distributed data store can provide at most two of three guarantees at the same time:

- Consistency (C): every read receives the most recent write or an error.
- Availability (A): every request receives a non-error response.
- Partition tolerance (P): the system keeps operating even when messages between nodes are lost or delayed.

The important point is that partitions are not optional. Networks do fail. So in a real distributed system you are choosing what to sacrifice during a partition:

- CP systems stay consistent and refuse some requests while partitioned. Examples: ZooKeeper, etcd, HBase.
- AP systems keep answering from whatever data they have, accepting that replicas may disagree for a while. Examples: Cassandra and DynamoDB in their default modes.

When there is no partition, a system can offer both consistency and availability. CAP is a statement about behaviour during failure, not a permanent label.

A single-node database is not subject to CAP, because there is no partition to tolerate.""",
    realWorld="A shopping cart that must always accept additions leans AP and merges conflicting carts later. A leader election service must never have two leaders, so it leans CP and will pause rather than risk it.",
    commonMistakes=[
        "Saying you will pick any two of the three, as though partition tolerance were optional",
        "Treating CAP as a fixed property of a database rather than a choice during a partition",
        "Forgetting that 'availability' in CAP means every non-failing node must respond",
    ],
    bestPractices=[
        "Decide per feature how it should behave during a partition",
        "Prefer CP for money, inventory and locks",
        "Prefer AP for feeds, counters and caches, with a plan for resolving conflicts",
    ],
    interviewRelevance="Expect to classify a system as CP or AP and defend the choice with the user-visible consequence. Mentioning PACELC shows depth.")

lesson("core-concepts", "pacelc",
    summary="CAP extended to cover the trade-off that exists even without a partition.",
    concept="""PACELC extends CAP. It says: if there is a Partition (P), the system chooses between Availability and Consistency (A or C); Else (E), when running normally, it chooses between Latency and Consistency (L or C).

The second half is the key addition. Even with no failures, replication forces a choice. To guarantee that every replica has a write before you acknowledge it, you must wait for them, which adds latency. To respond quickly, you acknowledge early and let replicas catch up, which risks stale reads.

Systems are often described by both halves:
- PA/EL: prioritise availability during partitions and low latency otherwise. Cassandra and DynamoDB are commonly placed here.
- PC/EC: prioritise consistency in both cases. Traditional relational databases and Google Spanner are commonly placed here.

Many modern databases let you tune this per query, for example by choosing how many replicas must acknowledge a read or write.

These labels are simplifications. Real systems offer configurable behaviour, so treat the classification as a way to reason, not a fixed fact.""",
    realWorld="A globally distributed database can let you choose, per request, between a fast local read that may be slightly stale and a slower read that is guaranteed current.",
    commonMistakes=[
        "Applying a single PACELC label to a database that is actually configurable",
        "Forgetting the 'else' case, which governs behaviour almost all of the time",
    ],
    bestPractices=[
        "Use tunable consistency: strong for critical reads, relaxed for the rest",
        "Measure the real latency cost of stronger consistency before deciding",
    ],
    interviewRelevance="Bringing up PACELC after CAP signals you understand that consistency costs latency even when nothing is broken.")

lesson("core-concepts", "acid-base",
    summary="Two contrasting approaches to data guarantees: strict transactions versus flexible availability.",
    concept="""ACID describes the guarantees of a traditional database transaction:
- Atomicity: all of the operations in a transaction happen, or none do.
- Consistency: a transaction moves the database from one valid state to another, respecting its rules and constraints.
- Isolation: concurrent transactions do not interfere with each other.
- Durability: once committed, data survives crashes.

BASE describes the opposite design philosophy, common in large distributed stores:
- Basically Available: the system keeps responding, even with partial failures.
- Soft state: data may change over time as replicas converge.
- Eventually consistent: given time without new writes, all replicas agree.

ACID suits money, orders and inventory, where correctness is non-negotiable. BASE suits large-scale, high-availability workloads where brief inconsistency is acceptable.

It is not a strict either/or. Many systems use ACID databases for core records and BASE-style stores, caches and queues for scale-out features around them. Note that the C in ACID (valid state) is a different idea from the C in CAP (all nodes agree).""",
    realWorld="An order is written to a relational database inside a transaction. The product-view counter and the search index, by contrast, are updated asynchronously and may lag a little.",
    commonMistakes=[
        "Confusing the C in ACID with the C in CAP",
        "Choosing a BASE store for data that needs transactional guarantees",
        "Assuming a NoSQL database cannot offer transactions at all",
    ],
    bestPractices=[
        "Keep money and inventory in a transactional store",
        "Use eventual consistency where staleness is harmless",
        "Make operations idempotent so retries are safe in BASE systems",
    ],
    interviewRelevance="Be ready to explain each letter, to contrast the two approaches, and to say which parts of a design would use each.")

lesson("core-concepts", "sla-slo-sli",
    summary="How reliability targets are measured, promised and tracked.",
    concept="""Three related terms describe service quality:

- SLI (Service Level Indicator): a measurement. For example, the percentage of requests that succeed, or the p99 latency.
- SLO (Service Level Objective): the internal target for an SLI. For example, "99.9% of requests succeed over 30 days".
- SLA (Service Level Agreement): a contract with customers that states consequences, often refunds, if a target is missed. An SLA is usually looser than the SLO so that you have a safety margin.

The gap between perfect and the SLO is the error budget. A 99.9% SLO allows 0.1% of requests to fail, about 43 minutes over 30 days. While budget remains you can ship features. When it is spent, you slow down and invest in reliability.

Good SLIs measure what users experience, such as successful requests and latency at the edge, not internal signals such as CPU.

The point of an SLO is to make the reliability conversation concrete. It replaces "make it as reliable as possible" with a number everyone agrees on.""",
    realWorld="A team with a 99.9% monthly SLO that has used up its error budget on a bad release pauses new launches and works on stability until the budget recovers.",
    code_language="java",
    code_example="""// Error budget for an SLO over a period
static double errorBudgetMinutes(double slo, int days) {
    double totalMinutes = days * 24 * 60;
    return (1 - slo) * totalMinutes;
}

// errorBudgetMinutes(0.999, 30) -> about 43.2 minutes""",
    commonMistakes=[
        "Setting a target of 100%, which is both impossible and prevents any change",
        "Measuring internal metrics instead of user-facing ones",
        "Promising an SLA tighter than what the system can really deliver",
    ],
    bestPractices=[
        "Pick a few SLIs tied to user experience",
        "Set SLOs from what users need, not from what is easy to hit",
        "Use the error budget to decide between shipping and stabilising",
        "Alert on budget burn rate rather than on every blip",
    ],
    interviewRelevance="Being able to define the three terms and compute an error budget shows you think about reliability as an engineering target.")

# ───────────────────────── Load balancing ─────────────────────────

lesson("load-balancing", "lb-fundamentals",
    summary="Distributing incoming traffic across multiple servers.",
    concept="""A load balancer sits in front of a group of servers and spreads incoming requests across them. It gives you three things at once:

- Scalability: add servers to handle more traffic and the load balancer includes them.
- Availability: if a server fails, traffic goes to the others.
- A single entry point: clients use one address while the number of servers behind it changes freely.

Load balancers can be hardware appliances, software such as NGINX, HAProxy or Envoy, or managed cloud services. They can be placed at several points: between clients and web servers, between web servers and application servers, and between application servers and databases.

The load balancer itself must not become a single point of failure. In practice they are deployed in redundant pairs or as a managed, distributed service.

Related to this are sticky sessions, where one client is always sent to the same server. They are sometimes needed for stateful applications but undermine even distribution and failover, so stateless servers are preferred.""",
    realWorld="A website runs ten identical application servers behind a load balancer. During a traffic spike the team adds five more, and no client needs to change anything.",
    commonMistakes=[
        "Running a single load balancer and creating a new single point of failure",
        "Relying on sticky sessions instead of making servers stateless",
        "Forgetting to configure health checks, so traffic still reaches dead servers",
    ],
    bestPractices=[
        "Deploy load balancers redundantly",
        "Keep application servers stateless",
        "Terminate TLS at the load balancer where appropriate",
        "Enable health checks and connection draining",
    ],
    interviewRelevance="Load balancers appear in almost every design. Be prepared to say where you would place them and how you would keep them from being a bottleneck.")

lesson("load-balancing", "lb-algorithms",
    summary="The strategies a load balancer uses to pick a server.",
    concept="""A load balancing algorithm decides which server gets each request.

Static algorithms ignore the current state of the servers:
- Round robin: send requests to servers in turn. Simple, and fair when requests and servers are similar.
- Weighted round robin: servers with more capacity get proportionally more requests.
- IP hash: hash the client address so the same client tends to reach the same server.

Dynamic algorithms use live information:
- Least connections: send the request to the server with the fewest active connections. It suits requests of very different duration.
- Least response time: prefer the server that is answering fastest.
- Power of two choices: pick two servers at random and use the less loaded one. It is surprisingly effective and cheap.

Consistent hashing is used when requests must map to specific servers, for example cache nodes. It lets servers join or leave while moving only a small share of keys.

Choose by workload. Uniform short requests work well with round robin. Long-lived or uneven requests, such as file uploads or WebSockets, usually need least connections.""",
    realWorld="A video-processing service has jobs that take from one second to ten minutes. Round robin would pile long jobs on unlucky servers, so it uses least connections instead.",
    code_language="java",
    code_example="""import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

interface Server { int activeConnections(); }

class RoundRobin {
    private final List<Server> servers;
    private final AtomicInteger next = new AtomicInteger();

    RoundRobin(List<Server> servers) { this.servers = servers; }

    Server pick() {
        int i = Math.floorMod(next.getAndIncrement(), servers.size());
        return servers.get(i);
    }
}

class LeastConnections {
    private final List<Server> servers;

    LeastConnections(List<Server> servers) { this.servers = servers; }

    Server pick() {
        Server best = servers.get(0);
        for (Server s : servers) {
            if (s.activeConnections() < best.activeConnections()) best = s;
        }
        return best;
    }
}""",
    commonMistakes=[
        "Using round robin when request cost varies widely",
        "Using IP hash behind a proxy, so many clients share one address and one server gets everything",
        "Using plain modulo hashing for cache nodes, which reshuffles almost every key when a node changes",
    ],
    bestPractices=[
        "Match the algorithm to the request profile",
        "Use weights when servers are not identical",
        "Use consistent hashing for caches and sharded data",
    ],
    interviewRelevance="Name at least round robin, least connections and consistent hashing, and say when each fits.")

lesson("load-balancing", "layer4-vs-layer7",
    summary="Balancing at the transport layer versus the application layer.",
    concept="""Load balancers are often described by the network layer they work at.

Layer 4 (transport) load balancers look only at IP addresses and TCP or UDP ports. They forward connections without reading the content.
- Very fast and low overhead
- Protocol-agnostic: works for databases, game servers and anything over TCP or UDP
- Cannot route based on the request itself

Layer 7 (application) load balancers understand the protocol, usually HTTP. They can read paths, headers and cookies.
- Route by URL path or host: /api to one service, /images to another
- Terminate TLS, compress responses, cache and apply rate limits
- Integrate with web application firewalls
- More CPU per request, so slightly higher latency and cost

A common setup uses both: a Layer 4 balancer at the edge for raw speed and scale, forwarding to a pool of Layer 7 proxies that make smart routing decisions.

Examples: AWS Network Load Balancer is Layer 4, and AWS Application Load Balancer is Layer 7. NGINX, HAProxy and Envoy can operate in either mode.""",
    realWorld="A microservices platform uses a Layer 7 balancer to send /checkout traffic to the payment service and /search to the search service, behind one public hostname.",
    commonMistakes=[
        "Using Layer 7 where plain TCP forwarding would be faster and sufficient",
        "Expecting a Layer 4 balancer to route by URL or header",
        "Terminating TLS in several places without a clear reason",
    ],
    bestPractices=[
        "Use Layer 4 for non-HTTP protocols and for maximum throughput",
        "Use Layer 7 when you need content-based routing",
        "Combine them for large, multi-service systems",
    ],
    interviewRelevance="A common question is which one you would pick for a given system. Tie the answer to whether you need content-aware routing.")

lesson("load-balancing", "health-checks",
    summary="How a load balancer knows which servers can take traffic.",
    concept="""A health check lets the load balancer decide whether a server should receive traffic. Without it, requests keep flowing to servers that are down.

Two approaches:
- Active checks: the load balancer probes each server on a schedule, for example requesting /health every 5 seconds.
- Passive checks: the load balancer watches real traffic and marks a server unhealthy after repeated errors or timeouts.

Good practice is to combine them and to use thresholds. Require several consecutive failures before removing a server, and several successes before adding it back. This prevents flapping, where a server bounces in and out of service.

What the endpoint checks matters:
- A shallow check only confirms the process is running.
- A deep check also verifies dependencies such as the database. It catches more problems, but if the shared database is down, every server fails its check and the balancer removes all of them at once.

Kubernetes separates these ideas: a liveness probe decides whether to restart a container, and a readiness probe decides whether it should receive traffic.

When removing a server on purpose, drain it first: stop sending new requests and let in-flight requests finish.""",
    realWorld="During a deployment, each instance reports not ready until it has warmed its caches. The load balancer sends it traffic only once it passes the readiness check.",
    code_language="yaml",
    code_example="""# Kubernetes probes for a web service
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3
readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  periodSeconds: 5
  failureThreshold: 2""",
    commonMistakes=[
        "Making the health endpoint check a shared dependency so all servers fail together",
        "Using a threshold of one failure, which causes flapping",
        "Removing a server abruptly and dropping in-flight requests",
    ],
    bestPractices=[
        "Separate liveness from readiness",
        "Use failure and success thresholds",
        "Drain connections before taking a server out",
        "Keep the health endpoint cheap and fast",
    ],
    interviewRelevance="Mention health checks whenever you place a load balancer. It shows you have thought about failure, not just the happy path.")
