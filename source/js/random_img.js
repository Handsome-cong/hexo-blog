// const Url = "https://danbooru.donmai.us/posts.json?tags=score:50.. rating:g random:5 mpixels:2.5.. ratio:16:9.."
// fetch(Url)
//     .then(response => response.json())
//     .then(data => {
//         const file_url = data.map(item => item.file_url)[0]
//         document.getElementById("page-header").style.backgroundImage = `url(${file_url})`
//         document.getElementById("footer").style.backgroundImage = `url(${file_url})`
//     })
//     .catch(error => console.error(error))

const JsonApiUrl = "https://www.handsome-cong.fun/api/random-image"

const BlobProxyUrl = "https://www.handsome-cong.fun/api/image-blob-proxy"

let written = false;

fetch(JsonApiUrl)
    .then(response => response.json())
    .then(async data => {
        const imageUrl = data.url;
        const blobUrl = `${BlobProxyUrl}?url=${imageUrl}`;
        const lowQualityBlobUrl = `${BlobProxyUrl}?url=${imageUrl}&quality=10&blur=true`;

        // UseBlobApi(lowQualityBlobUrl, false, true);
        UseBlobApi(blobUrl, true, false);
    })
    .catch(error => {
        console.log(error);
        console.log("Failed to fetch image url from json api.")
        return null;
    });

/**
 * 
 * @param {Blob} imageBlob 
 * @param {*} override 
 * @returns 
 */
function TrySetElementStyle(imageBlob, override, blur) {
    if (!imageBlob) {
        return;
    }
    const blobSize = imageBlob.size;
    const imageUrl = URL.createObjectURL(imageBlob);
    const urlText = `url(${imageUrl})`;

    console.log(`received image size: ${blobSize}`);

    SetStyle("page-header");
    SetStyle("footer");

    function SetStyle(id) {
        element = document.getElementById(id);
        if (element) {
            if (!element.style.backgroundImage) {
                console.log(`set image with size: ${blobSize}`);
                element.style.backgroundImage = urlText;
                // element.style.filter = blur ? "blur(5px)" : "";
                written = true;
            }
            else if (written && override) {
                console.log(`set image with size: ${blobSize}`);
                element.style.backgroundImage = urlText;
                // element.style.filter = blur ? "blur(5px)" : "";
            }
        }
    }
}

function UseBlobApi(url, override, blur) {
    fetch(url)
        .then(r => r.blob())
        .then(imageBlob => {
            TrySetElementStyle(imageBlob, override, blur);
        })
        .catch(error => {
            console.log(error);
            console.log("Failed to fetch image blob from blob api.");
            return null;
        })
}