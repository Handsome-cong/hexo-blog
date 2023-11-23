import { VercelRequest, VercelResponse } from "@vercel/node";

export function EnricheHeader(request: VercelRequest, response: VercelResponse) {
    const reg = /^(?:https:\/\/)?(?:\w+\.)?handsome-cong\.fun\/?$/;
    let src = request.headers.origin ?? request.headers.host ?? ``;

    if (reg.test(src)) {
        if(!src.startsWith(`https://`)) {
            src = `https://${src}`;
        }
        response.setHeader('Access-Control-Allow-Origin', src);
    }
}