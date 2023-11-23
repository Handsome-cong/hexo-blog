import type { VercelRequest, VercelResponse } from '@vercel/node';
import { TryGetImage } from './_random-image-getter';

export default async function handler(
    request: VercelRequest,
    response: VercelResponse,
) {
    const image = await TryGetImage();
    console.log(JSON.stringify(image));

    response.status(200)
        .setHeader('Access-Control-Allow-Origin', '*')
        .json(image);
}