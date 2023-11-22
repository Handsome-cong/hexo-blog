import type { VercelRequest, VercelResponse } from '@vercel/node';
import { TryGetImageUrl } from './_random-image-getter';

export default async function handler(
    request: VercelRequest,
    response: VercelResponse,
) {
    let blob: Blob | null = null;
    const url = await TryGetImageUrl();
    const fileExtension = url?.split('.').pop();
    if (url != null) {
        const response = await fetch(url);
        blob = await response.blob();
    }
    const blobBuffer = await blob?.arrayBuffer();

    response.status(200)
        .setHeader('Content-Type', `image/${fileExtension}`)
        .setHeader('Access-Control-Allow-Origin', '*')
        .write(blobBuffer);
    response.end();

}