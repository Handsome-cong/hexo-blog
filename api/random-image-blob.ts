import type { VercelRequest, VercelResponse } from '@vercel/node';
import { TryGetImage } from './_random-image-getter';
import { EnricheHeader } from './_header-enricher';

export default async function handler(
    request: VercelRequest,
    response: VercelResponse,
) {
    EnricheHeader(request, response);
    const image = await TryGetImage();
    if (image != null) {
        const imageData = await image.GetJpegUint8Array();
        console.log(JSON.stringify(image));

        response.status(200)
            .setHeader('Content-Type', `image/jpeg`)
            .write(imageData);
        response.end();
    }
    else {
        response.status(500).send('Failed to get image');
        return;
    }

}