import { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
    request: VercelRequest,
    response: VercelResponse,
) {
    response.status(200)
    .json(request);
}