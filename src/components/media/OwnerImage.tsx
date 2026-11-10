import { useOwnerMediaUrl } from "@/hooks/useOwnerMediaUrl";

/** An uploaded image as its owner sees it in the editor: fetched with the Authorization header and shown through an object URL. */
export function OwnerImage({ assetId, variant = "original", alt, className }: {
  assetId: string; variant?: "original" | "thumb"; alt: string; className?: string;
}) {
  const media = useOwnerMediaUrl(assetId, variant);
  if (media.status === "ready") return <img src={media.url} alt={alt} className={className} />;
  return (
    <p className="text-xs text-muted-foreground" role={media.status === "error" ? "alert" : "status"}>
      {media.status === "error" ? "The image preview couldn't be loaded." : "Loading image..."}
    </p>
  );
}
