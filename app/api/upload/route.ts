import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { OCRService } from '@/lib/ocrService';
import { ScheduleLayoutService } from '@/lib/scheduleLayout';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'tmp');
    try {
      await mkdir(uploadsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Save file temporarily
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filename = `${Date.now()}-${file.name}`;
    const filepath = join(uploadsDir, filename);

    await writeFile(filepath, buffer);

    // Run OCR and parsing
    const ocrService = new OCRService();
    const ocrBoxes = await ocrService.extractTextFromBuffer(buffer, file.type);

    if (ocrBoxes.length === 0) {
      return NextResponse.json(
        { error: 'Could not extract text from image. Please ensure the image is clear and contains a schedule.' },
        { status: 400 }
      );
    }

    const layoutService = new ScheduleLayoutService();
    const { classBlocks } = layoutService.buildLayout(ocrBoxes);

    if (classBlocks.length === 0) {
      return NextResponse.json(
        { error: 'Could not parse schedule from image. Please ensure the image shows a weekly schedule with days and times.' },
        { status: 400 }
      );
    }

    // Clean up file (optional - could keep for debugging)
    // await unlink(filepath);

    return NextResponse.json({ classBlocks });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process image' },
      { status: 500 }
    );
  }
}

