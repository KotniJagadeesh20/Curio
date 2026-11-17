/** Query keys of public, anonymous data (`/api/public/**`): not tied to the signed-in user, so a logout keeps them. */
export const isPublicQueryKey = (key: readonly unknown[]) => key[0] === "public" || key[0] === "categories";
