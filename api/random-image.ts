import type { VercelRequest, VercelResponse } from '@vercel/node';
import { TryGetImageUrl } from './_random-image-getter';

export default async function handler(
    request: VercelRequest,
    response: VercelResponse,
) {
    const imageUrl = await TryGetImageUrl();
    console.log(`imageUrl: ${imageUrl}`);

    response.status(200).json({
        body: request.body,
        query: request.query,
        cookies: request.cookies,
        file_url: imageUrl,
    });
}