-- System Design case studies are problems in the system-design track, grouped by category.
-- Concepts are comma-separated and shown as chips.

UPDATE problems SET category = 'High Level Design', difficulty = 'medium',
    concept = 'Hashing, Database, Caching, Load Balancing',
    description = 'Design a URL shortening service like bit.ly.'
WHERE slug = 'url-shortener';

UPDATE problems SET category = 'High Level Design', difficulty = 'hard',
    concept = 'WebSockets, Message Queue, Database Sharding, Presence',
    description = 'Design a real-time messaging system like WhatsApp.'
WHERE slug = 'chat-system';

UPDATE problems SET category = 'High Level Design', difficulty = 'medium',
    concept = 'Token Bucket, Sliding Window, Distributed Cache, Redis',
    description = 'Design an API rate limiting system.'
WHERE slug = 'rate-limiter';

UPDATE problems SET category = 'High Level Design', difficulty = 'hard',
    concept = 'Fan-out, Timeline, Caching, Graph Database',
    description = 'Design a social media news feed like Twitter/X.'
WHERE slug = 'news-feed';

UPDATE problems SET category = 'High Level Design', difficulty = 'hard',
    concept = 'Consistent Hashing, Eviction, Replication, Partitioning'
WHERE slug = 'distributed-cache';

INSERT INTO problems (slug, track_id, title, difficulty, category, concept, description, language)
SELECT 'parking-lot', id, 'Design Parking Lot System', 'medium', 'Low Level Design',
       'Classes, Inheritance, State Pattern, Strategy Pattern', 'Design a parking lot management system.', 'java'
FROM tracks WHERE slug = 'system-design';

INSERT INTO problems (slug, track_id, title, difficulty, category, concept, description, language)
SELECT 'elevator-system', id, 'Design Elevator System', 'medium', 'Low Level Design',
       'State Machine, Observer Pattern, Command Pattern, Queue', 'Design an elevator scheduling system.', 'java'
FROM tracks WHERE slug = 'system-design';

INSERT INTO problems (slug, track_id, title, difficulty, category, concept, description, language)
SELECT 'library-management', id, 'Design Library Management System', 'easy', 'Low Level Design',
       'CRUD, Relationships, Encapsulation, Factory Pattern', 'Design a library management system.', 'java'
FROM tracks WHERE slug = 'system-design';

INSERT INTO problems (slug, track_id, title, difficulty, category, concept, description, language)
SELECT 'snake-game', id, 'Design Snake Game', 'medium', 'Low Level Design',
       'Game Loop, Collision Detection, State Management, MVC', 'Design the classic snake game.', 'java'
FROM tracks WHERE slug = 'system-design';
