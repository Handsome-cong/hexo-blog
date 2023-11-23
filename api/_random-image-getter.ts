import sharp from 'sharp';

async function GetImageFromDanbooru(): Promise<RemoteImage | null> {
    const Url = "https://danbooru.donmai.us/posts.json?tags=score:50.. rating:g random:1 mpixels:2.5.. ratio:16:9..";
    const image = await fetch(Url)
        .then(response => response.json())
        .then(data => new RemoteImage(data[0].file_url, data[0].file_ext, data[0].file_size))
        .catch(error => { console.error(error); return null; });

    return image;
}

async function GetImageFromKonachan(): Promise<RemoteImage | null> {
    const Url = 'https://konachan.com/post.json?limit=1&tags=rating:safe score:100.. order:random';
    const image = await fetch(Url)
        .then(response => response.json())
        .then(data => new RemoteImage(data[0].jpeg_url, 'jpg', data[0].jpeg_file_size > 0 ? data[0].jpeg_file_size : data[0].file_size))
        .catch(error => { console.error(error); return null; });

    return image;
}

export async function TryGetImage(): Promise<RemoteImage | null> {
    let image = await GetImageFromDanbooru();
    if (image == null) {
        image = await GetImageFromKonachan();
    }
    return image;
}

class RemoteImage {
    public jpegSize: number = 0;
    public jpegSizeCompressed: number = 0;
    public quality: number = 100;
    public compressedRatio: number = 1;
    private readonly threshold: number = 4194304;

    constructor(
        public readonly url: string,
        public readonly fileExtension: string,
        public readonly fileSize: number,
    ) { }

    public async GetBlob(): Promise<Blob> {
        const blobResponse = await fetch(this.url);
        const blob = await blobResponse.blob();
        return blob;
    }

    public async GetJpegUint8Array(): Promise<Uint8Array> {

        const blob = await this.GetBlob();
        const rawArrayBuffer = await blob.arrayBuffer();
        let jpegUint8Array = new Uint8Array(rawArrayBuffer);
        if (this.fileExtension != 'jpg' && this.fileExtension != 'jpeg') {
            let newImageBuffer = await sharp(jpegUint8Array).jpeg().toBuffer();
            jpegUint8Array = new Uint8Array(newImageBuffer);
            this.quality = 80;
        }
        this.jpegSize = jpegUint8Array.length;
        if (jpegUint8Array.length > this.threshold) {
            console.log(`Image size: ${this.fileSize} bytes, Jpeg size: ${jpegUint8Array.length}, threshold: ${this.threshold} bytes`);
            let quality = this.threshold / jpegUint8Array.length * 100;
            quality = Math.min(quality, 100);
            quality = Math.max(quality, 1);
            quality = Math.floor(quality);
            console.log(`Compression ratio: ${quality}`);
            const compressedImageBuffer = await sharp(this.url).jpeg({ quality: quality }).toBuffer();
            jpegUint8Array = new Uint8Array(compressedImageBuffer);
        }
        this.jpegSizeCompressed = jpegUint8Array.length;
        this.compressedRatio = this.jpegSizeCompressed / this.jpegSize;
        return jpegUint8Array;
    }
}