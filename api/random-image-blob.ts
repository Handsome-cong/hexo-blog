import type { VercelRequest, VercelResponse } from '@vercel/node';
import { TryGetImageBlob } from './_random-image-getter';

export default async function handler(
    request: VercelRequest,
    response: VercelResponse,
) {
    const imageBlob = await TryGetImageBlob();


    response.status(200)
        .setHeader('Content-Type', 'image/jpeg')
        .setHeader('Access-Control-Allow-Origin', '*')
        .send(imageBlob);
}