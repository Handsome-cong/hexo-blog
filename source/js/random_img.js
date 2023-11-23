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

const blobApiPromise = fetch(BlobApiUrl)
    .then(r => r.blob())
    .catch(error => {
        console.error(error);
        console.error("Failed to fetch image blob.");
        return null;
    })

fetch(JsonApiUrl)
    .then(response => response.json())
    .then(async data => {
        const file_url = data.url;
        let imageBlob = await fetch(file_url)
            .then(r => r.blob())
            .catch(error => {
                console.log(error);
                console.log("Trying blob api...");
                return blobApiPromise;
            });

        if (imageBlob == null) {
            return;
        }
        let imageUrl = URL.createObjectURL(imageBlob);
        document.getElementById("page-header").style.backgroundImage = `url(${imageUrl})`
        document.getElementById("footer").style.backgroundImage = `url(${imageUrl})`
    })
    .catch(error => console.error(error));