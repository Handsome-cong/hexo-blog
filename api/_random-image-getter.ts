import { VercelRequest } from '@vercel/node';
import sharp from 'sharp';

export enum ImageRating {
    General = "g",
    Safe = "s",
    Questionable = "q",
    Explicit = "e",
}

type DanbooruRating = ImageRating;

enum KonachanRating {
    Safe = "s",
    Questionable = "q",
    Explicit = "e",
}

export class RatingGroup {
    public constructor(
        public readonly imageRating: ImageRating[] = [ImageRating.General],
    ) { }

    public ToDanbooruRatingStr(): string {
        let result = this.imageRating.join(",");
        if (this.imageRating.length == 0)
            result = ImageRating.General;
        return result;
    }

    public ToKonachanRatingStr(): string {
        let ratings: string[] = [];
        let addedSafe = false;
        this.imageRating.forEach(rating => {
            if (rating == ImageRating.General || rating == ImageRating.Safe) {
                if (!addedSafe)
                    ratings.push(ImageRating.Safe);
                addedSafe = true;
            }
            else {
                ratings.push(rating);
            }
        });
        let result = ratings.join(",");
        if (this.imageRating.length == 0)
            result = KonachanRating.Safe;
        return result;
    }

    public static FromRequest(request: VercelRequest): RatingGroup {

        const ratingStr = request.query?.rating as string | undefined;

        const ratings = ratingStr?.split(',');
        const ratingGroup = ratings != undefined ? new RatingGroup(ratings.map(rating => rating as ImageRating)) : new RatingGroup();
        return ratingGroup;
    }
}

async function GetImageFromDanbooru(rating: RatingGroup = new RatingGroup()): Promise<RemoteImage | null> {
    const Url = `https://danbooru.donmai.us/posts.json?tags=score:50.. rating:${rating.ToDanbooruRatingStr()} random:1 mpixels:2.5.. ratio:16:9..`;
    const image = await fetch(Url)
        .then(response => response.json())
        .then(data => new RemoteImage(data[0].file_url, data[0].file_ext, data[0].file_size))
        .catch(error => { console.error(error); return null; });

    return image;
}

async function GetImageFromKonachan(rating: RatingGroup = new RatingGroup()): Promise<RemoteImage | null> {
    const Url = `https://konachan.com/post.json?limit=1&tags=rating:${rating.ToKonachanRatingStr} score:100.. order:random`;
    const image = await fetch(Url)
        .then(response => response.json())
        .then(data => new RemoteImage(data[0].jpeg_url, 'jpg', data[0].jpeg_file_size > 0 ? data[0].jpeg_file_size : data[0].file_size))
        .catch(error => { console.error(error); return null; });

    return image;
}

export async function TryGetImage(rating: RatingGroup = new RatingGroup()): Promise<RemoteImage | null> {
    let image = await GetImageFromDanbooru(rating);
    if (image == null) {
        image = await GetImageFromKonachan(rating);
    }
    if (image?.fileExtension != "jpg" && image?.fileExtension != "jpeg" && image?.fileExtension != "png") {
        image = await TryGetImage(rating);
    }
    if (image?.url == undefined) {
        image = await TryGetImage(rating);
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
            if (this.fileExtension != 'png') {
                console.log(`May be unsupported file extension: ${this.fileExtension}`);
                console.log(JSON.stringify(this));
            }
            let newImageBuffer = await sharp(jpegUint8Array).jpeg().toBuffer();
            jpegUint8Array = new Uint8Array(newImageBuffer);
            this.quality = 80;
        }
        this.jpegSize = jpegUint8Array.length;
        if (jpegUint8Array.length > this.threshold) {
            console.log(`Image size: ${this.fileSize} bytes, Jpeg size: ${jpegUint8Array.length}, threshold: ${this.threshold} bytes`);
            let quality = this.threshold / jpegUint8Array.length;
            quality = Math.sqrt(quality) * 100;
            quality = Math.min(quality, 100);
            quality = Math.max(quality, 1);
            quality = Math.floor(quality);
            console.log(`Compression ratio: ${quality}`);
            const compressedImageBuffer = await sharp(jpegUint8Array).jpeg({ quality: quality }).toBuffer();
            jpegUint8Array = new Uint8Array(compressedImageBuffer);
            this.quality = quality;
        }
        this.jpegSizeCompressed = jpegUint8Array.length;
        this.compressedRatio = this.jpegSizeCompressed / this.jpegSize;
        return jpegUint8Array;
    }
}