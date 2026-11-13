# Frontend Product Direction & Legacy UI Migration

**Purpose:** Reference this document when planning frontend changes and
migrating the original learning-platform UI toward the creator-driven
publishing platform.

**Status:** Direction agreed; migration is planned, not yet implemented.

------------------------------------------------------------------------

## 1. Product direction

The project is evolving from a coding-learning platform into a
**creator-driven publishing platform**.

Creators should be able to publish different kinds of content using the
same collection, module, page, block-editor, and renderer architecture,
including:

-   Programming tutorials
-   System design guides
-   Travel guides
-   Recipes
-   Personal experiences and stories
-   Other educational or creative content

The platform should not remain a learning platform with a creator editor
added to it. It should be a publishing platform where learning content
is one supported content category.

## 2. Target application experiences

The frontend should be organized around three experiences.

### A. Public platform

-   **Home:** Introduce the platform and its value.
-   **Discover:** Explore published collections, with category filters
    and search.
-   **Creator profiles:** Public creator pages and their published
    content.
-   **Collection viewer:** Display a collection, its modules, and its
    pages.
-   **Page viewer:** Render published content using the universal page
    renderer.

### B. Creator workspace

-   Creator dashboard
-   My collections
-   Create collection
-   Page editor
-   Draft and publishing management
-   Profile settings

The dashboard should focus on creator activity and content management,
rather than learning progress or DSA problem statistics.

### C. Admin governance

-   Admin dashboard
-   User management
-   Category management
-   Reports and moderation

Admin functionality is for platform governance; it should not turn the
platform into an admin-owned content system.

------------------------------------------------------------------------

## 3. Audit of the existing frontend navigation

The reviewed frontend navigation in `src/components/Navbar.tsx`
contained the following entries. Decisions below describe the intended
product direction, not authorization to delete code immediately.

  -----------------------------------------------------------------------
  Existing item           Current experience      Direction
  ----------------------- ----------------------- -----------------------
  Discover (`/discover`)  Public discovery        Keep and complete as
                                                  the public
                                                  content-discovery
                                                  experience.

  Tracks (`/tracks`)      Old learning tracks and Migrate to collections
                          paths                   using the new
                                                  collection API.

  Practice (`/practice`)  DSA problems grouped by Retire as a standalone
                          track and difficulty    feature; practice/DSA
                                                  is outside the current
                                                  product scope.

  System Design           Hardcoded HLD/LLD and   Convert useful material
  (`/system-design`)      design-framework        into ordinary published
                          material                collections and pages.
                                                  Do not keep a separate
                                                  system-design product
                                                  area.

  Dashboard               Learning-track and      Redesign as a creator
  (`/dashboard`)          problem statistics      dashboard for
                                                  collections, drafts,
                                                  published content, and
                                                  creation shortcuts.

  Blog (`/blog`)          Hardcoded sample        Retire the separate
                          articles, including     blog mock. Articles
                          placeholder links       should be created with
                                                  the normal
                                                  collection/page editor.

  Write (`/create`)       Creator workspace and   Keep and continue
                          collection editor       improving.
  -----------------------------------------------------------------------

### Important migration principle

Do not delete the old pages and components immediately. First inventory
their routes, API calls, dependencies, content, and tests. Migrate or
preserve useful content, then remove obsolete code once it is no longer
referenced.

------------------------------------------------------------------------

## 4. What happens to existing learning content?

Useful learning material should become normal platform content rather
than remain locked inside bespoke frontend pages.

For example, the current System Design experience could become a
published collection:

**Collection:** System Design Fundamentals

**Possible modules:** - High-Level Design (HLD) - Low-Level Design
(LLD) - Architecture Fundamentals

**Possible pages:** - Load Balancing - Caching - Database Sharding - API
Gateway - Service Discovery

These pages should use the existing universal editor and renderer. The
same content model should also support a travel guide, recipe, tutorial,
or personal experience.

This is a content migration and presentation change, not a reason to
build a separate editor for each content category.

------------------------------------------------------------------------

## 5. Relationship to the existing roadmap

The existing roadmap already includes the main transition. Keep the
numbered roadmap sequence; do not create a duplicate migration project.

### Step 14 --- Public pages

-   Build `/discover` with category filters and search.
-   Build the collection viewer with a module sidebar.
-   Build the page viewer with previous/next navigation.
-   Add a share action to copy the page link.

### Step 15 --- Creator profiles

-   Public `/@username` profile page.
-   Avatar, bio, and social links.
-   Published collections grouped by category.
-   Profile settings form.

### Step 16 --- Migrate the learning UI

The existing roadmap calls for: - Replacing old `/tracks` and
`/track/:id` API usage. - Updating the landing page for the broader
creator platform. - Removing old public API endpoints once nothing uses
them.

**Planning clarification recommended:** Explicitly include the legacy
Practice, System Design, Blog, and learning Dashboard experiences in the
Step 16 inventory and migration/removal plan:

-   Tracks → collections.
-   Track detail/topic pages → collection and page viewers.
-   Practice → retire as a standalone feature.
-   System Design → migrate useful material into collections/pages.
-   Learning Dashboard → creator dashboard.
-   Blog mock → retire; use the normal editor for articles.
-   Landing page → reposition for the creator publishing platform.

This clarification should be incorporated when Step 16 is planned. It
does not mean Step 16 should be implemented early.

### Step 19 --- Cleanup

The existing roadmap also calls for: - Removing the legacy `published`
column. - Converting legacy lesson fields to blocks before dropping
them. - Renaming Java entities to Collection/Module/Page. - Removing
unused `TopicDiscussion` and `AiTutor` mocks if still present. -
Updating documentation.

Do not remove `TopicDiscussion`, `AiTutor`, APIs, or other code until
usage and dependencies have been checked.

------------------------------------------------------------------------

## 6. Out-of-scope items and removal guidance

The following are not part of the current product direction as
standalone features:

-   DSA/practice problem platform
-   Learning-progress dashboard
-   Separate System Design application
-   Separate Blog application

The roadmap has also treated progress, submissions, and comments as not
needed for the MVP.

**Removal rule:** Retire obsolete experiences only as part of the
planned migration/cleanup, after confirming that routes, navigation, API
clients, tests, seeded content, and other components no longer depend on
them.

------------------------------------------------------------------------

## 7. Recommended implementation sequence

1.  Continue with Step 13 planning and implementation according to the
    roadmap.
2.  Complete public publishing in Step 14.
3.  Complete creator profiles in Step 15.
4.  During Step 16 planning, inventory every legacy learning route,
    component, API call, test, and useful content source.
5.  Migrate useful content and replace old experiences with the new
    collection/page model.
6.  Remove obsolete UI and old endpoints only after confirming there are
    no remaining consumers.
7.  Complete the planned Step 19 cleanup.

Do not start Step 16 work while implementing Step 13 unless the roadmap
is explicitly revised and approved.

------------------------------------------------------------------------

## 8. Guardrails for future Claude tasks and code reviews

When working on this transition:

-   Preserve the collection → module → page → block content model.
-   Reuse the universal editor and renderer; avoid category-specific
    editors.
-   Keep public platform, creator workspace, and admin governance
    responsibilities distinct.
-   Do not reintroduce learning-only assumptions into the creator
    dashboard or navigation.
-   Do not delete legacy code before dependency and content inventory.
-   Do not change unrelated backend APIs or migrations as part of a
    frontend cleanup.
-   Follow the one-roadmap-step-at-a-time workflow.
-   Ask for a proposal and review before authorizing implementation of a
    future step.
-   Do not advance to the next step without explicit approval.

------------------------------------------------------------------------

## 9. Current decision summary

  -----------------------------------------------------------------------
  Area                                Decision
  ----------------------------------- -----------------------------------
  Overall product                     Creator-driven publishing platform

  Learning content                    Supported as ordinary published
                                      collections/pages

  Tracks                              Migrate to collections

  Practice                            Retire as a standalone feature

  System Design                       Convert useful material into
                                      collections/pages

  Dashboard                           Redesign for creators

  Blog                                Retire standalone mock; use normal
                                      editor

  Discover                            Keep and complete

  Write/editor                        Keep and improve

  Admin                               Keep for governance

  Migration timing                    Step 16, following Steps 14 and 15

  Immediate action                    Continue the approved roadmap
                                      sequence; do not perform early
                                      deletion
  -----------------------------------------------------------------------

**Core principle:** Build one publishing platform with a universal
content model. Tutorials, system-design guides, travel guides, recipes,
and stories are different kinds of content---not separate applications.
