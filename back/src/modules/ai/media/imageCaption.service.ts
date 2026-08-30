import fs from 'fs';
import { callLLM } from '../clients/llm.client';
import type { ContentPart } from '../clients/llm.client';
import { z } from 'zod';

export const ImageCategorySchema = z.enum([
  'PRODUCT_PHOTO',
  'PAYMENT_PROOF',
  'DAMAGE_COMPLAINT',
  'OTHER',
]);
export type ImageCategory = z.infer<typeof ImageCategorySchema>;

export interface ImageCaptionResult {
  productName: string | null;
  description: string;
  category: ImageCategory;
}

const IMAGE_CAPTION_SCHEMA = {
  type: 'object' as const,
  properties: {
    productName: {
      type: ['string', 'null'] as unknown[],
      description: 'Exact product name if visible in the image (text on packaging, label, screen). null if no product name is visible.',
    },
    description: {
      type: 'string' as const,
      description: 'Detailed description of what the image shows — enough detail to search a product catalog (item type, brand, model, color, visible features).',
    },
    category: {
      type: 'string' as const,
      enum: ['PRODUCT_PHOTO', 'PAYMENT_PROOF', 'DAMAGE_COMPLAINT', 'OTHER'],
    },
  },
  required: ['description', 'category'] as const,
};

function buildImageCaptionPrompt(): string {
  return [
    'You are an image analysis assistant for an Algerian e-commerce WhatsApp bot.',
    '',
    'Analyze the attached image from a customer message.',
    '',
    '1. EXTRACT the product name if visible (text on packaging, label, screen — whatever the image shows).',
    '   Set "productName" to the exact text you see, or null if no product name is visible.',
    '',
    '2. DESCRIBE what the image shows in enough detail to search a product catalog.',
    '   Include: item type, brand, model, color, visible features.',
    '   This goes in the "description" field.',
    '',
    '3. CLASSIFY the image into one of:',
    '   - PRODUCT_PHOTO: customer is showing or searching for a product',
    '   - PAYMENT_PROOF: payment screenshot or receipt',
    '   - DAMAGE_COMPLAINT: damaged or wrong item photo',
    '   - OTHER: doesn\'t fit the above categories',
    '',
    'Return valid JSON with "productName" (string or null), "description" (string), and "category" (one of the four values above).',
  ].join('\n');
}

export async function captionImage(filePath: string, mimeType: string): Promise<ImageCaptionResult> {
  const buffer = fs.readFileSync(filePath);

  const parts: ContentPart[] = [
    {
      type: 'image',
      data: buffer,
      mimeType,
    },
    {
      type: 'text',
      text: buildImageCaptionPrompt(),
    },
  ];

  const raw = await callLLM({
    systemPrompt: buildImageCaptionPrompt(),
    userMessage: parts,
    responseSchema: IMAGE_CAPTION_SCHEMA,
    context: { purpose: 'caption' },
  });

  const parsed = JSON.parse(raw);

  const category = ImageCategorySchema.safeParse(parsed.category);
  if (!category.success) {
    throw new Error(`Invalid image category: ${parsed.category}`);
  }

  return {
    productName: parsed.productName ?? null,
    description: parsed.description ?? '',
    category: category.data,
  };
}
