
/**
 * Eldady Image Processing Utility
 * Handles client-side watermarking and optimization
 */

/**
 * Applies a branded watermark to an image file.
 * @param file The original image file from an input field
 * @param watermarkText The text to overlay (default: "Eldady")
 * @returns A promise that resolves to a watermarked JPEG Blob
 */
export const applyWatermark = (file: File, watermarkText: string = "Eldady"): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      // Create canvas at native image resolution
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error("Failed to get canvas context"));
      }

      // 1. Draw original image
      ctx.drawImage(img, 0, 0);

      // 2. Configure Watermark Style
      // Calculate dynamic font size based on height (5%)
      const fontSize = Math.max(24, Math.floor(img.height * 0.05));
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      
      // Use Eldady System Color (#E86C44) with 40% opacity
      ctx.fillStyle = "rgba(232, 108, 68, 0.4)";
      ctx.textBaseline = "bottom";
      ctx.textAlign = "right";

      // 3. Draw Watermark with 20px padding
      const padding = 20;
      const x = canvas.width - padding;
      const y = canvas.height - padding;
      
      ctx.fillText(watermarkText, x, y);

      // 4. Export as high-quality JPEG
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        },
        'image/jpeg',
        0.9 // 90% quality for optimization
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for watermarking"));
    };

    img.src = url;
  });
};
