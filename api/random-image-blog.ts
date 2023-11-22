import type { VercelRequest, VercelResponse } from '@vercel/node';
import { TryGetImageBlog } from './_random-image-getter';

export default async function handler(
    request: VercelRequest,
    response: VercelResponse,
) {
    const imageBlob = await TryGetImageBlog();


    response.status(200).send(imageBlob);
}