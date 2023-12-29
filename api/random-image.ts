import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ImageSettings, RatingGroup, TryGetImage } from './_random-image-getter';
import { EnricheHeader } from './_header-enricher';

export default async function handler(
    request: VercelRequest,
    response: VercelResponse,
) {
    EnricheHeader(request, response);
    const settings = ImageSettings.FromRequest(request);
    const image = await TryGetImage(settings);
    console.log(JSON.stringify(image));

    response.status(200)
        .json(image);
}