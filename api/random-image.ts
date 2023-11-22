import type { VercelRequest, VercelResponse } from '@vercel/node';
import { run } from 'node:test';

async function GetUrlFromDanbooru(): Promise<string | null> {
    const Url = "https://danbooru.donmai.us/posts.json?tags=score:50.. rating:g random:5 mpixels:2.5.. ratio:16:9..";
    const fileUrl = await fetch(Url)
        .then(response => response.json())
        .then(data => data[0].fileUrl)
        .catch(error => { console.error(error); return null; });

    return fileUrl;
}

async function GetUrlFromKonachan(): Promise<string | null> {
    const Url = encodeURI('https://konachan.com/post.json?limit=1&tags=rating:safe score:100.. order:random');

    // 发送新请求并获取响应
    const jpegUrl = await fetch(Url)
        .then(response => response.json())
        .then(data => data[0].jpeg_url)
        .catch(error => { console.error(error); return null; });

    const jpegResponse = await fetch(jpegUrl);
    const jpegBlob = await jpegResponse.blob();

    var response = new Response(jpegBlob, {
        headers: {
            'Content-Type': 'image/jpeg',
            'Access-Control-Allow-Origin': '*'
        }
    });

    return jpegUrl;
}

async function TryGetImageUrl(): Promise<string | null> {
    let url = await GetUrlFromDanbooru();
    // if (url == null) {
    //     url = await GetUrlFromKonachan();
    // }
    return url;
}

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