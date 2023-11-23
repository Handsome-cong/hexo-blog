import type { VercelRequest, VercelResponse } from '@vercel/node';
import { TryGetImage } from './_random-image-getter';

export default async function handler(
    request: VercelRequest,
    response: VercelResponse,
) {
    const image = await TryGetImage();
    if (image != null) {
        const imageData = await image.GetJpegUint8Array();

        response.status(200)
            .setHeader('Content-Type', `image/jpeg`)
            .setHeader('Access-Control-Allow-Origin', '*')
            .write(imageData);
        response.end();
    }
    else {
        response.status(500).send('Failed to get image');
        return;
    }

}