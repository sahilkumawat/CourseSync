import { ImageAnnotatorClient } from '@google-cloud/vision';
import type { OcrTextBox } from './types';

export class OCRService {
  private client: ImageAnnotatorClient;

  constructor() {
    // For MVP, we'll use application default credentials or env var
    // In production, need to use a service account key file
    const config: any = {};
    if (process.env.GOOGLE_CLOUD_KEYFILE) {
      config.keyFilename = process.env.GOOGLE_CLOUD_KEYFILE;
    }
    if (process.env.GOOGLE_CLOUD_PROJECT_ID) {
      config.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    }
    this.client = new ImageAnnotatorClient(config);
  }

  async extractText(imagePath: string): Promise<OcrTextBox[]> {
    try {
      const [result] = await this.client.textDetection(imagePath);
      const detections = result.textAnnotations;

      if (!detections || detections.length === 0) {
        return [];
      }

      // Skip the first detection (it's the full text)
      const textBoxes: OcrTextBox[] = detections.slice(1).map((detection) => {
        const vertices = detection.boundingPoly?.vertices || [];
        const x = vertices[0]?.x || 0;
        const y = vertices[0]?.y || 0;
        const width = (vertices[2]?.x || vertices[1]?.x || 0) - x;
        const height = (vertices[3]?.y || vertices[2]?.y || 0) - y;

        return {
          text: detection.description || '',
          x,
          y,
          width: Math.max(width, 0),
          height: Math.max(height, 0),
        };
      });

      return textBoxes;
    } catch (error) {
      console.error('OCR Error:', error);
      throw new Error('Failed to extract text from image');
    }
  }

  async extractTextFromBuffer(imageBuffer: Buffer, mimeType: string): Promise<OcrTextBox[]> {
    try {
      const [result] = await this.client.textDetection({
        image: { content: imageBuffer },
      });
      const detections = result.textAnnotations;

      if (!detections || detections.length === 0) {
        return [];
      }

      const textBoxes: OcrTextBox[] = detections.slice(1).map((detection) => {
        const vertices = detection.boundingPoly?.vertices || [];
        const x = vertices[0]?.x || 0;
        const y = vertices[0]?.y || 0;
        const width = (vertices[2]?.x || vertices[1]?.x || 0) - x;
        const height = (vertices[3]?.y || vertices[2]?.y || 0) - y;

        return {
          text: detection.description || '',
          x,
          y,
          width: Math.max(width, 0),
          height: Math.max(height, 0),
        };
      });

      return textBoxes;
    } catch (error) {
      console.error('OCR Error:', error);
      throw new Error('Failed to extract text from image');
    }
  }
}

