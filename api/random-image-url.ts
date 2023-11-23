import type { VercelRequest, VercelResponse } from '@vercel/node';
import { TryGetImageUrl } from './_random-image-getter';

export default async function handler(
    request: VercelRequest,
    response: VercelResponse,
) {
    let blob: Blob | null = null;
    const url = await TryGetImageUrl();
    // const fileExtension = url?.split('.').pop();
    if (url != null) {
        const blobResponse = await fetch(url);
        blob = await blobResponse.blob();


        response.status(200)
            .setHeader('Access-Control-Allow-Origin', '*')
            .json({ file_url: URL.createObjectURL(blob), });

    }
    else {
        response.status(500).send('Failed to get image');
        return;
    }

}