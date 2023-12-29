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
const BlobApiUrl = "https://www.handsome-cong.fun/api/random-image-blob"

let currentBlob = null;

fetch(BlobApiUrl)
    .then(r => r.blob())
    .then(imageBlob => {
        console.log("Try set image from blob api.");
        TrySetElementStyle(imageBlob);
    })
    .catch(error => {
        console.log(error);
        console.log("Failed to fetch image blob from blob api.");
        return null;
    })

fetch(JsonApiUrl)
    .then(response => response.json())
    .then(async data => {
        const file_url = data.url;
        let imageBlob = await fetch(file_url)
            .then(r => r.blob())
            .then(imageBlob => {
                console.log("Try set image from json api.");
                TrySetElementStyle(imageBlob);
            })
            .catch(error => {
                console.log(error);
                console.log("Failed to fetch image blob by url from json api.");
                return null;
            });
        return imageBlob;
    })
    .catch(error => {
        console.log(error);
        console.log("Failed to fetch image url from json api.")
        return null;
    });


function TrySetElementStyle(imageBlob) {
    if (imageBlob == null || currentBlob != null) {
        return;
    }
    currentBlob = imageBlob;
    console.log("Image loaded.");
    const imageUrl = URL.createObjectURL(currentBlob);
    const urlText = `url(${imageUrl})`;

    let element = document.getElementById("page-header");
    if (element != null) {
        element.style.backgroundImage = urlText;
    }

    element = document.getElementById("footer");
    if (element != null) {
        element.style.backgroundImage = urlText;
    }
}