/**
 * Thumbnail generator for PDF files using PDF.js
 */

// Thumbnail dimensions
const THUMBNAIL_WIDTH = 200;
const THUMBNAIL_HEIGHT = 280; // Approximately 4:3 aspect ratio for PDF pages

/**
 * Generate a thumbnail from a PDF file
 * @param pdfData - The PDF file data as Uint8Array
 * @returns Base64 encoded PNG image data (without data: prefix)
 */
export async function generateThumbnail(pdfData: Uint8Array): Promise<string> {
  // Dynamic import to avoid SSR issues with pdfjs-dist
  const { pdfjs } = await import("react-pdf");

  // Set up PDF.js worker from CDN
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  // Load the PDF document
  const pdf = await pdfjs.getDocument({ data: pdfData }).promise;

  // Get the first page
  const page = await pdf.getPage(1);

  // Calculate scale to fit within thumbnail dimensions
  const viewport = page.getViewport({ scale: 1 });
  const scaleX = THUMBNAIL_WIDTH / viewport.width;
  const scaleY = THUMBNAIL_HEIGHT / viewport.height;
  const scale = Math.min(scaleX, scaleY);

  const scaledViewport = page.getViewport({ scale });

  // Create canvas for rendering
  const canvas = document.createElement("canvas");
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to get canvas context");
  }

  // Render the page
  await page.render({
    canvasContext: context,
    viewport: scaledViewport,
  }).promise;

  // Convert to base64 PNG
  const dataUrl = canvas.toDataURL("image/png");

  // Remove the "data:image/png;base64," prefix
  const base64Data = dataUrl.split(",")[1];

  // Cleanup
  pdf.destroy();

  return base64Data;
}

/**
 * Generate a thumbnail from a local PDF file path
 * @param filePath - Path to the PDF file
 * @returns Base64 encoded PNG image data (without data: prefix)
 */
export async function generateThumbnailFromPath(
  filePath: string,
): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");

  // Read the PDF file
  const data = await invoke<number[]>("read_pdf_file", { path: filePath });
  const pdfData = new Uint8Array(data);

  return generateThumbnail(pdfData);
}

/**
 * Item for thumbnail generation - either cloud (with driveFileId) or local (with itemId)
 */
export interface ThumbnailItem {
  localPath: string;
  driveFileId?: string;
  itemId?: number;
}

/**
 * Generate thumbnails for multiple items in the background using requestIdleCallback
 * @param items - Array of items with localPath and either driveFileId (cloud) or itemId (local)
 * @param onThumbnailGenerated - Callback when a thumbnail is generated
 */
export async function generateThumbnailsInBackground(
  items: ThumbnailItem[],
  onThumbnailGenerated: (
    item: ThumbnailItem,
    thumbnailData: string,
  ) => Promise<void>,
): Promise<void> {
  // Process one item at a time with idle callback to not block UI
  const processNext = (index: number): Promise<void> => {
    return new Promise((resolve) => {
      if (index >= items.length) {
        resolve();
        return;
      }

      const scheduleNext = () => {
        const item = items[index];
        generateThumbnailFromPath(item.localPath)
          .then((thumbnailData) => onThumbnailGenerated(item, thumbnailData))
          .catch((err) =>
            console.error(
              `Failed to generate thumbnail for ${item.localPath}:`,
              err,
            ),
          )
          .finally(() => {
            // Process next item after a small delay
            setTimeout(() => {
              processNext(index + 1).then(resolve);
            }, 100);
          });
      };

      // Use requestIdleCallback if available, otherwise use setTimeout
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(scheduleNext, { timeout: 5000 });
      } else {
        setTimeout(scheduleNext, 200);
      }
    });
  };

  await processNext(0);
}
