import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { apiPaths } from "@/lib/paths";
import type {
  Category,
  CollectionDetail,
  CollectionSummary,
  CreatorPage,
  Lesson,
  MeResponse,
  Paged,
  Problem,
  ProblemSummary,
  PublicCollectionDetail,
  PublicCollectionSummary,
  PublicCreator,
  PublicPageView,
  TrackDetail,
  TrackSummary,
} from "@/lib/types";

export const useTracks = () =>
  useQuery({ queryKey: ["tracks"], queryFn: () => api.get<TrackSummary[]>("/tracks") });

export const useTrack = (slug?: string) =>
  useQuery({ queryKey: ["track", slug], queryFn: () => api.get<TrackDetail>(`/tracks/${slug}`), enabled: !!slug });

export const useLesson = (trackSlug?: string, lessonSlug?: string) =>
  useQuery({
    queryKey: ["lesson", trackSlug, lessonSlug],
    queryFn: () => api.get<Lesson>(`/tracks/${trackSlug}/lessons/${lessonSlug}`),
    enabled: !!trackSlug && !!lessonSlug,
  });

export const useProblems = () =>
  useQuery({ queryKey: ["problems"], queryFn: () => api.get<ProblemSummary[]>("/problems") });

export const useProblem = (slug?: string) =>
  useQuery({ queryKey: ["problem", slug], queryFn: () => api.get<Problem>(`/problems/${slug}`), enabled: !!slug });

// ---------------------------------------------------------------------------
// Creator platform: reads (Steps 5-7). The write hooks are in useCreatorMutations.ts (Step 8).
// ---------------------------------------------------------------------------
/** A 4xx is an answer, not a glitch: retrying a 404 (or a 401/403) only delays the "not found" screen. */
const retryUnlessClientError = (failures: number, error: unknown) =>
  !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2;

// ---- public (no token needed; the server answers the same for everyone) ----
/** `keepPrevious`: keep showing the last page while the next search/filter/page loads (Discover), instead of a spinner. */
export const usePublicCollections = (params: { category?: string; q?: string; page?: number; size?: number } = {}, opts: { keepPrevious?: boolean } = {}) =>
  useQuery({
    queryKey: ["public", "collections", params],
    queryFn: () => api.get<Paged<PublicCollectionSummary>>(apiPaths.publicCollections(params)),
    retry: retryUnlessClientError,
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
  });

/** Step 15b: the public creator profile. 404 = PRIVATE, unknown or suspended (the same answer for all three). */
export const usePublicCreator = (username?: string) =>
  useQuery({
    queryKey: ["public", "creator", username],
    queryFn: () => api.get<PublicCreator>(apiPaths.publicCreator(username!)),
    enabled: !!username,
    retry: retryUnlessClientError,
  });

/** Step 15b: one creator's listed collections, 50 per page, loaded page by page ("Load more"). Only enabled once the profile is confirmed. */
export const CREATOR_COLLECTIONS_PAGE_SIZE = 50;
export const usePublicCreatorCollections = (username: string | undefined, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: ["public", "creator-collections", username],
    queryFn: ({ pageParam }) => api.get<Paged<PublicCollectionSummary>>(
      apiPaths.publicCollections({ creator: username!, page: pageParam, size: CREATOR_COLLECTIONS_PAGE_SIZE })),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.page + 1 < last.totalPages ? last.page + 1 : undefined),
    enabled: !!username && enabled,
    retry: retryUnlessClientError,
  });

export const usePublicCollection = (username?: string, slug?: string) =>
  useQuery({
    queryKey: ["public", "collection", username, slug],
    queryFn: () => api.get<PublicCollectionDetail>(apiPaths.publicCollection(username!, slug!)),
    enabled: !!username && !!slug,
    retry: retryUnlessClientError,
  });

/** Always module-qualified: page slugs are only unique within a module. */
export const usePublicPage = (username?: string, collectionSlug?: string, moduleSlug?: string, pageSlug?: string) =>
  useQuery({
    queryKey: ["public", "page", username, collectionSlug, moduleSlug, pageSlug],
    queryFn: () => api.get<PublicPageView>(apiPaths.publicPage(username!, collectionSlug!, moduleSlug!, pageSlug!)),
    enabled: !!username && !!collectionSlug && !!moduleSlug && !!pageSlug,
    retry: retryUnlessClientError,
  });

// ---- creator workspace (token required; the server checks ownership on every call) ----
export const useMyCollections = (deleted = false) =>
  useQuery({
    queryKey: ["mine", "collections", { deleted }],
    queryFn: () => api.get<CollectionSummary[]>(apiPaths.myCollections(deleted)),
    retry: retryUnlessClientError,
  });

export const useMyCollection = (id?: number) =>
  useQuery({
    queryKey: ["mine", "collection", id],
    queryFn: () => api.get<CollectionDetail>(apiPaths.collection(id!)),
    enabled: id !== undefined && Number.isFinite(id),
    retry: retryUnlessClientError,
  });

export const useMyPage = (id?: number) =>
  useQuery({
    queryKey: ["mine", "page", id],
    queryFn: () => api.get<CreatorPage>(apiPaths.page(id!)),
    enabled: id !== undefined && Number.isFinite(id),
    retry: retryUnlessClientError,
  });

/** Categories change rarely; the creator forms and Discover filters share one cached list. */
export const useCategories = () =>
  useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>(apiPaths.categories()),
    staleTime: 5 * 60_000,
    retry: retryUnlessClientError,
  });

// ---- own profile (authenticated; Step 15c) ----
/** Key of the signed-in user's `MeResponse` ({ user, profile }); `useUpdateProfile` updates its `profile` in place. */
export const MY_PROFILE_KEY = ["me", "profile"] as const;
export const useMyProfile = () =>
  useQuery({
    queryKey: MY_PROFILE_KEY,
    queryFn: () => api.get<MeResponse>(apiPaths.me()),
    retry: retryUnlessClientError,
  });
