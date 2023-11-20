const Url = "https://danbooru.donmai.us/posts.json?tags=score:50.. rating:g random:5 mpixels:2.5.. ratio:16:9.."
fetch(Url)
    .then(response => response.json())
    .then(data => {
        const file_url = data.map(item => item.file_url)[0]
        document.getElementById("page-header").style.backgroundImage = `url(${file_url})`
        document.getElementById("footer").style.backgroundImage = `url(${file_url})`
    })
    .catch(error => console.error(error))