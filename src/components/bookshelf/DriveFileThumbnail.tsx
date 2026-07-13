"use client";

import { FileText } from "lucide-react";
import type { DriveItem } from "@/types";

interface DriveFileThumbnailProps {
  file: DriveItem;
  iconClassName: string;
}

/**
 * Thumbnail for a Google Drive file, falling back to a file icon
 * when there is no thumbnail or it fails to load
 */
export default function DriveFileThumbnail({
  file,
  iconClassName,
}: DriveFileThumbnailProps) {
  return (
    <>
      {file.thumbnailLink ? (
        // biome-ignore lint/performance/noImgElement: external Google Drive thumbnail URL
        <img
          src={file.thumbnailLink}
          alt={file.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback to icon if thumbnail fails to load
            e.currentTarget.style.display = "none";
            e.currentTarget.nextElementSibling?.classList.remove("hidden");
          }}
        />
      ) : null}
      <FileText
        className={`${iconClassName} text-text-tertiary ${file.thumbnailLink ? "hidden" : ""}`}
      />
    </>
  );
}
